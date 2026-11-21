import type { Issue } from "@kwitsch/claude-code-plugin-core";
import { validateLayout } from "@kwitsch/claude-code-plugin-core";
import type { LoadedProject } from "@kwitsch/rolldown-plugin-claude-code";
import { formatProblems, issueLine } from "@kwitsch/rolldown-plugin-claude-code";
import { execFile } from "node:child_process";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Logger } from "tsdown";

export interface FinalCheckOptions {
  /** Absolute plugin output root. */
  readonly outDir: string;
  readonly strict: boolean;
  readonly validate: boolean | "auto";
}

const VALIDATE_TIMEOUT_MS = 30_000;

// The headline is the single counted problem; CLI output and the hint follow as detail lines.
function validateError(headline: string, output: readonly string[]): Error {
  const details = [...output, "set validate: false to skip the Claude CLI check"].map((line) => `    ${line}`);
  return new Error(`${formatProblems([headline])}\n${details.join("\n")}`);
}

function report(issues: readonly Issue[], strict: boolean, logger: Pick<Logger, "warn">): void {
  if (!strict) {
    for (const issue of issues) {
      if (issue.severity === "warning") logger.warn(issueLine(issue, issue.code.length));
    }
  }
  const fatal = strict ? issues : issues.filter((issue) => issue.severity === "error");
  if (fatal.length > 0) {
    const width = Math.max(...fatal.map((issue) => issue.code.length));
    throw new Error(formatProblems(fatal.map((issue) => issueLine(issue, width))));
  }
}

async function runValidate(outDir: string, validate: true | "auto", logger: Pick<Logger, "info">): Promise<void> {
  const run = promisify(execFile)("claude", ["plugin", "validate", "--strict", outDir], {
    timeout: VALIDATE_TIMEOUT_MS,
  });
  // A CLI waiting for input cannot hang the build.
  run.child.stdin?.end();
  try {
    await run;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const code = "code" in error ? error.code : undefined;
    // Spawning is the only PATH check: ENOENT means claude is not installed.
    if (code === "ENOENT") {
      if (validate === "auto") {
        logger.info("[claude-code] claude not found on PATH; skipping claude plugin validate");
        return;
      }
      throw validateError("error  claude not found on PATH; validate: true requires the Claude Code CLI", []);
    }
    const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
    const output = `${stdout}\n${stderr}`.split("\n").filter((line) => line.trim() !== "");
    if (typeof code === "number") {
      throw validateError(`error  claude plugin validate --strict exited with code ${code}`, output);
    }
    const killed = "killed" in error && error.killed === true;
    const signal = "signal" in error && typeof error.signal === "string" ? error.signal : undefined;
    if (killed || signal !== undefined) {
      const reason = killed ? `timed out after ${VALIDATE_TIMEOUT_MS / 1000} s` : `terminated by ${signal}`;
      throw validateError(`error  claude plugin validate --strict did not finish (${reason})`, output);
    }
    throw error;
  }
}

export async function finalCheck(
  project: LoadedProject,
  options: FinalCheckOptions,
  logger: Pick<Logger, "info" | "warn">,
): Promise<void> {
  const { outDir, strict, validate } = options;
  // ENOENT is left to validateLayout, which reports it as a collected path-missing issue.
  await Promise.all(
    project.entries.filter((entry) => entry.kind === "script").map((entry) =>
      chmod(join(outDir, entry.output), 0o755).catch((error: unknown) => {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      })
    ),
  );
  // Without a manifest the plugin's buildStart has already failed the build.
  if (project.manifest !== undefined) {
    report(await validateLayout({ outDir, manifest: project.manifest, entries: project.entries }), strict, logger);
  }
  if (validate === false) return;
  await runValidate(outDir, validate, logger);
}
