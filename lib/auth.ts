import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

export const ADMIN_COOKIE = "tr_admin";
const SESSION_MS = 7 * 86400_000;

function key() {
  // Changing ADMIN_PASSWORD invalidates all sessions.
  return createHash("sha256").update(`${env().ADMIN_PASSWORD ?? ""}:${env().CRON_SECRET}`).digest();
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function makeSessionToken(now = Date.now()) {
  const exp = String(now + SESSION_MS);
  return `${exp}.${createHmac("sha256", key()).update(exp).digest("base64url")}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < now) return false;
  return safeEqual(sig, createHmac("sha256", key()).update(exp).digest("base64url"));
}

export function checkPassword(input: string) {
  const a = createHash("sha256").update(input).digest("hex");
  const b = createHash("sha256").update(env().ADMIN_PASSWORD ?? "").digest("hex");
  return safeEqual(a, b);
}

/** No ADMIN_PASSWORD configured = the Admin page is open (owner's choice). */
export function adminIsOpen() {
  try {
    return !env().ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

export async function isAdmin() {
  if (adminIsOpen()) return true;
  try {
    const store = await cookies();
    return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
  } catch {
    return false;
  }
}

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. */
export function isCronAuthorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  try {
    return safeEqual(header, `Bearer ${env().CRON_SECRET}`);
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MS / 1000,
};
