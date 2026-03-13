import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { RELAY_BASE } from "../lib/config";
import { useAuthStore } from "../store/auth";

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

type WorkshopStatus = {
  online: boolean;
};

type CreateKeyResponse = {
  key: string;
};

export function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.userId);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
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

  const statusQuery = useQuery({
    queryKey: ["workshop-status", userId],
    queryFn: () => api<WorkshopStatus>(`/api/users/${encodeURIComponent(userId || "")}/status`, { authenticated: false }),
    enabled: Boolean(userId),
    retry: false
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
    mutationFn: (keyId: string) => api<{ ok: boolean }>(`/api/keys/${encodeURIComponent(keyId)}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["keys"] });
    }
  });

  useEffect(() => {
    if (userQuery.data) {
      setUser(userQuery.data);
    }
  }, [setUser, userQuery.data]);

  const firstKeyPrefix = keysQuery.data?.keys?.[0]?.keyPrefix;

  const startupCommand = useMemo(() => {
    if (latestKey) {
      return `agenttown start --key ${latestKey} --relay ${RELAY_BASE}`;
    }
    if (firstKeyPrefix) {
      return `agenttown start --key ${firstKeyPrefix}... --relay ${RELAY_BASE}`;
    }
    return "Create an API key to generate the startup command.";
  }, [firstKeyPrefix, latestKey]);

  const hasCommand = Boolean(latestKey || firstKeyPrefix);

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  if (!token) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="page-shell dashboard-shell">
      <section className="dashboard-frame">
        <header className="dashboard-topbar">
          <div>
            <p className="eyebrow">AgentTown App</p>
            <h1 className="page-title compact">Account and API key control</h1>
          </div>
          <div className="topbar-actions">
            <Link className="ghost-link" to="/workshop">
              Workshop Placeholder
            </Link>
            <button className="secondary-button" type="button" onClick={() => clearAuth()}>
              Log Out
            </button>
          </div>
        </header>

        <div className="dashboard-grid">
          <section className="panel-card section-stack">
            <div>
              <p className="section-label">Account</p>
              <h2 className="section-title">Current operator</h2>
            </div>
            <div className="account-card">
              <strong>{userQuery.data?.displayName || user?.displayName || "User"}</strong>
              <span>{userQuery.data?.email || user?.email || "Loading..."}</span>
            </div>
          </section>

          <section className="panel-card section-stack">
            <div>
              <p className="section-label">API Keys</p>
              <h2 className="section-title">Managed access</h2>
            </div>

            {latestKey ? (
              <div className="message success">
                <div>
                  <strong>New key</strong>
                  <p>Copy it now. This is the only time the full value is shown.</p>
                </div>
                <code className="code-line">{latestKey}</code>
                <button className="secondary-button" onClick={() => void handleCopy(latestKey)} type="button">
                  Copy Key
                </button>
              </div>
            ) : null}

            <div className="key-list">
              {keysQuery.isLoading ? <p className="muted-copy">Loading keys...</p> : null}
              {keysQuery.isError ? <p className="message error">Failed to load keys.</p> : null}
              {keysQuery.data?.keys.length ? (
                keysQuery.data.keys.map((key) => (
                  <article className="key-row" key={key.id}>
                    <div>
                      <strong>{key.keyPrefix}...</strong>
                      <p>{key.label || "workshop"}</p>
                    </div>
                    <div className="key-row-actions">
                      <span>{key.createdAt ? key.createdAt.split(" ")[0] : ""}</span>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={deleteKeyMutation.isPending}
                        onClick={() => deleteKeyMutation.mutate(key.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              ) : keysQuery.isLoading ? null : (
                <p className="muted-copy">No API keys yet.</p>
              )}
            </div>

            <button
              className="primary-button"
              type="button"
              disabled={createKeyMutation.isPending}
              onClick={() => createKeyMutation.mutate()}
            >
              {createKeyMutation.isPending ? "Creating..." : "Create New Key"}
            </button>
          </section>

          <section className="panel-card section-stack span-two">
            <div>
              <p className="section-label">Connection</p>
              <h2 className="section-title">Start your workshop daemon</h2>
            </div>
            <div className="command-block">
              <code className="code-line">{startupCommand}</code>
              <button
                className="secondary-button"
                type="button"
                disabled={!hasCommand}
                onClick={() => void handleCopy(startupCommand)}
              >
                Copy Command
              </button>
            </div>

            <div className="status-row">
              <span className={`status-pill ${statusQuery.data?.online ? "online" : "offline"}`}>
                {statusQuery.data?.online ? "Workshop online" : "Workshop offline"}
              </span>
              {userId ? (
                <a
                  className={`ghost-link ${statusQuery.data?.online ? "" : "disabled-link"}`}
                  href={statusQuery.data?.online ? `/tunnel/${encodeURIComponent(userId)}/workshop.html` : "#"}
                >
                  Open Current Workshop
                </a>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
