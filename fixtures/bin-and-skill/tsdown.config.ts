import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";

export default await pluginConfig({
  scripts: { bin: ["src/bin/doctor.ts"], skills: { hello: ["src/skills/hello/greet.ts"] } },
});
