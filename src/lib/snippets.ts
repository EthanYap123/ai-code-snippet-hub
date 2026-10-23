import "server-only";
import { enginesByEmbedModel, primaryEngine } from "./ai";
import { tokenize } from "./ai/local";
import type { Db } from "./db";
import { highlight } from "./highlight";
import type {
  Documentation,
  ListResponse,
  RelatedSnippet,
  SearchResult,
  SnippetCard,
  SnippetDetail,
  Stats,
  TagCount,
} from "./types";
import { toVectorLiteral } from "./vector";

const PREVIEW_LINES = 8;

const CARD_COLUMNS = `
  s.id, s.title, s.language, s.status, s.created_at, s.updated_at, s.is_seed, s.visitor_id,
  left(s.code, 900) AS code_head,
  (length(s.code) - length(replace(s.code, chr(10), '')) + 1)::int AS lines,
  d.summary, u.handle, u.display_name,
  COALESCE((SELECT array_agg(t.name ORDER BY st.position, t.name)
              FROM snippet_tags st JOIN tags t ON t.id = st.tag_id
             WHERE st.snippet_id = s.id), '{}') AS tags`;

const CARD_FROM = `
  FROM snippets s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN documentation d ON d.snippet_id = s.id`;

interface CardRow {
  id: string;
  title: string;
  language: string;
  status: SnippetCard["status"];
  created_at: Date | string;
  updated_at: Date | string;
  is_seed: boolean;
  visitor_id: string | null;
  code_head: string;
  lines: number;
  summary: string | null;
  handle: string;
  display_name: string;
  tags: string[];
}

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

function toCard(row: CardRow, visitorId: string | null): SnippetCard {
  return {
    id: row.id,
    title: row.title || "Untitled snippet",
    language: row.language,
    status: row.status,
    summary: row.summary,
    tags: row.tags ?? [],
    preview: row.code_head.split("\n").slice(0, PREVIEW_LINES).join("\n"),
    lines: row.lines,
    createdAt: iso(row.created_at),
    author: { handle: row.handle, displayName: row.display_name },
    canDelete: !row.is_seed && !!visitorId && row.visitor_id === visitorId,
  };
}

// ---------------------------------------------------------------------------

export async function listSnippets(
  db: Db,
  opts: { tag?: string | null; language?: string | null; limit: number; offset: number; visitorId: string | null },
): Promise<ListResponse> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.tag) {
    params.push(opts.tag);
    where.push(`EXISTS (SELECT 1 FROM snippet_tags st JOIN tags t ON t.id = st.tag_id WHERE st.snippet_id = s.id AND t.name = $${params.length})`);
  }
  if (opts.language) {
    params.push(opts.language);
    where.push(`s.language = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [{ total }] = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM snippets s ${whereSql}`, params);
  const rows = await db.query<CardRow>(
    `SELECT ${CARD_COLUMNS} ${CARD_FROM} ${whereSql}
      ORDER BY s.created_at DESC, s.id
      LIMIT ${opts.limit} OFFSET ${opts.offset}`,
    params,
  );
  const next = opts.offset + rows.length;
  return {
    items: rows.map((r) => toCard(r, opts.visitorId)),
    total,
    nextOffset: next < total ? next : null,
  };
}

export async function getSnippet(db: Db, id: string, visitorId: string | null): Promise<SnippetDetail | null> {
  const [row] = await db.query<CardRow & { code: string; error: string | null; embedding_model: string | null }>(
    `SELECT ${CARD_COLUMNS}, s.code, s.error,
            (SELECT model FROM snippet_embeddings WHERE snippet_id = s.id) AS embedding_model
       ${CARD_FROM} WHERE s.id = $1`,
    [id],
  );
  if (!row) return null;

  const [docRow] = await db.query<{
    summary: string;
    explanation: string;
    params: Documentation["params"];
    returns: string | null;
    usage: string | null;
    complexity: string | null;
    notes: string[];
    model: string;
    generated_at: Date | string;
  }>(`SELECT * FROM documentation WHERE snippet_id = $1`, [id]);

  const docs: Documentation | null = docRow
    ? {
        summary: docRow.summary,
        explanation: docRow.explanation,
        params: docRow.params ?? [],
        returns: docRow.returns,
        usage: docRow.usage,
        complexity: docRow.complexity,
        notes: docRow.notes ?? [],
        model: docRow.model,
        generatedAt: iso(docRow.generated_at),
      }
    : null;

  const [codeHtml, usageHtml, related] = await Promise.all([
    highlight(row.code, row.language),
    docs?.usage ? highlight(docs.usage, row.language) : Promise.resolve(null),
    relatedSnippets(db, id),
  ]);

  return {
    ...toCard(row, visitorId),
    code: row.code,
    codeHtml,
    usageHtml,
    docs,
    error: row.error,
    embeddingModel: row.embedding_model,
    related,
    updatedAt: iso(row.updated_at),
  };
}

