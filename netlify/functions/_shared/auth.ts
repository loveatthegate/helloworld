import { randomBytes } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getDb, schema } from "../../../db/index";
import { DEFAULT_ADMIN, hashPassword } from "./password";

export const SESSION_COOKIE = "lvzhi_session";
const SESSION_DAYS = 7;

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: "super_admin" | "user";
  isActive: boolean;
};

export function isAdmin(user: AuthUser) {
  return user.role === "super_admin";
}

export function canSee(user: AuthUser, ownerId?: number | null) {
  return isAdmin(user) || ownerId === user.id;
}

export async function ensureAdmin(): Promise<AuthUser> {
  const db = await getDb();
  const existing = await db.select().from(schema.users);
  let admin = existing.find((u) => u.role === "super_admin");
  if (!admin && existing.length === 0) {
    const [created] = await db
      .insert(schema.users)
      .values({
        username: DEFAULT_ADMIN.username,
        displayName: DEFAULT_ADMIN.displayName,
        passwordHash: hashPassword(DEFAULT_ADMIN.password),
        role: "super_admin",
        isActive: true,
      })
      .returning();
    admin = created;
  }
  if (admin) {
    await db.update(schema.sops).set({ userId: admin.id }).where(isNull(schema.sops.userId));
    await db.update(schema.analyses).set({ userId: admin.id }).where(isNull(schema.analyses.userId));
  }
  if (!admin) throw new Error("系统缺少超级管理员");
  return toAuthUser(admin);
}

export function toAuthUser(row: typeof schema.users.$inferSelect): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role === "super_admin" ? "super_admin" : "user",
    isActive: row.isActive,
  };
}

export async function createSession(userId: number): Promise<string> {
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ token, userId, expiresAt });
  return token;
}

export function attachSession(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: Boolean(process.env.NETLIFY),
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function destroySession(token?: string) {
  if (!token) return;
  const db = await getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}

export async function userFromRequest(c: Context): Promise<AuthUser | null> {
  await ensureAdmin();
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const db = await getDb();
  const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).limit(1);
  const expiresAt = session?.expiresAt instanceof Date ? session.expiresAt : session ? new Date(session.expiresAt) : null;
  if (!session || !expiresAt || expiresAt.getTime() < Date.now()) {
    if (session) await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
    return null;
  }
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
  if (!user || !user.isActive) return null;
  return toAuthUser(user);
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}
