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
import { Plus, FolderOpen, ChevronUp } from "lucide-react";
import { GodotOfficeFrame } from "@/components/GodotOfficeFrame";
import { useSessionsStore } from "@/store/sessions";
import { useAuthStore } from "@/store/auth";
import { RELAY_BASE } from "@/lib/config";
import { api } from "@/lib/api";
import { resolveOfficeConnected } from "@/lib/office-connection";
import {
  formatLaunchError,
  getParentDirectory,
  shouldShowOfficeHeaderText,
} from "@/lib/office-launch";
import { detectMobilePlatform } from "@/lib/live-recovery";

export function OfficePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useSessionsStore((s) => s.sessions);
  const fetchSessions = useSessionsStore((s) => s.fetchSessions);
  const connected = useSessionsStore((s) => s.connected);
  const relayOnline = useSessionsStore((s) => s.relayOnline);
  const officeConnected = resolveOfficeConnected({ eventsConnected: connected, relayOnline });
  const platform = detectMobilePlatform();
  const showOfficeHeaderText = shouldShowOfficeHeaderText(platform);

  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [launchTitle, setLaunchTitle] = useState("");
  const [launchCwd, setLaunchCwd] = useState("");
  const [launchProvider, setLaunchProvider] = useState<"claude" | "codex">("claude");
  const [launchPending, setLaunchPending] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [dirs, setDirs] = useState<string[]>([]);
  const [homedir, setHomedir] = useState("");
  const [dirsError, setDirsError] = useState("");
  const [currentDir, setCurrentDir] = useState("");

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
      setDirsError("");
      setCurrentDir(data.path || dirPath || data.home || "");
      if (!dirPath && data.home) {
        setHomedir(data.home);
        setLaunchCwd((prev) => prev || data.home);
      }
      setDirs(data.dirs ?? []);
    } catch (err) {
      setDirs([]);
      setDirsError(formatLaunchError(err instanceof Error ? err.message : "request_failed"));
    }
  }

  async function handleLaunch() {
    const title = launchTitle.trim();
    if (!title) return;

    if (!officeConnected) {
      setLaunchError("Your connected computer is offline. Reconnect `ato start` and try again.");
      return;
    }

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
      void fetchSessions().catch(() => {});
      setShowLaunchDialog(false);
      setLaunchTitle("");
      setLaunchCwd("");
      setDirsError("");
      setCurrentDir("");
    } catch (err) {
      setLaunchError(formatLaunchError(err instanceof Error ? err.message : "Launch failed"));
    } finally {
      setLaunchPending(false);
    }
  }

  function openLaunchDialog() {
    setLaunchProvider("claude");
    setLaunchTitle("");
    setLaunchCwd("");
    setLaunchError("");
    setDirsError("");
    setDirs([]);
    setCurrentDir("");
    setShowLaunchDialog(true);
    void fetchDirs();
  }

  const parentDir = getParentDirectory(launchCwd || currentDir);
  const canGoUp = Boolean(parentDir) && parentDir !== (launchCwd || currentDir);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          {showOfficeHeaderText ? (
            <div className="pl-12">
              <p className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                AgentOffice
              </p>
              <h1 className="text-lg font-bold leading-tight">Office</h1>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              officeConnected
                ? "border-green-200 bg-green-50 text-green-700"
                : "text-muted-foreground"
            }
          >
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                officeConnected ? "bg-green-500" : "bg-muted-foreground"
              }`}
            />
            {officeConnected ? "Live" : "Offline"}
          </Badge>
          <Button size="sm" variant="outline" onClick={openLaunchDialog}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Launch Worker
          </Button>
        </div>
      </header>

      {/* Godot Frame — hidden while dialog is open so iframe doesn't cover the overlay */}
      <section className={`flex-1 flex justify-center min-h-0 overflow-hidden${showLaunchDialog ? " invisible" : ""}`}>
        <div className="w-full md:max-w-[480px]">
          <GodotOfficeFrame
            connected={officeConnected}
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
              <p className="text-xs text-muted-foreground">
                Browse folders from your connected computer, or type an absolute path manually.
              </p>
              {currentDir ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{currentDir}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={!canGoUp}
                    onClick={() => {
                      if (!canGoUp) return;
                      setLaunchCwd(parentDir);
                      void fetchDirs(parentDir);
                    }}
                  >
                    <ChevronUp className="mr-1 h-3.5 w-3.5" />
                    Up
                  </Button>
                </div>
              ) : null}
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
              {dirsError ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {dirsError}
                </div>
              ) : null}
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