async function relatedSnippets(db: Db, id: string): Promise<RelatedSnippet[]> {
  const rows = await db.query<{ id: string; title: string; language: string; summary: string | null; score: number }>(
    `WITH me AS (SELECT embedding, model FROM snippet_embeddings WHERE snippet_id = $1)
     SELECT s.id, s.title, s.language, d.summary,
            (1 - (e.embedding <=> (SELECT embedding FROM me)))::float AS score
       FROM snippet_embeddings e
       JOIN snippets s ON s.id = e.snippet_id
       LEFT JOIN documentation d ON d.snippet_id = s.id
      WHERE e.snippet_id <> $1 AND e.model = (SELECT model FROM me)
      ORDER BY e.embedding <=> (SELECT embedding FROM me)
      LIMIT 4`,
    [id],
  );
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

// ---------------------------------------------------------------------------
// Semantic search

const queryCache = new Map<string, number[]>();
const QUERY_CACHE_SIZE = 300;

async function embedQuery(model: string, q: string): Promise<number[] | null> {
  const key = `${model}\u0000${q}`;
  const hit = queryCache.get(key);
  if (hit) {
    // Refresh LRU position.
    queryCache.delete(key);
    queryCache.set(key, hit);
    return hit;
  }
  const engine = enginesByEmbedModel().get(model);
  if (!engine) return null;
  const [v] = await engine.embed([q], "query");
  queryCache.set(key, v);
  if (queryCache.size > QUERY_CACHE_SIZE) queryCache.delete(queryCache.keys().next().value!);
  return v;
}

/** OR-of-terms tsquery so partial keyword matches still count. */
function keywordQuery(q: string): string {
  const terms = [...new Set(tokenize(q))].filter((t) => /^[a-z0-9]+$/.test(t)).slice(0, 12);
  return terms.map((t) => `${t}:*`).join(" | ");
}

const SEMANTIC_WEIGHT = 0.8;
const MIN_SCORE = 0.2;
/** Keyword hits alone should not surface a snippet that means something else. */
const MIN_SEMANTIC = 0.15;

export async function searchSnippets(db: Db, q: string, visitorId: string | null, limit = 20): Promise<SearchResult[]> {
  const models = await db.query<{ model: string }>(`SELECT DISTINCT model FROM snippet_embeddings`);
  const tsq = keywordQuery(q);
  const results = new Map<string, SearchResult>();

  for (const { model } of models) {
    let vector: number[] | null;
    try {
      vector = await embedQuery(model, q);
    } catch (err) {
      // A remote embedding outage should degrade search, not break it.
      console.error(`query embedding failed for ${model}:`, (err as Error).message);
      vector = null;
    }
    if (!vector) continue;

    const rows = await db.query<CardRow & { semantic: number; keyword: number }>(
      `WITH cand AS (
         SELECT snippet_id, (1 - (embedding <=> $1::vector))::float AS semantic
           FROM snippet_embeddings
          WHERE model = $2
          ORDER BY embedding <=> $1::vector
          LIMIT 50
       )
       SELECT ${CARD_COLUMNS}, c.semantic,
              CASE WHEN $3 = '' THEN 0 ELSE ts_rank_cd(
                setweight(to_tsvector('english', s.title), 'A') ||
                setweight(to_tsvector('english', coalesce(d.summary, '')), 'B') ||
                setweight(to_tsvector('english', coalesce((SELECT string_agg(t.name, ' ')
                  FROM snippet_tags st JOIN tags t ON t.id = st.tag_id WHERE st.snippet_id = s.id), '')), 'A'),
                to_tsquery('english', $3), 32) END::float AS keyword
         FROM cand c
         JOIN snippets s ON s.id = c.snippet_id
         JOIN users u ON u.id = s.user_id
         LEFT JOIN documentation d ON d.snippet_id = s.id`,
      [toVectorLiteral(vector), model, tsq],
    );

    for (const row of rows) {
      const semantic = Math.max(0, Number(row.semantic));
      // ts_rank_cd with normalization 32 is rank/(rank+1); stretch it into 0..1.
      const keyword = Math.min(1, Number(row.keyword) * 2);
      const score = SEMANTIC_WEIGHT * semantic + (1 - SEMANTIC_WEIGHT) * keyword;
      const prev = results.get(row.id);
      if (!prev || prev.score < score) {
        results.set(row.id, { snippet: toCard(row, visitorId), score, semantic, keyword });
      }
    }
  }

  const sorted = [...results.values()].sort((a, b) => b.score - a.score);
  const top = sorted[0]?.score ?? 0;
  // Keep results that are both reasonably relevant and not far behind the best hit.
  return sorted.filter((r) => r.semantic >= MIN_SEMANTIC && r.score >= Math.max(MIN_SCORE, top * 0.6)).slice(0, limit);
}

// ---------------------------------------------------------------------------

export async function listTags(db: Db): Promise<TagCount[]> {
  return db.query<TagCount>(
    `SELECT t.name, count(*)::int AS count
       FROM tags t JOIN snippet_tags st ON st.tag_id = t.id
      GROUP BY t.name
      ORDER BY count DESC, t.name
      LIMIT 40`,
  );
}

export async function getStats(db: Db): Promise<Stats> {
  const [counts] = await db.query<{ snippets: number; ready: number; pending: number; failed: number; tags: number }>(
    `SELECT count(*)::int AS snippets,
            count(*) FILTER (WHERE status = 'ready')::int AS ready,
            count(*) FILTER (WHERE status IN ('queued', 'processing'))::int AS pending,
            count(*) FILTER (WHERE status = 'failed')::int AS failed,
            (SELECT count(*)::int FROM tags t WHERE EXISTS (SELECT 1 FROM snippet_tags st WHERE st.tag_id = t.id)) AS tags
       FROM snippets`,
  );
  const languages = await db.query<{ language: string; count: number }>(
    `SELECT language, count(*)::int AS count FROM snippets GROUP BY language ORDER BY count DESC, language`,
  );
  const engine = primaryEngine();
  return {
    ...counts,
    languages,
    engine: { id: engine.id, label: engine.label, docModel: engine.docModel, embedModel: engine.embedModel },
    database: db.kind,
  };
}

// ---------------------------------------------------------------------------

export async function guestUserId(db: Db): Promise<string> {
  const [row] = await db.query<{ id: string }>(`SELECT id FROM users WHERE handle = 'guest'`);
  return row.id;
}

export async function createSnippet(
  db: Db,
  input: { title: string; language: string; code: string; visitorId: string; ipHash: string },
): Promise<string> {
  const userId = await guestUserId(db);
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO snippets (user_id, title, auto_title, language, code, visitor_id, ip_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued') RETURNING id`,
    [userId, input.title, input.title === "", input.language, input.code, input.visitorId, input.ipHash],
  );
  await db.query(`INSERT INTO jobs (snippet_id) VALUES ($1)`, [row.id]);
  return row.id;
}

export async function recentSubmissions(db: Db, ipHash: string, visitorId: string): Promise<number> {
  const [row] = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM snippets
      WHERE (ip_hash = $1 OR visitor_id = $2) AND created_at > now() - interval '1 hour'`,
    [ipHash, visitorId],
  );
  return row.n;
}

/** Owner check used by delete and reprocess. */
export async function ownedBy(db: Db, id: string, visitorId: string | null) {
  const [row] = await db.query<{ is_seed: boolean; visitor_id: string | null }>(
    `SELECT is_seed, visitor_id FROM snippets WHERE id = $1`,
    [id],
  );
  if (!row) return { exists: false, owner: false };
  return { exists: true, owner: !row.is_seed && !!visitorId && row.visitor_id === visitorId };
}

export async function deleteSnippet(db: Db, id: string) {
  await db.query(`DELETE FROM snippets WHERE id = $1`, [id]);
  // Drop tags nobody uses any more.
  await db.query(`DELETE FROM tags t WHERE NOT EXISTS (SELECT 1 FROM snippet_tags st WHERE st.tag_id = t.id)`);
}

/** Whether a snippet has a job that should have been picked up by now. */
export async function hasOverdueJob(db: Db, id: string): Promise<boolean> {
  const [row] = await db.query<{ overdue: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM jobs WHERE snippet_id = $1 AND (
         (status = 'queued' AND run_after < now() - interval '3 seconds') OR
         (status = 'running' AND locked_at < now() - interval '2 minutes'))
     ) AS overdue`,
    [id],
  );
  return row.overdue;
}
