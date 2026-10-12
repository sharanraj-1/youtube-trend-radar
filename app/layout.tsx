import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { RadarMark } from "@/components/RadarMark";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Trend Radar — your Sunday brief", template: "%s · Trend Radar" },
  description: "What's moving in AI tools, apps and tech reviews on Indian YouTube this week, with the evidence.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#09090d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${instrument.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <div className="ambient" aria-hidden />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-strong focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
          {children}
        </main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="flex items-center gap-2">
              <RadarMark className="h-4 w-4" /> Trend Radar · live YouTube data, written up by Gemini Flash
            </span>
            <span>The brief recommends. You decide.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
