export interface BuildEntry {
  readonly kind: "mod" | "script" | "bundle";
  readonly source: string;
  readonly output: string;
}
