import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { HookEntry, Issue, IssueCode, PluginManifest } from "./index.js";
import { validateLayout } from "./index.js";

type IssuePath = readonly (string | number)[];
type ManifestFields = Omit<PluginManifest, "name">;

// toEqual ignores an undefined path, so issues without a JSON path pass no path.
const issue = (code: IssueCode, message: string, file: string, path?: IssuePath): Issue => ({
  severity: "error",
  code,
  message,
  path,
  file,
});

const PLUGIN_JSON = ".claude-plugin/plugin.json";
const HOOKS_JSON = "hooks/hooks.json";
const MOD: HookEntry = { kind: "mod", source: "register.ts", output: "hooks/register.js" };
const SCRIPT: HookEntry = { kind: "script", source: "pre-tool.ts", output: "hooks/pre-tool.mjs" };

const pluginJsonMissing: Issue = issue(
  "path-missing",
  `".claude-plugin/plugin.json" is missing or not a file`,
  PLUGIN_JSON,
);
const hooksJsonMissing: Issue = issue("path-missing", `"hooks/hooks.json" is missing or not a file`, HOOKS_JSON);

const entryMissing = (entry: HookEntry): Issue =>
  issue(
    "path-missing",
    `${JSON.stringify(entry.output)} built from ${JSON.stringify(entry.source)} is missing or not a file`,
    entry.output,
  );

const missing = (label: string, path: IssuePath, value: string, file: string): Issue =>
  issue("path-missing", `${label} ${JSON.stringify(value)} does not exist`, file, path);

const wrongKind = (
  label: string,
  path: IssuePath,
  value: string,
  file: string,
  expected: string,
  found: string,
): Issue =>
  issue("path-invalid", `${label} ${JSON.stringify(value)} must be a ${expected}, found a ${found}`, file, path);

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "validate-layout-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// An entry ending in "/" creates a directory, any other an empty file with its parent directories.
const build = async (files: readonly string[]): Promise<void> => {
  for (const file of files) {
    if (file.endsWith("/")) {
      await mkdir(join(dir, file), { recursive: true });
    } else {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), "");
    }
  }
};

const check = (manifest: ManifestFields, entries?: readonly HookEntry[]): Promise<readonly Issue[]> =>
  validateLayout({ outDir: dir, manifest: { name: "demo", ...manifest }, entries });

// Valid layout

it("accepts a minimal layout with only plugin.json", async () => {
  await build([PLUGIN_JSON]);
  expect(await check({})).toEqual([]);
});

it("accepts a full layout with hooks.json, mod and script outputs", async () => {
  await build([PLUGIN_JSON, HOOKS_JSON, MOD.output, SCRIPT.output]);
  expect(await check({}, [MOD, SCRIPT])).toEqual([]);
});

// outDir

it("reports a missing outDir once and stops", async () => {
  const outDir = join(dir, "nope");
  const result = await validateLayout({ outDir, manifest: { name: "demo", agents: "./agents/x.md" }, entries: [MOD] });
  expect(result).toEqual([issue("path-missing", `outDir ${JSON.stringify(outDir)} does not exist`, outDir)]);
});

it("reports an outDir that is a file once and stops", async () => {
  await build(["plain"]);
  const outDir = join(dir, "plain");
  const result = await validateLayout({ outDir, manifest: { name: "demo", agents: "./agents/x.md" }, entries: [MOD] });
  expect(result).toEqual([
    issue("path-invalid", `outDir ${JSON.stringify(outDir)} must be a directory, found a file`, outDir),
  ]);
});

// Fixed files

it("reports a missing plugin.json", async () => {
  expect(await check({})).toEqual([pluginJsonMissing]);
});

it("reports a plugin.json that is a directory as missing", async () => {
  await build([`${PLUGIN_JSON}/`]);
  expect(await check({})).toEqual([pluginJsonMissing]);
});

it("reports a missing hooks.json when entries exist", async () => {
  await build([PLUGIN_JSON, MOD.output, SCRIPT.output]);
  expect(await check({}, [MOD, SCRIPT])).toEqual([hooksJsonMissing]);
});

