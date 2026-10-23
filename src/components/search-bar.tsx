"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Search input that reports a debounced value. `/` or Ctrl/Cmd+K focuses it from
 * anywhere on the page; Escape clears it.
 */
export function SearchBar({
  value,
  onChange,
  loading,
}: {
  value: string;
  onChange: (q: string) => void;
  loading?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSent = useRef(value);

  // Follow outside changes (back/forward navigation, example chips).
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    const q = draft.trim();
    if (q === lastSent.current) return;
    const t = setTimeout(() => {
      lastSent.current = q;
      onChange(q);
    }, 250);
    return () => clearTimeout(t);
  }, [draft, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clear = () => {
    setDraft("");
    lastSent.current = "";
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        lastSent.current = draft.trim();
        onChange(draft.trim());
      }}
      className="group relative"
    >
      <label htmlFor="snippet-search" className="sr-only">
        Search snippets by what they do
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={inputRef}
        id="snippet-search"
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && clear()}
        placeholder="Describe what the code should do…"
        maxLength={200}
        className="h-14 w-full rounded-xl border border-border-strong bg-surface pl-12 pr-24 text-base shadow-sm outline-none transition placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
        {loading && <Loader2 className="size-4 animate-spin text-muted motion-reduce:animate-none" aria-label="Searching" />}
        {draft ? (
          <button type="button" onClick={clear} className="rounded p-1 text-muted hover:text-fg" aria-label="Clear search">
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted sm:inline">/</kbd>
        )}
      </div>
    </form>
  );
}
