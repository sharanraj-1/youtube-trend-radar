import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BriefView } from "@/components/BriefView";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { briefById } from "@/lib/queries";
import type { BriefJson } from "@/lib/render/types";

export default function BriefPage(props: PageProps<"/briefs/[id]">) {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Brief params={props.params} />
    </Suspense>
  );
}

async function Brief({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return <NotFound />;
  try {
    const brief = await briefById(n);
    if (!brief) return <NotFound />;
    return (
      <div className="space-y-4">
        <Link href="/briefs" className="text-sm text-muted hover:text-text">
          ← All briefs
        </Link>
        <BriefView brief={brief.json as BriefJson} createdAt={brief.createdAt} />
      </div>
    );
  } catch {
    return <ErrorState what="this brief" />;
  }
}

function NotFound() {
  return (
    <EmptyState title="Brief not found">
      It may have been removed. <Link className="underline" href="/briefs">See all briefs</Link>.
    </EmptyState>
  );
}
