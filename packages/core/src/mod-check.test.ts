import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Issue } from "./index.js";
import { checkMod } from "./index.js";

const ALLOWED = "a mod may import only relative paths and \"claude-code\"";
const FILE = "hooks/register.js";

const issue = (message: string, file: string = FILE): Issue => ({
  severity: "error",
  code: "mod-invalid",
  file,
  message,
});

const fixture = (path: string): Promise<string> =>
  readFile(new URL(`../../../fixtures/${path}`, import.meta.url), "utf8");

describe("checkMod", () => {
  it("accepts the minified mod-and-script fixture mod", async () => {
    const code = await fixture("mod-and-script/expected/hooks/register.js");
    expect(checkMod(code, FILE)).toEqual({ issues: [] });
  });

  it("accepts the commented mod-only fixture mod", async () => {
    const code = await fixture("mod-only/expected/hooks/register.js");
    expect(checkMod(code, FILE)).toEqual({ issues: [] });
  });

  it.each([
    ["a node:* static import", "import { readFileSync } from \"node:fs\";\nexport { readFileSync };\n", "node:fs"],
    ["a bare import", "import { readFileSync } from \"fs\";\nexport { readFileSync };\n", "fs"],
    ["a claude-code subpath", "import { on } from \"claude-code/x\";\nexport { on };\n", "claude-code/x"],
    ["an export from", "export * from \"lodash\";\n", "lodash"],
    ["a literal dynamic import", "export const load = () => import(\"node:fs\");\n", "node:fs"],
  ])("rejects %s", (_name, code, specifier) => {
    expect(checkMod(code, FILE)).toEqual({
      issues: [issue(`import "${specifier}" is not allowed; ${ALLOWED}`)],
    });
  });

  it("rejects a computed dynamic import", () => {
    expect(checkMod("export const load = (name) => import(name);\n", FILE)).toEqual({
      issues: [issue(`dynamic import with a computed specifier; ${ALLOWED}`)],
    });
  });

  it("rejects a shebang", () => {
    expect(checkMod("#!/usr/bin/env node\nexport function register() {}\n", FILE)).toEqual({
      issues: [issue("a mod must not start with a shebang")],
    });
  });

  it("rejects a file name that does not end in .js", () => {
    expect(checkMod("export function register() {}\n", "hooks/register.mjs")).toEqual({
      issues: [issue("file name must end in \".js\"", "hooks/register.mjs")],
    });
  });

  it("reports a lexer error as an issue", () => {
    const { issues } = checkMod("import \"./a.js", FILE);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("mod-invalid");
    expect(issues[0]?.file).toBe(FILE);
    expect(issues[0]?.message.startsWith("cannot be read as an ES module: ")).toBe(true);
  });

  it("accepts relative paths, claude-code and import.meta", () => {
    const code = [
      "import { a } from \"./a.js\";",
      "import { b } from \"../b.js\";",
      "import { on } from \"claude-code\";",
      "export const url = import.meta.url;",
      "export const lazy = () => import(\"./c.js\");",
      "export { a, b, on };",
      "",
    ].join("\n");
    expect(checkMod(code, FILE)).toEqual({ issues: [] });
  });

  it("ignores import text inside a string literal and a comment", () => {
    const code = "// import(\"node:fs\")\nexport const text = 'import(\"node:fs\")';\n";
    expect(checkMod(code, FILE)).toEqual({ issues: [] });
  });

  it("reports the same specifier once", () => {
    expect(checkMod("import \"fs\";\nimport \"fs\";\n", FILE)).toEqual({
      issues: [issue(`import "fs" is not allowed; ${ALLOWED}`)],
    });
  });
});
