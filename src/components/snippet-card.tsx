"use client";

import Link from "next/link";
import type { SnippetCard as Card } from "@/lib/types";
import { LanguageBadge, StatusBadge } from "./badges";
import { TimeAgo } from "./time-ago";

export function SnippetCard({ snippet, score }: { snippet: Card; score?: number }) {
  return (
    <Link
      href={`/snippets/${snippet.id}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:border-border-strong hover:shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-2 p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <LanguageBadge language={snippet.language} />
          {score !== undefined ? (
            <span className="font-mono text-[11px] text-muted" title="Blended semantic + keyword relevance">
              {Math.round(score * 100)}% match
            </span>
          ) : (
            <StatusBadge status={snippet.status} />
          )}
        </div>
        <h3 className="truncate font-medium transition group-hover:text-accent">{snippet.title}</h3>
        <p className="line-clamp-2 min-h-10 text-sm text-muted">
          {snippet.summary?.replace(/`/g, "") ??
            (snippet.status === "failed" ? "Documentation could not be generated." : "Documentation is being generated…")}
        </p>
      </div>
      <pre className="mx-4 mb-3 max-h-28 overflow-hidden rounded-md bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-muted [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
        {snippet.preview}
      </pre>
      <div className="mt-auto flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
          {snippet.tags.slice(0, 3).map((t) => (
            <span key={t} className="truncate font-mono">
              #{t}
            </span>
          ))}
        </div>
        <TimeAgo iso={snippet.createdAt} className="shrink-0" />
      </div>
    </Link>
  );
}
