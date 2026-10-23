import { z } from "zod";
import { clientIpHash, ensureVisitorId, handle, jsonError, kickWorker, readVisitorId } from "@/lib/api";
import { getDb } from "@/lib/db";
import { detectLanguage, LANGUAGE_IDS } from "@/lib/languages";
import { createSnippet, listSnippets, recentSubmissions } from "@/lib/snippets";
import { MAX_CODE_LENGTH, MAX_TITLE_LENGTH } from "@/lib/limits";

export const GET = handle(async (request: Request) => {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 12, 1), 48);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const db = await getDb();
  const result = await listSnippets(db, {
    tag: url.searchParams.get("tag"),
    language: url.searchParams.get("language"),
    limit,
    offset,
    visitorId: await readVisitorId(),
  });
  if (result.items.some((s) => s.status === "queued" || s.status === "processing")) kickWorker(db);
  return Response.json(result);
});

const CreateSchema = z.object({
  title: z.string().trim().max(MAX_TITLE_LENGTH, `Keep the title under ${MAX_TITLE_LENGTH} characters`).optional().default(""),
  language: z
    .enum(["auto", ...LANGUAGE_IDS], { error: "That language isn't supported; pick one from the list or use auto-detect" })
    .optional()
    .default("auto"),
  code: z
    .string()
    .max(MAX_CODE_LENGTH, `Snippets are limited to ${MAX_CODE_LENGTH.toLocaleString()} characters`)
    .refine((c) => c.trim().length >= 10, "Paste at least a line or two of code"),
});

export const POST = handle(async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON");
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, parsed.error.issues[0]?.message ?? "Invalid snippet", z.flattenError(parsed.error).fieldErrors);
  }

  const db = await getDb();
  const visitorId = await ensureVisitorId();
  const ipHash = await clientIpHash();
  const limit = Number(process.env.SUBMIT_LIMIT_PER_HOUR ?? 15);
  if (limit > 0 && (await recentSubmissions(db, ipHash, visitorId)) >= limit) {
    return jsonError(429, `You can add up to ${limit} snippets an hour on the demo. Try again a little later.`);
  }

  const { title, code } = parsed.data;
  const language = parsed.data.language === "auto" ? detectLanguage(code) : parsed.data.language;
  const id = await createSnippet(db, { title, language, code: code.replace(/\s+$/, ""), visitorId, ipHash });
  kickWorker(db);
  return Response.json({ id, language }, { status: 201 });
});
