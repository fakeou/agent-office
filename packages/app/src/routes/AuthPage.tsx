import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { loadTurnstileScript } from "../lib/turnstile";
import { useAuthStore } from "../store/auth";

type PublicConfig = {
  turnstileSiteKey: string;
};

type AuthPayload = {
  token: string;
  userId: string;
};

export function AuthPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const token = useAuthStore((state) => state.token);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [publicConfig, setPublicConfig] = useState<PublicConfig>({ turnstileSiteKey: "" });
  const [loginPending, setLoginPending] = useState(false);
  const [registerPending, setRegisterPending] = useState(false);
  const [sendCodePending, setSendCodePending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const registerEmailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (token) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, token]);

  useEffect(() => {
    api<PublicConfig>("/api/config/public", { authenticated: false })
      .then((data) => setPublicConfig(data))
      .catch(() => setPublicConfig({ turnstileSiteKey: "" }));
  }, []);

  useEffect(() => {
    if (!publicConfig.turnstileSiteKey || !turnstileRef.current) {
      return;
    }

    let disposed = false;

    loadTurnstileScript()
      .then(() => {
        if (disposed || !window.turnstile || !turnstileRef.current || widgetIdRef.current) {
          return;
        }

        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: publicConfig.turnstileSiteKey,
          theme: "light",
          callback: (value: string) => setTurnstileToken(value),
          "expired-callback": () => setTurnstileToken("")
        });
      })
      .catch(() => {});

    return () => {
      disposed = true;
    };
  }, [publicConfig.turnstileSiteKey]);

  useEffect(() => {
    if (!countdown) {
      return;
    }

    const timer = window.setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const registerTitle = useMemo(
    () =>
      mode === "register"
        ? "Create account and get your workshop online."
        : "Sign in to manage API keys and prepare the new workshop UI.",
    [mode]
  );

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoginPending(true);

    const formData = new FormData(event.currentTarget);

    try {
      const payload = await api<AuthPayload>("/api/auth/login", {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || "")
        })
      });
      setAuth(payload);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoginPending(false);
    }
  }

  async function handleSendCode(email: string) {
    if (!email) {
      setError("Please enter your email first.");
      return;
    }

    setError("");
    setSendCodePending(true);

    try {
      await api<{ ok: boolean }>("/api/auth/send-code", {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({
          email,
          turnstileToken
        })
      });
      setCodeSent(true);
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code.");
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setTurnstileToken("");
      }
    } finally {
      setSendCodePending(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!codeSent) {
      setError("Send the email verification code before creating an account.");
      return;
    }

    setRegisterPending(true);
    const formData = new FormData(event.currentTarget);

    try {
      const payload = await api<AuthPayload>("/api/auth/register", {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || ""),
          displayName: String(formData.get("displayName") || "").trim(),
          code: String(formData.get("code") || "").trim()
        })
      });
      setAuth(payload);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setRegisterPending(false);
    }
  }

  return (
    <div className="page-shell auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">AT</div>
        <p className="eyebrow">AgentTown App</p>
        <h1 className="page-title">React shell for auth now, Pixi workshop next.</h1>
        <p className="page-copy">{registerTitle}</p>

        <div className="mode-tabs" role="tablist" aria-label="Authentication modes">
          <button
            className={`mode-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => setMode("login")}
            type="button"
          >
            Login
          </button>
          <button
            className={`mode-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => setMode("register")}
            type="button"
          >
            Register
          </button>
        </div>

        {error ? <div className="message error">{error}</div> : null}

        {mode === "login" ? (
          <form className="panel-card form-grid" onSubmit={handleLogin}>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={loginPending}>
              {loginPending ? "Signing in..." : "Log In"}
            </button>
          </form>
        ) : (
          <form className="panel-card form-grid" onSubmit={handleRegister}>
            <label className="field">
              <span>Email</span>
              <div className="inline-action">
                <input
                  ref={registerEmailRef}
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={sendCodePending || countdown > 0}
                  onClick={() => {
                    void handleSendCode(registerEmailRef.current?.value.trim() || "");
                  }}
                >
                  {sendCodePending ? "Sending..." : countdown > 0 ? `${countdown}s` : "Send Code"}
                </button>
              </div>
            </label>

            {publicConfig.turnstileSiteKey ? (
              <div className="turnstile-slot" ref={turnstileRef} />
            ) : null}

            <label className="field">
              <span>Verification Code</span>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                autoComplete="one-time-code"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                placeholder="Create a password"
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              <span>Display Name</span>
              <input name="displayName" type="text" placeholder="Optional" autoComplete="nickname" />
            </label>
            <button className="primary-button" type="submit" disabled={registerPending}>
              {registerPending ? "Creating..." : codeSent ? "Create Account" : "Send Code First"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
