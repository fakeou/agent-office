import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { RELAY_BASE } from "../lib/config";
import { useAuthStore } from "../store/auth";
import { MenuButton } from "../components/NavSidebar";

type User = {
  email: string;
  displayName?: string;
};

type KeyRecord = {
  id: string;
  keyPrefix: string;
  label?: string;
  createdAt?: string;
};

type KeysResponse = {
  keys: KeyRecord[];
};

type CreateKeyResponse = {
  key: string;
};

const DEFAULT_RELAY_URL = "https://agenttown.cc";

function CopyButton({ text, label = "Copy", disabled = false }: { text: string; label?: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (disabled) {
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button className="db-copy-btn db-copy-btn--inline" type="button" onClick={() => void handleCopy()} disabled={disabled}>
      {copied ? "Copied!" : label}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="db-setup-step">
      <div className="db-setup-step-head">
        <span>{label}</span>
        <CopyButton text={code} />
      </div>
      <div className="db-cmd-block">
        <pre className="db-cmd-pre">{code}</pre>
      </div>
    </div>
  );
}

function buildEnvSetupCommand(apiKey: string, relayUrl: string) {
  const lines = [`export AGENTTOWN_API_KEY=${apiKey}`];
  if (relayUrl !== DEFAULT_RELAY_URL) {
    lines.push(`export AGENTTOWN_RELAY_URL=${relayUrl}`);
  }
  lines.push("att start");
  return lines.join("\n");
}

function buildFlagSetupCommand(apiKey: string, relayUrl: string) {
  const parts = ["att", "start", "--key", apiKey];
  if (relayUrl !== DEFAULT_RELAY_URL) {
    parts.push("--relay", relayUrl);
  }
  return parts.join(" ");
}

function buildTemplateEnvCommand(relayUrl: string) {
  return buildEnvSetupCommand("<your_api_key>", relayUrl);
}

function buildTemplateFlagCommand(relayUrl: string) {
  return buildFlagSetupCommand("<your_api_key>", relayUrl);
}

function SetupModal({ apiKey, relayUrl, onClose }: { apiKey: string; relayUrl: string; onClose: () => void }) {
  const envCommand = buildEnvSetupCommand(apiKey, relayUrl);
  const oneShotCommand = buildFlagSetupCommand(apiKey, relayUrl);

  return (
    <div className="db-modal-backdrop" onClick={onClose}>
      <div className="db-modal" onClick={(event) => event.stopPropagation()}>
        <div className="db-modal-head">
          <span className="db-modal-title">API Key Created</span>
          <button className="db-modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="db-modal-body">
          <p className="db-modal-notice">Each account can have only one API key. Save it now. To generate a new one later, delete the current key first.</p>
          <CodeBlock code={apiKey} label="Current API Key" />
          <p className="db-modal-copy">Option A: export the key as an environment variable, then run <code>att start</code>.</p>
          <CodeBlock code={envCommand} label="Export env and start" />
          <div className="db-modal-or">or</div>
          <p className="db-modal-copy">Option B: skip environment variables and run a single command.</p>
          <CodeBlock code={oneShotCommand} label="att start --key" />
        </div>
        <div className="db-modal-foot">
          <button className="primary-button" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
  const [latestKey, setLatestKey] = useState("");
  const [showSetupModal, setShowSetupModal] = useState(false);
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/api/auth/me"),
    enabled: Boolean(token)
  });

  const keysQuery = useQuery({
    queryKey: ["keys"],
    queryFn: () => api<KeysResponse>("/api/keys"),
    enabled: Boolean(token)
  });

  const createKeyMutation = useMutation({
    mutationFn: () =>
      api<CreateKeyResponse>("/api/keys", {
        method: "POST",
        body: JSON.stringify({ label: "workshop" })
      }),
    onSuccess: async (data) => {
      setLatestKey(data.key);
      setShowSetupModal(true);
      await queryClient.invalidateQueries({ queryKey: ["keys"] });
    }
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: string) =>
      api<{ ok: boolean }>("/api/keys", {
        method: "POST",
        body: JSON.stringify({ intent: "delete", keyId })
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["keys"] });
    }
  });

  useEffect(() => {
    if (userQuery.data) {
      setUser(userQuery.data);
    }
  }, [setUser, userQuery.data]);

  const keys = keysQuery.data?.keys ?? [];
  const relayUrl = RELAY_BASE.startsWith("http") ? RELAY_BASE : window.location.origin;
  const usesDefaultRelay = relayUrl === DEFAULT_RELAY_URL;

  const displayName = userQuery.data?.displayName || user?.displayName;
  const email = userQuery.data?.email || user?.email;
  const avatarLetter = (displayName || email || "U")[0].toUpperCase();

  if (!token) return <Navigate to="/auth" replace />;

  return (
    <div className="db-page">
      {showSetupModal && latestKey && (
        <SetupModal apiKey={latestKey} relayUrl={relayUrl} onClose={() => setShowSetupModal(false)} />
      )}
      <div className="db-frame">
        <header className="db-topbar">
          <MenuButton />
          <span className="db-brand">Dashboard</span>
        </header>

        <div className="db-card">
          <div className="db-profile">
            <div className="db-avatar">{avatarLetter}</div>
            <div>
              <p className="db-profile-name">{displayName || email || "User"}</p>
              {displayName && <p className="db-profile-email">{email}</p>}
            </div>
          </div>

          <div className="db-section-head">
            <div className="db-label-group">
              <span className="db-label">API Key</span>
            </div>
            {keys.length === 0 && (
              <button
                className="db-new-btn"
                type="button"
                disabled={createKeyMutation.isPending}
                onClick={() => createKeyMutation.mutate()}
              >
                {createKeyMutation.isPending ? "Creating…" : "Create Key"}
              </button>
            )}
          </div>

          <p className="db-section-copy">
            Recommended: set <code>AGENTTOWN_API_KEY</code> and then run <code>att start</code>.
            {!usesDefaultRelay && (
              <>
                {" "}If you are not using the default hosted relay, also set <code>AGENTTOWN_RELAY_URL</code> or pass <code>--relay</code>.
              </>
            )}
          </p>

          {keysQuery.isLoading && <p className="db-empty">Loading…</p>}
          {keysQuery.isError && <p className="db-err">Failed to load keys.</p>}

          {!keysQuery.isLoading && !keysQuery.isError && keys.length === 0 && (
            <div className="db-key-empty">
              <p className="db-empty">No API key. Create one to connect <code>att start</code> to this relay.</p>
              <div className="db-key-empty-action">
                <button
                  className="primary-button"
                  type="button"
                  disabled={createKeyMutation.isPending}
                  onClick={() => createKeyMutation.mutate()}
                >
                  {createKeyMutation.isPending ? "Creating…" : "Create API Key"}
                </button>
              </div>
            </div>
          )}

          {!keysQuery.isLoading && !keysQuery.isError && keys.length > 0 && (
            <div>
              {keys.map((entry, index) => {
                const createdDate = entry.createdAt?.split("T")[0] ?? "";

                return (
                  <div className="db-key-item" key={entry.id}>
                    <div className="db-key-row">
                      <div className="db-key-main">
                        <div className="db-key-primary">
                          <code className="db-key-prefix">{entry.keyPrefix}…</code>
                          {index === 0 && <span className="db-key-badge">active</span>}
                        </div>
                        <div className="db-key-meta">
                          {entry.label && <span className="db-key-label">{entry.label}</span>}
                          {createdDate && <span className="db-key-date">{createdDate}</span>}
                        </div>
                      </div>

                      <div className="db-key-actions">
                        <button
                          className="db-key-del"
                          type="button"
                          disabled={deleteKeyMutation.isPending}
                          onClick={() => deleteKeyMutation.mutate(entry.id)}
                          aria-label="Delete key"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
