import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { paths, trustedUrl } from "../src/core/config.js";
import { savePrivate } from "../src/core/store.js";
import { HttpTransport } from "../src/core/http.js";
import { table } from "../src/core/output.js";

test("profiles cannot traverse paths and URLs cannot leak session to lookalike hosts", () => {
  assert.throws(() => paths("../another-account"), { code: "INVALID_PROFILE" });
  for (const url of [
    "https://kaiserpermanente.org.evil.example/",
    "http://kp.org/",
    "https://user:secret@kp.org/",
  ])
    assert.throws(() => trustedUrl(url));
  assert.equal(
    trustedUrl("https://apims.kaiserpermanente.org/").hostname,
    "apims.kaiserpermanente.org",
  );
});
test("local session storage is private and atomic", async () => {
  const root = await mkdtemp(join(tmpdir(), "kp-test-"));
  try {
    const path = join(root, "profile", "session.json");
    await savePrivate(path, { cookies: ["synthetic"] });
    await savePrivate(path, { cookies: ["new-synthetic"] });
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      cookies: ["new-synthetic"],
    });
    if (process.platform !== "win32") {
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.equal((await stat(join(root, "profile"))).mode & 0o777, 0o700);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("HTTP transport rejects redirects, rate limits, and unexpected content without logging headers", async () => {
  for (const [status, type, code] of [
    [302, "text/html", "AUTH_REQUIRED"],
    [403, "application/json", "AUTH_REQUIRED"],
    [429, "application/json", "RATE_LIMITED"],
    [200, "text/html", "UNEXPECTED_RESPONSE"],
  ]) {
    let options;
    const context = {
      get: async (_, opts) => {
        options = opts;
        return {
          status: () => status,
          ok: () => status === 200,
          headers: () => ({ "content-type": type }),
        };
      },
    };
    const transport = new HttpTransport(context, paths("test"), {
      orderStatus: { "x-test-secret": "synthetic" },
    });
    await assert.rejects(
      transport.getJson(
        "https://apims.kaiserpermanente.org/kp/mycare/pharmacy-microservices/test",
        "orderStatus",
      ),
      { code },
    );
    assert.equal(options.maxRedirects, 0);
  }
});
test("human tables remove terminal control characters", () => {
  const output = table(["NAME"], [["Medication\u001b[31m\nInjected"]]);
  assert.ok(!output.includes("\u001b"));
  assert.equal(output.split("\n").length, 3);
});
test("agent errors are one JSON record with stable exit codes and no mutation", () => {
  for (const [args, code, exit] of [
    [["unknown"], "INVALID_ARGUMENT", 2],
    [["rx", "refill", "synthetic"], "ACTION_NOT_VERIFIED", 6],
    [["orders", "cancel", "synthetic"], "ACTION_NOT_VERIFIED", 6],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["bin/kp.js", ...args, "--json"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, exit);
    assert.equal(result.stderr, "");
    const data = JSON.parse(result.stdout);
    assert.equal(data.ok, false);
    assert.equal(data.error.code, code);
    assert.equal(result.stdout.trim().split("\n").length, 1);
  }
});
