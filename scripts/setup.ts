/**
 * Applies the schema, seeds the demo snippets and processes every queued job.
 *
 *   npm run db:setup                       # uses DATABASE_URL / GEMINI_API_KEY from .env.local
 *   npm run db:setup -- "connect to redis" # also runs a test search
 */
import { getDb } from "../src/lib/db";
import { getStats, searchSnippets } from "../src/lib/snippets";
import { drainQueue } from "../src/lib/worker";

async function main() {
  const db = await getDb();
  let total = { processed: 0, failed: 0, retried: 0 };
  // Keep draining until nothing is left (retries are scheduled a few seconds out).
  for (let round = 0; round < 20; round++) {
    const r = await drainQueue(db, 60_000);
    total = { processed: total.processed + r.processed, failed: total.failed + r.failed, retried: total.retried + r.retried };
    const stats = await getStats(db);
    if (stats.pending === 0) break;
    await new Promise((res) => setTimeout(res, 5_000));
  }
  const stats = await getStats(db);
  console.log(`database: ${stats.database}, engine: ${stats.engine.label} (${stats.engine.docModel} / ${stats.engine.embedModel})`);
  console.log(`snippets: ${stats.snippets} (${stats.ready} ready, ${stats.pending} pending, ${stats.failed} failed), tags: ${stats.tags}`);
  console.log(`this run: ${total.processed} processed, ${total.retried} retried, ${total.failed} failed`);

  const query = process.argv.slice(2).join(" ").trim();
  if (query) {
    const results = await searchSnippets(db, query, null);
    console.log(`\nsearch "${query}":`);
    for (const r of results) {
      console.log(`  ${r.score.toFixed(3)}  (sem ${r.semantic.toFixed(3)}, kw ${r.keyword.toFixed(3)})  ${r.snippet.title}`);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
