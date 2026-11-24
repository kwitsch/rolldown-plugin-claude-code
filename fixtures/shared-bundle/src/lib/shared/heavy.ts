import { basename } from "path";

export function heavy(): string {
  return basename("/lib/heavy");
}
