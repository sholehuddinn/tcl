import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";
import { cookieSecure, jwtSecret, SESSION_COOKIE, SESSION_TTL_SECONDS } from "./config";
import { prisma } from "./db";
import { Errors } from "./errors";

export type Actor = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(jwtSecret());
}

async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function extractToken(req: Request): string | null {
  const authorization = req.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim() || null;
  }
  return readCookie(req.headers.get("cookie"), SESSION_COOKIE);
}

/** Verifikasi token, lalu muat pengguna dari DB agar peran dan status aktif selalu terbaru. */
export async function authenticate(req: Request): Promise<Actor> {
  const token = extractToken(req);
  if (!token) throw Errors.unauthenticated();
  const userId = await verifySession(token);
  if (!userId) throw Errors.unauthenticated();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw Errors.unauthenticated();
  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
}

export function assertRole(actor: Actor, ...roles: Role[]): void {
  if (!roles.includes(actor.role)) throw Errors.forbidden();
}

export function sessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (cookieSecure()) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (cookieSecure()) parts.push("Secure");
  return parts.join("; ");
}
