import { z } from "zod";
import { eq } from "drizzle-orm";
import defaults from "@/config/default.json";
import { db, schema } from "./db";

const handle = z
  .string()
  .trim()
  .min(2)
  .transform((h) => (h.startsWith("@") ? h : `@${h}`));

export const ConfigSchema = z.object({
  regionCode: z.string().trim().length(2).toUpperCase(),
  relevanceLanguages: z.array(z.string().trim().min(2).max(5)).min(1),
  youtubeCategoryIds: z.array(z.string().trim().regex(/^\d+$/)).min(1),
  seedKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  peerChannelHandles: z.array(handle).max(30),
  ownChannelHandle: z.union([handle, z.literal("")]).default(""),
  lookbackDays: z.number().int().min(1).max(30),
  minChannelSubscribers: z.number().int().min(0),
  maxSearchQueriesPerRun: z.number().int().min(0).max(50),
  briefEmail: z.union([z.string().trim().email(), z.literal("")]).default(""),
  blockedChannelIds: z.array(z.string().trim()).default([]),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: AppConfig = ConfigSchema.parse(defaults);

/** Single-row settings table, seeded from config/default.json on first read. */
export async function getConfig(): Promise<AppConfig> {
  const rows = await db().select().from(schema.settings).where(eq(schema.settings.id, 1)).limit(1);
  if (rows.length === 0) {
    await db().insert(schema.settings).values({ id: 1, config: DEFAULT_CONFIG }).onConflictDoNothing();
    return DEFAULT_CONFIG;
  }
  const parsed = ConfigSchema.safeParse({ ...DEFAULT_CONFIG, ...(rows[0].config as object) });
  return parsed.success ? parsed.data : DEFAULT_CONFIG;
}

export async function saveConfig(input: unknown): Promise<AppConfig> {
  const cfg = ConfigSchema.parse(input);
  await db()
    .insert(schema.settings)
    .values({ id: 1, config: cfg })
    .onConflictDoUpdate({ target: schema.settings.id, set: { config: cfg, updatedAt: new Date() } });
  return cfg;
}
