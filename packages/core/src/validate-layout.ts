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

  const issues: Issue[] = [];
  // Anything that is not an existing file (missing or a directory) is path-missing.
  const requireFile = async (file: string, message: string): Promise<void> => {
    if ((await kindOf(join(outDir, file))) !== "file") {
      issues.push(err("path-missing", message, file));
    }
  };

  await requireFile(".claude-plugin/plugin.json", `${show(".claude-plugin/plugin.json")} is missing or not a file`);

  for (const item of manifestPaths(manifest)) {
    const { path, value } = item;
    // validateManifest already reports ".." paths; never stat outside outDir (backslash covers Windows).
    if (value.split(/[\\/]/).includes("..")) continue;
    const file = relativeFile(value);
    // join, not resolve: an absolute value stays under outDir; the stripped trailing "/" lets a file be found as a file.
    const actual = await kindOf(join(outDir, file));
    const expected = expectedKind(item);
    if (actual === undefined) {
      issues.push(err("path-missing", `${label(path)} ${show(value)} does not exist`, file, path));
    } else if (expected !== "either" && actual !== expected) {
      issues.push(
        err("path-invalid", `${label(path)} ${show(value)} must be a ${expected}, found a ${actual}`, file, path),
      );
    }
  }

  if (entries.some((entry) => entry.output.startsWith(`${OUTPUT_DIRS.hooks}/`))) {
    await requireFile("hooks/hooks.json", `${show("hooks/hooks.json")} is missing or not a file`);
  }
  if (entries.some((entry) => entry.output.startsWith(`${OUTPUT_DIRS.mcp}/`))) {
    await requireFile(".mcp.json", `${show(".mcp.json")} is missing or not a file`);
  }
  for (const entry of entries) {
    await requireFile(entry.output, `${show(entry.output)} built from ${show(entry.source)} is missing or not a file`);
  }
  return issues;
}
