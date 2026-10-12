/* eslint-disable @next/next/no-img-element -- thumbnails load straight from i.ytimg.com (no image-optimizer quota). */
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { LifecycleChip } from "@/components/brief/LifecycleTrack";
import { listBriefs } from "@/lib/queries";
import { istDate } from "@/lib/render/format";
import type { BriefJson } from "@/lib/render/types";

export const metadata = { title: "Archive" };

export default function BriefsPage() {
  return (
    <div className="space-y-10">
      <header className="rise max-w-2xl space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Archive</p>
        <h1 className="font-serif text-5xl tracking-tight sm:text-6xl">
          Every Sunday, <em className="text-gradient">on record</em>
        </h1>
        <p className="text-lg text-muted">Open any past brief to review it trend by trend. Newest first.</p>
      </header>
      <Suspense fallback={<LoadingBlock lines={3} />}>
        <BriefList />
      </Suspense>
    </div>
  );
}

const STATUS: Record<string, { label: string; dot: string }> = {
  complete: { label: "Complete", dot: "bg-ok" },
  degraded: { label: "Partial", dot: "bg-warn" },
  fallback: { label: "Backup", dot: "bg-danger" },
};

async function BriefList() {
  await connection();
  let rows: Awaited<ReturnType<typeof listBriefs>>;
  try {
    rows = await listBriefs();
  } catch {
    return <ErrorState what="the archive" />;
  }
  if (rows.length === 0) return <EmptyState title="No briefs yet">The first one appears after the next Sunday run.</EmptyState>;
  return (
    <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((b, n) => {
        const j = b.json as BriefJson;
        const s = STATUS[b.status] ?? { label: b.status, dot: "bg-faint" };
        const thumbs = j.clusters.flatMap((c) => c.evidence.slice(0, 1)).slice(0, 4);
        return (
          <li key={b.id} className="reveal">
            <Link
              href={`/briefs/${b.id}`}
              className={`glass group block h-full overflow-hidden rounded-[1.75rem] transition-all duration-300 hover:-translate-y-1 hover:border-border-strong ${n === 0 ? "ring-gradient" : ""}`}
            >
              <div className="relative grid aspect-[16/8] grid-cols-4 gap-0.5 overflow-hidden bg-surface-sunk">
                {thumbs.map((t) => (
                  <img key={t.id} src={t.thumb} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ))}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                  <span className="font-serif text-3xl leading-none">{istDate(b.createdAt)}</span>
                  <span className="font-mono text-xs opacity-80">No. {b.id}</span>
                </div>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden /> {s.label}
                  </span>
                  <span className="text-faint">{j.clusters.length} trends</span>
                </div>
                <ul className="space-y-1.5">
                  {j.clusters.slice(0, 3).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{c.theme_name}</span>
                      <LifecycleChip lifecycle={c.lifecycle} className="shrink-0 px-0 py-0 text-[11px] text-muted" />
                    </li>
                  ))}
                  {j.clusters.length > 3 && <li className="text-xs text-faint">+ {j.clusters.length - 3} more</li>}
                </ul>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                  Review this brief <span className="transition-transform group-hover:translate-x-1">→</span>
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
