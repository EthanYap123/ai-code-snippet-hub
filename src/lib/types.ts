/** API response shapes shared by route handlers and the client. */

export type SnippetStatus = "queued" | "processing" | "ready" | "failed";

export interface Author {
  handle: string;
  displayName: string;
}

export interface SnippetCard {
  id: string;
  title: string;
  language: string;
  status: SnippetStatus;
  summary: string | null;
  tags: string[];
  /** First few lines of the code. */
  preview: string;
  lines: number;
  createdAt: string;
  author: Author;
  canDelete: boolean;
}

export interface Documentation {
  summary: string;
  explanation: string;
  params: { name: string; type?: string | null; description: string }[];
  returns: string | null;
  usage: string | null;
  complexity: string | null;
  notes: string[];
  model: string;
  generatedAt: string;
}

export interface RelatedSnippet {
  id: string;
  title: string;
  language: string;
  summary: string | null;
  score: number;
}

export interface SnippetDetail extends SnippetCard {
  code: string;
  codeHtml: string;
  usageHtml: string | null;
  docs: Documentation | null;
  error: string | null;
  embeddingModel: string | null;
  related: RelatedSnippet[];
  updatedAt: string;
}

export interface ListResponse {
  items: SnippetCard[];
  total: number;
  nextOffset: number | null;
}

export interface SearchResult {
  snippet: SnippetCard;
  /** Blended relevance in 0..1. */
  score: number;
  semantic: number;
  keyword: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  tookMs: number;
}

export interface TagCount {
  name: string;
  count: number;
}

export interface Stats {
  snippets: number;
  ready: number;
  pending: number;
  failed: number;
  tags: number;
  languages: { language: string; count: number }[];
  engine: { id: string; label: string; docModel: string; embedModel: string };
  database: "postgres" | "pglite";
}

export interface ApiError {
  error: string;
  details?: unknown;
}
