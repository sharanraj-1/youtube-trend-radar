import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { env } from "../env";

export type DB = NeonHttpDatabase<typeof schema>;

let instance: DB | null = null;

/** Lazily created so builds and env-less imports never touch the database. */
export function db(): DB {
  if (!instance) instance = drizzle(neon(env().DATABASE_URL), { schema });
  return instance;
}

export { schema };
