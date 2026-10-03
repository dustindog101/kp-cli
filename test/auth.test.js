import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { readSecret } from "../src/core/prompt.js";
import {
  credentialAccount,
  validateCredentials,
} from "../src/core/credentials.js";
import {
  classifyLoginText,
  isIdentityOrigin,
  submitCredentials,
  completeLogin,
} from "../src/core/login-flow.js";

test("terminal credential entry does not echo secrets and restores raw mode", async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => {
    input.isRaw = value;
    return input;
  };
  let displayed = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      displayed += chunk.toString();
      callback();
    },
  });
  output.isTTY = true;
  const pending = readSecret("Password: ", input, output);
  input.write("synthetic-password\r");
  assert.equal(await pending, "synthetic-password");
  assert.equal(displayed, "Password: \n");
  assert.equal(input.isRaw, false);
  assert.equal(input.listenerCount("keypress"), 0);
  input.destroy();
  output.destroy();
});
test("cancelled credential input never reaches storage and does not leave raw mode active", async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => {
    input.isRaw = value;
    return input;
  };
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  output.isTTY = true;
  const pending = readSecret("Password: ", input, output);
  input.write("\u0003");
  await assert.rejects(pending, { code: "INPUT_CANCELLED" });
  assert.equal(input.isRaw, false);
  input.destroy();
  output.destroy();
});
test("credential identities are profile-scoped, validation preserves password whitespace", () => {
  assert.notEqual(credentialAccount("one"), credentialAccount("two"));
  assert.throws(() => validateCredentials({ username: "test", password: "" }), {
    code: "INVALID_CREDENTIALS",
  });
  assert.deepEqual(
    validateCredentials({ username: " test ", password: " secret " }),
    { username: "test", password: " secret " },
  );
});
test("saved passwords cannot be filled into a lookalike or unexpected origin", async () => {
  for (const url of [
    "https://identityauth.kaiserpermanente.org.evil.test/",
    "http://identityauth.kaiserpermanente.org/",
    "https://healthy.kaiserpermanente.org/",
  ])
    assert.equal(isIdentityOrigin(url), false);
  assert.equal(
    isIdentityOrigin(
      "https://identityauth.kaiserpermanente.org/as/authorization.oauth2",
    ),
    true,
  );
  await assert.rejects(
    submitCredentials(
      { url: () => "https://evil.test" },
      { username: "synthetic", password: "synthetic" },
    ),
    { code: "UNTRUSTED_LOGIN_ORIGIN" },
  );
});
test("verification and rejected credentials are distinct and do not expose server text", () => {
  assert.equal(
    classifyLoginText("Your User ID or password is incorrect"),
    "CREDENTIALS_REJECTED",
  );
  assert.equal(
    classifyLoginText("Your account has been locked"),
    "CREDENTIALS_REJECTED",
  );
  assert.equal(
    classifyLoginText("Enter the verification code"),
    "AUTH_INTERACTION_REQUIRED",
  );
  assert.equal(classifyLoginText("Password must contain 8 characters"), null);
});
test("hidden login stops immediately on MFA instead of submitting again", async () => {
  let fills = 0;
  const page = {
    url: () =>
      "https://identityauth.kaiserpermanente.org/as/authorization.oauth2",
    locator: () => ({
      innerText: async () => "Enter your verification code",
      fill: async () => {
        fills++;
      },
    }),
  };
  await assert.rejects(
    completeLogin(page, () => false, {
      headed: false,
      timeout: 1,
      credentials: { username: "synthetic", password: "synthetic" },
    }),
    { code: "AUTH_INTERACTION_REQUIRED" },
  );
  assert.equal(fills, 0);
});

test("password rejection stops after exactly one credential submission", async () => {
  let submissions = 0;
  let fills = 0;
  const page = {
    url: () =>
      "https://identityauth.kaiserpermanente.org/as/authorization.oauth2",
    locator: (selector) => ({
      innerText: async () =>
        submissions ? "Your User ID or password is incorrect" : "Sign in",
      isVisible: async () => selector === "#password",
      fill: async () => {
        fills++;
      },
      click: async () => {
        submissions++;
      },
    }),
    frames: () => [],
    waitForTimeout: async () => {},
  };
  await assert.rejects(
    completeLogin(page, () => false, {
      headed: false,
      timeout: 1,
      credentials: { username: "synthetic", password: "synthetic" },
    }),
    { code: "CREDENTIALS_REJECTED" },
  );
  assert.equal(submissions, 1);
  assert.equal(fills, 2);
});

test("a navigation between User ID and password entry prevents password disclosure", async () => {
  let url = "https://identityauth.kaiserpermanente.org/as/authorization.oauth2";
  let passwordFilled = false;
  const page = {
    url: () => url,
    locator: (selector) => ({
      isVisible: async () => false,
      fill: async () => {
        if (selector === "#userid") url = "https://evil.test";
        else passwordFilled = true;
      },
    }),
  };
  await assert.rejects(
    submitCredentials(page, { username: "synthetic", password: "synthetic" }),
    { code: "UNTRUSTED_LOGIN_ORIGIN" },
  );
  assert.equal(passwordFilled, false);
});

test("paused automatic recovery does not reaccess credentials or open a browser", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { savePrivate } = await import("../src/core/store.js");
  const { paths } = await import("../src/core/config.js");
  const { recoverSession } = await import("../src/core/auth.js");
  const root = await mkdtemp(join(tmpdir(), "kp-recovery-"));
  const original = process.env.KP_HOME;
  process.env.KP_HOME = root;
  try {
    for (const code of ["CREDENTIALS_REJECTED", "AUTH_INTERACTION_REQUIRED"]) {
      await savePrivate(paths("test").metadata, {
        credentialsConfigured: true,
        automaticLoginBlocked: code,
      });
      await assert.rejects(recoverSession("test", false), { code });
    }
  } finally {
    if (original === undefined) delete process.env.KP_HOME;
    else process.env.KP_HOME = original;
    await rm(root, { recursive: true, force: true });
  }
});

test("credential setup refuses nonterminal input instead of accepting secrets in a pipe", () => {
  const input = new PassThrough();
  assert.throws(() => readSecret("Password: ", input), {
    code: "CREDENTIAL_INPUT_REQUIRED",
  });
  input.destroy();
});
