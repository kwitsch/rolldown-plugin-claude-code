import type { Issue } from "./issue.js";
import type { PackageJson } from "./package-json.js";
import type { PluginAuthor, PluginManifest } from "./plugin-manifest.js";

export interface ManifestResult {
  readonly manifest: PluginManifest | undefined;
  readonly issues: readonly Issue[];
}

// Declaration order of PluginManifest; `satisfies` makes a missing or extra key a compile error.
const MANIFEST_KEYS = {
  $schema: true,
  name: true,
  displayName: true,
  version: true,
  description: true,
  author: true,
  homepage: true,
  repository: true,
  license: true,
  keywords: true,
  metadata: true,
  icon: true,
  documentationUrl: true,
  supportUrl: true,
  privacyPolicyUrl: true,
  termsOfServiceUrl: true,
  defaultEnabled: true,
  engines: true,
  dependencies: true,
  network: true,
  userConfig: true,
  types: true,
  channels: true,
  skills: true,
  commands: true,
  agents: true,
  hooks: true,
  mcpServers: true,
  lspServers: true,
  outputStyles: true,
  experimental: true,
} satisfies Record<keyof PluginManifest, true>;

const str = (value: unknown): string | undefined => typeof value === "string" && value !== "" ? value : undefined;

const show = (value: unknown): string => String(JSON.stringify(value));

function parseAuthor(value: unknown): PluginAuthor | "invalid" | undefined {
  let name: string;
  let email: string | undefined;
  let url: string | undefined;
  if (typeof value === "string") {
    if (value.trim() === "") return undefined;
    name = (/^[^<(]*/.exec(value)?.[0] ?? "").trim();
    email = /<([^>]*)>/.exec(value)?.[1]?.trim();
    url = /\(([^)]*)\)/.exec(value)?.[1]?.trim();
  } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const author = value as Readonly<Record<string, unknown>>;
    name = typeof author["name"] === "string" ? author["name"].trim() : "";
    email = typeof author["email"] === "string" ? author["email"].trim() : undefined;
    url = typeof author["url"] === "string" ? author["url"].trim() : undefined;
  } else {
    return undefined;
  }
  if (name === "") return "invalid";
  return { name, ...(email ? { email } : {}), ...(url ? { url } : {}) };
}

function normalizeRepository(value: unknown): string | "invalid" | undefined {
  let s: string;
  if (typeof value === "string") {
    s = value.trim();
    if (s === "") return undefined;
  } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const url = (value as Readonly<Record<string, unknown>>)["url"];
    if (typeof url !== "string" || url === "") return "invalid";
    s = url.trim();
  } else {
    return undefined;
  }
  if (/^(github|gitlab|bitbucket):[^/\s]+\/[^/\s]+$/.test(s)) {
    s = s
      .replace(/^github:/, "https://github.com/")
      .replace(/^gitlab:/, "https://gitlab.com/")
      .replace(/^bitbucket:/, "https://bitbucket.org/");
  } else if (/^[^/\s:@.][^/\s:@]*\/[^/\s:@]+$/.test(s)) {
    s = `https://github.com/${s}`;
  } else {
    s = s
      .replace(/^git\+/, "")
      .replace(/^git:\/\//, "https://")
      .replace(/^ssh:\/\/([^@/]+@)?/, "https://")
      .replace(/^[^@/\s]+@([^:/\s]+):(?!\/)(.+)$/, "https://$1/$2");
  }
  s = s.replace(/\.git$/, "");
  if (!URL.canParse(s)) return "invalid";
  const protocol = new URL(s).protocol;
  return protocol === "https:" || protocol === "http:" ? s : "invalid";
}

export function pluginManifest(pkg: PackageJson, overrides?: Partial<PluginManifest>): ManifestResult {
  const issues: Issue[] = [];
  const mapped: Record<string, unknown> = {};

  const rawName = str(pkg.name);
  const name = rawName?.startsWith("@") && rawName.includes("/") ? rawName.slice(rawName.indexOf("/") + 1) : rawName;
  if (name) mapped["name"] = name;
  else if (overrides?.name === undefined) {
    issues.push({
      severity: "error",
      code: "name-missing",
      message: `package.json name ${show(pkg.name)} is missing or not a non-empty string; no manifest produced`,
      path: ["name"],
    });
  }

  for (const field of ["version", "homepage", "license"] as const) {
    const value = str(pkg[field]);
    if (value !== undefined) mapped[field] = value;
  }

  const description = str(typeof pkg.description === "string" ? pkg.description.trim() : undefined);
  if (description !== undefined) mapped["description"] = description;

  const keywords: unknown = pkg.keywords;
  if (Array.isArray(keywords)) {
    const kept = keywords.filter((keyword): keyword is string => typeof keyword === "string");
    if (kept.length > 0) mapped["keywords"] = kept;
  }

  const author = parseAuthor(pkg.author);
  if (author === "invalid") {
    if (overrides?.author === undefined) {
      issues.push({
        severity: "warning",
        code: "author-invalid",
        message: `package.json author ${show(pkg.author)} has no name; omitted from manifest`,
        path: ["author"],
      });
    }
  } else if (author !== undefined) mapped["author"] = author;

  const repository = normalizeRepository(pkg.repository);
  if (repository === "invalid") {
    if (overrides?.repository === undefined) {
      issues.push({
        severity: "warning",
        code: "repository-invalid",
        message: `package.json repository ${show(pkg.repository)} is not an http(s) URL; omitted from manifest`,
        path: ["repository"],
      });
    }
  } else if (repository !== undefined) mapped["repository"] = repository;

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) mapped[key] = value;
  }

  // Known keys in declaration order first, then runtime-only override keys in insertion order.
  const ordered: Record<string, unknown> = {};
  for (const key of [...Object.keys(MANIFEST_KEYS), ...Object.keys(mapped)]) {
    if (Object.hasOwn(mapped, key) && !Object.hasOwn(ordered, key)) ordered[key] = mapped[key];
  }

  if (ordered["name"] === undefined) return { manifest: undefined, issues };
  return { manifest: ordered as unknown as PluginManifest, issues };
}
