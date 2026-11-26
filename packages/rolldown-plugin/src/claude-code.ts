import type { FileCopy, Issue } from "@kwitsch/claude-code-plugin-core";
import { checkMod, validateLayout } from "@kwitsch/claude-code-plugin-core";
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, extname, join, posix, resolve, sep } from "node:path";
import type { OutputChunk, Plugin, PluginContext } from "rolldown";
import type { LoadedProject, ProjectOptions, ResolvedEntry } from "./load-project.js";
import { loadProject } from "./load-project.js";

export interface ClaudeCodeOptions extends ProjectOptions {
  /** Emit plugin.json, hooks.json and .mcp.json, copy assets and validate the layout (default true). */
  readonly emitMetadata?: boolean;
  /** Treat warnings as errors (default false). */
  readonly strict?: boolean;
  /** Output path of the entry this build produces (the preset sets it); without it the entry is derived from the input. */
  readonly output?: string;
}

interface ChunkCheck {
  readonly problems: readonly string[];
  readonly entry: ResolvedEntry | undefined;
}

export function formatProblems(lines: readonly string[]): string {
  const count = `${lines.length} ${lines.length === 1 ? "problem" : "problems"}`;
  return `[claude-code] ${count}\n${lines.map((line) => `  ${line}`).join("\n")}`;
}

// Severity column padded to "warning".length, code column to the widest code in the batch.
export const issueLine = (issue: Issue, codeWidth: number): string =>
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

// Import specifier from one output file to another: "/"-separated, always starting with "./" or "../".
function relativeSpecifier(from: string, to: string): string {
  const rel = posix.relative(posix.dirname(from), to);
  return rel.startsWith("../") ? rel : `./${rel}`;
}

// A bare Node builtin gets a hint: the layout only allows the "node:" form, and tsdown's nodeProtocol option rewrites it.
function notAllowed(id: string, allowed: string): string {
  const hint = builtinModules.includes(id)
    ? `; "${id}" is a Node builtin, import "node:${id}" instead (tsdown option nodeProtocol: true rewrites bundled dependencies)`
    : "";
  return `import "${id}" is not allowed; ${allowed} may stay external${hint}`;
}

// A bundle is its entry chunk plus any chunks it loads, all inside its output folder.
function checkBundle(
  chunks: readonly OutputChunk[],
  main: OutputChunk,
  entry: ResolvedEntry,
  format: string,
): string[] {
  const problems: string[] = [];
  const line = (fileName: string, text: string): void => {
    problems.push(`error  ${fileName}: ${text}`);
  };
  const dir = posix.dirname(entry.output);
  const own = new Set(chunks.map((chunk) => chunk.fileName).filter((name) => name.startsWith(`${dir}/`)));
  if (main.fileName !== entry.output) line(main.fileName, `file name must be "${entry.output}"`);
  if (format !== "es") line(main.fileName, `output.format must be "es", got "${format}"`);
  for (const chunk of chunks) {
    if (!chunk.fileName.startsWith(`${dir}/`) || !chunk.fileName.endsWith(".mjs")) {
      line(chunk.fileName, `chunk must lie in "${dir}/" and end in ".mjs"`);
    }
    for (const id of [...chunk.imports, ...chunk.dynamicImports]) {
      if (!id.startsWith("node:") && !own.has(id)) {
        line(chunk.fileName, notAllowed(id, "only node:* and chunks of this bundle"));
      }
    }
    if (chunk.code.startsWith("#!")) line(chunk.fileName, "a bundle must not start with a shebang");
  }
  return problems;
}

function checkChunk(chunks: readonly OutputChunk[], entries: readonly ResolvedEntry[], format: string): ChunkCheck {
  const problems: string[] = [];
  const chunk = chunks.find((candidate) => candidate.isEntry) ?? chunks[0];
  if (chunk === undefined) {
    return { problems: [`error  bundle: bundle has 0 chunks; expected exactly one`], entry: undefined };
  }
  const line = (text: string): void => {
    problems.push(`error  ${chunk.fileName}: ${text}`);
  };

  const id = chunk.facadeModuleId && resolve(chunk.facadeModuleId);
  // One source may feed both templates; prefer the entry this chunk was built as.
  const bySource = entries.filter((candidate) => candidate.sourcePath === id);
  const entry = bySource.find((candidate) => candidate.output === chunk.fileName) ?? bySource[0];
  if (entry?.kind === "bundle") return { problems: checkBundle(chunks, chunk, entry, format), entry };

  if (chunks.length !== 1) line(`bundle has ${chunks.length} chunks; expected exactly one`);
  if (entry === undefined) {
    line(`input "${chunk.facadeModuleId}" is not an entry of the hooks template`);
    return { problems, entry };
  }
  if (chunk.fileName !== entry.output) line(`file name must be "${entry.output}"`);
  if (format !== "es") line(`output.format must be "es", got "${format}"`);
  // A script may import the rewritten entry of every bundle; a mod never may.
  const bundleImports = entry.kind === "script"
    ? entries.filter((candidate) => candidate.kind === "bundle").map((bundle) =>
      relativeSpecifier(entry.output, bundle.output)
    )
    : [];
  const allowed = bundleImports.length > 0 ? "only node:* and bundle entries" : "only node:*";
  for (const id of [...chunk.imports, ...chunk.dynamicImports]) {
    if (entry.kind === "mod") {
      // checkMod reports every non-relative specifier; a relative one here is a bundle entry or another file.
      if (id.startsWith("./") || id.startsWith("../")) {
        line(`import "${id}" is not allowed; a mod must not import a bundle or another file`);
      }
    } else if (!id.startsWith("node:") && !bundleImports.includes(id)) {
      line(notAllowed(id, allowed));
    }
  }
  if (entry.kind === "script" && !chunk.code.startsWith("#!")) line("a script must start with a shebang");
  return { problems, entry };
}

