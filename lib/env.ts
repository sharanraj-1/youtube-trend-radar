import { z } from "zod";

const optional = z.string().trim().min(1).optional().catch(undefined);

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  YOUTUBE_API_KEY: z.string().min(10),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.8-flash"),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be 32+ chars"),
  ADMIN_PASSWORD: z.string().min(8),
  FEEDBACK_SECRET: z.string().min(32, "FEEDBACK_SECRET must be 32+ chars"),
  APP_BASE_URL: z.string().url().optional().catch(undefined),
  RESEND_API_KEY: optional,
  RESEND_FROM: optional,
  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_CHAT_ID: optional,
});

export type Env = z.infer<typeof EnvSchema>;

export const REQUIRED_ENV = [
  "DATABASE_URL",
  "YOUTUBE_API_KEY",
  "GEMINI_API_KEY",
  "CRON_SECRET",
  "ADMIN_PASSWORD",
  "FEEDBACK_SECRET",
] as const;
export const OPTIONAL_ENV = [
  "GEMINI_MODEL",
  "APP_BASE_URL",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
] as const;

let cached: Env | null = null;

/** Parses and caches env. Throws a readable error (never containing values) when invalid. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration -> ${issues.join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Presence report (booleans only, never values) for /api/health and boot logs. */
export function envReport() {
  const present = (k: string) => typeof process.env[k] === "string" && process.env[k]!.trim() !== "";
  const parsed = EnvSchema.safeParse(process.env);
  return {
    valid: parsed.success,
    problems: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    required: Object.fromEntries(REQUIRED_ENV.map((k) => [k, present(k)])),
    optional: Object.fromEntries(OPTIONAL_ENV.map((k) => [k, present(k)])),
  };
}

export function baseUrl(): string {
  const e = process.env;
  if (e.APP_BASE_URL) return e.APP_BASE_URL.replace(/\/$/, "");
  if (e.VERCEL_PROJECT_PRODUCTION_URL) return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (e.VERCEL_URL) return `https://${e.VERCEL_URL}`;
  return `http://localhost:${e.PORT ?? 3000}`;
}
