import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Prisma, type PrismaClient } from "./generated/client.js";
import { HttpError, readJson, send } from "./http.js";

const sessionSeconds = 7 * 24 * 60 * 60;
const secureCookie = process.env.COOKIE_SECURE === "true";
const cookieName = secureCookie ? "__Host-session" : "session";
const cookieFlags = "Path=/; HttpOnly; SameSite=Strict" + (secureCookie ? "; Secure" : "");
const dummyHash = randomBytes(64).toString("hex");
let passwordChecks = 0;

async function deriveKey(password: string, salt: string): Promise<Buffer> {
  if (passwordChecks >= 4) throw new HttpError(503, "Повторите попытку чуть позже");
  passwordChecks++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { N: 1 << 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
  } finally {
    passwordChecks--;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionHash(request: IncomingMessage): string | undefined {
  const token = request.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? hashToken(token) : undefined;
}

export async function currentUser(db: PrismaClient, request: IncomingMessage) {
  const tokenHash = sessionHash(request);
  if (!tokenHash) throw new HttpError(401, "Войдите в аккаунт");

  const session = await db.session.findUnique({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    select: { user: { select: { id: true, email: true } } },
  });
  if (!session) throw new HttpError(401, "Войдите в аккаунт");

  return session.user;
}

export async function authenticate(
  db: PrismaClient,
  request: IncomingMessage,
  response: ServerResponse,
  register: boolean,
) {
  const body = await readJson(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body.password;
  if (email.length > 254 || /[\u0000-\u001f\u007f]/.test(email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, "Введите корректный email");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new HttpError(400, "Пароль должен содержать от 8 до 128 символов");
  }

  const token = randomBytes(32).toString("hex");
  const previous = sessionHash(request);
  const session = {
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + sessionSeconds * 1000),
  };

  if (register) {
    const salt = randomBytes(16).toString("hex");
    const key = await deriveKey(password, salt);
    try {
      await db.$transaction(async (tx) => {
        await tx.user.create({
          data: { email, passwordHash: salt + ":" + key.toString("hex"), sessions: { create: session } },
          select: { id: true },
        });
        if (previous) await tx.session.deleteMany({ where: { tokenHash: previous } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "Этот email уже зарегистрирован");
      }
      throw error;
    }
  } else {
    const user = await db.user.findUnique({ where: { email } });
    const [salt, hash] = (user?.passwordHash ?? "00000000000000000000000000000000:" + dummyHash).split(":");
    const key = await deriveKey(password, salt);
    if (!timingSafeEqual(key, Buffer.from(hash, "hex")) || !user) {
      throw new HttpError(401, "Неверный email или пароль");
    }
    await db.$transaction([
      db.session.deleteMany({ where: { OR: [
        { userId: user.id, expiresAt: { lte: new Date() } },
        ...(previous ? [{ tokenHash: previous }] : []),
      ] } }),
      db.session.create({ data: { ...session, userId: user.id } }),
    ]);
  }

  response.setHeader("Set-Cookie", `${cookieName}=${token}; ${cookieFlags}; Max-Age=${sessionSeconds}`);
  send(response, register ? 201 : 200, { email });
}

export async function logout(db: PrismaClient, request: IncomingMessage, response: ServerResponse) {
  const tokenHash = sessionHash(request);
  if (tokenHash) await db.session.deleteMany({ where: { tokenHash } });
  response.setHeader("Set-Cookie", `${cookieName}=; ${cookieFlags}; Max-Age=0`);
  send(response, 204);
}
