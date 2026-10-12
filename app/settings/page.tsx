import { Suspense } from "react";
import { connection } from "next/server";
import { adminIsOpen, isAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/settings";
import { ErrorState, LoadingBlock } from "@/components/States";
import { GeneratePanel, LoginForm, SettingsForm } from "./forms";
import { logout } from "./actions";

export const metadata = { title: "Admin", robots: { index: false } };
// Server actions on this page (manual run kick-off via after()) share the page's function timeout.
export const maxDuration = 300;

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingBlock lines={2} />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await connection();
  if (!(await isAdmin())) return <LoginForm />;
  let config;
  try {
    config = await getConfig();
  } catch {
    return <ErrorState what="your settings" />;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rise mb-10 flex items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Admin</p>
          <h1 className="font-serif text-5xl tracking-tight sm:text-6xl">
            Your <em className="text-gradient">control room</em>
          </h1>
          <p className="text-lg text-muted">Everything you can do here, step by step.</p>
        </div>
        {!adminIsOpen() && (
          <form action={logout}>
            <button className="glass rounded-full px-4 py-2 text-sm text-muted transition hover:text-text">Sign out</button>
          </form>
        )}
      </header>
      <GeneratePanel />
      <SettingsForm
        config={config}
        emailReady={!!process.env.RESEND_API_KEY}
        telegramReady={!!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)}
      />
    </div>
  );
}
