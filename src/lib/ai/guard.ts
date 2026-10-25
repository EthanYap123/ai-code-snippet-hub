import type { Db } from "../db";

/**
 * Keeps a public deployment inside a free-tier LLM quota. Counters live in Postgres
 * so every serverless instance shares them. Only the server applies these tables;
 * the in-browser demo never calls a remote engine.
 */
export const GUARD_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS ai_usage (
    day           date PRIMARY KEY,
    calls         int  NOT NULL DEFAULT 0,
    -- Set after the provider answers 429; remote calls are skipped until then.
    blocked_until timestamptz
  )`,

  `CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       text NOT NULL,
    key          text NOT NULL,
    window_start timestamptz NOT NULL,
    hits         int  NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, key, window_start)
  )`,
];

/** Remote calls allowed per UTC day across all visitors (0 disables the cap). */
function dailyLimit(): number {
  return Number(process.env.GEMINI_DAILY_LIMIT ?? 300);
}

/**
 * Reserves `n` remote calls from today's budget. Returns false when the budget is
 * spent or the provider is cooling down, so the caller uses the offline engine.
 */
export async function takeRemoteCalls(db: Db, n: number): Promise<boolean> {
  const limit = dailyLimit();
  await db.query(`INSERT INTO ai_usage (day) VALUES (current_date) ON CONFLICT DO NOTHING`);
  const rows = await db.query<{ calls: number }>(
    `UPDATE ai_usage SET calls = calls + $1::int
      WHERE day = current_date
        AND ($2::int <= 0 OR calls + $1::int <= $2::int)
        AND (blocked_until IS NULL OR blocked_until <= now())
     RETURNING calls`,
    [n, limit],
  );
  return rows.length > 0;
}

/** Seconds until remote calls are allowed again (0 when they are). */
export async function remoteBlockedFor(db: Db): Promise<number> {
  const [row] = await db.query<{ wait: number }>(
    `SELECT greatest(0, extract(epoch FROM blocked_until - now()))::float AS wait
       FROM ai_usage WHERE day = current_date`,
  );
  return Number(row?.wait ?? 0);
}

/** Pauses remote calls for every instance, e.g. after a 429. */
export async function blockRemote(db: Db, seconds: number) {
  await db.query(
    `INSERT INTO ai_usage AS u (day, calls, blocked_until)
     VALUES (current_date, 0, now() + make_interval(secs => $1::float8))
     ON CONFLICT (day) DO UPDATE
       SET blocked_until = greatest(coalesce(u.blocked_until, now()), EXCLUDED.blocked_until)`,
    [seconds],
  );
}

/** Counts a hit in a fixed window and returns the total so far in that window. */
export async function countHit(db: Db, bucket: string, key: string, windowSeconds: number): Promise<number> {
  const [row] = await db.query<{ hits: number }>(
    `INSERT INTO rate_limits AS r (bucket, key, window_start, hits)
     VALUES ($1, $2, to_timestamp(floor(extract(epoch FROM now()) / $3::int) * $3::int), 1)
     ON CONFLICT (bucket, key, window_start) DO UPDATE SET hits = r.hits + 1
     RETURNING hits`,
    [bucket, key, windowSeconds],
  );
  return row.hits;
}

/** Drops counters nobody needs any more; run by the daily worker sweep. */
export async function pruneGuardTables(db: Db) {
  await db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
  await db.query(`DELETE FROM ai_usage WHERE day < current_date - 30`);
}
