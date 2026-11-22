import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";

export default await pluginConfig({
  bin: ["src/bin/doctor.ts"],
  skillScripts: { hello: ["src/skills/hello/greet.ts"] },
});
