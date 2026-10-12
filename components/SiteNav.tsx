import { Suspense } from "react";
import Link from "next/link";
import { ActiveNavLinks, NavLinks } from "./NavLinks";

/** Static header shell; only the active-link highlight (usePathname) streams in, as Cache Components requires. */
export function SiteNav() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-serif text-xl font-semibold tracking-tight">Trend Radar</span>
          <span className="hidden text-xs text-muted sm:inline">for tech creators</span>
        </Link>
        <Suspense fallback={<NavLinks path={null} />}>
          <ActiveNavLinks />
        </Suspense>
      </div>
    </header>
  );
}
