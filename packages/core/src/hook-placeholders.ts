import type { Issue } from "./issue.js";
import type { IssuePath } from "./validate-manifest.js";
import { isRecord } from "./validate-manifest.js";

export interface HookPlaceholdersResult {
  readonly issues: readonly Issue[];
}

// Fields of each event's hook input, from https://code.claude.com/docs/en/hooks.md ("<Event> input" sections), fetched 2026-11-26.
// "x.*" is an open root (object, array or tool-dependent field): it accepts x, x.<anything> and x[<anything>.
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

// shortcut: only Write and Edit narrow tool_input, other tools stay open; add a tool once its fields are corroborated.
const TOOL_INPUT: Readonly<Record<string, readonly string[]>> = {
  Write: ["file_path", "content"],
  Edit: ["file_path", "old_string", "new_string", "replace_all"],
};

// The docs' exact-list matcher grammar: tool names separated by | or ,.
const EXACT_LIST = /^[A-Za-z0-9_\- ,|]+$/;
const PLACEHOLDER = /\$\{([^}]*)\}/g;

// x.* = open root: x itself, x.<anything>, x[<anything>.
const allowed = (name: string, fields: readonly string[]): boolean =>
  fields.some((field) => {
    if (!field.endsWith(".*")) return name === field;
    const root = field.slice(0, -2);
    return name === root || name.startsWith(`${root}.`) || name.startsWith(`${root}[`);
  });

// An exact-list matcher naming only tools of TOOL_INPUT limits tool_input to their fields.
function narrow(event: string, matcher: string | undefined, fields: readonly string[]): readonly string[] {
  if (!TOOL_EVENTS.has(event) || matcher === undefined || !EXACT_LIST.test(matcher)) return fields;
  const names = matcher.split(/[|,]/).map((name) => name.trim()).filter((name) => name !== "");
  if (names.length === 0 || !names.every((name) => Object.hasOwn(TOOL_INPUT, name))) return fields;
  const toolFields = names.flatMap((name) => (TOOL_INPUT[name] ?? []).map((field) => `tool_input.${field}.*`));
  return [...fields.filter((field) => field !== "tool_input.*"), "tool_input", ...toolFields];
}

export function checkHookPlaceholders(template: unknown): HookPlaceholdersResult {
  // renderHooksTemplate already reports a non-object template.
  if (!isRecord(template)) return { issues: [] };
  const issues: Issue[] = [];

  // Same path as renderHookInputTypes; anything off that shape is skipped.
  const hooks = template["hooks"];
  for (const [event, groups] of Object.entries(isRecord(hooks) ? hooks : {})) {
    // hasOwn: an event named like an Object.prototype member is unknown, not a crash.
    const own = Object.hasOwn(EVENT_FIELDS, event) ? EVENT_FIELDS[event] : undefined;
    if (own === undefined || !Array.isArray(groups)) continue;
    groups.forEach((group: unknown, groupIndex) => {
      const inner = isRecord(group) ? group["hooks"] : undefined;
      if (!isRecord(group) || !Array.isArray(inner)) return;
      const raw = group["matcher"];
      const matcher = !NO_MATCHER.has(event) && typeof raw === "string" && raw !== "" ? raw : undefined;
      const fields = narrow(event, matcher, [...COMMON, ...own]);
      inner.forEach((hook: unknown, hookIndex) => {
        if (!isRecord(hook) || hook["type"] !== "mcp_tool") return;
        const server = hook["server"];
        const tool = hook["tool"];
        const input = hook["input"];
        // Invalid mcp_tool hooks already get hook-input-invalid from renderHookInputTypes.
        if (typeof server !== "string" || server === "" || typeof tool !== "string" || tool === "") return;
        if (!isRecord(input)) return;
        const position = [event, matcher, `${server}:${tool}`].filter((part) => part !== undefined).join("->");
        const scan = (value: unknown, path: IssuePath): void => {
          if (typeof value === "string") {
            for (const [, name = ""] of value.matchAll(PLACEHOLDER)) {
              if (allowed(name, fields)) continue;
              issues.push({
                severity: "warning",
                code: "hook-placeholder-unknown",
                message: `${position} \${${name}}`,
                path,
              });
            }
          } else if (Array.isArray(value)) {
            value.forEach((item: unknown, index) => scan(item, [...path, index]));
          } else if (isRecord(value)) {
            for (const [key, item] of Object.entries(value)) scan(item, [...path, key]);
          }
        };
        scan(input, ["hooks", event, groupIndex, "hooks", hookIndex, "input"]);
      });
    });
  }
  return { issues };
}
