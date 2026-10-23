import { handle, jsonError, readVisitorId } from "@/lib/api";
import { getDb } from "@/lib/db";
import { searchSnippets } from "@/lib/snippets";
import type { SearchResponse } from "@/lib/types";

export const GET = handle(async (request: Request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return jsonError(400, "Type something to search for");
  if (q.length > 200) return jsonError(400, "Keep searches under 200 characters");

  const started = performance.now();
  const db = await getDb();
  const results = await searchSnippets(db, q, await readVisitorId());
  const body: SearchResponse = { query: q, results, tookMs: Math.round(performance.now() - started) };
  return Response.json(body);
});
