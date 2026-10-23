import { handle, jsonError, readVisitorId } from "@/lib/api";
import { getDb } from "@/lib/db";
import { searchSnippets } from "@/lib/snippets";
import type { SearchResponse } from "@/lib/types";
import { parseSearchQuery } from "@/lib/validation";

export const GET = handle(async (request: Request) => {
  const parsed = parseSearchQuery(new URL(request.url).searchParams);
  if ("error" in parsed) return jsonError(400, parsed.error);

  const started = performance.now();
  const db = await getDb();
  const results = await searchSnippets(db, parsed.q, await readVisitorId());
  const body: SearchResponse = { query: parsed.q, results, tookMs: Math.round(performance.now() - started) };
  return Response.json(body);
});
