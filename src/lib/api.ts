import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { after, connection } from "next/server";
import type { Db } from "./db";
import { drainQueue } from "./worker";

export const VISITOR_COOKIE = "hub_vid";

export function jsonError(status: number, error: string, details?: unknown) {
  return Response.json(details === undefined ? { error } : { error, details }, { status });
}

/**
 * Wraps an API handler: marks it as request-time (never prerendered) and turns
 * unexpected errors into a clean JSON 500 instead of an HTML page.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    // Outside the try: during builds Next rejects this on purpose to stop prerendering.
    await connection();
    try {
      return await fn(...args);
    } catch (err) {
      console.error(err);
      return jsonError(500, "Something went wrong on our side. Please try again.");
    }
  };
}

/** Anonymous visitor id; only used to let people delete what they submitted. */
export async function readVisitorId(): Promise<string | null> {
  return (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
}

export async function ensureVisitorId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  store.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return id;
}

/** Salted hash of the client IP for rate limiting; the raw IP is never stored. */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const salt = process.env.CRON_SECRET || "snippet-hub";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Runs queued jobs after the response has been sent. */
export function kickWorker(db: Db) {
  after(async () => {
    try {
      await drainQueue(db);
    } catch (err) {
      console.error("worker:", err);
    }
  });
}
