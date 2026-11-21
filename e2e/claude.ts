import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Level = "none" | "warning" | "error";

export interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ReportIssue {
  readonly path: string;
  readonly message: string;
}

export interface ValidateReport {
  readonly success: boolean;
  readonly manifest: {
    readonly errors: readonly ReportIssue[];
    readonly warnings: readonly ReportIssue[];
  };
}

export function runClaude(args: readonly string[], env?: NodeJS.ProcessEnv, timeout?: number): CliRun {
  const result = spawnSync("claude", [...args], { encoding: "utf8", env: { ...process.env, ...env }, timeout });
  if (result.error) {
    if ("code" in result.error && result.error.code === "ENOENT") {
      throw new Error(
        "claude not found on PATH; install Claude Code (https://code.claude.com/docs/en/setup) to run test:e2e",
      );
    }
    // Timeout (ETIMEDOUT) falls through with status null so callers can report stderr.
    if (!("code" in result.error && result.error.code === "ETIMEDOUT")) throw result.error;
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function isValidateReport(value: unknown): value is ValidateReport {
  if (typeof value !== "object" || value === null) return false;
  if (!("success" in value) || typeof value.success !== "boolean") return false;
  if (!("manifest" in value) || typeof value.manifest !== "object" || value.manifest === null) return false;
  const manifest = value.manifest;
  return "errors" in manifest && Array.isArray(manifest.errors) && "warnings" in manifest
    && Array.isArray(manifest.warnings);
}

export function validatePlugin(dir: string): { readonly status: number; readonly report: ValidateReport } {
  const { status, stdout, stderr } = runClaude(["plugin", "validate", dir, "--strict", "--json"]);
  // Exit 2 or a killed process is a validator failure, not a verdict.
  if (status === null || status === 2) {
    throw new Error(`claude plugin validate failed with status ${status}:\n${stderr}\n${stdout}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // Left undefined: the guard below reports it.
  }
  // A changed report format must fail loudly: detecting drift is the point.
  if (!isValidateReport(parsed)) throw new Error(`unexpected validate report shape:\n${stdout}`);
  return { status, report: parsed };
}

export function fixturePlugin(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}/plugin`, import.meta.url));
}

// vitest globalSetup: runs once per run, aborts (not skips) when claude is missing.
export default function setup(): void {
  const { status, stdout, stderr } = runClaude(["--version"]);
  if (status !== 0) throw new Error(`claude --version failed with status ${status}:\n${stderr}`);
  const line = stdout.trim();
  console.log(`Claude Code version: ${line}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `**Claude Code version:** ${line}\n`);
}
