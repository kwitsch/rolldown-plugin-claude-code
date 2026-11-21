export type IssueSeverity = "error" | "warning";

export const ISSUE_CODES = [
  "name-missing",
  "name-invalid",
  "name-reserved",
  "author-invalid",
  "homepage-invalid",
  "repository-invalid",
  "field-unknown",
  "path-invalid",
  "path-missing",
  "template-invalid",
  "entry-conflict",
  "field-type",
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export interface Issue {
  readonly severity: IssueSeverity;
  readonly code: IssueCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly file?: string;
}
