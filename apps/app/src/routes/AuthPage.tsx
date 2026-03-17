import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { hasValidJwt } from "@/lib/jwt";
import { loadTurnstileScript } from "@/lib/turnstile";
import { useAuthStore } from "@/store/auth";

type PublicConfig = { turnstileSiteKey: string };
type AuthPayload = { token: string; userId: string };

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
  const [registerEmail, setRegisterEmail] = useState("");
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasValidJwt(token)) navigate("/office", { replace: true });
  }, [navigate, token]);

  useEffect(() => {
    api<PublicConfig>("/api/config/public", { authenticated: false })
      .then((data) => setPublicConfig(data))
      .catch(() => setPublicConfig({ turnstileSiteKey: "" }));
  }, []);

  useEffect(() => {
    if (!publicConfig.turnstileSiteKey || !turnstileRef.current) return;
    let disposed = false;
    loadTurnstileScript()
      .then(() => {
        if (disposed || !window.turnstile || !turnstileRef.current || widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: publicConfig.turnstileSiteKey,
          theme: "light",
          callback: (value: string) => setTurnstileToken(value),
          "expired-callback": () => setTurnstileToken(""),
        });
      })
      .catch(() => {});
    return () => { disposed = true; };
  }, [publicConfig.turnstileSiteKey]);

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setTimeout(() => setCountdown((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const subtitle = useMemo(
    () =>
      mode === "register"
        ? "Create an account and launch your own AI studio."
        : "Sign in to see what your Agents are up to.",
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
          password: String(formData.get("password") || ""),
        }),
      });
      setAuth(payload);
      navigate("/office", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoginPending(false);
    }
  }

  async function handleSendCode(email: string) {
    if (!email) { setError("Please enter your email first."); return; }
    setError("");
    setSendCodePending(true);
    try {
      await api<{ ok: boolean }>("/api/auth/send-code", {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({ email, turnstileToken }),
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
    if (!codeSent) { setError("Send the email verification code before creating an account."); return; }
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
          code: String(formData.get("code") || "").trim(),
        }),
      });
      setAuth(payload);
      navigate("/office", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setRegisterPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px]">
        {/* Brand */}
        <div className="mb-6">
          <img src="/favicon.png" alt="AgentOffice" className="mb-4 h-11 w-11 rounded-lg object-contain" />
          <p className="text-[0.7rem] font-medium uppercase tracking-widest text-muted-foreground">
            AgentOffice
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Step into your studio.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Tabs */}
        <Tabs
          defaultValue="login"
          value={mode}
          onValueChange={(v) => setMode(v as "login" | "register")}
        >
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="login" className="flex-1">Sign In</TabsTrigger>
            <TabsTrigger value="register" className="flex-1">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardContent className="pt-6">
                <form className="grid gap-4" onSubmit={handleLogin}>
                  <div className="grid gap-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input id="login-email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input id="login-password" name="password" type="password" placeholder="Your password" autoComplete="current-password" required />
                  </div>
                  <Button type="submit" disabled={loginPending} className="w-full">
                    {loginPending ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card>
              <CardContent className="pt-6">
                <form className="grid gap-4" onSubmit={handleRegister}>
                  <div className="grid gap-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <div className="flex gap-2">
                      <Input
                        id="reg-email"
                        name="email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                        className="flex-1"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={sendCodePending || countdown > 0}
                        onClick={() => void handleSendCode(registerEmail.trim())}
                      >
                        {sendCodePending ? "Sending..." : countdown > 0 ? `${countdown}s` : "Send Code"}
                      </Button>
                    </div>
                  </div>

                  {publicConfig.turnstileSiteKey && (
                    <div className="turnstile-slot" ref={turnstileRef} />
                  )}

                  <div className="grid gap-2">
                    <Label htmlFor="reg-code">Verification Code</Label>
                    <Input id="reg-code" name="code" type="text" inputMode="numeric" maxLength={6} placeholder="6-digit code" autoComplete="one-time-code" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input id="reg-password" name="password" type="password" placeholder="Create a password" autoComplete="new-password" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reg-name">Display Name</Label>
                    <Input id="reg-name" name="displayName" type="text" placeholder="Optional" autoComplete="nickname" />
                  </div>
                  <Button type="submit" disabled={registerPending} className="w-full">
                    {registerPending ? "Creating..." : codeSent ? "Create Account" : "Send Code First"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
