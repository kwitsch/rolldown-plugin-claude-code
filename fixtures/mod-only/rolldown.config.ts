import { claudeCode } from "@kwitsch/rolldown-plugin-claude-code";
import { defineConfig } from "rolldown";

export default defineConfig({
  input: { "hooks/register": "src/register.ts" },
  platform: "node",
  plugins: [claudeCode({ hooksTemplate: "hooks.template.json" })],
  output: { dir: "plugin", format: "es", entryFileNames: "[name].js", cleanDir: true },
});
