import { stat } from "node:fs/promises";
import { join, posix } from "node:path";
import type { BuildEntry } from "./build-entry.js";
import type { Issue } from "./issue.js";
import type { ManifestPath } from "./manifest-paths.js";
import { manifestPaths } from "./manifest-paths.js";
import type { PluginManifest } from "./plugin-manifest.js";
import { OUTPUT_DIRS } from "./template-command.js";
import { label, show } from "./validate-manifest.js";

export interface LayoutInput {
  readonly outDir: string;
  readonly manifest: PluginManifest;
  readonly entries?: readonly BuildEntry[];
}

type Kind = "file" | "directory";

// undefined = missing (ENOENT or ENOTDIR); other fs errors propagate. stat follows symlinks.
async function kindOf(target: string): Promise<Kind | undefined> {
  try {
    return (await stat(target)).isDirectory() ? "directory" : "file";
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return undefined;
    }
    throw error;
  }
}

function expectedKind({ field, path }: ManifestPath): Kind | "either" {
  if (field === "skills") return "directory";
  if (field === "commands") return path.length === 3 ? "file" : "either";
  if (field === "outputStyles") return "either";
  return "file";
}

// "./agents/reviewer.md" -> "agents/reviewer.md", "./extra-skills/" -> "extra-skills", "." stays "."
const relativeFile = (value: string): string => posix.normalize(value.replaceAll("\\", "/")).replace(/(.)\/$/, "$1");

const err = (code: Issue["code"], message: string, file: string, path?: Issue["path"]): Issue => ({
  severity: "error",
  code,
  message,
  ...(path && { path }),
  file,
});

export async function validateLayout(input: LayoutInput): Promise<readonly Issue[]> {
  const { outDir, manifest, entries = [] } = input;
  const root = await kindOf(outDir);
  if (root === undefined) {
    return [err("path-missing", `outDir ${show(outDir)} does not exist`, outDir)];
  }
  if (root === "file") {
    return [err("path-invalid", `outDir ${show(outDir)} must be a directory, found a file`, outDir)];
  }

  // Anything that is not an existing file (missing or a directory) is path-missing.
  const requireFile = async (
    file: string,
    message = `${show(file)} is missing or not a file`,
  ): Promise<Issue | undefined> =>
    (await kindOf(join(outDir, file))) === "file" ? undefined : err("path-missing", message, file);

  const checkPath = async (item: ManifestPath): Promise<Issue | undefined> => {
    const { path, value } = item;
    // validateManifest already reports ".." paths; never stat outside outDir (backslash covers Windows).
    if (value.split(/[\\/]/).includes("..")) return undefined;
    const file = relativeFile(value);
    // join, not resolve: an absolute value stays under outDir; the stripped trailing "/" lets a file be found as a file.
    const actual = await kindOf(join(outDir, file));
    const expected = expectedKind(item);
    if (actual === undefined) return err("path-missing", `${label(path)} ${show(value)} does not exist`, file, path);
    if (expected !== "either" && actual !== expected) {
      return err("path-invalid", `${label(path)} ${show(value)} must be a ${expected}, found a ${actual}`, file, path);
    }
    return undefined;
  };

  // Bundles are shared code, not hooks or MCP servers: they never require hooks.json or .mcp.json.
  const built = entries.filter((entry) => entry.kind !== "bundle");
  const builds = (dir: string): boolean => built.some((entry) => entry.output.startsWith(`${dir}/`));
  // The stats are independent: run them together, report in this order.
  const checks = [
    requireFile(".claude-plugin/plugin.json"),
    ...manifestPaths(manifest).map(checkPath),
    ...(builds(OUTPUT_DIRS.hooks) ? [requireFile("hooks/hooks.json")] : []),
    ...(builds(OUTPUT_DIRS.mcp) ? [requireFile(".mcp.json")] : []),
    ...entries.map((entry) =>
      requireFile(entry.output, `${show(entry.output)} built from ${show(entry.source)} is missing or not a file`)
    ),
  ];
  return (await Promise.all(checks)).filter((issue) => issue !== undefined);
}
