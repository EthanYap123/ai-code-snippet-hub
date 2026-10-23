import { handle, jsonError, kickWorker, readVisitorId } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteSnippet, getSnippet, hasOverdueJob, ownedBy } from "@/lib/snippets";
import { UUID_RE, type IdContext } from "@/lib/validation";

export const GET = handle(async (_request: Request, ctx: IdContext) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(404, "Snippet not found");
  const db = await getDb();
  const snippet = await getSnippet(db, id, await readVisitorId());
  if (!snippet) return jsonError(404, "Snippet not found");
  // Clients poll this while a snippet is processing; nudge the worker if its job stalled.
  if (snippet.status !== "ready" && snippet.status !== "failed" && (await hasOverdueJob(db, id))) kickWorker(db);
  return Response.json(snippet);
});

export const DELETE = handle(async (_request: Request, ctx: IdContext) => {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(404, "Snippet not found");
  const db = await getDb();
  const { exists, owner } = await ownedBy(db, id, await readVisitorId());
  if (!exists) return jsonError(404, "Snippet not found");
  if (!owner) return jsonError(403, "You can only delete snippets you added from this browser");
  await deleteSnippet(db, id);
  return new Response(null, { status: 204 });
});
