import { clientIpHash, handle, jsonError, kickWorker, readVisitorId } from "@/lib/api";
import { countHit } from "@/lib/ai/guard";
import { getDb } from "@/lib/db";
import { ownedBy } from "@/lib/snippets";
import { UUID_RE, type IdContext } from "@/lib/validation";
import { enqueue } from "@/lib/worker";

/** Regenerations per visitor per hour; each one costs LLM calls. */
const REPROCESS_LIMIT = 5;

/** Regenerates docs, tags and the embedding for a snippet you own. */
export const POST = handle(async (_request: Request, ctx: IdContext) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(404, "Snippet not found");
  const db = await getDb();
  const { exists, owner } = await ownedBy(db, id, await readVisitorId());
  if (!exists) return jsonError(404, "Snippet not found");
  if (!owner) return jsonError(403, "You can only regenerate snippets you added from this browser");
  if ((await countHit(db, "reprocess", await clientIpHash(), 3600)) > REPROCESS_LIMIT) {
    return jsonError(429, `You can regenerate up to ${REPROCESS_LIMIT} snippets an hour. Try again a little later.`);
  }
  await enqueue(db, id);
  kickWorker(db);
  return Response.json({ id, status: "queued" }, { status: 202 });
});
