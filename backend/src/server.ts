import { createServer } from "node:http";
import { authenticate, logout, requireUser } from "./auth.js";
import { db } from "./db.js";
import { HttpError, send } from "./http.js";
import { todos } from "./todos.js";

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (req, res) => {
  try {
    const path = req.url?.split("?")[0];
    if (req.method === "POST" && path === "/api/auth/register") return await authenticate(req, res, true);
    if (req.method === "POST" && path === "/api/auth/login") return await authenticate(req, res, false);
    if (req.method === "POST" && path === "/api/auth/logout") return await logout(req, res);
    if (req.method === "GET" && path === "/api/me") return send(res, 200, await requireUser(req));

    const taskPath = path?.match(/^\/api\/todos(?:\/([0-9a-f-]{36}))?$/);
    if (taskPath) {
      const user = await requireUser(req);
      return await todos(req, res, user.id, taskPath[1]);
    }
    throw new HttpError(404, "Страница не найдена");
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message });
    console.error("Ошибка API", error instanceof Error ? error.name : "UnknownError");
    return send(res, 500, { error: "Ошибка сервера" });
  }
});

await db.$connect();
server.listen(port, "0.0.0.0", () => console.log("API запущен на порту " + port));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => void db.$disconnect()));
}
