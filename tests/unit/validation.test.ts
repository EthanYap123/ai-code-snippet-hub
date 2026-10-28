import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CODE_LENGTH, MAX_TITLE_LENGTH } from "../../src/lib/limits";
import { parseListParams, parseNewSnippet, parseSearchQuery, UUID_RE } from "../../src/lib/validation";

const CODE = "const add = (a, b) => a + b;\nconsole.log(add(1, 2));";

describe("parseNewSnippet", () => {
  it("accepts a minimal body and fills in defaults", () => {
    const result = parseNewSnippet({ code: CODE });
    assert.ok(result.ok);
    assert.equal(result.value.title, "");
    assert.equal(result.value.language, "javascript", "auto should be resolved by detection");
  });

  it("keeps an explicit language instead of detecting one", () => {
    const result = parseNewSnippet({ code: CODE, language: "typescript" });
    assert.ok(result.ok);
    assert.equal(result.value.language, "typescript");
  });

  it("trims the title and strips trailing whitespace from the code", () => {
    const result = parseNewSnippet({ title: "  Add numbers  ", code: `${CODE}\n\n   \n` });
    assert.ok(result.ok);
    assert.equal(result.value.title, "Add numbers");
    assert.equal(result.value.code, CODE);
  });

  const invalid: [string, unknown][] = [
    ["missing code", {}],
    ["code that is too short", { code: "x = 1" }],
    ["whitespace-only code", { code: " ".repeat(50) }],
    ["code over the size limit", { code: "a".repeat(MAX_CODE_LENGTH + 1) }],
    ["a title over the limit", { code: CODE, title: "t".repeat(MAX_TITLE_LENGTH + 1) }],
    ["an unsupported language", { code: CODE, language: "cobol" }],
    ["a non-object body", "DROP TABLE snippets;"],
    ["null", null],
  ];
  for (const [label, body] of invalid) {
    it(`rejects ${label} with a readable message`, () => {
      const result = parseNewSnippet(body);
      assert.equal(result.ok, false);
      if (!result.ok) assert.ok(result.error.length > 5, `message was: ${result.error}`);
    });
  }
});

describe("parseListParams", () => {
  it("uses safe defaults", () => {
    assert.deepEqual(parseListParams(new URLSearchParams()), { tag: null, language: null, limit: 12, offset: 0 });
  });

  it("clamps limit and offset so a caller cannot ask for everything", () => {
    const p = parseListParams(new URLSearchParams("limit=10000&offset=-5"));
    assert.equal(p.limit, 48);
    assert.equal(p.offset, 0);
  });

  it("ignores junk numbers", () => {
    assert.equal(parseListParams(new URLSearchParams("limit=abc")).limit, 12);
  });
});

describe("parseSearchQuery", () => {
  it("trims the query", () => {
    assert.deepEqual(parseSearchQuery(new URLSearchParams("q=  debounce  ")), { q: "debounce" });
  });

  it("rejects empty and over-long queries", () => {
    assert.ok("error" in parseSearchQuery(new URLSearchParams("q=   ")));
    assert.ok("error" in parseSearchQuery(new URLSearchParams({ q: "a".repeat(201) })));
  });
});

describe("UUID_RE", () => {
  it("only matches real UUIDs, so ids are checked before they reach SQL", () => {
    assert.ok(UUID_RE.test("3f2b8c1e-9d4a-4b7e-8f21-0c6d5e4a3b21"));
    assert.ok(!UUID_RE.test("1 OR 1=1"));
    assert.ok(!UUID_RE.test("3f2b8c1e-9d4a-4b7e-8f21-0c6d5e4a3b21; --"));
  });
});
