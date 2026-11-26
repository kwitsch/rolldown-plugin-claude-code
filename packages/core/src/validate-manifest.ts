import type { Issue, IssueSeverity } from "./issue.js";
import type { ManifestPath } from "./manifest-paths.js";
import { manifestPaths } from "./manifest-paths.js";

// Declaration order of PluginManifest (the type test pins the keys); not exported from index.ts.
export const KNOWN_FIELDS = [
  "$schema",
  "name",
  "displayName",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "metadata",
  "icon",
  "documentationUrl",
  "supportUrl",
  "privacyPolicyUrl",
  "termsOfServiceUrl",
  "defaultEnabled",
  "engines",
  "dependencies",
  "network",
  "userConfig",
  "types",
  "channels",
  "skills",
  "commands",
  "agents",
  "hooks",
  "mcpServers",
  "lspServers",
  "outputStyles",
  "experimental",
] as const;

type KnownField = (typeof KNOWN_FIELDS)[number];
const KNOWN: ReadonlySet<string> = new Set(KNOWN_FIELDS);
// Shared by the core modules, not exported from index.ts.
export type IssuePath = readonly (string | number)[];

const issue = (severity: IssueSeverity, code: Issue["code"], message: string, path: IssuePath): Issue => ({
  severity,
  code,
  message,
  path,
});

interface FieldType {
  readonly expected: string;
  readonly test: (value: unknown) => boolean;
}

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const show = (value: unknown): string => {
  try {
    return String(JSON.stringify(value));
  } catch {
    // JSON.stringify throws on BigInt and circular values; keep validateManifest total.
    return typeof value === "bigint" ? `${value}n` : Object.prototype.toString.call(value);
  }
};

// ["agents", 1] -> "agents[1]", ["commands", "deploy", "source"] -> "commands.deploy.source"
export const label = (path: IssuePath): string =>
  path
    .map((segment, index) =>
      index === 0 ? String(segment) : typeof segment === "number" ? `[${segment}]` : `.${segment}`
    )
    .join("");

const STRING: FieldType = { expected: "a string", test: (value) => typeof value === "string" };
const OBJECT: FieldType = { expected: "an object", test: isRecord };
const PATHS: FieldType = {
  expected: "a string or an array of strings",
  test: (value) => typeof value === "string" || isStringArray(value),
};
const PATHS_OR_INLINE: FieldType = {
  expected: "a string, an object or an array of strings and objects",
  test: (value) =>
    typeof value === "string"
    || isRecord(value)
    || (Array.isArray(value) && value.every((entry) => typeof entry === "string" || isRecord(entry))),
};

// Record<KnownField, ...> makes a missing or extra key a compile error.
const FIELD_TYPES: Record<KnownField, FieldType> = {
  $schema: STRING,
  // Rule 4.1 owns name: a non-string name is name-missing, never field-type.
  name: { expected: "a string", test: () => true },
  displayName: STRING,
  version: STRING,
  description: STRING,
  author: OBJECT,
  homepage: STRING,
  repository: STRING,
  license: STRING,
  keywords: { expected: "an array of strings", test: isStringArray },
  metadata: OBJECT,
  icon: STRING,
  documentationUrl: STRING,
  supportUrl: STRING,
  privacyPolicyUrl: STRING,
  termsOfServiceUrl: STRING,
  defaultEnabled: { expected: "a boolean", test: (value) => typeof value === "boolean" },
  engines: {
    expected: `an object with a string "claude-code"`,
    test: (value) =>
      isRecord(value) && (value["claude-code"] === undefined || typeof value["claude-code"] === "string"),
  },
  dependencies: {
    expected: `an array of strings or objects with a string "name"`,
    test: (value) =>
      Array.isArray(value)
      && value.every((dep) => typeof dep === "string" || (isRecord(dep) && typeof dep["name"] === "string")),
  },
  network: {
    expected: `an object with "hosts" as an array of strings`,
    test: (value) => isRecord(value) && (value["hosts"] === undefined || isStringArray(value["hosts"])),
  },
  userConfig: OBJECT,
  types: STRING,
  channels: { expected: "an array of objects", test: (value) => Array.isArray(value) && value.every(isRecord) },
  skills: PATHS,
  commands: {
    expected: "a string, an array of strings or an object",
    test: (value) => typeof value === "string" || isStringArray(value) || isRecord(value),
  },
  agents: PATHS,
  hooks: PATHS_OR_INLINE,
  mcpServers: PATHS_OR_INLINE,
  lspServers: PATHS_OR_INLINE,
  outputStyles: PATHS,
  experimental: OBJECT,
};

