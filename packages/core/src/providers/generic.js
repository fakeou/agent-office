const { BaseProvider } = require("./base");

const ATTENTION_PATTERNS = [
  "traceback",
  "fatal",
  "command not found",
  "permission denied",
  "access denied",
  "exception"
];

const WAITING_PATTERNS = [
  "approve",
  "approval",
  "waiting for input",
  "confirm",
  "press enter",
  "continue?"
];

class GenericProvider extends BaseProvider {
  constructor(name = "generic") {
    super(name);
  }

  classifyOutput(chunk) {
    const text = String(chunk).toLowerCase();
    if (WAITING_PATTERNS.some((pattern) => text.includes(pattern))) {
      return "approval";
    }
    if (ATTENTION_PATTERNS.some((pattern) => text.includes(pattern))) {
      return "attention";
    }
    return "working";
  }
}

module.exports = {
  GenericProvider
};
