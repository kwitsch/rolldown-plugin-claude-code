import { expect, it } from "vitest";
import type { HooksTemplateResult, Issue, IssueCode, IssueSeverity } from "./index.js";
import { renderHooksTemplate } from "./index.js";

type IssuePath = readonly (string | number)[];

const issue = (severity: IssueSeverity, code: IssueCode, message: string, path: IssuePath): Issue => ({
  severity,
  code,
  message,
  path,
});

const ROOT = `\${CLAUDE_PLUGIN_ROOT}/hooks`;
const COMMAND: IssuePath = ["hooks", "PreToolUse", 0, "hooks", 0, "command"];
const ARGS: IssuePath = ["hooks", "PreToolUse", 0, "hooks", 0, "args"];

// A template with the given hooks under hooks.PreToolUse[0].hooks.
const preToolUse = (...hooks: object[]): object => ({ hooks: { PreToolUse: [{ matcher: "Bash", hooks }] } });

// JSON.stringify compares key order too.
const expectJson = (result: HooksTemplateResult, expected: object): void => {
  expect(JSON.stringify(result.hooksJson)).toBe(JSON.stringify(expected));
};

const deepFreeze = (value: unknown): void => {
  if (typeof value !== "object" || value === null) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
};

const example = (): object => ({
  description: "Graphmind helper hooks",
  mod: "./register.ts",
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./pre-tool.ts", timeout: 30 }] }],
    PostToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "echo done" }] }],
  },
});

it("renders the example template", () => {
  const result = renderHooksTemplate(example());
  expectJson(result, {
    description: "Graphmind helper hooks",
    modules: ["./register.js"],
    hooks: {
      PreToolUse: [{
        matcher: "Bash",
        hooks: [{ type: "command", command: "node", args: [`${ROOT}/pre-tool.mjs`], timeout: 30 }],
      }],
      PostToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "echo done" }] }],
    },
  });
  expect(result.entries).toEqual([
    { kind: "mod", source: "register.ts", output: "hooks/register.js" },
    { kind: "script", source: "pre-tool.ts", output: "hooks/pre-tool.mjs" },
  ]);
  expect(result.issues).toEqual([]);
});

it("renders a template with only mod", () => {
  const result = renderHooksTemplate({ mod: "./register.ts" });
  expect(result.hooksJson).toEqual({ modules: ["./register.js"] });
  expect(result.entries).toEqual([{ kind: "mod", source: "register.ts", output: "hooks/register.js" }]);
  expect(result.issues).toEqual([]);
});

it("renders a template with only scripts and no modules key", () => {
  const result = renderHooksTemplate(preToolUse({ type: "command", command: "./pre-tool.ts" }));
  expect(Object.keys(result.hooksJson ?? {})).toEqual(["hooks"]);
  expect(result.entries).toEqual([{ kind: "script", source: "pre-tool.ts", output: "hooks/pre-tool.mjs" }]);
  expect(result.issues).toEqual([]);
});

it("leaves a template with only shell commands unchanged", () => {
  const template = {
    description: "shell only",
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo start" }] }],
      PostToolUse: [{ hooks: [{ type: "command", command: "node x.js", timeout: 5 }] }],
    },
  };
  const result = renderHooksTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([]);
});

it.each([42, "", "/abs/register.ts", "./register.js"])("reports invalid mod %j", (mod) => {
  const result = renderHooksTemplate({ mod, hooks: {} });
  expectJson(result, { hooks: {} });
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    issue(
      "error",
      "template-invalid",
      `mod ${JSON.stringify(mod)}: must be a relative path to a .ts, .mts or .tsx file`,
      ["mod"],
    ),
  ]);
});

it("drops modules from the template and reports it", () => {
  const modulesIssue = issue(
    "error",
    "template-invalid",
    `modules ["./other.js"]: is generated from "mod"; remove it`,
    ["modules"],
  );
  const alone = renderHooksTemplate({ modules: ["./other.js"] });
  expect(alone.hooksJson).toEqual({});
  expect(alone.entries).toEqual([]);
  expect(alone.issues).toEqual([modulesIssue]);

  const withMod = renderHooksTemplate({ modules: ["./other.js"], mod: "./register.ts" });
  expect(withMod.hooksJson).toEqual({ modules: ["./register.js"] });
  expect(withMod.entries).toEqual([{ kind: "mod", source: "register.ts", output: "hooks/register.js" }]);
  expect(withMod.issues).toEqual([modulesIssue]);
});

