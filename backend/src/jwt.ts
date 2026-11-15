import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export const sessionSeconds = 7 * 24 * 60 * 60;
const issuer = "hookahton";
const audience = "hookahton-web";
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const secret = process.env.JWT_SECRET;
if (!secret || !/^[a-f\d]{64}$/i.test(secret)) {
  throw new Error("JWT_SECRET must contain 64 hexadecimal characters");
}
const key = Buffer.from(secret, "hex");

export async function issueToken(userId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + sessionSeconds;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(key);
  return { token, expiresAt: new Date(expiresAt * 1000) };
}

export async function verifyToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    typ: "JWT",
    issuer,
    audience,
    requiredClaims: ["sub", "jti", "iat", "exp"],
    maxTokenAge: sessionSeconds,
  });
  if (typeof payload.sub !== "string" || !uuid.test(payload.sub) ||
      typeof payload.jti !== "string" || !uuid.test(payload.jti) ||
      !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
      payload.exp! <= payload.iat! || payload.exp! - payload.iat! > sessionSeconds) {
    throw new Error("Invalid session claims");
  }
  return payload.sub;
}
