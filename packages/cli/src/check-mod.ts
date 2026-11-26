import { checkMod } from "@kwitsch/claude-code-plugin-core";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { HookTypesResult } from "./hook-types.js";
import { format, messageOf } from "./hook-types.js";

interface Target {
  readonly file: string;
  readonly display: string;
}

// A .json path is a hooks file whose "modules" are checked; every other path is checked as a mod file.
// A string is the single error line that stops the check.
async function targets(path: string): Promise<readonly Target[] | string> {
  const abs = resolve(path);
  if (extname(abs) !== ".json") return [{ file: abs, display: path }];
  let hooks: unknown;
  try {
    hooks = JSON.parse(await readFile(abs, "utf8")) as unknown;
  } catch (error) {
    return `error: cannot read hooks file "${path}": ${messageOf(error)}`;
  }
  const modules: unknown = typeof hooks === "object" && hooks !== null && !Array.isArray(hooks) && "modules" in hooks
    ? hooks.modules
    : undefined;
  if (!Array.isArray(modules) || modules.length === 0) return `error: "${path}" has no "modules" entry`;
  const items: readonly unknown[] = modules;
  const dir = dirname(abs);
  const list: Target[] = [];
  for (const entry of items) {
    if (typeof entry !== "string") return `error: "modules" in "${path}" must list file paths`;
    const file = resolve(dir, entry);
    // The module must stay inside the hooks folder; "..x.js" is a plain file name, not a parent reference.
    const rel = relative(dir, file);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      return `error: module "${entry}" must stay inside the hooks folder`;
    }
    list.push({ file, display: join(dirname(path), entry) });
  }
  return list;
}

// Checks a mod file, or every "modules" entry of a hooks.json, against the Claude Code mod rules.
export async function checkModPath(path: string): Promise<HookTypesResult> {
  const found = await targets(path);
  if (typeof found === "string") return { code: 1, lines: [found] };
  const errors: string[] = [];
  const passed: string[] = [];
  for (const { file, display } of found) {
    let code: string;
    try {
      code = await readFile(file, "utf8");
    } catch (error) {
      errors.push(`error: cannot read mod "${display}": ${messageOf(error)}`);
      continue;
    }
    const { issues } = checkMod(code, display);
    if (issues.length > 0) errors.push(...issues.map(format));
    else passed.push(`"${display}" meets the Claude Code mod rules`);
  }
  return errors.length > 0 ? { code: 1, lines: errors } : { code: 0, lines: passed };
}
