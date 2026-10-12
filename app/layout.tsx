import type { Metadata } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });
const display = Newsreader({ variable: "--font-display", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Trend Radar — the Sunday brief", template: "%s · Trend Radar" },
  description: "What's moving in AI tools, apps and tech reviews on Indian YouTube this week, with the evidence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <SiteNav />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 pt-8 sm:px-6 sm:pt-12">
          {children}
        </main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-3xl flex-col gap-1 px-5 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
            <span>Live data from the YouTube Data API. Written up by Gemini Flash.</span>
            <span>The brief recommends; you decide.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
