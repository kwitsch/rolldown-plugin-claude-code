import type { Issue } from "@kwitsch/claude-code-plugin-core";
import { validateLayout } from "@kwitsch/claude-code-plugin-core";
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { OutputChunk, Plugin, PluginContext } from "rolldown";
import type { LoadedProject, ProjectOptions, ResolvedEntry } from "./load-project.js";
import { loadProject } from "./load-project.js";

export interface ClaudeCodeOptions extends ProjectOptions {
  /** Emit plugin.json and hooks.json, copy assets and validate the layout (default true). */
  readonly emitMetadata?: boolean;
  /** Treat warnings as errors (default false). */
  readonly strict?: boolean;
}

interface ChunkCheck {
  readonly problems: readonly string[];
  readonly entry: ResolvedEntry | undefined;
}

function formatProblems(lines: readonly string[]): string {
  const count = `${lines.length} ${lines.length === 1 ? "problem" : "problems"}`;
  return `[claude-code] ${count}\n${lines.map((line) => `  ${line}`).join("\n")}`;
}

// Severity column padded to "warning".length, code column to the widest code in the batch.
const issueLine = (issue: Issue, codeWidth: number): string =>
  `${issue.severity.padEnd(7)}  ${issue.code.padEnd(codeWidth)}  ${
    issue.file ? `${issue.file}: ` : ""
  }${issue.message}`;

function report(ctx: PluginContext, issues: readonly Issue[], strict: boolean): void {
  if (!strict) {
    for (const issue of issues) {
      if (issue.severity === "warning") ctx.warn(issueLine(issue, issue.code.length));
    }
  }
  const fatal = strict ? issues : issues.filter((issue) => issue.severity === "error");
  if (fatal.length > 0) {
    const width = Math.max(...fatal.map((issue) => issue.code.length));
    ctx.error(formatProblems(fatal.map((issue) => issueLine(issue, width))));
  }
}

function checkChunk(chunks: readonly OutputChunk[], entries: readonly ResolvedEntry[], format: string): ChunkCheck {
  const problems: string[] = [];
  const [chunk] = chunks;
  if (chunk === undefined) {
    return { problems: [`error  bundle: bundle has 0 chunks; expected exactly one`], entry: undefined };
  }
  const line = (text: string): void => {
    problems.push(`error  ${chunk.fileName}: ${text}`);
  };
  if (chunks.length !== 1) line(`bundle has ${chunks.length} chunks; expected exactly one`);

  const entry = entries.find((candidate) =>
    candidate.sourcePath === (chunk.facadeModuleId && resolve(chunk.facadeModuleId))
  );
  if (entry === undefined) {
    line(`input "${chunk.facadeModuleId}" is not an entry of the hooks template`);
    return { problems, entry };
  }
  if (chunk.fileName !== entry.output) line(`file name must be "${entry.output}"`);
  if (format !== "es") line(`output.format must be "es", got "${format}"`);
  const allowed = entry.kind === "mod" ? "only node:* and claude-code" : "only node:*";
  for (const id of [...chunk.imports, ...chunk.dynamicImports]) {
    if (!id.startsWith("node:") && !(entry.kind === "mod" && id === "claude-code")) {
      line(`import "${id}" is not allowed; ${allowed} may stay external`);
    }
  }
  const shebang = chunk.code.startsWith("#!");
  if (entry.kind === "mod" && shebang) line("a mod must not start with a shebang");
  if (entry.kind === "script" && !shebang) line("a script must start with a shebang");
  return { problems, entry };
}

// Per-file copy: no empty directories, explicit chmod so the umask never changes the mode.
async function copyAssets(assetsDir: string, assets: readonly string[], outDir: string): Promise<void> {
  await Promise.all(assets.map(async (asset) => {
    const source = join(assetsDir, asset);
    const target = join(outDir, asset);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    await chmod(target, (await stat(source)).mode);
  }));
}

export function claudeCode(options: ClaudeCodeOptions = {}): Plugin {
  const emitMetadata = options.emitMetadata ?? true;
  const strict = options.strict ?? false;
  let project: LoadedProject | undefined;
  let entry: ResolvedEntry | undefined;

  return {
    name: "claude-code",

    async buildStart() {
      const loaded = await loadProject(options);
      project = loaded;
      entry = undefined;
      this.addWatchFile(join(loaded.root, "package.json"));
      this.addWatchFile(loaded.assetsDir);
      if (options.hooksTemplate !== undefined) this.addWatchFile(resolve(loaded.root, options.hooksTemplate));
      for (const asset of loaded.assets) this.addWatchFile(join(loaded.assetsDir, asset));
      report(this, loaded.issues, strict);
    },

    generateBundle(outputOptions, bundle) {
      const loaded = project;
      if (loaded === undefined) return;
      if (!outputOptions.dir) {
        this.error(formatProblems(["error  output.dir is required (output.file is not supported)"]));
      }
      // Without entries there is no chunk to map; only metadata is emitted.
      if (loaded.entries.length > 0) {
        const chunks = Object.values(bundle).filter((output): output is OutputChunk => output.type === "chunk");
        const result = checkChunk(chunks, loaded.entries, outputOptions.format);
        if (result.problems.length > 0) this.error(formatProblems(result.problems));
        entry = result.entry;
      }
      if (!emitMetadata) return;
      const files: [string, object | undefined][] = [
        [".claude-plugin/plugin.json", loaded.manifest],
        ["hooks/hooks.json", loaded.hooksJson],
      ];
      for (const [fileName, value] of files) {
        if (value !== undefined) {
          this.emitFile({ type: "asset", fileName, source: `${JSON.stringify(value, null, 2)}\n` });
        }
      }
    },

    // With emitMetadata: false a parallel build may not have written plugin.json yet, so nothing runs.
    async writeBundle(outputOptions) {
      const loaded = project;
      if (!emitMetadata || loaded === undefined || !outputOptions.dir) return;
      const outDir = resolve(outputOptions.dir);
      await copyAssets(loaded.assetsDir, loaded.assets, outDir);
      if (loaded.manifest === undefined) return;
      const issues = await validateLayout({ outDir, manifest: loaded.manifest, entries: entry ? [entry] : [] });
      report(this, issues, strict);
    },
  };
}
