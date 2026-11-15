import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/client.js";

const base = "http://127.0.0.1:3000/api";

function request(path, { method = "GET", body, rawBody, cookie, origin, headers: extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(base + path, { method, headers, body: rawBody ?? JSON.stringify(body) });
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
    assert.deepEqual((await (await request("/tasks", { cookie })).json()).items, [task]);
    assert.deepEqual((await (await request("/tasks", { cookie: otherCookie })).json()).items, []);
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
    assert.deepEqual((await (await request("/tasks", { cookie: newCookie })).json()).items, [{ ...task, ...changes }]);
    assert.equal((await request(path, { method: "DELETE", cookie: newCookie })).status, 204);
    assert.deepEqual((await (await request("/tasks", { cookie: newCookie })).json()).items, []);
  } finally {
    try {
      await db.user.deleteMany({ where: { email: { in: [primary.email, other.email] } } });
    } finally {
      await db.$disconnect();
    }
  }
});

test("task pagination is bounded, stable, owner-scoped and clamps pages after deletion", async () => {
  const primary = { email: randomUUID() + "@example.test", password: "test-password" };
  const other = { email: randomUUID() + "@example.test", password: "test-password" };
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  try {
    const registered = await request("/register", { method: "POST", body: primary });
    assert.equal(registered.status, 201);
    const cookie = sessionCookie(registered);
    const otherRegistered = await request("/register", { method: "POST", body: other });
    assert.equal(otherRegistered.status, 201);
    const otherCookie = sessionCookie(otherRegistered);
    const empty = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 };
    assert.deepEqual(await (await request("/tasks?page=99", { cookie })).json(), empty);

    const user = await db.user.findUniqueOrThrow({ where: { email: primary.email } });
    const otherUser = await db.user.findUniqueOrThrow({ where: { email: other.email } });
    const rows = Array.from({ length: 45 }, (_, index) => ({
      id: randomUUID(), userId: user.id, title: `Task ${index}`, description: "",
      completed: false, createdAt: new Date(index % 2 ? "2026-01-02T00:00:00Z" : "2026-01-01T00:00:00Z"),
    }));
    await db.task.createMany({ data: rows });
    await db.task.create({ data: { userId: otherUser.id, title: "Private task" } });
    const expected = [...rows].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
      .map(({ userId, createdAt, ...task }) => ({ ...task, createdAt: createdAt.toISOString() }));

    async function getPage(query = "", session = cookie) {
      const response = await request("/tasks" + query, { cookie: session });
      assert.equal(response.status, 200);
      return response.json();
    }

    const pages = [await getPage(), await getPage("?page=2"), await getPage("?page=3")];
    for (let index = 0; index < pages.length; index++) {
      assert.deepEqual(pages[index], {
        items: expected.slice(index * 20, (index + 1) * 20),
        page: index + 1, pageSize: 20, total: 45, totalPages: 3,
      });
    }
    assert.equal(new Set(pages.flatMap((page) => page.items.map((task) => task.id))).size, 45);
    assert.deepEqual(await getPage("?page=2"), pages[1]);
    assert.deepEqual(await getPage("?page=9007199254740991"), pages[2]);
    assert.deepEqual(await getPage("?pageSize=100"), {
      items: expected, page: 1, pageSize: 100, total: 45, totalPages: 1,
    });
    assert.deepEqual(await getPage("?page=2&pageSize=1"), {
      items: expected.slice(1, 2), page: 2, pageSize: 1, total: 45, totalPages: 45,
    });
    assert.deepEqual(await getPage(`?userId=${otherUser.id}`), pages[0]);
    const privatePage = await getPage("", otherCookie);
    assert.equal(privatePage.total, 1);
    assert.equal(privatePage.items[0].title, "Private task");

    for (const query of [
      "page=0", "page=-1", "page=1.5", "page=1e3", "page=abc", "page=", "page=%20", "page=01",
      "page=9007199254740992", "page=1&page=2", "pageSize=0", "pageSize=-1", "pageSize=101",
      "pageSize=abc", "pageSize=1.5", "pageSize=", "pageSize=20&pageSize=20",
    ]) {
      const response = await request("/tasks?" + query, { cookie });
      assert.equal(response.status, 400, query);
      assert.equal(typeof (await response.json()).error, "string");
    }
    assert.equal((await request("/tasks?page=2")).status, 401);

    const created = await request("/tasks", { method: "POST", cookie, body: { title: "Newest task" } });
    assert.equal(created.status, 201);
    const newTask = await created.json();
    const firstPage = await getPage();
    assert.equal(firstPage.total, 46);
    assert.equal(firstPage.items.length, 20);
    assert.equal(firstPage.items[0].id, newTask.id);
    assert.equal((await request("/tasks/" + newTask.id, { method: "DELETE", cookie })).status, 204);

    for (const task of pages[2].items) {
      assert.equal((await request("/tasks/" + task.id, { method: "DELETE", cookie })).status, 204);
    }
    assert.deepEqual(await getPage("?page=3"), {
      items: expected.slice(20, 40), page: 2, pageSize: 20, total: 40, totalPages: 2,
    });
    await db.task.deleteMany({ where: { userId: user.id } });
    assert.deepEqual(await getPage("?page=3"), empty);
  } finally {
    try {
      await db.user.deleteMany({ where: { email: { in: [primary.email, other.email] } } });
    } finally {
      await db.$disconnect();
    }
  }
});

