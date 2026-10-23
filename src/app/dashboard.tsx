"use client";

import { Cpu, Database, Layers, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { TagChip } from "@/components/badges";
import { SearchBar } from "@/components/search-bar";
import { SnippetCard } from "@/components/snippet-card";
import { CardGridSkeleton, EmptyState, ErrorState, Skeleton } from "@/components/states";
import { IS_DEMO } from "@/lib/fetcher";
import { languageLabel } from "@/lib/languages";
import type { ListResponse, SearchResponse, Stats, TagCount } from "@/lib/types";

const PAGE_SIZE = 12;
const EXAMPLES = [
  "how to connect to redis in nodejs",
  "wait until the user stops typing",
  "check a login token on every request",
  "retry a flaky call with backoff",
  "center something on the page",
];

function useQueryState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const set = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return {
    q: params.get("q") ?? "",
    tag: params.get("tag"),
    language: params.get("language"),
    set,
  };
}

export function Dashboard() {
  const { q, tag, language, set } = useQueryState();
  const search = useSWR<SearchResponse>(q ? `/api/search?q=${encodeURIComponent(q)}` : null);
  const onSearch = useCallback((value: string) => set({ q: value || null }), [set]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Find code by what it does</h1>
          <p className="max-w-2xl text-muted">
            Every snippet is documented, tagged and embedded in the background. Search by intent, not by remembering the
            function name.
          </p>
        </div>
        <SearchBar value={q} onChange={onSearch} loading={search.isLoading || search.isValidating} />
        {!q && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => set({ q: ex })}
                className="rounded-full border border-border bg-surface px-3 py-1 text-muted transition hover:border-border-strong hover:text-fg"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </section>

      {q ? <SearchResults q={q} search={search} /> : <Library tag={tag} language={language} set={set} />}
    </div>
  );
}

