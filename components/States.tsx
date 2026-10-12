import Link from "next/link";

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-4 py-10">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{title}</h1>
      {children && <div className="max-w-xl leading-relaxed text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ what = "this page" }: { what?: string }) {
  return (
    <EmptyState title="We couldn't load this right now">
      Something went wrong while loading {what}. It&apos;s usually temporary, so try refreshing in a minute. If it keeps happening, the{" "}
      <Link className="underline" href="/api/health">
        system status
      </Link>{" "}
      shows what&apos;s wrong.
    </EmptyState>
  );
}

export function LoadingBlock({ lines = 4 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-busy aria-label="Loading">
      <div className="h-4 w-40 rounded bg-surface-2" />
      <div className="h-10 w-4/5 rounded bg-surface-2" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-5 rounded bg-surface-2" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
