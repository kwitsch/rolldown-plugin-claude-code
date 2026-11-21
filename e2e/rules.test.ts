import type { Issue } from "@kwitsch/claude-code-plugin-core";
import { validateManifest } from "@kwitsch/claude-code-plugin-core";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Level, ValidateReport } from "./claude.js";
import { validatePlugin } from "./claude.js";

// CLI --strict warns on a missing version or description, so every case carries them.
const base = {
  name: "my-plugin",
  version: "1.0.0",
  description: "Rule comparison case.",
  author: { name: "Kwitsch" },
};

interface Case {
  readonly name: string;
  readonly manifest: object;
  readonly expected: Level;
}

const cases: readonly Case[] = [
  { name: "valid minimal manifest", manifest: base, expected: "none" },
  { name: "reserved name claude-tools", manifest: { ...base, name: "claude-tools" }, expected: "error" },
  { name: "reserved word mcp-for-claude", manifest: { ...base, name: "mcp-for-claude" }, expected: "warning" },
  { name: "unknown top-level field", manifest: { ...base, foo: true }, expected: "warning" },
  { name: "homepage without URL scheme", manifest: { ...base, homepage: "example.com" }, expected: "error" },
  { name: "agents path without ./", manifest: { ...base, agents: "agents/reviewer.md" }, expected: "error" },
  { name: "skills path with ..", manifest: { ...base, skills: "./../shared-skills/" }, expected: "error" },
];

function coreLevel(issues: readonly Issue[]): Level {
  if (issues.some((issue) => issue.severity === "error")) return "error";
  return issues.length > 0 ? "warning" : "none";
}

// Only manifest.errors/warnings: directory.findings reports README/LICENSE as errors even without --profile.
function cliLevel(report: ValidateReport): Level {
  if (report.manifest.errors.length > 0) return "error";
  return report.manifest.warnings.length > 0 ? "warning" : "none";
}

let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "e2e-rules-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

it.each(cases.map((testCase, index) => ({ ...testCase, index })))("$name", ({ name, manifest, expected, index }) => {
  const dir = join(root, String(index));
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const core = coreLevel(validateManifest(manifest));
  const cli = cliLevel(validatePlugin(dir).report);
  expect({ case: name, core, cli }).toEqual({ case: name, core: expected, cli: expected });
});
