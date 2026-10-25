import { localEngine, primaryEngine, type Engine } from "./ai";
import { conceptWords } from "./ai/local";
import { EngineError } from "./ai/gemini";
import { blockRemote, remoteBlockedFor, takeRemoteCalls } from "./ai/guard";
import type { GeneratedDocs } from "./ai/types";
import type { Db } from "./db";
import { toVectorLiteral } from "./vector";

const MAX_ATTEMPTS = 3;
/** Remote calls one job makes: the write-up and its embedding. */
const CALLS_PER_JOB = 2;
/** Per-minute limits are waited out; anything longer falls back to the offline engine. */
const SHORT_COOLDOWN_S = 90;
/** A job stuck in `running` this long is assumed dead (e.g. a killed function). */
const STALE_LOCK = "2 minutes";

interface JobRow {
  id: number;
  snippet_id: string;
  attempts: number;
}

interface SnippetRow {
  id: string;
  title: string;
  language: string;
  code: string;
  title_from_author: boolean;
}

/** Builds the text that represents a snippet in vector space. */
export function embeddingText(engine: Engine, s: { title: string; code: string }, docs: GeneratedDocs): string {
  const head = [s.title, docs.summary, `Tags: ${docs.tags.join(", ")}`];
  if (engine.id === "local") {
    // Hashed embeddings only see words, so lean on the docs and concept words.
    return [...head, docs.explanation, conceptWords(s.code), s.code.slice(0, 2000)].join("\n");
  }
  return [...head, docs.explanation, s.code.slice(0, 6000)].join("\n\n");
}

/** Claims the next runnable job atomically (safe with several workers). */
async function claimJob(db: Db): Promise<JobRow | null> {
  const rows = await db.query<JobRow>(
    `UPDATE jobs
        SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id = (
        SELECT id FROM jobs
         WHERE (status = 'queued' AND run_after <= now())
            OR (status = 'running' AND locked_at < now() - interval '${STALE_LOCK}')
         ORDER BY run_after, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED)
      RETURNING id::int AS id, snippet_id, attempts`,
  );
  return rows[0] ?? null;
}

async function saveResults(db: Db, snippet: SnippetRow, docs: GeneratedDocs, engine: Engine, embedding: number[]) {
  const title = snippet.title_from_author ? snippet.title : docs.title.slice(0, 120);
  await db.query(
    `INSERT INTO documentation (snippet_id, summary, explanation, params, returns, usage, complexity, notes, model, generated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, now())
     ON CONFLICT (snippet_id) DO UPDATE SET
       summary = EXCLUDED.summary, explanation = EXCLUDED.explanation, params = EXCLUDED.params,
       returns = EXCLUDED.returns, usage = EXCLUDED.usage, complexity = EXCLUDED.complexity,
       notes = EXCLUDED.notes, model = EXCLUDED.model, generated_at = now()`,
    [
      snippet.id,
      docs.summary,
      docs.explanation,
      JSON.stringify(docs.params),
      docs.returns,
      docs.usage,
      docs.complexity,
      JSON.stringify(docs.notes),
      `${engine.id}:${engine.docModel}`,
    ],
  );

  await db.query(
    `INSERT INTO snippet_embeddings (snippet_id, model, embedding, created_at)
     VALUES ($1, $2, $3::vector, now())
     ON CONFLICT (snippet_id) DO UPDATE SET model = EXCLUDED.model, embedding = EXCLUDED.embedding, created_at = now()`,
    [snippet.id, engine.embedModel, toVectorLiteral(embedding)],
  );

  const tags = [...new Set(docs.tags.map(normalizeTag).filter(Boolean))].slice(0, 8);
  await db.query(`DELETE FROM snippet_tags WHERE snippet_id = $1`, [snippet.id]);
  if (tags.length) {
    await db.query(
      `INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING`,
      [tags],
    );
    await db.query(
      `INSERT INTO snippet_tags (snippet_id, tag_id, position)
       SELECT $1, t.id, x.ord::int
         FROM unnest($2::text[]) WITH ORDINALITY AS x(name, ord)
         JOIN tags t ON t.name = x.name
       ON CONFLICT DO NOTHING`,
      [snippet.id, tags],
    );
  }

  await db.query(
    `UPDATE snippets SET title = $2, status = 'ready', error = NULL, updated_at = now() WHERE id = $1`,
    [snippet.id, title],
  );
}

export function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9#+-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

async function enrich(db: Db, snippet: SnippetRow, engine: Engine) {
  const docs = await engine.document({
    title: snippet.title_from_author ? snippet.title : null,
    language: snippet.language,
    code: snippet.code,
  });
  const [embedding] = await engine.embed([embeddingText(engine, { title: docs.title, code: snippet.code }, docs)], "document");
  await saveResults(db, snippet, docs, engine, embedding);
}

