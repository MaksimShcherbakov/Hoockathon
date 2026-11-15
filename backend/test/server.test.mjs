import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { Agent, request } from "node:http";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/client.js";

test("secure cookie mode and graceful server shutdown", { timeout: 15000 }, async () => {
  const base = "http://127.0.0.1:3001/api";
  const email = randomUUID() + "@example.test";
  const child = spawn(process.execPath, ["dist/server.js"], {
    env: { ...process.env, PORT: "3001", COOKIE_SECURE: "true", APP_PORT: "443" },
    stdio: "ignore",
  });
  const exited = once(child, "exit");
  const agent = new Agent({ keepAlive: true });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) assert.fail("Test server exited before listening");
      try { ready = (await fetch(base + "/me")).status === 401; } catch { /* starting */ }
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, "test server is ready");
    const body = JSON.stringify({ email, password: "test-password" });
    const headers = { "Content-Type": "application/json", Origin: "https://localhost" };
    assert.equal((await fetch(base + "/register", {
      method: "POST", headers: { ...headers, Origin: "http://localhost" }, body,
    })).status, 403);
    const response = await fetch(base + "/register", { method: "POST", headers, body });
    assert.equal(response.status, 201);
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /^__Host-session=[\w-]+\.[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=604800$/);
    const session = cookie.split(";")[0];
    assert.equal((await fetch(base + "/me", { headers: { Cookie: session } })).status, 200);
    // HTTP-mode cookies must not authenticate the HTTPS configuration.
    assert.equal((await fetch(base + "/me", { headers: { Cookie: session.replace("__Host-session=", "session=") } })).status, 401);
    const logout = await fetch(base + "/logout", { method: "POST", headers: { ...headers, Cookie: session } });
    assert.equal(logout.status, 204);
    assert.equal(logout.headers.get("set-cookie"), "__Host-session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0");
    assert.equal((await fetch(base + "/me", { headers: { Cookie: session } })).status, 401);
    // A 100 Continue response proves the server accepted this request before
    // shutdown. Its body is deliberately withheld until after SIGTERM.
    const pending = request(base + "/login", { method: "POST", agent, headers: {
      ...headers, Expect: "100-continue", "Content-Length": Buffer.byteLength(body),
    } });
    const responseReady = once(pending, "response");
    const continued = once(pending, "continue");
    pending.flushHeaders();
    await continued;
    child.kill("SIGTERM");
    let closed = false;
    for (let i = 0; i < 100; i++) {
      closed = await new Promise((resolve) => {
        const socket = connect(3001, "127.0.0.1");
        socket.once("connect", () => { socket.destroy(); resolve(false); });
        socket.once("error", (err) => { socket.destroy(); resolve(err.code === "ECONNREFUSED"); });
      });
      if (closed) break;
      await delay(10);
    }
    assert.ok(closed, "server stopped accepting new connections");
    child.kill("SIGTERM");
    pending.end(body);
    const [finished] = await responseReady;
    assert.equal(finished.statusCode, 200, "accepted request completes during shutdown");
    finished.resume();
    await once(finished, "end");
    assert.deepEqual(await exited, [0, null]);
  } finally {
    agent.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});
