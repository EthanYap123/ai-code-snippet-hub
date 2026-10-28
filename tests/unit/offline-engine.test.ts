import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyze, hashEmbed, localEngine, tokenize } from "../../src/lib/ai/local";
import { EMBEDDING_DIMS } from "../../src/lib/schema";
import { toVectorLiteral } from "../../src/lib/vector";
import { normalizeTag } from "../../src/lib/worker";

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

describe("tokenize", () => {
  it("splits camelCase, snake_case and paths, and drops stop words", () => {
    const tokens = tokenize("getUserById from the user_repo/db.ts");
    for (const t of ["user", "id", "repo", "db", "ts"]) assert.ok(tokens.includes(t), `missing ${t} in ${tokens}`);
    assert.ok(!tokens.includes("the"));
    assert.ok(!tokens.includes("from"));
  });
});

describe("hashEmbed", () => {
  it("returns a unit vector with the dimensions pgvector expects", () => {
    const v = hashEmbed("retry a flaky network call with exponential backoff");
    assert.equal(v.length, EMBEDDING_DIMS);
    assert.ok(Math.abs(Math.sqrt(dot(v, v)) - 1) < 1e-6);
  });

  it("is deterministic", () => {
    assert.deepEqual(hashEmbed("debounce input"), hashEmbed("debounce input"));
  });

  it("puts related text closer together than unrelated text", () => {
    const query = hashEmbed("retry with backoff");
    const related = hashEmbed("function retry(fn, attempts) { backoff delay between attempts }");
    const unrelated = hashEmbed("center a div with flexbox and css grid");
    assert.ok(dot(query, related) > dot(query, unrelated));
  });

  it("never produces NaN for empty input", () => {
    assert.ok(hashEmbed("").every(Number.isFinite));
  });
});

describe("analyze (offline docs)", () => {
  const docs = analyze({
    language: "python",
    code: "import time\n\ndef retry(fn, times=3):\n    for i in range(times):\n        try:\n            return fn()\n        except Exception:\n            time.sleep(2 ** i)\n",
  });

  it("fills every field the UI renders", () => {
    assert.ok(docs.title.length > 0);
    assert.ok(docs.summary.length > 0);
    assert.ok(docs.explanation.length > 0);
    assert.ok(Array.isArray(docs.params));
    assert.ok(Array.isArray(docs.notes));
  });

  it("produces tags that survive normalisation unchanged", () => {
    assert.ok(docs.tags.length > 0);
    for (const tag of docs.tags) assert.equal(normalizeTag(tag), tag);
  });

  it("is exposed through the Engine interface", async () => {
    const [vec] = await localEngine.embed(["hello world"], "query");
    assert.equal(vec.length, EMBEDDING_DIMS);
    const sqlDocs = await localEngine.document({ language: "sql", code: "SELECT id FROM users WHERE active;" });
    assert.ok(sqlDocs.summary.length > 0);
  });
});

describe("normalizeTag", () => {
  const cases: [string, string][] = [
    ["Error Handling", "error-handling"],
    ["  C#  ", "c#"],
    ["node.js", "nodejs"],
    ["--weird__tag!!--", "weirdtag"],
    ["a".repeat(40), "a".repeat(24)],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(normalizeTag(input), expected);
    });
  }
});

describe("toVectorLiteral", () => {
  it("formats a pgvector literal and replaces non-finite values", () => {
    assert.equal(toVectorLiteral([0.5, -1, Number.NaN, Infinity]), "[0.500000,-1.000000,0,0]");
  });
});
