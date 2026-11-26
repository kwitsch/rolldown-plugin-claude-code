import type { Issue } from "./issue.js";
import type { PackageJson } from "./package-json.js";
import type { PluginAuthor, PluginManifest } from "./plugin-manifest.js";
import { isRecord, KNOWN_FIELDS, show } from "./validate-manifest.js";

export interface ManifestResult {
  readonly manifest: PluginManifest | undefined;
  readonly issues: readonly Issue[];
}

const str = (value: unknown): string | undefined => typeof value === "string" && value !== "" ? value : undefined;

const trimmed = (value: unknown): string | undefined => typeof value === "string" ? value.trim() : undefined;

function parseAuthor(value: unknown): PluginAuthor | "invalid" | undefined {
  let name: string;
  let email: string | undefined;
  let url: string | undefined;
  if (typeof value === "string") {
    if (value.trim() === "") return undefined;
    name = (/^[^<(]*/.exec(value)?.[0] ?? "").trim();
    email = /<([^>]*)>/.exec(value)?.[1]?.trim();
    url = /\(([^)]*)\)/.exec(value)?.[1]?.trim();
  } else if (isRecord(value)) {
    name = trimmed(value["name"]) ?? "";
    email = trimmed(value["email"]);
    url = trimmed(value["url"]);
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
  } else if (isRecord(value)) {
    const url = value["url"];
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
  try {
    const protocol = new URL(s).protocol;
    return protocol === "https:" || protocol === "http:" ? s : "invalid";
  } catch {
    return "invalid";
  }
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

  const description = str(trimmed(pkg.description));
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
  for (const key of KNOWN_FIELDS) {
    if (Object.hasOwn(mapped, key)) ordered[key] = mapped[key];
  }
  for (const key of Object.keys(mapped)) {
    if (!Object.hasOwn(ordered, key)) ordered[key] = mapped[key];
  }

  if (ordered["name"] === undefined) return { manifest: undefined, issues };
  return { manifest: ordered as unknown as PluginManifest, issues };
}
