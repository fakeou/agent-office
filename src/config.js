const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const STATIC_DIR = path.join(APP_ROOT, "static");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_LAN_HOST = "0.0.0.0";
const DEFAULT_PORT = 8765;
const DEFAULT_SERVER_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
const LOG_LIMIT = 1000;

module.exports = {
  APP_ROOT,
  STATIC_DIR,
  DEFAULT_HOST,
  DEFAULT_LAN_HOST,
  DEFAULT_PORT,
  DEFAULT_SERVER_URL,
  LOG_LIMIT
};
