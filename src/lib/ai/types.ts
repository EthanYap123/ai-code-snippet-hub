export interface DocParam {
  name: string;
  type?: string | null;
  description: string;
}

/** What an engine produces for one snippet. */
export interface GeneratedDocs {
  /** Short human title, used when the author did not give one. */
  title: string;
  /** One sentence: what the snippet does. */
  summary: string;
  /** A few short paragraphs on how it works. Inline code uses backticks. */
  explanation: string;
  params: DocParam[];
  returns: string | null;
  /** A short usage example in the snippet's language. */
  usage: string | null;
  /** Time/space complexity when it is meaningful. */
  complexity: string | null;
  /** Gotchas, edge cases, security or performance notes. */
  notes: string[];
  /** Lower-case kebab-case semantic tags. */
  tags: string[];
}

export interface DocInput {
  title?: string | null;
  language: string;
  code: string;
}

export type EmbedKind = "document" | "query";

export interface Engine {
  /** Stable id stored next to generated rows (e.g. "gemini", "local"). */
  id: string;
  label: string;
  docModel: string;
  /** Embeddings from different models live in different vector spaces. */
  embedModel: string;
  document(input: DocInput): Promise<GeneratedDocs>;
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}
