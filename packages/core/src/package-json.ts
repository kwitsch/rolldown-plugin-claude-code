export interface PackageAuthor {
  readonly name?: string;
  readonly email?: string;
  readonly url?: string;
}

export interface PackageRepository {
  readonly type?: string;
  readonly url?: string;
  readonly directory?: string;
}

export interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly author?: string | PackageAuthor;
  readonly homepage?: string;
  readonly repository?: string | PackageRepository;
  readonly license?: string;
  readonly keywords?: readonly string[];
  readonly [key: string]: unknown;
}
