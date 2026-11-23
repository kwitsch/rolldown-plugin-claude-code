import type {
  BuildEntry,
  FileCopy,
  Issue,
  PackageJson,
  PluginConfig,
  PluginManifest,
} from "@kwitsch/claude-code-plugin-core";
import {
  bundleEntries,
  pluginManifest,
  renderHooksTemplate,
  renderMcpTemplate,
  scriptEntries,
  validateManifest,
} from "@kwitsch/claude-code-plugin-core";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";

export interface ProjectOptions extends PluginConfig {
  readonly root?: string;
}

export interface ResolvedEntry extends BuildEntry {
  readonly sourcePath: string;
}

export interface LoadedProject {
  readonly manifest: PluginManifest | undefined;
  readonly hooksJson: object | undefined;
  readonly mcpJson: object | undefined;
  readonly entries: readonly ResolvedEntry[];
  readonly root: string;
  readonly assetsDir: string;
  readonly assets: readonly string[];
  /** Single files to copy; source is absolute. */
  readonly files: readonly FileCopy[];
  readonly issues: readonly Issue[];
}

const isErrno = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const withFile = (issues: readonly Issue[], file: string): Issue[] => issues.map((issue) => ({ ...issue, file }));

type TemplateLabel = "hooks template" | "mcp template";

// undefined = unreadable or invalid template (an issue was pushed); JSON itself never parses to undefined.
async function parseTemplate(
  file: string,
  path: string,
  label: TemplateLabel,
  issues: Issue[],
): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
    issues.push({ severity: "error", code: "path-missing", message: `${label} "${file}" not found`, file });
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    issues.push({
      severity: "error",
      code: "template-invalid",
      message: `${label} is not valid JSON: ${messageOf(error)}`,
      file,
    });
    return undefined;
  }
}

// Pushes path-missing for every entry whose source file is not accessible; file is set for template entries only.
async function reportMissing(entries: readonly ResolvedEntry[], issues: Issue[], file?: string): Promise<void> {
  const missing = await Promise.all(
    entries.map((entry) => access(entry.sourcePath).then(() => false, () => true)),
  );
  entries.forEach((entry, i) => {
    if (missing[i]) {
      issues.push({
        severity: "error",
        code: "path-missing",
        message: `${entry.kind} "${entry.source}" not found`,
        ...(file === undefined ? {} : { file }),
      });
    }
  });
}

// Parses and renders one template, resolves its entries against the template's directory and appends to issues/entries.
async function loadTemplate<T extends { readonly entries: readonly BuildEntry[]; readonly issues: readonly Issue[] }>(
  root: string,
  file: string,
  label: TemplateLabel,
  render: (template: unknown) => T,
  issues: Issue[],
  entries: ResolvedEntry[],
): Promise<T | undefined> {
  const templatePath = resolve(root, file);
  const template = await parseTemplate(file, templatePath, label, issues);
  if (template === undefined) return undefined;
  const rendered = render(template);
  issues.push(...withFile(rendered.issues, file));
  const resolved = rendered.entries.map((entry) => ({
    ...entry,
    sourcePath: resolve(dirname(templatePath), entry.source),
  }));
  await reportMissing(resolved, issues, file);
  entries.push(...resolved);
  return rendered;
}

