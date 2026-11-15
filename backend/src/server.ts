import { PrismaPg } from "@prisma/adapter-pg";
import { createServer } from "node:http";
import { PrismaClient } from "./generated/client.js";
import { authenticate, currentUser, logout } from "./auth.js";
import { HttpError, send } from "./http.js";
import { tasks } from "./tasks.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }) });
const appPort = process.env.APP_PORT ?? "8080";
const allowedOrigins = new Set(
  ["localhost", "127.0.0.1"].map((host) => new URL(`http://${host}:${appPort}`).origin),
);

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const path = request.url?.split("?")[0] ?? "";
    const method = request.method;
    const origin = request.headers.origin;
    if (method !== "GET" && origin !== undefined && !allowedOrigins.has(origin)) {
      throw new HttpError(403, "Запрос с другого сайта отклонён");
    }

    if (method === "POST" && (path === "/api/register" || path === "/api/login")) {
      return await authenticate(db, request, response, path === "/api/register");
    }
    if (method === "POST" && path === "/api/logout") {
      return await logout(db, request, response);
    }
    if (path === "/api/me" && method === "GET") {
      const { email } = await currentUser(db, request);
      return send(response, 200, { email });
    }
    if (path === "/api/tasks" || path.startsWith("/api/tasks/")) {
      const { id } = await currentUser(db, request);
      return await tasks(db, request, response, path, id);
    }
    throw new HttpError(404, "Маршрут не найден");
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 413) response.setHeader("Connection", "close");
      return send(response, error.status, { error: error.message });
    }
    console.error("Ошибка обработки запроса", error instanceof Error ? error.name : "Unknown");
    send(response, 500, { error: "Ошибка сервера" });
  }
});

server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
