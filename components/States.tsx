import Link from "next/link";

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="glass mx-auto max-w-2xl rounded-[2rem] px-6 py-14 text-center sm:px-10">
      <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="8.5" opacity=".5" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 12l5.5-5.5" />
        </svg>
      </div>
      <h1 className="font-serif text-4xl tracking-tight">{title}</h1>
      {children && <div className="mx-auto mt-3 max-w-md leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ what = "this page" }: { what?: string }) {
  return (
    <EmptyState title="We couldn't load this right now">
      Something went wrong while loading {what}. It&apos;s usually temporary, so try refreshing in a minute. If it keeps happening,{" "}
      <Link className="underline" href="/api/health">
        system status
      </Link>{" "}
      shows what&apos;s wrong.
    </EmptyState>
  );
}

export function LoadingBlock({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-5" aria-busy aria-label="Loading">
      <div className="skeleton h-6 w-48 rounded-full" />
      <div className="skeleton h-16 w-4/5 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: Math.max(2, Math.min(4, lines)) }, (_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-[2rem]" />
    </div>
  );
}
