import type { HookEntry, Issue, PackageJson, PluginConfig, PluginManifest } from "@kwitsch/claude-code-plugin-core";
import { pluginManifest, renderHooksTemplate, validateManifest } from "@kwitsch/claude-code-plugin-core";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export interface ProjectOptions extends PluginConfig {
  readonly root?: string;
}

export interface ResolvedEntry extends HookEntry {
  readonly sourcePath: string;
}

export interface LoadedProject {
  readonly manifest: PluginManifest | undefined;
  readonly hooksJson: object | undefined;
  readonly entries: readonly ResolvedEntry[];
  readonly assets: readonly string[];
  readonly issues: readonly Issue[];
}

const isErrno = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const withFile = (issues: readonly Issue[], file: string): Issue[] => issues.map((issue) => ({ ...issue, file }));

// undefined = unreadable or invalid template (an issue was pushed); JSON itself never parses to undefined.
async function parseTemplate(file: string, path: string, issues: Issue[]): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
    issues.push({ severity: "error", code: "path-missing", message: `hooks template "${file}" not found`, file });
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    issues.push({
      severity: "error",
      code: "template-invalid",
      message: `hooks template is not valid JSON: ${messageOf(error)}`,
      file,
    });
    return undefined;
  }
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

  let hooksJson: object | undefined;
  const entries: ResolvedEntry[] = [];
  const templateFile = options.hooksTemplate;
  if (templateFile !== undefined) {
    const templatePath = resolve(root, templateFile);
    const template = await parseTemplate(templateFile, templatePath, issues);
    if (template !== undefined) {
      const rendered = renderHooksTemplate(template);
      issues.push(...withFile(rendered.issues, templateFile));
      hooksJson = rendered.hooksJson;
      for (const entry of rendered.entries) {
        const sourcePath = resolve(dirname(templatePath), entry.source);
        try {
          await access(sourcePath);
        } catch {
          issues.push({
            severity: "error",
            code: "path-missing",
            message: `${entry.kind} "${entry.source}" not found`,
            file: templateFile,
          });
        }
        entries.push({ ...entry, sourcePath });
      }
    }
  }

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

  return { manifest, hooksJson, entries, assets, issues };
}
