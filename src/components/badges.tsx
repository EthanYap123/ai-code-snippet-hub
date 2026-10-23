import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { languageLabel } from "@/lib/languages";
import type { SnippetStatus } from "@/lib/types";

const LANGUAGE_COLORS: Record<string, string> = {
  javascript: "#e5c536",
  typescript: "#3178c6",
  tsx: "#58c4dc",
  python: "#3572a5",
  java: "#b07219",
  go: "#00add8",
  rust: "#dea584",
  c: "#8f8f8f",
  cpp: "#f34b7d",
  csharp: "#178600",
  php: "#4f5d95",
  ruby: "#cc342d",
  kotlin: "#a97bff",
  swift: "#f05138",
  sql: "#e38c00",
  bash: "#89e051",
  powershell: "#2c7bd6",
  html: "#e34c26",
  css: "#663399",
  json: "#9a9a9a",
  yaml: "#cb171e",
  dockerfile: "#384d54",
  markdown: "#4a8fd6",
};

export function LanguageBadge({ language }: { language: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="size-2.5 rounded-full" style={{ background: LANGUAGE_COLORS[language] ?? "#8a8a8a" }} aria-hidden />
      {languageLabel(language)}
    </span>
  );
}

export function StatusBadge({ status }: { status: SnippetStatus }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-accent">
        <CheckCircle2 className="size-3.5" aria-hidden /> Documented
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-danger">
        <AlertTriangle className="size-3.5" aria-hidden /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warn">
      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      {status === "queued" ? "Queued" : "Generating docs"}
    </span>
  );
}

export function TagChip({ tag, active, href }: { tag: string; active?: boolean; href?: string }) {
  const cls = `inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] transition ${
    active ? "border-accent bg-accent-soft text-fg" : "border-border text-muted hover:border-border-strong hover:text-fg"
  }`;
  if (!href) return <span className={cls}>#{tag}</span>;
  return (
    <Link href={href} className={cls} aria-current={active ? "true" : undefined}>
      #{tag}
    </Link>
  );
}
