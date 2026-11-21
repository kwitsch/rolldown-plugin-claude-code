import type { PluginManifest } from "./plugin-manifest.js";

export interface PluginConfig {
  readonly hooksTemplate?: string;
  readonly mcpTemplate?: string;
  readonly manifest?: Partial<PluginManifest>;
  readonly assets?: string;
}