it("does not require hooks.json without entries", async () => {
  await build([PLUGIN_JSON]);
  expect(await check({})).toEqual([]);
  expect(await check({}, [])).toEqual([]);
});

// Manifest paths: one present and one missing path per field of spec table 4.2

interface PathCase {
  readonly name: string;
  readonly manifest: ManifestFields;
  readonly present: string;
  readonly label: string;
  readonly path: IssuePath;
  readonly value: string;
  readonly file: string;
}

const PATH_CASES: readonly PathCase[] = [
  {
    name: "types",
    manifest: { types: "./types/index.d.ts" },
    present: "types/index.d.ts",
    label: "types",
    path: ["types"],
    value: "./types/index.d.ts",
    file: "types/index.d.ts",
  },
  {
    name: "skills",
    manifest: { skills: "./extra-skills/" },
    present: "extra-skills/",
    label: "skills",
    path: ["skills"],
    value: "./extra-skills/",
    file: "extra-skills",
  },
  {
    name: "commands as a string",
    manifest: { commands: "./commands/deploy.md" },
    present: "commands/deploy.md",
    label: "commands",
    path: ["commands"],
    value: "./commands/deploy.md",
    file: "commands/deploy.md",
  },
  {
    name: "commands object source",
    manifest: { commands: { deploy: { source: "./commands/deploy.md" } } },
    present: "commands/deploy.md",
    label: "commands.deploy.source",
    path: ["commands", "deploy", "source"],
    value: "./commands/deploy.md",
    file: "commands/deploy.md",
  },
  {
    name: "agents",
    manifest: { agents: "./agents/reviewer.md" },
    present: "agents/reviewer.md",
    label: "agents",
    path: ["agents"],
    value: "./agents/reviewer.md",
    file: "agents/reviewer.md",
  },
  {
    name: "hooks",
    manifest: { hooks: "./config/hooks.json" },
    present: "config/hooks.json",
    label: "hooks",
    path: ["hooks"],
    value: "./config/hooks.json",
    file: "config/hooks.json",
  },
  {
    name: "mcpServers",
    manifest: { mcpServers: "./.mcp.json" },
    present: ".mcp.json",
    label: "mcpServers",
    path: ["mcpServers"],
    value: "./.mcp.json",
    file: ".mcp.json",
  },
  {
    name: "lspServers",
    manifest: { lspServers: "./.lsp.json" },
    present: ".lsp.json",
    label: "lspServers",
    path: ["lspServers"],
    value: "./.lsp.json",
    file: ".lsp.json",
  },
  {
    name: "outputStyles",
    manifest: { outputStyles: "./styles/" },
    present: "styles/",
    label: "outputStyles",
    path: ["outputStyles"],
    value: "./styles/",
    file: "styles",
  },
];

for (const pathCase of PATH_CASES) {
  it(`accepts a present ${pathCase.name} path`, async () => {
    await build([PLUGIN_JSON, pathCase.present]);
    expect(await check(pathCase.manifest)).toEqual([]);
  });

  it(`reports a missing ${pathCase.name} path`, async () => {
    await build([PLUGIN_JSON]);
    expect(await check(pathCase.manifest)).toEqual([
      missing(pathCase.label, pathCase.path, pathCase.value, pathCase.file),
    ]);
  });
}

// Kind of path

it("reports skills pointing to a file", async () => {
  await build([PLUGIN_JSON, "extra-skills"]);
  expect(await check({ skills: "./extra-skills/" })).toEqual([
    wrongKind("skills", ["skills"], "./extra-skills/", "extra-skills", "directory", "file"),
  ]);
});

it("reports agents pointing to a directory", async () => {
  await build([PLUGIN_JSON, "agents/reviewer.md/"]);
  expect(await check({ agents: "./agents/reviewer.md" })).toEqual([
    wrongKind("agents", ["agents"], "./agents/reviewer.md", "agents/reviewer.md", "file", "directory"),
  ]);
});

