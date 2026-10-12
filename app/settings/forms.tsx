"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AppConfig } from "@/lib/settings";
import { generateNow, login, resolveHandlesAction, saveSettings, sendTestAlert, sendTestEmail, type ActionState } from "./actions";

const input =
  "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-[0.95rem] outline-none transition-colors placeholder:text-faint focus:border-text";
const primary = "inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
const secondary =
  "inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:border-text/50 disabled:opacity-60";

function Result({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <div role="status" className={`border-l-2 pl-3 text-sm ${state.ok ? "border-ok" : "border-accent"}`}>
      <p className={state.ok ? "text-text" : "text-accent"}>{state.message}</p>
      {state.details && state.details.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          {state.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Step({ n, title, intro, children }: { n: number; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-rule pt-8 sm:grid-cols-[2.5rem_1fr]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-text text-sm font-semibold text-bg">{n}</span>
      <div className="space-y-5">
        <div>
          <h2 className="font-serif text-2xl">{title}</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">{intro}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs leading-relaxed text-muted">{hint}</span>}
      {children}
    </label>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {} as ActionState);
  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-medium">Admin sign-in</h1>
        <p className="text-sm leading-relaxed text-muted">
          This area is for the channel owner: make a brief on demand and choose what to track. Anyone can{" "}
          <Link href="/" className="underline">
            read the brief
          </Link>{" "}
          without signing in.
        </p>
      </div>
      <form action={action} className="space-y-3">
        <Field label="Password">
          <input className={input} type="password" name="password" autoComplete="current-password" required autoFocus />
        </Field>
        <button className={`${primary} w-full`} disabled={pending}>
          {pending ? "Checking…" : "Sign in"}
        </button>
        <Result state={state} />
      </form>
    </div>
  );
}

export function GeneratePanel() {
  const [state, gen, pending] = useActionState(generateNow, {} as ActionState);
  return (
    <Step
      n={1}
      title="Make a new brief now"
      intro="Briefs are made automatically every Sunday at 5 AM. Use this if you changed your topics or want a fresh look mid-week. It takes about 10–15 minutes, and you can start one every 30 minutes."
    >
      <form action={gen} className="space-y-3">
        <button className={primary} disabled={pending}>
          {pending ? "Starting…" : "Create a new brief"}
        </button>
        <Result state={state} />
        {state.ok && (
          <p className="text-sm">
            <Link href="/" className="underline">
              Go to the home page
            </Link>{" "}
            to watch progress.
          </p>
        )}
      </form>
    </Step>
  );
}

export function SettingsForm({ config, emailReady, telegramReady }: { config: AppConfig; emailReady: boolean; telegramReady: boolean }) {
  const [state, action, pending] = useActionState(saveSettings, {} as ActionState);
  const [mail, mailAction, mailing] = useActionState(sendTestEmail, {} as ActionState);
  const [tg, tgAction, tgSending] = useActionState(sendTestAlert, {} as ActionState);
  const [check, checkAction, checking] = useActionState(resolveHandlesAction, {} as ActionState);
  return (
    <form action={action} className="space-y-10">
      <Step
        n={2}
        title="Choose what to track"
        intro="Trend Radar searches YouTube for these topics and keeps an eye on these channels. Put one item on each line."
      >
        <Field label="Topics to search for" hint="Short phrases people would type into YouTube, e.g. “AI tools” or “laptop review”. Each topic uses 1% of YouTube's daily allowance.">
          <textarea className={`${input} min-h-48 leading-relaxed`} name="seedKeywords" defaultValue={config.seedKeywords.join("\n")} />
        </Field>
        <Field label="Channels to watch" hint="YouTube handles that start with @ (found under the channel name). These are your peers and competitors.">
          <textarea className={`${input} min-h-36 leading-relaxed`} name="peerChannelHandles" defaultValue={config.peerChannelHandles.join("\n")} />
        </Field>
        <div className="space-y-2">
          <button formAction={checkAction} formNoValidate className={secondary} disabled={checking}>
            {checking ? "Checking with YouTube…" : "Check these channels exist"}
          </button>
          <Result state={check} />
        </div>
        <Field label="Your own channel (optional)" hint="Lets the brief flag topics you've already covered in the last 60 days.">
          <input className={input} name="ownChannelHandle" defaultValue={config.ownChannelHandle} placeholder="@yourchannel" />
        </Field>
      </Step>

      <Step
        n={3}
        title="Get it by email (optional)"
        intro="Each Sunday's brief is emailed here as soon as it's ready. Leave empty to only use this website."
      >
        <p className={`text-sm ${emailReady ? "text-ok" : "text-muted"}`}>
          {emailReady ? "✓ Email sending is switched on." : "Email sending isn't switched on yet (needs a Resend API key on the server)."}
        </p>
        <Field
          label="Email address"
          hint="With Resend's free test sender this must be the address you signed up to Resend with (unless you verify your own domain in Resend)."
        >
          <input className={input} type="email" name="briefEmail" defaultValue={config.briefEmail} placeholder="you@example.com" />
        </Field>
        <div className="space-y-2">
          <button formAction={mailAction} formNoValidate className={secondary} disabled={mailing || !emailReady}>
            {mailing ? "Sending…" : "Send me a test email"}
          </button>
          <p className="text-xs text-muted">Sends the latest brief to the saved address. Save your changes first.</p>
          <Result state={mail} />
        </div>
      </Step>

      <Step
        n={4}
        title="Alerts on Telegram"
        intro="A short message when a new brief is ready, and a warning if a run has a problem, so you never have to check the site to find out."
      >
        <p className={`text-sm ${telegramReady ? "text-ok" : "text-muted"}`}>
          {telegramReady ? "✓ Telegram alerts are switched on." : "Telegram alerts aren't switched on yet (needs a bot token and chat ID on the server)."}
        </p>
        <div className="space-y-2">
          <button formAction={tgAction} formNoValidate className={secondary} disabled={tgSending || !telegramReady}>
            {tgSending ? "Sending…" : "Send me a test alert"}
          </button>
          <Result state={tg} />
        </div>
      </Step>

      <details className="group border-t border-rule pt-6">
        <summary className="cursor-pointer list-none text-sm font-medium text-muted hover:text-text">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span> Advanced settings (you can usually leave these alone)
        </summary>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Country" hint="Two-letter code. IN = India.">
            <input className={input} name="regionCode" defaultValue={config.regionCode} maxLength={2} required />
          </Field>
          <Field label="Languages" hint="Comma separated, e.g. en, hi.">
            <input className={input} name="relevanceLanguages" defaultValue={config.relevanceLanguages.join(", ")} required />
          </Field>
          <Field label="Look back (days)" hint="How far back to count videos as “this week”.">
            <input className={input} type="number" name="lookbackDays" min={1} max={30} defaultValue={config.lookbackDays} />
          </Field>
          <Field label="Smallest channel to include" hint="Subscribers. Filters out tiny or spam channels.">
            <input className={input} type="number" name="minChannelSubscribers" min={0} defaultValue={config.minChannelSubscribers} />
          </Field>
          <Field label="Topic searches per brief" hint="Each costs 100 of YouTube's 10,000 free daily units.">
            <input className={input} type="number" name="maxSearchQueriesPerRun" min={0} max={50} defaultValue={config.maxSearchQueriesPerRun} />
          </Field>
          <Field label="Trending category IDs" hint="28 = Science & Technology.">
            <input className={input} name="youtubeCategoryIds" defaultValue={config.youtubeCategoryIds.join(", ")} required />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Channels to always ignore" hint="Channel IDs (start with UC…), one per line.">
              <textarea className={`${input} min-h-24 font-mono text-sm`} name="blockedChannelIds" defaultValue={config.blockedChannelIds.join("\n")} />
            </Field>
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-4 border-t border-border bg-bg/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <button className={primary} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <span className="text-xs text-muted">Changes apply from the next brief.</span>
        <div className="w-full">
          <Result state={state} />
        </div>
      </div>
    </form>
  );
}
