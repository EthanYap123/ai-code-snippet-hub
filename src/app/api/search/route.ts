import { clientIpHash, handle, jsonError, readVisitorId } from "@/lib/api";
import { countHit, takeRemoteCalls } from "@/lib/ai/guard";
import { getDb } from "@/lib/db";
import { searchSnippets } from "@/lib/snippets";
import type { SearchResponse } from "@/lib/types";
import { parseSearchQuery } from "@/lib/validation";

/** Searches per visitor per minute (0 disables the limit). */
const SEARCH_LIMIT = Number(process.env.SEARCH_LIMIT_PER_MINUTE ?? 60);
/** Of those, how many may embed the query with Gemini; the rest match on keywords. */
const SEARCH_AI_LIMIT = Math.ceil(SEARCH_LIMIT / 3);

export const GET = handle(async (request: Request) => {
  const parsed = parseSearchQuery(new URL(request.url).searchParams);
  if ("error" in parsed) return jsonError(400, parsed.error);

  const started = performance.now();
  const db = await getDb();
  const hits = SEARCH_LIMIT > 0 ? await countHit(db, "search", await clientIpHash(), 60) : 0;
  if (SEARCH_LIMIT > 0 && hits > SEARCH_LIMIT) {
    return jsonError(429, "That's a lot of searches. Wait a minute and try again.");
  }
  const results = await searchSnippets(db, parsed.q, await readVisitorId(), {
    allowRemote: async () => (SEARCH_LIMIT <= 0 || hits <= SEARCH_AI_LIMIT) && takeRemoteCalls(db, 1),
  });
  const body: SearchResponse = { query: parsed.q, results, tookMs: Math.round(performance.now() - started) };
  return Response.json(body);
});
