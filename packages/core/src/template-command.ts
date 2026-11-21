import { posix } from "node:path";
import type { BuildEntry } from "./build-entry.js";
import type { Issue } from "./issue.js";
import type { IssuePath } from "./validate-manifest.js";
import { isStringArray, label, show } from "./validate-manifest.js";

// First whitespace-delimited token ends in .ts or .mts.
const TYPESCRIPT_COMMAND = /^\S+\.m?ts(\s|$)/;

export const isAbsolute = (path: string): boolean => /^([/\\~$]|[A-Za-z]:)/.test(path);

// "../src/pre-tool.hook.ts" -> "pre-tool.hook"
export const nameOf = (source: string): string => posix.basename(source, posix.extname(source));

export const invalid = (path: IssuePath, value: unknown, reason: string): Issue => ({
  severity: "error",
  code: "template-invalid",
  message: `${label(path)} ${show(value)}: ${reason}`,
  path,
});

export const notAnObject = (template: unknown): { readonly issues: readonly Issue[] } => ({
  issues: [{
    severity: "error",
    code: "template-invalid",
    message: `template ${show(template)}: must be an object`,
  }],
});

// Output directories of built scripts, shared with the layout check.
export const OUTPUT_DIRS = { hooks: "hooks", mcp: "mcp" } as const;
export type OutputDir = keyof typeof OUTPUT_DIRS;

// Shared by the hooks and MCP templates: a relative TypeScript command becomes node + the built <outputDir>/<name>.mjs.
export function rewriteCommand(
  record: Readonly<Record<string, unknown>>,
  path: IssuePath,
  outputDir: OutputDir,
  entries: BuildEntry[],
  issues: Issue[],
): Readonly<Record<string, unknown>> {
  const command = record["command"];
  if (typeof command !== "string" || !TYPESCRIPT_COMMAND.test(command)) return record;

  const commandPath = [...path, "command"];
  const hasArgs = Object.hasOwn(record, "args");
  const found: Issue[] = [];
  if (/\s/.test(command)) {
    found.push(invalid(commandPath, command, `move arguments to "args"`));
  } else if (isAbsolute(command)) {
    found.push(invalid(commandPath, command, "must be a path relative to the template file"));
  }
  if (hasArgs && !isStringArray(record["args"])) {
    found.push(invalid([...path, "args"], record["args"], "must be an array of strings"));
  }
  if (found.length > 0) {
    issues.push(...found);
    return record;
  }

  const source = posix.normalize(command);
  const name = nameOf(source);
  const output = `${outputDir}/${name}.mjs`;
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
    return record;
  }
  if (prior === undefined) entries.push({ kind: "script", source, output });

  const scriptArg = `\${CLAUDE_PLUGIN_ROOT}/${outputDir}/${name}.mjs`;
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]): [string, unknown][] => {
      if (key === "command") return hasArgs ? [["command", "node"]] : [["command", "node"], ["args", [scriptArg]]];
      if (key === "args" && isStringArray(value)) return [["args", [scriptArg, ...value]]];
      return [[key, value]];
    }),
  );
}