function SearchResults({ q, search }: { q: string; search: ReturnType<typeof useSWR<SearchResponse>> }) {
  const { data, error, isLoading, mutate } = search;
  // keepPreviousData shows the last results while the next query loads.
  const stale = data && data.query !== q;

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading && !data) return <CardGridSkeleton count={3} />;
  if (!data) return null;

  return (
    <section aria-labelledby="results-heading" className={`flex flex-col gap-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="results-heading" className="font-medium">
          {data.results.length} {data.results.length === 1 ? "match" : "matches"}
          <span className="font-normal text-muted"> for “{data.query}”</span>
        </h2>
        <span className="font-mono text-xs text-muted">{data.tookMs} ms · semantic + keyword</span>
      </div>
      {data.results.length === 0 ? (
        <EmptyState title="Nothing close enough">
          Try describing the behaviour differently, or{" "}
          <Link href="/new" className="text-accent underline-offset-2 hover:underline">
            add the snippet you were looking for
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.results.map((r) => (
            <SnippetCard key={r.snippet.id} snippet={r.snippet} score={r.score} />
          ))}
        </div>
      )}
    </section>
  );
}

function Library({
  tag,
  language,
  set,
}: {
  tag: string | null;
  language: string | null;
  set: (u: Record<string, string | null>) => void;
}) {
  const stats = useSWR<Stats>("/api/stats", {
    refreshInterval: (s) => (s && s.pending > 0 ? 2000 : 0),
  });
  const tags = useSWR<TagCount[]>("/api/tags");

  const filter = new URLSearchParams();
  if (tag) filter.set("tag", tag);
  if (language) filter.set("language", language);

  const list = useSWRInfinite<ListResponse>(
    (index, prev) => {
      if (prev && prev.nextOffset === null) return null;
      const p = new URLSearchParams(filter);
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String(index * PAGE_SIZE));
      return `/api/snippets?${p}`;
    },
    {
      // Poll while anything on screen is still being documented.
      refreshInterval: (pages?: ListResponse[]) =>
        pages?.some((pg) => pg.items.some((s) => s.status === "queued" || s.status === "processing")) ? 2000 : 0,
    },
  );

  const items = list.data?.flatMap((p) => p.items) ?? [];
  const total = list.data?.[0]?.total ?? 0;
  const hasMore = list.data?.at(-1)?.nextOffset != null;
  const loadingMore = list.isValidating && list.size > (list.data?.length ?? 0);
  const filtered = Boolean(tag || language);

  return (
    <div className="flex flex-col gap-8">
      <StatsRow stats={stats.data} error={stats.error} />

      <section aria-labelledby="library-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="library-heading" className="font-medium">
            {filtered ? "Filtered snippets" : "Recent snippets"}
            {list.data && <span className="font-normal text-muted"> · {total}</span>}
          </h2>
          <div className="flex items-center gap-2">
            {filtered && (
              <button onClick={() => set({ tag: null, language: null })} className="text-sm text-muted hover:text-fg">
                Clear filters
              </button>
            )}
            <label htmlFor="language-filter" className="sr-only">
              Filter by language
            </label>
            <select
              id="language-filter"
              value={language ?? ""}
              onChange={(e) => set({ language: e.target.value || null })}
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value="">All languages</option>
              {stats.data?.languages.map((l) => (
                <option key={l.language} value={l.language}>
                  {languageLabel(l.language)} ({l.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        <TagFilter tags={tags.data} loading={tags.isLoading} active={tag} />

        {list.error ? (
          <ErrorState message={list.error.message} onRetry={() => list.mutate()} />
        ) : !list.data ? (
          <div className="flex flex-col gap-3">
            {IS_DEMO && (
              <p className="text-sm text-muted" role="status">
                Starting Postgres in your browser… the first visit takes a few seconds.
              </p>
            )}
            <CardGridSkeleton />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={filtered ? "No snippets match these filters" : "No snippets yet"}>
            {filtered ? (
              "Try another tag or language."
            ) : (
              <Link href="/new" className="text-accent underline-offset-2 hover:underline">
                Add the first one
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((s) => (
                <SnippetCard key={s.id} snippet={s} />
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => list.setSize(list.size + 1)}
                disabled={loadingMore}
                className="mx-auto rounded-md border border-border-strong bg-surface px-4 py-2 text-sm transition hover:border-fg/40 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function TagFilter({ tags, loading, active }: { tags?: TagCount[]; loading: boolean; active: string | null }) {
  if (loading && !tags) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-16 rounded-full" />
        ))}
      </div>
    );
  }
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Filter by tag">
      {tags.slice(0, 24).map((t) => (
        <TagChip key={t.name} tag={t.name} active={t.name === active} href={t.name === active ? "/" : `/?tag=${encodeURIComponent(t.name)}`} />
      ))}
    </div>
  );
}

function StatsRow({ stats, error }: { stats?: Stats; error?: Error }) {
  if (error) return null;
  const items = [
    { icon: Layers, label: "Snippets", value: stats?.snippets, hint: !stats ? undefined : stats.pending > 0 ? `${stats.pending} processing` : `${stats.tags} tags` },
    { icon: Sparkles, label: "Docs engine", value: stats?.engine.label, hint: stats?.engine.docModel },
    { icon: Cpu, label: "Embeddings", value: "768-d vectors", hint: stats?.engine.embedModel },
    { icon: Database, label: "Vector store", value: stats ? (stats.database === "postgres" ? "Postgres" : "PGlite") : undefined, hint: "pgvector · HNSW" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ icon: Icon, label, value, hint }) => (
        <div key={label} className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <Icon className="size-3.5" aria-hidden />
            {label}
          </dt>
          <dd className="truncate font-semibold">{value ?? <Skeleton className="mt-1 h-5 w-20" />}</dd>
          <dd className="truncate font-mono text-[11px] text-muted">{hint ?? " "}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="mt-2 h-14 w-full rounded-xl" />
      </div>
      <CardGridSkeleton />
    </div>
  );
}
