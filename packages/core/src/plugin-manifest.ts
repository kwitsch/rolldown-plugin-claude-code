export interface PluginAuthor {
  readonly name: string;
  readonly email?: string;
  readonly url?: string;
}

export interface PluginDependency {
  readonly name: string;
  readonly version?: string;
  readonly marketplace?: string;
}

type Paths = string | readonly string[];
type Inline = Readonly<Record<string, unknown>>;
type PathsOrInline = string | Inline | readonly (string | Inline)[];

export interface PluginManifest {
  // Metadata
  readonly $schema?: string;
  readonly name: string;
  readonly displayName?: string;
  readonly version?: string;
  readonly description?: string;
  readonly author?: PluginAuthor;
  readonly homepage?: string;
  readonly repository?: string;
  readonly license?: string;
  readonly keywords?: readonly string[];
  readonly metadata?: Inline;

  // Directory listing
  readonly icon?: string;
  readonly documentationUrl?: string;
  readonly supportUrl?: string;
  readonly privacyPolicyUrl?: string;
  readonly termsOfServiceUrl?: string;

  // Behaviour
  readonly defaultEnabled?: boolean;
  readonly engines?: { readonly "claude-code"?: string };
  readonly dependencies?: readonly (string | PluginDependency)[];
  readonly network?: { readonly hosts?: readonly string[] };
  readonly userConfig?: Inline;
  readonly types?: string;
  readonly channels?: readonly Inline[];

  // Components
  readonly skills?: Paths;
  readonly commands?: Paths | Inline;
  readonly agents?: Paths;
  readonly hooks?: PathsOrInline;
  readonly mcpServers?: PathsOrInline;
  readonly lspServers?: PathsOrInline;
  readonly outputStyles?: Paths;
  readonly experimental?: Inline;
}
