import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkModPath } from "./check-mod.js";

const VALID = "function register(_on, _options) {}\nexport { register };\n";
const INVALID = "import \"node:fs\";\nexport function register() {}\n";
const NODE_FS = "import \"node:fs\" is not allowed; a mod may import only relative paths and \"claude-code\"";

// Writes files into a fresh directory and returns it.
async function dir(files: Record<string, string>): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cch-")));
  for (const [file, content] of Object.entries(files)) await writeFile(join(root, file), content);
  return root;
}

describe("checkModPath with a .js file", () => {
  it("passes a valid mod", async () => {
    const root = await dir({ "register.js": VALID });
    const path = join(root, "register.js");
    expect(await checkModPath(path)).toEqual({ code: 0, lines: [`"${path}" meets the Claude Code mod rules`] });
  });

  it("fails an invalid mod", async () => {
    const root = await dir({ "register.js": INVALID });
    const path = join(root, "register.js");
    expect(await checkModPath(path)).toEqual({ code: 1, lines: [`error mod-invalid: ${path}: ${NODE_FS}`] });
  });

  it("checks a non-.js file as a mod", async () => {
    const root = await dir({ "register.mjs": VALID });
    const path = join(root, "register.mjs");
    expect(await checkModPath(path)).toEqual({
      code: 1,
      lines: [`error mod-invalid: ${path}: file name must end in ".js"`],
    });
  });
});

describe("checkModPath with a hooks file", () => {
  const hooks = (value: unknown): string => JSON.stringify(value);

  it("reports only the invalid one of two modules", async () => {
    const root = await dir({
      "hooks.json": hooks({ modules: ["./a.js", "./b.js"], hooks: {} }),
      "a.js": VALID,
      "b.js": INVALID,
    });
    expect(await checkModPath(join(root, "hooks.json"))).toEqual({
      code: 1,
      lines: [`error mod-invalid: ${join(root, "b.js")}: ${NODE_FS}`],
    });
  });

  it("passes valid modules with one line each", async () => {
    const root = await dir({ "hooks.json": hooks({ modules: ["./a.js"] }), "a.js": VALID });
    expect(await checkModPath(join(root, "hooks.json"))).toEqual({
      code: 0,
      lines: [`"${join(root, "a.js")}" meets the Claude Code mod rules`],
    });
  });

  it.each([
    ["without modules", { hooks: {} }],
    ["with empty modules", { modules: [] }],
  ])("fails a hooks file %s", async (_name, value) => {
    const root = await dir({ "hooks.json": hooks(value) });
    const path = join(root, "hooks.json");
    expect(await checkModPath(path)).toEqual({ code: 1, lines: [`error: "${path}" has no "modules" entry`] });
  });

  it("fails a non-string module entry", async () => {
    const root = await dir({ "hooks.json": hooks({ modules: [1] }) });
    const path = join(root, "hooks.json");
    expect(await checkModPath(path)).toEqual({
      code: 1,
      lines: [`error: "modules" in "${path}" must list file paths`],
    });
  });

  it("fails a module outside the hooks folder", async () => {
    const root = await dir({ "hooks.json": hooks({ modules: ["../x.js"] }) });
    expect(await checkModPath(join(root, "hooks.json"))).toEqual({
      code: 1,
      lines: ["error: module \"../x.js\" must stay inside the hooks folder"],
    });
  });

  it("accepts a module whose name starts with two dots", async () => {
    const root = await dir({ "hooks.json": hooks({ modules: ["./..x.js"] }), "..x.js": VALID });
    expect(await checkModPath(join(root, "hooks.json"))).toEqual({
      code: 0,
      lines: [`"${join(root, "..x.js")}" meets the Claude Code mod rules`],
    });
  });

  it("fails a missing module file", async () => {
    const root = await dir({ "hooks.json": hooks({ modules: ["./missing.js"] }) });
    const missing = join(root, "missing.js");
    expect(await checkModPath(join(root, "hooks.json"))).toEqual({
      code: 1,
      lines: [`error: cannot read mod "${missing}": ENOENT: no such file or directory, open '${missing}'`],
    });
  });

  it("fails a malformed hooks file", async () => {
    const root = await dir({ "hooks.json": "{" });
    const path = join(root, "hooks.json");
    const result = await checkModPath(path);
    expect(result.code).toBe(1);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.startsWith(`error: cannot read hooks file "${path}": `)).toBe(true);
  });
});