it("accepts .mts and .tsx for mod and .mts for command", () => {
  const mts = renderHooksTemplate({ mod: "./register.mts" });
  expect(mts.hooksJson).toEqual({ modules: ["./register.js"] });
  expect(mts.entries).toEqual([{ kind: "mod", source: "register.mts", output: "hooks/register.js" }]);

  const tsx = renderHooksTemplate({ mod: "./view.tsx" });
  expect(tsx.hooksJson).toEqual({ modules: ["./view.js"] });
  expect(tsx.entries).toEqual([{ kind: "mod", source: "view.tsx", output: "hooks/view.js" }]);

  const command = renderHooksTemplate(preToolUse({ type: "command", command: "./x.mts" }));
  expectJson(command, preToolUse({ type: "command", command: "node", args: [`${ROOT}/x.mjs`] }));
  expect(command.entries).toEqual([{ kind: "script", source: "x.mts", output: "hooks/x.mjs" }]);
  expect(command.issues).toEqual([]);
});

it.each([
  ["./x.ts", "x.ts"],
  ["x.ts", "x.ts"],
  ["../src/x.ts", "../src/x.ts"],
])("rewrites the relative command %j", (command, source) => {
  const result = renderHooksTemplate(preToolUse({ type: "command", command }));
  expectJson(result, preToolUse({ type: "command", command: "node", args: [`${ROOT}/x.mjs`] }));
  expect(result.entries).toEqual([{ kind: "script", source, output: "hooks/x.mjs" }]);
  expect(result.issues).toEqual([]);
});

it("reports a TypeScript command with arguments in the string", () => {
  const template = preToolUse({ type: "command", command: "./pre-tool.ts --fix" });
  const result = renderHooksTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    issue(
      "error",
      "template-invalid",
      `hooks.PreToolUse[0].hooks[0].command "./pre-tool.ts --fix": move arguments to "args"`,
      COMMAND,
    ),
  ]);
});

it.each(["/abs/x.ts", "~/x.ts", "$HOME/x.ts", "C:/x.ts", "\\x.ts"])("reports the absolute command %j", (command) => {
  const template = preToolUse({ type: "command", command });
  const result = renderHooksTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    issue(
      "error",
      "template-invalid",
      `hooks.PreToolUse[0].hooks[0].command ${JSON.stringify(command)}: must be a path relative to the template file`,
      COMMAND,
    ),
  ]);
});

it.each(["echo done", "node x.js", "./x.tsx", " ./x.ts"])("leaves the other command %j unchanged", (command) => {
  const template = preToolUse({ type: "command", command });
  const result = renderHooksTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([]);
});

it("names the output after the file name without directory and last extension", () => {
  const result = renderHooksTemplate(preToolUse({ type: "command", command: "../src/pre-tool.hook.ts" }));
  expectJson(result, preToolUse({ type: "command", command: "node", args: [`${ROOT}/pre-tool.hook.mjs`] }));
  expect(result.entries).toEqual([
    { kind: "script", source: "../src/pre-tool.hook.ts", output: "hooks/pre-tool.hook.mjs" },
  ]);
});

it("inserts args after command or prepends the path to existing args in place", () => {
  const missing = renderHooksTemplate(preToolUse({ type: "command", command: "./x.ts", timeout: 5 }));
  expectJson(missing, preToolUse({ type: "command", command: "node", args: [`${ROOT}/x.mjs`], timeout: 5 }));

  const present = renderHooksTemplate(
    preToolUse({ type: "command", command: "./x.ts", timeout: 5, args: ["--fix", "-v"] }),
  );
  expectJson(
    present,
    preToolUse({ type: "command", command: "node", timeout: 5, args: [`${ROOT}/x.mjs`, "--fix", "-v"] }),
  );
  expect(present.entries).toEqual([{ kind: "script", source: "x.ts", output: "hooks/x.mjs" }]);
  expect(present.issues).toEqual([]);
});

