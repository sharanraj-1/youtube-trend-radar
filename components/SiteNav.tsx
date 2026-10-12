import { Suspense } from "react";
import Link from "next/link";
import { RadarMark } from "./RadarMark";
import { ActiveNavLinks, NavLinks } from "./NavLinks";

/** Floating glass nav. The shell renders statically; only the active-pill (usePathname) streams in. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="glass-strong mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-3 py-2 sm:flex-nowrap sm:rounded-full sm:px-2.5">
        <Link href="/" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2">
          <RadarMark className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-tight">Trend Radar</span>
        </Link>
        <Suspense fallback={<NavLinks path={null} />}>
          <ActiveNavLinks />
        </Suspense>
      </div>
    </header>
  );
}
