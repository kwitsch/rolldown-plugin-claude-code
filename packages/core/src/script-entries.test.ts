import { expect, it } from "vitest";
import type { Issue, IssueCode } from "./index.js";
import { scriptEntries } from "./index.js";

type IssuePath = readonly (string | number)[];

const issue = (code: IssueCode, message: string, path: IssuePath): Issue => ({
  severity: "error",
  code,
  message,
  path,
});

const script = (source: string, output: string): object => ({ kind: "script", source, output });

const PATH_REASON = "must be a relative path to a .ts or .mts file";

it("maps the README example to three entries", () => {
  expect(scriptEntries({
    bin: ["src/bin/doctor.ts"],
    skillScripts: { dprint: ["src/skills/dprint/run-dprint.ts", "src/skills/dprint/check-dprint.ts"] },
  })).toEqual({
    entries: [
      { kind: "script", source: "src/bin/doctor.ts", output: "bin/doctor.mjs" },
      { kind: "script", source: "src/skills/dprint/run-dprint.ts", output: "skills/dprint/run-dprint.mjs" },
      { kind: "script", source: "src/skills/dprint/check-dprint.ts", output: "skills/dprint/check-dprint.mjs" },
    ],
    issues: [],
  });
});

it("returns no entries and no issues for an empty config", () => {
  expect(scriptEntries({})).toEqual({ entries: [], issues: [] });
});

it("accepts a relative .mts path", () => {
  expect(scriptEntries({ bin: ["src/tool.mts"] })).toEqual({
    entries: [script("src/tool.mts", "bin/tool.mjs")],
    issues: [],
  });
});

it("keeps an entry for a source that does not exist (checked by the plugin)", () => {
  expect(scriptEntries({ bin: ["src/missing.ts"] })).toEqual({
    entries: [script("src/missing.ts", "bin/missing.mjs")],
    issues: [],
  });
});

it.each([
  [1, "1"],
  ["", "\"\""],
  ["/a.ts", "\"/a.ts\""],
  ["a.js", "\"a.js\""],
  [".ts", "\".ts\""],
  ["src/.ts", "\"src/.ts\""],
  ["src\\.ts", "\"src\\\\.ts\""],
])("rejects bin item %j as path-invalid", (item, shown) => {
  expect(scriptEntries({ bin: [item] })).toEqual({
    entries: [],
    issues: [issue("path-invalid", `bin[0] ${shown}: ${PATH_REASON}`, ["bin", 0])],
  });
});

it.each(["", ".", "..", "a/b", "a\\b"])("rejects skill name %j as path-invalid", (name) => {
  const result = scriptEntries({ skillScripts: { [name]: ["src/a.ts"] } });
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    expect.objectContaining({ severity: "error", code: "path-invalid", path: ["skillScripts", name] }),
  ]);
  expect(result.issues[0]?.message).toMatch(/: skill name must not be empty, "\." or "\.\." or contain \/ or \\$/);
});

it("reports a wrong container type as field-type", () => {
  expect(scriptEntries({ bin: "x.ts" })).toEqual({
    entries: [],
    issues: [issue("field-type", "bin \"x.ts\": must be an array", ["bin"])],
  });
  expect(scriptEntries({ skillScripts: [] })).toEqual({
    entries: [],
    issues: [issue("field-type", "skillScripts []: must be an object", ["skillScripts"])],
  });
  expect(scriptEntries({ skillScripts: { s: "x.ts" } })).toEqual({
    entries: [],
    issues: [issue("field-type", "skillScripts.s \"x.ts\": must be an array", ["skillScripts", "s"])],
  });
});

it("keeps the other items after a bad one", () => {
  expect(scriptEntries({ bin: [1, "src/a.ts"] })).toEqual({
    entries: [script("src/a.ts", "bin/a.mjs")],
    issues: [issue("path-invalid", `bin[0] 1: ${PATH_REASON}`, ["bin", 0])],
  });
});

it("dedupes the same source in bin and in one skill", () => {
  expect(scriptEntries({ bin: ["src/a.ts", "src/a.ts"], skillScripts: { s: ["src/b.ts", "src/b.ts"] } })).toEqual({
    entries: [script("src/a.ts", "bin/a.mjs"), script("src/b.ts", "skills/s/b.mjs")],
    issues: [],
  });
});

it("reports two sources with one name in bin as entry-conflict", () => {
  expect(scriptEntries({ bin: ["src/a.ts", "lib/a.mts"] })).toEqual({
    entries: [script("src/a.ts", "bin/a.mjs")],
    issues: [issue("entry-conflict", "bin[1] \"lib/a.mts\": bin/a.mjs is already built from \"src/a.ts\"", ["bin", 1])],
  });
});

it("reports two sources with one name in one skill as entry-conflict", () => {
  expect(scriptEntries({ skillScripts: { s: ["src/a.ts", "lib/a.ts"] } })).toEqual({
    entries: [script("src/a.ts", "skills/s/a.mjs")],
    issues: [
      issue(
        "entry-conflict",
        "skillScripts.s[1] \"lib/a.ts\": skills/s/a.mjs is already built from \"src/a.ts\"",
        ["skillScripts", "s", 1],
      ),
    ],
  });
});

it("allows one name in two skills", () => {
  expect(scriptEntries({ skillScripts: { s: ["src/s/run.ts"], t: ["src/t/run.ts"] } })).toEqual({
    entries: [script("src/s/run.ts", "skills/s/run.mjs"), script("src/t/run.ts", "skills/t/run.mjs")],
    issues: [],
  });
});

it("builds one source as bin script and as skill script", () => {
  expect(scriptEntries({ bin: ["src/a.ts"], skillScripts: { s: ["src/a.ts"] } })).toEqual({
    entries: [script("src/a.ts", "bin/a.mjs"), script("src/a.ts", "skills/s/a.mjs")],
    issues: [],
  });
});

it("orders bin before skillScripts, skills in key order, items in list order", () => {
  const result = scriptEntries({
    skillScripts: { z: ["src/z.ts"], a: ["src/a1.ts", "src/a2.ts"] },
    bin: ["src/b2.ts", "src/b1.ts"],
  });
  expect(result.issues).toEqual([]);
  expect(result.entries.map((entry) => entry.output)).toEqual([
    "bin/b2.mjs",
    "bin/b1.mjs",
    "skills/z/z.mjs",
    "skills/a/a1.mjs",
    "skills/a/a2.mjs",
  ]);
});

it("treats ./a.ts and a.ts as the same source", () => {
  expect(scriptEntries({ bin: ["./a.ts", "a.ts"] })).toEqual({
    entries: [script("a.ts", "bin/a.mjs")],
    issues: [],
  });
});

it("works on a deeply frozen input and leaves it unchanged", () => {
  const make = () => ({ bin: ["src/a.ts", 1], skillScripts: { s: ["src/b.ts"] } });
  const input = make();
  Object.freeze(input.bin);
  Object.freeze(input.skillScripts.s);
  Object.freeze(input.skillScripts);
  Object.freeze(input);
  const result = scriptEntries(input);
  expect(result.entries).toEqual([script("src/a.ts", "bin/a.mjs"), script("src/b.ts", "skills/s/b.mjs")]);
  expect(result.issues).toHaveLength(1);
  expect(input).toEqual(make());
});
