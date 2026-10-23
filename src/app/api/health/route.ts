import { connection } from "next/server";
import { primaryEngine } from "@/lib/ai";
import { getDb } from "@/lib/db";

export async function GET() {
  await connection();
  try {
    const db = await getDb();
    await db.query("SELECT 1");
    return Response.json({ ok: true, database: db.kind, engine: primaryEngine().id });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false }, { status: 503 });
  }
}
