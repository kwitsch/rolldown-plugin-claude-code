import { expect, it } from "vitest";
import type { Issue, IssueCode, McpTemplateResult } from "./index.js";
import { renderMcpTemplate } from "./index.js";

type IssuePath = readonly (string | number)[];

const issue = (code: IssueCode, message: string, path: IssuePath): Issue => ({
  severity: "error",
  code,
  message,
  path,
});

const ROOT = `\${CLAUDE_PLUGIN_ROOT}/mcp`;

// JSON.stringify compares key order too.
const expectJson = (result: McpTemplateResult, expected: unknown): void => {
  expect(JSON.stringify(result.mcpJson)).toBe(JSON.stringify(expected));
};

const deepFreeze = (value: unknown): void => {
  if (typeof value !== "object" || value === null) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
};

const wrap = (servers: object): object => ({ mcpServers: servers });

const example = (): object => ({
  mcpServers: {
    db: {
      command: "./src/server.ts",
      args: ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      env: { DB_URL: "${DB_URL}" },
    },
    docs: { type: "http", url: "https://example.com/mcp" },
  },
});

it("renders the example template", () => {
  const result = renderMcpTemplate(example());
  expectJson(result, {
    mcpServers: {
      db: {
        command: "node",
        args: [`${ROOT}/server.mjs`, "--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
        env: { DB_URL: "${DB_URL}" },
      },
      docs: { type: "http", url: "https://example.com/mcp" },
    },
  });
  expect(result.entries).toEqual([{ kind: "script", source: "src/server.ts", output: "mcp/server.mjs" }]);
  expect(result.issues).toEqual([]);
});

it("renders the form without the mcpServers wrapper", () => {
  const result = renderMcpTemplate({ db: { command: "./src/server.ts" }, docs: { type: "sse", url: "https://x" } });
  expectJson(result, {
    db: { command: "node", args: [`${ROOT}/server.mjs`] },
    docs: { type: "sse", url: "https://x" },
  });
  expect(result.entries).toEqual([{ kind: "script", source: "src/server.ts", output: "mcp/server.mjs" }]);
  expect(result.issues).toEqual([]);
});

it("leaves a template with only http servers unchanged", () => {
  const template = wrap({
    docs: { type: "http", url: "https://example.com/mcp", headers: { A: "b" } },
    more: { type: "http", url: "https://example.com/more" },
  });
  const result = renderMcpTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([]);
});

it.each(["npx", "node x.js", "./x.tsx"])("leaves the other command %j unchanged", (command) => {
  const template = wrap({ s: { command, args: ["-y"] } });
  const result = renderMcpTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([]);
});

it("inserts args after command or prepends the path to existing args in place", () => {
  const missing = renderMcpTemplate(wrap({ s: { command: "./x.ts", env: { A: "1" } } }));
  expectJson(missing, wrap({ s: { command: "node", args: [`${ROOT}/x.mjs`], env: { A: "1" } } }));
  expect(missing.issues).toEqual([]);

  const present = renderMcpTemplate(wrap({ s: { command: "./x.ts", env: { A: "1" }, args: ["--fix", "-v"] } }));
  expectJson(present, wrap({ s: { command: "node", env: { A: "1" }, args: [`${ROOT}/x.mjs`, "--fix", "-v"] } }));
  expect(present.entries).toEqual([{ kind: "script", source: "x.ts", output: "mcp/x.mjs" }]);
  expect(present.issues).toEqual([]);
});

it("reports a TypeScript command with arguments in the string", () => {
  const template = wrap({ s: { command: "./x.ts --fix" } });
  const result = renderMcpTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    issue("template-invalid", `mcpServers.s.command "./x.ts --fix": move arguments to "args"`, [
      "mcpServers",
      "s",
      "command",
    ]),
  ]);
});

it("reports an absolute TypeScript command", () => {
  const template = wrap({ s: { command: "/abs/x.ts" } });
  const result = renderMcpTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    issue("template-invalid", `mcpServers.s.command "/abs/x.ts": must be a path relative to the template file`, [
      "mcpServers",
      "s",
      "command",
    ]),
  ]);
});

it("reports args that are not an array of strings", () => {
  const template = wrap({ s: { command: "./x.ts", args: [1] } });
  const result = renderMcpTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    issue("template-invalid", `mcpServers.s.args [1]: must be an array of strings`, ["mcpServers", "s", "args"]),
  ]);
});

it("reports two sources with the same name as entry-conflict", () => {
  const result = renderMcpTemplate(wrap({ a: { command: "./a/server.ts" }, b: { command: "./b/server.ts" } }));
  expectJson(result, wrap({ a: { command: "node", args: [`${ROOT}/server.mjs`] }, b: { command: "./b/server.ts" } }));
  expect(result.entries).toEqual([{ kind: "script", source: "a/server.ts", output: "mcp/server.mjs" }]);
  expect(result.issues).toEqual([
    issue(
      "entry-conflict",
      `mcpServers.b.command "./b/server.ts": mcp/server.mjs is already built from "a/server.ts"`,
      [
        "mcpServers",
        "b",
        "command",
      ],
    ),
  ]);
});

it("builds one entry for the same source in two servers", () => {
  const result = renderMcpTemplate(wrap({ a: { command: "./server.ts" }, b: { command: "server.ts" } }));
  expectJson(
    result,
    wrap({
      a: { command: "node", args: [`${ROOT}/server.mjs`] },
      b: { command: "node", args: [`${ROOT}/server.mjs`] },
    }),
  );
  expect(result.entries).toEqual([{ kind: "script", source: "server.ts", output: "mcp/server.mjs" }]);
  expect(result.issues).toEqual([]);
});

it.each([null, [], "x"])("reports the non-object template %j", (template) => {
  const result = renderMcpTemplate(template);
  expect(result.mcpJson).toBeUndefined();
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([{
    severity: "error",
    code: "template-invalid",
    message: `template ${JSON.stringify(template)}: must be an object`,
  }]);
});

it("never writes a frozen template", () => {
  for (const template of [example(), { db: { command: "./src/server.ts", args: ["-v"] } }]) {
    deepFreeze(template);
    const before = JSON.stringify(template);
    expect(() => renderMcpTemplate(template)).not.toThrow();
    expect(JSON.stringify(template)).toBe(before);
  }
});
