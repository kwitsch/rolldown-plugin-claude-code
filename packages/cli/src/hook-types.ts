import type { Issue } from "@kwitsch/claude-code-plugin-core";
import { renderHookInputTypes, renderHooksTemplate } from "@kwitsch/claude-code-plugin-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export interface HookTypesResult {
  readonly code: 0 | 1;
  readonly lines: readonly string[];
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// issueLine lives in rolldown-plugin, which the cli must not import.
const format = (issue: Issue): string => `${issue.severity} ${issue.code}: ${issue.message}`;

// undefined = the file does not exist; any other read error propagates.
async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

// Writes, or with check only compares, the hook input types file named by the template's hookTypes field.
export async function hookTypes(templatePath: string, check: boolean): Promise<HookTypesResult> {
  const path = resolve(templatePath);
  let template: unknown;
  try {
    template = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    return { code: 1, lines: [`error: cannot read hooks template "${templatePath}": ${messageOf(error)}`] };
  }

  const rendered = renderHooksTemplate(template);
  const target = rendered.hookTypes;
  if (target === undefined) {
    return {
      code: 1,
      lines: [`error: hooks template "${templatePath}" has no valid "hookTypes" field`, ...rendered.issues.map(format)],
    };
  }
  const types = renderHookInputTypes(template);
  const issues = [...rendered.issues, ...types.issues];
  const lines = issues.map(format);
  // Never write an incomplete or wrong file.
  if (issues.some((issue) => issue.severity === "error")) return { code: 1, lines };

  const targetPath = resolve(dirname(path), target);
  // The target must stay inside the template directory.
  const rel = relative(dirname(path), targetPath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    return { code: 1, lines: [...lines, `error: "hookTypes" must stay inside the template directory: "${target}"`] };
  }
  const current = await readIfExists(targetPath);
  if (current === types.source) return { code: 0, lines: [...lines, `"${target}" is up to date`] };
  if (check) {
    const state = current === undefined ? "not found" : "is stale";
    return { code: 1, lines: [...lines, `error hook-types-stale: "${target}" ${state}`] };
  }
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, types.source);
  return { code: 0, lines: [...lines, `wrote "${target}"`] };
}
