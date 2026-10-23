"use client";

import { Loader2, Wand2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { Skeleton } from "@/components/states";
import { useToast } from "@/components/toast";
import { ApiClientError, send } from "@/lib/fetcher";
import { detectLanguage, LANGUAGES, languageLabel } from "@/lib/languages";
import { MAX_CODE_LENGTH, MAX_TITLE_LENGTH } from "@/lib/limits";
import { snippetHref } from "@/lib/routes";

// CodeMirror touches the DOM on import, so load it in the browser only.
const CodeEditor = dynamic(() => import("@/components/code-editor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-xl" />,
});

const SAMPLE = `async function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}`;

export function NewSnippetForm() {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("auto");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const detected = useMemo(() => detectLanguage(code), [code]);
  const effectiveLanguage = language === "auto" ? detected : language;
  const tooLong = code.length > MAX_CODE_LENGTH;
  const tooShort = code.trim().length < 10;
  const codeError = tooLong
    ? `Snippets are limited to ${MAX_CODE_LENGTH.toLocaleString()} characters.`
    : touched && tooShort
      ? "Paste at least a line or two of code."
      : null;

  const submit = useCallback(async () => {
    setTouched(true);
    if (tooShort || tooLong || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await send<{ id: string }>("/api/snippets", "POST", { title, language, code });
      // Revalidate cached lists, stats and searches so the new snippet shows up everywhere.
      void mutate(() => true);
      toast("Snippet saved. Generating documentation…");
      router.push(snippetHref(res.id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save the snippet. Please try again.");
      setSubmitting(false);
    }
  }, [code, language, mutate, router, submitting, title, toast, tooLong, tooShort]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="title" className="text-sm font-medium">
            Title <span className="font-normal text-muted">(optional, generated if empty)</span>
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            placeholder="e.g. Fetch with timeout"
            className="h-10 rounded-md border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-ring/30"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="language" className="text-sm font-medium">
            Language
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-10 rounded-md border border-border-strong bg-surface px-2 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ring/30"
          >
            <option value="auto">
              Auto-detect{code.trim() ? ` (${languageLabel(detected)})` : ""}
            </option>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium" id="code-label">
            Code
          </span>
          {!code && (
            <button
              type="button"
              onClick={() => setCode(SAMPLE)}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
            >
              <Wand2 className="size-3.5" aria-hidden /> Use a sample
            </button>
          )}
        </div>
        <CodeEditor
          value={code}
          onChange={setCode}
          language={effectiveLanguage}
          onSubmitShortcut={submit}
          invalid={Boolean(codeError)}
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={codeError ? "text-danger" : "text-muted"} role={codeError ? "alert" : undefined}>
            {codeError ?? "Tip: press Ctrl+Enter to save."}
          </span>
          <span className={`font-mono ${tooLong ? "text-danger" : "text-muted"}`}>
            {code.length.toLocaleString()} / {MAX_CODE_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="h-10 rounded-md px-4 text-sm text-muted hover:text-fg">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || tooLong}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          {submitting ? "Saving…" : "Save & document"}
        </button>
      </div>
    </form>
  );
}
