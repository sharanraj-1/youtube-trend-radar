import { Suspense } from "react";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/settings";
import { ErrorState, LoadingBlock } from "@/components/States";
import { ActionsPanel, LoginForm, SettingsForm } from "./forms";
import { logout } from "./actions";

export const metadata = { title: "Settings", robots: { index: false } };
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
    return <ErrorState what="settings" />;
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <form action={logout}>
          <button className="text-sm text-muted hover:text-text">Log out</button>
        </form>
      </div>
      <ActionsPanel />
      <SettingsForm config={config} />
    </div>
  );
}
