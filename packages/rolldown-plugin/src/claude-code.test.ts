import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import type { OutputOptions, RolldownWatcherEvent } from "rolldown";
import { rolldown, watch } from "rolldown";
import { describe, expect, it } from "vitest";
import type { ClaudeCodeOptions } from "./claude-code.js";
import { claudeCode } from "./claude-code.js";

async function project(files: Record<string, string>): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ccp-")));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content);
  }
  return root;
}

interface BuildResult {
  readonly out: string;
  readonly warnings: readonly string[];
}

async function build(
  root: string,
  options: ClaudeCodeOptions = {},
  input: Record<string, string> = { "hooks/register": "src/register.ts" },
  output: OutputOptions = {},
): Promise<BuildResult> {
  const warnings: string[] = [];
  const out = join(root, "out");
  const bundle = await rolldown({
    input: Object.fromEntries(Object.entries(input).map(([name, file]) => [name, join(root, file)])),
    platform: "node",
    external: ["claude-code"],
    plugins: [claudeCode({ root, ...options })],
    onLog(level, log) {
      if (level === "warn") warnings.push(log.message);
    },
  });
  try {
    await bundle.write({ dir: out, format: "es", entryFileNames: "[name].js", ...output });
  } finally {
    await bundle.close();
  }
  return { out, warnings };
}

