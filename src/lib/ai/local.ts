import { EMBEDDING_DIMS } from "../schema";
import { languageLabel } from "../languages";
import type { DocInput, DocParam, Engine, GeneratedDocs } from "./types";

/**
 * Offline engine: no network, no key. Docs come from static analysis of the code,
 * and embeddings are feature-hashed bags of words expanded with developer synonyms,
 * so "connect to a cache" still lands near a Redis client snippet.
 */

// ---------------------------------------------------------------------------
// Concept dictionary: drives tags, synonym expansion and notes.

interface Concept {
  tag: string;
  match: RegExp;
  /** Words added to the embedding so natural-language queries can find it. */
  words: string[];
  note?: string;
}

const CONCEPTS: Concept[] = [
  { tag: "redis", match: /\b(redis|ioredis)\b/i, words: ["redis", "cache", "key value", "store", "connect", "client"] },
  { tag: "postgres", match: /\b(postgres(ql)?|psycopg2?|pg\.Pool|new Pool\(|asyncpg)\b/i, words: ["postgres", "postgresql", "database", "sql", "connect", "pool"] },
  { tag: "mongodb", match: /\b(mongo(db|ose)?|MongoClient)\b/i, words: ["mongodb", "database", "nosql", "document", "connect"] },
  { tag: "sql", match: /\b(SELECT|INSERT INTO|UPDATE|JOIN|GROUP BY|OVER\s*\()\b/, words: ["sql", "query", "database", "table", "rows"] },
  { tag: "http", match: /\b(fetch\(|axios|http\.|requests\.|HttpClient|net\/http|reqwest|urllib)\b/i, words: ["http", "request", "api", "fetch", "network", "rest"] },
  { tag: "web-server", match: /\b(express\(\)|app\.(get|post|use)\(|FastAPI|@app\.(get|post)|http\.ListenAndServe|createServer|Flask\()\b/, words: ["server", "api", "endpoint", "route", "http", "backend"] },
  { tag: "middleware", match: /\b(next\(\)|middleware|app\.use\()/i, words: ["middleware", "request", "pipeline"] },
  { tag: "auth", match: /\b(jwt|jsonwebtoken|bearer|authorization|oauth|bcrypt|password|login)\b/i, words: ["auth", "authentication", "login", "token", "security", "verify"], note: "Never log tokens or secrets, and keep signing keys in environment variables." },
  { tag: "async", match: /\b(async|await|Promise|asyncio|goroutine|go func|tokio)\b/, words: ["async", "asynchronous", "concurrent", "promise", "await"] },
  { tag: "retry", match: /\b(retry|retries|backoff|attempts?)\b/i, words: ["retry", "backoff", "resilience", "transient", "failure"], note: "Cap the number of retries and add jitter so many clients do not retry in lockstep." },
  { tag: "error-handling", match: /\b(try|catch|except|finally|Result<|\.unwrap_or|errors?\.New|if err != nil)\b/, words: ["error", "exception", "handle", "failure"] },
  { tag: "debounce", match: /\b(debounce|throttle)\b/i, words: ["debounce", "throttle", "delay", "rate", "input", "timer"] },
  { tag: "react", match: /\b(useState|useEffect|useMemo|useCallback|useRef|React\.|jsx)\b/, words: ["react", "hook", "component", "frontend", "ui", "state"] },
  { tag: "react-hooks", match: /\bfunction\s+use[A-Z]\w*|const\s+use[A-Z]\w*\s*=/, words: ["custom hook", "hook", "reusable", "react"] },
  { tag: "file-io", match: /\b(readFile|writeFile|fs\.|open\(|File::open|BufReader|os\.Open|Path\(|with open)\b/, words: ["file", "read", "write", "disk", "io", "lines"] },
  { tag: "regex", match: /\b(RegExp|re\.(compile|match|search|sub)|Regex::new|regexp\.)\b|\/\^[^/]+\$\//, words: ["regex", "regular expression", "pattern", "match", "validate"] },
  { tag: "validation", match: /\b(validate|validator|isValid|schema|zod|pydantic)\b/i, words: ["validate", "validation", "check", "input", "schema"] },
  { tag: "sorting", match: /\b(sort|sorted|quicksort|mergesort|compareTo|Comparator)\b/i, words: ["sort", "order", "algorithm", "compare"] },
  { tag: "searching", match: /\b(binary ?search|bsearch|lower_bound|indexOf|mid\s*=)\b/i, words: ["search", "find", "binary search", "algorithm", "sorted array"] },
  { tag: "caching", match: /\b(cache|memo(ize)?|lru|ttl)\b/i, words: ["cache", "caching", "memoize", "performance", "ttl"] },
  { tag: "testing", match: /\b(describe\(|it\(|test\(|expect\(|assert|pytest|@Test|unittest)\b/, words: ["test", "testing", "unit test", "assert"] },
  { tag: "docker", match: /^FROM\s+\S+[\s\S]*^(RUN|COPY|CMD|ENTRYPOINT)\s/m, words: ["docker", "container", "image", "build", "deploy"] },
  { tag: "shell", match: /^#!.*\b(ba)?sh\b|\b(chmod|grep|awk|sed|tar|rsync|cron)\b/m, words: ["shell", "script", "command line", "automation"] },
  { tag: "backup", match: /\b(backup|snapshot|archive|rotate|retention)\b/i, words: ["backup", "archive", "rotate", "retention"] },
  { tag: "css-layout", match: /\b(display:\s*(grid|flex)|grid-template|place-items|justify-content|align-items)\b/, words: ["css", "layout", "center", "grid", "flexbox", "responsive"] },
  { tag: "linq", match: /\.(Where|Select|GroupBy|OrderBy)\(/, words: ["linq", "query", "collection", "group"] },
  { tag: "collections", match: /\b(Map|HashMap|dict|Dictionary|Set|HashSet|defaultdict|Counter)\b/, words: ["collection", "map", "dictionary", "group", "count"] },
  { tag: "concurrency", match: /\b(Mutex|Lock|Semaphore|WaitGroup|thread|Thread|channel|chan\s+\w+|Promise\.all)\b/, words: ["concurrency", "parallel", "thread", "lock"] },
  { tag: "graceful-shutdown", match: /\b(SIGTERM|SIGINT|signal\.Notify|Shutdown\(|process\.on\(['"]SIG)/, words: ["graceful shutdown", "signal", "server", "stop"] },
  { tag: "environment", match: /\b(process\.env|os\.environ|getenv|dotenv|env::var)\b/, words: ["environment variable", "config", "configuration", "settings"], note: "Reads configuration from environment variables; document which ones must be set." },
  { tag: "dates", match: /\b(Date\(|datetime|moment|dayjs|chrono|time\.Now|Intl\.DateTimeFormat)\b/, words: ["date", "time", "format", "timezone"] },
  { tag: "string-manipulation", match: /\b(slugify|toLowerCase|replace\(|split\(|join\(|trim\(|strip\(|format!)\b/, words: ["string", "text", "format", "slug", "parse"] },
  { tag: "window-functions", match: /\bOVER\s*\(\s*(PARTITION|ORDER)/i, words: ["window function", "rank", "top n", "per group", "analytics"] },
  { tag: "streams", match: /\b(stream|Stream|pipe\(|ReadableStream|BufReader|lines\(\))\b/, words: ["stream", "pipe", "chunk", "large file"] },
];

const STOP_WORDS = new Set(
  "a an and are as at be by for from has have how i if in into is it its of on or that the this to was what when where which with you your do does can should would const let var function return new true false null undefined none self this def fn func public private static void int string import export from class type".split(" "),
);

/** Synonyms applied to every token, both for documents and queries. */
const SYNONYMS: Record<string, string[]> = {
  db: ["database"], database: ["db"], postgresql: ["postgres"], postgres: ["postgresql", "sql"], pg: ["postgres"],
  connect: ["connection", "client"], connection: ["connect", "client"], client: ["connect"],
  js: ["javascript"], node: ["nodejs", "javascript"], nodejs: ["node", "javascript"], ts: ["typescript"],
  py: ["python"], golang: ["go"], csharp: ["c#", "dotnet"], dotnet: ["csharp"],
  request: ["http", "fetch"], fetch: ["http", "request"], api: ["endpoint", "http"], endpoint: ["api", "route"],
  auth: ["authentication", "login"], authentication: ["auth"], login: ["auth"], jwt: ["token", "auth"], token: ["jwt"],
  retry: ["backoff"], backoff: ["retry"], cache: ["caching", "redis"], caching: ["cache"], memoize: ["cache"],
  center: ["centre", "align"], centre: ["center"], align: ["center"], layout: ["grid", "flexbox"],
  file: ["io"], read: ["load"], load: ["read"], write: ["save"], save: ["write"],
  error: ["exception"], exception: ["error"], wait: ["delay"], delay: ["wait", "timer"],
  rank: ["top"], top: ["rank"], group: ["partition"], container: ["docker"], image: ["docker"],
  shutdown: ["stop", "signal"], stop: ["shutdown"], thread: ["concurrency"], parallel: ["concurrency"],
  hook: ["react"], component: ["react"], debounce: ["throttle"], throttle: ["debounce"],
  validate: ["validation", "check"], validation: ["validate"], sort: ["order"], search: ["find"], find: ["search"],
};

// ---------------------------------------------------------------------------
// Tokenising + hashing

function stem(word: string): string {
  if (word.length <= 4) return word;
  return word.replace(/(ing|ed|es|s)$/, "");
}

export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/[_\-./:]/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9#+]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function addFeature(vec: Float64Array, feature: string, weight: number) {
  const h = fnv1a(feature);
  const sign = h & 1 ? 1 : -1;
  vec[h % EMBEDDING_DIMS] += sign * weight;
}

function expand(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    out.push(t);
    for (const s of SYNONYMS[t] ?? []) out.push(...s.split(" "));
  }
  return out;
}

export function hashEmbed(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIMS);
  const tokens = expand(tokenize(text));
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(stem(t), (counts.get(stem(t)) ?? 0) + 1);
  // Sub-linear term frequency keeps one repeated identifier from dominating.
  for (const [term, n] of counts) addFeature(vec, `w:${term}`, 1 + Math.log(n));
  for (let i = 0; i + 1 < tokens.length; i++) {
    addFeature(vec, `b:${stem(tokens[i])}_${stem(tokens[i + 1])}`, 0.5);
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}

// ---------------------------------------------------------------------------
// Static analysis for docs

interface Signature {
  kind: "function" | "class" | "hook" | "query" | "config";
  name: string;
  params: string[];
  isAsync: boolean;
}

const SIGNATURE_PATTERNS: { re: RegExp; kind: Signature["kind"] }[] = [
  { re: /(?:export\s+)?(?:default\s+)?(?<async>async\s+)?function\s*\*?\s*(?<name>use[A-Z]\w*)\s*(?:<[^>]*>)?\((?<params>[^)]*)\)/, kind: "hook" },
  { re: /(?:export\s+)?(?:const|let)\s+(?<name>use[A-Z]\w*)\s*=\s*(?<async>async\s*)?\((?<params>[^)]*)\)\s*=>/, kind: "hook" },
  { re: /(?:export\s+)?(?:default\s+)?(?<async>async\s+)?function\s*\*?\s*(?<name>\w+)\s*(?:<[^>]*>)?\((?<params>[^)]*)\)/, kind: "function" },
  { re: /(?:export\s+)?(?:const|let)\s+(?<name>\w+)\s*=\s*(?<async>async\s*)?\((?<params>[^)]*)\)\s*(?::\s*[^=]+)?=>/, kind: "function" },
  { re: /(?<async>async\s+)?def\s+(?<name>\w+)\s*\((?<params>[^)]*)\)/, kind: "function" },
  { re: /func\s+(?:\([^)]*\)\s*)?(?<name>\w+)\s*\((?<params>[^)]*)\)/, kind: "function" },
  { re: /(?<async>async\s+)?fn\s+(?<name>\w+)\s*(?:<[^>]*>)?\((?<params>[^)]*)\)/, kind: "function" },
  { re: /(?:public|private|protected|internal)\s+(?:static\s+)?(?<async>async\s+)?[\w<>[\],\s]+?\s+(?<name>\w+)\s*\((?<params>[^)]*)\)\s*(?:throws\s+[\w,\s]+)?{/, kind: "function" },
  { re: /\bclass\s+(?<name>\w+)/, kind: "class" },
];

const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return"]);

function parseSignature(source: string): Signature | null {
  // Drop generic parameter lists like <T extends (...args: never[]) => void>, whose
  // parentheses and arrows would otherwise confuse the patterns below.
  const code = source.replace(/((?:function\s*\*?\s*|fn\s+)\w+)\s*<.*?>(?=\s*\()/g, "$1");
  for (const { re, kind } of SIGNATURE_PATTERNS) {
    const groups = code.match(re)?.groups;
    const name = groups?.name;
    if (!name || KEYWORDS.has(name)) continue;
    const isAsync = Boolean(groups.async);
    const params = (groups.params ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p && p !== "self" && p !== "cls" && p !== "&self" && p !== "&mut self");
    return { kind, name, params, isAsync };
  }
  return null;
}

function splitParam(raw: string, language: string): DocParam {
  let name = raw;
  let type: string | null = null;
  const defaultSplit = raw.split("=");
  const base = defaultSplit[0].trim();
  const hasDefault = defaultSplit.length > 1;

  if (/^(go)$/.test(language)) {
    const [n, ...t] = base.split(/\s+/);
    name = n;
    type = t.join(" ") || null;
  } else if (/^(java|csharp|c|cpp|kotlin)$/.test(language) && !base.includes(":")) {
    const parts = base.split(/\s+/);
    name = parts.pop() ?? base;
    type = parts.join(" ") || null;
  } else {
    const [n, t] = base.split(":");
    name = n.trim();
    type = t?.trim() || null;
  }
  name = name.replace(/^[{[]|[}\]]$/g, "").replace(/^\.\.\./, "...").replace(/^[*&]+/, "");
  const words = tokenize(name).join(" ") || name;
  const description = `The ${words}${type ? ` (${type})` : ""}${hasDefault ? `; optional, defaults to \`${defaultSplit.slice(1).join("=").trim()}\`` : ""}.`;
  return { name, type, description };
}

const IMPORT_PATTERNS = [
  /import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g,
  /require\(\s*["']([^"']+)["']\s*\)/g,
  /^\s*from\s+([\w.]+)\s+import/gm,
  /^\s*import\s+([\w.]+)/gm,
  /^\s*use\s+([\w:]+)/gm,
  /^\s*using\s+([\w.]+);/gm,
  /^\s*#include\s*[<"]([^>"]+)[>"]/gm,
];

function extractImports(code: string): string[] {
  const found = new Set<string>();
  for (const re of IMPORT_PATTERNS) {
    for (const m of code.matchAll(re)) {
      const mod = m[1].replace(/^node:/, "");
      if (mod.length < 40) found.add(mod);
    }
  }
  return [...found].slice(0, 6);
}

/** `fetchWithTimeout` → "Fetch with timeout" (keeps the small words tokenize drops). */
function humanize(name: string): string {
  const s = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : name;
}

/** Concepts too common to say much about a snippet on their own. */
const GENERIC_TAGS = new Set(["async", "error-handling", "string-manipulation", "collections", "environment"]);

const TOPIC_LABELS: Record<string, string> = {
  redis: "Redis",
  postgres: "PostgreSQL",
  mongodb: "MongoDB",
  sql: "SQL queries",
  http: "HTTP requests",
  "web-server": "serving HTTP",
  middleware: "request middleware",
  auth: "authentication",
  retry: "retries with backoff",
  debounce: "debouncing",
  react: "React",
  "react-hooks": "custom hooks",
  "file-io": "file I/O",
  regex: "regular expressions",
  validation: "input validation",
  sorting: "sorting",
  searching: "searching",
  caching: "caching",
  testing: "tests",
  docker: "container images",
  shell: "shell automation",
  backup: "backups",
  "css-layout": "CSS layout",
  linq: "LINQ queries",
  concurrency: "concurrency",
  "graceful-shutdown": "graceful shutdown",
  dates: "dates and times",
  "window-functions": "window functions",
  streams: "streaming data",
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function describeKind(sig: Signature | null, language: string, conceptTags: string[]): string {
  const lang = languageLabel(language);
  if (!sig) {
    if (language === "sql") return `A ${lang} query`;
    if (language === "css") return `A ${lang} rule set`;
    if (language === "dockerfile") return "A multi-stage container build";
    if (language === "bash" || language === "powershell") return `A ${lang} script`;
    return `A ${lang} snippet`;
  }
  const verb = sig.isAsync ? "an async " : "a ";
  if (sig.kind === "hook") return `A React hook, \`${sig.name}\``;
  if (sig.kind === "class") return `A ${lang} class, \`${sig.name}\``;
  const what = conceptTags.includes("middleware") ? "middleware function" : "function";
  return `${verb[0].toUpperCase()}${verb.slice(1)}${lang} ${what}, \`${sig.name}\``;
}

function usageExample(sig: Signature | null, language: string, params: DocParam[]): string | null {
  if (!sig || sig.kind === "class") return null;
  const args = params.filter((p) => !p.description.includes("optional")).map((p) => p.name.replace(/^\.\.\./, ""));
  const call = `${sig.name}(${args.join(", ")})`;
  switch (language) {
    case "javascript":
    case "typescript":
    case "tsx":
      if (sig.kind === "hook") return `const result = ${call};`;
      return sig.isAsync ? `const result = await ${call};` : `const result = ${call};`;
    case "python":
      return sig.isAsync ? `result = await ${call}` : `result = ${call}`;
    case "go":
      return `result := ${call}`;
    case "rust":
      return `let result = ${call};`;
    case "java":
    case "csharp":
    case "kotlin":
      return `var result = ${call};`;
    default:
      return call;
  }
}

function complexityHint(code: string, language: string): string | null {
  if (["sql", "css", "html", "bash", "powershell", "dockerfile", "yaml", "json", "markdown"].includes(language)) return null;
  if (/\bmid\b|\blo\b.*\bhi\b|low\s*<=?\s*high/i.test(code)) return "O(log n) time, O(1) extra space.";
  const loops = (code.match(/\b(for|while|forEach|map|each)\b/g) ?? []).length;
  if (/\bfor\b[\s\S]{0,200}\bfor\b/.test(code) && loops >= 2) return "Roughly O(n²) in the worst case because of the nested loops.";
  if (loops === 1) return "O(n) in the size of the input.";
  return null;
}

export function analyze(input: DocInput): GeneratedDocs {
  const { code, language } = input;
  const sig = parseSignature(code);
  const concepts = CONCEPTS.filter((c) => c.match.test(code));
  const conceptTags = concepts.map((c) => c.tag);
  const imports = extractImports(code);
  const params = (sig?.params ?? []).slice(0, 8).map((p) => splitParam(p, language));

  const lead = describeKind(sig, language, conceptTags);
  const topics = conceptTags.filter((t) => !GENERIC_TAGS.has(t)).slice(0, 3);
  const labels = topics.map((t) => TOPIC_LABELS[t] ?? t.replace(/-/g, " "));
  const about = labels.length ? ` that covers ${joinList(labels)}` : "";
  const summary = `${lead}${about}.`;

  const lines = code.split("\n").length;
  const paragraphs: string[] = [];
  paragraphs.push(
    `${lead} spanning ${lines} line${lines === 1 ? "" : "s"}.` +
      (imports.length ? ` It depends on ${imports.map((i) => `\`${i}\``).join(", ")}.` : ""),
  );
  if (params.length) {
    paragraphs.push(`It takes ${params.length} parameter${params.length === 1 ? "" : "s"}: ${params.map((p) => `\`${p.name}\``).join(", ")}.`);
  }
  const behaviours: string[] = [];
  if (conceptTags.includes("async")) behaviours.push("runs asynchronously, so callers should await it");
  if (conceptTags.includes("error-handling")) behaviours.push("handles errors explicitly instead of letting them escape");
  if (conceptTags.includes("retry")) behaviours.push("retries failed work with a delay between attempts");
  if (conceptTags.includes("caching")) behaviours.push("caches results to avoid repeated work");
  if (conceptTags.includes("environment")) behaviours.push("reads its configuration from environment variables");
  if (behaviours.length) paragraphs.push(`Along the way it ${behaviours.join(", ")}.`);

  const notes = concepts.flatMap((c) => (c.note ? [c.note] : []));
  if (/\b(eval|exec)\s*\(/.test(code)) notes.push("Uses dynamic code execution; never pass it untrusted input.");
  if (/password|secret|api[_-]?key/i.test(code) && /["'][A-Za-z0-9_\-]{12,}["']/.test(code)) notes.push("Looks like it may contain a hard-coded secret; move it to configuration.");
  if (!notes.length) notes.push("Generated by the offline engine from static analysis; connect a Gemini key for richer write-ups.");

  let returns: string | null = null;
  const ret = code.match(/\breturn\s+([^;\n]{1,60})/);
  if (sig?.kind === "hook") returns = "The hook's state and helpers for the calling component.";
  else if (ret) returns = `${sig?.isAsync ? "A promise resolving to " : ""}\`${ret[1].trim()}\`.`;

  // Most telling first: topics, then language and libraries, then generic traits.
  const libraries = imports.map((i) => i.replace(/^@/, "").split(/[/:.]/)[0].toLowerCase());
  const generic = conceptTags.filter((t) => GENERIC_TAGS.has(t));
  const tags = [...new Set([...topics, language, ...conceptTags.filter((t) => !GENERIC_TAGS.has(t)), ...libraries, ...generic])]
    .filter((t) => /^[a-z0-9#+-]{2,24}$/.test(t))
    .slice(0, 8);

  const title = input.title?.trim() || (sig ? humanize(sig.name) : `${languageLabel(language)} snippet`);

  return {
    title,
    summary,
    explanation: paragraphs.join("\n\n"),
    params,
    returns,
    usage: usageExample(sig, language, params),
    complexity: complexityHint(code, language),
    notes: notes.slice(0, 4),
    tags,
  };
}

/** Text the offline engine embeds for a snippet: weighted towards intent over syntax. */
export function conceptWords(code: string): string {
  return CONCEPTS.filter((c) => c.match.test(code))
    .flatMap((c) => c.words)
    .join(" ");
}

export const localEngine: Engine = {
  id: "local",
  label: "Offline engine",
  docModel: "local-heuristics-v1",
  embedModel: "local-hash-768-v1",
  async document(input) {
    return analyze(input);
  },
  async embed(texts) {
    return texts.map(hashEmbed);
  },
};
