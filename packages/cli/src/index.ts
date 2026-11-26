#!/usr/bin/env node
import { parseArgs } from "node:util";
import { hookTypes } from "./hook-types.js";

const USAGE = "usage: claude-code-hook-types [--check] [--strict] [template]";

// undefined = unknown option or more than one positional.
function parse(): { readonly check: boolean; readonly strict: boolean; readonly template: string } | undefined {
  try {
    const { values, positionals } = parseArgs({
      options: { check: { type: "boolean" }, strict: { type: "boolean" } },
      allowPositionals: true,
    });
    if (positionals.length > 1) return undefined;
    return {
      check: values.check === true,
      strict: values.strict === true,
      template: positionals[0] ?? "hooks.template.json",
    };
  } catch {
    return undefined;
  }
}

const args = parse();
if (args === undefined) {
  console.error(USAGE);
  process.exitCode = 1;
} else {
  try {
    const result = await hookTypes(args.template, args.check, args.strict);
    for (const line of result.lines) {
      if (result.code === 0) console.log(line);
      else console.error(line);
    }
    process.exitCode = result.code;
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
