import { expect, expectTypeOf, it } from "vitest";
import type { IssueCode, PackageJson, PluginConfig, PluginManifest } from "./index.js";
import { ISSUE_CODES } from "./index.js";

// Fresh object literals passed here get excess-property checks.
const accepts = <T>(value: T): T => value;

it("PluginManifest accepts the minimal manifest and rejects invalid ones", () => {
  expectTypeOf<{ name: "x" }>().toExtend<PluginManifest>();
  // @ts-expect-error
  accepts<PluginManifest>({ version: "1.0.0" });
  // @ts-expect-error
  accepts<PluginManifest>({ name: "x", unknownField: true });
  // @ts-expect-error
  accepts<PluginManifest>({ name: "x", author: { email: "a@b.c" } });
  // @ts-expect-error
  accepts<PluginManifest>({ name: "x", repository: { url: "https://example.com" } });
});

it("PackageJson accepts author as string or object and extra fields", () => {
  expectTypeOf<{ author: "Jane" }>().toExtend<PackageJson>();
  expectTypeOf<{ author: { name: "Jane"; email: "j@example.com" } }>().toExtend<PackageJson>();
  expectTypeOf<{ name: "x"; private: true }>().toExtend<PackageJson>();
});

it("Issue codes are exactly ISSUE_CODES, unique and kebab-case", () => {
  expectTypeOf<IssueCode>().toEqualTypeOf<
    | "name-missing"
    | "name-invalid"
    | "name-reserved"
    | "author-invalid"
    | "homepage-invalid"
    | "repository-invalid"
    | "field-unknown"
    | "path-invalid"
    | "path-missing"
    | "placeholder-unknown"
    | "entry-unused"
  >();
  expect(new Set(ISSUE_CODES).size).toBe(ISSUE_CODES.length);
  for (const code of ISSUE_CODES) expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
});

it("PluginConfig accepts mod, scripts and hooksTemplate and rejects invalid ones", () => {
  expectTypeOf<{
    mod: "src/mods/register.ts";
    scripts: ["src/scripts/pre-tool.ts"];
    hooksTemplate: "hooks.template.json";
  }>().toExtend<PluginConfig>();
  // @ts-expect-error
  accepts<PluginConfig>({ mod: "src/mods/register.ts", mods: ["a.ts"] });
  // @ts-expect-error
  accepts<PluginConfig>({ mod: ["src/mods/register.ts"] });
});
