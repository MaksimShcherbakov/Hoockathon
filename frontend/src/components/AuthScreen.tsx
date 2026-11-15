import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode() {
    setMode(mode === "login" ? "register" : "login");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    // Inline checks replace the browser's native constraint bubbles; they mirror
    // the field attributes and the backend stays the authority on the result.
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Укажите адрес эл. почты.");
      return;
    }
    if (trimmedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Введите корректный адрес эл. почты.");
      return;
    }
    if (!password) {
      setError("Укажите пароль.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError("Пароль должен содержать от 8 до 128 символов.");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    setBusy(true);
    try {
      const user =
        mode === "register"
          ? await register(trimmedEmail, password)
          : await login(trimmedEmail, password);
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

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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

        <div className="flex flex-col gap-1 text-sm font-medium">
          <label htmlFor="password">Пароль</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
              disabled={busy}
              minLength={mode === "register" ? 8 : undefined}
              maxLength={128}
              aria-describedby={mode === "register" ? "password-hint" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white pl-3 pr-12 text-base"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center text-stone-500 disabled:opacity-60"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-5" />
              ) : (
                <Eye aria-hidden="true" className="size-5" />
              )}
            </button>
          </div>
          {mode === "register" && (
            <span id="password-hint" className="text-xs font-normal text-stone-500">
              От 8 до 128 символов.
            </span>
          )}
        </div>

        {mode === "register" && (
          <div className="flex flex-col gap-1 text-sm font-medium">
            <label htmlFor="confirmPassword">Повторите пароль</label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                autoComplete="new-password"
                required
                disabled={busy}
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-stone-300 bg-white pl-3 pr-12 text-base"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={
                  showConfirmPassword
                    ? "Скрыть подтверждение пароля"
                    : "Показать подтверждение пароля"
                }
                className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center text-stone-500 disabled:opacity-60"
              >
                {showConfirmPassword ? (
                  <EyeOff aria-hidden="true" className="size-5" />
                ) : (
                  <Eye aria-hidden="true" className="size-5" />
                )}
              </button>
            </div>
          </div>
        )}

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
        onClick={switchMode}
        className="mt-4 min-h-11 text-sm text-accent underline-offset-2 hover:underline"
      >
        {mode === "login"
          ? "Нет аккаунта? Зарегистрироваться"
          : "Уже есть аккаунт? Войти"}
      </button>
    </main>
  );
}
