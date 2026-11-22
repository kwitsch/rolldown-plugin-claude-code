import type { PluginManifest } from "./plugin-manifest.js";

export interface PluginConfig {
  readonly hooksTemplate?: string;
  readonly mcpTemplate?: string;
  readonly manifest?: Partial<PluginManifest>;
  readonly assets?: string;
  readonly scripts?: {
    readonly bin?: readonly string[];
    readonly skills?: Readonly<Record<string, readonly string[]>>;
  };
}
