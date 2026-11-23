import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";

export default await pluginConfig({
  scripts: { bin: ["src/bin/one.ts", "src/bin/two.ts"] },
  bundles: { "lib/shared": "src/lib/shared/index.ts" },
  files: { "lib/shared/greeting.txt": "data/greeting.txt" },
});
