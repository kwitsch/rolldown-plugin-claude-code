import type { IssuePath } from "./validate-manifest.js";

// Declaration order of the path fields in PluginManifest.
const PATH_FIELDS = [
  "types",
  "skills",
  "commands",
  "agents",
  "hooks",
  "mcpServers",
  "lspServers",
  "outputStyles",
] as const;

export type PathField = (typeof PATH_FIELDS)[number];

export interface ManifestPath {
  readonly field: PathField;
  // JSON path: [field], [field, index] or ["commands", name, "source"]
  readonly path: IssuePath;
  readonly value: string;
}

// Every path string of a manifest; inline objects and https:// URLs in mcpServers are skipped. Never throws.
export function manifestPaths(manifest: object): readonly ManifestPath[] {
  const fields = new Map<string, unknown>(Object.entries(manifest));
  const paths: ManifestPath[] = [];
  for (const field of PATH_FIELDS) {
    const value = fields.get(field);
    if (typeof value === "string") {
      paths.push({ field, path: [field], value });
    } else if (Array.isArray(value)) {
      // Inline objects in arrays are not searched; the original index is kept.
      for (const [index, item] of value.entries()) {
        if (typeof item === "string") paths.push({ field, path: [field, index], value: item });
      }
    } else if (field === "commands" && typeof value === "object" && value !== null) {
      for (const [name, entry] of Object.entries(value)) {
        if (typeof entry === "object" && entry !== null && "source" in entry && typeof entry.source === "string") {
          paths.push({ field, path: [field, name, "source"], value: entry.source });
        }
      }
    }
  }
  return paths.filter(({ field, value }) => !(field === "mcpServers" && value.startsWith("https://")));
}
