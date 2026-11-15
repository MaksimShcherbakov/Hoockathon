import { useCallback, useEffect, useState } from "react";
import { ApiError, getMe, logout } from "./api";
import type { User } from "./types";
import AuthScreen from "./components/AuthScreen";
import TaskList from "./components/TaskList";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "anonymous" }
  | { status: "authenticated"; user: User };

export default function App() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getMe()
      .then((user) => {
        if (active) setState({ status: "authenticated", user });
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          setState({ status: "anonymous" });
        } else {
          setState({
            status: "error",
            message: "Не удалось связаться с сервером.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const endSession = useCallback(() => setState({ status: "anonymous" }), []);

  async function handleLogout() {
    await logout();
    endSession();
  }

  if (state.status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4">
        <p className="text-stone-500">Загрузка…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4">
        <p role="alert" className="text-red-700">
          {state.message}
        </p>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
          className="min-h-11 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover"
        >
          Повторить
        </button>
      </main>
    );
  }

  if (state.status === "authenticated") {
    return (
      <TaskList
        user={state.user}
        onLogout={handleLogout}
        onSessionExpired={endSession}
      />
    );
  }

  return (
    <AuthScreen onAuth={(user) => setState({ status: "authenticated", user })} />
  );
}
