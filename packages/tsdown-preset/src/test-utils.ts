import type { LoadedProject } from "@kwitsch/rolldown-plugin-claude-code";
import { chmod, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Writes an outDir tree that passes validateLayout (strict): plugin.json, hooks.json and .mcp.json when the project
// has them, and every entry output, all 0644.
export async function writeValidTree(outDir: string, project: LoadedProject, omit?: string): Promise<void> {
  const json = (file: string, value: object | undefined): [string, string][] =>
    value === undefined ? [] : [[file, `${JSON.stringify(value)}\n`]];
  const files: [string, string][] = [
    [".claude-plugin/plugin.json", `${JSON.stringify(project.manifest)}\n`],
    ...json("hooks/hooks.json", project.hooksJson),
    ...json(".mcp.json", project.mcpJson),
    ...project.entries.map((entry): [string, string] => [
      entry.output,
      entry.kind === "script" ? "#!/usr/bin/env node\n" : "export {};\n",
    ]),
  ];
  for (const [file, content] of files) {
    if (file === omit) continue;
    const target = join(outDir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    await chmod(target, 0o644);
  }
}

export const tempDir = async (): Promise<string> => realpath(await mkdtemp(join(tmpdir(), "ccp-")));

export async function project(files: Record<string, string>): Promise<string> {
  const root = await tempDir();
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content);
  }
  return root;
}
