import { ORIGIN, PHARMACY_URL } from "./config.js";
import { KpError } from "./errors.js";
const IDENTITY_ORIGIN = "https://identityauth.kaiserpermanente.org";
/** @param {string} url */
export function isIdentityOrigin(url) {
  try {
    return new URL(url).origin === IDENTITY_ORIGIN;
  } catch {
    return false;
  }
}
/** @param {string} text */
export function classifyLoginText(text) {
  if (
    /(?:incorrect|invalid|unrecognized|wrong|not recognized).{0,80}(?:password|user id|credentials)|(?:password|user id).{0,80}(?:incorrect|invalid|not recognized)|account.{0,40}(?:locked|disabled)|unable to sign (?:you )?in|sign.in (?:failed|unsuccessful)/i.test(
      text,
    )
  )
    return "CREDENTIALS_REJECTED";
  if (
    /verification code|security code|verify your identity|two.step verification|captcha|access denied|unusual activity/i.test(
      text,
    )
  )
    return "AUTH_INTERACTION_REQUIRED";
  return null;
}
/** Fill secrets only on the exact observed identity origin. Never dump DOM/input values. */
/** @param {import('playwright').Page} page @param {import('./credentials.js').Credentials} credentials */
export async function submitCredentials(page, credentials) {
  if (!isIdentityOrigin(page.url()))
    throw new KpError(
      "UNTRUSTED_LOGIN_ORIGIN",
      "KP redirected to an unexpected sign-in origin. Credentials were not entered.",
      3,
    );
  try {
    const close = page.locator("#onetrust-close-btn-container button");
    if (await close.isVisible().catch(() => false))
      await close.click({ timeout: 3000 });
    await page.locator("#userid").fill(credentials.username, { timeout: 5000 });
    // Recheck after username entry in case the page navigated.
    if (!isIdentityOrigin(page.url()))
      throw new KpError(
        "UNTRUSTED_LOGIN_ORIGIN",
        "Sign-in origin changed. Password was not entered.",
        3,
      );
    await page
      .locator("#password")
      .fill(credentials.password, { timeout: 5000 });
    await page
      .locator("#submitButton")
      .click({ timeout: 5000, noWaitAfter: true });
  } catch (error) {
    if (error instanceof KpError) throw error;
    throw new KpError(
      "AUTH_INTERACTION_REQUIRED",
      "KP sign-in needs browser interaction. Run kp auth login --browser.",
      3,
    );
  }
}
/** @param {import('playwright').Page} page @param {() => boolean} ready @param {{credentials?:import('./credentials.js').Credentials,headed:boolean,timeout:number}} options */
export async function completeLogin(page, ready, options) {
  const deadline = Date.now() + options.timeout * 1000;
  let submitted = false;
  let navigatedToPharmacy = false;
  while (Date.now() < deadline) {
    if (ready()) return;
    if (isIdentityOrigin(page.url())) {
      const text = await page
        .locator("body")
        .innerText({ timeout: 2000 })
        .catch(() => "");
      const state = classifyLoginText(text);
      if (state === "CREDENTIALS_REJECTED" && submitted)
        throw new KpError(
          state,
          "KP did not accept the saved credentials. Automatic login is paused; run kp auth setup to replace them.",
          3,
        );
      if (state === "AUTH_INTERACTION_REQUIRED" && !options.headed)
        throw new KpError(
          state,
          "KP requires verification or a browser challenge. Run kp auth login --browser.",
          3,
        );
      if (
        options.credentials &&
        !submitted &&
        (await page
          .locator("#password")
          .isVisible()
          .catch(() => false))
      ) {
        // Mark before submission: a navigation error must never trigger a second attempt.
        submitted = true;
        await submitCredentials(page, options.credentials);
      }
    }
    if (
      !navigatedToPharmacy &&
      !page.frames().some((frame) => frame.url().includes("/secure/pharmacy/"))
    ) {
      for (const frame of page.frames()) {
        if (!frame.url().startsWith(ORIGIN + "/")) continue;
        if (
          await frame
            .locator('a[href="/health/mycare/logout.wpp"]')
            .count()
            .catch(() => 0)
        ) {
          navigatedToPharmacy = true;
          await page.goto(PHARMACY_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });
          break;
        }
      }
    }
    await page.waitForTimeout(250);
  }
  if (!options.headed)
    throw new KpError(
      "AUTH_INTERACTION_REQUIRED",
      "Hidden sign-in could not finish. Run kp auth login --browser to complete verification.",
      3,
    );
  throw new KpError(
    "AUTH_REQUIRED",
    "KP sign-in did not complete. Run kp auth login --browser and finish verification.",
    3,
  );
}