const RESERVED_WORDS: ReadonlySet<string> = new Set(["claude", "anthropic", "anthropics"]);
const RESERVED_NEXT_TO_OFFICIAL: ReadonlySet<string> = new Set(["claude", "anthropic"]);
const RESERVED_EXACT: ReadonlySet<string> = new Set([...RESERVED_WORDS, "claude-code", "claude-mods"]);

function reservedSeverity(name: string): IssueSeverity | undefined {
  // Case-insensitive; any run of separators counts as one separator.
  const words = name.toLowerCase().split(/[-_.]+/);
  const joined = words.join("-");
  if (
    /^(claude|anthropics?|cc-plugin)-/.test(joined)
    || RESERVED_EXACT.has(joined)
    || words.some((word, index) =>
      word === "official"
      && (RESERVED_NEXT_TO_OFFICIAL.has(words[index - 1] ?? "")
        || RESERVED_NEXT_TO_OFFICIAL.has(words[index + 1] ?? ""))
    )
  ) {
    return "error";
  }
  return words.some((word) => RESERVED_WORDS.has(word)) ? "warning" : undefined;
}

function nameIssues(value: unknown): Issue[] {
  if (typeof value !== "string") {
    return [issue("error", "name-missing", `name ${show(value)} is missing or not a string`, ["name"])];
  }
  const issues: Issue[] = [];
  const name = show(value);
  // One allowed-character rule covers empty, whitespace, "@", ":", "/", "\", control and bidi characters.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    const rule = `must start with a letter or digit and contain only letters, digits, ".", "_" and "-"`;
    issues.push(issue("error", "name-invalid", `name ${name} ${rule}`, ["name"]));
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
    issues.push(issue("warning", "name-invalid", `name ${name} should be kebab-case`, ["name"]));
  }
  const reserved = reservedSeverity(value);
  if (reserved !== undefined) {
    const message = reserved === "error"
      ? `name ${name} is reserved for official Anthropic plugins`
      : `name ${name} contains a reserved word ("claude", "anthropic" or "anthropics")`;
    issues.push(issue(reserved, "name-reserved", message, ["name"]));
  }
  return issues;
}

function pathProblem(field: KnownField, path: string): string | undefined {
  if (field === "skills" && path === ".") return undefined;
  if (!path.startsWith("./")) return `must start with "./"`;
  if (path.split("/").includes("..")) return `must not contain a ".." segment`;
  if (field === "agents" && !path.endsWith(".md")) return `must end with ".md"`;
  return undefined;
}

function pathIssues(paths: readonly ManifestPath[]): Issue[] {
  const issues: Issue[] = [];
  for (const { field, path, value } of paths) {
    const problem = pathProblem(field, value);
    if (problem !== undefined) {
      issues.push(issue("error", "path-invalid", `${label(path)} ${show(value)} ${problem}`, path));
    }
  }
  return issues;
}

export function validateManifest(manifest: object): readonly Issue[] {
  const fields = new Map<string, unknown>(Object.entries(manifest));
  const issues: Issue[] = [];
  const paths = manifestPaths(manifest);

  for (const field of KNOWN_FIELDS) {
    const value = fields.get(field);
    if (field === "name") {
      issues.push(...nameIssues(value));
      continue;
    }
    // An explicit undefined counts as absent.
    if (value === undefined) continue;
    const { expected, test } = FIELD_TYPES[field];
    if (!test(value)) {
      // A wrong type skips the homepage, author and path rules so one fault is reported once.
      issues.push(issue("error", "field-type", `${field} ${show(value)} must be ${expected}`, [field]));
      continue;
    }
    if (field === "author" && isRecord(value)) {
      const name = value["name"];
      if (typeof name !== "string" || name.trim() === "") {
        issues.push(
          issue("error", "author-invalid", `author name ${show(name)} is missing or empty`, ["author", "name"]),
        );
      }
    }
    if (field === "homepage" && typeof value === "string" && !URL.canParse(value)) {
      issues.push(issue("error", "homepage-invalid", `homepage ${show(value)} is not a valid URL`, ["homepage"]));
    }
    issues.push(...pathIssues(paths.filter((entry) => entry.field === field)));
  }

  for (const key of [...fields.keys()].filter((key) => !KNOWN.has(key)).sort()) {
    issues.push(issue("warning", "field-unknown", `field ${show(key)} is not a known plugin manifest field`, [key]));
  }
  return issues;
}
