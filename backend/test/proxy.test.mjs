import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.PROXY_BASE_URL;

test("proxy limits authentication attempts without blocking session checks", { skip: !base }, async () => {
  let rejected = 0;
  let accepted = 0;
  for (let index = 0; index < 15; index++) {
    const route = index % 2 === 0 ? "login" : "register";
    const response = await fetch(`${base}/api/${route}?attempt=${index}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${index}` },
      body: "{}",
    });
    if (response.status === 429) {
      rejected++;
      assert.equal(response.headers.get("retry-after"), "13");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(response.headers.get("content-type"), /^application\/json/);
      assert.equal(typeof (await response.json()).error, "string");
    } else {
      assert.equal(response.status, 400);
      accepted++;
    }
  }
  assert.ok(accepted > 0, "requests must reach the API before the limit");
  assert.ok(rejected > 0, "login and registration must share the same limit");
  for (const method of ["GET", "HEAD"]) {
    for (const route of ["login", "register"]) {
      assert.equal((await fetch(`${base}/api/${route}`, { method })).status, 404);
    }
  }
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
});
