import { useState, type FormEvent } from "react";
import { ApiError, login, register } from "../api";
import type { User } from "../types";

type Mode = "login" | "register";

interface Props {
  onAuth: (user: User) => void;
}

export default function AuthScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === "register" && password.length < 8) {
      setError("Пароль должен содержать не менее 8 символов.");
      return;
    }

    setBusy(true);
    try {
      const user =
        mode === "register"
          ? await register(email, password)
          : await login(email, password);
      onAuth(user);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Не удалось выполнить запрос. Проверьте соединение.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">
        {mode === "login" ? "Вход" : "Регистрация"}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Эл. почта
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            disabled={busy}
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Пароль
          <input
            type="password"
            name="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            required
            disabled={busy}
            minLength={mode === "register" ? 8 : undefined}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-base"
          />
          {mode === "register" && (
            <span className="text-xs font-normal text-stone-500">
              От 8 до 128 символов.
            </span>
          )}
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>
      </form>

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        className="mt-4 min-h-11 text-sm text-accent underline-offset-2 hover:underline"
      >
        {mode === "login"
          ? "Нет аккаунта? Зарегистрироваться"
          : "Уже есть аккаунт? Войти"}
      </button>
    </main>
  );
}
