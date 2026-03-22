import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PopoverAnchor,
  Popover,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { GodotOfficeFrame } from "@/components/GodotOfficeFrame";
import { useSessionsStore } from "@/store/sessions";
import { useAuthStore } from "@/store/auth";
import { RELAY_BASE } from "@/lib/config";
import { api } from "@/lib/api";
import { resolveOfficeConnected } from "@/lib/office-connection";
import {
  getDirectoryBrowseQuery,
  getDirectoryBrowserPath,
  getDirectoryListClassName,
  getDirectorySuggestionQuery,
  getMatchingDirectoryOptions,
  getDirectoryOptionLabel,
  formatLaunchError,
  getOfficePageViewportHeight,
  getParentDirectory,
  shouldOpenDirectoryBrowserOnLaunchDialogOpen,
  shouldShowOfficeHeaderText,
} from "@/lib/office-launch";
import { getOfficeDiagnosticsRows } from "@/lib/office-diagnostics";
import { getOfficeStageClassName } from "@/lib/office-stage";
import { detectMobilePlatform } from "@/lib/live-recovery";

function DiagRow({
  label,
  state,
  hint,
}: {
  label: string;
  state: "ok" | "offline" | "checking" | "unknown";
  hint?: string;
}) {
  const isOk = state === "ok";
  const isOffline = state === "offline";
  const statusLabel =
    state === "ok"
      ? "Live"
      : state === "offline"
        ? "Offline"
        : state === "checking"
          ? "Checking..."
          : "Unknown";

  return (
    <div className="grid gap-0.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-foreground">{label}</span>
        {isOk ? (
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium text-green-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            {statusLabel}
          </span>
        ) : isOffline ? (
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium text-red-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
            {statusLabel}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            {statusLabel}
          </span>
        )}
      </div>
      {hint && (
        <p className="text-[0.65rem] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function OfficePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useSessionsStore((s) => s.sessions);
  const fetchSessions = useSessionsStore((s) => s.fetchSessions);
  const connected = useSessionsStore((s) => s.connected);
  const relayOnline = useSessionsStore((s) => s.relayOnline);
  const reconnectNow = useSessionsStore((s) => s.reconnectNow);
  const fetchRelayStatus = useSessionsStore((s) => s.fetchRelayStatus);
  const officeConnected = resolveOfficeConnected({ eventsConnected: connected, relayOnline });
  const platform = detectMobilePlatform();
  const showOfficeHeaderText = shouldShowOfficeHeaderText(platform);

  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showDirBrowser, setShowDirBrowser] = useState(false);
  const [dirBrowserMode, setDirBrowserMode] = useState<"suggest" | "browse">("browse");
  const [relayReachable, setRelayReachable] = useState<boolean | null>(null);
  const [launchTitle, setLaunchTitle] = useState("");
  const [launchCwd, setLaunchCwd] = useState("");
  const [launchProvider, setLaunchProvider] = useState<"claude" | "codex">("claude");
  const [launchPending, setLaunchPending] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [dirs, setDirs] = useState<string[]>([]);
  const [homedir, setHomedir] = useState("");
  const [dirsError, setDirsError] = useState("");
  const [currentDir, setCurrentDir] = useState("");
  const diagnosticsRows = getOfficeDiagnosticsRows({ connected, relayOnline, relayReachable });
  const matchingDirs = useMemo(() => {
    if (!showDirBrowser) {
      return dirs;
    }

    if (dirBrowserMode === "browse") {
      return dirs;
    }

    const query = getDirectorySuggestionQuery({
      launchCwd,
      currentDir,
      homedir,
    });

    return getMatchingDirectoryOptions(dirs, query.filterText);
  }, [currentDir, dirBrowserMode, dirs, homedir, launchCwd, showDirBrowser]);

  function onWorkerClick(sessionId: string) {
    navigate(`/terminal/${sessionId}`, {
      state: { backgroundLocation: location },
    });
  }

  async function checkRelayHealth() {
    setRelayReachable(null);
    try {
      await api(`${RELAY_BASE}/api/relay/health`);
      setRelayReachable(true);
    } catch {
      setRelayReachable(false);
    }
  }

  function openDiagnostics() {
    setShowDiagnostics(true);
    void checkRelayHealth();
  }

  function retryConnections() {
    reconnectNow();
    void fetchRelayStatus().catch(() => {});
    void checkRelayHealth();
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
      return true;
    } catch (err) {
      setDirs([]);
      setDirsError(formatLaunchError(err instanceof Error ? err.message : "request_failed"));
      return false;
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
    setDirBrowserMode("browse");
    setShowDirBrowser(shouldOpenDirectoryBrowserOnLaunchDialogOpen());
    setShowLaunchDialog(true);
    void fetchDirs();
  }

  async function browseDirectory(dirPath: string) {
    setLaunchCwd(dirPath);
    setDirBrowserMode("browse");
    setShowDirBrowser(true);
    await fetchDirs(dirPath);
  }

  function handleDirectoryBrowserOpenChange(nextOpen: boolean) {
    setShowDirBrowser(nextOpen);

    if (!nextOpen) {
      return;
    }
  }

  async function openDirectorySuggestions(nextValue: string) {
    setDirBrowserMode("suggest");
    const query = getDirectorySuggestionQuery({
      launchCwd: nextValue,
      currentDir,
      homedir,
    });

    setShowDirBrowser(true);

    if (!query.fetchPath || query.fetchPath === currentDir) {
      return;
    }

    await fetchDirs(query.fetchPath);
  }

  async function toggleDirectoryBrowser() {
    if (showDirBrowser) {
      setShowDirBrowser(false);
      return;
    }

    setDirBrowserMode("browse");
    const query = getDirectoryBrowseQuery({
      launchCwd,
      currentDir,
      homedir,
    });

    setShowDirBrowser(true);

    if (!query.fetchPath || query.fetchPath === currentDir) {
      return;
    }

    const loaded = await fetchDirs(query.fetchPath);
    if (!loaded && query.fallbackPath && query.fallbackPath !== query.fetchPath) {
      await fetchDirs(query.fallbackPath);
    }
  }

  const browsePath = getDirectoryBrowserPath({ currentDir, launchCwd, homedir });
  const parentDir = getParentDirectory(browsePath);
  const canGoUp = Boolean(parentDir) && parentDir !== browsePath;

  return (
    <div
      className="flex flex-col overflow-hidden bg-white"
      style={{ minHeight: getOfficePageViewportHeight() }}
    >
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
          <button
            onClick={openDiagnostics}
            className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="View connection status"
          >
            <Badge
              variant="outline"
              className={
                officeConnected
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-500"
              }
            >
              <span
                className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                  officeConnected ? "bg-green-500" : "bg-red-400"
                }`}
              />
              {officeConnected ? "Live" : "Offline"}
            </Badge>
          </button>
          <Button size="sm" variant="outline" onClick={openLaunchDialog}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Launch Worker
          </Button>
        </div>
      </header>

      {/* Keep the office visible behind dialogs, but disable interaction while overlays are open. */}
      <section className={getOfficeStageClassName(showLaunchDialog || showDiagnostics)}>
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
                Enter folders level by level from your connected computer, or type an absolute path manually.
              </p>
              <Popover open={showDirBrowser} onOpenChange={handleDirectoryBrowserOpenChange}>
                <PopoverAnchor asChild>
                  <div className="relative">
                    <Input
                      id="launch-cwd"
                      className="pr-11"
                      placeholder={homedir || "/Users/you/project (optional)"}
                      value={launchCwd}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setLaunchCwd(nextValue);
                        void openDirectorySuggestions(nextValue);
                      }}
                      onFocus={() => {
                        if (!launchCwd.trim()) {
                          return;
                        }

                        void openDirectorySuggestions(launchCwd);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") {
                          return;
                        }

                        e.preventDefault();
                        void handleLaunch();
                      }}
                    />
                    <button
                      type="button"
                      aria-label={showDirBrowser ? "Hide folders" : "Show folders"}
                      aria-expanded={showDirBrowser}
                      onClick={() => void toggleDirectoryBrowser()}
                      className="absolute inset-y-1 right-1 inline-flex w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${showDirBrowser ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                </PopoverAnchor>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="w-[var(--radix-popover-anchor-width)] overflow-hidden p-0"
                >
                  <div className="overflow-hidden rounded-md border-0 bg-muted/15">
                    <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">
                        {browsePath || homedir || "Select a folder"}
                      </span>
                      <div className="flex items-center gap-1">
                        {homedir ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={browsePath === homedir}
                            onClick={() => void browseDirectory(homedir)}
                          >
                            Home
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={!canGoUp}
                          onClick={() => {
                            if (!canGoUp) {
                              return;
                            }

                            void browseDirectory(parentDir);
                          }}
                        >
                          <ChevronUp className="mr-1 h-3.5 w-3.5" />
                          Up
                        </Button>
                      </div>
                    </div>
                    {dirsError ? (
                      <div className="border-t border-destructive/10 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {dirsError}
                      </div>
                    ) : matchingDirs.length > 0 ? (
                      <div className={getDirectoryListClassName()}>
                        <div className="grid gap-1 p-2">
                          {matchingDirs.map((dirPath) => (
                            <button
                              key={dirPath}
                              type="button"
                              onClick={() => void browseDirectory(dirPath)}
                              className="flex items-center justify-between rounded-md border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-border hover:bg-background"
                            >
                              <span className="truncate font-medium text-foreground">
                                {getDirectoryOptionLabel(dirPath)}
                              </span>
                              <span className="ml-3 shrink-0 text-[0.7rem] text-muted-foreground">
                                Open
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-xs text-muted-foreground">
                        No matching folders found in this directory.
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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

      {/* Diagnostics Dialog */}
      <Dialog open={showDiagnostics} onOpenChange={setShowDiagnostics}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Connection Status</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {diagnosticsRows.map((row, index) => (
              <div key={row.key}>
                {index > 0 ? <div className="mb-3 h-px bg-border" /> : null}
                <DiagRow
                  label={row.label}
                  state={row.state}
                  hint={row.hint}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={retryConnections}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
            <DialogClose asChild>
              <Button size="sm">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
