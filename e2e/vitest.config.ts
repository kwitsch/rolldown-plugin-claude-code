import type { ViteUserConfig } from "vitest/config";
import { defineConfig } from "vitest/config";

// Explicit type: isolatedDeclarations cannot infer a default-export expression.
const config: ViteUserConfig = defineConfig({
  test: { globalSetup: ["./claude.ts"], testTimeout: 60_000 },
});

export default config;
