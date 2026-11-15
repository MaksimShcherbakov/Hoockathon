import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "./db.js";
import { Prisma } from "./generated/prisma/client.js";
import { HttpError, readObject, send } from "./http.js";

const fields = { id: true, title: true, description: true, completed: true, createdAt: true } as const;

function title(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new HttpError(400, "Заголовок должен содержать от 1 до 120 символов");
  }
  return value.trim();
}

function description(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) {
    throw new HttpError(400, "Описание должно содержать до 2000 символов");
  }
  return value.trim();
}

export async function todos(req: IncomingMessage, res: ServerResponse, userId: string, id?: string) {
  if (!id && req.method === "GET") {
    const items = await db.todo.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: fields,
    });
    return send(res, 200, items);
  }

  if (!id && req.method === "POST") {
    const body = await readObject(req);
    const item = await db.todo.create({
      data: { userId, title: title(body.title), description: description(body.description ?? "") },
      select: fields,
    });
    return send(res, 201, item);
  }

  try {
    if (id && req.method === "PATCH") {
      const body = await readObject(req);
      const data: { title?: string; description?: string; completed?: boolean } = {};
      if ("title" in body) data.title = title(body.title);
      if ("description" in body) data.description = description(body.description);
      if ("completed" in body) {
        if (typeof body.completed !== "boolean") throw new HttpError(400, "Некорректный статус задачи");
        data.completed = body.completed;
      }
      if (!Object.keys(data).length) throw new HttpError(400, "Укажите изменения задачи");
      const item = await db.todo.update({ where: { id, userId }, data, select: fields });
      return send(res, 200, item);
    }

    if (id && req.method === "DELETE") {
      await db.todo.delete({ where: { id, userId } });
      return send(res, 204);
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new HttpError(404, "Задача не найдена");
    }
    throw error;
  }
  throw new HttpError(405, "Метод не поддерживается");
}
