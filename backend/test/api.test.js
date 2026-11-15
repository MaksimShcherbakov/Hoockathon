import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const base = process.env.TEST_BASE_URL ?? "http://localhost:8000";

function call(path, { method = "GET", data, cookie } = {}) {
  return fetch(base + "/api" + path, {
    method,
    headers: {
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(data),
  });
}

function session(response) {
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  return cookie.split(";")[0];
}

test("registration, login, task lifecycle and account isolation", async () => {
  const credentials = { email: randomUUID() + "@example.test", password: "test-password" };
  const register = "/auth/register";
  const login = "/auth/login";

  assert.equal((await call("/todos")).status, 401);
  assert.equal((await call(register, { method: "POST", data: { ...credentials, password: "short" } })).status, 400);
  const registered = await call(register, { method: "POST", data: credentials });
  assert.equal(registered.status, 201);
  const originalCookie = session(registered);
  const user = await registered.json();
  assert.deepEqual(await (await call("/me", { cookie: originalCookie })).json(), user);
  assert.equal((await call(register, { method: "POST", data: credentials })).status, 409);
  assert.equal((await call(login, { method: "POST", data: { ...credentials, password: "wrong-password" } })).status, 401);

  const loggedIn = await call(login, { method: "POST", data: credentials, cookie: originalCookie });
  assert.equal(loggedIn.status, 200);
  const cookie = session(loggedIn);
  assert.equal((await call("/me", { cookie: originalCookie })).status, 401);

  assert.equal((await call("/todos", { method: "POST", data: { title: " " }, cookie })).status, 400);
  const created = await call("/todos", {
    method: "POST", data: { title: "Первая задача", description: "Описание" }, cookie,
  });
  assert.equal(created.status, 201);
  const task = await created.json();
  assert.equal(task.title, "Первая задача");
  assert.equal(task.description, "Описание");
  assert.equal(task.completed, false);
  assert.ok(Number.isFinite(Date.parse(task.createdAt)));
  assert.deepEqual(await (await call("/todos", { cookie })).json(), [task]);

  const path = "/todos/" + task.id;
  const stranger = await call(register, {
    method: "POST", data: { ...credentials, email: randomUUID() + "@example.test" },
  });
  assert.equal(stranger.status, 201);
  const otherCookie = session(stranger);
  assert.deepEqual(await (await call("/todos", { cookie: otherCookie })).json(), []);
  assert.equal((await call(path, { method: "PATCH", data: { completed: true }, cookie: otherCookie })).status, 404);
  assert.equal((await call(path, { method: "DELETE", cookie: otherCookie })).status, 404);

  const updated = await call(path, { method: "PATCH", data: { title: "Обновлено", description: "", completed: true }, cookie });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { ...task, title: "Обновлено", description: "", completed: true });
  assert.equal((await call(path, { method: "DELETE", cookie })).status, 204);
  assert.deepEqual(await (await call("/todos", { cookie })).json(), []);
  assert.equal((await call("/auth/logout", { method: "POST", data: {}, cookie })).status, 204);
  assert.equal((await call("/me", { cookie })).status, 401);
});
