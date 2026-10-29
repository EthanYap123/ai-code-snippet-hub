import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectLanguage, isLanguageId, languageLabel } from "../../src/lib/languages";
import { SEED_SNIPPETS } from "../../src/lib/seed";

const SAMPLES: [string, string][] = [
  ["python", "import os\n\ndef greet(name):\n    print(f'hi {name}')\n"],
  ["typescript", "interface User {\n  id: string;\n}\nexport const get = (id: string): Promise<User> => fetch(id);"],
  ["javascript", "const express = require('express');\nconst app = express();\nconsole.log('up');"],
  ["go", "package main\n\nimport \"fmt\"\n\nfunc main() {\n  x := 1\n  fmt.Println(x)\n}"],
  ["rust", "fn main() {\n    let mut v = vec![1, 2];\n    println!(\"{:?}\", v);\n}"],
  ["java", "public class Hello {\n  public static void main(String[] a) {\n    System.out.println(\"hi\");\n  }\n}"],
  // Regression: the FROM line of a query used to be read as a Dockerfile FROM.
  ["sql", "SELECT id, name\nFROM users\nWHERE active = true;"],
  ["sql", "SELECT *\nFROM orders o\nJOIN users u ON u.id = o.user_id;"],
  ["csharp", "using System.Linq;\n\npublic record Order(string Customer, decimal Total);\n\nvar big = orders.Where(o => o.Total > 100).ToList();"],
  ["dockerfile", "FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD [\"node\", \"server.js\"]"],
  ["dockerfile", "# syntax=docker/dockerfile:1\nARG NODE=22\nFROM node:${NODE}-alpine AS build\nRUN npm ci"],
];

describe("detectLanguage", () => {
  for (const [expected, code] of SAMPLES) {
    it(`detects ${expected}`, () => {
      assert.equal(detectLanguage(code), expected);
    });
  }

  // Regression: the C# LINQ seed was detected as TSX because of `IEnumerable<Order>`.
  for (const seed of SEED_SNIPPETS) {
    it(`detects the seed snippet "${seed.title}" as ${seed.language}`, () => {
      assert.equal(detectLanguage(seed.code), seed.language);
    });
  }

  it("falls back to plain text for empty input", () => {
    assert.equal(detectLanguage(""), "plaintext");
    assert.equal(detectLanguage("   \n  "), "plaintext");
  });
});

describe("language helpers", () => {
  it("labels known ids and passes unknown ones through", () => {
    assert.equal(languageLabel("csharp"), "C#");
    assert.equal(languageLabel("cobol"), "cobol");
  });

  it("guards the language id type", () => {
    assert.equal(isLanguageId("python"), true);
    assert.equal(isLanguageId("cobol"), false);
  });
});
