"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked (e.g. insecure context); fail quietly.
    }
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition hover:bg-surface-2 hover:text-fg"
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <Check className="size-3.5 text-accent" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

/** Renders server-highlighted Shiki HTML inside a framed panel. */
export function CodeBlock({
  html,
  code,
  title,
  numbered = true,
}: {
  html: string;
  code: string;
  title?: React.ReactNode;
  numbered?: boolean;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="min-w-0 truncate text-xs text-muted">{title}</div>
        <CopyButton text={code} />
      </div>
      <div className={`code-block ${numbered ? "numbered" : ""}`} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
