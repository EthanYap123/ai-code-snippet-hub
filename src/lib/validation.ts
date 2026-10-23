import { z } from "zod";
import { detectLanguage, LANGUAGE_IDS } from "./languages";
import { MAX_CODE_LENGTH, MAX_TITLE_LENGTH } from "./limits";

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

export type NewSnippet = { title: string; language: string; code: string };

/** Validates a create request body; shared by the API route and the browser demo. */
export function parseNewSnippet(
  body: unknown,
): { ok: true; value: NewSnippet } | { ok: false; error: string; details: unknown } {
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid snippet",
      details: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const { title, code } = parsed.data;
  const language = parsed.data.language === "auto" ? detectLanguage(code) : parsed.data.language;
  return { ok: true, value: { title, language, code: code.replace(/\s+$/, "") } };
}

export function parseListParams(params: URLSearchParams) {
  return {
    tag: params.get("tag"),
    language: params.get("language"),
    limit: Math.min(Math.max(Number(params.get("limit")) || 12, 1), 48),
    offset: Math.max(Number(params.get("offset")) || 0, 0),
  };
}

export function parseSearchQuery(params: URLSearchParams): { q: string } | { error: string } {
  const q = params.get("q")?.trim() ?? "";
  if (!q) return { error: "Type something to search for" };
  if (q.length > 200) return { error: "Keep searches under 200 characters" };
  return { q };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Second argument of the `/api/snippets/[id]` route handlers. */
export type IdContext = { params: Promise<{ id: string }> };
