import type { PluginManifest } from "./plugin-manifest.js";

export interface PluginConfig {
  readonly hooksTemplate?: string;
  readonly mcpTemplate?: string;
  readonly manifest?: Partial<PluginManifest>;
  readonly assets?: string;
  readonly bin?: readonly string[];
  readonly skillScripts?: Readonly<Record<string, readonly string[]>>;
}
