import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "./db.js";
import { Prisma } from "./generated/prisma/client.js";
import { HttpError, readObject, send } from "./http.js";

const sessionAge = 7 * 24 * 60 * 60;
const secure = process.env.COOKIE_SECURE === "true";
const cookieName = secure ? "__Host-hookahton_session" : "hookahton_session";
const cookieAttributes = "; Path=/; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : "");
const publicUser = { id: true, email: true } as const;

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await deriveKey(password, salt)).toString("hex");
}

async function checkPassword(password: string, stored?: string) {
  const [salt, hash] = stored?.split(":") ?? ["0".repeat(32), "0".repeat(128)];
  const key = await deriveKey(password, salt);
  return timingSafeEqual(key, Buffer.from(hash, "hex")) && stored !== undefined;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenHash(req: IncomingMessage) {
  const prefix = cookieName + "=";
  const token = req.headers.cookie?.split(";").map((item) => item.trim())
    .find((item) => item.startsWith(prefix))?.slice(prefix.length);
  return token && /^[0-9a-f]{64}$/.test(token) ? hashToken(token) : undefined;
}

export async function requireUser(req: IncomingMessage) {
  const hash = tokenHash(req);
  const session = hash && await db.session.findUnique({
    where: { tokenHash: hash, expiresAt: { gt: new Date() } },
    select: { user: { select: publicUser } },
  });
  if (!session) throw new HttpError(401, "Войдите в аккаунт");
  return session.user;
}

export async function authenticate(req: IncomingMessage, res: ServerResponse, register: boolean) {
  const body = await readObject(req);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Введите корректный email");
  }
  if (typeof password !== "string" || password.length < (register ? 8 : 1) || password.length > 128) {
    throw new HttpError(400, register ? "Пароль должен содержать от 8 до 128 символов" : "Проверьте пароль");
  }

  const token = randomBytes(32).toString("hex");
  const previous = tokenHash(req);
  const now = new Date();
  const session = {
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + sessionAge * 1000),
  };

  let user: { id: string; email: string };
  if (register) {
    const passwordHash = await hashPassword(password);
    try {
      user = await db.$transaction(async (tx) => {
        const account = await tx.user.create({
          data: { email, passwordHash, sessions: { create: session } },
          select: publicUser,
        });
        if (previous) await tx.session.deleteMany({ where: { tokenHash: previous } });
        return account;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "Аккаунт с таким email уже существует");
      }
      throw error;
    }
  } else {
    const account = await db.user.findUnique({ where: { email } });
    const valid = await checkPassword(password, account?.passwordHash);
    if (!account || !valid) throw new HttpError(401, "Неверный email или пароль");
    user = { id: account.id, email: account.email };
    await db.$transaction([
      db.session.deleteMany({
        where: {
          OR: [
            { userId: user.id, expiresAt: { lte: now } },
            ...(previous ? [{ tokenHash: previous }] : []),
          ],
        },
      }),
      db.session.create({ data: { ...session, userId: user.id } }),
    ]);
  }
  res.setHeader("Set-Cookie", cookieName + "=" + token + cookieAttributes + "; Max-Age=" + sessionAge);
  send(res, register ? 201 : 200, user);
}

export async function logout(req: IncomingMessage, res: ServerResponse) {
  await readObject(req);
  const hash = tokenHash(req);
  if (hash) await db.session.deleteMany({ where: { tokenHash: hash } });
  res.setHeader("Set-Cookie", cookieName + "=" + cookieAttributes + "; Max-Age=0");
  send(res, 204);
}
