import { Command, CommanderError } from "commander";
import {
  login,
  localStatus,
  logout,
  recoverSession,
  setupCredentials,
  signInSaved,
  forgetSavedCredentials,
} from "./core/auth.js";
import { promptCredentials } from "./core/prompt.js";
import { KpError } from "./core/errors.js";
import { emit, table, clean } from "./core/output.js";
import { features } from "./features/index.js";
import {
  withPharmacy,
  orders,
  prescriptions,
  preferences,
  orderDetails,
  summary,
  refillPlan,
} from "./features/pharmacy/service.js";
import { syncUpdates, listUpdates } from "./features/notifications/service.js";

/** @param {any} item */
const orderLine = (item) =>
  `${clean(item.status)} · ${clean(item.type || "Order")}\n  ${item.prescriptions.map((/** @type {any} */ r) => clean(r.name)).join(", ") || "No medication details"}\n  ID: ${clean(item.id)}`;
/** @param {any} data */
function renderOrders(data) {
  return data.length
    ? data.map(orderLine).join("\n\n")
    : "No current pharmacy orders.";
}
/** @param {any} data */
function renderRx(data) {
  const text = data.items.length
    ? table(
        ["REFERENCE", "MEDICATION", "REFILLS", "ORDERABLE"],
        data.items.map((/** @type {any} */ r) => [
          r.id || r.reference,
          r.name,
          r.refillsRemaining,
          r.canOrder ? "Yes" : "No",
        ]),
      )
    : "No prescriptions returned.";
  return (
    text +
    (data.partial
      ? "\n\nKP returned incomplete data or warnings; this list may be incomplete."
      : "") +
    (data.message ? "\n" + clean(data.message) : "")
  );
}
/** @param {any} data */
function renderDetail(data) {
  const pharmacy = data.pharmacy;
  return `${renderOrders([data])}\n\n${data.prescriptions.map((/** @type {any} */ r) => `  ${clean(r.name)} · Copay: ${clean(r.copay)}`).join("\n")}\n\n${pharmacy ? [clean(pharmacy.name), [pharmacy.address?.street1, pharmacy.address?.city, pharmacy.address?.state, pharmacy.address?.postalCode].filter(Boolean).join(", "), ...pharmacy.hours, ...pharmacy.phones.map((/** @type {any} */ p) => `${p.number} (${p.label})`)].map(clean).join("\n") : "No pharmacy details returned."}`;
}
/** @param {any} data */
function renderUpdates(data) {
  return data.updates.length
    ? table(
        ["DETECTED", "UPDATE", "STATUS"],
        data.updates.map((/** @type {any} */ u) => [
          u.detectedAt,
          u.kind,
          u.status,
        ]),
      )
    : data.baselineCreated
      ? "Baseline saved. Future syncs will show changes."
      : "No pharmacy status changes.";
}

