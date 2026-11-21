import type { PluginManifest } from "./plugin-manifest.js";

export interface PluginConfig {
  readonly mod?: string;
  readonly scripts?: readonly string[];
  readonly hooksTemplate?: string;
  readonly manifest?: Partial<PluginManifest>;
}
