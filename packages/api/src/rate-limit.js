function createRateLimiter({
  windowMs = 60 * 1000,
  maxAttempts = 5,
  lockoutThreshold = 10,
  lockoutDurationMs = 15 * 60 * 1000
} = {}) {
  const records = new Map();

  function getRecord(key) {
    const now = Date.now();
    let record = records.get(key);
    if (!record) {
      record = { attempts: [], failures: 0, lockedUntil: 0 };
      records.set(key, record);
    }
    record.attempts = record.attempts.filter((t) => now - t < windowMs);
    return record;
  }

  function check(key) {
    const now = Date.now();
    const record = getRecord(key);

    if (record.lockedUntil > now) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { allowed: false, locked: true, remainingSeconds };
    }

    if (record.attempts.length >= maxAttempts) {
      return { allowed: false, locked: false, remainingSeconds: 0 };
    }

    return { allowed: true, locked: false, remainingSeconds: 0 };
  }

  function record(key, success) {
    const now = Date.now();
    const rec = getRecord(key);
    rec.attempts.push(now);
    if (success) {
      rec.failures = 0;
      rec.lockedUntil = 0;
    } else {
      rec.failures += 1;
      if (rec.failures >= lockoutThreshold) {
        rec.lockedUntil = now + lockoutDurationMs;
      }
    }
  }

  return { check, record };
}

function rateLimitMiddleware(limiter) {
  return (req, res, next) => {
    const key = req.ip || req.connection?.remoteAddress || "unknown";
    const result = limiter.check(key);

    if (!result.allowed) {
      const error = result.locked ? "locked" : "rate_limited";
      const response = { error };
      if (result.locked) {
        response.retryAfterSeconds = result.remainingSeconds;
      }
      return res.status(429).json(response);
    }

    // Attach limiter to request for route handlers to record success/failure
    req.rateLimiter = {
      record: (success) => limiter.record(key, success)
    };
    next();
  };
}

module.exports = {
  createRateLimiter,
  rateLimitMiddleware
};
