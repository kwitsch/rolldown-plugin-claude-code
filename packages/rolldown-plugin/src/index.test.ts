import { expect, it } from "vitest";
import { claudeCode, formatProblems, issueLine, loadProject } from "./index.js";

it("exports claudeCode and loadProject", () => {
  expect(typeof claudeCode).toBe("function");
  expect(typeof loadProject).toBe("function");
});

it("claudeCode uses only buildStart, resolveId, generateBundle and writeBundle", () => {
  expect(Object.keys(claudeCode()).sort()).toEqual([
    "buildStart",
    "generateBundle",
    "name",
    "resolveId",
    "writeBundle",
  ]);
});

it("exports the collected issue format", () => {
  expect(formatProblems(["error  a", "error  b"])).toBe("[claude-code] 2 problems\n  error  a\n  error  b");
  expect(issueLine({ severity: "error", code: "path-missing", message: "m", file: "f" }, 12)).toBe(
    "error    path-missing  f: m",
  );
});
