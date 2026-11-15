import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Task } from "../types";

interface Props {
  open: boolean;
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  restoreFocus: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteTaskDialog({
  open,
  task,
  onOpenChange,
  restoreFocus,
  onConfirm,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function handleConfirm() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      // On success the parent closes this dialog and reloads; a failed reload
      // surfaces separately and never marks the deletion as failed.
      await onConfirm();
    } catch (err) {
      // Keep the dialog open so the user can retry or cancel.
      setError(err instanceof Error ? err.message : "Не удалось удалить задачу.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          role="alertdialog"
          onOpenAutoFocus={(event) => {
            // Start on Cancel so a stray Enter never confirms destruction.
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
          className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
        >
          <Dialog.Title className="text-lg font-semibold">
            Удалить задачу?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-stone-600">
            Задача «<span className="wrap-anywhere font-medium text-stone-800">{task?.title}</span>» будет удалена без возможности восстановления.
          </Dialog.Description>

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close
              ref={cancelRef}
              disabled={busy}
              className="min-h-11 rounded-lg px-4 font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60"
            >
              Отмена
            </Dialog.Close>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConfirm()}
              className="min-h-11 rounded-lg bg-red-600 px-4 font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? "Удаление…" : "Удалить"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
