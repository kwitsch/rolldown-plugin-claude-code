import { readFileSync } from "node:fs";

// Read next to the built bundle entry, where the files option puts greeting.txt.
export function greeting(): string {
  return readFileSync(new URL("./greeting.txt", import.meta.url), "utf8").trim();
}

export async function loadHeavy(): Promise<string> {
  return (await import("./heavy.js")).heavy();
}
