import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "YouTube Trend Radar", template: "%s · Trend Radar" },
  description: "Sunday content-strategy brief: what's trending in AI tools, productivity apps and tech reviews for Indian audiences.",
};

const NAV = [
  { href: "/", label: "Brief" },
  { href: "/briefs", label: "Archive" },
  { href: "/runs", label: "Runs" },
  { href: "/architecture", label: "How it works" },
  { href: "/settings", label: "Settings" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
              <RadarIcon />
              <span>Trend Radar</span>
            </Link>
            {/* ml-auto (not justify-end) so an overflowing nav scrolls from its first item on narrow phones */}
            <nav className="-mr-2 flex min-w-0 flex-1 overflow-x-auto text-sm">
              <div className="ml-auto flex gap-1">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text">
                    {n.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-border py-6 text-center text-xs text-muted">
          Live data from the YouTube Data API v3 · analysis by Gemini Flash · the brief recommends, you decide.
        </footer>
      </body>
    </html>
  );
}

function RadarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="text-accent">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" opacity=".35" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.6" opacity=".6" />
      <path d="M12 12 L19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}
