import { claudeCode, loadProject } from "@kwitsch/rolldown-plugin-claude-code";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import type { OutExtensionContext, TsdownHooks, UserConfig } from "tsdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pluginConfig } from "./plugin-config.js";
import { project, tempDir, writeValidTree } from "./test-utils.js";

vi.mock("@kwitsch/rolldown-plugin-claude-code", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kwitsch/rolldown-plugin-claude-code")>()),
  claudeCode: vi.fn(() => ({ name: "claude-code" })),
}));

const PKG = JSON.stringify({ name: "demo", version: "1.0.0" });
const command = (path: string): object => [{ hooks: [{ type: "command", command: path }] }];
const MOD_ONLY: Record<string, string> = {
  "package.json": PKG,
  "hooks.template.json": JSON.stringify({ mod: "./src/register.ts", hooks: {} }),
  "src/register.ts": "export function register(): void {}\n",
};
const THREE: Record<string, string> = {
  "package.json": PKG,
  "hooks.template.json": JSON.stringify({
    mod: "./src/register.ts",
    hooks: { SessionStart: command("./src/start.ts"), Stop: command("./src/stop.ts") },
  }),
  "src/register.ts": "export function register(): void {}\n",
  "src/start.ts": "#!/usr/bin/env node\nconsole.log(1);\n",
  "src/stop.ts": "console.log(2);\n",
};
const TEMPLATE = { hooksTemplate: "hooks.template.json" } as const;
const MCP_SOURCES: Record<string, string> = {
  "mcp.template.json": JSON.stringify({ mcpServers: { demo: { command: "./src/server.ts" } } }),
  "src/server.ts": "console.log(1);\n",
};
const MCP_ONLY: Record<string, string> = { "package.json": PKG, ...MCP_SOURCES };
const MCP = { mcpTemplate: "mcp.template.json" } as const;
const SCRIPT_SOURCES: Record<string, string> = {
  "src/bin/doctor.ts": "console.log(1);\n",
  "src/skills/hello/greet.ts": "console.log(2);\n",
  "assets/skills/hello/SKILL.md": "Run `node ${CLAUDE_SKILL_DIR}/greet.mjs`.\n",
};
const SCRIPTS = { bin: ["src/bin/doctor.ts"], skillScripts: { hello: ["src/skills/hello/greet.ts"] } };

const entryKey = (config: UserConfig): string | undefined => Object.keys(config.entry as Record<string, string>)[0];
function byKey(configs: readonly UserConfig[], key: string): UserConfig {
  const config = configs.find((candidate) => entryKey(candidate) === key);
  if (config === undefined) throw new Error(`no config for ${key}`);
  return config;
}
const doneHook = (config: UserConfig | undefined): TsdownHooks["build:done"] | undefined =>
  (config?.hooks as Partial<TsdownHooks> | undefined)?.["build:done"];

