import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ApiError } from './api'

export default function DeleteDialog({
  trigger,
  title,
  onConfirm,
}: {
  trigger: ReactNode
  title: string
  onConfirm: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setError(null)
    setBusy(true)
    try {
      await onConfirm()
      setOpen(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) setError(null)
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[#faf9f6] p-5 shadow-xl focus:outline-none">
          <Dialog.Title className="text-lg font-semibold text-slate-800">
            Удалить задачу?
          </Dialog.Title>
          <Dialog.Description className="mt-2 break-words text-sm text-slate-600">
            Задача «{title}» будет удалена без возможности восстановления.
          </Dialog.Description>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-200"
              >
                Отмена
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? 'Удаление…' : 'Удалить'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
