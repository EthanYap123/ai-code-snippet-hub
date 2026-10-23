"use client";

import { useSyncExternalStore } from "react";

const UNITS: [number, string][] = [
  [60 * 60 * 24 * 365, "y"],
  [60 * 60 * 24 * 30, "mo"],
  [60 * 60 * 24, "d"],
  [60 * 60, "h"],
  [60, "m"],
];

function format(iso: string, now: number): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  for (const [secs, label] of UNITS) if (s >= secs) return `${Math.floor(s / secs)}${label} ago`;
  return "just now";
}

// A shared minute ticker so every timestamp updates together without re-fetching.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  now = Date.now();
  timer ??= setInterval(() => {
    now = Date.now();
    listeners.forEach((l) => l());
  }, 30_000);
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  // Server render uses no clock (empty) to avoid hydration mismatches.
  const current = useSyncExternalStore(subscribe, () => now, () => 0);
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={className} suppressHydrationWarning>
      {current ? format(iso, current) : ""}
    </time>
  );
}
