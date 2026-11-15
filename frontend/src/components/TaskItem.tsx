import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Task } from "../types";

interface Props {
  task: Task;
  onToggle: (task: Task) => Promise<void>;
  onEdit: (task: Task, trigger: HTMLButtonElement) => void;
  onDelete: (task: Task) => Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function TaskItem({ task, onToggle, onEdit, onDelete }: Props) {
  const [busy, setBusy] = useState(false);

  async function run(action: (task: Task) => Promise<void>) {
    setBusy(true);
    try {
      await action(task);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white p-2 sm:p-3">
      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={task.completed}
          disabled={busy}
          onChange={() => void run(onToggle)}
          aria-label={`Выполнена: ${task.title}`}
          className="size-5 accent-accent"
        />
      </label>

      <div className="min-w-0 flex-1 py-2">
        <p className={`wrap-anywhere font-medium ${task.completed ? "text-stone-600 line-through" : ""}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-stone-600">
            {task.description}
          </p>
        )}
        <time dateTime={task.createdAt} className="mt-1 block text-xs text-stone-600">
          {dateFormatter.format(new Date(task.createdAt))}
        </time>
      </div>

      <div className="flex shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={(event) => onEdit(task, event.currentTarget)}
          aria-label={`Редактировать: ${task.title}`}
          className="flex size-11 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-60"
        >
          <Pencil size={18} aria-hidden />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(onDelete)}
          aria-label={`Удалить: ${task.title}`}
          className="flex size-11 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-60"
        >
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
    </li>
  );
}
