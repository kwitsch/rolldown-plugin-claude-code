import { mcpToolHooks } from "./hook-input-types.js";
import type { Issue } from "./issue.js";
import type { IssuePath } from "./validate-manifest.js";
import { isRecord } from "./validate-manifest.js";

export interface HookPlaceholdersResult {
  readonly issues: readonly Issue[];
}

// Fields of each event's hook input, from https://code.claude.com/docs/en/hooks.md ("<Event> input" sections), fetched 2026-11-26.
// "x.*" is an open root (object, array or tool-dependent field): it accepts x and x.<anything>.
const COMMON: readonly string[] = [
  "session_id",
  "prompt_id",
  "transcript_path",
  "cwd",
  "scratchpad_dir",
  "permission_mode",
  "hook_event_name",
  "agent_id",
  "agent_type",
  "effort.*",
];
const TOOL: readonly string[] = ["tool_name", "tool_input.*", "mcp_server.*"];
const MODEL_SWITCH: readonly string[] = [
  "from_model",
  "to_model",
  "requested_model",
  "source",
  "context_tokens",
  "prompt_cache_warm",
  "cache_ttl",
  "estimated_cache_write_usd",
  "pricing",
];
const TASK: readonly string[] = ["task_id", "task_subject", "task_description", "teammate_name", "team_name"];

// Fields beyond COMMON; an event missing here is not checked.
const EVENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  SessionStart: [
    "source",
    "model",
    "agent_type",
    "session_title",
    "seconds_since_last_response",
    "context_tokens",
    "prompt_cache_likely_expired",
    "estimated_cache_write_usd",
  ],
  Setup: ["trigger"],
  InstructionsLoaded: ["file_path", "memory_type", "load_reason", "globs.*", "trigger_file_path", "parent_file_path"],
  UserPromptSubmit: ["prompt", "session_title"],
  UserPromptExpansion: ["expansion_type", "command_name", "command_args", "command_source", "prompt"],
  PreSkillShellCommand: ["tool_name", "tool_input.*", "tool_use_id", "command_name", "command_source", "invoked_by"],
  MessageDisplay: ["turn_id", "message_id", "index", "final", "delta"],
  PreToolUse: [...TOOL, "tool_use_id"],
  PermissionRequest: [...TOOL, "permission_suggestions.*"],
  PostToolUse: [...TOOL, "tool_use_id", "tool_response.*", "duration_ms"],
  PostToolUseFailure: [...TOOL, "tool_use_id", "error", "is_interrupt", "duration_ms"],
  PostToolBatch: ["tool_calls.*"],
  PermissionDenied: [...TOOL, "tool_use_id", "reason"],
  Notification: ["message", "title", "notification_type"],
  SubagentStart: [],
  SubagentStop: [
    "stop_hook_active",
    "agent_transcript_path",
    "last_assistant_message",
    "background_tasks.*",
    "session_crons.*",
  ],
  TaskCreated: TASK,
  TaskCompleted: TASK,
  Stop: ["stop_hook_active", "last_assistant_message", "background_tasks.*", "session_crons.*"],
  StopFailure: ["error", "error_details", "last_assistant_message"],
  TeammateIdle: ["teammate_name", "team_name"],
  ConfigChange: ["source", "file_path"],
  CwdChanged: ["old_cwd", "new_cwd"],
  DirectoryAdded: ["directory", "source"],
  FileChanged: ["file_path", "event"],
  WorktreeCreate: ["name"],
  WorktreeRemove: ["worktree_path"],
  PreCompact: ["trigger", "custom_instructions"],
  PostCompact: ["trigger", "compact_summary"],
  PreModelSwitch: MODEL_SWITCH,
  PostModelSwitch: MODEL_SWITCH,
  SessionEnd: ["reason"],
  Elicitation: ["mcp_server_name", "message", "mode", "url", "elicitation_id", "requested_schema.*"],
  ElicitationResult: ["mcp_server_name", "action", "mode", "elicitation_id", "content.*"],
};

// Events whose matcher filters on the tool name.
const TOOL_EVENTS: ReadonlySet<string> = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
]);

// Events without matcher support; Claude Code ignores a matcher there.
const NO_MATCHER: ReadonlySet<string> = new Set([
  "UserPromptSubmit",
  "PostToolBatch",
  "Stop",
  "TeammateIdle",
  "TaskCreated",
  "TaskCompleted",
  "WorktreeCreate",
  "WorktreeRemove",
  "MessageDisplay",
  "CwdChanged",
]);

