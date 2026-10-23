/** Languages the hub understands. `shiki` is the highlighter grammar id. */
export const LANGUAGES = [
  { id: "javascript", label: "JavaScript", shiki: "javascript" },
  { id: "typescript", label: "TypeScript", shiki: "typescript" },
  { id: "tsx", label: "TSX / JSX", shiki: "tsx" },
  { id: "python", label: "Python", shiki: "python" },
  { id: "java", label: "Java", shiki: "java" },
  { id: "go", label: "Go", shiki: "go" },
  { id: "rust", label: "Rust", shiki: "rust" },
  { id: "c", label: "C", shiki: "c" },
  { id: "cpp", label: "C++", shiki: "cpp" },
  { id: "csharp", label: "C#", shiki: "csharp" },
  { id: "php", label: "PHP", shiki: "php" },
  { id: "ruby", label: "Ruby", shiki: "ruby" },
  { id: "kotlin", label: "Kotlin", shiki: "kotlin" },
  { id: "swift", label: "Swift", shiki: "swift" },
  { id: "sql", label: "SQL", shiki: "sql" },
  { id: "bash", label: "Bash / Shell", shiki: "bash" },
  { id: "powershell", label: "PowerShell", shiki: "powershell" },
  { id: "html", label: "HTML", shiki: "html" },
  { id: "css", label: "CSS", shiki: "css" },
  { id: "json", label: "JSON", shiki: "json" },
  { id: "yaml", label: "YAML", shiki: "yaml" },
  { id: "dockerfile", label: "Dockerfile", shiki: "dockerfile" },
  { id: "markdown", label: "Markdown", shiki: "markdown" },
  { id: "plaintext", label: "Plain text", shiki: "text" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as LanguageId[];

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function isLanguageId(id: string): id is LanguageId {
  return (LANGUAGE_IDS as string[]).includes(id);
}

/** Ordered checks: the first rule with the highest score wins. */
const RULES: { id: LanguageId; patterns: RegExp[] }[] = [
  { id: "dockerfile", patterns: [/^\s*FROM\s+[\w./:-]+(\s+AS\s+\w+)?\s*$/im, /^\s*(RUN|COPY|WORKDIR|CMD|ENTRYPOINT|EXPOSE)\s/m] },
  { id: "json", patterns: [/^\s*[{[][\s\S]*[}\]]\s*$/, /^\s*"[\w-]+"\s*:/m] },
  { id: "html", patterns: [/<!doctype html>/i, /<\/?(div|span|html|body|head|section|p|a|ul|li)\b[^>]*>/i] },
  { id: "php", patterns: [/<\?php/, /\$\w+\s*->\w+/, /\bfunction\s+\w+\s*\([^)]*\$\w+/] },
  { id: "tsx", patterns: [/return\s*\(\s*</, /<[A-Z]\w*[\s/>]/, /\buse(State|Effect|Memo|Callback|Ref)\b/] },
  { id: "typescript", patterns: [/:\s*(string|number|boolean|void|unknown|Promise<)/, /\binterface\s+\w+\s*{/, /\btype\s+\w+\s*=/, /\bas\s+const\b/] },
  { id: "javascript", patterns: [/\b(const|let|var)\s+\w+\s*=/, /=>\s*[{(]?/, /\brequire\(['"]/, /\bconsole\.log\(/, /\bmodule\.exports\b/] },
  { id: "python", patterns: [/^\s*def\s+\w+\s*\(.*\)\s*(->\s*[\w[\], ]+)?:\s*$/m, /^\s*(from\s+[\w.]+\s+)?import\s+\w+/m, /^\s*@\w+/m, /\bself\b/, /:\s*$/m] },
  { id: "go", patterns: [/^package\s+\w+/m, /\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\(/, /:=/, /\bfmt\.\w+\(/] },
  { id: "rust", patterns: [/\bfn\s+\w+\s*(<[^>]*>)?\(/, /\blet\s+mut\b/, /\bimpl\b/, /::\w+/, /\b(println!|vec!|Result<)/] },
  { id: "java", patterns: [/\bpublic\s+(static\s+)?(class|void|int|String)\b/, /\bSystem\.out\.println\(/, /\bimport\s+java\./] },
  { id: "kotlin", patterns: [/\bfun\s+\w+\s*\(/, /\bval\s+\w+\s*[:=]/, /\bdata\s+class\b/] },
  { id: "swift", patterns: [/\bfunc\s+\w+\s*\([^)]*\)\s*(->\s*\w+)?\s*{/, /\bguard\s+let\b/, /\bimport\s+(SwiftUI|Foundation|UIKit)\b/] },
  { id: "csharp", patterns: [/\busing\s+System(\.\w+)*;/, /\bnamespace\s+[\w.]+/, /\bpublic\s+(async\s+)?(Task|string|int|void)\b/, /\bvar\s+\w+\s*=\s*new\b/] },
  { id: "cpp", patterns: [/#include\s*<(iostream|vector|string|map|memory)>/, /\bstd::\w+/, /\btemplate\s*</] },
  { id: "c", patterns: [/#include\s*<(stdio|stdlib|string)\.h>/, /\bprintf\s*\(/, /\bmalloc\s*\(/] },
  { id: "ruby", patterns: [/^\s*def\s+\w+[?!]?(\(.*\))?\s*$/m, /^\s*end\s*$/m, /\bputs\b/, /\.each\s+do\s*\|/] },
  { id: "sql", patterns: [/\bSELECT\b[\s\S]+\bFROM\b/i, /\b(INSERT\s+INTO|CREATE\s+TABLE|UPDATE\s+\w+\s+SET|ALTER\s+TABLE)\b/i] },
  { id: "powershell", patterns: [/\b(Get|Set|New|Remove|Write)-\w+/, /\$\w+\s*=\s*/, /-\w+\s+\$\w+/] },
  { id: "bash", patterns: [/^#!\/(usr\/)?bin\/(env\s+)?(ba)?sh/m, /\b(echo|grep|awk|sed|chmod|export)\s/, /\$\{?\w+\}?/, /\bfi\b|\bdone\b/] },
  { id: "css", patterns: [/^[.#]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*{[^}]*:[^}]*;/m, /@media\s*\(/] },
  { id: "yaml", patterns: [/^[\w-]+:\s*[\w"'-]*$/m, /^\s+-\s+\w+/m, /^---$/m] },
  { id: "markdown", patterns: [/^#{1,6}\s+\w+/m, /^\s*[-*]\s+\w+/m, /\[[^\]]+\]\([^)]+\)/] },
];

/** Cheap heuristic language detection used by the editor and the offline engine. */
export function detectLanguage(code: string): LanguageId {
  const sample = code.slice(0, 4000);
  if (!sample.trim()) return "plaintext";
  const scores = new Map<LanguageId, number>();
  let best: { id: LanguageId; score: number } = { id: "plaintext", score: 0 };
  for (const rule of RULES) {
    const score = rule.patterns.reduce((n, re) => n + (re.test(sample) ? 1 : 0), 0);
    scores.set(rule.id, score);
    if (score > best.score) best = { id: rule.id, score };
  }
  // TSX and TypeScript code also matches the JavaScript rule, usually more often,
  // so let any TS-specific signal win over plain JavaScript.
  if (best.id === "javascript" || best.id === "typescript") {
    if ((scores.get("tsx") ?? 0) >= 2) return "tsx";
    if ((scores.get("typescript") ?? 0) >= 1) return "typescript";
  }
  return best.score >= 1 ? best.id : "plaintext";
}
