import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Task, type User } from './api'
import AuthForm from './AuthForm'
import TaskDialog from './TaskDialog'
import DeleteDialog from './DeleteDialog'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const checkSession = useCallback(() => {
    setAuthError(null)
    setAuthChecked(false)
    api
      .me()
      .then(setUser)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) setUser(null)
        else setAuthError('Не удалось проверить вход')
      })
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(checkSession, [checkSession])

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Загрузка…
      </div>
    )
  }

  if (authError) {
    return (
      <main className="mx-auto max-w-sm px-4 py-10">
        <p role="alert" className="text-red-700">{authError}</p>
        <button type="button" onClick={checkSession} className="mt-3 text-teal-800 underline">
          Повторить
        </button>
      </main>
    )
  }

  if (!user) return <AuthForm onAuth={setUser} />

  return <TodoApp user={user} onLogout={() => setUser(null)} />
}

function TodoApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      setTasks(await api.listTodos())
      setStatus('ready')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить задачи')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function create(values: { title: string; description: string }) {
    const task = await api.createTodo(values.title, values.description)
    setTasks((prev) => [task, ...prev])
  }

  async function update(
    id: string,
    patch: Partial<Pick<Task, 'title' | 'description' | 'completed'>>,
  ) {
    const task = await api.updateTodo(id, patch)
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)))
  }

  async function remove(id: string) {
    await api.deleteTodo(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  async function logout() {
    setLogoutError(null)
    setLoggingOut(true)
    try {
      await api.logout()
      onLogout()
    } catch (err) {
      setLogoutError(err instanceof ApiError ? err.message : 'Не удалось выйти')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">Мои задачи</h1>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-60"
          >
            Выйти
          </button>
        </div>
      </header>
      {logoutError && <p role="alert" className="mb-4 text-sm text-red-700">{logoutError}</p>}

      <div className="mb-6">
        <TaskDialog
          onSave={create}
          trigger={
            <button
              type="button"
              disabled={status !== 'ready'}
              className="w-full rounded-lg bg-teal-700 px-4 py-2.5 font-medium text-white transition hover:bg-teal-800 disabled:opacity-60 sm:w-auto"
            >
              + Новая задача
            </button>
          }
        />
      </div>

      {status === 'loading' && <p className="text-slate-500">Загрузка задач…</p>}

      {status === 'error' && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 font-medium text-red-700 underline"
          >
            Повторить
          </button>
        </div>
      )}

      {status === 'ready' && tasks.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Пока нет задач. Создайте первую.
        </p>
      )}

      {status === 'ready' && tasks.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onUpdate={update} onDelete={remove} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskRow({
  task,
  onUpdate,
  onDelete,
}: {
  task: Task
  onUpdate: (
    id: string,
    patch: Partial<Pick<Task, 'title' | 'description' | 'completed'>>,
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)

  async function toggle() {
    setToggleError(null)
    setToggling(true)
    try {
      await onUpdate(task.id, { completed: !task.completed })
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : 'Не удалось обновить')
    } finally {
      setToggling(false)
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.completed}
          disabled={toggling}
          onChange={toggle}
          aria-label={`Отметить «${task.title}» как ${task.completed ? 'невыполненную' : 'выполненную'}`}
          className="mt-1 h-5 w-5 shrink-0 accent-teal-700"
        />
        <div className="min-w-0 flex-1">
          <h2
            className={`font-medium break-words ${
              task.completed ? 'text-slate-600 line-through' : 'text-slate-800'
            }`}
          >
            {task.title}
          </h2>
          {task.description && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
              {task.description}
            </p>
          )}
          <time dateTime={task.createdAt} className="mt-2 block text-xs text-slate-500">
            {formatDate(task.createdAt)}
          </time>
          {toggleError && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {toggleError}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <TaskDialog
            task={task}
            onSave={(values) => onUpdate(task.id, values)}
            trigger={
              <button
                type="button"
                aria-label="Редактировать"
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                Изм.
              </button>
            }
          />
          <DeleteDialog
            title={task.title}
            onConfirm={() => onDelete(task.id)}
            trigger={
              <button
                type="button"
                aria-label="Удалить"
                className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
              >
                Удал.
              </button>
            }
          />
        </div>
      </div>
    </li>
  )
}
