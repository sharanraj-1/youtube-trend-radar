"use client";

import { useActionState } from "react";
import type { AppConfig } from "@/lib/settings";
import { generateNow, login, resolveHandlesAction, saveSettings, type ActionState } from "./actions";

const input =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
const button =
  "inline-flex items-center justify-center rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50";
const secondary =
  "inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50";

function Result({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <div role="status" className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-ok/10 text-ok" : "bg-accent-soft text-accent"}`}>
      <p>{state.message}</p>
      {state.details && state.details.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-text/80">
          {state.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {} as ActionState);
  return (
    <form action={action} className="mx-auto max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-6">
      <h1 className="text-lg font-semibold">Admin login</h1>
      <p className="text-sm text-muted">Settings and manual runs are restricted to the channel owner.</p>
      <input className={input} type="password" name="password" placeholder="Admin password" autoComplete="current-password" required />
      <button className={`${button} w-full`} disabled={pending}>
        {pending ? "Checking…" : "Log in"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ActionsPanel() {
  const [genState, gen, genPending] = useActionState(generateNow, {} as ActionState);
  const [resState, res, resPending] = useActionState(resolveHandlesAction, {} as ActionState);
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Actions</h2>
      <div className="flex flex-wrap gap-2">
        <form action={gen}>
          <button className={button} disabled={genPending}>
            {genPending ? "Starting…" : "Generate brief now"}
          </button>
        </form>
        <form action={res}>
          <button className={secondary} disabled={resPending}>
            {resPending ? "Resolving…" : "Resolve handles"}
          </button>
        </form>
      </div>
      <p className="text-xs text-muted">One manual run per 30 minutes globally. A full run uses about 2–3K YouTube units and ~15 Gemini calls.</p>
      <Result state={genState} />
      <Result state={resState} />
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SettingsForm({ config }: { config: AppConfig }) {
  const [state, action, pending] = useActionState(saveSettings, {} as ActionState);
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Configuration</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Region code">
          <input className={input} name="regionCode" defaultValue={config.regionCode} maxLength={2} required />
        </Field>
        <Field label="Relevance languages" hint="Comma separated; searches alternate between them.">
          <input className={input} name="relevanceLanguages" defaultValue={config.relevanceLanguages.join(", ")} required />
        </Field>
        <Field label="YouTube category IDs" hint="28 = Science & Technology (trending chart).">
          <input className={input} name="youtubeCategoryIds" defaultValue={config.youtubeCategoryIds.join(", ")} required />
        </Field>
        <Field label="Own channel handle" hint="Enables “You covered this on…”.">
          <input className={input} name="ownChannelHandle" defaultValue={config.ownChannelHandle} placeholder="@yourchannel" />
        </Field>
        <Field label="Lookback days">
          <input className={input} type="number" name="lookbackDays" min={1} max={30} defaultValue={config.lookbackDays} />
        </Field>
        <Field label="Min channel subscribers">
          <input className={input} type="number" name="minChannelSubscribers" min={0} defaultValue={config.minChannelSubscribers} />
        </Field>
        <Field label="Max searches per run" hint="Each search costs 100 of 10,000 daily units.">
          <input className={input} type="number" name="maxSearchQueriesPerRun" min={0} max={50} defaultValue={config.maxSearchQueriesPerRun} />
        </Field>
        <Field label="Brief email" hint="Optional (requires RESEND_API_KEY).">
          <input className={input} type="email" name="briefEmail" defaultValue={config.briefEmail} />
        </Field>
      </div>
      <Field label="Seed keywords" hint="One per line.">
        <textarea className={`${input} min-h-40 font-mono`} name="seedKeywords" defaultValue={config.seedKeywords.join("\n")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Peer channel handles" hint="One per line. Unresolvable handles are dropped and logged.">
          <textarea className={`${input} min-h-36 font-mono`} name="peerChannelHandles" defaultValue={config.peerChannelHandles.join("\n")} />
        </Field>
        <Field label="Blocked channel IDs" hint="One per line (UC…). Excluded from analysis.">
          <textarea className={`${input} min-h-36 font-mono`} name="blockedChannelIds" defaultValue={config.blockedChannelIds.join("\n")} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button className={button} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}
