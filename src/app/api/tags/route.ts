import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listTags } from "@/lib/snippets";

export const GET = handle(async () => {
  return Response.json(await listTags(await getDb()));
});
