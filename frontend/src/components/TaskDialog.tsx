import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Task } from "../types";

interface Props {
  open: boolean;
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  restoreFocus: () => void;
  onSubmit: (values: { title: string; description: string }) => Promise<void>;
}

export default function TaskDialog({
  open,
  task,
  onOpenChange,
  restoreFocus,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      setError(null);
    }
  }, [open, task]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > 120) {
      setError("Название должно содержать от 1 до 120 символов.");
      return;
    }
    if (description.length > 2000) {
      setError("Описание не должно превышать 2000 символов.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await onSubmit({ title: trimmedTitle, description });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
          className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              {task ? "Редактировать задачу" : "Новая задача"}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Закрыть"
              disabled={busy}
              className="flex size-11 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"
            >
              <X size={20} aria-hidden />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Название
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-11 rounded-lg border border-stone-300 px-3 text-base"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Описание
              <textarea
                maxLength={2000}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2 text-base"
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Dialog.Close disabled={busy} className="min-h-11 rounded-lg px-4 font-medium text-stone-700 hover:bg-stone-100">
                Отмена
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy}
                className="min-h-11 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {busy ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
