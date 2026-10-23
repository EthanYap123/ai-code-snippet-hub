import type { Metadata } from "next";
import { NewSnippetForm } from "./form";

export const metadata: Metadata = { title: "New snippet" };

export default function NewSnippetPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Add a snippet</h1>
        <p className="text-muted">
          Paste code in any language. A background worker writes the documentation, extracts tags and embeds it for
          semantic search, usually within a few seconds.
        </p>
      </div>
      <NewSnippetForm />
    </div>
  );
}
