import { posix } from "node:path";
import type { Issue } from "./issue.js";
import type { IssuePath } from "./validate-manifest.js";
import { isRecord, isStringArray, label, show } from "./validate-manifest.js";

export interface HookEntry {
  readonly kind: "mod" | "script";
  readonly source: string;
  readonly output: string;
}

export interface HooksTemplateResult {
  readonly hooksJson: object | undefined;
  readonly entries: readonly HookEntry[];
  readonly issues: readonly Issue[];
}

const MOD_EXTENSION = /\.(ts|mts|tsx)$/;
// First whitespace-delimited token ends in .ts or .mts.
const TYPESCRIPT_COMMAND = /^\S+\.m?ts(\s|$)/;

const isAbsolute = (path: string): boolean => /^([/\\~$]|[A-Za-z]:)/.test(path);

// "../src/pre-tool.hook.ts" -> "pre-tool.hook"
const nameOf = (source: string): string => posix.basename(source, posix.extname(source));

const invalid = (path: IssuePath, value: unknown, reason: string): Issue => ({
  severity: "error",
  code: "template-invalid",
  message: `${label(path)} ${show(value)}: ${reason}`,
  path,
});

function renderHook(hook: unknown, path: IssuePath, entries: HookEntry[], issues: Issue[]): unknown {
  if (!isRecord(hook) || hook["type"] !== "command") return hook;
  const command = hook["command"];
  if (typeof command !== "string" || !TYPESCRIPT_COMMAND.test(command)) return hook;

  const commandPath = [...path, "command"];
  const hasArgs = Object.hasOwn(hook, "args");
  const found: Issue[] = [];
  if (/\s/.test(command)) {
    found.push(invalid(commandPath, command, `move arguments to "args"`));
  } else if (isAbsolute(command)) {
    found.push(invalid(commandPath, command, "must be a path relative to the template file"));
  }
  if (hasArgs && !isStringArray(hook["args"])) {
    found.push(invalid([...path, "args"], hook["args"], "must be an array of strings"));
  }
  if (found.length > 0) {
    issues.push(...found);
    return hook;
  }

  const source = posix.normalize(command);
  const name = nameOf(source);
  const output = `hooks/${name}.mjs`;
  const prior = entries.find((entry) => entry.kind === "script" && entry.output === output);
  const conflict = entries.find((entry) => entry.kind === "mod")?.source === source
    ? `${show(source)} is already the mod`
    : prior !== undefined && prior.source !== source
    ? `${output} is already built from ${show(prior.source)}`
    : undefined;
  if (conflict !== undefined) {
    issues.push({
      severity: "error",
      code: "entry-conflict",
      message: `${label(commandPath)} ${show(command)}: ${conflict}`,
      path: commandPath,
    });
    return hook;
  }
  if (prior === undefined) entries.push({ kind: "script", source, output });

  const scriptArg = `\${CLAUDE_PLUGIN_ROOT}/hooks/${name}.mjs`;
  return Object.fromEntries(
    Object.entries(hook).flatMap(([key, value]): [string, unknown][] => {
      if (key === "command") return hasArgs ? [["command", "node"]] : [["command", "node"], ["args", [scriptArg]]];
      if (key === "args" && isStringArray(value)) return [["args", [scriptArg, ...value]]];
      return [[key, value]];
    }),
  );
}

// Copies only along hooks.<Event>[].hooks[]; every other value is shared with the template, which is never written.
function renderHooks(hooks: unknown, entries: HookEntry[], issues: Issue[]): unknown {
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
    return {
      hooksJson: undefined,
      entries: [],
      issues: [{
        severity: "error",
        code: "template-invalid",
        message: `template ${show(template)}: must be an object`,
      }],
    };
  }
  const entries: HookEntry[] = [];
  const issues: Issue[] = [];

  // mod and modules first, so the mod entry leads and its issues precede the walk's.
  let modules: readonly string[] | undefined;
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
    }
  }

  const hooksJson = Object.fromEntries(
    Object.entries(template).flatMap(([key, value]): [string, unknown][] => {
      if (key === "mod") return modules === undefined ? [] : [["modules", modules]];
      if (key === "modules") return [];
      if (key === "hooks") return [[key, renderHooks(value, entries, issues)]];
      return [[key, value]];
    }),
  );
  return { hooksJson, entries, issues };
}