// The entry this build runs for: one source may feed several entries, so the input name decides.
function ownEntry(
  loaded: LoadedProject,
  input: readonly string[] | Readonly<Record<string, string>>,
): ResolvedEntry | undefined {
  for (const [name, path] of Object.entries(input)) {
    const sourcePath = resolve(loaded.root, path);
    const bySource = loaded.entries.filter((candidate) => candidate.sourcePath === sourcePath);
    const match = bySource.find((candidate) => candidate.output.slice(0, -extname(candidate.output).length) === name)
      ?? bySource[0];
    if (match !== undefined) return match;
  }
  return undefined;
}

// Per-file copy: no empty directories, explicit chmod so the umask never changes the mode.
// Without a mode the source mode is kept.
async function copyInto(outDir: string, pairs: readonly FileCopy[], mode?: number): Promise<void> {
  await Promise.all(pairs.map(async ({ source, output }) => {
    const target = join(outDir, output);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    await chmod(target, mode ?? (await stat(source)).mode);
  }));
}

export function claudeCode(options: ClaudeCodeOptions = {}): Plugin {
  const emitMetadata = options.emitMetadata ?? true;
  const strict = options.strict ?? false;
  let project: LoadedProject | undefined;
  let entry: ResolvedEntry | undefined;
  let own: ResolvedEntry | undefined;
  let bundles: readonly ResolvedEntry[] = [];

  return {
    name: "claude-code",

    async buildStart(inputOptions) {
      const loaded = await loadProject(options);
      project = loaded;
      entry = undefined;
      own = options.output === undefined
        ? ownEntry(loaded, inputOptions.input)
        : loaded.entries.find((candidate) => candidate.output === options.output);
      bundles = loaded.entries.filter((candidate) => candidate.kind === "bundle");
      this.addWatchFile(join(loaded.root, "package.json"));
      this.addWatchFile(loaded.assetsDir);
      if (options.hooksTemplate !== undefined) this.addWatchFile(resolve(loaded.root, options.hooksTemplate));
      if (options.mcpTemplate !== undefined) this.addWatchFile(resolve(loaded.root, options.mcpTemplate));
      for (const asset of loaded.assets) this.addWatchFile(join(loaded.assetsDir, asset));
      for (const file of loaded.files) this.addWatchFile(file.source);
      report(this, loaded.issues, strict);
    },

    // Mod and script builds keep a bundle entry external and import its built file instead.
    async resolveId(source, importer) {
      const from = own;
      if (importer === undefined || from === undefined || from.kind === "bundle" || bundles.length === 0) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved || resolved.external) return null;
      const id = resolve(resolved.id);
      const bundle = bundles.find((candidate) => candidate.sourcePath === id);
      if (bundle !== undefined) return { id: relativeSpecifier(from.output, bundle.output), external: true };
      // Only a folder of its own counts: not the project root, not a folder shared with another entry, not node_modules.
      const inside = id.includes(`${sep}node_modules${sep}`) ? undefined : bundles.find((candidate) => {
        const folder = dirname(candidate.sourcePath);
        return folder !== project?.root && id.startsWith(folder + sep)
          && !project?.entries.some((other) => other.kind !== "bundle" && other.sourcePath.startsWith(folder + sep));
      });
      if (inside !== undefined) {
        this.error(formatProblems([
          `error  ${importer}: import "${source}" points into bundle folder of "${inside.source}"; import "${inside.source}" instead`,
        ]));
      }
      return null;
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
        const problems = [...result.problems];
        // The mod's final code gets the same rules as claude-code-check-mod; a missing chunk is a checkChunk file-name problem.
        const mod = result.entry?.kind === "mod" ? bundle[result.entry.output] : undefined;
        if (mod?.type === "chunk") {
          problems.push(
            ...checkMod(mod.code, mod.fileName).issues.map((issue) => `error  ${issue.file}: ${issue.message}`),
          );
        }
        if (problems.length > 0) this.error(formatProblems(problems));
        entry = result.entry;
      }
      if (!emitMetadata) return;
      const files: [string, object | undefined][] = [
        [".claude-plugin/plugin.json", loaded.manifest],
        ["hooks/hooks.json", loaded.hooksJson],
        [".mcp.json", loaded.mcpJson],
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
      await Promise.all([
        copyInto(outDir, loaded.assets.map((asset) => ({ source: join(loaded.assetsDir, asset), output: asset }))),
        // A files copy is data: mode 0644 whatever the source mode, so the output does not depend on the package store.
        copyInto(outDir, loaded.files, 0o644),
      ]);
      if (loaded.manifest === undefined) return;
      const issues = await validateLayout({ outDir, manifest: loaded.manifest, entries: entry ? [entry] : [] });
      report(this, issues, strict);
    },
  };
}
