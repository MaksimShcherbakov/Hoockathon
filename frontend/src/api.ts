export interface User {
  id: string
  email: string
}

export interface Task {
  id: string
  title: string
  description: string
  completed: boolean
  createdAt: string
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new ApiError('Не удалось связаться с сервером')
  }

  if (res.status === 204) return undefined as T

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : 'Произошла ошибка'
    throw new ApiError(message, res.status)
  }

  return body as T
}

export const api = {
  me: () => request<User>('/api/me'),
  register: (email: string, password: string) =>
    request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<User>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<void>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  listTodos: () => request<Task[]>('/api/todos'),
  createTodo: (title: string, description: string) =>
    request<Task>('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    }),
  updateTodo: (
    id: string,
    patch: Partial<Pick<Task, 'title' | 'description' | 'completed'>>,
  ) =>
    request<Task>(`/api/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTodo: (id: string) =>
    request<void>(`/api/todos/${id}`, { method: 'DELETE' }),
}
