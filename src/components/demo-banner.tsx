import { FlaskConical } from "lucide-react";
import { IS_DEMO } from "@/lib/fetcher";

/** Explains what the static demo runs on; renders nothing in the server build. */
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="border-b border-border bg-accent-soft/60">
      <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2.5 text-xs leading-relaxed sm:items-center sm:px-6">
        <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-accent sm:mt-0" aria-hidden />
        <p>
          <strong className="font-medium">Live demo, running entirely in your browser:</strong> Postgres + pgvector
          (PGlite) and the offline docs engine. Snippets you add are saved in this browser only. The full version with
          Gemini runs locally from{" "}
          <a
            href="https://github.com/EthanYap123/ai-code-snippet-hub#running-locally"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            the repo
          </a>
          .
        </p>
      </div>
    </div>
  );
}
