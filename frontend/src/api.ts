import type { Page, Task, User } from "./types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const GENERIC_ERROR = "Произошла ошибка. Попробуйте ещё раз.";

type Guard<T> = (data: unknown) => data is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isUser(data: unknown): data is User {
  return isRecord(data) && isNonEmptyString(data.email);
}

function isTask(data: unknown): data is Task {
  return (
    isRecord(data) &&
    isNonEmptyString(data.id) &&
    typeof data.title === "string" &&
    typeof data.description === "string" &&
    typeof data.completed === "boolean" &&
    typeof data.createdAt === "string" &&
    // Reject timestamps the UI cannot format; Date.parse yields NaN otherwise.
    Number.isFinite(Date.parse(data.createdAt))
  );
}

function isTaskPage(data: unknown): data is Page<Task> {
  if (!isRecord(data)) return false;
  const { items, page, pageSize, total, totalPages } = data;
  if (!Array.isArray(items) || !items.every(isTask)) return false;
  if (
    !isSafeCount(page) ||
    !isSafeCount(pageSize) ||
    !isSafeCount(total) ||
    !isSafeCount(totalPages)
  ) {
    return false;
  }
  // Metadata must be internally coherent with the returned slice.
  return (
    page >= 1 &&
    pageSize >= 1 &&
    total >= 0 &&
    totalPages === Math.max(1, Math.ceil(total / pageSize)) &&
    page <= totalPages &&
    items.length === Math.min(pageSize, total - (page - 1) * pageSize)
  );
}

function doFetch(path: string, options: RequestInit): Promise<Response> {
  const hasBody = options.body != null;
  return fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toApiError(status: number, data: unknown): ApiError {
  const message =
    isRecord(data) && isNonEmptyString(data.error) ? data.error : GENERIC_ERROR;
  return new ApiError(status, message);
}

// Endpoints that return a JSON payload. A 204 here means the server omitted the
// body the caller depends on, so it is treated as a malformed response.
async function request<T>(
  path: string,
  guard: Guard<T>,
  options: RequestInit = {},
): Promise<T> {
  const res = await doFetch(path, options);
  if (res.status === 204) {
    throw new ApiError(res.status, GENERIC_ERROR);
  }
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res.status, data);
  }
  if (!guard(data)) {
    throw new ApiError(res.status, GENERIC_ERROR);
  }
  return data;
}

// No-content endpoints: a 204 is the expected success; any other outcome still
// surfaces server errors but the body is irrelevant.
async function requestVoid(
  path: string,
  options: RequestInit = {},
): Promise<void> {
  const res = await doFetch(path, options);
  if (res.status === 204) return;
  if (!res.ok) {
    throw toApiError(res.status, await readJson(res));
  }
}

export function getMe(): Promise<User> {
  return request("/me", isUser);
}

export function register(email: string, password: string): Promise<User> {
  return request("/register", isUser, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string): Promise<User> {
  return request("/login", isUser, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  return requestVoid("/logout", { method: "POST" });
}

export function getTasks(
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Page<Task>> {
  return request(`/tasks?page=${page}&pageSize=${pageSize}`, isTaskPage, {
    signal,
  });
}

export function createTask(title: string, description: string): Promise<Task> {
  return request("/tasks", isTask, {
    method: "POST",
    body: JSON.stringify({ title, description }),
  });
}

export function updateTask(
  id: string,
  patch: Partial<Pick<Task, "title" | "description" | "completed">>,
): Promise<Task> {
  return request(`/tasks/${id}`, isTask, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteTask(id: string): Promise<void> {
  return requestVoid(`/tasks/${id}`, { method: "DELETE" });
}
