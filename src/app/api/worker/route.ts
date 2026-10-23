import { handle, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { drainQueue } from "@/lib/worker";

/**
 * Drains the job queue on demand. Jobs normally run right after the request that
 * created them; this endpoint lets a scheduler (e.g. Vercel Cron) sweep up anything
 * left behind. Requires `Authorization: Bearer $CRON_SECRET` when that is set.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError(401, "Unauthorized");
  }
  if (!secret && process.env.NODE_ENV === "production") {
    return jsonError(503, "Set CRON_SECRET to enable the worker endpoint");
  }
  const result = await drainQueue(await getDb());
  return Response.json(result);
}

export const GET = handle(run);
export const POST = handle(run);
