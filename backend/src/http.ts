import type { IncomingMessage, ServerResponse } from "node:http";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

export async function readObject(req: IncomingMessage): Promise<Record<string, unknown>> {
  const mediaType = req.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new HttpError(415, "Ожидается JSON");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 16_384) {
      req.resume();
      throw new HttpError(413, "Данные слишком большие");
    }
    chunks.push(chunk);
  }

  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpError(400, "Ожидается объект JSON");
  }
  return data as Record<string, unknown>;
}
