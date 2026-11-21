import { expect, expectTypeOf, it } from "vitest";
import type { Issue, IssueCode, IssueSeverity, PluginManifest } from "./index.js";
import { validateManifest } from "./index.js";
import { KNOWN_FIELDS } from "./validate-manifest.js";

type IssuePath = readonly (string | number)[];

const issue = (severity: IssueSeverity, code: IssueCode, message: string, path: IssuePath): Issue => ({
  severity,
  code,
  message,
  path,
});

const nameMissing = (shown: string): Issue =>
  issue("error", "name-missing", `name ${shown} is missing or not a string`, ["name"]);

const nameInvalid = (name: string): Issue =>
  issue(
    "error",
    "name-invalid",
    `name ${JSON.stringify(name)} must start with a letter or digit and contain only letters, digits, ".", "_" and "-"`,
    ["name"],
  );

const kebabWarning = (name: string): Issue =>
  issue("warning", "name-invalid", `name ${JSON.stringify(name)} should be kebab-case`, ["name"]);

const reservedError = (name: string): Issue =>
  issue("error", "name-reserved", `name ${JSON.stringify(name)} is reserved for official Anthropic plugins`, ["name"]);

const reservedWarning = (name: string): Issue =>
  issue(
    "warning",
    "name-reserved",
    `name ${JSON.stringify(name)} contains a reserved word ("claude", "anthropic" or "anthropics")`,
    ["name"],
  );

const homepageInvalid = (value: string): Issue =>
  issue("error", "homepage-invalid", `homepage ${JSON.stringify(value)} is not a valid URL`, ["homepage"]);

const pathInvalid = (message: string, path: IssuePath): Issue => issue("error", "path-invalid", message, path);

const fieldType = (field: string, value: unknown, expected: string): Issue =>
  issue("error", "field-type", `${field} ${JSON.stringify(value)} must be ${expected}`, [field]);

const authorInvalid = (shown: string): Issue =>
  issue("error", "author-invalid", `author name ${shown} is missing or empty`, ["author", "name"]);

const fieldUnknown = (key: string): Issue =>
  issue("warning", "field-unknown", `field ${JSON.stringify(key)} is not a known plugin manifest field`, [key]);

const NAME = "deploy-tools";

it("known-field list equals keyof PluginManifest", () => {
  expectTypeOf<(typeof KNOWN_FIELDS)[number]>().toEqualTypeOf<keyof PluginManifest>();
  expect(new Set(KNOWN_FIELDS).size).toBe(KNOWN_FIELDS.length);
});

it("valid manifests have no issues", () => {
  expect(validateManifest({ name: NAME })).toEqual([]);
  const complete: Required<PluginManifest> = {
    $schema: "https://json.schemastore.org/claude-code-plugin-manifest.json",
    name: NAME,
    displayName: "Deploy Tools",
    version: "2.1.0",
    description: "Deployment automation tools",
    author: { name: "Dev Example", email: "dev@example.com", url: "https://example.com" },
    homepage: "https://docs.example.com/plugin",
    repository: "https://github.com/example/deploy-tools",
    license: "MIT",
    keywords: ["deployment", "ci-cd"],
    metadata: { category: "devops" },
    icon: "./assets/icon.png",
    documentationUrl: "https://docs.example.com",
    supportUrl: "https://example.com/support",
    privacyPolicyUrl: "https://example.com/privacy",
    termsOfServiceUrl: "https://example.com/terms",
    defaultEnabled: true,
    engines: { "claude-code": ">=2.0.0" },
    dependencies: ["helper-lib", { name: "secrets-vault", version: "~2.1.0" }],
    network: { hosts: ["api.example.com"] },
    userConfig: { apiKey: { type: "string" } },
    types: "./types/",
    channels: [{}],
    skills: "./skills/",
    commands: ["./commands/deploy.md", "./commands/status.md"],
    agents: ["./agents/reviewer.md", "./agents/tester.md"],
    hooks: "./config/hooks.json",
    mcpServers: "./.mcp.json",
    lspServers: "./.lsp.json",
    outputStyles: "./styles/",
    experimental: { themes: "./themes/" },
  };
  expect(validateManifest(complete)).toEqual([]);
});

