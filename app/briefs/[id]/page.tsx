import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BriefFlow } from "@/components/brief/BriefFlow";
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
  let brief: Awaited<ReturnType<typeof briefById>> | null = null;
  try {
    brief = await briefById(n);
  } catch {
    return <ErrorState what="this brief" />;
  }
  if (!brief) return <NotFound />;
  return (
    <div className="space-y-6">
      <Link href="/briefs" className="text-sm text-muted hover:text-text">
        ← All briefs
      </Link>
      <BriefFlow brief={brief.json as BriefJson} briefId={brief.id} createdAt={brief.createdAt.toISOString()} />
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState title="We couldn't find that brief">
      It may be from before our records start. <Link className="underline" href="/briefs">See all briefs</Link> or go to{" "}
      <Link className="underline" href="/">this week&apos;s brief</Link>.
    </EmptyState>
  );
}
