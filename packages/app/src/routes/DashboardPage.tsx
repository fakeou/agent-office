import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { RELAY_BASE } from "../lib/config";
import { useAuthStore } from "../store/auth";
import { useSessionsStore } from "../store/sessions";
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

export function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
  const connected = useSessionsStore((s) => s.connected);
  const [latestKey, setLatestKey] = useState("");
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
    onSuccess: (data) => {
      setLatestKey(data.key);
      void queryClient.invalidateQueries({ queryKey: ["keys"] });
    }
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: string) =>
      api<{ ok: boolean }>(`/api/keys/${encodeURIComponent(keyId)}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["keys"] });
    }
  });

  useEffect(() => {
    if (userQuery.data) setUser(userQuery.data);
  }, [setUser, userQuery.data]);

  const firstKeyPrefix = keysQuery.data?.keys?.[0]?.keyPrefix;

  // Format command with line-continuation for readability
  const startupCommand = useMemo(() => {
    const key = latestKey
      ? latestKey
      : firstKeyPrefix
        ? `${firstKeyPrefix}...`
        : "<your-api-key>";
    return `agenttown start \\\n  --key ${key} \\\n  --relay ${RELAY_BASE}`;
  }, [latestKey, firstKeyPrefix]);

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const displayName = userQuery.data?.displayName || user?.displayName;
  const email = userQuery.data?.email || user?.email;
  const avatarLetter = (displayName || email || "U")[0].toUpperCase();
  const keys = keysQuery.data?.keys ?? [];

  if (!token) return <Navigate to="/auth" replace />;

  return (
    <div className="db-page">
      <div className="db-frame">

        {/* Header */}
        <header className="db-topbar">
          <MenuButton />
          <span className="db-brand">Dashboard</span>
        </header>

        {/* Profile + API Keys */}
        <div className="db-card">
          <div className="db-profile">
            <div className="db-avatar">{avatarLetter}</div>
            <div>
              <p className="db-profile-name">{displayName || email || "User"}</p>
              {displayName && <p className="db-profile-email">{email}</p>}
            </div>
          </div>

          <div className="db-section-head">
            <span className="db-label">API Keys</span>
            <button
              className="db-new-btn"
              type="button"
              disabled={createKeyMutation.isPending}
              onClick={() => createKeyMutation.mutate()}
            >
              {createKeyMutation.isPending ? "Creating…" : "+ New Key"}
            </button>
          </div>

          {keysQuery.isLoading && <p className="db-empty">Loading…</p>}
          {keysQuery.isError && <p className="db-err">Failed to load keys.</p>}

          {keys.map((key) => (
            <div className="db-key-row" key={key.id}>
              <code className="db-key-prefix">{key.keyPrefix}…</code>
              <span className="db-key-label">{key.label || "workshop"}</span>
              <span className="db-key-date">{key.createdAt?.split("T")[0] ?? ""}</span>
              <button
                className="db-key-del"
                type="button"
                disabled={deleteKeyMutation.isPending}
                onClick={() => deleteKeyMutation.mutate(key.id)}
                aria-label="Delete key"
              >
                ×
              </button>
            </div>
          ))}

          {!keysQuery.isLoading && !keysQuery.isError && keys.length === 0 && (
            <p className="db-empty">No API keys yet.</p>
          )}
        </div>

        {/* New key banner — appears after creation */}
        {latestKey && (
          <div className="db-new-key-card">
            <p className="db-new-key-notice">
              Key created — copy it now, this is the only time the full value is shown.
            </p>
            <div className="db-cmd-block">
              <pre className="db-cmd-pre">{latestKey}</pre>
            </div>
            <div className="db-cmd-footer">
              <button
                className="db-copy-btn"
                type="button"
                onClick={() => void handleCopy(latestKey)}
              >
                Copy Key
              </button>
            </div>
          </div>
        )}

        {/* Start Daemon */}
        <div className="db-card">
          <div className="db-section-head">
            <span className="db-label">Start Daemon</span>
            <span className={`db-status${connected ? " db-status--online" : ""}`}>
              {connected ? "online" : "offline"}
            </span>
          </div>
          <div className="db-cmd-block">
            <pre className="db-cmd-pre">{startupCommand}</pre>
          </div>
          <div className="db-cmd-footer">
            <button
              className="db-copy-btn"
              type="button"
              onClick={() => void handleCopy(startupCommand)}
            >
              Copy command
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
