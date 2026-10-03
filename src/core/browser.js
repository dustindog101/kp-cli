import { chromium } from "playwright";
import { KpError } from "./errors.js";
/** @param {boolean} [headed] */
export async function launchBrowser(headed = false) {
  try {
    return await chromium.launch({ channel: "chrome", headless: !headed });
  } catch {
    throw new KpError(
      "BROWSER_UNAVAILABLE",
      "Install Google Chrome to run kp auth login. Saved HTTP sessions do not require a browser.",
    );
  }
}
