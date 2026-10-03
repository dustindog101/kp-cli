import { rm, stat } from "node:fs/promises";
import { paths, PHARMACY_URL } from "./config.js";
import { savePrivate, readPrivate } from "./store.js";
import { launchBrowser } from "./browser.js";
import { completeLogin } from "./login-flow.js";
import {
  loadCredentials,
  saveCredentials,
  forgetCredentials,
  validateCredentials,
} from "./credentials.js";
import { KpError } from "./errors.js";

const API_PREFIX =
  "https://apims.kaiserpermanente.org/kp/mycare/pharmacy-microservices/";
const READ_ROUTES = new Set([
  "orderStatus",
  "rxDetails",
  "orderDetails",
  "rxnotificationpreferences",
  "cart",
  "rxTransferDetails",
]);
/** @param {string} profile @param {{timeout?:number, fresh?:boolean, headed?:boolean, credentials?:import("./credentials.js").Credentials}} [options] */
export async function login(profile, options = {}) {
  const p = paths(profile);
  const existing = options.fresh ? null : await readPrivate(p.session);
  const headed = options.headed ?? true;
  const browser = await launchBrowser(headed);
  const api = await readPrivate(p.directory + "/api.json");
  const context = await browser.newContext({
    storageState: existing || undefined,
    userAgent: existing ? api?.headers?.orderStatus?.["user-agent"] : undefined,
  });
  /** @type {Record<string,Record<string,string>>} */
  const headers = {};
  /** @type {Promise<void>[]} */
  const pending = [];
  context.on("response", (response) => {
    const req = response.request();
    if (
      !response.ok() ||
      !response.headers()["content-type"]?.includes("application/json")
    )
      return;
    if (req.method() !== "GET" || !req.url().startsWith(API_PREFIX)) return;
    const key = new URL(req.url()).pathname.split("/").pop() || "";
    if (!READ_ROUTES.has(key)) return;
    pending.push(
      req
        .allHeaders()
        .then((all) => {
          headers[key] = Object.fromEntries(
            Object.entries(all).filter(([name]) =>
              /^(x-|orderstatusservice$|content-type$|referer$|user-agent$)/i.test(
                name,
              ),
            ),
          );
        })
        .catch(() => {}),
    );
  });
  try {
    const page = await context.newPage();
    process.stderr.write(
      headed
        ? "Complete any required KP verification in the browser.\n"
        : "Signing in to KP in a hidden browser…\n",
    );
    await page.goto(PHARMACY_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await completeLogin(
      page,
      () => !!headers.orderStatus && !!headers.rxDetails,
      {
        credentials: options.credentials,
        headed,
        timeout: options.timeout || (headed ? 300 : 45),
      },
    );
    await Promise.all(pending);
    if (!headers.orderStatus || !headers.rxDetails)
      throw new KpError(
        "PHARMACY_SESSION_INCOMPLETE",
        "Sign-in succeeded, but pharmacy did not load. Complete any introduction in the browser, then retry login.",
        3,
      );
    await savePrivate(p.session, await context.storageState());
    await savePrivate(p.directory + "/api.json", {
      capturedAt: new Date().toISOString(),
      headers,
    });
    await savePrivate(p.metadata, {
      ...(await readPrivate(p.metadata)),
      automaticLoginBlocked: null,
      savedAt: new Date().toISOString(),
      source: headed ? "browser-login" : "hidden-login",
    });
    return {
      signedIn: true,
      profile,
      httpRoutes: Object.keys(headers),
      savedAt: new Date().toISOString(),
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
/** @param {string} profile */
export async function localStatus(profile) {
  const p = paths(profile);
  const session = await readPrivate(p.session);
  const metadata = await readPrivate(p.metadata);
  const api = await readPrivate(p.directory + "/api.json");
  return {
    profile,
    saved: !!session,
    savedAt: metadata?.savedAt || null,
    httpReady: !!api?.headers?.orderStatus,
    credentialsConfigured: metadata?.credentialsConfigured === true,
    automaticLoginBlocked: metadata?.automaticLoginBlocked || null,
    validity: "not_checked",
  };
}
/** @param {string} profile */
export async function logout(profile) {
  const p = paths(profile);
  await forgetCredentials(profile);
  await rm(p.directory, { recursive: true, force: true });
  return {
    profile,
    removed: true,
    scope: "local",
    message:
      "Saved Keychain credentials, local session, and cached updates removed. This does not revoke other KP browser sessions.",
  };
}
/** @param {string} profile */
export async function requireSession(profile) {
  const p = paths(profile);
  if (!(await readPrivate(p.session)))
    throw new KpError(
      "AUTH_REQUIRED",
      "No saved session. Run kp auth login.",
      3,
    );
  const mode = (await stat(p.session)).mode & 0o777;
  if (process.platform !== "win32" && mode & 0o077)
    throw new KpError(
      "SESSION_PERMISSIONS",
      "Session file is accessible to other users. Set its permissions to 600 before continuing.",
      3,
    );
  return p;
}

/** Save only in Keychain; profile metadata contains no User ID or password. */
/** @param {string} profile @param {import('./credentials.js').Credentials} credentials */
export async function setupCredentials(profile, credentials) {
  const checked = validateCredentials(credentials);
  await saveCredentials(profile, checked);
  const p = paths(profile);
  await savePrivate(p.metadata, {
    ...(await readPrivate(p.metadata)),
    credentialsConfigured: true,
    automaticLoginBlocked: null,
  });
  return signInSaved(profile, { credentials: checked, fresh: true });
}
/** @param {string} profile @param {{credentials?:import('./credentials.js').Credentials,headed?:boolean,fresh?:boolean,timeout?:number}} [options] */
export async function signInSaved(profile, options = {}) {
  let credentials = options.credentials;
  if (!credentials) {
    try {
      credentials = (await loadCredentials(profile)) || undefined;
    } catch (error) {
      if (!options.headed) throw error;
      process.stderr.write(
        "Saved credentials are unavailable; sign in manually in the browser.\n",
      );
    }
  }
  if (!credentials && !options.headed)
    throw new KpError(
      "AUTH_REQUIRED",
      "No saved credentials. Run kp auth setup or kp auth login --browser.",
      3,
    );
  try {
    return await login(profile, {
      ...options,
      credentials: credentials || undefined,
      headed: options.headed ?? false,
    });
  } catch (error) {
    if (
      error instanceof KpError &&
      ["CREDENTIALS_REJECTED", "AUTH_INTERACTION_REQUIRED"].includes(error.code)
    ) {
      const p = paths(profile);
      await savePrivate(p.metadata, {
        ...(await readPrivate(p.metadata)),
        automaticLoginBlocked: error.code,
      });
    }
    throw error;
  }
}
/** Recover reads once; do not repeatedly submit credentials after rejection/challenge. */
/** @param {string} profile @param {boolean} interactive */
export async function recoverSession(profile, interactive) {
  const metadata = await readPrivate(paths(profile).metadata);
  if (metadata?.credentialsConfigured) {
    if (metadata.automaticLoginBlocked === "CREDENTIALS_REJECTED")
      throw new KpError(
        "CREDENTIALS_REJECTED",
        "Automatic login is paused after KP rejected credentials. Run kp auth setup.",
        3,
      );
    if (metadata.automaticLoginBlocked === "AUTH_INTERACTION_REQUIRED") {
      if (interactive) return signInSaved(profile, { headed: true });
      throw new KpError(
        "AUTH_INTERACTION_REQUIRED",
        "KP verification is pending. Run kp auth login --browser.",
        3,
      );
    }
    try {
      return await signInSaved(profile);
    } catch (error) {
      if (
        interactive &&
        error instanceof KpError &&
        error.code === "AUTH_INTERACTION_REQUIRED"
      )
        return signInSaved(profile, { headed: true });
      throw error;
    }
  }
  if (interactive) return login(profile);
  throw new KpError(
    "AUTH_REQUIRED",
    "No usable session or configured credentials. Run kp auth setup or kp auth login --browser.",
    3,
  );
}
/** @param {string} profile */
export async function forgetSavedCredentials(profile) {
  await forgetCredentials(profile);
  const p = paths(profile);
  await savePrivate(p.metadata, {
    ...(await readPrivate(p.metadata)),
    credentialsConfigured: false,
    automaticLoginBlocked: null,
  });
  return { profile, credentialsRemoved: true, sessionKept: true };
}
