import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/client.js";

const base = "http://127.0.0.1:3000/api";

function request(path, { method = "GET", body, cookie, origin } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(base + path, { method, headers, body: JSON.stringify(body) });
}

function sessionCookie(response) {
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict;/);
  return cookie.split(";")[0];
}

test("accounts, sessions and task lifecycle with owner isolation", async () => {
  const primary = { email: randomUUID() + "@example.test", password: "test-password" };
  const other = { email: randomUUID() + "@example.test", password: "test-password" };
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  try {
    assert.equal((await request("/tasks")).status, 401);
    assert.equal((await request("/register", { method: "POST", body: primary, origin: "http://other.test" })).status, 403);
    const origin = new URL("http://localhost:" + (process.env.APP_PORT ?? "8080")).origin;
    const registered = await request("/register", { method: "POST", body: primary, origin });
    assert.equal(registered.status, 201);
    assert.deepEqual(await registered.json(), { email: primary.email });
    const cookie = sessionCookie(registered);
    assert.equal((await request("/register", { method: "POST", body: primary })).status, 409);
    assert.equal((await request("/login", { method: "POST", body: { ...primary, password: "wrong-password" } })).status, 401);
    assert.deepEqual(await (await request("/me", { cookie })).json(), { email: primary.email });
    const otherRegistered = await request("/register", { method: "POST", body: other });
    assert.equal(otherRegistered.status, 201);
    const otherCookie = sessionCookie(otherRegistered);

    assert.equal((await request("/tasks", { method: "POST", cookie, body: { title: " " } })).status, 400);
    const created = await request("/tasks", { method: "POST", cookie, body: { title: " Купить чай ", description: "Зелёный" } });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.title, "Купить чай");
    assert.equal(task.description, "Зелёный");
    assert.equal(task.completed, false);
    assert.ok(Number.isFinite(Date.parse(task.createdAt)));
    assert.deepEqual(await (await request("/tasks", { cookie })).json(), [task]);
    assert.deepEqual(await (await request("/tasks", { cookie: otherCookie })).json(), []);
    const path = "/tasks/" + task.id;
    assert.equal((await request(path, { method: "PATCH", cookie: otherCookie, body: { completed: true } })).status, 404);
    assert.equal((await request(path, { method: "DELETE", cookie: otherCookie })).status, 404);

    const changes = { title: "Купить кофе", description: "", completed: true };
    const updated = await request(path, { method: "PATCH", cookie, body: changes });
    assert.equal(updated.status, 200);
    assert.deepEqual(await updated.json(), { ...task, ...changes });
    assert.equal((await request("/logout", { method: "POST", cookie })).status, 204);
    assert.equal((await request("/me", { cookie })).status, 401);

    const login = await request("/login", { method: "POST", body: primary });
    assert.equal(login.status, 200);
    const newCookie = sessionCookie(login);
    assert.deepEqual(await (await request("/tasks", { cookie: newCookie })).json(), [{ ...task, ...changes }]);
    assert.equal((await request(path, { method: "DELETE", cookie: newCookie })).status, 204);
    assert.deepEqual(await (await request("/tasks", { cookie: newCookie })).json(), []);
  } finally {
    try {
      await db.user.deleteMany({ where: { email: { in: [primary.email, other.email] } } });
    } finally {
      await db.$disconnect();
    }
  }
});
