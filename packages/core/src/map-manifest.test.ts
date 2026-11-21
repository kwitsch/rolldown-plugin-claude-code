import { expect, it } from "vitest";
import type { ManifestResult, PackageJson, PluginManifest } from "./index.js";
import { pluginManifest } from "./index.js";

const nameMissing = (value: string) => ({
  severity: "error",
  code: "name-missing",
  message: `package.json name ${value} is missing or not a non-empty string; no manifest produced`,
  path: ["name"],
});

const authorInvalid = (value: string) => ({
  severity: "warning",
  code: "author-invalid",
  message: `package.json author ${value} has no name; omitted from manifest`,
  path: ["author"],
});

const repositoryInvalid = (value: string) => ({
  severity: "warning",
  code: "repository-invalid",
  message: `package.json repository ${value} is not an http(s) URL; omitted from manifest`,
  path: ["repository"],
});

it("maps a full package with all eight fields and no issues", () => {
  const result: ManifestResult = pluginManifest({
    name: "@kwitsch/graphmind-helper",
    version: "0.2.4",
    description: "Graphmind helper",
    author: "Ada Example <ada@example.com> (https://example.com)",
    homepage: "https://example.com/graphmind-helper",
    repository: { type: "git", url: "git+https://github.com/owner/repo.git", directory: "packages/x" },
    license: "MIT",
    keywords: ["claude", "graphmind"],
  });
  expect(result).toEqual({
    manifest: {
      name: "graphmind-helper",
      version: "0.2.4",
      description: "Graphmind helper",
      author: { name: "Ada Example", email: "ada@example.com", url: "https://example.com" },
      homepage: "https://example.com/graphmind-helper",
      repository: "https://github.com/owner/repo",
      license: "MIT",
      keywords: ["claude", "graphmind"],
    },
    issues: [],
  });
  expect(Object.keys(result.manifest ?? {})).toHaveLength(8);
});

it("maps a minimal package with only a name", () => {
  expect(pluginManifest({ name: "graphmind-helper" })).toEqual({
    manifest: { name: "graphmind-helper" },
    issues: [],
  });
});

it("strips the scope from name and reports a missing, empty or non-string name", () => {
  expect(pluginManifest({ name: "graphmind-helper" }).manifest?.name).toBe("graphmind-helper");
  expect(pluginManifest({ name: "@kwitsch/graphmind-helper" }).manifest?.name).toBe("graphmind-helper");
  const cases: [PackageJson, string][] = [
    [{}, "undefined"],
    [{ name: "" }, "\"\""],
    [{ name: 42 } as unknown as PackageJson, "42"],
    [{ name: "@scope/" }, "\"@scope/\""],
  ];
  for (const [pkg, shown] of cases) {
    expect(pluginManifest(pkg)).toEqual({ manifest: undefined, issues: [nameMissing(shown)] });
  }
});

it("parses author strings and objects and warns when no name is derivable", () => {
  const valid: [PackageJson["author"], PluginManifest["author"]][] = [
    ["Ada Example", { name: "Ada Example" }],
    ["Ada Example <ada@example.com>", { name: "Ada Example", email: "ada@example.com" }],
    [
      "Ada Example <ada@example.com> (https://example.com)",
      { name: "Ada Example", email: "ada@example.com", url: "https://example.com" },
    ],
    [{ name: "Ada Example", url: "https://example.com" }, { name: "Ada Example", url: "https://example.com" }],
    [
      "  Ada Example   <ada@example.com>  ( https://example.com ) ",
      { name: "Ada Example", email: "ada@example.com", url: "https://example.com" },
    ],
  ];
  for (const [author, expected] of valid) {
    const result = pluginManifest({ name: "x", author });
    expect(result).toEqual({ manifest: { name: "x", author: expected }, issues: [] });
    expect(Object.keys(result.manifest?.author ?? {})).toEqual(Object.keys(expected ?? {}));
  }

  const invalid: [PackageJson["author"], string][] = [
    ["<ada@example.com>", "\"<ada@example.com>\""],
    [{ email: "ada@example.com" }, "{\"email\":\"ada@example.com\"}"],
  ];
  for (const [author, shown] of invalid) {
    const result = pluginManifest({ name: "x", author });
    expect(result).toEqual({ manifest: { name: "x" }, issues: [authorInvalid(shown)] });
    expect(result.manifest).not.toHaveProperty("author");
  }
  expect(pluginManifest({ name: "x", author: "<ada@example.com>" }).issues[0]?.message).toBe(
    "package.json author \"<ada@example.com>\" has no name; omitted from manifest",
  );
});

