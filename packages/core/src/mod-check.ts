import { ImportType, initSync, parse } from "es-module-lexer";
import type { Issue } from "./issue.js";

export interface ModCheckResult {
  readonly issues: readonly Issue[];
}

const ALLOWED = "a mod may import only relative paths and \"claude-code\"";

// Initialised once at load; the WASM lexer needs no file system access.
initSync();

/** A relative import specifier: starts with "./" or "../". */
export const isRelativeSpecifier = (id: string): boolean => id.startsWith("./") || id.startsWith("../");

// Claude Code loads a hooks module only with relative imports and "claude-code" (it rejects even node:*).
export function checkMod(code: string, file: string): ModCheckResult {
  // Set: each distinct message once, in first-seen order.
  const messages = new Set<string>();
  const result = (): ModCheckResult => ({
    issues: [...messages].map((message): Issue => ({ severity: "error", code: "mod-invalid", file, message })),
  });
  if (!file.endsWith(".js")) messages.add("file name must end in \".js\"");
  if (code.startsWith("#!")) messages.add("a mod must not start with a shebang");
  // The shebang is reported above; blank it (same length) so the lexer never trips over it.
  const source = code.replace(/^#![^\n]*/, (line) => " ".repeat(line.length));
  let imports: ReturnType<typeof parse>[0];
  let exports: ReturnType<typeof parse>[1];
  try {
    [imports, exports] = parse(source);
  } catch (error) {
    messages.add(`cannot be read as an ES module: ${error instanceof Error ? error.message : String(error)}`);
    return result();
  }
  for (const { t, n } of imports) {
    if (t === ImportType.ImportMeta) continue;
    if (n === undefined) messages.add(`dynamic import with a computed specifier; ${ALLOWED}`);
    else if (n !== "claude-code" && !isRelativeSpecifier(n)) {
      messages.add(`import "${n}" is not allowed; ${ALLOWED}`);
    }
  }
  // shortcut: an `export * from` may supply register and is not followed here, so it skips the rule; upgrade by resolving the target.
  const reExportsAll = imports.some(({ ss, se }) => /^export\s*\*/.test(source.slice(ss, se)));
  if (!reExportsAll && !exports.some(({ n }) => n === "register")) {
    messages.add("no export named register (export function register(on, options) {...})");
  }
  return result();
}
