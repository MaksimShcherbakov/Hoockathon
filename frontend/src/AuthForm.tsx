import { useState, type FormEvent } from 'react'
import { api, ApiError, type User } from './api'

export default function AuthForm({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (isRegister && password.length < 8) {
      setError('Пароль должен содержать не менее 8 символов')
      return
    }
    setBusy(true)
    try {
      const user = isRegister
        ? await api.register(email, password)
        : await api.login(email, password)
      onAuth(user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Произошла ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-slate-800">
        {isRegister ? 'Регистрация' : 'Вход'}
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Электронная почта
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Пароль
          <input
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30"
          />
          {isRegister && (
            <span className="text-xs font-normal text-slate-500">
              Минимум 8 символов
            </span>
          )}
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {busy ? 'Подождите…' : isRegister ? 'Зарегистрироваться' : 'Войти'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(isRegister ? 'login' : 'register')
          setError(null)
        }}
        className="mt-4 text-sm text-teal-700 hover:underline"
      >
        {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
      </button>
    </div>
  )
}
