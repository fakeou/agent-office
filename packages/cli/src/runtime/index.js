const { createPtyManager, defaultTransportForProvider } = require("./pty-manager");
const {
  AGENTOFFICE_TMUX_PREFIX,
  attachClient,
  capturePane,
  createTmuxSession,
  describePane,
  killSession,
  listAgentOfficeSessions,
  localAttachCommand,
  sessionExists,
  tmuxPath
} = require("./tmux");
const {
  REGISTRY_DIR,
  listSessionRecords,
  persistSessionRecord,
  removeSessionRecord
} = require("./session-registry");
const { ensureNodePtySpawnHelper } = require("./ensure-node-pty");
const { startSleepInhibitor } = require("./sleep-inhibitor");
const { createTunnelLogger, TUNNEL_LOG_PATH, describeWebSocketClose } = require("./tunnel-log");
const {
  applyClaudeHookConfig,
  claudeSettingsPath,
  commandExists,
  hasClaudeHookConfig,
  networkUrls,
  resolveCommand
} = require("./cli-helpers");

module.exports = {
  createPtyManager,
  defaultTransportForProvider,
  AGENTOFFICE_TMUX_PREFIX,
  attachClient,
  capturePane,
  createTmuxSession,
  describePane,
  killSession,
  listAgentOfficeSessions,
  localAttachCommand,
  sessionExists,
  tmuxPath,
  REGISTRY_DIR,
  listSessionRecords,
  persistSessionRecord,
  removeSessionRecord,
  ensureNodePtySpawnHelper,
  startSleepInhibitor,
  createTunnelLogger,
  TUNNEL_LOG_PATH,
  describeWebSocketClose,
  applyClaudeHookConfig,
  claudeSettingsPath,
  commandExists,
  hasClaudeHookConfig,
  networkUrls,
  resolveCommand
};