beforeEach(() => {
  vi.mocked(claudeCode).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("config generation", () => {
  it("returns one config for one entry", async () => {
    const root = await project(MOD_ONLY);
    const configs = await pluginConfig({ root, ...TEMPLATE });
    expect(configs).toHaveLength(1);
    expect(configs[0]?.entry).toEqual({ "hooks/register": join(root, "src/register.ts") });
  });

  it("returns three configs and emits metadata only for the first", async () => {
    const root = await project(THREE);
    const configs = await pluginConfig({ root, ...TEMPLATE });
    expect(configs.map(entryKey)).toEqual(["hooks/register", "hooks/start", "hooks/stop"]);
    const calls = vi.mocked(claudeCode).mock.calls.map(([options]) => options);
    expect(calls.map((options) => options?.emitMetadata)).toEqual([true, false, false]);
    for (const options of calls) expect(options).toMatchObject({ root, strict: true, ...TEMPLATE });
  });

  it("rejects a project without entries", async () => {
    const root = await project({ "package.json": PKG, "hooks.template.json": JSON.stringify({ hooks: {} }) });
    await expect(pluginConfig({ root, ...TEMPLATE })).rejects.toThrow(
      /\[claude-code\] 1 problem\n {2}error {2}the project defines no mod, command scripts, MCP servers, bin scripts or skill scripts; nothing to build/,
    );
  });

  it("removes outDir before returning", async () => {
    const root = await project({ ...MOD_ONLY, "plugin/stale.txt": "x" });
    await pluginConfig({ root, ...TEMPLATE });
    await expect(access(join(root, "plugin"))).rejects.toThrow(/ENOENT/);
  });

  it("refuses an outDir that contains the project root", async () => {
    const root = await project(MOD_ONLY);
    await expect(pluginConfig({ root, ...TEMPLATE, outDir: "." })).rejects.toThrow(
      /outDir "\." must not contain the project root/,
    );
    await expect(access(join(root, "package.json"))).resolves.toBeUndefined();
  });

  it("refuses an outDir that holds the sources", async () => {
    const root = await project(MOD_ONLY);
    await expect(pluginConfig({ root, ...TEMPLATE, outDir: "src" })).rejects.toThrow(/must not contain/);
    await expect(access(join(root, "src/register.ts"))).resolves.toBeUndefined();
  });
});

describe("minify matrix", () => {
  it("sets the mod and script values", async () => {
    const root = await project(THREE);
    const configs = await pluginConfig({ root, ...TEMPLATE });
    const shared = {
      format: "esm",
      platform: "node",
      target: "node26",
      outDir: join(root, "plugin"),
      cwd: root,
      clean: false,
      dts: false,
      sourcemap: false,
    };
    const ctx = {} as OutExtensionContext;
    const mod = byKey(configs, "hooks/register");
    expect(mod).toMatchObject({
      ...shared,
      minify: { compress: true, mangle: false },
      deps: { neverBundle: ["claude-code"], alwaysBundle: [/./] },
    });
    expect(mod.outExtensions?.(ctx)).toEqual({ js: ".js" });
    const script = byKey(configs, "hooks/stop");
    expect(script).toMatchObject({ ...shared, minify: true, deps: { neverBundle: [], alwaysBundle: [/./] } });
    expect(script.outExtensions?.(ctx)).toEqual({ js: ".mjs" });
  });
});

describe("shebang", () => {
  it("adds the banner only to scripts without one", async () => {
    const root = await project(THREE);
    const configs = await pluginConfig({ root, ...TEMPLATE });
    expect(byKey(configs, "hooks/stop").banner).toBe("#!/usr/bin/env node");
    expect(byKey(configs, "hooks/start").banner).toBeUndefined();
    expect(byKey(configs, "hooks/register").banner).toBeUndefined();
  });
});

describe("overrides", () => {
  it("keeps alias but not minify or format", async () => {
    const root = await project(MOD_ONLY);
    const [config] = await pluginConfig({
      root,
      ...TEMPLATE,
      overrides: { alias: { a: "b" }, minify: false, format: "cjs" },
    });
    expect(config).toMatchObject({ alias: { a: "b" }, minify: { compress: true, mangle: false }, format: "esm" });
  });
});

describe("final check", () => {
  it("runs exactly once after the last build", async () => {
    vi.stubEnv("PATH", await tempDir());
    const root = await project(THREE);
    const configs = await pluginConfig({ root, ...TEMPLATE });
    // pluginConfig removed outDir; write a layout-valid tree as the builds would.
    const loaded = await loadProject({ root, ...TEMPLATE });
    const outDir = join(root, "plugin");
    await writeValidTree(outDir, loaded);
    const logger = { info: vi.fn(), warn: vi.fn() };
    const ctx = { options: { logger } } as unknown as Parameters<TsdownHooks["build:done"]>[0];
    const scriptModes = async (): Promise<number[]> =>
      Promise.all(
        loaded.entries.filter((entry) => entry.kind === "script").map(async (entry) =>
          (await stat(join(outDir, entry.output))).mode & 0o777
        ),
      );

    for (const [i, config] of configs.entries()) {
      await expect(doneHook(config)?.(ctx)).resolves.toBeUndefined();
      if (i < configs.length - 1) {
        expect(logger.info).not.toHaveBeenCalled();
        expect(await scriptModes()).toEqual([0o644, 0o644]);
      }
    }
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("[claude-code] claude not found on PATH; skipping claude plugin validate");
    expect(await scriptModes()).toEqual([0o755, 0o755]);

    await expect(doneHook(configs[0])?.(ctx)).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});

describe("mcp", () => {
  it("returns one script config for an MCP-only project", async () => {
    const root = await project(MCP_ONLY);
    const configs = await pluginConfig({ root, ...MCP });
    expect(configs).toHaveLength(1);
    const [config] = configs;
    expect(config).toMatchObject({
      entry: { "mcp/server": join(root, "src/server.ts") },
      minify: true,
      banner: "#!/usr/bin/env node",
      deps: { neverBundle: [], alwaysBundle: [/./] },
      format: "esm",
      platform: "node",
      target: "node26",
    });
    expect(config?.outExtensions?.({} as OutExtensionContext)).toEqual({ js: ".mjs" });
    const calls = vi.mocked(claudeCode).mock.calls.map(([options]) => options);
    expect(calls.map((options) => options?.emitMetadata)).toEqual([true]);
    for (const options of calls) expect(options).toMatchObject({ root, strict: true, ...MCP });
  });

  it("appends MCP configs after the hooks configs", async () => {
    const root = await project({ ...MOD_ONLY, ...MCP_SOURCES });
    const configs = await pluginConfig({ root, ...TEMPLATE, ...MCP });
    expect(configs.map(entryKey)).toEqual(["hooks/register", "mcp/server"]);
    const calls = vi.mocked(claudeCode).mock.calls.map(([options]) => options);
    expect(calls.map((options) => options?.emitMetadata)).toEqual([true, false]);
  });

  it("makes the MCP server executable in the final check", async () => {
    vi.stubEnv("PATH", await tempDir());
    const root = await project(MCP_ONLY);
    const configs = await pluginConfig({ root, ...MCP });
    const loaded = await loadProject({ root, ...MCP });
    const outDir = join(root, "plugin");
    await writeValidTree(outDir, loaded);
    await expect(access(join(outDir, ".mcp.json"))).resolves.toBeUndefined();
    await expect(access(join(outDir, "hooks/hooks.json"))).rejects.toThrow(/ENOENT/);
    const logger = { info: vi.fn(), warn: vi.fn() };
    const ctx = { options: { logger } } as unknown as Parameters<TsdownHooks["build:done"]>[0];
    await expect(doneHook(configs[0])?.(ctx)).resolves.toBeUndefined();
    expect((await stat(join(outDir, "mcp/server.mjs"))).mode & 0o777).toBe(0o755);
  });
});

describe("bin and skill scripts", () => {
  it("returns one config for a project with only bin", async () => {
    const root = await project({ "package.json": PKG, "src/bin/doctor.ts": "console.log(1);\n" });
    const configs = await pluginConfig({ root, bin: SCRIPTS.bin });
    expect(configs.map(entryKey)).toEqual(["bin/doctor"]);
    expect(configs[0]?.entry).toEqual({ "bin/doctor": join(root, "src/bin/doctor.ts") });
  });

  it("gives bin and skill entries the script config", async () => {
    const root = await project({ "package.json": PKG, ...SCRIPT_SOURCES });
    const configs = await pluginConfig({ root, ...SCRIPTS });
    expect(configs.map(entryKey)).toEqual(["bin/doctor", "skills/hello/greet"]);
    for (const config of configs) {
      expect(config).toMatchObject({
        minify: true,
        banner: "#!/usr/bin/env node",
        deps: { neverBundle: [], alwaysBundle: [/./] },
        format: "esm",
        platform: "node",
        target: "node26",
        outDir: join(root, "plugin"),
      });
      expect(config.outExtensions?.({} as OutExtensionContext)).toEqual({ js: ".mjs" });
    }
  });

  it("forwards strict to claudeCode (true by default)", async () => {
    const root = await project({ "package.json": PKG, ...SCRIPT_SOURCES });
    await pluginConfig({ root, ...SCRIPTS });
    let calls = vi.mocked(claudeCode).mock.calls.map(([options]) => options);
    expect(calls).toHaveLength(2);
    for (const options of calls) expect(options).toMatchObject({ root, strict: true, ...SCRIPTS });
    vi.mocked(claudeCode).mockClear();
    await pluginConfig({ root, ...SCRIPTS, strict: false });
    calls = vi.mocked(claudeCode).mock.calls.map(([options]) => options);
    for (const options of calls) expect(options).toMatchObject({ strict: false });
  });
});
