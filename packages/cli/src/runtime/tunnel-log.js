const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TUNNEL_LOG_PATH = path.join(os.homedir(), ".agentoffice", "logs", "tunnel.log");

function describeWebSocketClose({ code, reason }) {
  const parts = [];

  if (typeof code === "number") {
    parts.push(`code=${code}`);
  }

  if (reason) {
    parts.push(`reason=${reason}`);
  }

  return parts.length > 0 ? parts.join(" ") : "no close details";
}

function createTunnelLogger({
  logPath = TUNNEL_LOG_PATH,
  now = () => new Date().toISOString(),
  mkdirSync = fs.mkdirSync,
  appendFileSync = fs.appendFileSync,
  consoleObj = console,
} = {}) {
  function write(level, message) {
    const line = `[${now()}] [${level}] ${message}`;
    const print = level === "error" ? consoleObj.error : consoleObj.log;
    print.call(consoleObj, line);

    try {
      mkdirSync(path.dirname(logPath), { recursive: true });
      appendFileSync(logPath, `${line}\n`, "utf8");
    } catch {
      // Logging should never crash the tunnel client.
    }
  }

  return {
    logPath,
    info(message) {
      write("info", message);
    },
    error(message) {
      write("error", message);
    },
  };
}

module.exports = {
  TUNNEL_LOG_PATH,
  createTunnelLogger,
  describeWebSocketClose,
};