it.each([
  ["--fix", `"--fix"`],
  [[1], "[1]"],
])("reports args %j that is not an array of strings", (args, shown) => {
  const template = preToolUse({ type: "command", command: "./x.ts", args });
  const result = renderHooksTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    issue(
      "error",
      "template-invalid",
      `hooks.PreToolUse[0].hooks[0].args ${shown}: must be an array of strings`,
      ARGS,
    ),
  ]);
});

it("keeps timeout, async and shell", () => {
  const result = renderHooksTemplate(
    preToolUse({ type: "command", command: "./x.ts", timeout: 30, async: true, shell: "bash" }),
  );
  expectJson(
    result,
    preToolUse({ type: "command", command: "node", args: [`${ROOT}/x.mjs`], timeout: 30, async: true, shell: "bash" }),
  );
});

it("leaves hooks without type command unchanged", () => {
  const template = preToolUse({ type: "prompt", command: "./x.ts" }, { command: "./x.ts" });
  const result = renderHooksTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([]);
});

it("builds one entry for the same source used in two events", () => {
  const result = renderHooksTemplate({
    hooks: {
      PreToolUse: [{ hooks: [{ type: "command", command: "./x.ts" }] }],
      PostToolUse: [{ hooks: [{ type: "command", command: "x.ts" }] }],
    },
  });
  expectJson(result, {
    hooks: {
      PreToolUse: [{ hooks: [{ type: "command", command: "node", args: [`${ROOT}/x.mjs`] }] }],
      PostToolUse: [{ hooks: [{ type: "command", command: "node", args: [`${ROOT}/x.mjs`] }] }],
    },
  });
  expect(result.entries).toEqual([{ kind: "script", source: "x.ts", output: "hooks/x.mjs" }]);
  expect(result.issues).toEqual([]);
});

it("reports two sources with the same output name", () => {
  const result = renderHooksTemplate(
    preToolUse({ type: "command", command: "a/check.ts" }, { type: "command", command: "b/check.ts" }),
  );
  expectJson(
    result,
    preToolUse(
      { type: "command", command: "node", args: [`${ROOT}/check.mjs`] },
      { type: "command", command: "b/check.ts" },
    ),
  );
  expect(result.entries).toEqual([{ kind: "script", source: "a/check.ts", output: "hooks/check.mjs" }]);
  expect(result.issues).toEqual([
    issue(
      "error",
      "entry-conflict",
      `hooks.PreToolUse[0].hooks[1].command "b/check.ts": hooks/check.mjs is already built from "a/check.ts"`,
      ["hooks", "PreToolUse", 0, "hooks", 1, "command"],
    ),
  ]);
});

it("reports the same source as mod and script", () => {
  const result = renderHooksTemplate({
    mod: "./register.ts",
    ...preToolUse({ type: "command", command: "register.ts" }),
  });
  expectJson(result, { modules: ["./register.js"], ...preToolUse({ type: "command", command: "register.ts" }) });
  expect(result.entries).toEqual([{ kind: "mod", source: "register.ts", output: "hooks/register.js" }]);
  expect(result.issues).toEqual([
    issue(
      "error",
      "entry-conflict",
      `hooks.PreToolUse[0].hooks[0].command "register.ts": "register.ts" is already the mod`,
      COMMAND,
    ),
  ]);
});

it("allows a mod and a script with the same name from different sources", () => {
  const result = renderHooksTemplate({
    mod: "./x.ts",
    ...preToolUse({ type: "command", command: "./scripts/x.ts" }),
  });
  expect(result.entries).toEqual([
    { kind: "mod", source: "x.ts", output: "hooks/x.js" },
    { kind: "script", source: "scripts/x.ts", output: "hooks/x.mjs" },
  ]);
  expect(result.issues).toEqual([]);
});

