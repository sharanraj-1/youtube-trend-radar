"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "This week", short: "Brief" },
  { href: "/briefs", label: "Archive", short: "Archive" },
  { href: "/runs", label: "Run log", short: "Runs" },
  { href: "/architecture", label: "How it works", short: "How" },
  { href: "/settings", label: "Admin", short: "Admin" },
] as const;

export function ActiveNavLinks() {
  return <NavLinks path={usePathname()} />;
}

export function NavLinks({ path }: { path: string | null }) {
  const active = (href: string) => path !== null && (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav aria-label="Main" className="w-full sm:ml-auto sm:w-auto">
      <ul className="flex items-center justify-between gap-0.5 rounded-full bg-surface-sunk p-1 text-[13px] sm:justify-end">
        {NAV.map((n) => {
          const on = active(n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-all duration-200 ${
                  on ? "bg-surface-strong text-text shadow-sm ring-1 ring-border" : "text-muted hover:text-text"
                }`}
              >
                <span className="sm:hidden">{n.short}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