it("checks the shape of name", () => {
  expect(validateManifest({})).toEqual([nameMissing("undefined")]);
  expect(validateManifest({ name: undefined })).toEqual([nameMissing("undefined")]);
  expect(validateManifest({ name: 42 })).toEqual([nameMissing("42")]);
  const invalid: readonly string[] = [
    "",
    "deploy tools",
    "@scope/deploy",
    "a:b",
    "a\\b",
    "deploy\u0007",
    "deploy‮tools",
    "deploy+tools",
    "-deploy",
  ];
  for (const name of invalid) expect(validateManifest({ name })).toEqual([nameInvalid(name)]);
  expect(validateManifest({ name: "Deploy_Tools" })).toEqual([kebabWarning("Deploy_Tools")]);
  expect(validateManifest({ name: NAME })).toEqual([]);
});

it("reports reserved names", () => {
  const errors: readonly string[] = [
    "claude-tools",
    "anthropics-tools",
    "cc-plugin-x",
    "anthropic",
    "claude-code",
    "claude-mods",
    "official-claude-tools",
    "tools-official-anthropic",
  ];
  for (const name of errors) expect(validateManifest({ name })).toEqual([reservedError(name)]);
  expect(validateManifest({ name: "mcp-for-claude" })).toEqual([reservedWarning("mcp-for-claude")]);
  expect(validateManifest({ name: "Claude-Tools" })).toEqual([
    kebabWarning("Claude-Tools"),
    reservedError("Claude-Tools"),
  ]);
  // "__" is not kebab-case (warning) and still collapses to one separator (reserved prefix).
  expect(validateManifest({ name: "claude__tools" })).toEqual([
    kebabWarning("claude__tools"),
    reservedError("claude__tools"),
  ]);
  expect(validateManifest({ name: NAME })).toEqual([]);
});

it("does not reserve names that only contain a reserved word as a substring", () => {
  expect(validateManifest({ name: "claudette" })).toEqual([]);
  expect(validateManifest({ name: "declaude" })).toEqual([]);
});

it("checks homepage as a URL", () => {
  expect(validateManifest({ name: NAME, homepage: "https://example.com" })).toEqual([]);
  expect(validateManifest({ name: NAME, homepage: "example.com" })).toEqual([homepageInvalid("example.com")]);
  expect(validateManifest({ name: NAME, homepage: "" })).toEqual([homepageInvalid("")]);
});

it("checks the form of paths", () => {
  const cases: readonly (readonly [object, readonly Issue[]])[] = [
    [{ skills: "skills/" }, [pathInvalid(`skills "skills/" must start with "./"`, ["skills"])]],
    [{ skills: "./a/../b" }, [pathInvalid(`skills "./a/../b" must not contain a ".." segment`, ["skills"])]],
    [{ agents: ["/abs/a.md"] }, [pathInvalid(`agents[0] "/abs/a.md" must start with "./"`, ["agents", 0])]],
    [
      { agents: ["./a.md", "agents/reviewer.md"] },
      [pathInvalid(`agents[1] "agents/reviewer.md" must start with "./"`, ["agents", 1])],
    ],
    [
      { commands: { deploy: { source: "commands/deploy.md" } } },
      [pathInvalid(`commands.deploy.source "commands/deploy.md" must start with "./"`, [
        "commands",
        "deploy",
        "source",
      ])],
    ],
    [{ types: "types" }, [pathInvalid(`types "types" must start with "./"`, ["types"])]],
    [
      { hooks: ["hooks.json", { PreToolUse: [] }] },
      [pathInvalid(`hooks[0] "hooks.json" must start with "./"`, ["hooks", 0])],
    ],
    [
      { mcpServers: "http://example.com/bundle" },
      [pathInvalid(`mcpServers "http://example.com/bundle" must start with "./"`, ["mcpServers"])],
    ],
    [
      { outputStyles: ["../styles/"] },
      [pathInvalid(`outputStyles[0] "../styles/" must start with "./"`, ["outputStyles", 0])],
    ],
    [{ lspServers: "lsp.json" }, [pathInvalid(`lspServers "lsp.json" must start with "./"`, ["lspServers"])]],
    [{ skills: "." }, []],
    [{ skills: ["."] }, []],
    [{ mcpServers: "https://example.com/bundle" }, []],
    [{ mcpServers: ["https://example.com/bundle"] }, []],
    [{ hooks: [{ PreToolUse: [] }] }, []],
    [{ mcpServers: [{ server: { command: "node" } }] }, []],
    [{ mcpServers: { server: { command: "node" } } }, []],
    [{ commands: { deploy: { source: "./commands/deploy.md" } } }, []],
  ];
  for (const [fields, expected] of cases) expect(validateManifest({ name: NAME, ...fields })).toEqual(expected);
});

