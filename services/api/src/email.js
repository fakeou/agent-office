const crypto = require("node:crypto");

let ProxyAgent;
try {
  ({ ProxyAgent } = require("undici"));
} catch {
  ProxyAgent = null;
}

const proxyDispatcherCache = new Map();

function getProxyDispatcher(targetUrl) {
  const proxyUrl = targetUrl.startsWith("https:")
    ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy || null
    : process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy || null;

  if (!proxyUrl || !ProxyAgent) {
    return undefined;
  }

  if (!proxyDispatcherCache.has(proxyUrl)) {
    proxyDispatcherCache.set(proxyUrl, new ProxyAgent(proxyUrl));
  }

  return proxyDispatcherCache.get(proxyUrl);
}

const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode() {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return String(num).padStart(CODE_LENGTH, "0");
}

function createEmailService({ db }) {
  const insertCode = db.prepare(
    "INSERT INTO verification_codes (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)"
  );
  const invalidateOld = db.prepare(
    "UPDATE verification_codes SET used = 1 WHERE email = ? AND used = 0"
  );
  const findLatestValid = db.prepare(
    `SELECT * FROM verification_codes
     WHERE email = ? AND used = 0 AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 1`
  );
  const incrementAttempts = db.prepare(
    "UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?"
  );
  const markUsed = db.prepare(
    "UPDATE verification_codes SET used = 1 WHERE id = ?"
  );
  const cleanupOld = db.prepare(
    "DELETE FROM verification_codes WHERE expires_at < datetime('now', '-1 hour')"
  );

  async function verifyTurnstile(token, remoteIp) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      console.log("[email] TURNSTILE_SECRET_KEY not set — skipping Turnstile verification");
      return true;
    }

    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: remoteIp || ""
    });

    const turnstileUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const res = await fetch(turnstileUrl, {
      method: "POST",
      body,
      dispatcher: getProxyDispatcher(turnstileUrl)
    });
    const data = await res.json();
    return data.success === true;
  }

  async function sendViaResend(email, code) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(`[email] RESEND_API_KEY not set — verification code for ${email}: ${code}`);
      return;
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; text-align: center;">
        <h2 style="color: #2f2b26;">Your AgentOffice verification code</h2>
        <p style="font-size: 40px; font-weight: bold; letter-spacing: 8px; color: #b95c33; margin: 24px 0;">${code}</p>
        <p style="color: #71675a; font-size: 14px;">This code expires in 10 minutes.</p>
        <p style="color: #71675a; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `.trim();

    const resendUrl = "https://api.resend.com/emails";
    const res = await fetch(resendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      dispatcher: getProxyDispatcher(resendUrl),
      body: JSON.stringify({
        from: process.env.RESEND_FROM || `${process.env.RESEND_FROM_NAME || "AgentOffice"} <${process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"}>`,
        to: [email],
        subject: "Your AgentOffice verification code",
        html
      })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[email] Resend API error: ${res.status} ${text}`);
      throw Object.assign(new Error("failed to send verification email"), { status: 500 });
    }
  }

  async function sendCode({ email, turnstileToken, remoteIp }) {
    // Verify Turnstile
    const turnstileOk = await verifyTurnstile(turnstileToken, remoteIp);
    if (!turnstileOk) {
      throw Object.assign(new Error("human verification failed"), { status: 403 });
    }

    // Invalidate old codes for this email
    invalidateOld.run(email.toLowerCase());

    // Generate and store new code
    const code = generateCode();
    const id = `vc_${crypto.randomBytes(8).toString("hex")}`;
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString().replace("T", " ").replace("Z", "");

    insertCode.run(id, email.toLowerCase(), hashCode(code), expiresAt);

    // Send email
    await sendViaResend(email.toLowerCase(), code);

    // Cleanup old records
    try { cleanupOld.run(); } catch { /* ignore */ }
  }

  function verifyCode({ email, code }) {
    const record = findLatestValid.get(email.toLowerCase());
    if (!record) {
      throw Object.assign(new Error("no valid verification code found"), { status: 400 });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      markUsed.run(record.id);
      throw Object.assign(new Error("too many attempts — request a new code"), { status: 400 });
    }

    incrementAttempts.run(record.id);

    if (hashCode(code) !== record.code_hash) {
      throw Object.assign(new Error("incorrect verification code"), { status: 400 });
    }

    markUsed.run(record.id);
    return true;
  }

  return { sendCode, verifyCode };
}

module.exports = { createEmailService };
