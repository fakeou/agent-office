import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { RELAY_BASE } from "@/lib/config";
import { useAuthStore } from "@/store/auth";

type User = { email: string; displayName?: string };
type KeyRecord = { id: string; keyPrefix: string; label?: string; createdAt?: string };
type KeysResponse = { keys: KeyRecord[] };
type CreateKeyResponse = { key: string };

const DEFAULT_RELAY_URL = "https://agentoffice.top";

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => void handleCopy()}>
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="rounded-lg border bg-muted/50 overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <CopyInline text={code} />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">{code}</pre>
    </div>
  );
}

function buildEnvSetupCommand(apiKey: string, relayUrl: string) {
  const lines = [`export AGENTOFFICE_API_KEY=${apiKey}`];
  if (relayUrl !== DEFAULT_RELAY_URL) lines.push(`export AGENTOFFICE_RELAY_URL=${relayUrl}`);
  lines.push("ato start");
  return lines.join("\n");
}

function buildFlagSetupCommand(apiKey: string, relayUrl: string) {
  const parts = ["ato", "start", "--key", apiKey];
  if (relayUrl !== DEFAULT_RELAY_URL) parts.push("--relay", relayUrl);
  return parts.join(" ");
}

function SetupModal({
  apiKey,
  relayUrl,
  open,
  onClose,
}: {
  apiKey: string;
  relayUrl: string;
  open: boolean;
  onClose: () => void;
}) {
  const envCommand = buildEnvSetupCommand(apiKey, relayUrl);
  const flagCommand = buildFlagSetupCommand(apiKey, relayUrl);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API Key Created</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Each account can have only one API key. Save it now. To generate a new one later, delete the current key first.
          </p>
          <CodeBlock code={apiKey} label="Current API Key" />
          <p className="text-sm text-muted-foreground">
            Option A: export the key as an env variable, then run <code className="rounded bg-muted px-1 py-0.5 text-xs">ato start</code>.
          </p>
          <CodeBlock code={envCommand} label="Export env and start" />
          <div className="text-center text-xs text-muted-foreground">or</div>
          <p className="text-sm text-muted-foreground">
            Option B: skip environment variables and run a single command.
          </p>
          <CodeBlock code={flagCommand} label="ato start --key" />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    enabled: Boolean(token),
  });

  const keysQuery = useQuery({
    queryKey: ["keys"],
    queryFn: () => api<KeysResponse>("/api/keys"),
    enabled: Boolean(token),
  });

  const createKeyMutation = useMutation({
    mutationFn: () =>
      api<CreateKeyResponse>("/api/keys", {
        method: "POST",
        body: JSON.stringify({ label: "office" }),
      }),
    onSuccess: async (data) => {
      setLatestKey(data.key);
      setShowSetupModal(true);
      await queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: string) =>
      api<{ ok: boolean }>("/api/keys", {
        method: "POST",
        body: JSON.stringify({ intent: "delete", keyId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  useEffect(() => {
    if (userQuery.data) setUser(userQuery.data);
  }, [setUser, userQuery.data]);

  const keys = keysQuery.data?.keys ?? [];
  const relayUrl = RELAY_BASE.startsWith("http") ? RELAY_BASE : window.location.origin;
  const usesDefaultRelay = relayUrl === DEFAULT_RELAY_URL;

  const displayName = userQuery.data?.displayName || user?.displayName;
  const email = userQuery.data?.email || user?.email;
  const avatarLetter = (displayName || email || "U")[0].toUpperCase();

  if (!token) return <Navigate to="/auth" replace />;

  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
      <SetupModal
        apiKey={latestKey}
        relayUrl={relayUrl}
        open={showSetupModal && Boolean(latestKey)}
        onClose={() => setShowSetupModal(false)}
      />

      <div className="w-full max-w-[520px] px-6 pb-14 pt-8">
        {/* Topbar */}
        <header className="mb-5 flex items-center gap-3 pl-12">
          <span className="text-sm font-semibold">Dashboard</span>
        </header>

        {/* Profile Card */}
        <Card className="mb-3">
          <div className="flex items-center gap-3.5 p-5">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-foreground text-background text-sm font-bold">
                {avatarLetter}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              {userQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ) : (
                <>
                  <p className="truncate text-sm font-semibold">{displayName || email || "User"}</p>
                  {displayName && (
                    <p className="truncate text-xs text-muted-foreground">{email}</p>
                  )}
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* API Key Section Header */}
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
              API Key
            </span>
            {keys.length === 0 && !keysQuery.isLoading && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={createKeyMutation.isPending}
                onClick={() => createKeyMutation.mutate()}
              >
                {createKeyMutation.isPending ? "Creating..." : "Create Key"}
              </Button>
            )}
          </div>

          <Separator />

          <div className="px-5 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Recommended: set <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">AGENTOFFICE_API_KEY</code> and then run{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">ato start</code>.
              {!usesDefaultRelay && (
                <> If you are not using the default hosted relay, also set <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">AGENTOFFICE_RELAY_URL</code>.</>
              )}
            </p>
          </div>

          <Separator />

          {/* Loading */}
          {keysQuery.isLoading && (
            <div className="space-y-3 p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
          )}

          {/* Error */}
          {keysQuery.isError && (
            <div className="p-5">
              <p className="text-sm text-destructive">Failed to load keys.</p>
            </div>
          )}

          {/* Empty */}
          {!keysQuery.isLoading && !keysQuery.isError && keys.length === 0 && (
            <div className="p-5 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                No API key. Create one to connect <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">ato start</code> to this relay.
              </p>
              <Button
                disabled={createKeyMutation.isPending}
                onClick={() => createKeyMutation.mutate()}
              >
                {createKeyMutation.isPending ? "Creating..." : "Create API Key"}
              </Button>
            </div>
          )}

          {/* Key list */}
          {!keysQuery.isLoading && !keysQuery.isError && keys.length > 0 && (
            <div>
              {keys.map((entry, index) => {
                const createdDate = entry.createdAt?.split("T")[0] ?? "";
                return (
                  <div key={entry.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono font-medium">{entry.keyPrefix}...</code>
                        {index === 0 && (
                          <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 text-[0.65rem]">
                            active
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                        {entry.label && <span>{entry.label}</span>}
                        {createdDate && <span>{createdDate}</span>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={deleteKeyMutation.isPending}
                      onClick={() => deleteKeyMutation.mutate(entry.id)}
                      aria-label="Delete key"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
