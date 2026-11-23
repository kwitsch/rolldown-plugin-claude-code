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
  /** Shared bundles: output folder relative to outDir -> bundle source (.ts/.mts) relative to the project root. */
  readonly bundles?: Readonly<Record<string, string>>;
  /** Single files: output path relative to outDir -> source file, absolute or relative to the project root. */
  readonly files?: Readonly<Record<string, string>>;
}
