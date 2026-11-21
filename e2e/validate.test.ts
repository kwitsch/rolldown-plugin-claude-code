import { expect, it } from "vitest";
import { fixturePlugin, validatePlugin } from "./claude.js";

it.each(["mod-only", "script-only", "mod-and-script"])("%s passes validate --strict", (name) => {
  const { status, report } = validatePlugin(fixturePlugin(name));
  expect(status, JSON.stringify(report.manifest, null, 2)).toBe(0);
});
