import { describe, expect, it } from "vitest";
import type { Issue } from "./index.js";
import { checkHookPlaceholders } from "./index.js";

const mcp = (input: unknown, server: unknown = "plugin:server", tool: unknown = "mcp_tool"): object => ({
  type: "mcp_tool",
  server,
  tool,
  input,
});

// A template whose hooks[event][0] has the given matcher (left out when undefined) and hooks.
const template = (event: string, matcher: unknown, ...hooks: unknown[]): object => ({
  hookTypes: "hook-types.d.ts",
  hooks: { [event]: [matcher === undefined ? { hooks } : { matcher, hooks }] },
});

// Issues of one mcp_tool hook with the given input.
const check = (event: string, matcher: unknown, input: unknown): readonly Issue[] =>
  checkHookPlaceholders(template(event, matcher, mcp(input))).issues;

// The warning for ${name} at hooks[event][0].hooks[0].input.<key path>.
const unknown = (position: string, name: string, event: string, ...keys: (string | number)[]): Issue => ({
  severity: "warning",
  code: "hook-placeholder-unknown",
  message: `${position} \${${name}}`,
  path: ["hooks", event, 0, "hooks", 0, "input", ...keys],
});

describe("checkHookPlaceholders", () => {
  it("accepts common fields, event fields and open roots", () => {
    const input = {
      a: "${session_id}",
      b: "${duration_ms}",
      c: "${tool_input.file_path}",
      d: "${tool_response}",
      e: "${tool_response.filePath}",
      f: "${mcp_server.name}",
      g: "${effort.level}",
      h: "${tool_input}",
      i: "${tool_response[0]}",
      j: "${cwd}/${tool_name}",
    };
    expect(check("PostToolUse", undefined, input)).toEqual([]);
  });

  it("reports an unknown placeholder with event, matcher, server:tool and path", () => {
    expect(checkHookPlaceholders(template("PostToolUse", "Edit", mcp({ key: "${abc}" })))).toEqual({
      issues: [unknown("PostToolUse->Edit->plugin:server:mcp_tool", "abc", "PostToolUse", "key")],
    });
  });

  it("drops the matcher segment for events without matcher support and empty matchers", () => {
    expect(check("UserPromptSubmit", "x", { key: "${abc}" })).toEqual([
      unknown("UserPromptSubmit->plugin:server:mcp_tool", "abc", "UserPromptSubmit", "key"),
    ]);
    for (const matcher of [undefined, "", 5]) {
      expect(check("PreToolUse", matcher, { key: "${abc}" })).toEqual([
        unknown("PreToolUse->plugin:server:mcp_tool", "abc", "PreToolUse", "key"),
      ]);
    }
    expect(check("PreToolUse", "*", { key: "${abc}" })).toEqual([
      unknown("PreToolUse->*->plugin:server:mcp_tool", "abc", "PreToolUse", "key"),
    ]);
  });

  it("uses the group and hook index in the path", () => {
    const input = { k: "${abc}" };
    const result = checkHookPlaceholders({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo" }] },
          { hooks: [{ type: "command", command: "echo" }, mcp(input, "s", "t")] },
        ],
      },
    });
    expect(result).toEqual({
      issues: [{
        severity: "warning",
        code: "hook-placeholder-unknown",
        message: "PreToolUse->s:t ${abc}",
        path: ["hooks", "PreToolUse", 1, "hooks", 1, "input", "k"],
      }],
    });
  });

  it("reports fields of other events", () => {
    expect(check("PreToolUse", undefined, { a: "${tool_response}" })).toEqual([
      unknown("PreToolUse->plugin:server:mcp_tool", "tool_response", "PreToolUse", "a"),
    ]);
    expect(check("PostToolUse", undefined, { a: "${prompt}" })).toEqual([
      unknown("PostToolUse->plugin:server:mcp_tool", "prompt", "PostToolUse", "a"),
    ]);
    expect(check("PostToolBatch", undefined, { a: "${tool_name}", b: "${tool_calls[0].tool_name}" })).toEqual([
      unknown("PostToolBatch->plugin:server:mcp_tool", "tool_name", "PostToolBatch", "a"),
    ]);
  });

  it("limits tool_input to Write and Edit fields for an exact Write/Edit matcher", () => {
    expect(check("PreToolUse", "Write|Edit", { a: "${tool_input}", b: "${tool_input.file_path}" })).toEqual([]);
    expect(check("PreToolUse", "Write|Edit", { a: "${tool_input.command}" })).toEqual([
      unknown("PreToolUse->Write|Edit->plugin:server:mcp_tool", "tool_input.command", "PreToolUse", "a"),
    ]);
    expect(check("PostToolUse", "Edit, Write", { a: "${tool_input.old_string}", b: "${tool_input.content}" }))
      .toEqual([]);
    expect(check("PreToolUse", "Write", { a: "${tool_input.old_string}" })).toEqual([
      unknown("PreToolUse->Write->plugin:server:mcp_tool", "tool_input.old_string", "PreToolUse", "a"),
    ]);
  });

  it.each(["mcp__.*", "^Edit$", "*", undefined, "Write|Foo", "Bash", "constructor"])(
    "keeps tool_input open for the matcher %s",
    (matcher) => {
      expect(check("PreToolUse", matcher, { a: "${tool_input.anything}" })).toEqual([]);
    },
  );

  it("never narrows on events that are not tool events", () => {
    expect(check("PreSkillShellCommand", "Bash", { a: "${tool_input.anything}" })).toEqual([]);
  });

  it("scans nested values in order and ignores non-strings", () => {
    const input = { a: { b: ["${x}"] }, c: "${y}-${z}", n: 1, t: true, z: null };
    expect(check("PreToolUse", undefined, input)).toEqual([
      unknown("PreToolUse->plugin:server:mcp_tool", "x", "PreToolUse", "a", "b", 0),
      unknown("PreToolUse->plugin:server:mcp_tool", "y", "PreToolUse", "c"),
      unknown("PreToolUse->plugin:server:mcp_tool", "z", "PreToolUse", "c"),
    ]);
  });

  it("reports empty, padded and plugin variables verbatim and ignores unclosed ones", () => {
    const input = {
      a: "${}",
      b: "${CLAUDE_PLUGIN_ROOT}",
      c: "${user_config.token}",
      d: "${abc",
      e: "${ tool_name }",
    };
    expect(check("PreToolUse", undefined, input)).toEqual([
      unknown("PreToolUse->plugin:server:mcp_tool", "", "PreToolUse", "a"),
      unknown("PreToolUse->plugin:server:mcp_tool", "CLAUDE_PLUGIN_ROOT", "PreToolUse", "b"),
      unknown("PreToolUse->plugin:server:mcp_tool", "user_config.token", "PreToolUse", "c"),
      unknown("PreToolUse->plugin:server:mcp_tool", " tool_name ", "PreToolUse", "e"),
    ]);
  });

  it("skips unknown events, other hook types, invalid mcp_tool hooks and malformed shapes", () => {
    const bad = { k: "${abc}" };
    expect(check("NotAnEvent", undefined, bad)).toEqual([]);
    expect(check("constructor", undefined, bad)).toEqual([]);
    expect(checkHookPlaceholders(template("PreToolUse", undefined, { type: "command", command: "${abc}" })))
      .toEqual({ issues: [] });
    expect(checkHookPlaceholders(template("PreToolUse", undefined, mcp(bad, 5)))).toEqual({ issues: [] });
    expect(checkHookPlaceholders(template("PreToolUse", undefined, mcp(bad, "s", "")))).toEqual({ issues: [] });
    expect(checkHookPlaceholders(template("PreToolUse", undefined, mcp("${abc}")))).toEqual({ issues: [] });
    expect(checkHookPlaceholders({ hooks: { PreToolUse: ["x", null, { hooks: "x" }] } })).toEqual({ issues: [] });
    expect(checkHookPlaceholders({ hooks: { PreToolUse: "x" } })).toEqual({ issues: [] });
    expect(checkHookPlaceholders({ hooks: "x" })).toEqual({ issues: [] });
    for (const value of [null, [], "x", 1]) expect(checkHookPlaceholders(value)).toEqual({ issues: [] });
  });
});
