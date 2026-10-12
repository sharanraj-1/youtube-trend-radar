import Link from "next/link";

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ what = "this page" }: { what?: string }) {
  return (
    <EmptyState title="We couldn't load the data right now">
      Something went wrong while loading {what}. It&apos;s usually temporary. Try again in a minute, or check{" "}
      <Link className="underline" href="/api/health">
        system health
      </Link>
      .
    </EmptyState>
  );
}

export function LoadingBlock({ lines = 4 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-busy>
      <div className="h-8 w-2/3 rounded bg-surface-2" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-24 rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}