test("invalid input is rejected without changing stored tasks; expired sessions are denied", async () => {
  const account = { email: randomUUID() + "@example.test", password: "test-password" };
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  async function expectError(response, status) {
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, "string");
  }

  try {
    for (const route of ["/register", "/login"]) {
      for (const email of ["bad", "a\0b@example.test", "a\u0001b@example.test"]) {
        await expectError(await request(route, { method: "POST", body: { ...account, email } }), 400);
      }
    }
    const registered = await request("/register", { method: "POST", body: account });
    assert.equal(registered.status, 201);
    const cookie = sessionCookie(registered);
    const headers = { "Content-Type": "application/json" };
    for (const rawBody of ["{", "null", "[]", '"text"']) {
      await expectError(await request("/tasks", { method: "POST", cookie, rawBody, headers }), 400);
    }
    await expectError(await request("/tasks", { method: "POST", cookie, rawBody: "{}" }), 415);
    await expectError(await request("/tasks", { method: "POST", cookie, body: { title: "x".repeat(33000) } }), 413);
    for (const body of [
      { title: "a\0b" }, { title: "valid", description: "a\0b" },
      { title: 1 }, { title: "" }, { title: "x".repeat(121) },
      { title: "valid", description: null }, { title: "valid", description: "x".repeat(2001) },
    ]) {
      await expectError(await request("/tasks", { method: "POST", cookie, body }), 400);
    }
    assert.deepEqual((await (await request("/tasks", { cookie })).json()).items, []);
    const created = await request("/tasks", {
      method: "POST", cookie, body: { title: "x".repeat(120), description: "я".repeat(2000) },
    });
    assert.equal(created.status, 201);
    const task = await created.json();
    for (const body of [{}, { completed: "true" }, { title: "a\0b" }, { description: "a\0b", completed: true }]) {
      await expectError(await request("/tasks/" + task.id, { method: "PATCH", cookie, body }), 400);
    }
    assert.deepEqual((await (await request("/tasks", { cookie })).json()).items, [task]);
    await expectError(await request("/tasks/not-a-uuid", { method: "DELETE", cookie }), 404);
    const tokenHash = createHash("sha256").update(cookie.slice("session=".length)).digest("hex");
    await db.session.update({ where: { tokenHash }, data: { expiresAt: new Date(0) } });
    await expectError(await request("/me", { cookie }), 401);
    await expectError(await request("/tasks", { cookie }), 401);
    await expectError(await request("/tasks/" + task.id, { method: "PATCH", cookie, body: { completed: true } }), 401);
  } finally {
    try {
      await db.user.deleteMany({ where: { email: account.email } });
    } finally {
      await db.$disconnect();
    }
  }
});
