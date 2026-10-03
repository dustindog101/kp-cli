import { homedir } from "node:os";
import { join } from "node:path";
import { KpError } from "./errors.js";
export const ORIGIN = "https://healthy.kaiserpermanente.org";
export const PHARMACY_URL = `${ORIGIN}/secure/pharmacy`;
/** @param {string} profile */
export function paths(profile = "default") {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile))
    throw new KpError(
      "INVALID_PROFILE",
      "Use letters, numbers, underscores, or hyphens for the profile.",
      2,
    );
  const root =
    process.env.KP_HOME || join(homedir(), ".local", "share", "kp-cli");
  const directory = join(root, "profiles", profile);
  return {
    root,
    directory,
    session: join(directory, "session.json"),
    metadata: join(directory, "metadata.json"),
    updates: join(directory, "updates.json"),
  };
}
/** @param {string} input */
export function trustedUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new KpError(
      "INVALID_URL",
      "Expected a valid HTTPS Kaiser Permanente URL.",
      2,
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(
      url.hostname === "kp.org" ||
      url.hostname.endsWith(".kp.org") ||
      url.hostname === "kaiserpermanente.org" ||
      url.hostname.endsWith(".kaiserpermanente.org")
    )
  ) {
    throw new KpError(
      "UNTRUSTED_URL",
      "Only HTTPS Kaiser Permanente URLs are allowed.",
      2,
    );
  }
  return url;
}