it("accepts commands as a file or a directory", async () => {
  await build([PLUGIN_JSON, "commands/deploy.md", "more-commands/"]);
  expect(await check({ commands: ["./commands/deploy.md", "./more-commands"] })).toEqual([]);
});

it("accepts outputStyles as a file or a directory", async () => {
  await build([PLUGIN_JSON, "styles/terse.md", "more-styles/"]);
  expect(await check({ outputStyles: ["./styles/terse.md", "./more-styles"] })).toEqual([]);
});

it("reports a path below a file as missing", async () => {
  await build([PLUGIN_JSON, "agents"]);
  expect(await check({ agents: "./agents/x.md" })).toEqual([
    missing("agents", ["agents"], "./agents/x.md", "agents/x.md"),
  ]);
});

// Special cases

it("accepts skills \".\" as outDir itself", async () => {
  await build([PLUGIN_JSON]);
  expect(await check({ skills: "." })).toEqual([]);
});

it("skips https URLs in mcpServers", async () => {
  await build([PLUGIN_JSON]);
  expect(await check({ mcpServers: "https://example.com/mcp" })).toEqual([]);
});

it("skips inline objects in hooks", async () => {
  await build([PLUGIN_JSON]);
  expect(await check({ hooks: { PreToolUse: [] } })).toEqual([]);
});

it("skips paths with a .. segment", async () => {
  await build([PLUGIN_JSON]);
  expect(await check({ agents: ["../outside.md"] })).toEqual([]);
});

// Arrays

it("reports the index of a missing array entry", async () => {
  await build([PLUGIN_JSON, "agents/a.md"]);
  expect(await check({ agents: ["./agents/a.md", "./agents/b.md"] })).toEqual([
    missing("agents[1]", ["agents", 1], "./agents/b.md", "agents/b.md"),
  ]);
});

// Entries

it("reports a missing mod output", async () => {
  await build([PLUGIN_JSON, HOOKS_JSON, SCRIPT.output]);
  expect(await check({}, [MOD, SCRIPT])).toEqual([entryMissing(MOD)]);
});

it("reports a missing script output and names its source", async () => {
  await build([PLUGIN_JSON, HOOKS_JSON, MOD.output]);
  const result = await check({}, [MOD, SCRIPT]);
  expect(result).toEqual([entryMissing(SCRIPT)]);
  expect(result[0]?.message).toContain(`"pre-tool.ts"`);
});

it("accepts present mod and script outputs", async () => {
  await build([PLUGIN_JSON, HOOKS_JSON, MOD.output, SCRIPT.output]);
  expect(await check({}, [MOD, SCRIPT])).toEqual([]);
});

// Order

it("reports plugin.json, manifest paths, hooks.json and entries in that order", async () => {
  expect(await check({ agents: "./agents/x.md" }, [MOD])).toEqual([
    pluginJsonMissing,
    missing("agents", ["agents"], "./agents/x.md", "agents/x.md"),
    hooksJsonMissing,
    entryMissing(MOD),
  ]);
});

// file

it("reports file relative to outDir with / and without ./", async () => {
  await build([PLUGIN_JSON]);
  const [found] = await check({ agents: "./agents/x.md" });
  expect(found?.file).toBe("agents/x.md");
});

// No write access

it("leaves the output directory unchanged", async () => {
  await build([PLUGIN_JSON, "agents/", "extra-skills"]);
  const snapshot = async (): Promise<string[]> => {
    const names = (await readdir(dir, { recursive: true })).toSorted();
    return Promise.all(
      names.map(async (name) => {
        const info = await stat(join(dir, name));
        return `${name} ${info.mtimeMs} ${info.size}`;
      }),
    );
  };
  const before = await snapshot();
  const result = await check({ skills: "./extra-skills/", agents: "./agents/x.md" }, [MOD]);
  expect(result.length).toBeGreaterThan(0);
  expect(await snapshot()).toEqual(before);
});
