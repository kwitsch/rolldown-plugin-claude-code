#!/usr/bin/env node
import { parseArgs } from "node:util";
import { checkModPath } from "./check-mod.js";
import { messageOf } from "./hook-types.js";

const USAGE = "usage: claude-code-check-mod <path>";

// undefined = unknown option or not exactly one positional.
function parse(): string | undefined {
  try {
    const { positionals } = parseArgs({ options: {}, allowPositionals: true });
    return positionals.length === 1 ? positionals[0] : undefined;
  } catch {
    return undefined;
  }
}

const path = parse();
if (path === undefined) {
  console.error(USAGE);
  process.exitCode = 1;
} else {
  try {
    const result = await checkModPath(path);
    for (const line of result.lines) {
      if (result.code === 0) console.log(line);
      else console.error(line);
    }
    process.exitCode = result.code;
  } catch (error) {
    console.error(`error: ${messageOf(error)}`);
    process.exitCode = 1;
  }
}
