import {
  mkdir,
  readFile,
  rename,
  writeFile,
  chmod,
  rm,
} from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { KpError } from "./errors.js";
/** @param {string} path @param {unknown} value */
export async function savePrivate(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
/** @param {string} path @returns {Promise<any | null>} */
export async function readPrivate(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT")
      return null;
    throw new KpError(
      "LOCAL_STATE_INVALID",
      "Local session or cache could not be read. Log in again or remove the affected profile.",
    );
  }
}
