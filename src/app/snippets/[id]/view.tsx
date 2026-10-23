"use client";

import { ArrowLeft, Check, Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { LanguageBadge, StatusBadge, TagChip } from "@/components/badges";
import { CodeBlock } from "@/components/code-block";
import { EmptyState, ErrorState, Skeleton } from "@/components/states";
import { TimeAgo } from "@/components/time-ago";
import { useToast } from "@/components/toast";
import { ApiClientError, send } from "@/lib/fetcher";
import { languageLabel } from "@/lib/languages";
import type { SnippetDetail, SnippetStatus } from "@/lib/types";

const pending = (s?: SnippetStatus) => s === "queued" || s === "processing";

/** Renders `inline code` spans inside generated prose. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split(/(`[^`]+`)/g).map((part, j) =>
            part.startsWith("`") && part.endsWith("`") ? (
              <code key={j} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">
                {part.slice(1, -1)}
              </code>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </>
  );
}

export function SnippetView() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, mutate } = useSWR<SnippetDetail>(`/api/snippets/${id}`, {
    refreshInterval: (d) => (pending(d?.status) ? 1500 : 0),
    keepPreviousData: false,
  });

  if (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return (
        <div className="flex flex-col gap-6">
          <BackLink />
          <EmptyState title="Snippet not found">
            It may have been deleted.{" "}
            <Link href="/" className="text-accent underline-offset-2 hover:underline">
              Back to the library
            </Link>
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </div>
    );
  }
  if (isLoading || !data) return <SnippetViewSkeleton />;

  const s = data;
  return (
    <article className="flex flex-col gap-6">
      <title>{`${s.title} · Snippet Hub`}</title>
      <BackLink />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LanguageBadge language={s.language} />
          <StatusBadge status={s.status} />
          <span className="text-xs text-muted">
            by {s.author.displayName} · <TimeAgo iso={s.createdAt} /> · {s.lines} lines
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">{s.title}</h1>
          {s.canDelete && <OwnerActions snippet={s} onChange={() => mutate()} />}
        </div>
        {s.docs && (
          <div className="max-w-3xl text-muted">
            <Prose text={s.docs.summary} />
          </div>
        )}
        {s.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.tags.map((t) => (
              <TagChip key={t} tag={t} href={`/?tag=${encodeURIComponent(t)}`} />
            ))}
          </div>
        )}
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <CodeBlock html={s.codeHtml} code={s.code} title={languageLabel(s.language)} />
          {s.docs && <Docs snippet={s} />}
          {!s.docs && pending(s.status) && <Pipeline status={s.status} />}
          {s.status === "failed" && (
            <ErrorState
              message={`Documentation could not be generated${s.error ? `: ${s.error}` : "."}${
                s.canDelete ? " Use Regenerate to try again." : ""
              }`}
            />
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {s.docs && pending(s.status) && <Pipeline status={s.status} compact />}
          <Meta snippet={s} />
          <Related snippet={s} />
        </aside>
      </div>
    </article>
  );
}

function BackLink() {
  return (
    <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden /> Library
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Docs({ snippet }: { snippet: SnippetDetail }) {
  const d = snippet.docs!;
  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
      <Section title="How it works">
        <div className="flex flex-col gap-3 leading-relaxed">
          <Prose text={d.explanation} />
        </div>
      </Section>

      {d.params.length > 0 && (
        <Section title="Parameters">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody>
                {d.params.map((p) => (
                  <tr key={p.name} className="border-t border-border first:border-t-0">
                    <td className="whitespace-nowrap py-2 pr-4 align-top font-mono text-[13px]">{p.name}</td>
                    <td className="whitespace-nowrap py-2 pr-4 align-top font-mono text-[12px] text-muted">{p.type ?? "—"}</td>
                    <td className="py-2 align-top text-muted">
                      <Prose text={p.description} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {(d.returns || d.complexity) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {d.returns && (
            <Section title="Returns">
              <div className="text-sm leading-relaxed">
                <Prose text={d.returns} />
              </div>
            </Section>
          )}
          {d.complexity && (
            <Section title="Complexity">
              <p className="text-sm leading-relaxed">{d.complexity}</p>
            </Section>
          )}
        </div>
      )}

      {d.usage && snippet.usageHtml && (
        <Section title="Usage">
          <CodeBlock html={snippet.usageHtml} code={d.usage} numbered={false} title="Example" />
        </Section>
      )}

      {d.notes.length > 0 && (
        <Section title="Notes">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed marker:text-muted">
            {d.notes.map((n, i) => (
              <li key={i}>
                <Prose text={n} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

const STEPS = [
  { key: "queued", label: "Queued for the worker" },
  { key: "processing", label: "Writing docs & extracting tags" },
  { key: "embedding", label: "Embedding for semantic search" },
] as const;

function Pipeline({ status, compact }: { status: SnippetStatus; compact?: boolean }) {
  const active = status === "queued" ? 0 : 1;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5" role="status" aria-live="polite">
      <p className="text-sm font-medium">{compact ? "Regenerating…" : "Generating documentation…"}</p>
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, i) => {
          const done = i < active;
          const current = i === active || (active === 1 && i === 2);
          return (
            <li key={step.key} className={`flex items-center gap-2.5 text-sm ${done || current ? "text-fg" : "text-muted"}`}>
              {done ? (
                <Check className="size-4 text-accent" aria-hidden />
              ) : current ? (
                <Loader2 className="size-4 animate-spin text-warn motion-reduce:animate-none" aria-hidden />
              ) : (
                <span className="size-4 rounded-full border border-border-strong" aria-hidden />
              )}
              {step.label}
            </li>
          );
        })}
      </ol>
      {!compact && (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      )}
    </div>
  );
}

function Meta({ snippet }: { snippet: SnippetDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Language", languageLabel(snippet.language)],
    ["Docs model", snippet.docs?.model ?? "—"],
    ["Embedding", snippet.embeddingModel ? `${snippet.embeddingModel} · 768-d` : "—"],
    ["Updated", <TimeAgo key="u" iso={snippet.updatedAt} />],
  ];
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Details</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-muted">{k}</dt>
            <dd className="truncate text-right font-mono text-[12px] leading-5">{v}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

function Related({ snippet }: { snippet: SnippetDetail }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Semantically related</h2>
      {snippet.related.length === 0 ? (
        <p className="text-sm text-muted">{pending(snippet.status) ? "Available once the embedding is ready." : "Nothing related yet."}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {snippet.related.map((r) => (
            <li key={r.id}>
              <Link href={`/snippets/${r.id}`} className="-mx-2 flex flex-col gap-0.5 rounded-md px-2 py-2 transition hover:bg-surface-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{r.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{Math.round(r.score * 100)}%</span>
                </span>
                <LanguageBadge language={r.language} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnerActions({ snippet, onChange }: { snippet: SnippetDetail; onChange: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"delete" | "regen" | null>(null);

  const regenerate = async () => {
    setBusy("regen");
    try {
      await send(`/api/snippets/${snippet.id}/reprocess`, "POST");
      toast("Regenerating documentation…");
      onChange();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await send(`/api/snippets/${snippet.id}`, "DELETE");
      void mutate(() => true);
      toast("Snippet deleted");
      router.push("/");
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(null);
      setConfirming(false);
    }
  };

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition disabled:opacity-60";
  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Delete this snippet?</span>
        <button onClick={() => setConfirming(false)} className={`${btn} border-border`} disabled={busy !== null}>
          Cancel
        </button>
        <button onClick={remove} className={`${btn} border-danger bg-danger text-white`} disabled={busy !== null}>
          {busy === "delete" && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Delete
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={regenerate}
        disabled={busy !== null || pending(snippet.status)}
        className={`${btn} border-border hover:border-border-strong`}
      >
        <RefreshCw className={`size-4 ${busy === "regen" ? "animate-spin" : ""}`} aria-hidden />
        Regenerate
      </button>
      <button onClick={() => setConfirming(true)} className={`${btn} border-border text-danger hover:border-danger`}>
        <Trash2 className="size-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">Delete</span>
      </button>
    </div>
  );
}

export function SnippetViewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-4 w-16" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
