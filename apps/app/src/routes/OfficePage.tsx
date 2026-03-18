import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, FolderOpen } from "lucide-react";
import { MenuButton } from "@/components/layout/NavSheet";
import { GodotOfficeFrame } from "@/components/GodotOfficeFrame";
import { useSessionsStore } from "@/store/sessions";
import { useAuthStore } from "@/store/auth";
import { RELAY_BASE } from "@/lib/config";
import { api } from "@/lib/api";
import { detectMobilePlatform, platformRecoveryMessage } from "@/lib/live-recovery";

export function OfficePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useSessionsStore((s) => s.sessions);
  const connected = useSessionsStore((s) => s.connected);
  const platform = detectMobilePlatform();
  const showMobileGuidance = platform !== "web";

  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [launchTitle, setLaunchTitle] = useState("");
  const [launchCwd, setLaunchCwd] = useState("");
  const [launchProvider, setLaunchProvider] = useState<"claude" | "codex">("claude");
  const [launchPending, setLaunchPending] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [dirs, setDirs] = useState<string[]>([]);
  const [homedir, setHomedir] = useState("");

  function onWorkerClick(sessionId: string) {
    if (location.pathname !== "/office") return;
    navigate(`/terminal/${sessionId}`, {
      state: { backgroundLocation: location },
    });
  }

  async function fetchDirs(dirPath?: string) {
    const { userId } = useAuthStore.getState();
    try {
      const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      const data = await api(`${RELAY_BASE}/tunnel/${userId}/api/dirs${query}`) as {
        home: string; path: string; dirs: string[];
      };
      if (!dirPath && data.home) {
        setHomedir(data.home);
        setLaunchCwd((prev) => prev || data.home);
      }
      setDirs(data.dirs ?? []);
    } catch { /* offline */ }
  }

  async function handleLaunch() {
    const title = launchTitle.trim();
    if (!title) return;

    setLaunchPending(true);
    setLaunchError("");

    const { userId } = useAuthStore.getState();
    const providerLabel = launchProvider === "claude" ? "Claude" : "Codex";
    const command =
      launchProvider === "claude"
        ? "claude --dangerously-skip-permissions"
        : "codex";

    try {
      await api(`${RELAY_BASE}/tunnel/${userId}/api/sessions/launch`, {
        method: "POST",
        body: JSON.stringify({
          provider: launchProvider,
          command,
          title: title || `${providerLabel} Session`,
          ...(launchCwd && { cwd: launchCwd }),
          transport: "tmux",
        }),
      });
      setShowLaunchDialog(false);
      setLaunchTitle("");
      setLaunchCwd("");
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunchPending(false);
    }
  }

  function openLaunchDialog() {
    setLaunchProvider("claude");
    setLaunchTitle("");
    setLaunchCwd("");
    setLaunchError("");
    setDirs([]);
    setShowLaunchDialog(true);
    void fetchDirs();
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <MenuButton />
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
              AgentOffice
            </p>
            <h1 className="text-lg font-bold leading-tight">Office</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              connected
                ? "border-green-200 bg-green-50 text-green-700"
                : "text-muted-foreground"
            }
          >
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                connected ? "bg-green-500" : "bg-muted-foreground"
              }`}
            />
            {connected ? "Live" : "Offline"}
          </Badge>
          <Button size="sm" variant="outline" onClick={openLaunchDialog}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Launch Worker
          </Button>
        </div>
      </header>

      {showMobileGuidance && (
        <section className="px-5 pb-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
              {platform === "ios" ? "iOS Guidance" : "Android Guidance"}
            </p>
            <p className="mt-1 leading-5">
              {platformRecoveryMessage(platform)}
            </p>
          </div>
        </section>
      )}

      {/* Godot Frame — hidden while dialog is open so iframe doesn't cover the overlay */}
      <section className={`flex-1 flex justify-center min-h-0 overflow-hidden${showLaunchDialog ? " invisible" : ""}`}>
        <div className="w-full md:max-w-[480px]">
          <GodotOfficeFrame
            connected={connected}
            sessions={sessions}
            onWorkerClick={onWorkerClick}
          />
        </div>
      </section>

      {/* Launch Dialog */}
      <Dialog open={showLaunchDialog} onOpenChange={setShowLaunchDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Launch Worker</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {launchError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {launchError}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="launch-title">Session Title</Label>
              <Input
                id="launch-title"
                placeholder="e.g., Fix login bug"
                value={launchTitle}
                onChange={(e) => setLaunchTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !launchPending && handleLaunch()}
              />
            </div>
            <div className="grid gap-2">
              <Label>Agent</Label>
              <div className="flex gap-2">
                <Button
                  variant={launchProvider === "claude" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLaunchProvider("claude")}
                >
                  Claude
                </Button>
                <Button
                  variant={launchProvider === "codex" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLaunchProvider("codex")}
                >
                  Codex
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="launch-cwd">Working Directory</Label>
              <div className="flex gap-1.5">
                <Input
                  id="launch-cwd"
                  placeholder={homedir || "/Users/you/project (optional)"}
                  value={launchCwd}
                  onChange={(e) => {
                    setLaunchCwd(e.target.value);
                    void fetchDirs(e.target.value);
                  }}
                />
                {homedir && launchCwd !== homedir && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    title="Go to home directory"
                    onClick={() => { setLaunchCwd(homedir); void fetchDirs(homedir); }}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {dirs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {dirs.map((d) => (
                    <button
                      key={d}
                      onClick={() => { setLaunchCwd(d); void fetchDirs(d); }}
                      className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[0.7rem] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      {d.split("/").pop()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLaunchDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleLaunch()}
              disabled={!launchTitle.trim() || launchPending}
            >
              {launchPending ? "Launching..." : "Launch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
