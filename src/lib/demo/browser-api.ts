/**
 * The static GitHub Pages demo has no server, so this module answers the app's
 * `/api/*` requests inside the browser. It runs the same schema, seed data, worker
 * and SQL as the server build, on PGlite (Postgres + pgvector compiled to WASM)
 * persisted to IndexedDB, with the offline engine for docs and embeddings.
 */
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { Db } from "../db";
import { SCHEMA } from "../schema";
import { seedIfEmpty } from "../seed";
import {
  createSnippet,
  deleteSnippet,
  getSnippet,
  getStats,
  listSnippets,
  listTags,
  ownedBy,
  searchSnippets,
} from "../snippets";
import type { SearchResponse } from "../types";
import { parseListParams, parseNewSnippet, parseSearchQuery, UUID_RE } from "../validation";
import { drainQueue, enqueue } from "../worker";

/** Everything added in this browser belongs to this visitor. */
const VISITOR = "this-browser";
/** Short pause before the worker runs, so the processing pipeline is visible. */
const WORKER_DELAY_MS = 1200;

let dbPromise: Promise<Db> | undefined;

async function open(): Promise<Db> {
  const pg = await PGlite.create("idb://ai-code-snippet-hub", {
    extensions: { vector },
    // Don't wait for IndexedDB after every statement; it is flushed in the background.
    relaxedDurability: true,
  });
  const db: Db = {
    kind: "pglite",
    query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
  for (const statement of SCHEMA) await db.query(statement);
  await seedIfEmpty(db);
  // Document the example snippets in the background, like the server does.
  runWorkerSoon(db, 0);
  return db;
}

function getDemoDb(): Promise<Db> {
  dbPromise ??= open().catch((err) => {
    dbPromise = undefined;
    throw err;
  });
  return dbPromise;
}

function runWorkerSoon(db: Db, delay = WORKER_DELAY_MS) {
  setTimeout(() => {
    drainQueue(db).catch((err) => console.error("worker:", err));
  }, delay);
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (status: number, message: string, details?: unknown) =>
  json(details === undefined ? { error: message } : { error: message, details }, status);

async function route(method: string, url: URL, body: unknown): Promise<Response> {
  const db = await getDemoDb();
  const path = url.pathname.replace(/\/+$/, "");
  const detail = path.match(/^\/api\/snippets\/([^/]+)(\/reprocess)?$/);

  if (path === "/api/snippets" && method === "GET") {
    return json(await listSnippets(db, { ...parseListParams(url.searchParams), visitorId: VISITOR }));
  }
  if (path === "/api/snippets" && method === "POST") {
    const parsed = parseNewSnippet(body);
    if (!parsed.ok) return error(422, parsed.error, parsed.details);
    const id = await createSnippet(db, { ...parsed.value, visitorId: VISITOR, ipHash: "local" });
    runWorkerSoon(db);
    return json({ id, language: parsed.value.language }, 201);
  }
  if (detail) {
    const id = decodeURIComponent(detail[1]);
    if (!UUID_RE.test(id)) return error(404, "Snippet not found");
    if (detail[2] && method === "POST") {
      const { exists, owner } = await ownedBy(db, id, VISITOR);
      if (!exists) return error(404, "Snippet not found");
      if (!owner) return error(403, "The example snippets are read-only; add your own to regenerate it");
      await enqueue(db, id);
      runWorkerSoon(db);
      return json({ id, status: "queued" }, 202);
    }
    if (!detail[2] && method === "GET") {
      const snippet = await getSnippet(db, id, VISITOR);
      return snippet ? json(snippet) : error(404, "Snippet not found");
    }
    if (!detail[2] && method === "DELETE") {
      const { exists, owner } = await ownedBy(db, id, VISITOR);
      if (!exists) return error(404, "Snippet not found");
      if (!owner) return error(403, "The example snippets are read-only");
      await deleteSnippet(db, id);
      return new Response(null, { status: 204 });
    }
  }
  if (path === "/api/search" && method === "GET") {
    const parsed = parseSearchQuery(url.searchParams);
    if ("error" in parsed) return error(400, parsed.error);
    const started = performance.now();
    const results = await searchSnippets(db, parsed.q, VISITOR);
    const res: SearchResponse = { query: parsed.q, results, tookMs: Math.round(performance.now() - started) };
    return json(res);
  }
  if (path === "/api/tags" && method === "GET") return json(await listTags(db));
  if (path === "/api/stats" && method === "GET") return json(await getStats(db));
  if (path === "/api/health" && method === "GET") return json({ ok: true, database: "pglite", engine: "local" });

  return error(404, "Not found");
}

/** Drop-in replacement for `fetch` on `/api/*` URLs in the demo build. */
export async function demoFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = new URL(input, "http://demo.local");
  let body: unknown;
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      return error(400, "Request body must be JSON");
    }
  }
  try {
    return await route((init?.method ?? "GET").toUpperCase(), url, body);
  } catch (err) {
    console.error(err);
    return error(500, "The in-browser database hit a problem. Try reloading the page.");
  }
}
