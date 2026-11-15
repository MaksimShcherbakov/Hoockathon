import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Load api.ts without a build step: transpile it in-process and import the
// emitted JS through a data: URL. The only runtime import in api.ts is the
// type-only `./types`, which transpileModule elides under isolatedModules.
const source = await readFile(
  fileURLToPath(new URL("../src/api.ts", import.meta.url)),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    isolatedModules: true,
  },
});
const api = await import(
  "data:text/javascript;charset=utf-8," + encodeURIComponent(outputText)
);

const VALID_TASK = {
  id: "t1",
  title: "Задача",
  description: "описание",
  createdAt: "2024-01-01T10:00:00.000Z",
  completed: false,
};

const VALID_PAGE = {
  items: [VALID_TASK],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function brokenJsonResponse(status) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  };
}

// Install a fetch stub for the duration of a single test and always restore it.
function withFetch(t, impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  t.after(() => {
    globalThis.fetch = original;
  });
}

function isApiError(err, status) {
  return err instanceof api.ApiError && err.status === status;
}

test("valid payloads resolve for each data endpoint", async (t) => {
  withFetch(t, async () => jsonResponse(200, { email: "user@example.com" }));
  assert.deepEqual(await api.getMe(), { email: "user@example.com" });
});

test("valid paginated tasks resolve", async (t) => {
  withFetch(t, async () => jsonResponse(200, VALID_PAGE));
  assert.deepEqual(await api.getTasks(1, 20), VALID_PAGE);
});

test("valid created task resolves", async (t) => {
  withFetch(t, async () => jsonResponse(201, VALID_TASK));
  assert.deepEqual(await api.createTask("Задача", "описание"), VALID_TASK);
});

test("null JSON body is rejected as malformed", async (t) => {
  withFetch(t, async () => jsonResponse(200, null));
  await assert.rejects(api.getMe(), (err) => isApiError(err, 200));
});

test("non-JSON body on a successful response is rejected", async (t) => {
  withFetch(t, async () => brokenJsonResponse(200));
  await assert.rejects(api.getMe(), (err) => isApiError(err, 200));
});

test("task with an unparseable date is rejected", async (t) => {
  withFetch(t, async () =>
    jsonResponse(200, { ...VALID_TASK, createdAt: "not-a-date" }),
  );
  await assert.rejects(api.createTask("Задача", ""), (err) =>
    isApiError(err, 200),
  );
});

test("incoherent page metadata is rejected", async (t) => {
  withFetch(t, async () =>
    // page beyond totalPages is incoherent.
    jsonResponse(200, { ...VALID_PAGE, page: 5, totalPages: 1 }),
  );
  await assert.rejects(api.getTasks(5, 20), (err) => isApiError(err, 200));
});

test("non-array page items are rejected", async (t) => {
  withFetch(t, async () => jsonResponse(200, { ...VALID_PAGE, items: null }));
  await assert.rejects(api.getTasks(1, 20), (err) => isApiError(err, 200));
});

test("page totals must describe the returned slice, including empty pages", async (t) => {
  let payload = { ...VALID_PAGE, items: [], total: 0 };
  withFetch(t, async () => jsonResponse(200, payload));
  assert.deepEqual(await api.getTasks(), payload);
  for (const invalid of [
    { ...VALID_PAGE, total: 0 },
    { ...VALID_PAGE, totalPages: 2 },
    { ...VALID_PAGE, items: [] },
    { ...VALID_PAGE, pageSize: 0 },
  ]) {
    payload = invalid;
    await assert.rejects(api.getTasks(), (err) => isApiError(err, 200));
  }
});

test("a data endpoint returning 204 is rejected", async (t) => {
  withFetch(t, async () => ({ status: 204, ok: true, json: async () => null }));
  await assert.rejects(api.getMe(), (err) => isApiError(err, 204));
});

test("a void endpoint returning 204 resolves to undefined", async (t) => {
  withFetch(t, async () => ({ status: 204, ok: true, json: async () => null }));
  assert.equal(await api.logout(), undefined);
  assert.equal(await api.deleteTask("t1"), undefined);
});

test("malformed error body keeps the 401 status with a generic message", async (t) => {
  withFetch(t, async () => brokenJsonResponse(401));
  await assert.rejects(api.getMe(), (err) => {
    assert.ok(isApiError(err, 401));
    assert.equal(err.message, "Произошла ошибка. Попробуйте ещё раз.");
    return true;
  });
});

test("error field that is not a nonempty string yields a generic message", async (t) => {
  withFetch(t, async () => jsonResponse(400, { error: "" }));
  await assert.rejects(api.getMe(), (err) => {
    assert.ok(isApiError(err, 400));
    assert.equal(err.message, "Произошла ошибка. Попробуйте ещё раз.");
    return true;
  });
});

test("a nonempty error string is surfaced to the caller", async (t) => {
  withFetch(t, async () => jsonResponse(400, { error: "Неверные данные" }));
  await assert.rejects(api.getMe(), (err) => {
    assert.ok(isApiError(err, 400));
    assert.equal(err.message, "Неверные данные");
    return true;
  });
});

test("abort rejections propagate to the caller", async (t) => {
  const controller = new AbortController();
  const reason = new DOMException("Aborted", "AbortError");
  withFetch(t, async (_url, init) => {
    assert.equal(init.signal, controller.signal);
    controller.abort(reason);
    throw init.signal.reason;
  });
  await assert.rejects(api.getTasks(1, 20, controller.signal), (err) => err === reason);
});
