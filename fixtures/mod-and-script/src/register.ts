import { markerContent } from "./shared.js";

export function register(_on: unknown, _options: unknown): void {
  const marker = process.env.FIXTURE_MARKER;
  if (marker) console.error(marker, markerContent("register", ""));
}
