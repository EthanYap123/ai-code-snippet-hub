/**
 * Integration tests against a real (in-memory) Postgres with pgvector, using the
 * offline engine so no API key or network is needed. They cover what unit tests
 * can't: the SKIP LOCKED job queue, ownership rules, the free-tier guard and
 * hybrid vector + full-text search.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { blockRemote, countHit, remoteBlockedFor, takeRemoteCalls } from "../../src/lib/ai/guard";
import { SEED_SNIPPETS, seedIfEmpty } from "../../src/lib/seed";
import { createSnippet, deleteSnippet, ownedBy, searchSnippets } from "../../src/lib/snippets";
import { claimJob, drainQueue, enqueue } from "../../src/lib/worker";
import { createTestDb, type TestDb } from "../helpers/db";

// Force the offline engine even if a developer has GEMINI_API_KEY in their shell.
process.env.AI_PROVIDER = "local";

let db: TestDb;

const count = async (sql: string, params: unknown[] = []) =>
  (await db.query<{ n: number }>(sql, params))[0].n;

before(async () => {
  db = await createTestDb();
  await seedIfEmpty(db);
});

after(async () => {
  await db.close();
});

describe("seeding", () => {
  it("is idempotent, so several serverless instances can call it", async () => {
    await seedIfEmpty(db);
    assert.equal(await count(`SELECT count(*)::int AS n FROM snippets WHERE is_seed`), SEED_SNIPPETS.length);
  });
});

describe("job queue", () => {
  const resetJobs = () => db.query(`UPDATE jobs SET status = 'queued', locked_at = NULL, attempts = 0, run_after = now()`);

  it("never hands the same job to two workers", async () => {
    const a = await claimJob(db);
    const b = await claimJob(db);
    assert.ok(a && b);
    assert.notEqual(a.id, b.id);
    assert.equal(a.attempts, 1);
    await resetJobs();
  });

  it("reclaims a job whose worker died mid-run", async () => {
    const job = await claimJob(db);
    assert.ok(job);
    // Simulate a killed serverless function: the lock is old and nobody finished.
    await db.query(`UPDATE jobs SET locked_at = now() - interval '5 minutes' WHERE id = $1`, [job.id]);
    let reclaimed = null;
    for (let i = 0; i <= SEED_SNIPPETS.length && !reclaimed; i++) {
      const next = await claimJob(db);
      if (next?.id === job.id) reclaimed = next;
    }
    assert.ok(reclaimed, "the stale job was never reclaimed");
    assert.equal(reclaimed.attempts, 2);
    await resetJobs();
  });

  it("does not run a job before its backoff delay", async () => {
    await db.query(`UPDATE jobs SET run_after = now() + interval '1 hour'`);
    assert.equal(await claimJob(db), null);
    await resetJobs();
  });

  it("documents, tags and embeds every seeded snippet", async () => {
    const result = await drainQueue(db);
    assert.equal(result.processed, SEED_SNIPPETS.length);
    assert.equal(result.failed, 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM snippets WHERE status = 'ready'`), SEED_SNIPPETS.length);
    assert.equal(await count(`SELECT count(*)::int AS n FROM documentation`), SEED_SNIPPETS.length);
    assert.equal(await count(`SELECT count(*)::int AS n FROM snippet_embeddings`), SEED_SNIPPETS.length);
    assert.equal(await count(`SELECT count(DISTINCT snippet_id)::int AS n FROM snippet_tags`), SEED_SNIPPETS.length);
  });

  it("re-queues a snippet without leaving duplicate pending jobs", async () => {
    const [{ id }] = await db.query<{ id: string }>(`SELECT id FROM snippets LIMIT 1`);
    await enqueue(db, id);
    await enqueue(db, id);
    assert.equal(await count(`SELECT count(*)::int AS n FROM jobs WHERE snippet_id = $1 AND status = 'queued'`, [id]), 1);
    await drainQueue(db);
  });
});

describe("hybrid search", () => {
  const expectations: [string, RegExp][] = [
    ["wait until the user stops typing", /debounce/i],
    ["retry a flaky call with backoff", /retry/i],
    ["check a login token on every request", /jwt|auth/i],
  ];
  for (const [query, expected] of expectations) {
    it(`ranks the right snippet first for ${JSON.stringify(query)}`, async () => {
      const results = await searchSnippets(db, query, null);
      assert.ok(results.length > 0, "no results");
      assert.match(results[0].snippet.title, expected);
    });
  }

  it("returns results best-first and drops weak matches", async () => {
    const results = await searchSnippets(db, "debounce", null);
    const scores = results.map((r) => r.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    for (const s of scores) assert.ok(s >= scores[0] * 0.6);
  });
});

describe("ownership", () => {
  it("lets visitors delete their own snippets but never the curated ones", async () => {
    const id = await createSnippet(db, {
      title: "Mine",
      language: "javascript",
      code: "const mine = () => 'mine';",
      visitorId: "visitor-a",
      ipHash: "hash-a",
    });
    assert.deepEqual(await ownedBy(db, id, "visitor-a"), { exists: true, owner: true });
    assert.deepEqual(await ownedBy(db, id, "visitor-b"), { exists: true, owner: false });
    assert.deepEqual(await ownedBy(db, id, null), { exists: true, owner: false });

    const [seed] = await db.query<{ id: string }>(`SELECT id FROM snippets WHERE is_seed LIMIT 1`);
    assert.equal((await ownedBy(db, seed.id, "visitor-a")).owner, false);

    await deleteSnippet(db, id);
    assert.deepEqual(await ownedBy(db, id, "visitor-a"), { exists: false, owner: false });
  });
});

describe("free-tier guard", () => {
  beforeEach(async () => {
    await db.query(`DELETE FROM ai_usage`);
    await db.query(`DELETE FROM rate_limits`);
  });

  it("stops handing out Gemini calls once the daily budget is spent", async () => {
    process.env.GEMINI_DAILY_LIMIT = "5";
    try {
      assert.equal(await takeRemoteCalls(db, 2), true); // 2
      assert.equal(await takeRemoteCalls(db, 2), true); // 4
      assert.equal(await takeRemoteCalls(db, 2), false); // would be 6
      assert.equal(await takeRemoteCalls(db, 1), true); // exactly 5
    } finally {
      delete process.env.GEMINI_DAILY_LIMIT;
    }
  });

  it("blocks every remote call while the provider is cooling down", async () => {
    await blockRemote(db, 60);
    assert.ok((await remoteBlockedFor(db)) > 50);
    assert.equal(await takeRemoteCalls(db, 1), false);
  });

  it("counts rate-limit hits per visitor and per window", async () => {
    assert.equal(await countHit(db, "submit", "visitor-a", 3600), 1);
    assert.equal(await countHit(db, "submit", "visitor-a", 3600), 2);
    assert.equal(await countHit(db, "submit", "visitor-b", 3600), 1);
    assert.equal(await countHit(db, "search", "visitor-a", 60), 1);
  });
});
