const { createPtyManager, defaultTransportForProvider } = require("./pty-manager");
const {
  AGENTTOWN_TMUX_PREFIX,
  attachClient,
  capturePane,
  createTmuxSession,
  describePane,
  killSession,
  listAgentTownSessions,
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
  AGENTTOWN_TMUX_PREFIX,
  attachClient,
  capturePane,
  createTmuxSession,
  describePane,
  killSession,
  listAgentTownSessions,
  localAttachCommand,
  sessionExists,
  tmuxPath,
  REGISTRY_DIR,
  listSessionRecords,
  persistSessionRecord,
  removeSessionRecord,
  ensureNodePtySpawnHelper,
  applyClaudeHookConfig,
  claudeSettingsPath,
  commandExists,
  hasClaudeHookConfig,
  networkUrls,
  resolveCommand
};
