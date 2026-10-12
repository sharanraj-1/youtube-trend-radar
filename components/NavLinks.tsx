"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "This week" },
  { href: "/briefs", label: "Archive" },
  { href: "/runs", label: "Run log" },
  { href: "/architecture", label: "How it works" },
] as const;

export function ActiveNavLinks() {
  return <NavLinks path={usePathname()} />;
}

export function NavLinks({ path }: { path: string | null }) {
  const active = (href: string) => path !== null && (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav aria-label="Main" className="-mx-2 flex w-full flex-wrap gap-y-1 text-sm sm:mx-0 sm:w-auto sm:flex-1 sm:justify-end">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active(n.href) ? "page" : undefined}
          className={`whitespace-nowrap px-2 py-1 transition-colors ${
            active(n.href) ? "text-text underline decoration-accent decoration-2 underline-offset-[6px]" : "text-muted hover:text-text"
          }`}
        >
          {n.label}
        </Link>
      ))}
      <Link
        href="/settings"
        aria-current={active("/settings") ? "page" : undefined}
        className={`whitespace-nowrap px-2 py-1 ${active("/settings") ? "text-text" : "text-faint hover:text-text"}`}
      >
        Admin
      </Link>
    </nav>
  );
}