async function requeue(db: Db, job: JobRow, snippetId: string, delaySeconds: number, message: string) {
  await db.query(
    `UPDATE jobs SET status = 'queued', last_error = $2, run_after = now() + ($3 || ' seconds')::interval, updated_at = now() WHERE id = $1`,
    [job.id, message, String(delaySeconds)],
  );
  await db.query(`UPDATE snippets SET status = 'queued', updated_at = now() WHERE id = $1`, [snippetId]);
}

/** Documents a snippet with the offline engine instead; false if even that failed. */
async function fallBack(db: Db, job: JobRow, snippet: SnippetRow, reason: string): Promise<boolean> {
  try {
    await enrich(db, snippet, localEngine);
    await db.query(`UPDATE jobs SET status = 'done', last_error = $2, updated_at = now() WHERE id = $1`, [job.id, `fell back to offline engine: ${reason}`]);
    return true;
  } catch {
    return false;
  }
}

async function runJob(db: Db, job: JobRow): Promise<"done" | "retry" | "failed"> {
  const [snippet] = await db.query<SnippetRow>(
    `SELECT id, title, language, code, NOT auto_title AS title_from_author FROM snippets WHERE id = $1`,
    [job.snippet_id],
  );
  if (!snippet) {
    await db.query(`UPDATE jobs SET status = 'done', updated_at = now() WHERE id = $1`, [job.id]);
    return "done";
  }
  await db.query(`UPDATE snippets SET status = 'processing', updated_at = now() WHERE id = $1`, [snippet.id]);

  const engine = primaryEngine();
  const remote = engine.id !== localEngine.id;
  if (remote) {
    // Free-tier protection: wait out a short rate limit, otherwise go offline.
    const wait = await remoteBlockedFor(db);
    if (wait > 0 && wait <= SHORT_COOLDOWN_S && job.attempts < MAX_ATTEMPTS) {
      await requeue(db, job, snippet.id, Math.ceil(wait), "waiting for the Gemini rate limit");
      return "retry";
    }
    if (wait > 0 || !(await takeRemoteCalls(db, CALLS_PER_JOB))) {
      const reason = wait > 0 ? "Gemini is rate limited" : "the daily Gemini budget is spent";
      if (await fallBack(db, job, snippet, reason)) return "done";
    }
  }

  try {
    await enrich(db, snippet, engine);
    await db.query(`UPDATE jobs SET status = 'done', last_error = NULL, updated_at = now() WHERE id = $1`, [job.id]);
    return "done";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable = !(err instanceof EngineError) || err.retryable;
    if (err instanceof EngineError && err.retryAfter) await blockRemote(db, err.retryAfter);

    if (retryable && job.attempts < MAX_ATTEMPTS) {
      // Exponential backoff: 5s, 20s, ...
      await requeue(db, job, snippet.id, 5 * 4 ** (job.attempts - 1), message);
      return "retry";
    }

    // Out of retries with the remote engine: keep the hub usable with the offline one.
    if (remote && (await fallBack(db, job, snippet, message))) return "done";
    await db.query(`UPDATE jobs SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`, [job.id, message]);
    await db.query(`UPDATE snippets SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [snippet.id, message.slice(0, 500)]);
    return "failed";
  }
}

type DrainGlobal = typeof globalThis & { __hubDraining?: Promise<DrainResult> };
const g = globalThis as DrainGlobal;

export interface DrainResult {
  processed: number;
  failed: number;
  retried: number;
}

/**
 * Processes queued jobs until the queue is empty or the time budget runs out.
 * Concurrent calls in the same process share one run.
 */
export function drainQueue(db: Db, budgetMs = 25_000): Promise<DrainResult> {
  g.__hubDraining ??= (async () => {
    const result: DrainResult = { processed: 0, failed: 0, retried: 0 };
    const started = Date.now();
    try {
      while (Date.now() - started < budgetMs) {
        const job = await claimJob(db);
        if (!job) break;
        const outcome = await runJob(db, job);
        if (outcome === "done") result.processed++;
        else if (outcome === "failed") result.failed++;
        else result.retried++;
      }
    } finally {
      g.__hubDraining = undefined;
    }
    return result;
  })();
  return g.__hubDraining;
}

/** Puts a snippet (back) on the queue. */
export async function enqueue(db: Db, snippetId: string) {
  await db.query(`UPDATE jobs SET status = 'done', updated_at = now() WHERE snippet_id = $1 AND status = 'queued'`, [snippetId]);
  await db.query(`INSERT INTO jobs (snippet_id) VALUES ($1)`, [snippetId]);
  await db.query(`UPDATE snippets SET status = 'queued', error = NULL, updated_at = now() WHERE id = $1`, [snippetId]);
}