it("keeps template key order, puts the mod entry first and orders issues", () => {
  const keys = renderHooksTemplate({ description: "d", mod: "./m.ts", hooks: {}, extra: 1 });
  expect(Object.keys(keys.hooksJson ?? {})).toEqual(["description", "modules", "hooks", "extra"]);

  const entries = renderHooksTemplate({ ...preToolUse({ type: "command", command: "./s.ts" }), mod: "./m.ts" });
  expect(entries.entries).toEqual([
    { kind: "mod", source: "m.ts", output: "hooks/m.js" },
    { kind: "script", source: "s.ts", output: "hooks/s.mjs" },
  ]);

  const issues = renderHooksTemplate({
    ...preToolUse({ type: "command", command: "/abs/x.ts" }),
    modules: [],
    mod: 1,
  });
  expect(issues.issues.map(({ path }) => path)).toEqual([["modules"], ["mod"], COMMAND]);
});

it("reports every invalid command and rewrites the valid one", () => {
  const result = renderHooksTemplate(
    preToolUse(
      { type: "command", command: "./a.ts --fix" },
      { type: "command", command: "/abs/b.ts" },
      { type: "command", command: "./c.ts" },
    ),
  );
  expectJson(
    result,
    preToolUse(
      { type: "command", command: "./a.ts --fix" },
      { type: "command", command: "/abs/b.ts" },
      { type: "command", command: "node", args: [`${ROOT}/c.mjs`] },
    ),
  );
  expect(result.entries).toEqual([{ kind: "script", source: "c.ts", output: "hooks/c.mjs" }]);
  expect(result.issues).toEqual([
    issue(
      "error",
      "template-invalid",
      `hooks.PreToolUse[0].hooks[0].command "./a.ts --fix": move arguments to "args"`,
      COMMAND,
    ),
    issue(
      "error",
      "template-invalid",
      `hooks.PreToolUse[0].hooks[1].command "/abs/b.ts": must be a path relative to the template file`,
      ["hooks", "PreToolUse", 0, "hooks", 1, "command"],
    ),
  ]);
});

it("reports the command string and args of one hook separately", () => {
  const template = preToolUse({ type: "command", command: "/abs/x.ts", args: "x" });
  const result = renderHooksTemplate(template);
  expectJson(result, template);
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    issue(
      "error",
      "template-invalid",
      `hooks.PreToolUse[0].hooks[0].command "/abs/x.ts": must be a path relative to the template file`,
      COMMAND,
    ),
    issue("error", "template-invalid", `hooks.PreToolUse[0].hooks[0].args "x": must be an array of strings`, ARGS),
  ]);
});

it.each([null, [], "x"])("reports the non-object template %j", (template) => {
  const result = renderHooksTemplate(template);
  expect(result.hooksJson).toBeUndefined();
  expect(result.entries).toEqual([]);
  expect(result.issues).toEqual([
    { severity: "error", code: "template-invalid", message: `template ${JSON.stringify(template)}: must be an object` },
  ]);
});

it("does not mutate a frozen template", () => {
  const template = example();
  deepFreeze(template);
  const result = renderHooksTemplate(template);
  expect(template).toEqual(example());
  expect(result.hooksJson).not.toBe(template);
  expect(result.issues).toEqual([]);
});

it.each([
  ["src/hook-types.ts", "src/hook-types.ts"],
  ["./types/hooks.mts", "types/hooks.mts"],
  ["src/hook-types.d.ts", "src/hook-types.d.ts"],
])("accepts hookTypes %j, returns it normalized and drops it from hooks.json", (value, normalized) => {
  const result = renderHooksTemplate({ hookTypes: value, hooks: {} });
  expect(result.hookTypes).toBe(normalized);
  expect(result.issues).toEqual([]);
  expectJson(result, { hooks: {} });
});

it.each([1, "/abs/types.ts", "src/types.js"])("reports the invalid hookTypes %j and drops it", (value) => {
  const result = renderHooksTemplate({ hookTypes: value, hooks: {} });
  expect(result.hookTypes).toBeUndefined();
  expect(result.issues).toEqual([
    issue(
      "error",
      "template-invalid",
      `hookTypes ${JSON.stringify(value)}: must be a relative path to a .ts, .mts or .d.ts file`,
      ["hookTypes"],
    ),
  ]);
  expectJson(result, { hooks: {} });
});

it("returns hookTypes undefined for a template without it and for a non-object template", () => {
  expect(renderHooksTemplate(example()).hookTypes).toBeUndefined();
  expect(renderHooksTemplate(null).hookTypes).toBeUndefined();
});
