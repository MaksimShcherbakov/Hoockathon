import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ApiError, createTask, deleteTask, getTasks, updateTask } from "../api";
import type { Task, User } from "../types";
import TaskItem from "./TaskItem";
import TaskDialog from "./TaskDialog";
import DeleteTaskDialog from "./DeleteTaskDialog";

interface Props {
  user: User;
  onLogout: () => Promise<void>;
  onSessionExpired: () => void;
}

const PAGE_SIZE = 20;

// The single modal that may be open. `edit` with a null task is the create flow.
type ActiveModal =
  | { kind: "none" }
  | { kind: "edit"; task: Task | null }
  | { kind: "delete"; task: Task };

export default function TaskList({ user, onLogout, onSessionExpired }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ActiveModal>({ kind: "none" });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const actionsDisabled = loading || loadFailed || mutating || loggingOut;

  const closeModal = useCallback(() => setModal({ kind: "none" }), []);

  // Return focus to the control that opened the modal when it is still in the
  // document and usable; otherwise its row/trigger is gone or disabled during a
  // reload, so fall back to the heading to keep focus in the document.
  const restoreFocus = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger && trigger.isConnected && !trigger.disabled) trigger.focus();
    else headingRef.current?.focus();
  }, []);

  // Cancel stale loads; remember the target so retry reloads the failed page.
  const loadPage = useCallback(
    (target: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPage(target);
      setLoading(true);
      setLoadFailed(false);
      setError(null);
      getTasks(target, PAGE_SIZE, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          setTasks(data.items);
          setPage(data.page);
          setTotalPages(data.totalPages);
          setTotal(data.total);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (err instanceof ApiError && err.status === 401) onSessionExpired();
          else setLoadFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    },
    [onSessionExpired],
  );

  useEffect(() => {
    loadPage(1);
    return () => abortRef.current?.abort();
  }, [loadPage]);

  function openEditor(task: Task | null, trigger: HTMLButtonElement) {
    if (actionsDisabled) return;
    triggerRef.current = trigger;
    setModal({ kind: "edit", task });
  }

  async function handleSubmit(values: { title: string; description: string }) {
    if (loggingOut) return;
    const editing = modal.kind === "edit" ? modal.task : null;
    try {
      if (editing) {
        // Update in place: stay on the current page.
        const updated = await updateTask(editing.id, values);
        setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)));
        closeModal();
      } else {
        await createTask(values.title, values.description);
        // Mutation succeeded: close the dialog first, then refresh. A failed
        // reload surfaces independently and never marks the save as failed.
        closeModal();
        loadPage(1);
      }
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
    if (actionsDisabled) return;
    setError(null);
    setMutating(true);
    try {
      const updated = await updateTask(task.id, { completed: !task.completed });
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      showError(err, "Не удалось обновить задачу.");
    } finally {
      setMutating(false);
    }
  }

  // Opening the confirmation does not touch the row's busy state or send any
  // request; the DELETE only fires once the user confirms.
  function openDelete(task: Task, trigger: HTMLButtonElement) {
    if (actionsDisabled) return;
    triggerRef.current = trigger;
    setModal({ kind: "delete", task });
  }

  async function confirmDelete() {
    const task = modal.kind === "delete" ? modal.task : null;
    if (!task) return;
    setError(null);
    setMutating(true);
    try {
      await deleteTask(task.id);
    } catch (err) {
      // 401 defers to the shared session handling; other failures bubble up so
      // the dialog stays open with an inline error and the user can retry.
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      throw err;
    } finally {
      setMutating(false);
    }
    // Deletion succeeded: close first, then refresh the current page. The
    // backend clamps if the last row is gone, and a failed reload surfaces
    // independently without resending the deletion or faking a delete failure.
    closeModal();
    loadPage(page);
  }

  async function handleLogout() {
    if (loading || mutating || loggingOut) return;
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
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">Мои задачи</h1>
          <p className="mt-1 truncate text-sm text-stone-600" title={user.email}>{user.email}</p>
        </div>
        <button
          type="button"
          disabled={loading || loggingOut || mutating}
          onClick={handleLogout}
          className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60"
        >
          Выйти
        </button>
      </header>

      <button
        type="button"
        disabled={actionsDisabled}
        onClick={(event) => openEditor(null, event.currentTarget)}
        className="mb-6 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        <Plus size={18} aria-hidden />
        Добавить задачу
      </button>

      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}

      {total > 0 ? (
        // Once a page has loaded, keep the list and nav mounted across reloads
        // so keyboard focus is not lost on every navigation. Controls lock while
        // a load, mutation, logout or failed reload is outstanding.
        <>
          <ul className="flex flex-col gap-2" aria-busy={loading}>
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                disabled={actionsDisabled}
                onToggle={handleToggle}
                onEdit={openEditor}
                onDelete={openDelete}
              />
            ))}
          </ul>

          <nav
            aria-label="Навигация по страницам"
            className="mt-6 flex items-center justify-between gap-3"
          >
            <button
              type="button"
              disabled={actionsDisabled || page <= 1}
              onClick={() => loadPage(page - 1)}
              className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60"
            >
              <ChevronLeft size={18} aria-hidden />
              Назад
            </button>

            <p className="text-sm text-stone-600" role="status" aria-live="polite">
              {loading
                ? "Обновление…"
                : loadFailed
                  ? "Не удалось обновить список."
                  : `Страница ${page} из ${totalPages} · всего ${total}`}
            </p>

            <button
              type="button"
              disabled={actionsDisabled || page >= totalPages}
              onClick={() => loadPage(page + 1)}
              className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60"
            >
              Вперёд
              <ChevronRight size={18} aria-hidden />
            </button>
          </nav>

          {loadFailed && (
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => loadPage(page)}
              className="mt-3 min-h-11 rounded-lg px-4 font-medium text-accent hover:bg-stone-100"
            >
              Повторить
            </button>
          )}
        </>
      ) : loading ? (
        <p className="text-stone-600" role="status">Загрузка…</p>
      ) : loadFailed ? (
        <div>
          <p role="alert" className="mb-2 text-sm text-red-700">Не удалось загрузить задачи.</p>
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => loadPage(page)}
            className="min-h-11 rounded-lg px-4 font-medium text-accent hover:bg-stone-100"
          >
            Повторить
          </button>
        </div>
      ) : (
        !error && <p className="text-stone-600">Задач пока нет. Добавьте первую.</p>
      )}

      {/* Both dialogs stay mounted so Radix runs its closing/focus lifecycle. */}
      <TaskDialog
        open={modal.kind === "edit"}
        task={modal.kind === "edit" ? modal.task : null}
        onOpenChange={(next) => {
          if (!next) closeModal();
        }}
        restoreFocus={restoreFocus}
        onSubmit={handleSubmit}
      />

      <DeleteTaskDialog
        open={modal.kind === "delete"}
        task={modal.kind === "delete" ? modal.task : null}
        onOpenChange={(next) => {
          if (!next) closeModal();
        }}
        restoreFocus={restoreFocus}
        onConfirm={confirmDelete}
      />
    </main>
  );
}
