import { posix } from "node:path";
import type { BuildEntry } from "./build-entry.js";
import type { Issue } from "./issue.js";
import { invalid, isAbsolute, nameOf, notAnObject, rewriteCommand } from "./template-command.js";
import type { IssuePath } from "./validate-manifest.js";
import { isRecord } from "./validate-manifest.js";

export interface HooksTemplateResult {
  readonly hooksJson: object | undefined;
  readonly entries: readonly BuildEntry[];
  /** Normalized relative path of the hook input types file, relative to the template's directory. */
  readonly hookTypes: string | undefined;
  readonly issues: readonly Issue[];
}

const MOD_EXTENSION = /\.(ts|mts|tsx)$/;
// .ts, .mts, .d.ts and .d.mts
const HOOK_TYPES_EXTENSION = /\.m?ts$/;

function renderHook(hook: unknown, path: IssuePath, entries: BuildEntry[], issues: Issue[]): unknown {
  if (!isRecord(hook) || hook["type"] !== "command") return hook;
  return rewriteCommand(hook, path, "hooks", entries, issues);
}

// Copies only along hooks.<Event>[].hooks[]; every other value is shared with the template, which is never written.
function renderHooks(hooks: unknown, entries: BuildEntry[], issues: Issue[]): unknown {
  if (!isRecord(hooks)) return hooks;
  return Object.fromEntries(
    Object.entries(hooks).map(([event, groups]) => [
      event,
      Array.isArray(groups)
        ? groups.map((group: unknown, groupIndex) => {
          if (!isRecord(group)) return group;
          const inner = group["hooks"];
          if (!Array.isArray(inner)) return group;
          return {
            ...group,
            hooks: inner.map((hook: unknown, hookIndex) =>
              renderHook(hook, ["hooks", event, groupIndex, "hooks", hookIndex], entries, issues)
            ),
          };
        })
        : groups,
    ]),
  );
}

export function renderHooksTemplate(template: unknown): HooksTemplateResult {
  if (!isRecord(template)) {
    return { hooksJson: undefined, entries: [], hookTypes: undefined, ...notAnObject(template) };
  }
  const entries: BuildEntry[] = [];
  const issues: Issue[] = [];

  // mod, modules and hookTypes first, so the mod entry leads and their issues precede the walk's.
  let modules: readonly string[] | undefined;
  let hookTypes: string | undefined;
  for (const [key, value] of Object.entries(template)) {
    if (key === "mod") {
      if (typeof value === "string" && !isAbsolute(value) && MOD_EXTENSION.test(value)) {
        const name = nameOf(value);
        modules = [`./${name}.js`];
        entries.push({ kind: "mod", source: posix.normalize(value), output: `hooks/${name}.js` });
      } else {
        issues.push(invalid(["mod"], value, "must be a relative path to a .ts, .mts or .tsx file"));
      }
    } else if (key === "modules") {
      issues.push(invalid(["modules"], value, `is generated from "mod"; remove it`));
    } else if (key === "hookTypes") {
      if (typeof value === "string" && !isAbsolute(value) && HOOK_TYPES_EXTENSION.test(value)) {
        hookTypes = posix.normalize(value);
      } else {
        issues.push(invalid(["hookTypes"], value, "must be a relative path to a .ts, .mts or .d.ts file"));
      }
    }
  }

  const hooksJson = Object.fromEntries(
    Object.entries(template).flatMap(([key, value]): [string, unknown][] => {
      if (key === "mod") return modules === undefined ? [] : [["modules", modules]];
      if (key === "modules" || key === "hookTypes") return [];
      if (key === "hooks") return [[key, renderHooks(value, entries, issues)]];
      return [[key, value]];
    }),
  );
  return { hooksJson, entries, hookTypes, issues };
}
