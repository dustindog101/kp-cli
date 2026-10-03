import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { paths } from "./config.js";
import { KpError } from "./errors.js";

/** @typedef {{username:string,password:string}} Credentials */
/** @param {string} profile */
export function credentialAccount(profile) {
  return createHash("sha256")
    .update(resolve(paths(profile).directory))
    .digest("hex");
}
/** @param {unknown} value @returns {Credentials} */
export function validateCredentials(value) {
  const credentials = /** @type {Credentials} */ (value);
  if (
    !credentials ||
    typeof credentials.username !== "string" ||
    typeof credentials.password !== "string" ||
    !credentials.username.trim() ||
    !credentials.password ||
    credentials.username.length > 256 ||
    credentials.password.length > 1024 ||
    /[\r\n\0]/.test(credentials.username + credentials.password)
  ) {
    throw new KpError(
      "INVALID_CREDENTIALS",
      "Enter a nonempty KP User ID and password.",
      2,
    );
  }
  return {
    username: credentials.username.trim(),
    password: credentials.password,
  };
}
/** @param {string} profile */
async function keychainEntry(profile) {
  if (process.platform !== "darwin")
    throw new KpError(
      "KEYCHAIN_UNAVAILABLE",
      "Saved-credential login currently supports macOS Keychain. Browser login remains available.",
      3,
    );
  try {
    const { AsyncEntry } = await import("@napi-rs/keyring");
    return new AsyncEntry("kp-member-cli", credentialAccount(profile));
  } catch {
    throw new KpError(
      "KEYCHAIN_UNAVAILABLE",
      "Could not open macOS Keychain. Unlock your Keychain or use browser login.",
      3,
    );
  }
}
/** @param {string} profile @param {Credentials} credentials */
export async function saveCredentials(profile, credentials) {
  const validated = validateCredentials(credentials);
  try {
    await (await keychainEntry(profile)).setPassword(JSON.stringify(validated));
  } catch {
    throw new KpError(
      "KEYCHAIN_UNAVAILABLE",
      "Credentials could not be saved to macOS Keychain. No plaintext fallback was used.",
      3,
    );
  }
}
/** @param {string} profile @returns {Promise<Credentials|null>} */
export async function loadCredentials(profile) {
  try {
    const value = await (await keychainEntry(profile)).getPassword();
    return value ? validateCredentials(JSON.parse(value)) : null;
  } catch {
    throw new KpError(
      "KEYCHAIN_UNAVAILABLE",
      "Saved credentials could not be read. Unlock your Keychain or use kp auth login --browser.",
      3,
    );
  }
}
/** @param {string} profile */
export async function forgetCredentials(profile) {
  if (process.platform !== "darwin") return false;
  try {
    return await (await keychainEntry(profile)).deleteCredential();
  } catch {
    throw new KpError(
      "KEYCHAIN_UNAVAILABLE",
      "Saved credentials could not be removed from Keychain. Local session cleanup was not started.",
      3,
    );
  }
}
