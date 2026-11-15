import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { jwtVerify, SignJWT } from "jose";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/client.js";

const base = "http://127.0.0.1:3000/api";
const key = Buffer.from(process.env.JWT_SECRET, "hex");
const hash = (token) => createHash("sha256").update(token).digest("hex");

test("JWT signature and claims are enforced independently of the session registry", async () => {
  const email = randomUUID() + "@example.test";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const response = await fetch(base + "/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "test-password" }),
    });
    assert.equal(response.status, 201);
    const token = response.headers.get("set-cookie").split(";")[0].slice("session=".length);
    const { payload, protectedHeader } = await jwtVerify(token, key, {
      algorithms: ["HS256"], issuer: "hookahton", audience: "hookahton-web",
    });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    assert.equal(protectedHeader.typ, "JWT");
    assert.equal(payload.sub, user.id);
    assert.equal(payload.exp - payload.iat, 604800);
    assert.match(payload.jti, /^[a-f\d-]{36}$/);
    assert.equal(payload.email, undefined);
    const stored = await db.session.findUniqueOrThrow({ where: { tokenHash: hash(token) } });
    assert.equal(stored.expiresAt.getTime(), payload.exp * 1000);

    const me = (value) => fetch(base + "/me", { headers: { Cookie: "session=" + value } });
    const sign = (claims, alg = "HS256", signingKey = key, typ = "JWT") =>
      new SignJWT(claims).setProtectedHeader({ alg, typ }).sign(signingKey);
    assert.equal((await me(token)).status, 200);
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: user.id, jti: randomUUID(), iss: "hookahton", aud: "hookahton-web", iat: now, exp: now + 3600 };
    const without = (name) => Object.fromEntries(Object.entries(claims).filter(([field]) => field !== name));
    const unsigned = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." +
      Buffer.from(JSON.stringify(claims)).toString("base64url") + ".";
    const invalid = [
      ["wrong signature", await sign(claims, "HS256", randomBytes(32))],
      ["unsecured token", unsigned],
      ["wrong algorithm", await sign(claims, "HS384")],
      ["wrong type", await sign(claims, "HS256", key, "other")],
      ["expired", await sign({ ...claims, iat: now - 100, exp: now - 1 })],
      ["future issued", await sign({ ...claims, iat: now + 120 })],
      ["not yet valid", await sign({ ...claims, nbf: now + 120 })],
      ["wrong issuer", await sign({ ...claims, iss: "other" })],
      ["wrong audience", await sign({ ...claims, aud: "other" })],
      ["wrong owner", await sign({ ...claims, sub: randomUUID() })],
      ["invalid owner", await sign({ ...claims, sub: "not-a-uuid" })],
      ["missing subject", await sign(without("sub"))],
      ["missing expiration", await sign(without("exp"))],
      ["missing issued time", await sign(without("iat"))],
      ["missing token id", await sign(without("jti"))],
      ["oversized lifetime", await sign({ ...claims, exp: now + 604801 })],
      ["legacy opaque token", randomBytes(32).toString("hex")],
      ["malformed token", "a.b.c"],
    ];
    for (const [label, value] of invalid) {
      // Even an unexpired registry entry cannot bypass JWT validation.
      await db.session.create({ data: { tokenHash: hash(value), userId: user.id, expiresAt: new Date(Date.now() + 3600000) } });
      assert.equal((await me(value)).status, 401, label);
      assert.equal((await fetch(base + "/tasks", { headers: { Cookie: "session=" + value } })).status, 401, label);
    }
    const unregistered = await sign(claims);
    assert.equal((await me(unregistered)).status, 401, "valid JWT still requires an active registered session");
    assert.equal((await fetch(base + "/logout", { method: "POST", headers: { Cookie: "session=" + token } })).status, 204);
    assert.equal((await me(token)).status, 401, "logout revokes an otherwise valid JWT");
  } finally {
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});

test("JWT configuration fails closed without a sufficiently sized key", () => {
  for (const value of [undefined, "", "short", "g".repeat(64), "a".repeat(63)]) {
    const env = { ...process.env };
    if (value === undefined) delete env.JWT_SECRET;
    else env.JWT_SECRET = value;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./dist/jwt.js')"], {
      env, encoding: "utf8", timeout: 5000,
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /JWT_SECRET must contain 64 hexadecimal characters/);
  }
});
