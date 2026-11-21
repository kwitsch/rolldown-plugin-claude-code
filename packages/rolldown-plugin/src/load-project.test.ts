import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject } from "./load-project.js";

async function project(files: Record<string, string>): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ccp-")));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content);
  }
  return root;
}

const pkg = (fields: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: "demo", version: "1.0.0", ...fields });

describe("loadProject", () => {
  it("reads only package.json when there is no template and no assets folder", async () => {
    const root = await project({ "package.json": pkg({ description: "Demo" }) });
    expect(await loadProject({ root })).toEqual({
      manifest: { name: "demo", version: "1.0.0", description: "Demo" },
      hooksJson: undefined,
      entries: [],
      root,
      assetsDir: join(root, "assets"),
      assets: [],
      issues: [],
    });
  });

  it("resolves entries against the template directory", async () => {
    const root = await project({
      "package.json": pkg(),
      "hooks/template.json": JSON.stringify({
        mod: "../src/register.ts",
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "../src/pre.ts" }] }] },
      }),
      "src/register.ts": "export function register(): void {}\n",
      "src/pre.ts": "#!/usr/bin/env node\n",
    });
    const result = await loadProject({ root, hooksTemplate: "hooks/template.json" });
    expect(result.issues).toEqual([]);
    expect(result.entries).toEqual([
      {
        kind: "mod",
        source: "../src/register.ts",
        output: "hooks/register.js",
        sourcePath: join(root, "src/register.ts"),
      },
      { kind: "script", source: "../src/pre.ts", output: "hooks/pre.mjs", sourcePath: join(root, "src/pre.ts") },
    ]);
    expect(result.hooksJson).toEqual({
      modules: ["./register.js"],
      hooks: {
        PreToolUse: [{
          hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/hooks/pre.mjs"] }],
        }],
      },
    });
  });

  it("throws when package.json is missing", async () => {
    const root = await project({});
    await expect(loadProject({ root })).rejects.toThrow(/cannot read .*package\.json/);
  });

  it("throws when package.json is not JSON", async () => {
    const root = await project({ "package.json": "{" });
    await expect(loadProject({ root })).rejects.toThrow(/cannot read .*package\.json/);
  });

  it("reports a missing template as path-missing", async () => {
    const root = await project({ "package.json": pkg() });
    const result = await loadProject({ root, hooksTemplate: "hooks.template.json" });
    expect(result.hooksJson).toBeUndefined();
    expect(result.entries).toEqual([]);
    expect(result.issues).toEqual([{
      severity: "error",
      code: "path-missing",
      message: "hooks template \"hooks.template.json\" not found",
      file: "hooks.template.json",
    }]);
  });

  it("reports a non-JSON template as template-invalid", async () => {
    const root = await project({ "package.json": pkg(), "hooks.template.json": "{" });
    const result = await loadProject({ root, hooksTemplate: "hooks.template.json" });
    expect(result.hooksJson).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      severity: "error",
      code: "template-invalid",
      file: "hooks.template.json",
    });
    expect(result.issues[0]?.message).toMatch(/^hooks template is not valid JSON: /);
  });

  it("reports a missing entry source as path-missing and still returns the entry", async () => {
    const root = await project({
      "package.json": pkg(),
      "hooks.template.json": JSON.stringify({ mod: "./register.ts" }),
    });
    const result = await loadProject({ root, hooksTemplate: "hooks.template.json" });
    expect(result.entries).toHaveLength(1);
    expect(result.issues).toEqual([{
      severity: "error",
      code: "path-missing",
      message: "mod \"register.ts\" not found",
      file: "hooks.template.json",
    }]);
  });

  it("sets Issue.file for manifest and template issues", async () => {
    const root = await project({
      "package.json": pkg({ name: "claude-code" }),
      "hooks.template.json": JSON.stringify({ mod: "register.js" }),
    });
    const result = await loadProject({ root, hooksTemplate: "hooks.template.json" });
    expect(result.manifest).toEqual({ name: "claude-code", version: "1.0.0" });
    expect(result.issues).toEqual([
      {
        severity: "error",
        code: "name-reserved",
        message: "name \"claude-code\" is reserved for official Anthropic plugins",
        path: ["name"],
        file: "package.json",
      },
      expect.objectContaining({ code: "template-invalid", path: ["mod"], file: "hooks.template.json" }),
    ]);
  });

  const MCP_TEMPLATE = JSON.stringify({ mcpServers: { demo: { command: "./src/server.ts" } } });
  const SERVER = "#!/usr/bin/env node\n";

  it("loads only an MCP template", async () => {
    const root = await project({ "package.json": pkg(), "mcp.template.json": MCP_TEMPLATE, "src/server.ts": SERVER });
    const result = await loadProject({ root, mcpTemplate: "mcp.template.json" });
    expect(result.issues).toEqual([]);
    expect(result.hooksJson).toBeUndefined();
    expect(result.mcpJson).toEqual({
      mcpServers: { demo: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs"] } },
    });
    expect(result.entries).toEqual([
      { kind: "script", source: "src/server.ts", output: "mcp/server.mjs", sourcePath: join(root, "src/server.ts") },
    ]);
  });

  it("orders hook entries before MCP entries", async () => {
    const root = await project({
      "package.json": pkg(),
      "hooks.template.json": JSON.stringify({ mod: "./src/register.ts", hooks: {} }),
      "mcp.template.json": MCP_TEMPLATE,
      "src/register.ts": "export function register(): void {}\n",
      "src/server.ts": SERVER,
    });
    const result = await loadProject({ root, hooksTemplate: "hooks.template.json", mcpTemplate: "mcp.template.json" });
    expect(result.issues).toEqual([]);
    expect(result.entries.map((entry) => entry.output)).toEqual(["hooks/register.js", "mcp/server.mjs"]);
  });

  it("reports a missing MCP template as path-missing", async () => {
    const root = await project({ "package.json": pkg() });
    const result = await loadProject({ root, mcpTemplate: "mcp.template.json" });
    expect(result.mcpJson).toBeUndefined();
    expect(result.entries).toEqual([]);
    expect(result.issues).toEqual([{
      severity: "error",
      code: "path-missing",
      message: "mcp template \"mcp.template.json\" not found",
      file: "mcp.template.json",
    }]);
  });

  it("reports a non-JSON MCP template as template-invalid", async () => {
    const root = await project({ "package.json": pkg(), "mcp.template.json": "{" });
    const result = await loadProject({ root, mcpTemplate: "mcp.template.json" });
    expect(result.mcpJson).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: "error", code: "template-invalid", file: "mcp.template.json" });
    expect(result.issues[0]?.message).toMatch(/^mcp template is not valid JSON: /);
  });

  it("reports a missing MCP server source as path-missing", async () => {
    const root = await project({ "package.json": pkg(), "mcp.template.json": MCP_TEMPLATE });
    const result = await loadProject({ root, mcpTemplate: "mcp.template.json" });
    expect(result.entries).toHaveLength(1);
    expect(result.issues).toEqual([{
      severity: "error",
      code: "path-missing",
      message: "script \"src/server.ts\" not found",
      file: "mcp.template.json",
    }]);
  });

  it("resolves MCP sources against the MCP template directory", async () => {
    const root = await project({
      "package.json": pkg(),
      "config/mcp.json": JSON.stringify({ mcpServers: { demo: { command: "../src/server.ts" } } }),
      "src/server.ts": SERVER,
    });
    const result = await loadProject({ root, mcpTemplate: "config/mcp.json" });
    expect(result.issues).toEqual([]);
    expect(result.entries).toEqual([
      { kind: "script", source: "../src/server.ts", output: "mcp/server.mjs", sourcePath: join(root, "src/server.ts") },
    ]);
  });
});

