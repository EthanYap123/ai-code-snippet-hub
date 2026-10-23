import { clientIpHash, ensureVisitorId, handle, jsonError, kickWorker, readVisitorId } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createSnippet, listSnippets, recentSubmissions } from "@/lib/snippets";
import { parseListParams, parseNewSnippet } from "@/lib/validation";

export const GET = handle(async (request: Request) => {
  const db = await getDb();
  const result = await listSnippets(db, {
    ...parseListParams(new URL(request.url).searchParams),
    visitorId: await readVisitorId(),
  });
  if (result.items.some((s) => s.status === "queued" || s.status === "processing")) kickWorker(db);
  return Response.json(result);
});

export const POST = handle(async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON");
  }
  const parsed = parseNewSnippet(body);
  if (!parsed.ok) return jsonError(422, parsed.error, parsed.details);

  const db = await getDb();
  const visitorId = await ensureVisitorId();
  const ipHash = await clientIpHash();
  const limit = Number(process.env.SUBMIT_LIMIT_PER_HOUR ?? 15);
  if (limit > 0 && (await recentSubmissions(db, ipHash, visitorId)) >= limit) {
    return jsonError(429, `You can add up to ${limit} snippets an hour on the demo. Try again a little later.`);
  }

  const { title, language, code } = parsed.value;
  const id = await createSnippet(db, { title, language, code, visitorId, ipHash });
  kickWorker(db);
  return Response.json({ id, language }, { status: 201 });
});
