import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { listBriefs } from "@/lib/queries";
import { istDateTime } from "@/lib/render/format";
import type { BriefJson } from "@/lib/render/types";

export const metadata = { title: "Archive" };

export default function BriefsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Past briefs</h1>
      <Suspense fallback={<LoadingBlock lines={3} />}>
        <BriefList />
      </Suspense>
    </div>
  );
}

const BADGE: Record<string, string> = {
  complete: "text-ok",
  degraded: "text-warn",
  fallback: "text-accent",
};

async function BriefList() {
  await connection();
  let rows: Awaited<ReturnType<typeof listBriefs>>;
  try {
    rows = await listBriefs();
  } catch {
    return <ErrorState what="the archive" />;
  }
  if (rows.length === 0) return <EmptyState title="No briefs yet" />;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {rows.map((b) => {
        const j = b.json as BriefJson;
        return (
          <li key={b.id}>
            <Link href={`/briefs/${b.id}`} className="block px-5 py-4 hover:bg-surface-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{istDateTime(b.createdAt)}</span>
                <span className={`text-xs font-semibold uppercase ${BADGE[b.status] ?? ""}`}>{b.status}</span>
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-muted">{j.clusters.map((c) => c.theme_name).join(" · ") || "No clusters"}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