it("requires agents entries to be .md files", () => {
  expect(validateManifest({ name: NAME, agents: "./agents/" })).toEqual([
    pathInvalid(`agents "./agents/" must end with ".md"`, ["agents"]),
  ]);
  expect(validateManifest({ name: NAME, agents: "./agents/reviewer.md" })).toEqual([]);
});

it("warns about unknown fields in alphabetical order", () => {
  expect(validateManifest({ name: NAME, foo: 1 })).toEqual([fieldUnknown("foo")]);
  expect(validateManifest({ name: NAME, zeta: 1, alpha: 2 })).toEqual([fieldUnknown("alpha"), fieldUnknown("zeta")]);
  expect(validateManifest({ name: NAME, $schema: "https://example.com/schema.json" })).toEqual([]);
});

it("checks the runtime type of known fields", () => {
  const cases: readonly (readonly [string, unknown, string])[] = [
    ["$schema", 1, "a string"],
    ["version", 1, "a string"],
    ["defaultEnabled", "yes", "a boolean"],
    ["keywords", ["a", 1], "an array of strings"],
    ["metadata", [], "an object"],
    ["author", "Jane", "an object"],
    ["engines", { "claude-code": 1 }, `an object with a string "claude-code"`],
    ["network", { hosts: "x" }, `an object with "hosts" as an array of strings`],
    ["dependencies", [{ version: "1" }], `an array of strings or objects with a string "name"`],
    ["channels", ["x"], "an array of objects"],
    ["skills", 1, "a string or an array of strings"],
    ["commands", 1, "a string, an array of strings or an object"],
    ["hooks", [1], "a string, an object or an array of strings and objects"],
    // A wrong type skips the homepage and path rules: exactly one issue.
    ["homepage", 42, "a string"],
    ["agents", 42, "a string or an array of strings"],
  ];
  for (const [field, value, expected] of cases) {
    expect(validateManifest({ name: NAME, [field]: value })).toEqual([fieldType(field, value, expected)]);
  }
  expect(validateManifest({ name: NAME, author: { email: "a@example.com" } })).toEqual([authorInvalid("undefined")]);
  expect(validateManifest({ name: NAME, author: { name: " " } })).toEqual([authorInvalid(`" "`)]);
  expect(validateManifest({ name: NAME, author: { name: "Jane" } })).toEqual([]);
});

it("orders issues by declaration order with unknown fields last", () => {
  const issues = validateManifest({ zzz: 1, agents: ["./a.md", "b.md"], homepage: "nope", name: "x" });
  expect(issues.map((found) => found.code)).toEqual(["homepage-invalid", "path-invalid", "field-unknown"]);
  expect(issues[1]?.path).toEqual(["agents", 1]);
});

it("does not mutate or throw on a frozen input", () => {
  const manifest = Object.freeze({
    name: "Claude Tools",
    homepage: "nope",
    agents: Object.freeze(["agents/a"]),
    author: Object.freeze({ name: "" }),
    extra: true,
  });
  const before = structuredClone(manifest);
  let issues: readonly Issue[] = [];
  expect(() => {
    issues = validateManifest(manifest);
  }).not.toThrow();
  expect(issues.length).toBeGreaterThan(0);
  expect(manifest).toEqual(before);
});

it("never throws while showing BigInt and circular values", () => {
  const circular: Record<string, unknown> = {};
  circular["self"] = circular;
  expect(validateManifest({ name: 1n })).toEqual([nameMissing("1n")]);
  expect(validateManifest({ name: NAME, version: 1n })).toEqual([
    issue("error", "field-type", "version 1n must be a string", ["version"]),
  ]);
  expect(validateManifest({ name: NAME, version: circular })).toEqual([
    issue("error", "field-type", "version [object Object] must be a string", ["version"]),
  ]);
  expect(validateManifest({ name: NAME, author: { name: 1n } })).toEqual([authorInvalid("1n")]);
});
