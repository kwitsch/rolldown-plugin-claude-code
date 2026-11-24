import { expect, it } from "vitest";
import type { Issue, IssueCode } from "./index.js";
import { bundleEntries } from "./index.js";

type IssuePath = readonly (string | number)[];

const issue = (code: IssueCode, message: string, path: IssuePath): Issue => ({
  severity: "error",
  code,
  message,
  path,
});

const bundle = (source: string, output: string): object => ({ kind: "bundle", source, output });

const FOLDER_REASON = "must be a relative folder without \"..\"";
const SOURCE_REASON = "must be a relative path to a .ts or .mts file";
const TARGET_REASON = "must be a relative path without \"..\"";

it("maps the README example to one entry and three files in key order", () => {
  expect(bundleEntries({
    bundles: { "mcp/vendor": "src/mcp/vendor/index.ts" },
    files: {
      "mcp/vendor/web-tree-sitter.wasm": "/deps/web-tree-sitter.wasm",
      "mcp/vendor/tree-sitter-java_orchard.wasm": "/deps/tree-sitter-java_orchard.wasm",
      "mcp/main.wasm": "/deps/main.wasm",
    },
  })).toEqual({
    entries: [bundle("src/mcp/vendor/index.ts", "mcp/vendor/index.mjs")],
    files: [
      { source: "/deps/web-tree-sitter.wasm", output: "mcp/vendor/web-tree-sitter.wasm" },
      { source: "/deps/tree-sitter-java_orchard.wasm", output: "mcp/vendor/tree-sitter-java_orchard.wasm" },
      { source: "/deps/main.wasm", output: "mcp/main.wasm" },
    ],
    issues: [],
  });
});

it("returns nothing for an empty config", () => {
  expect(bundleEntries({})).toEqual({ entries: [], files: [], issues: [] });
  expect(bundleEntries({ bundles: {}, files: {} })).toEqual({ entries: [], files: [], issues: [] });
});

it("reports non-object bundles and files as field-type", () => {
  expect(bundleEntries({ bundles: [], files: "x" })).toEqual({
    entries: [],
    files: [],
    issues: [
      issue("field-type", "bundles []: must be an object", ["bundles"]),
      issue("field-type", "files \"x\": must be an object", ["files"]),
    ],
  });
  expect(bundleEntries({ bundles: null }).issues).toEqual([
    issue("field-type", "bundles null: must be an object", ["bundles"]),
  ]);
});

it("reports non-string values as field-type", () => {
  expect(bundleEntries({ bundles: { lib: 1 }, files: { a: null } })).toEqual({
    entries: [],
    files: [],
    issues: [
      issue("field-type", "bundles.lib 1: must be a string", ["bundles", "lib"]),
      issue("field-type", "files.a null: must be a string", ["files", "a"]),
    ],
  });
});

it.each(["", ".", "./", "/abs", "~/x", "C:/x", "..", "a/../b", "a\\..\\b"])(
  "rejects bundle folder %j as path-invalid",
  (folder) => {
    expect(bundleEntries({ bundles: { [folder]: "src/a.ts" } })).toEqual({
      entries: [],
      files: [],
      issues: [
        issue("path-invalid", `bundles.${folder} ${JSON.stringify(folder)}: ${FOLDER_REASON}`, ["bundles", folder]),
      ],
    });
  },
);

it.each(["", "/a.ts", "C:/a.ts", "src/a.js", "src/.ts"])("rejects bundle source %j as path-invalid", (source) => {
  expect(bundleEntries({ bundles: { lib: source } })).toEqual({
    entries: [],
    files: [],
    issues: [issue("path-invalid", `bundles.lib ${JSON.stringify(source)}: ${SOURCE_REASON}`, ["bundles", "lib"])],
  });
});

it("accepts an .mts source and normalizes folder and source", () => {
  expect(bundleEntries({ bundles: { "lib/": "./src/lib.mts" } })).toEqual({
    entries: [bundle("src/lib.mts", "lib/index.mjs")],
    files: [],
    issues: [],
  });
});

it("reports the same folder written as x and x/ as entry-conflict", () => {
  expect(bundleEntries({ bundles: { x: "src/a.ts", "x/": "src/b.ts" } })).toEqual({
    entries: [bundle("src/a.ts", "x/index.mjs")],
    files: [],
    issues: [issue("entry-conflict", "bundles.x/ \"src/b.ts\": x overlaps bundle folder \"x\"", ["bundles", "x/"])],
  });
});

