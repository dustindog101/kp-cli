import { emitKeypressEvents } from "node:readline";
import { KpError } from "./errors.js";
/** Terminal-only entry: neither User ID nor password is echoed or accepted in argv. */
/** @param {string} label @param {NodeJS.ReadStream} [input] @param {NodeJS.WriteStream} [output] */
export function readSecret(
  label,
  input = process.stdin,
  output = process.stderr,
) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function")
    throw new KpError(
      "CREDENTIAL_INPUT_REQUIRED",
      "Run kp auth setup in an interactive terminal. Credentials are never accepted as command arguments or piped input.",
      2,
    );
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;
    const wasPaused = input.isPaused();
    emitKeypressEvents(input);
    const cleanup = () => {
      input.removeListener("keypress", onKey);
      input.removeListener("end", onEnd);
      input.setRawMode(!!wasRaw);
      if (wasPaused) input.pause();
      output.write("\n");
    };
    const onEnd = () => {
      cleanup();
      reject(new KpError("INPUT_CANCELLED", "Credential entry cancelled.", 2));
    };
    /** @param {string} text @param {import('node:readline').Key} key */
    const onKey = (text, key = {}) => {
      if (key.ctrl && ["c", "d"].includes(key.name || "")) return onEnd();
      if (["return", "enter"].includes(key.name || "")) {
        cleanup();
        resolve(value);
        return;
      }
      if (key.name === "backspace") {
        value = Array.from(value).slice(0, -1).join("");
        return;
      }
      if (key.ctrl && key.name === "u") {
        value = "";
        return;
      }
      if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text))
        value += text;
    };
    output.write(label);
    input.setRawMode(true);
    input.on("keypress", onKey);
    input.once("end", onEnd);
    input.resume();
  });
}
export async function promptCredentials() {
  const username = await readSecret("KP User ID (hidden): ");
  const password = await readSecret("KP password (hidden): ");
  return { username, password };
}
