import type { Page, Task, User } from "./types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const hasBody = options.body != null;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "Произошла ошибка. Попробуйте ещё раз.";
    throw new ApiError(res.status, message);
  }

  return data as T;
}

export function getMe(): Promise<User> {
  return request<User>("/me");
}

export function register(email: string, password: string): Promise<User> {
  return request<User>("/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string): Promise<User> {
  return request<User>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  return request<void>("/logout", { method: "POST" });
}

export function getTasks(
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
): Promise<Page<Task>> {
  return request<Page<Task>>(`/tasks?page=${page}&pageSize=${pageSize}`, {
    signal,
  });
}

export function createTask(title: string, description: string): Promise<Task> {
  return request<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify({ title, description }),
  });
}

export function updateTask(
  id: string,
  patch: Partial<Pick<Task, "title" | "description" | "completed">>,
): Promise<Task> {
  return request<Task>(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteTask(id: string): Promise<void> {
  return request<void>(`/tasks/${id}`, { method: "DELETE" });
}
