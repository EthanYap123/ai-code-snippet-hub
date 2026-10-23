import { handle, jsonError, kickWorker, readVisitorId, UUID_RE } from "@/lib/api";
import { getDb } from "@/lib/db";
import { ownedBy } from "@/lib/snippets";
import { enqueue } from "@/lib/worker";

/** Regenerates docs, tags and the embedding for a snippet you own. */
export const POST = handle(async (_request: Request, ctx: RouteContext<"/api/snippets/[id]/reprocess">) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(404, "Snippet not found");
  const db = await getDb();
  const { exists, owner } = await ownedBy(db, id, await readVisitorId());
  if (!exists) return jsonError(404, "Snippet not found");
  if (!owner) return jsonError(403, "You can only regenerate snippets you added from this browser");
  await enqueue(db, id);
  kickWorker(db);
  return Response.json({ id, status: "queued" }, { status: 202 });
});
