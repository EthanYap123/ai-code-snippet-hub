import type { Metadata } from "next";
import Link from "next/link";
import { IS_DEMO } from "@/lib/fetcher";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  {
    title: "1. Submit",
    body: "The editor posts the snippet to POST /api/snippets. The route validates it with Zod, detects the language if you left it on auto, stores the row and enqueues a job, then returns 201 straight away.",
  },
  {
    title: "2. Background worker",
    body: "After the response is sent, the worker claims jobs with UPDATE … FOR UPDATE SKIP LOCKED, so several instances never process the same job. Failures retry with exponential backoff; if the LLM is still unavailable after three attempts, the offline engine fills in so the hub keeps working.",
  },
  {
    title: "3. Documentation & tags",
    body: "The LLM is asked for structured JSON (title, summary, explanation, parameters, return value, usage example, complexity, notes, tags) against a response schema, and the result is validated again with Zod before it is stored.",
  },
  {
    title: "4. Embeddings",
    body: "Title, summary, tags, explanation and code are embedded into a 768-dimension vector and stored in a pgvector column with an HNSW cosine index.",
  },
  {
    title: "5. Semantic search",
    body: "Your query is embedded with the same model (and cached in memory), the 50 nearest vectors are fetched through the HNSW index, and each candidate is re-ranked by blending cosine similarity with a Postgres full-text score over title, summary and tags.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
        <p className="text-muted">
          Snippet Hub is a Next.js App Router app. Route handlers act as the API, Postgres with pgvector stores
          everything, and an LLM writes the docs. Without an API key it runs a fully offline engine instead, so the
          demo never breaks.
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        {STEPS.map((s) => (
          <li key={s.title} className="rounded-xl border border-border bg-surface p-5">
            <h2 className="font-medium">{s.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 text-sm leading-relaxed">
        <h2 className="font-medium">About the demo</h2>
        {IS_DEMO ? (
          <p className="text-muted">
            This live demo is a static build with no server. The same schema, worker and SQL run inside your browser on
            PGlite (Postgres compiled to WebAssembly) with pgvector, using the offline engine for docs and embeddings.
            Everything you add is stored in this browser only. The curated examples stay read-only.
          </p>
        ) : (
          <p className="text-muted">
            Anyone can add snippets. The ones you add are linked to your browser, so you can regenerate or delete them,
            while the curated examples stay read-only. Submissions are rate limited per visitor.
          </p>
        )}
        <p className="text-muted">
          Source, architecture notes and setup instructions are on{" "}
          <a
            href="https://github.com/EthanYap123/ai-code-snippet-hub"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            GitHub
          </a>
          .
        </p>
      </section>

      <Link href="/new" className="inline-flex h-10 w-fit items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90">
        Try it with your own snippet
      </Link>
    </div>
  );
}
