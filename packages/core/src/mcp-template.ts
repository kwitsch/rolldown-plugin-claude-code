import type { BuildEntry } from "./build-entry.js";
import type { Issue } from "./issue.js";
import { notAnObject, rewriteCommand } from "./template-command.js";
import type { IssuePath } from "./validate-manifest.js";
import { isRecord } from "./validate-manifest.js";

export interface McpTemplateResult {
  readonly mcpJson: object | undefined;
  readonly entries: readonly BuildEntry[];
  readonly issues: readonly Issue[];
}

// An object under "mcpServers" is the server list, otherwise the template itself; the output keeps that form.
export function renderMcpTemplate(template: unknown): McpTemplateResult {
  if (!isRecord(template)) {
    return { mcpJson: undefined, entries: [], ...notAnObject(template) };
  }
  const entries: BuildEntry[] = [];
  const issues: Issue[] = [];
  const wrapper = template["mcpServers"];
  const servers = isRecord(wrapper) ? wrapper : template;
  const prefix: IssuePath = isRecord(wrapper) ? ["mcpServers"] : [];
  const rendered = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      isRecord(server) ? rewriteCommand(server, [...prefix, name], "mcp", entries, issues) : server,
    ]),
  );
  return { mcpJson: isRecord(wrapper) ? { ...template, mcpServers: rendered } : rendered, entries, issues };
}
