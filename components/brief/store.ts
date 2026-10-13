"use client";

import { useMemo, useSyncExternalStore } from "react";

// Tiny localStorage-backed stores, read through useSyncExternalStore so the server render and the first
// client render agree (no hydration mismatch) and other tabs stay in sync.
const EVENT = "tr-store-change";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / storage blocked: state still lives for this visit via the caller
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useJson<T>(key: string, fallback: T): T {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  return useMemo(() => {
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
    // fallback is a stable literal at call sites
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
}

export interface PickedIdea {
  clusterId: number;
  theme: string;
  idea: string;
}

export const ideasKey = (briefId: number) => `tr-ideas-${briefId}`;
export const chatKey = (briefId: number) => `tr-chat-${briefId}`;
export const ideaId = (p: Pick<PickedIdea, "clusterId" | "idea">) => `${p.clusterId}::${p.idea}`;
