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

// bin -> bin/<name>.mjs, skillScripts -> skills/<skill>/<name>.mjs; pure: no fs, no mutation, no throw.
export function scriptEntries(config: {
  readonly bin?: unknown;
  readonly skillScripts?: unknown;
}): ScriptEntriesResult {
  const entries: BuildEntry[] = [];
  const issues: Issue[] = [];
  // output -> source; outputs differ per directory, so only same-directory pairs can collide.
  const built = new Map<string, string>();

  const add = (path: IssuePath, value: unknown, dir: string): void => {
    if (typeof value !== "string" || value === "" || isAbsolute(value) || !SCRIPT_SOURCE.test(value)) {
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

  const { bin, skillScripts } = config;
  if (bin !== undefined) {
    if (Array.isArray(bin)) {
      bin.forEach((item: unknown, i: number) => add(["bin", i], item, OUTPUT_DIRS.bin));
    } else {
      issues.push(invalid(["bin"], bin, "must be an array", "field-type"));
    }
  }
  if (skillScripts !== undefined) {
    if (!isRecord(skillScripts)) {
      issues.push(invalid(["skillScripts"], skillScripts, "must be an object", "field-type"));
    } else {
      for (const [skill, list] of Object.entries(skillScripts)) {
        if (skill === "" || skill === "." || skill === ".." || /[/\\]/.test(skill)) {
          issues.push(
            invalid(
              ["skillScripts", skill],
              skill,
              "skill name must not be empty, \".\" or \"..\" or contain / or \\",
              "path-invalid",
            ),
          );
          continue;
        }
        if (!Array.isArray(list)) {
          issues.push(invalid(["skillScripts", skill], list, "must be an array", "field-type"));
          continue;
        }
        list.forEach((item: unknown, i: number) =>
          add(["skillScripts", skill, i], item, `${OUTPUT_DIRS.skills}/${skill}`)
        );
      }
    }
  }
  return { entries, issues };
}