describe("loadProject assets", () => {
  it("lists nested files and dot-files sorted with / and skips empty directories", async () => {
    const root = await project({
      "package.json": pkg(),
      "assets/skills/hello/SKILL.md": "# Hello\n",
      "assets/.mcp.json": "{}\n",
      "assets/b.txt": "b\n",
    });
    await mkdir(join(root, "assets/empty"));
    const result = await loadProject({ root });
    expect(result.assets).toEqual([".mcp.json", "b.txt", "skills/hello/SKILL.md"]);
    expect(result.issues).toEqual([]);
  });

  it("reports an explicit missing assets folder as path-missing", async () => {
    const root = await project({ "package.json": pkg() });
    const result = await loadProject({ root, assets: "static" });
    expect(result.assets).toEqual([]);
    expect(result.issues).toEqual([{
      severity: "error",
      code: "path-missing",
      message: "assets folder \"static\" not found",
      file: "static",
    }]);
  });

  it("reports assets that collide with generated files as entry-conflict", async () => {
    const root = await project({
      "package.json": pkg(),
      "hooks.template.json": JSON.stringify({ mod: "./register.ts", hooks: {} }),
      "register.ts": "export function register(): void {}\n",
      "assets/.claude-plugin/plugin.json": "{}\n",
      "assets/hooks/hooks.json": "{}\n",
      "assets/hooks/register.js": "\n",
    });
    const result = await loadProject({ root, hooksTemplate: "hooks.template.json" });
    const conflict = (rel: string): object => ({
      severity: "error",
      code: "entry-conflict",
      message: `asset "${rel}" collides with a generated file`,
      file: `assets/${rel}`,
    });
    expect(result.issues).toEqual([
      conflict(".claude-plugin/plugin.json"),
      conflict("hooks/hooks.json"),
      conflict("hooks/register.js"),
    ]);
  });

  it("allows a hand-written hooks/hooks.json asset without a template", async () => {
    const root = await project({ "package.json": pkg(), "assets/hooks/hooks.json": "{}\n" });
    const result = await loadProject({ root });
    expect(result.assets).toEqual(["hooks/hooks.json"]);
    expect(result.issues).toEqual([]);
  });

  it("reports assets/.mcp.json as entry-conflict with an MCP template", async () => {
    const root = await project({
      "package.json": pkg(),
      "mcp.template.json": JSON.stringify({ mcpServers: { demo: { type: "http", url: "https://example.com/mcp" } } }),
      "assets/.mcp.json": "{}\n",
    });
    const result = await loadProject({ root, mcpTemplate: "mcp.template.json" });
    expect(result.issues).toEqual([{
      severity: "error",
      code: "entry-conflict",
      message: "asset \".mcp.json\" collides with a generated file",
      file: "assets/.mcp.json",
    }]);
  });

  it("allows a hand-written .mcp.json asset without an MCP template", async () => {
    const root = await project({ "package.json": pkg(), "assets/.mcp.json": "{}\n" });
    const result = await loadProject({ root });
    expect(result.assets).toEqual([".mcp.json"]);
    expect(result.issues).toEqual([]);
  });

  it("skips symlinks with a path-invalid warning", async () => {
    const root = await project({ "package.json": pkg(), "assets/real.txt": "real\n" });
    await symlink("real.txt", join(root, "assets/link.txt"));
    const result = await loadProject({ root });
    expect(result.assets).toEqual(["real.txt"]);
    expect(result.issues).toEqual([{
      severity: "warning",
      code: "path-invalid",
      message: "symlink \"link.txt\" is not copied",
      file: "assets/link.txt",
    }]);
  });
});
