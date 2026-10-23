/** Embedding size shared by every engine (Gemini is asked for 768 dimensions). */
export const EMBEDDING_DIMS = 768;

/** Idempotent schema, applied on first connection. */
export const SCHEMA: string[] = [
  `CREATE EXTENSION IF NOT EXISTS vector`,

  `CREATE TABLE IF NOT EXISTS users (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    handle       text NOT NULL UNIQUE,
    display_name text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS snippets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       text NOT NULL,
    auto_title  boolean NOT NULL DEFAULT false,
    language    text NOT NULL,
    code        text NOT NULL,
    status      text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
    error       text,
    is_seed     boolean NOT NULL DEFAULT false,
    visitor_id  text,
    ip_hash     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS snippets_created_idx ON snippets (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS snippets_ip_idx ON snippets (ip_hash, created_at)`,

  `CREATE TABLE IF NOT EXISTS tags (
    id   serial PRIMARY KEY,
    name text NOT NULL UNIQUE
  )`,

  `CREATE TABLE IF NOT EXISTS snippet_tags (
    snippet_id uuid NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    tag_id     int  NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    -- Order the engine ranked the tags in (most relevant first).
    position   int  NOT NULL DEFAULT 0,
    PRIMARY KEY (snippet_id, tag_id)
  )`,
  `CREATE INDEX IF NOT EXISTS snippet_tags_tag_idx ON snippet_tags (tag_id)`,

  `CREATE TABLE IF NOT EXISTS documentation (
    snippet_id   uuid PRIMARY KEY REFERENCES snippets(id) ON DELETE CASCADE,
    summary      text NOT NULL,
    explanation  text NOT NULL,
    params       jsonb NOT NULL DEFAULT '[]',
    returns      text,
    usage        text,
    complexity   text,
    notes        jsonb NOT NULL DEFAULT '[]',
    model        text NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS snippet_embeddings (
    snippet_id uuid PRIMARY KEY REFERENCES snippets(id) ON DELETE CASCADE,
    model      text NOT NULL,
    embedding  vector(768) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS snippet_embeddings_hnsw
    ON snippet_embeddings USING hnsw (embedding vector_cosine_ops)`,

  `CREATE TABLE IF NOT EXISTS jobs (
    id         bigserial PRIMARY KEY,
    snippet_id uuid NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    kind       text NOT NULL DEFAULT 'enrich',
    status     text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued', 'running', 'done', 'failed')),
    attempts   int  NOT NULL DEFAULT 0,
    last_error text,
    run_after  timestamptz NOT NULL DEFAULT now(),
    locked_at  timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS jobs_pending_idx ON jobs (status, run_after)`,
];
