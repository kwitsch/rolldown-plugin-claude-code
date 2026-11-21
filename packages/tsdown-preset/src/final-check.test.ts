import type { LoadedProject } from "@kwitsch/rolldown-plugin-claude-code";
import { loadProject } from "@kwitsch/rolldown-plugin-claude-code";
import { chmod, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Mock } from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalCheck } from "./final-check.js";
import { writeValidTree } from "./test-utils.js";

const tempDir = async (): Promise<string> => realpath(await mkdtemp(join(tmpdir(), "ccp-")));

async function project(files: Record<string, string>): Promise<string> {
  const root = await tempDir();
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content);
  }
  return root;
}

const FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "demo", version: "1.0.0" }),
  "hooks.template.json": JSON.stringify({
    mod: "./src/register.ts",
    hooks: { Stop: [{ hooks: [{ type: "command", command: "./src/stop.ts" }] }] },
  }),
  "src/register.ts": "export function register(): void {}\n",
  "src/stop.ts": "console.log(1);\n",
};

const SKIP_NOTICE = "[claude-code] claude not found on PATH; skipping claude plugin validate";
const HINT = /set validate: false to skip the Claude CLI check/;

type Log = (...args: unknown[]) => void;

interface Setup {
  readonly project: LoadedProject;
  readonly outDir: string;
  readonly logger: { info: Mock<Log>; warn: Mock<Log> };
}

async function setup(omit?: string): Promise<Setup> {
  const root = await project(FILES);
  const loaded = await loadProject({ root, hooksTemplate: "hooks.template.json" });
  const outDir = join(root, "plugin");
  await writeValidTree(outDir, loaded, omit);
  return { project: loaded, outDir, logger: { info: vi.fn<Log>(), warn: vi.fn<Log>() } };
}

// A fake `claude` on its own PATH dir: logs its args, then runs `body`.
async function fakeClaude(body: string): Promise<{ bin: string; log: string }> {
  const bin = await tempDir();
  const log = join(bin, "calls.log");
  const file = join(bin, "claude");
  await writeFile(file, `#!/bin/sh\necho "$@" >> "${log}"\n${body}\n`);
  await chmod(file, 0o755);
  return { bin, log };
}

const exitWith = (code: number): string => `echo "fake stdout"\necho "fake stderr" >&2\nexit ${code}`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("finalCheck", () => {
  it("sets mode 0755 on script outputs", async () => {
    const { project: loaded, outDir, logger } = await setup();
    const script = join(outDir, "hooks/stop.mjs");
    expect((await stat(script)).mode & 0o777).toBe(0o644);
    await finalCheck(loaded, { outDir, strict: true, validate: false }, logger);
    expect((await stat(script)).mode & 0o777).toBe(0o755);
  });

  it("aborts when an entry output is missing", async () => {
    const { project: loaded, outDir, logger } = await setup("hooks/stop.mjs");
    await expect(finalCheck(loaded, { outDir, strict: true, validate: false }, logger)).rejects.toThrow(
      /\[claude-code\] 1 problem[\s\S]*path-missing/,
    );
  });
});

describe("validate", () => {
  it("false never invokes the CLI", async () => {
    const { project: loaded, outDir, logger } = await setup();
    const { bin, log } = await fakeClaude(exitWith(0));
    vi.stubEnv("PATH", bin);
    await expect(finalCheck(loaded, { outDir, strict: true, validate: false }, logger)).resolves.toBeUndefined();
    await expect(readFile(log, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("\"auto\" without claude on PATH skips with a notice", async () => {
    const { project: loaded, outDir, logger } = await setup();
    vi.stubEnv("PATH", await tempDir());
    await expect(finalCheck(loaded, { outDir, strict: true, validate: "auto" }, logger)).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(SKIP_NOTICE);
  });

  it("true without claude on PATH aborts", async () => {
    const { project: loaded, outDir, logger } = await setup();
    vi.stubEnv("PATH", await tempDir());
    const run = finalCheck(loaded, { outDir, strict: true, validate: true }, logger);
    await expect(run).rejects.toThrow(/claude not found on PATH/);
    await expect(run).rejects.toThrow(HINT);
  });

  it.each([true, "auto"] as const)("%s passes when claude exits 0", async (validate) => {
    const { project: loaded, outDir, logger } = await setup();
    const { bin, log } = await fakeClaude(exitWith(0));
    vi.stubEnv("PATH", bin);
    await expect(finalCheck(loaded, { outDir, strict: true, validate }, logger)).resolves.toBeUndefined();
    expect(await readFile(log, "utf8")).toBe(`plugin validate --strict ${outDir}\n`);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("\"auto\" aborts when a found claude exits non-zero", async () => {
    const { project: loaded, outDir, logger } = await setup();
    const { bin } = await fakeClaude(exitWith(1));
    vi.stubEnv("PATH", bin);
    await expect(finalCheck(loaded, { outDir, strict: true, validate: "auto" }, logger)).rejects.toThrow(
      /\[claude-code\] 1 problem\n  error  claude plugin validate --strict exited with code 1\n    fake stdout\n    fake stderr\n    set validate: false to skip the Claude CLI check$/,
    );
  });

  it("aborts when claude ends without an exit code", async () => {
    const { project: loaded, outDir, logger } = await setup();
    const { bin } = await fakeClaude("kill -TERM $$");
    vi.stubEnv("PATH", bin);
    const run = finalCheck(loaded, { outDir, strict: true, validate: true }, logger);
    await expect(run).rejects.toThrow(/did not finish \(terminated by SIGTERM\)/);
    await expect(run).rejects.toThrow(HINT);
  });
});
