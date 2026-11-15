import { Prisma, type PrismaClient } from "./generated/client.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, readJson, send } from "./http.js";

const taskFields = { id: true, title: true, description: true, createdAt: true, completed: true } as const;
const taskPath = /^\/api\/tasks\/([a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i;

function pageParameter(params: URLSearchParams, name: string, fallback: number, max: number): number {
  const values = params.getAll(name);
  if (!values.length) return fallback;
  const value = Number(values[0]);
  if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0]) || !Number.isSafeInteger(value) || value > max) {
    throw new HttpError(400, `Некорректный параметр ${name}`);
  }
  return value;
}

function taskText(value: unknown, limit: number, required: boolean): string {
  const label = required ? "Название" : "Описание";
  if (typeof value !== "string") throw new HttpError(400, label + " должно быть текстом");
  const text = value.trim();
  if (text.includes("\0")) throw new HttpError(400, label + " содержит недопустимый символ");
  if (required && !text) throw new HttpError(400, "Введите название задачи");
  if (text.length > limit) throw new HttpError(400, `${label}: максимум ${limit} символов`);
  return text;
}

export async function tasks(
  db: PrismaClient,
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  userId: string,
) {
  if (path === "/api/tasks" && request.method === "GET") {
    const params = new URL(request.url ?? path, "http://localhost").searchParams;
    const requestedPage = pageParameter(params, "page", 1, Number.MAX_SAFE_INTEGER);
    const pageSize = pageParameter(params, "pageSize", 20, 100);
    const result = await db.$transaction(async (tx) => {
      const where = { userId };
      const total = await tx.task.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const items = await tx.task.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: taskFields,
      });
      return { items, page, pageSize, total, totalPages };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return send(response, 200, result);
  }

  if (path === "/api/tasks" && request.method === "POST") {
    const body = await readJson(request);
    const task = await db.task.create({
      data: {
        userId,
        title: taskText(body.title, 120, true),
        description: taskText(body.description === undefined ? "" : body.description, 2000, false),
      },
      select: taskFields,
    });
    return send(response, 201, task);
  }

  const id = taskPath.exec(path)?.[1];
  if (!id) throw new HttpError(404, "Задача не найдена");
  const where = { id, userId };
  try {
    if (request.method === "PATCH") {
      const body = await readJson(request);
      const data: { title?: string; description?: string; completed?: boolean } = {};
      if ("title" in body) data.title = taskText(body.title, 120, true);
      if ("description" in body) data.description = taskText(body.description, 2000, false);
      if ("completed" in body) {
        if (typeof body.completed !== "boolean") throw new HttpError(400, "Некорректный статус задачи");
        data.completed = body.completed;
      }
      if (!Object.keys(data).length) throw new HttpError(400, "Укажите поля для изменения");
      const task = await db.task.update({ where, data, select: taskFields });
      return send(response, 200, task);
    }

    if (request.method === "DELETE") {
      await db.task.delete({ where });
      return send(response, 204);
    }
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2025") throw error;
  }
  throw new HttpError(404, "Задача не найдена");
}