it("normalizes repository values to http(s) URLs and warns on invalid ones", () => {
  const valid: [PackageJson["repository"], string][] = [
    ["owner/repo", "https://github.com/owner/repo"],
    ["github:owner/repo", "https://github.com/owner/repo"],
    ["gitlab:owner/repo", "https://gitlab.com/owner/repo"],
    ["bitbucket:owner/repo", "https://bitbucket.org/owner/repo"],
    ["https://github.com/owner/repo.git", "https://github.com/owner/repo"],
    [{ url: "git+https://github.com/owner/repo.git" }, "https://github.com/owner/repo"],
    [{ url: "git://github.com/owner/repo.git" }, "https://github.com/owner/repo"],
    [{ url: "git@github.com:owner/repo.git" }, "https://github.com/owner/repo"],
    [{ url: "ssh://git@github.com/owner/repo.git" }, "https://github.com/owner/repo"],
  ];
  for (const [repository, expected] of valid) {
    expect(pluginManifest({ name: "x", repository })).toEqual({
      manifest: { name: "x", repository: expected },
      issues: [],
    });
  }

  const invalid: [PackageJson["repository"], string][] = [
    ["gist:abc123", "\"gist:abc123\""],
    [{ type: "git" }, "{\"type\":\"git\"}"],
    ["not a url", "\"not a url\""],
  ];
  for (const [repository, shown] of invalid) {
    const result = pluginManifest({ name: "x", repository });
    expect(result).toEqual({ manifest: { name: "x" }, issues: [repositoryInvalid(shown)] });
    expect(result.manifest).not.toHaveProperty("repository");
  }
});

it("passes version, homepage and license through and cleans description and keywords", () => {
  expect(
    pluginManifest({
      name: "x",
      version: "1.2.3",
      homepage: "not-checked-here",
      license: "SEE LICENSE IN LICENSE",
      description: "  text  ",
      keywords: ["a", 1, "b"] as unknown as readonly string[],
    }).manifest,
  ).toEqual({
    name: "x",
    version: "1.2.3",
    description: "text",
    homepage: "not-checked-here",
    license: "SEE LICENSE IN LICENSE",
    keywords: ["a", "b"],
  });
  expect(pluginManifest({ name: "x", description: "   ", keywords: [] })).toEqual({
    manifest: { name: "x" },
    issues: [],
  });
});

it("applies overrides flat, ignores undefined values and suppresses issues of overridden fields", () => {
  const pkg: PackageJson = {
    name: "x",
    description: "mapped",
    author: { name: "Pkg Author", email: "pkg@example.com" },
    keywords: ["a", "b"],
  };
  expect(
    pluginManifest(pkg, { keywords: ["c"], author: { name: "Ada Example" }, description: undefined }).manifest,
  ).toEqual({ name: "x", description: "mapped", author: { name: "Ada Example" }, keywords: ["c"] });

  const example = pluginManifest(
    { name: "@kwitsch/graphmind-helper", version: "0.2.4", author: "<only@mail.example>" },
    { displayName: "Graphmind Helper", author: { name: "Ada Example" } },
  );
  expect(example).toEqual({
    manifest: {
      name: "graphmind-helper",
      displayName: "Graphmind Helper",
      version: "0.2.4",
      author: { name: "Ada Example" },
    },
    issues: [],
  });
  expect(Object.keys(example.manifest ?? {})).toEqual(["name", "displayName", "version", "author"]);

  expect(pluginManifest({ name: "x", repository: "gist:abc123" }, { repository: "git@host:raw.git" })).toEqual({
    manifest: { name: "x", repository: "git@host:raw.git" },
    issues: [],
  });

  expect(pluginManifest({}, { name: "@scope/x" })).toEqual({ manifest: { name: "@scope/x" }, issues: [] });
});

it("orders manifest keys by PluginManifest declaration regardless of package.json order", () => {
  const { manifest } = pluginManifest(
    {
      keywords: ["k"],
      license: "MIT",
      repository: "owner/repo",
      homepage: "https://example.com",
      author: "Ada Example",
      description: "d",
      version: "1.0.0",
      name: "x",
    },
    { displayName: "X" },
  );
  expect(Object.keys(manifest ?? {})).toEqual([
    "name",
    "displayName",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
  ]);
});

it("does not mutate frozen inputs", () => {
  const pkg: PackageJson = Object.freeze({
    name: "@scope/x",
    description: "  d  ",
    author: Object.freeze({ name: " Ada ", email: "ada@example.com" }),
    repository: Object.freeze({ type: "git", url: "git+https://github.com/owner/repo.git" }),
    keywords: Object.freeze(["a", "b"]),
  });
  const overrides: Partial<PluginManifest> = Object.freeze({
    displayName: "X",
    keywords: Object.freeze(["c"]),
  });
  const pkgBefore = structuredClone(pkg);
  const overridesBefore = structuredClone(overrides);
  expect(() => pluginManifest(pkg, overrides)).not.toThrow();
  expect(pkg).toEqual(pkgBefore);
  expect(overrides).toEqual(overridesBefore);
});

it("still maps and checks other fields when name is missing", () => {
  const result = pluginManifest({ author: "<a@b.c>", repository: "gist:x" });
  expect(result.manifest).toBeUndefined();
  expect(result.issues.map((issue) => issue.code)).toEqual(["name-missing", "author-invalid", "repository-invalid"]);
});
