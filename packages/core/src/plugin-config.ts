import type { PluginManifest } from "./plugin-manifest.js";

export interface PluginConfig {
  readonly hooksTemplate?: string;
  readonly manifest?: Partial<PluginManifest>;
}
