"use client";

import { useEffect, useId, useState } from "react";

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict", flowchart: { htmlLabels: true } });
        const { svg } = await mermaid.render(`m${id}`, chart);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed)
    return <pre className="overflow-x-auto rounded-2xl bg-surface-sunk p-4 text-xs">{chart}</pre>;
  if (!svg) return <div className="skeleton h-96 rounded-2xl" aria-busy />;
  return <div className="overflow-x-auto rounded-2xl p-2 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