export async function loadProject(options: ProjectOptions = {}): Promise<LoadedProject> {
  const root = resolve(options.root ?? process.cwd());

  const packagePath = join(root, "package.json");
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(await readFile(packagePath, "utf8")) as PackageJson;
  } catch (error) {
    throw new Error(`cannot read ${packagePath}: ${messageOf(error)}`, { cause: error });
  }
  const mapped = pluginManifest(pkg, options.manifest);
  const manifest = mapped.manifest;
  const issues: Issue[] = withFile(
    [...mapped.issues, ...(manifest === undefined ? [] : validateManifest(manifest))],
    "package.json",
  );

  // Sequential, hooks first: the mod leads and MCP entries follow the hook entries.
  const entries: ResolvedEntry[] = [];
  let hooksJson: object | undefined;
  if (options.hooksTemplate !== undefined) {
    hooksJson =
      (await loadTemplate(root, options.hooksTemplate, "hooks template", renderHooksTemplate, issues, entries))
        ?.hooksJson;
  }
  let mcpJson: object | undefined;
  if (options.mcpTemplate !== undefined) {
    mcpJson = (await loadTemplate(root, options.mcpTemplate, "mcp template", renderMcpTemplate, issues, entries))
      ?.mcpJson;
  }
  // scripts.bin and scripts.skills follow the template entries; their paths are relative to the project root.
  const scripts = scriptEntries(options);
  issues.push(...scripts.issues);
  const modPath = entries.find((entry) => entry.kind === "mod")?.sourcePath;
  const scriptResolved = scripts.entries
    .map((entry) => ({ ...entry, sourcePath: resolve(root, entry.source) }))
    .filter((entry) => {
      if (entry.sourcePath !== modPath) return true;
      issues.push({
        severity: "error",
        code: "entry-conflict",
        message: `${entry.kind} "${entry.source}" is already the mod`,
      });
      return false;
    });
  await reportMissing(scriptResolved, issues);
  entries.push(...scriptResolved);

  // Bundles follow every other entry; their paths are relative to the project root.
  const bundles = bundleEntries(options);
  issues.push(...bundles.issues);
  const bundleResolved = bundles.entries
    .map((entry) => ({ ...entry, sourcePath: resolve(root, entry.source) }))
    .filter((entry) => {
      const other = entries.find((candidate) => candidate.sourcePath === entry.sourcePath);
      if (other === undefined) return true;
      issues.push({
        severity: "error",
        code: "entry-conflict",
        message: `bundle "${entry.source}" is already the ${other.kind} "${other.source}"`,
      });
      return false;
    });
  await reportMissing(bundleResolved, issues);
  const bundleDirs = bundleResolved.map((entry) => posix.dirname(entry.output));
  const inBundle = (rel: string): string | undefined => bundleDirs.find((dir) => rel.startsWith(`${dir}/`));
  for (const entry of entries) {
    const dir = inBundle(entry.output);
    if (dir !== undefined) {
      issues.push({
        severity: "error",
        code: "entry-conflict",
        message: `${entry.kind} output "${entry.output}" lies in bundle folder "${dir}"`,
      });
    }
  }
  entries.push(...bundleResolved);

  const assetsLabel = options.assets ?? "assets";
  const assetsDir = resolve(root, assetsLabel);
  const dirents = await readdir(assetsDir, { recursive: true, withFileTypes: true }).catch((error: unknown) => {
    if (!isErrno(error, "ENOENT")) throw error;
    if (options.assets !== undefined) {
      issues.push({
        severity: "error",
        code: "path-missing",
        message: `assets folder "${options.assets}" not found`,
        file: options.assets,
      });
    }
    return [];
  });
  const assets: string[] = [];
  for (const dirent of dirents) {
    const rel = relative(assetsDir, join(dirent.parentPath, dirent.name)).split(sep).join("/");
    if (dirent.isSymbolicLink()) {
      issues.push({
        severity: "warning",
        code: "path-invalid",
        message: `symlink "${rel}" is not copied`,
        file: `${assetsLabel}/${rel}`,
      });
    } else if (dirent.isFile()) {
      assets.push(rel);
    }
  }
  assets.sort();

  // Each skill with scripts needs its SKILL.md, and the SKILL.md must name every <name>.mjs.
  // Core forbids "/" and "\" in skill names, so skills/<skill>/<file> splits safely.
  const skillFiles = new Map<string, string[]>();
  for (const entry of scripts.entries) {
    const [dir, skill, file] = entry.output.split("/");
    if (dir === "skills" && skill !== undefined && file !== undefined) {
      skillFiles.set(skill, [...(skillFiles.get(skill) ?? []), file]);
    }
  }
  for (const [skill, files] of skillFiles) {
    const rel = `skills/${skill}/SKILL.md`;
    const file = `${assetsLabel}/${rel}`;
    if (!assets.includes(rel)) {
      issues.push({ severity: "error", code: "path-missing", message: `SKILL.md of skill "${skill}" not found`, file });
      continue;
    }
    const text = await readFile(join(assetsDir, rel), "utf8");
    for (const name of files) {
      if (!text.includes(name)) {
        issues.push({ severity: "warning", code: "entry-unused", message: `"${name}" is not named in SKILL.md`, file });
      }
    }
  }

  const generated = new Set([
    ".claude-plugin/plugin.json",
    ...(hooksJson === undefined ? [] : ["hooks/hooks.json"]),
    ...(mcpJson === undefined ? [] : [".mcp.json"]),
    ...entries.map((entry) => entry.output),
  ]);
  // Sequential so issues keep the order of the files option.
  const files: FileCopy[] = [];
  for (const copy of bundles.files) {
    const source = resolve(root, copy.source);
    const isFile = await stat(source).then(
      (info) => info.isFile(),
      (error: unknown) => {
        if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) return false;
        throw error;
      },
    );
    if (!isFile) {
      issues.push({
        severity: "error",
        code: "path-missing",
        message: `file "${copy.source}" for "${copy.output}" not found or not a file`,
      });
    } else if (generated.has(copy.output)) {
      issues.push({
        severity: "error",
        code: "entry-conflict",
        message: `file "${copy.output}" collides with a generated file`,
      });
    } else {
      files.push({ source, output: copy.output });
      generated.add(copy.output);
    }
  }

  for (const rel of assets) {
    const dir = inBundle(rel);
    if (generated.has(rel) || dir !== undefined) {
      issues.push({
        severity: "error",
        code: "entry-conflict",
        message: dir === undefined
          ? `asset "${rel}" collides with a generated file`
          : `asset "${rel}" lies in bundle folder "${dir}"`,
        file: `${assetsLabel}/${rel}`,
      });
    }
  }

  return { manifest, hooksJson, mcpJson, entries, root, assetsDir, assets, files, issues };
}
