"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { ADMIN_COOKIE, checkPassword, isAdmin, makeSessionToken, sessionCookieOptions } from "@/lib/auth";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { getConfig, saveConfig } from "@/lib/settings";
import { manualRun, RateLimitedError } from "@/lib/jobs";
import { stepAndChain } from "@/lib/pipeline/runner";
import { YouTubeClient } from "@/lib/youtube/client";
import { QuotaManager } from "@/lib/youtube/quota";
import { resolveHandles } from "@/lib/youtube/resolve";

export interface ActionState {
  ok?: boolean;
  message?: string;
  details?: string[];
}

const attempts = new Map<string, { n: number; at: number }>();

export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  // Basic brute-force damping per instance.
  const a = attempts.get("admin") ?? { n: 0, at: Date.now() };
  if (Date.now() - a.at > 15 * 60_000) Object.assign(a, { n: 0, at: Date.now() });
  if (a.n >= 10) return { ok: false, message: "Too many attempts. Try again in 15 minutes." };
  let valid = false;
  try {
    valid = checkPassword(password);
  } catch {
    return { ok: false, message: "Admin login is not configured on the server." };
  }
  if (!valid) {
    a.n++;
    attempts.set("admin", a);
    return { ok: false, message: "Wrong password." };
  }
  (await cookies()).set(ADMIN_COOKIE, makeSessionToken(), sessionCookieOptions);
  redirect("/settings");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/settings");
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveSettings(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { ok: false, message: "Session expired. Please log in again." };
  try {
    const current = await getConfig();
    const cfg = await saveConfig({
      ...current,
      regionCode: String(form.get("regionCode") ?? current.regionCode),
      relevanceLanguages: list(form.get("relevanceLanguages")),
      youtubeCategoryIds: list(form.get("youtubeCategoryIds")),
      seedKeywords: list(form.get("seedKeywords")),
      peerChannelHandles: list(form.get("peerChannelHandles")),
      ownChannelHandle: String(form.get("ownChannelHandle") ?? "").trim(),
      lookbackDays: Number(form.get("lookbackDays")),
      minChannelSubscribers: Number(form.get("minChannelSubscribers")),
      maxSearchQueriesPerRun: Number(form.get("maxSearchQueriesPerRun")),
      briefEmail: String(form.get("briefEmail") ?? "").trim(),
      blockedChannelIds: list(form.get("blockedChannelIds")),
    });
    refresh();
    return {
      ok: true,
      message: `Saved. Each run will use up to ${cfg.maxSearchQueriesPerRun * 100} units on searches.`,
    };
  } catch (err) {
    const msg = err instanceof Error && "issues" in err ? (err as { issues: { path: unknown[]; message: string }[] }).issues.map((i) => `${i.path.join(".")}: ${i.message}`) : [];
    return { ok: false, message: "Some values are invalid.", details: msg };
  }
}

export async function resolveHandlesAction(_: ActionState): Promise<ActionState> {
  if (!(await isAdmin())) return { ok: false, message: "Session expired. Please log in again." };
  try {
    const cfg = await getConfig();
    const yt = new YouTubeClient(env().YOUTUBE_API_KEY, new QuotaManager(100));
    const handles = [...cfg.peerChannelHandles, ...(cfg.ownChannelHandle ? [cfg.ownChannelHandle] : [])];
    const { resolved, unresolved } = await resolveHandles(yt, handles, { isPeer: true }, { useCache: false });
    return {
      ok: unresolved.length === 0,
      message: `${resolved.length} resolved, ${unresolved.length} unresolved (dropped from runs). ${yt.quota.used} quota units used.`,
      details: [
        ...resolved.map((r) => `✓ ${r.handle} → ${r.title} (${r.id}), ${r.subscriberCount?.toLocaleString("en-IN") ?? "hidden"} subs`),
        ...unresolved.map((h) => `✗ ${h} did not resolve`),
      ],
    };
  } catch (err) {
    log.error("resolve handles failed", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, message: "Couldn't reach YouTube right now. Try again shortly." };
  }
}

export async function generateNow(_: ActionState): Promise<ActionState> {
  if (!(await isAdmin())) return { ok: false, message: "Session expired. Please log in again." };
  try {
    const { run, created } = await manualRun();
    if (created) after(() => stepAndChain(run.id).then(() => undefined));
    return { ok: true, message: created ? `Run #${run.id} started. Follow it on the Runs page (~10–15 min).` : `Run #${run.id} is already in progress.` };
  } catch (err) {
    if (err instanceof RateLimitedError) return { ok: false, message: err.message };
    log.error("generate now failed", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, message: "Couldn't start a run right now." };
  }
}