async function files(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, { recursive: true, withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isFile())
    .map((dirent) => relative(dir, join(dirent.parentPath, dirent.name)))
    .sort();
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const MOD_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "demo", version: "1.0.0" }),
  "hooks.template.json": JSON.stringify({ mod: "./src/register.ts", hooks: {} }),
  "src/register.ts": "export function register(): void {}\n",
};
const TEMPLATE: ClaudeCodeOptions = { hooksTemplate: "hooks.template.json" };
const PLAIN_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "demo", version: "1.0.0" }),
  "src/index.ts": "export const value = 1;\n",
};
const PLAIN_INPUT: Record<string, string> = { index: "src/index.ts" };
const MCP_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "demo", version: "1.0.0" }),
  "mcp.template.json": JSON.stringify({ mcpServers: { demo: { command: "./src/server.ts" } } }),
  "src/server.ts": "console.log(1);\n",
};
const MCP_TEMPLATE: ClaudeCodeOptions = { mcpTemplate: "mcp.template.json" };
const MCP_INPUT: Record<string, string> = { "mcp/server": "src/server.ts" };
// The preset adds the shebang as a banner; do the same here.
const MCP_OUTPUT: OutputOptions = { entryFileNames: "[name].mjs", banner: "#!/usr/bin/env node" };
const MCP_JSON = { mcpServers: { demo: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs"] } } };

describe("output", () => {
  it("emits plugin.json, hooks.json and the mod", async () => {
    const root = await project(MOD_FILES);
    const { out, warnings } = await build(root, TEMPLATE);
    expect(warnings).toEqual([]);
    expect(await files(out)).toEqual([".claude-plugin/plugin.json", "hooks/hooks.json", "hooks/register.js"]);
    expect(await readFile(join(out, ".claude-plugin/plugin.json"), "utf8")).toBe(
      json({ name: "demo", version: "1.0.0" }),
    );
    expect(await readFile(join(out, "hooks/hooks.json"), "utf8")).toBe(json({ modules: ["./register.js"], hooks: {} }));
  });

  it("emits no metadata with emitMetadata: false", async () => {
    const root = await project(MOD_FILES);
    const { out } = await build(root, { ...TEMPLATE, emitMetadata: false });
    expect(await files(out)).toEqual(["hooks/register.js"]);
  });

  it("emits only plugin.json without a template", async () => {
    const root = await project(PLAIN_FILES);
    const { out } = await build(root, {}, PLAIN_INPUT);
    expect(await files(out)).toEqual([".claude-plugin/plugin.json", "index.js"]);
  });

  it("writes manifest overrides into plugin.json", async () => {
    const root = await project(PLAIN_FILES);
    const { out } = await build(root, { manifest: { displayName: "X" } }, PLAIN_INPUT);
    expect(JSON.parse(await readFile(join(out, ".claude-plugin/plugin.json"), "utf8"))).toEqual({
      name: "demo",
      version: "1.0.0",
      displayName: "X",
    });
  });
});

describe("assets", () => {
  it("copies nested files and dot-files", async () => {
    const root = await project({
      ...MOD_FILES,
      "assets/skills/hello/SKILL.md": "# Hello\n",
      "assets/.mcp.json": "{}\n",
    });
    const { out } = await build(root, TEMPLATE);
    expect(await readFile(join(out, "skills/hello/SKILL.md"), "utf8")).toBe("# Hello\n");
    expect(await readFile(join(out, ".mcp.json"), "utf8")).toBe("{}\n");
  });

  it("keeps the file mode", async () => {
    const root = await project({ ...MOD_FILES, "assets/run.sh": "#!/bin/sh\n" });
    await chmod(join(root, "assets/run.sh"), 0o755);
    const { out } = await build(root, TEMPLATE);
    expect((await stat(join(out, "run.sh"))).mode & 0o777).toBe(0o755);
  });

  it("accepts a missing default assets folder", async () => {
    const root = await project(MOD_FILES);
    const { warnings } = await build(root, TEMPLATE);
    expect(warnings).toEqual([]);
  });

  it("rejects a missing explicit assets folder", async () => {
    const root = await project(MOD_FILES);
    await expect(build(root, { ...TEMPLATE, assets: "static" })).rejects.toThrow(
      /path-missing\s+static: assets folder "static" not found/,
    );
  });

  it("rejects an asset that collides with hooks/hooks.json", async () => {
    const root = await project({ ...MOD_FILES, "assets/hooks/hooks.json": "{}\n" });
    await expect(build(root, TEMPLATE)).rejects.toThrow(
      /entry-conflict\s+assets\/hooks\/hooks\.json: asset "hooks\/hooks\.json" collides with a generated file/,
    );
  });

  it("copies nothing with emitMetadata: false", async () => {
    const root = await project({ ...MOD_FILES, "assets/readme.txt": "hi\n" });
    const { out } = await build(root, { ...TEMPLATE, emitMetadata: false });
    expect(await files(out)).toEqual(["hooks/register.js"]);
  });
});

describe("output checks", () => {
  it("allows node:* and claude-code imports in a mod", async () => {
    const root = await project({
      ...MOD_FILES,
      "src/register.ts":
        "import { readFileSync } from \"node:fs\";\nimport { on } from \"claude-code\";\nexport function register(): unknown { return [readFileSync, on]; }\n",
    });
    const { out } = await build(root, TEMPLATE);
    expect(await files(out)).toContain("hooks/register.js");
  });

  it("rejects an input that is not an entry of the template", async () => {
    const root = await project({ ...MOD_FILES, "src/other.ts": "export const x = 1;\n" });
    await expect(build(root, TEMPLATE, { "hooks/other": "src/other.ts" })).rejects.toThrow(
      /is not an entry of the hooks template/,
    );
  });

  it("rejects a second chunk", async () => {
    const root = await project({
      ...MOD_FILES,
      "src/register.ts": "export async function register(): Promise<unknown> { return import(\"./lazy.ts\"); }\n",
      "src/lazy.ts": "export const lazy = 1;\n",
    });
    await expect(build(root, TEMPLATE)).rejects.toThrow(/bundle has 2 chunks; expected exactly one/);
  });

  it("rejects a wrong file name", async () => {
    const root = await project(MOD_FILES);
    await expect(build(root, TEMPLATE, undefined, { entryFileNames: "[name].mjs" })).rejects.toThrow(
      /file name must be "hooks\/register\.js"/,
    );
  });

  it("rejects a non-es format", async () => {
    const root = await project(MOD_FILES);
    await expect(build(root, TEMPLATE, undefined, { format: "cjs" })).rejects.toThrow(
      /output\.format must be "es", got "cjs"/,
    );
  });

  it("rejects a bare external import", async () => {
    const root = await project({
      ...MOD_FILES,
      "src/register.ts":
        "import { readFileSync } from \"fs\";\nexport function register(): unknown { return readFileSync; }\n",
    });
    await expect(build(root, TEMPLATE)).rejects.toThrow(
      /import "fs" is not allowed; only node:\* and claude-code may stay external/,
    );
  });

  it("rejects a shebang in a mod", async () => {
    const root = await project({
      ...MOD_FILES,
      "src/register.ts": "#!/usr/bin/env node\nexport function register(): void {}\n",
    });
    await expect(build(root, TEMPLATE)).rejects.toThrow(/a mod must not start with a shebang/);
  });

  it("rejects a script without a shebang", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "demo", version: "1.0.0" }),
      "hooks.template.json": JSON.stringify({
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "./src/pre.ts" }] }] },
      }),
      "src/pre.ts": "console.log(1);\n",
    });
    await expect(
      build(root, TEMPLATE, { "hooks/pre": "src/pre.ts" }, { entryFileNames: "[name].mjs" }),
    ).rejects.toThrow(/a script must start with a shebang/);
  });
});

