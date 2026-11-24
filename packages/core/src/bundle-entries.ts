import { posix } from "node:path";
import type { BuildEntry } from "./build-entry.js";
import type { Issue } from "./issue.js";
import { isScriptSource } from "./script-entries.js";
import { invalid, isAbsolute } from "./template-command.js";
import { isRecord, show } from "./validate-manifest.js";

export interface FileCopy {
  readonly source: string;
  readonly output: string;
}

export interface BundleEntriesResult {
  readonly entries: readonly BuildEntry[];
  readonly files: readonly FileCopy[];
  readonly issues: readonly Issue[];
}

// Empty, absolute, with a backslash (posix.normalize would keep it in a name) or with a ".." segment.
const badPath = (path: string): boolean =>
  path === "" || isAbsolute(path) || path.includes("\\") || path.split("/").includes("..");

// bundles -> <folder>/index.mjs, files -> single copies to fixed outputs; pure: no fs, no mutation, no throw.
export function bundleEntries(config: { readonly bundles?: unknown; readonly files?: unknown }): BundleEntriesResult {
  const entries: BuildEntry[] = [];
  const files: FileCopy[] = [];
  const issues: Issue[] = [];
  // Accepted bundle folders, posix-normalized without a trailing "/".
  const dirs: string[] = [];

  const { bundles, files: copies } = config;
  if (isRecord(bundles)) {
    for (const [folder, source] of Object.entries(bundles)) {
      const path = ["bundles", folder];
      if (typeof source !== "string") {
        issues.push(invalid(path, source, "must be a string", "field-type"));
        continue;
      }
      const dir = posix.normalize(folder).replace(/\/$/, "");
      if (badPath(folder) || dir === ".") {
        issues.push(invalid(path, folder, "must be a relative folder without \"..\"", "path-invalid"));
        continue;
      }
      if (!isScriptSource(source)) {
        issues.push(invalid(path, source, "must be a relative path to a .ts or .mts file", "path-invalid"));
        continue;
      }
      const overlap = dirs.find((other) => other === dir || other.startsWith(`${dir}/`) || dir.startsWith(`${other}/`));
      if (overlap !== undefined) {
        issues.push(invalid(path, source, `${dir} overlaps bundle folder ${show(overlap)}`, "entry-conflict"));
        continue;
      }
      dirs.push(dir);
      entries.push({ kind: "bundle", source: posix.normalize(source), output: `${dir}/index.mjs` });
    }
  } else if (bundles !== undefined) {
    issues.push(invalid(["bundles"], bundles, "must be an object", "field-type"));
  }

  if (isRecord(copies)) {
    for (const [target, source] of Object.entries(copies)) {
      const path = ["files", target];
      if (typeof source !== "string") {
        issues.push(invalid(path, source, "must be a string", "field-type"));
        continue;
      }
      const output = posix.normalize(target);
      if (badPath(target) || output === "." || output.endsWith("/")) {
        issues.push(invalid(path, target, "must be a relative path without \"..\"", "path-invalid"));
        continue;
      }
      // A target that is a bundle folder or one of its parents would collide with the folder itself.
      const clash = dirs.find((other) => other === output || other.startsWith(`${output}/`));
      if (clash !== undefined) {
        issues.push(invalid(path, source, `${output} collides with bundle folder ${show(clash)}`, "entry-conflict"));
        continue;
      }
      const dir = output.endsWith(".mjs") ? dirs.find((other) => output.startsWith(`${other}/`)) : undefined;
      if (dir !== undefined) {
        issues.push(
          invalid(
            path,
            source,
            `${output} lies in bundle folder ${show(dir)}; chunk names are not known before the build`,
            "entry-conflict",
          ),
        );
        continue;
      }
      // The source stays as given (may be absolute); existence is checked by the plugin.
      files.push({ source, output });
    }
  } else if (copies !== undefined) {
    issues.push(invalid(["files"], copies, "must be an object", "field-type"));
  }

  return { entries, files, issues };
}
