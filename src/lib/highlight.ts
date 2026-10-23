import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { LANGUAGES } from "./languages";

let highlighter: Promise<Highlighter> | undefined;

function getHighlighter() {
  highlighter ??= createHighlighter({
    themes: ["github-light", "github-dark-dimmed"],
    langs: LANGUAGES.map((l) => l.shiki).filter((l) => l !== "text"),
    // The JS regex engine avoids loading the Oniguruma WASM in serverless functions.
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/** Server-side highlighting with light and dark colours as CSS variables. */
export async function highlight(code: string, language: string): Promise<string> {
  const lang = LANGUAGES.find((l) => l.id === language)?.shiki ?? "text";
  const hl = await getHighlighter();
  return hl.codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark-dimmed" },
    defaultColor: false,
  });
}
