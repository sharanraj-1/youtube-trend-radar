import { z } from "zod";

const optional = z.string().trim().min(1).optional().catch(undefined);

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  YOUTUBE_API_KEY: z.string().min(10),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.8-flash"),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be 32+ chars"),
  ADMIN_PASSWORD: z.string().min(6),
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

/** Env values pasted through shells/dashboards can carry a BOM or stray whitespace; normalise them. */
function clean(v: string | undefined): string | undefined {
  if (typeof v !== "string") return v;
  const t = v.replace(/^\uFEFF/, "").trim();
  return t === "" ? undefined : t;
}
function cleanedEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) out[k] = clean(v);
  return out;
}

/** Parses and caches env. Throws a readable error (never containing values) when invalid. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(cleanedEnv());
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration -> ${issues.join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Presence report (booleans only, never values) for /api/health and boot logs. */
export function envReport() {
  const e = cleanedEnv();
  const present = (k: string) => typeof e[k] === "string";
  const parsed = EnvSchema.safeParse(e);
  return {
    valid: parsed.success,
    problems: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    required: Object.fromEntries(REQUIRED_ENV.map((k) => [k, present(k)])),
    optional: Object.fromEntries(OPTIONAL_ENV.map((k) => [k, present(k)])),
  };
}

export function baseUrl(): string {
  const e = cleanedEnv();
  if (e.APP_BASE_URL) return e.APP_BASE_URL.replace(/\/$/, "");
  if (e.VERCEL_PROJECT_PRODUCTION_URL) return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (e.VERCEL_URL) return `https://${e.VERCEL_URL}`;
  return `http://localhost:${e.PORT ?? 3000}`;
}
