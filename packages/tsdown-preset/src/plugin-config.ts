import type { PluginConfig } from "@kwitsch/claude-code-plugin-core";
import { claudeCode, formatProblems, loadProject } from "@kwitsch/rolldown-plugin-claude-code";
import { readFile, rm } from "node:fs/promises";
import { extname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import type { TsdownHooks, UserConfig } from "tsdown";
import { finalCheck } from "./final-check.js";

export interface PresetOptions extends PluginConfig {
  /** Project root containing package.json (default process.cwd()). */
  readonly root?: string;
  /** Plugin output root, relative to root (default "plugin"). Removed before the build. */
  readonly outDir?: string;
  /** Treat warnings as errors (default true). */
  readonly strict?: boolean;
  /** Run `claude plugin validate --strict` after the build (default "auto": only when claude is on PATH). */
  readonly validate?: boolean | "auto";
  /** Extra tsdown options applied to every config before the generated fields. */
  readonly overrides?: Partial<UserConfig>;
}

const SHEBANG = "#!/usr/bin/env node";

export async function pluginConfig(options: PresetOptions = {}): Promise<UserConfig[]> {
  const { outDir = "plugin", strict = true, validate = "auto", overrides = {}, ...projectOptions } = options;
  // Load issues are reported by each claudeCode instance in buildStart, not here.
  const project = await loadProject(projectOptions);
  if (project.entries.length === 0) {
    throw new Error(
      formatProblems([
        "error  the project defines no mod, command scripts, MCP servers, bin scripts, skill scripts or bundles; nothing to build",
      ]),
    );
  }

  const out = resolve(project.root, outDir);
  // Data-loss guard: rm below must never remove the project root, an ancestor, or a directory holding a source.
  const protectedPaths = [
    project.root,
    ...project.entries.map((entry) => entry.sourcePath),
    ...project.files.map((file) => file.source),
  ];
  const contains = (path: string): boolean => {
    const rel = relative(out, path);
    return !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
  };
  if (protectedPaths.some(contains)) {
    throw new Error(formatProblems([`error  outDir "${outDir}" must not contain the project root or its sources`]));
  }
  await rm(out, { recursive: true, force: true });

  // An unreadable source counts as "no shebang"; the plugin reports it as path-missing.
  const banners = await Promise.all(project.entries.map(async (entry) => {
    if (entry.kind !== "script") return undefined;
    const source = await readFile(entry.sourcePath, "utf8").catch(() => "");
    return source.startsWith("#!") ? undefined : SHEBANG;
  }));

  // tsdown builds configs in parallel; the last build:done runs the final check exactly once.
  let done = 0;
  const hooks: Partial<TsdownHooks> = {
    "build:done": async ({ options: resolved }) => {
      done += 1;
      if (done === project.entries.length) {
        await finalCheck(project, { outDir: out, strict, validate }, resolved.logger);
      }
    },
  };

  return project.entries.map((entry, i): UserConfig => {
    const mod = entry.kind === "mod";
    return {
      ...overrides,
      entry: { [entry.output.slice(0, -extname(entry.output).length)]: entry.sourcePath },
      outExtensions: () => ({ js: mod ? ".js" : ".mjs" }),
      minify: mod ? { compress: true, mangle: false } : true,
      banner: banners[i],
      deps: { neverBundle: mod ? ["claude-code"] : [], alwaysBundle: [/./] },
      plugins: [claudeCode({ ...projectOptions, root: project.root, emitMetadata: i === 0, strict })],
      format: "esm",
      platform: "node",
      target: "node26",
      outDir: out,
      cwd: project.root,
      clean: false,
      dts: false,
      sourcemap: false,
      hooks,
      // Bundle chunks stay in the bundle folder; comments may carry machine-specific module paths.
      ...(entry.kind === "bundle"
        ? { outputOptions: { chunkFileNames: `${posix.dirname(entry.output)}/[name]-[hash].mjs`, comments: false } }
        : {}),
    };
  });
}
