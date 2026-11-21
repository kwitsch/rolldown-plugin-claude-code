export interface BuildEntry {
  readonly kind: "mod" | "script";
  readonly source: string;
  readonly output: string;
}
