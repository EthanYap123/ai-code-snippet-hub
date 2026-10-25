import "server-only";
import { GUARD_SCHEMA } from "./ai/guard";
import { SCHEMA } from "./schema";

/**
 * Tiny database adapter so the rest of the app only ever sees `query(sql, params)`.
 *
 * - With DATABASE_URL set it talks to Postgres + pgvector over Neon's HTTP driver
 *   (works in serverless functions without connection pooling).
 * - Without it, it boots PGlite (Postgres compiled to WASM) with the pgvector
 *   extension, persisted to ./.data/pglite, so local dev needs no Docker.
 */
export interface Db {
  kind: "postgres" | "pglite";
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

type DbGlobal = typeof globalThis & {
  __hubDb?: Promise<Db>;
  __hubDbReady?: Promise<void>;
};
const g = globalThis as DbGlobal;

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return {
      kind: "postgres",
      query: async <T,>(text: string, params: unknown[] = []) =>
        (await sql.query(text, params)) as T[],
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  // Serverless file systems are read-only, so fall back to memory there.
  const dataDir = process.env.PGLITE_DATA_DIR || (process.env.VERCEL ? "memory://" : "./.data/pglite");
  if (!dataDir.startsWith("memory://")) {
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(dataDir), { recursive: true });
  }
  const pg = await PGlite.create(dataDir, { extensions: { vector } });
  return {
    kind: "pglite",
    query: async <T,>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
  };
}

function getConnection(): Promise<Db> {
  g.__hubDb ??= connect().catch((err) => {
    g.__hubDb = undefined;
    throw err;
  });
  return g.__hubDb;
}

/** Returns a connection with the schema applied and the demo data seeded. */
export async function getDb(): Promise<Db> {
  const db = await getConnection();
  g.__hubDbReady ??= prepare(db).catch((err) => {
    g.__hubDbReady = undefined;
    throw err;
  });
  await g.__hubDbReady;
  return db;
}

async function prepare(db: Db) {
  // Neon's HTTP driver runs one statement per request, so apply them one by one.
  for (const statement of [...SCHEMA, ...GUARD_SCHEMA]) await db.query(statement);
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db);

  // The offline engine handles the demo data in well under a second, so finish it
  // before the first response. Remote engines are drained in the background.
  const { drainQueue } = await import("./worker");
  const { primaryEngine } = await import("./ai");
  if (primaryEngine().id === "local") await drainQueue(db);
}
