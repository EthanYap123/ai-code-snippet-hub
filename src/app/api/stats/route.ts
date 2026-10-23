import { handle, kickWorker } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getStats } from "@/lib/snippets";

export const GET = handle(async () => {
  const db = await getDb();
  const stats = await getStats(db);
  if (stats.pending > 0) kickWorker(db);
  return Response.json(stats);
});