it("reports a files target equal to or above a bundle folder as entry-conflict", () => {
  const result = bundleEntries({
    bundles: { "lib/shared": "src/s.ts" },
    files: { "lib/shared": "a.txt", lib: "b.txt" },
  });
  expect(result.files).toEqual([]);
  expect(result.issues.map((found) => found.code)).toEqual(["entry-conflict", "entry-conflict"]);
});

it("reports nested folders as entry-conflict in both orders", () => {
  expect(bundleEntries({ bundles: { mcp: "src/m.ts", "mcp/vendor": "src/v.ts" } })).toEqual({
    entries: [bundle("src/m.ts", "mcp/index.mjs")],
    files: [],
    issues: [
      issue(
        "entry-conflict",
        "bundles.mcp/vendor \"src/v.ts\": mcp/vendor overlaps bundle folder \"mcp\"",
        ["bundles", "mcp/vendor"],
      ),
    ],
  });
  expect(bundleEntries({ bundles: { "mcp/vendor": "src/v.ts", mcp: "src/m.ts" } })).toEqual({
    entries: [bundle("src/v.ts", "mcp/vendor/index.mjs")],
    files: [],
    issues: [
      issue("entry-conflict", "bundles.mcp \"src/m.ts\": mcp overlaps bundle folder \"mcp/vendor\"", [
        "bundles",
        "mcp",
      ]),
    ],
  });
});

it("allows folders that only share a prefix without a / boundary", () => {
  expect(bundleEntries({ bundles: { mcp: "src/m.ts", mcpx: "src/x.ts" } })).toEqual({
    entries: [bundle("src/m.ts", "mcp/index.mjs"), bundle("src/x.ts", "mcpx/index.mjs")],
    files: [],
    issues: [],
  });
});

it.each(["", "/abs.txt", "C:/a.txt", "../a.txt", "a/../../b.txt", "a\\..\\b.txt"])(
  "rejects files target %j as path-invalid",
  (target) => {
    expect(bundleEntries({ files: { [target]: "data/a.txt" } })).toEqual({
      entries: [],
      files: [],
      issues: [
        issue("path-invalid", `files.${target} ${JSON.stringify(target)}: ${TARGET_REASON}`, ["files", target]),
      ],
    });
  },
);

it("reports an .mjs files target inside a bundle folder as entry-conflict", () => {
  expect(bundleEntries({
    bundles: { "lib/shared": "src/s.ts" },
    files: { "lib/shared/extra.mjs": "data/extra.mjs" },
  })).toEqual({
    entries: [bundle("src/s.ts", "lib/shared/index.mjs")],
    files: [],
    issues: [
      issue(
        "entry-conflict",
        "files.lib/shared/extra.mjs \"data/extra.mjs\": lib/shared/extra.mjs lies in bundle folder \"lib/shared\"; chunk names are not known before the build",
        ["files", "lib/shared/extra.mjs"],
      ),
    ],
  });
});

it("allows non-.mjs targets inside and .mjs targets outside a bundle folder, normalizing the target", () => {
  expect(bundleEntries({
    bundles: { "lib/shared": "src/s.ts" },
    files: { "lib/shared/a.wasm": "/deps/a.wasm", "./lib/other.mjs": "data/other.mjs" },
  })).toEqual({
    entries: [bundle("src/s.ts", "lib/shared/index.mjs")],
    files: [
      { source: "/deps/a.wasm", output: "lib/shared/a.wasm" },
      { source: "data/other.mjs", output: "lib/other.mjs" },
    ],
    issues: [],
  });
});

it("works on a deeply frozen input and leaves it unchanged", () => {
  const make = () => ({ bundles: { lib: "src/a.ts", bad: 1 }, files: { "a.txt": "data/a.txt" } });
  const input = make();
  Object.freeze(input.bundles);
  Object.freeze(input.files);
  Object.freeze(input);
  const result = bundleEntries(input);
  expect(result.entries).toEqual([bundle("src/a.ts", "lib/index.mjs")]);
  expect(result.files).toEqual([{ source: "data/a.txt", output: "a.txt" }]);
  expect(result.issues).toHaveLength(1);
  expect(input).toEqual(make());
});
