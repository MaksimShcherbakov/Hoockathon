import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ApiError, createTask, deleteTask, getTasks, updateTask } from "../api";
import type { Task, User } from "../types";
import TaskItem from "./TaskItem";
import TaskDialog from "./TaskDialog";

interface Props {
  user: User;
  onLogout: () => Promise<void>;
  onSessionExpired: () => void;
}

export default function TaskList({ user, onLogout, onSessionExpired }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    getTasks()
      .then((data) => {
        if (active) setTasks(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
        else setError("Не удалось загрузить задачи.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onSessionExpired]);

  function openEditor(task: Task | null, trigger: HTMLButtonElement) {
    dialogTrigger.current = trigger;
    setEditing(task);
    setDialogOpen(true);
  }

  async function handleSubmit(values: { title: string; description: string }) {
    try {
      if (editing) {
        const updated = await updateTask(editing.id, values);
        setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)));
      } else {
        const created = await createTask(values.title, values.description);
        setTasks((prev) => [created, ...prev]);
      }
      setDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      else throw err;
    }
  }

  function showError(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) onSessionExpired();
    else setError(err instanceof ApiError ? err.message : fallback);
  }

  async function handleToggle(task: Task) {
    setError(null);
    try {
      const updated = await updateTask(task.id, { completed: !task.completed });
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      showError(err, "Не удалось обновить задачу.");
    }
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    setError(null);
    try {
      await deleteTask(task.id);
      setTasks((prev) => prev.filter((item) => item.id !== task.id));
    } catch (err) {
      showError(err, "Не удалось удалить задачу.");
    }
  }

  async function handleLogout() {
    setError(null);
    setLoggingOut(true);
    try {
      await onLogout();
    } catch {
      setError("Не удалось выйти. Попробуйте ещё раз.");
      setLoggingOut(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Мои задачи</h1>
          <p className="mt-1 truncate text-sm text-stone-600" title={user.email}>{user.email}</p>
        </div>
        <button
          type="button"
          disabled={loggingOut}
          onClick={handleLogout}
          className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60"
        >
          Выйти
        </button>
      </header>

      <button
        type="button"
        disabled={loading}
        onClick={(event) => openEditor(null, event.currentTarget)}
        className="mb-6 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        <Plus size={18} aria-hidden />
        Добавить задачу
      </button>

      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-stone-600" role="status">Загрузка…</p>
      ) : tasks.length === 0 ? (
        !error && <p className="text-stone-600">Задач пока нет. Добавьте первую.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onEdit={openEditor}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      <TaskDialog
        open={dialogOpen}
        task={editing}
        onOpenChange={setDialogOpen}
        restoreFocus={() => dialogTrigger.current?.focus()}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