describe("error output", () => {
  it("reports two load errors in one message", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "claude-code", version: "1.0.0" }),
      "hooks.template.json": JSON.stringify({ mod: "./src/register.ts", hooks: {} }),
      "src/other.ts": "export const x = 1;\n",
    });
    const error: unknown = await build(root, TEMPLATE, { "hooks/other": "src/other.ts" }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error ? error.message : "").toContain(
      "[claude-code] 2 problems\n"
        + "  error    name-reserved  package.json: name \"claude-code\" is reserved for official Anthropic plugins\n"
        + "  error    path-missing   hooks.template.json: mod \"src/register.ts\" not found",
    );
  });

  it("emits a warning without strict", async () => {
    const root = await project({ ...PLAIN_FILES, "package.json": JSON.stringify({ name: "Demo_Name" }) });
    const { warnings } = await build(root, {}, PLAIN_INPUT);
    expect(warnings).toEqual(["warning  name-invalid  package.json: name \"Demo_Name\" should be kebab-case"]);
  });

  it("fails on a warning with strict", async () => {
    const root = await project({ ...PLAIN_FILES, "package.json": JSON.stringify({ name: "Demo_Name" }) });
    await expect(build(root, { strict: true }, PLAIN_INPUT)).rejects.toThrow(
      /\[claude-code\] 1 problem\n {2}warning {2}name-invalid {2}package\.json: name "Demo_Name" should be kebab-case/,
    );
  });

  it("requires output.dir", async () => {
    const root = await project(PLAIN_FILES);
    await expect(build(root, {}, PLAIN_INPUT, { dir: undefined, file: join(root, "out.js") })).rejects.toThrow(
      /output\.dir is required \(output\.file is not supported\)/,
    );
  });
});

describe("mcp", () => {
  it("emits .mcp.json and the server with mcpTemplate", async () => {
    const root = await project(MCP_FILES);
    const { out, warnings } = await build(root, MCP_TEMPLATE, MCP_INPUT, MCP_OUTPUT);
    expect(warnings).toEqual([]);
    expect(await files(out)).toEqual([".claude-plugin/plugin.json", ".mcp.json", "mcp/server.mjs"]);
    expect(await readFile(join(out, ".mcp.json"), "utf8")).toBe(json(MCP_JSON));
  });

  it("emits no .mcp.json with emitMetadata: false", async () => {
    const root = await project(MCP_FILES);
    const { out } = await build(root, { ...MCP_TEMPLATE, emitMetadata: false }, MCP_INPUT, MCP_OUTPUT);
    expect(await files(out)).toEqual(["mcp/server.mjs"]);
  });

  it("emits no .mcp.json without mcpTemplate", async () => {
    const root = await project({ ...MOD_FILES, "mcp.template.json": MCP_FILES["mcp.template.json"] ?? "" });
    const { out } = await build(root, TEMPLATE);
    expect(await files(out)).toEqual([".claude-plugin/plugin.json", "hooks/hooks.json", "hooks/register.js"]);
  });

  it("rejects an MCP server chunk without a shebang", async () => {
    const root = await project(MCP_FILES);
    await expect(build(root, MCP_TEMPLATE, MCP_INPUT, { entryFileNames: "[name].mjs" })).rejects.toThrow(
      /a script must start with a shebang/,
    );
  });

  it("builds the MCP output of a source that both templates use", async () => {
    const root = await project({
      ...MCP_FILES,
      "hooks.template.json": JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: "command", command: "./src/server.ts" }] }] },
      }),
    });
    const { out } = await build(root, { ...TEMPLATE, ...MCP_TEMPLATE }, MCP_INPUT, MCP_OUTPUT);
    expect(await files(out)).toEqual([
      ".claude-plugin/plugin.json",
      ".mcp.json",
      "hooks/hooks.json",
      "mcp/server.mjs",
    ]);
  });
});

describe("watch", () => {
  it("rebuilds .mcp.json when the MCP template changes", { timeout: 20_000 }, async () => {
    const root = await project(MCP_FILES);
    const out = join(root, "out");
    const watcher = watch({
      input: { "mcp/server": join(root, "src/server.ts") },
      platform: "node",
      plugins: [claudeCode({ root, ...MCP_TEMPLATE })],
      output: { dir: out, format: "es", ...MCP_OUTPUT },
    });
    // Resolves on the next END of a build cycle, rejects on ERROR; every bundle result is closed.
    const nextEnd = (): Promise<void> =>
      new Promise((resolveEnd, rejectEnd) => {
        const listener = (event: RolldownWatcherEvent): void => {
          if (event.code === "BUNDLE_END") void event.result.close();
          if (event.code === "ERROR") {
            void event.result.close();
            watcher.off("event", listener);
            rejectEnd(event.error);
          }
          if (event.code === "END") {
            watcher.off("event", listener);
            resolveEnd();
          }
        };
        watcher.on("event", listener);
      });
    try {
      await nextEnd();
      expect(JSON.parse(await readFile(join(out, ".mcp.json"), "utf8"))).toEqual(MCP_JSON);
      const docs = { type: "http", url: "https://example.com/mcp" };
      const rebuilt = nextEnd();
      await writeFile(
        join(root, "mcp.template.json"),
        JSON.stringify({ mcpServers: { demo: { command: "./src/server.ts" }, docs } }),
      );
      await rebuilt;
      expect(JSON.parse(await readFile(join(out, ".mcp.json"), "utf8"))).toEqual({
        mcpServers: { ...MCP_JSON.mcpServers, docs },
      });
    } finally {
      await watcher.close();
    }
  });
});
