import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { listBriefs } from "@/lib/queries";
import { istDate } from "@/lib/render/format";
import { BRIEF_STATUS_PLAIN } from "@/lib/render/guide";
import type { BriefJson } from "@/lib/render/types";

export const metadata = { title: "Archive" };

export default function BriefsPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-serif text-4xl font-medium tracking-tight">Past briefs</h1>
        <p className="text-muted">Every Sunday brief, newest first. Open one to review it step by step.</p>
      </header>
      <Suspense fallback={<LoadingBlock lines={3} />}>
        <BriefList />
      </Suspense>
    </div>
  );
}

async function BriefList() {
  await connection();
  let rows: Awaited<ReturnType<typeof listBriefs>>;
  try {
    rows = await listBriefs();
  } catch {
    return <ErrorState what="the archive" />;
  }
  if (rows.length === 0)
    return (
      <EmptyState title="No briefs yet">
        The first one appears after the next Sunday run.
      </EmptyState>
    );
  return (
    <ol className="divide-y divide-border border-y border-border">
      {rows.map((b) => {
        const j = b.json as BriefJson;
        const s = BRIEF_STATUS_PLAIN[b.status] ?? { label: b.status, tone: "text-muted" };
        return (
          <li key={b.id}>
            <Link href={`/briefs/${b.id}`} className="group flex items-start gap-4 py-5">
              <span className="w-24 shrink-0 pt-0.5 text-sm">
                <span className="block font-medium">{istDate(b.createdAt)}</span>
                <span className="block text-xs text-faint">No. {b.id}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg leading-snug group-hover:underline">
                  {j.clusters.length ? `${j.clusters.length} trends: ${j.clusters.slice(0, 2).map((c) => c.theme_name).join(" · ")}${j.clusters.length > 2 ? " …" : ""}` : "No trends that week"}
                </span>
                <span className={`mt-1 block text-xs font-medium ${s.tone}`}>{s.label}</span>
              </span>
              <span aria-hidden className="pt-1 text-faint group-hover:text-text">→</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
