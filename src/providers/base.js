class BaseProvider {
  constructor(name) {
    this.name = name;
  }

  createSession(payload) {
    return {
      provider: this.name,
      title: payload.title,
      command: payload.command,
      cwd: payload.cwd,
      mode: payload.mode || "managed",
      transport: payload.transport || "pty",
      state: "idle",
      status: "registered",
      meta: payload.meta || {}
    };
  }

  classifyOutput() {
    return null;
  }

  reconcileSession() {
    return null;
  }

  onExit({ exitCode }) {
    if (exitCode === 0) {
      return { state: "idle", status: "completed" };
    }
    return { state: "attention", status: "attention" };
  }
}

module.exports = {
  BaseProvider
};
