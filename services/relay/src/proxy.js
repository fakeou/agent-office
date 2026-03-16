function createProxy({ upstream }) {
  async function handleHttpProxy(req, res, userId) {
    const result = await upstream.sendHttpRequest(userId, {
      method: req.method,
      path: req.originalUrl,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : ""
    });

    if (!result) {
      res.status(502).json({ error: "tunnel_offline" });
      return;
    }

    const headers = result.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    res.status(result.status || 200);

    if (typeof result.body === "object") {
      res.json(result.body);
    } else {
      res.send(result.body || "");
    }
  }

  function handleWsProxy(browserWs, userId, wsPath) {
    upstream.openWsConnection(userId, browserWs, wsPath);
  }

  return {
    handleHttpProxy,
    handleWsProxy
  };
}

module.exports = {
  createProxy
};
