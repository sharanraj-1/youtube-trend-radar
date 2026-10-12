import { Suspense } from "react";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
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
    <div className="space-y-10">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif text-4xl font-medium tracking-tight">Admin</h1>
          <p className="text-muted">Three things you can do here, in order.</p>
        </div>
        <form action={logout}>
          <button className="text-sm text-muted underline hover:text-text">Sign out</button>
        </form>
      </header>
      <GeneratePanel />
      <SettingsForm config={config} />
    </div>
  );
}
