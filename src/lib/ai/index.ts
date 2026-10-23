import { createGeminiEngine } from "./gemini";
import { localEngine } from "./local";
import type { Engine } from "./types";

export { localEngine };
export type { Engine };

let cached: Engine | undefined;

/** The engine new snippets are processed with, chosen from the environment. */
export function primaryEngine(): Engine {
  if (cached) return cached;
  const key = process.env.GEMINI_API_KEY;
  const wanted = process.env.AI_PROVIDER ?? (key ? "gemini" : "local");
  cached = wanted === "gemini" && key ? createGeminiEngine(key) : localEngine;
  return cached;
}

/** Engines that may have produced stored embeddings, keyed by embedding model. */
export function enginesByEmbedModel(): Map<string, Engine> {
  const map = new Map<string, Engine>([[localEngine.embedModel, localEngine]]);
  const primary = primaryEngine();
  map.set(primary.embedModel, primary);
  return map;
}