/** @param {string[]} [argv] */
export async function main(argv = process.argv) {
  const program = new Command();
  const json = argv.includes("--json");
  program
    .name("kp")
    .description(
      "Unofficial Kaiser Permanente member CLI for humans and agents",
    )
    .version("0.1.0")
    .option("--json", "Emit a versioned JSON envelope")
    .option("--profile <name>", "Saved account profile", "default")
    .option(
      "--interactive",
      "Open login when a read command needs authentication",
      !!process.stdin.isTTY && !json,
    )
    .option("--no-interactive", "Do not open login automatically")
    .showHelpAfterError(false)
    .exitOverride();
  program.configureOutput({ outputError: () => {} });
  /** @param {any} data @param {(value:any)=>string} [render] */
  const output = (data, render) => emit(data, !!program.opts().json, render);
  /** @param {(transport: import('./core/http.js').HttpTransport) => Promise<any>} action */
  const read = async (action) => {
    const profile = program.opts().profile;
    try {
      return await withPharmacy(profile, action);
    } catch (error) {
      if (error instanceof KpError && error.code === "AUTH_REQUIRED") {
        await recoverSession(profile, !!program.opts().interactive);
        return withPharmacy(profile, action);
      }
      throw error;
    }
  };
  program
    .command("features")
    .description("Available and planned feature modules")
    .action(() =>
      output(features, (data) =>
        table(
          ["FEATURE", "STATE", "DESCRIPTION"],
          data.map((/** @type {any} */ f) => [f.name, f.status, f.description]),
        ),
      ),
    );
  program
    .command("status")
    .description("Current pharmacy orders and prescription availability")
    .action(async () =>
      output(
        await read(summary),
        (data) =>
          `${renderOrders(data.orders)}\n\n${renderRx(data.prescriptions)}`,
      ),
    );
  const auth = program
    .command("auth")
    .description("Keychain credentials, hidden login, and session management");
  auth
    .command("setup")
    .description(
      "Enter credentials privately once; save in macOS Keychain and sign in hidden",
    )
    .action(async () =>
      output(
        await setupCredentials(
          program.opts().profile,
          await promptCredentials(),
        ),
        (data) =>
          `Signed in. Credentials saved in Keychain for profile: ${data.profile}\nExpired sessions will use hidden sign-in automatically.`,
      ),
    );
  auth
    .command("forget")
    .description(
      "Remove saved Keychain credentials while keeping the current session",
    )
    .action(async () =>
      output(
        await forgetSavedCredentials(program.opts().profile),
        () => "Saved credentials removed. Current session kept.",
      ),
    );
  auth
    .command("login")
    .description(
      "Sign in hidden with saved credentials, or use browser verification",
    )
    .option("--browser", "Open visible Chrome for sign-in or MFA")
    .option("--fresh", "Start without the previous saved session")
    .option("--timeout <seconds>", "Time allowed for sign-in", "300")
    .action(async (options) => {
      const seconds = Number(options.timeout);
      if (!Number.isFinite(seconds) || seconds < 10 || seconds > 1800)
        throw new KpError(
          "INVALID_ARGUMENT",
          "Login timeout must be between 10 and 1800 seconds.",
          2,
        );
      output(
        await (async () => {
          const profile = program.opts().profile;
          const status = await localStatus(profile);
          const loginOptions = {
            timeout: options.browser ? seconds : Math.min(seconds, 45),
            fresh: options.fresh,
            headed: !!options.browser,
          };
          return status.credentialsConfigured
            ? signInSaved(profile, loginOptions)
            : login(profile, {
                ...loginOptions,
                headed: true,
                timeout: seconds,
              });
        })(),
        (data) =>
          `Signed in. Profile: ${data.profile}\nSession saved for headless pharmacy commands.`,
      );
    });
  auth
    .command("status")
    .description("Saved session metadata; use --live to validate with KP")
    .option("--live", "Check the session using order status")
    .action(async (options) => {
      let status = await localStatus(program.opts().profile);
      if (options.live) {
        await read(orders);
        status = await localStatus(program.opts().profile);
        status.validity = "verified";
      }
      output(
        status,
        (data) =>
          `Profile: ${data.profile}\nSession: ${data.saved ? "Saved" : "Missing"}\nHTTP headers: ${data.httpReady ? "Captured" : "Missing"}\nSaved credentials: ${data.credentialsConfigured ? "Keychain configured" : "Not configured"}\nAutomatic login: ${data.automaticLoginBlocked || "Ready"}\nValidity: ${data.validity}\nSaved: ${data.savedAt || "Never"}`,
      );
    });
  auth
    .command("logout")
    .description(
      "Remove saved credentials, local session, and pharmacy update cache",
    )
    .action(async () =>
      output(await logout(program.opts().profile), (data) => data.message),
    );
  const rx = program
    .command("rx")
    .description("Prescription information and refill previews");
  rx.command("list")
    .description("List prescriptions and reported refill eligibility")
    .action(async () => output(await read(prescriptions), renderRx));
  rx.command("show <reference>")
    .description("Show a prescription by server ID or current list reference")
    .action(async (reference) => {
      const data = await read(prescriptions);
      const item = data.items.find(
        (/** @type {any} */ item) =>
          item.id === reference || item.reference === reference,
      );
      if (!item)
        throw new KpError(
          "NOT_FOUND",
          "Prescription not found. Run kp rx list.",
          5,
        );
      output(
        { prescription: item, partial: data.partial, warnings: data.warnings },
        (data) =>
          `${clean(data.prescription.name)}\nRefills: ${clean(data.prescription.refillsRemaining)}\nStatus: ${clean(data.prescription.status)}\n${clean(data.prescription.instructions)}${data.prescription.sourceError ? "\nKP: " + clean(data.prescription.sourceError) : ""}${data.partial ? "\nKP returned data warnings." : ""}`,
      );
    });
  rx.command("refill <reference>")
    .description("Preview refill eligibility (submission not yet implemented)")
    .option("--dry-run", "Read-only preview; required")
    .action(async (reference, options) => {
      if (!options.dryRun)
        throw new KpError(
          "ACTION_NOT_VERIFIED",
          "Refill submission is not implemented. Use --dry-run to preview eligibility, or complete checkout on KP.",
          6,
        );
      output(
        await read((http) => refillPlan(http, reference)),
        (data) =>
          `Refill preview: ${clean(data.prescription.name)}\nEligible: ${data.eligible ? "Yes" : "No"}\n${clean(data.reason)}\nNo order submitted.\n${data.webUrl}`,
      );
    });
  const order = program
    .command("orders")
    .description(
      "Pharmacy order status, pickup details, and cancellation previews",
    );
  order
    .command("list")
    .description("List current pharmacy orders")
    .action(async () => output(await read(orders), renderOrders));
  order
    .command("show [id]")
    .description("Show order status, copay, pharmacy address, and hours")
    .action(async (id) =>
      output(await read((http) => orderDetails(http, id)), renderDetail),
    );
  order
    .command("cancel <id>")
    .description("Preview an order (cancellation not yet implemented)")
    .option("--dry-run", "Read-only preview; required")
    .action(async (id, options) => {
      if (!options.dryRun)
        throw new KpError(
          "ACTION_NOT_VERIFIED",
          "Cancellation submission is not implemented. Use --dry-run to inspect the order, or manage it on KP.",
          6,
        );
      const data = await read((http) => orderDetails(http, id));
      output(
        {
          action: "cancel",
          submitted: false,
          order: data,
          eligibility: "unverified",
          reason: data.cancellation.reason,
        },
        (data) =>
          `${renderDetail(data.order)}\n\n${clean(data.reason)}\nNo cancellation submitted.`,
      );
    });
  const notifications = program
    .command("notifications")
    .description("KP pharmacy preferences and locally detected changes");
  notifications
    .command("preferences")
    .description("Read current KP pharmacy communication preferences")
    .action(async () =>
      output(await read(preferences), (data) =>
        table(
          ["NOTIFICATION", "CHANNELS"],
          data.map((/** @type {any} */ p) => [
            p.name,
            p.channels
              .map(
                (/** @type {any} */ c) =>
                  `${c.name}: ${c.enabled ? "on" : "off"}`,
              )
              .join(", "),
          ]),
        ),
      ),
    );
  notifications
    .command("sync")
    .description("Compare current order status to the previous local snapshot")
    .action(async () =>
      output(
        await syncUpdates(program.opts().profile, await read(orders)),
        renderUpdates,
      ),
    );
  notifications
    .command("list")
    .description("Show cached local update history without contacting KP")
    .action(async () =>
      output(await listUpdates(program.opts().profile), renderUpdates),
    );
  notifications
    .command("watch")
    .description("Poll order changes; press Ctrl+C to stop")
    .option("--interval <seconds>", "Polling interval (minimum 60)", "300")
    .action(async (options) => {
      const interval = Number(options.interval);
      if (!Number.isFinite(interval) || interval < 60 || interval > 86400)
        throw new KpError(
          "INVALID_ARGUMENT",
          "Watch interval must be between 60 and 86400 seconds.",
          2,
        );
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        while (!controller.signal.aborted) {
          const data = await syncUpdates(
            program.opts().profile,
            await read(orders),
          );
          if (data.baselineCreated || data.updates.length)
            output(data, renderUpdates);
          await new Promise((resolve) => {
            const done = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", done);
              resolve(undefined);
            };
            const timer = setTimeout(done, interval * 1000);
            controller.signal.addEventListener("abort", done, { once: true });
            if (controller.signal.aborted) done();
          });
        }
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
    });
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (
      error instanceof CommanderError &&
      [
        "commander.helpDisplayed",
        "commander.version",
        "commander.help",
      ].includes(error.code)
    )
      return;
    const e =
      error instanceof KpError
        ? error
        : error instanceof CommanderError
          ? new KpError("INVALID_ARGUMENT", error.message, 2)
          : new KpError(
              "INTERNAL_ERROR",
              "The command could not complete. Check your session, local file permissions, and connection.",
            );
    if (json)
      process.stdout.write(
        JSON.stringify({
          schemaVersion: 1,
          ok: false,
          error: { code: e.code, message: e.message },
        }) + "\n",
      );
    else process.stderr.write(`Error [${e.code}]: ${clean(e.message)}\n`);
    process.exitCode = e.exitCode;
  }
}
