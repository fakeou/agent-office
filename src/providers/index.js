const { ClaudeProvider } = require("./claude");
const { CodexProvider } = require("./codex");
const { GenericProvider } = require("./generic");

const providers = {
  claude: new ClaudeProvider(),
  codex: new CodexProvider(),
  generic: new GenericProvider("generic")
};

function getProvider(name) {
  return providers[name] || new GenericProvider(name || "generic");
}

module.exports = {
  getProvider
};

