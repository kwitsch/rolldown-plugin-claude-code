import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixturePlugin, runClaude } from "./claude.js";

// --tools "" disables built-in tools, so the prompt runs without tool use.
const args = (dir: string): string[] => ["-p", "Reply with the single word OK.", "--plugin-dir", dir, "--tools", ""];

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("live run", () => {
  it("script-only SessionStart hook writes the marker", () => {
    const marker = join(mkdtempSync(join(tmpdir(), "e2e-live-")), "marker.json");
    const { status, stderr } = runClaude(args(fixturePlugin("script-only")), { FIXTURE_MARKER: marker }, 170_000);
    expect(status, stderr).toBe(0);
    // Existence only: SessionStart and Stop write the same marker, so the content may be the Stop input.
    expect(existsSync(marker)).toBe(true);
  }, 180_000);

  it("mod-only runs without a plugin load error", () => {
    const { status, stdout, stderr } = runClaude(args(fixturePlugin("mod-only")), undefined, 170_000);
    expect(status, stderr).toBe(0);
    // shortcut: loose text match for a plugin load error, upgrade to a structured signal once the CLI exposes one
    expect(stdout + stderr).not.toMatch(/plugin[^\n]*(error|fail)/i);
  }, 180_000);
});
