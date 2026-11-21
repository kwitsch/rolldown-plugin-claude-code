import type { BuildEntry, Issue, PackageJson, PluginConfig, PluginManifest } from "@kwitsch/claude-code-plugin-core";
import {
  pluginManifest,
  renderHooksTemplate,
  renderMcpTemplate,
  validateManifest,
} from "@kwitsch/claude-code-plugin-core";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

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
  readonly issues: readonly Issue[];
}

const isErrno = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const withFile = (issues: readonly Issue[], file: string): Issue[] => issues.map((issue) => ({ ...issue, file }));

// undefined = unreadable or invalid template (an issue was pushed); JSON itself never parses to undefined.
async function parseTemplate(
  file: string,
  path: string,
  label: "hooks template" | "mcp template",
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

// Parses and renders one template, resolves its entries against the template's directory and appends to issues/entries.
async function loadTemplate<T extends { readonly entries: readonly BuildEntry[]; readonly issues: readonly Issue[] }>(
  root: string,
  file: string,
  label: "hooks template" | "mcp template",
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
  const missing = await Promise.all(
    resolved.map((entry) => access(entry.sourcePath).then(() => false, () => true)),
  );
  resolved.forEach((entry, i) => {
    if (missing[i]) {
      issues.push({
        severity: "error",
        code: "path-missing",
        message: `${entry.kind} "${entry.source}" not found`,
        file,
      });
    }
  });
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
  const hooksJson = options.hooksTemplate === undefined
    ? undefined
    : (await loadTemplate(root, options.hooksTemplate, "hooks template", renderHooksTemplate, issues, entries))
      ?.hooksJson;
  const mcpJson = options.mcpTemplate === undefined
    ? undefined
    : (await loadTemplate(root, options.mcpTemplate, "mcp template", renderMcpTemplate, issues, entries))?.mcpJson;

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

  const generated = new Set([
    ".claude-plugin/plugin.json",
    ...(hooksJson === undefined ? [] : ["hooks/hooks.json"]),
    ...(mcpJson === undefined ? [] : [".mcp.json"]),
    ...entries.map((entry) => entry.output),
  ]);
  for (const rel of assets) {
    if (generated.has(rel)) {
      issues.push({
        severity: "error",
        code: "entry-conflict",
        message: `asset "${rel}" collides with a generated file`,
        file: `${assetsLabel}/${rel}`,
      });
    }
  }

  return { manifest, hooksJson, mcpJson, entries, root, assetsDir, assets, issues };
}
