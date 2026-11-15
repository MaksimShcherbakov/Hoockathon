import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ApiError, type Task } from './api'

const TITLE_MAX = 120
const DESC_MAX = 2000

export default function TaskDialog({
  trigger,
  task,
  onSave,
}: {
  trigger: ReactNode
  task?: Task
  onSave: (values: { title: string; description: string }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '')
      setDescription(task?.description ?? '')
      setError(null)
    }
  }, [open, task])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('Введите заголовок')
      return
    }
    setBusy(true)
    try {
      await onSave({ title: title.trim(), description: description.trim() })
      setOpen(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-[#faf9f6] p-5 shadow-xl focus:outline-none">
          <Dialog.Title className="text-lg font-semibold text-slate-800">
            {task ? 'Редактировать задачу' : 'Новая задача'}
          </Dialog.Title>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Заголовок
              <input
                autoFocus
                maxLength={TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Описание
              <textarea
                rows={4}
                maxLength={DESC_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-200"
                >
                  Отмена
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white transition hover:bg-teal-800 disabled:opacity-60"
              >
                {busy ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
