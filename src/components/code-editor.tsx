"use client";

import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

/** Our language ids → CodeMirror language-data names. */
const CM_NAMES: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  tsx: "TSX",
  python: "Python",
  java: "Java",
  go: "Go",
  rust: "Rust",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  php: "PHP",
  ruby: "Ruby",
  kotlin: "Kotlin",
  swift: "Swift",
  sql: "SQL",
  bash: "Shell",
  powershell: "PowerShell",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  yaml: "YAML",
  dockerfile: "Dockerfile",
  markdown: "Markdown",
};

function subscribeDark(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function useIsDark() {
  return useSyncExternalStore(
    subscribeDark,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

const baseTheme = EditorView.theme({
  "&": { minHeight: "18rem" },
  ".cm-content": { padding: "12px 0" },
  ".cm-placeholder": { color: "var(--muted)" },
});

export function CodeEditor({
  value,
  onChange,
  language,
  onSubmitShortcut,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  language: string;
  onSubmitShortcut?: () => void;
  invalid?: boolean;
}) {
  const dark = useIsDark();
  const [langExt, setLangExt] = useState<{ id: string; ext: Extension } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const desc = LanguageDescription.matchLanguageName(languages, CM_NAMES[language] ?? "", false);
    if (!desc) return;
    // Grammars are code-split; load the one we need on demand.
    desc.load().then((support) => {
      if (!cancelled) setLangExt({ id: language, ext: support });
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const extensions = useMemo(() => {
    const ext: Extension[] = [baseTheme, EditorView.lineWrapping, EditorView.contentAttributes.of({ "aria-label": "Code" })];
    if (langExt && langExt.id === language) ext.push(langExt.ext);
    if (onSubmitShortcut) {
      ext.push(
        EditorView.domEventHandlers({
          keydown(e) {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmitShortcut();
              return true;
            }
            return false;
          },
        }),
      );
    }
    return ext;
  }, [langExt, language, onSubmitShortcut]);

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface transition focus-within:ring-4 ${
        invalid ? "border-danger focus-within:ring-danger/20" : "border-border-strong focus-within:border-accent focus-within:ring-ring/30"
      }`}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={dark ? "dark" : "light"}
        extensions={extensions}
        placeholder="Paste or type your snippet here…"
        basicSetup={{ foldGutter: false, highlightActiveLine: true, autocompletion: false }}
        maxHeight="32rem"
      />
    </div>
  );
}
