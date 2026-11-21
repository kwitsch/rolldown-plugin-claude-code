import { expect, it } from "vitest";
import { claudeCode, loadProject } from "./index.js";

it("exports claudeCode and loadProject", () => {
  expect(typeof claudeCode).toBe("function");
  expect(typeof loadProject).toBe("function");
});

it("claudeCode uses only buildStart, generateBundle and writeBundle", () => {
  expect(Object.keys(claudeCode()).sort()).toEqual(["buildStart", "generateBundle", "name", "writeBundle"]);
});
