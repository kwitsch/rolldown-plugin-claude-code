import type { Issue, IssueSeverity } from "./issue.js";

// Declaration order of PluginManifest; exported for the type test only, not from index.ts.
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
type IssuePath = readonly (string | number)[];

interface FieldType {
  readonly expected: string;
  readonly test: (value: unknown) => boolean;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const show = (value: unknown): string => String(JSON.stringify(value));

// ["agents", 1] -> "agents[1]", ["commands", "deploy", "source"] -> "commands.deploy.source"
const label = (path: IssuePath): string =>
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

const PATH_FIELDS: ReadonlySet<KnownField> = new Set<KnownField>([
  "types",
  "skills",
  "commands",
  "agents",
  "hooks",
  "mcpServers",
  "lspServers",
  "outputStyles",
]);

const RESERVED_EXACT: readonly string[] = ["claude", "anthropic", "anthropics", "claude-code", "claude-mods"];
const RESERVED_NEXT_TO_OFFICIAL: ReadonlySet<string> = new Set(["claude", "anthropic"]);
const RESERVED_WORDS: ReadonlySet<string> = new Set(["claude", "anthropic", "anthropics"]);

function reservedSeverity(name: string): IssueSeverity | undefined {
  // Case-insensitive; any run of separators counts as one separator.
  const words = name.toLowerCase().split(/[-_.]+/);
  const joined = words.join("-");
  if (
    /^(claude|anthropics?|cc-plugin)-/.test(joined)
    || RESERVED_EXACT.includes(joined)
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
    return [{
      severity: "error",
      code: "name-missing",
      message: `name ${show(value)} is missing or not a string`,
      path: ["name"],
    }];
  }
  const issues: Issue[] = [];
  // One allowed-character rule covers empty, whitespace, "@", ":", "/", "\", control and bidi characters.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    issues.push({
      severity: "error",
      code: "name-invalid",
      message: `name ${
        show(value)
      } must start with a letter or digit and contain only letters, digits, ".", "_" and "-"`,
      path: ["name"],
    });
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
    issues.push({
      severity: "warning",
      code: "name-invalid",
      message: `name ${show(value)} should be kebab-case`,
      path: ["name"],
    });
  }
  const reserved = reservedSeverity(value);
  if (reserved === "error") {
    issues.push({
      severity: "error",
      code: "name-reserved",
      message: `name ${show(value)} is reserved for official Anthropic plugins`,
      path: ["name"],
    });
  } else if (reserved === "warning") {
    issues.push({
      severity: "warning",
      code: "name-reserved",
      message: `name ${show(value)} contains a reserved word ("claude", "anthropic" or "anthropics")`,
      path: ["name"],
    });
  }
  return issues;
}

function pathProblem(field: KnownField, path: string): string | undefined {
  if (!path.startsWith("./")) return `must start with "./"`;
  if (path.split("/").includes("..")) return `must not contain a ".." segment`;
  if (field === "agents" && !path.endsWith(".md")) return `must end with ".md"`;
  return undefined;
}

function pathIssues(field: KnownField, value: unknown): Issue[] {
  const candidates: (readonly [IssuePath, string])[] = [];
  if (typeof value === "string") {
    candidates.push([[field], value]);
  } else if (Array.isArray(value)) {
    // Inline objects in arrays are not searched.
    for (const [index, item] of value.entries()) {
      if (typeof item === "string") candidates.push([[field, index], item]);
    }
  } else if (field === "commands" && isRecord(value)) {
    for (const [command, entry] of Object.entries(value)) {
      const source = isRecord(entry) ? entry["source"] : undefined;
      if (typeof source === "string") candidates.push([[field, command, "source"], source]);
    }
  }
  const issues: Issue[] = [];
  for (const [path, candidate] of candidates) {
    if (field === "skills" && candidate === ".") continue;
    if (field === "mcpServers" && candidate.startsWith("https://")) continue;
    const problem = pathProblem(field, candidate);
    if (problem !== undefined) {
      issues.push({
        severity: "error",
        code: "path-invalid",
        message: `${label(path)} ${show(candidate)} ${problem}`,
        path,
      });
    }
  }
  return issues;
}

export function validateManifest(manifest: object): readonly Issue[] {
  const fields = new Map<string, unknown>(Object.entries(manifest));
  const known = new Set<string>(KNOWN_FIELDS);
  const issues: Issue[] = [];

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
      issues.push({
        severity: "error",
        code: "field-type",
        message: `${field} ${show(value)} must be ${expected}`,
        path: [field],
      });
      continue;
    }
    if (field === "author" && isRecord(value)) {
      const name = value["name"];
      if (typeof name !== "string" || name.trim() === "") {
        issues.push({
          severity: "error",
          code: "author-invalid",
          message: `author name ${show(name)} is missing or empty`,
          path: ["author", "name"],
        });
      }
    }
    if (field === "homepage" && typeof value === "string" && !URL.canParse(value)) {
      issues.push({
        severity: "error",
        code: "homepage-invalid",
        message: `homepage ${show(value)} is not a valid URL`,
        path: ["homepage"],
      });
    }
    if (PATH_FIELDS.has(field)) issues.push(...pathIssues(field, value));
  }

  for (const key of [...fields.keys()].filter((key) => !known.has(key)).sort()) {
    issues.push({
      severity: "warning",
      code: "field-unknown",
      message: `field ${show(key)} is not a known plugin manifest field`,
      path: [key],
    });
  }
  return issues;
}
