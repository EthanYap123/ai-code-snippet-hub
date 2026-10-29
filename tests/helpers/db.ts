import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { GUARD_SCHEMA } from "../../src/lib/ai/guard";
import type { Db } from "../../src/lib/db";
import { SCHEMA } from "../../src/lib/schema";

export type TestDb = Db & { close: () => Promise<void> };

/**
 * A fresh, in-memory Postgres (PGlite + pgvector) with the real schema applied.
 * Each test file creates its own, so tests never share state and need no Docker,
 * no DATABASE_URL and no API key.
 */
export async function createTestDb(): Promise<TestDb> {
  const pg = await PGlite.create("memory://", { extensions: { vector } });
  const db: TestDb = {
    kind: "pglite",
    query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    close: () => pg.close(),
  };
  for (const statement of [...SCHEMA, ...GUARD_SCHEMA]) await db.query(statement);
  return db;
}
