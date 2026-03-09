const path = require("node:path");
const { BaseProvider } = require("./base");
const { detectPermissionResolution, hasInterruptMarker } = require("./claude-transcript");

function approvalTimestampFor(session) {
  const events = [...(session.events || [])].reverse();
  const approvalEvent = events.find((event) => {
    if (event.name === "permission_request") {
      return true;
    }
    return event.name === "notification" && ["permission_prompt", "elicitation_dialog"].includes(event.meta && event.meta.notificationType);
  });
  if (session.meta && session.meta.approvalRequestedAt) {
    return session.meta.approvalRequestedAt;
  }
  return approvalEvent ? approvalEvent.timestamp : null;
}

class ClaudeProvider extends BaseProvider {
  constructor() {
    super("claude");
  }

  createSession(payload) {
    return {
      ...super.createSession(payload),
      mode: payload.mode || "hooked",
      transport: payload.transport || "hook",
      meta: {
        transcriptPath: payload.meta && payload.meta.transcriptPath,
        model: payload.meta && payload.meta.model,
        permissionMode: payload.meta && payload.meta.permissionMode,
        agentType: payload.meta && payload.meta.agentType,
        hookEventName: payload.meta && payload.meta.hookEventName
      }
    };
  }

  classifyOutput() {
    return null;
  }

  reconcileSession(session) {
    if (session.status === "exited") {
      return null;
    }

    const transcriptPath = session.meta && session.meta.transcriptPath;
    if (!transcriptPath) {
      return null;
    }

    if (session.displayState === "approval") {
      const resolution = detectPermissionResolution(transcriptPath, approvalTimestampFor(session));
      if (resolution) {
        return {
          state: resolution.state,
          patch: { status: "running" },
          eventName: resolution.eventName,
          meta: resolution.meta
        };
      }
      return null;
    }

    if (session.displayState !== "working" || !hasInterruptMarker(transcriptPath)) {
      return null;
    }

    return {
      state: "idle",
      patch: { status: "running" },
      eventName: "transcript_interrupt",
      meta: {
        transcriptPath,
        reason: "Claude transcript recorded a user interrupt without a follow-up hook state change."
      }
    };
  }

  mapHookPayload(payload) {
    const hookEventName = payload.hook_event_name;
    const baseMeta = {
      hookEventName,
      toolName: payload.tool_name || null,
      notificationType: payload.notification_type || null,
      reason: payload.reason || null,
      error: payload.error || null,
      message: payload.message || null,
      isInterrupt: payload.is_interrupt || false,
      transcriptPath: payload.transcript_path || null,
      model: payload.model || null,
      permissionMode: payload.permission_mode || null
    };

    const result = {
      session: {
        sessionId: payload.session_id,
        provider: "claude",
        title: payload.agent_type ? `Claude ${payload.agent_type}` : `Claude · ${path.basename(payload.cwd || process.cwd())}`,
        command: "claude",
        cwd: payload.cwd || process.cwd(),
        mode: "hooked",
        transport: "hook",
        meta: baseMeta,
        status: "running"
      },
      eventName: null,
      state: null,
      meta: baseMeta
    };

    switch (hookEventName) {
      case "SessionStart":
        result.eventName = "session_started";
        result.state = "idle";
        break;
      case "UserPromptSubmit":
        result.eventName = "prompt_submitted";
        result.state = "working";
        result.meta.prompt = payload.prompt || null;
        break;
      case "PreToolUse":
      case "SubagentStart":
        result.eventName = hookEventName.toLowerCase();
        result.state = "working";
        result.meta.toolInput = payload.tool_input || null;
        break;
      case "PostToolUse":
      case "SubagentStop":
        result.eventName = hookEventName.toLowerCase();
        result.state = null;
        result.meta.toolInput = payload.tool_input || null;
        break;
      case "PermissionRequest":
        result.eventName = "permission_request";
        result.state = "approval";
        result.meta.toolInput = payload.tool_input || null;
        break;
      case "Notification":
        result.eventName = "notification";
        if (["permission_prompt", "elicitation_dialog"].includes(payload.notification_type)) {
          result.state = "approval";
        } else if (payload.notification_type === "idle_prompt") {
          result.state = "idle";
        } else {
          result.state = null;
        }
        break;
      case "PostToolUseFailure":
        result.eventName = "tool_failure";
        result.state = payload.is_interrupt ? "idle" : "attention";
        result.meta.toolInput = payload.tool_input || null;
        break;
      case "Stop":
        result.eventName = "stop";
        result.state = "idle";
        break;
      case "TaskCompleted":
        result.eventName = "task_completed";
        result.state = "idle";
        result.session.status = "completed";
        break;
      case "SessionEnd":
        result.eventName = "session_ended";
        result.state = "idle";
        result.session.status = "exited";
        break;
      default:
        break;
    }

    return result;
  }
}

function printClaudeHooksConfig({ handlerPath, serverUrl }) {
  const command = `node ${JSON.stringify(handlerPath)} claude-hook --server ${JSON.stringify(serverUrl)}`;
  const hook = { type: "command", command };
  return {
    hooks: {
      SessionStart: [{ matcher: "*", hooks: [hook] }],
      UserPromptSubmit: [{ hooks: [hook] }],
      PreToolUse: [{ matcher: "*", hooks: [hook] }],
      PermissionRequest: [{ matcher: "*", hooks: [hook] }],
      PostToolUse: [{ matcher: "*", hooks: [hook] }],
      PostToolUseFailure: [{ matcher: "*", hooks: [hook] }],
      Notification: [{ matcher: "*", hooks: [hook] }],
      Stop: [{ hooks: [hook] }],
      TaskCompleted: [{ hooks: [hook] }],
      SessionEnd: [{ matcher: "*", hooks: [hook] }]
    }
  };
}

module.exports = {
  ClaudeProvider,
  printClaudeHooksConfig
};
