import { request } from "playwright";
import { KpError } from "./errors.js";
import { trustedUrl } from "./config.js";
import { readPrivate, savePrivate } from "./store.js";
import { requireSession } from "./auth.js";
/** Cookie-aware, browser-free requests for observed pharmacy endpoints. */
export class HttpTransport {
  /** @param {import('playwright').APIRequestContext} context @param {ReturnType<import('./config.js').paths>} paths @param {Record<string,Record<string,string>>} headers */
  constructor(context, paths, headers) {
    this.context = context;
    this.paths = paths;
    this.headers = headers;
  }
  /** @param {string} profile */
  static async create(profile) {
    const p = await requireSession(profile);
    const api = await readPrivate(p.directory + "/api.json");
    if (!api?.headers?.orderStatus || !api?.headers?.rxDetails)
      throw new KpError(
        "AUTH_REQUIRED",
        "Pharmacy session headers are missing. Run kp auth login.",
        3,
      );
    return new HttpTransport(
      await request.newContext({
        storageState: p.session,
        timeout: 20000,
        ignoreHTTPSErrors: false,
      }),
      p,
      api.headers,
    );
  }
  /** @param {string} endpoint @param {string} key */
  async getJson(endpoint, key) {
    const url = trustedUrl(endpoint);
    // This transport is deliberately restricted to the verified pharmacy API.
    if (
      url.origin !== "https://apims.kaiserpermanente.org" ||
      !url.pathname.startsWith("/kp/mycare/pharmacy-microservices/")
    )
      throw new KpError(
        "UNTRUSTED_URL",
        "Only discovered pharmacy API endpoints can use this session.",
        2,
      );
    let response;
    try {
      response = await this.context.get(url.href, {
        headers: this.headers[key] || this.headers.orderStatus,
        maxRedirects: 0,
      });
    } catch {
      throw new KpError(
        "NETWORK_FAILED",
        "Could not reach KP. Check your connection and retry. No request was automatically repeated.",
        4,
      );
    }
    if ([301, 302, 303, 307, 308, 401, 403].includes(response.status()))
      throw new KpError(
        "AUTH_REQUIRED",
        "KP requires sign-in or browser verification. Run kp auth login.",
        3,
      );
    if (response.status() === 429)
      throw new KpError(
        "RATE_LIMITED",
        "KP limited requests. Wait before trying again.",
        4,
      );
    if (!response.ok())
      throw new KpError(
        "HTTP_FAILED",
        `KP returned HTTP ${response.status()}.`,
        4,
      );
    if (!response.headers()["content-type"]?.includes("application/json"))
      throw new KpError(
        "UNEXPECTED_RESPONSE",
        "KP returned a non-JSON response. Run kp auth login if your session expired.",
        4,
      );
    try {
      return await response.json();
    } catch {
      throw new KpError("UNEXPECTED_RESPONSE", "KP returned invalid JSON.", 4);
    }
  }
  async close() {
    try {
      await savePrivate(this.paths.session, await this.context.storageState());
    } finally {
      await this.context.dispose();
    }
  }
}
