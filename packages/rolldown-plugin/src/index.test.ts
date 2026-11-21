import { expect, it } from "vitest";

it("loads the package entry", async () => {
  await expect(import("./index.js")).resolves.toBeDefined();
});