// Hand-maintained: tool_input fields of built-in tools, the input_schema properties Claude Code 2.1.332 sends to the
// model (captured 2026-11-26) plus the fields the hooks docs list (WebSearch mode). Update both when bumping the version.
// Tools not listed (Glob, Grep, PowerShell, MCP tools, feature-gated tools) keep tool_input open.
const TOOL_INPUT: Readonly<Record<string, readonly string[]>> = {
  Agent: ["description", "prompt", "subagent_type", "model", "effort", "run_in_background", "isolation"],
  Bash: ["command", "timeout", "description", "run_in_background", "dangerouslyDisableSandbox"],
  Edit: ["file_path", "old_string", "new_string", "replace_all"],
  NotebookEdit: ["notebook_path", "cell_id", "new_source", "cell_type", "edit_mode"],
  Read: ["file_path", "offset", "limit", "pages", "allow_large"],
  Skill: ["skill", "args"],
  WebFetch: ["url", "prompt", "offset"],
  WebSearch: ["query", "allowed_domains", "blocked_domains", "mode"],
  Write: ["file_path", "content"],
};

// The docs' exact-list matcher grammar: tool names separated by | or ,.
const EXACT_LIST = /^[A-Za-z0-9_\- ,|]+$/;
// The names Claude Code 2.1.332 substitutes (verified live): ${}, ${ x }, ${a-b}, ${.x}, ${1} and ${a[0]} stay literal text.
const PLACEHOLDER = /\$\{([A-Za-z_][\w.]*)\}/g;

// x.* = open root: x itself or x.<anything>.
const allowed = (name: string, fields: readonly string[]): boolean =>
  fields.some((field) => {
    if (!field.endsWith(".*")) return name === field;
    const root = field.slice(0, -2);
    return name === root || name.startsWith(`${root}.`);
  });

// An exact-list matcher naming only tools of TOOL_INPUT limits tool_input to their fields.
function narrow(event: string, matcher: string | undefined, fields: readonly string[]): readonly string[] {
  if (!TOOL_EVENTS.has(event) || matcher === undefined || !EXACT_LIST.test(matcher)) return fields;
  const names = matcher.split(/[|,]/).map((name) => name.trim()).filter((name) => name !== "");
  if (names.length === 0 || !names.every((name) => Object.hasOwn(TOOL_INPUT, name))) return fields;
  const toolFields = names.flatMap((name) => (TOOL_INPUT[name] ?? []).map((field) => `tool_input.${field}.*`));
  return [...fields.filter((field) => field !== "tool_input.*"), "tool_input", ...toolFields];
}

// Every placeholder name in the string values of value, at any depth, with the path of its string.
function* placeholders(value: unknown, path: IssuePath): Generator<readonly [string, IssuePath]> {
  if (typeof value === "string") {
    for (const [, name = ""] of value.matchAll(PLACEHOLDER)) yield [name, path];
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* placeholders(item, [...path, index]);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) yield* placeholders(item, [...path, key]);
  }
}

export function checkHookPlaceholders(template: unknown): HookPlaceholdersResult {
  // renderHooksTemplate already reports a non-object template.
  if (!isRecord(template)) return { issues: [] };
  const issues: Issue[] = [];
  for (const { event, group, path, call } of mcpToolHooks(template)) {
    // hasOwn: an event named like an Object.prototype member is unknown, not a crash.
    const own = Object.hasOwn(EVENT_FIELDS, event) ? EVENT_FIELDS[event] : undefined;
    // Invalid mcp_tool hooks already get hook-input-invalid from renderHookInputTypes.
    if (own === undefined || call === undefined) continue;
    const raw = group["matcher"];
    const matcher = !NO_MATCHER.has(event) && typeof raw === "string" && raw !== "" ? raw : undefined;
    const fields = narrow(event, matcher, [...COMMON, ...own]);
    const position = [event, matcher, `${call.server}:${call.tool}`].filter((part) => part !== undefined).join("->");
    for (const [name, at] of placeholders(call.input, [...path, "input"])) {
      if (allowed(name, fields)) continue;
      issues.push({
        severity: "warning",
        code: "hook-placeholder-unknown",
        message: `${position} \${${name}}`,
        path: at,
      });
    }
  }
  return { issues };
}
