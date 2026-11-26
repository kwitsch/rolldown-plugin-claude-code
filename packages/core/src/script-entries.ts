import { posix } from "node:path";
import type { BuildEntry } from "./build-entry.js";
import type { Issue } from "./issue.js";
import { invalid, isAbsolute, nameOf, OUTPUT_DIRS } from "./template-command.js";
import type { IssuePath } from "./validate-manifest.js";
import { isRecord, show } from "./validate-manifest.js";

export interface ScriptEntriesResult {
  readonly entries: readonly BuildEntry[];
  readonly issues: readonly Issue[];
}

// A non-separator character before the extension rejects an empty basename such as "src/.ts".
const SCRIPT_SOURCE = /[^/\\]\.m?ts$/;

// A relative path to a .ts or .mts file.
export const isScriptSource = (value: string): boolean => !isAbsolute(value) && SCRIPT_SOURCE.test(value);

// scripts.bin -> bin/<name>.mjs, scripts.skills -> skills/<skill>/<name>.mjs; pure: no fs, no mutation, no throw.
export function scriptEntries(config: { readonly scripts?: unknown }): ScriptEntriesResult {
  const entries: BuildEntry[] = [];
  const issues: Issue[] = [];
  // output -> source; outputs differ per directory, so only same-directory pairs can collide.
  const built = new Map<string, string>();

  const add = (path: IssuePath, value: unknown, dir: string): void => {
    if (typeof value !== "string" || !isScriptSource(value)) {
      issues.push(invalid(path, value, "must be a relative path to a .ts or .mts file", "path-invalid"));
      return;
    }
    const source = posix.normalize(value);
    const output = `${dir}/${nameOf(source)}.mjs`;
    const prior = built.get(output);
    if (prior === source) return;
    if (prior !== undefined) {
      issues.push(invalid(path, value, `${output} is already built from ${show(prior)}`, "entry-conflict"));
      return;
    }
    built.set(output, source);
    entries.push({ kind: "script", source, output });
  };

  const { scripts } = config;
  if (scripts === undefined) return { entries, issues };
  if (!isRecord(scripts)) {
    issues.push(invalid(["scripts"], scripts, "must be an object", "field-type"));
    return { entries, issues };
  }
  const { bin, skills } = scripts;
  if (Array.isArray(bin)) {
    bin.forEach((item: unknown, i: number) => add(["scripts", "bin", i], item, OUTPUT_DIRS.bin));
  } else if (bin !== undefined) {
    issues.push(invalid(["scripts", "bin"], bin, "must be an array", "field-type"));
  }
  if (skills !== undefined && !isRecord(skills)) {
    issues.push(invalid(["scripts", "skills"], skills, "must be an object", "field-type"));
    return { entries, issues };
  }
  for (const [skill, list] of Object.entries(skills ?? {})) {
    const path = ["scripts", "skills", skill];
    if (/^\.{0,2}$|[/\\]/.test(skill)) {
      const reason = "skill name must not be empty, \".\" or \"..\" or contain / or \\";
      issues.push(invalid(path, skill, reason, "path-invalid"));
    } else if (!Array.isArray(list)) {
      issues.push(invalid(path, list, "must be an array", "field-type"));
    } else {
      list.forEach((item: unknown, i: number) => add([...path, i], item, `${OUTPUT_DIRS.skills}/${skill}`));
    }
  }
  return { entries, issues };
}
