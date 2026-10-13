"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Decision } from "@/lib/render/guide";
import { chatKey, useJson, writeJson, type PickedIdea } from "./store";

interface Turn {
  role: "user" | "model";
  text: string;
}

const STARTERS = [
  "Turn my picks into 3 video titles I could film this week",
  "Write a 15-second hook for my strongest idea",
  "Combine my picks into one video with a clear structure",
  "What would make my take different from other creators?",
];

/** Minimal, safe markdown: paragraphs, bullet / numbered lists and **bold** (no HTML injection). */
function Rich({ text }: { text: string }) {
  const bold = (s: string, k: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${k}-${i}`}>{part.slice(2, -2)}</strong> : <Fragment key={`${k}-${i}`}>{part.replace(/\*/g, "")}</Fragment>,
    );
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`my-1.5 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
        {list.items.map((it, i) => (
          <li key={i}>{bold(it, `li${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  text.split("\n").forEach((line, i) => {
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      if (quote[1].trim())
        blocks.push(
          <blockquote key={`q${i}`} className="my-1.5 border-l-2 border-accent/60 pl-3 italic text-text/90">
            {bold(quote[1], `q${i}`)}
          </blockquote>,
        );
      return;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
      return;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${i}`} className="my-1.5">{bold(line, `p${i}`)}</p>);
  });
  flush();
  return <>{blocks}</>;
}

export function IdeaStudio({
  open,
  onOpenChange,
  briefId,
  picks,
  decisions,
  onRemovePick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  briefId: number;
  picks: PickedIdea[];
  decisions: Record<number, Decision>;
  onRemovePick: (p: PickedIdea) => void;
}) {
  const saved = useJson<Turn[]>(chatKey(briefId), []);
  const [live, setLive] = useState<Turn[] | null>(null); // in-flight conversation while streaming
  const turns = live ?? saved;
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendState, setSendState] = useState<{ status: "idle" | "sending" | "done" | "error"; text?: string }>({ status: "idle" });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const payload = (messages: Turn[]) => ({
    briefId,
    messages,
    selected: picks,
    decisions: Object.fromEntries(Object.entries(decisions).map(([k, v]) => [k, v])),
  });

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setError(null);
    setInput("");
    const history: Turn[] = [...turns, { role: "user", text: msg }];
    let reply = "";
    setLive([...history, { role: "model", text: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(history)) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "The AI couldn't answer right now.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += dec.decode(value, { stream: true });
        setLive([...history, { role: "model", text: reply }]);
      }
      writeJson(chatKey(briefId), [...history, { role: "model", text: reply.trim() || "(no reply)" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      writeJson(chatKey(briefId), reply ? [...history, { role: "model", text: reply }] : history);
      if (!reply) setInput(msg);
    } finally {
      setLive(null);
      setBusy(false);
    }
  }

  async function sendSummary() {
    if (turns.length === 0 && picks.length === 0) return;
    setSendState({ status: "sending" });
    const messages: Turn[] = turns.length ? turns : [{ role: "user", text: "I picked these ideas from the brief. Please summarise them as my plan." }];
    try {
      const res = await fetch("/api/chat/summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(messages)) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't send the summary.");
      const parts = [j.email?.sent ? "email ✓" : `email ✗ (${j.email?.error ?? "not sent"})`, j.telegram?.sent ? "Telegram ✓" : `Telegram ✗ (${j.telegram?.error ?? "not sent"})`];
      setSendState({ status: j.email?.sent || j.telegram?.sent ? "done" : "error", text: `“${j.summary.title}” · ${parts.join(" · ")}` });
    } catch (err) {
      setSendState({ status: "error", text: err instanceof Error ? err.message : "Couldn't send the summary." });
    }
  }

  function reset() {
    writeJson(chatKey(briefId), []);
    setSendState({ status: "idle" });
    setError(null);
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => onOpenChange(true)}
          className="btn-primary fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-2xl"
          aria-label={`Open Idea Studio${picks.length ? `, ${picks.length} ideas picked` : ""}`}
        >
          <Spark /> Idea Studio
          {picks.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/25 px-1.5 text-xs">{picks.length}</span>}
        </button>
      )}

      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] sm:bg-black/20" onClick={() => onOpenChange(false)} aria-hidden />}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Idea Studio chat"
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border border-border bg-bg-2/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 sm:inset-y-3 sm:right-3 sm:w-[460px] sm:rounded-[1.75rem] ${
          open ? "translate-x-0" : "pointer-events-none translate-x-[110%]"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="btn-primary grid h-9 w-9 place-items-center rounded-full">
            <Spark />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl leading-none tracking-tight">Idea Studio</h2>
            <p className="mt-1 text-xs text-muted">Bounce ideas with Gemini Flash · knows this week&apos;s brief</p>
          </div>
          {turns.length > 0 && (
            <button onClick={reset} className="rounded-full px-3 py-1.5 text-xs text-muted transition hover:bg-surface hover:text-text">
              New chat
            </button>
          )}
          <button onClick={() => onOpenChange(false)} aria-label="Close Idea Studio" className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-text">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </header>

        <div className="border-b border-border px-5 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Your picks · {picks.length}</p>
          {picks.length === 0 ? (
            <p className="text-xs text-muted">Tick ideas under &ldquo;Ideas for your video&rdquo; and they&apos;ll appear here as context.</p>
          ) : (
            <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {picks.map((p) => (
                <li key={`${p.clusterId}${p.idea}`} className="flex max-w-full items-center gap-1 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-xs">
                  <span className="truncate" title={p.idea}>
                    {p.idea}
                  </span>
                  <button onClick={() => onRemovePick(p)} aria-label={`Remove ${p.idea}`} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-faint hover:bg-surface-strong hover:text-text">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
          {turns.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted">
                Ask anything: titles, hooks, structure, thumbnails, or how to stand out. Your picks and this week&apos;s trends are already loaded.
              </p>
              <div className="grid gap-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm transition hover:-translate-y-0.5 hover:border-border-strong">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm leading-relaxed text-accent-ink">
                  {t.text}
                </div>
              ) : (
                <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-sm leading-relaxed">
                  {t.text ? <Rich text={t.text} /> : <TypingDots />}
                </div>
              ),
            )
          )}
          {error && <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-danger">{error}</p>}
        </div>

        <div className="space-y-3 border-t border-border px-4 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-2xl border border-border bg-surface-sunk p-2 focus-within:border-accent"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={busy ? "Thinking…" : "Bounce an idea…"}
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-faint"
              aria-label="Message"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="btn-primary grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:opacity-40">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
          <button
            onClick={sendSummary}
            disabled={sendState.status === "sending" || busy || (turns.length === 0 && picks.length === 0)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium transition hover:border-border-strong disabled:opacity-40"
          >
            {sendState.status === "sending" ? "Writing your summary…" : "Send a summary to my email & Telegram"}
          </button>
          {sendState.text && (
            <p className={`text-center text-xs ${sendState.status === "error" ? "text-danger" : "text-muted"}`}>
              {sendState.status === "done" ? "Sent! " : ""}
              {sendState.text}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".7" />
    </svg>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
