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
import { Plus } from "lucide-react";
import { MenuButton } from "@/components/layout/NavSheet";
import { GodotWorkshopFrame } from "@/components/GodotWorkshopFrame";
import { useSessionsStore } from "@/store/sessions";
import { useAuthStore } from "@/store/auth";
import { RELAY_BASE } from "@/lib/config";
import { api } from "@/lib/api";

export function WorkshopPlaceholderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useSessionsStore((s) => s.sessions);
  const connected = useSessionsStore((s) => s.connected);

  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [launchTitle, setLaunchTitle] = useState("");
  const [launchCwd, setLaunchCwd] = useState("");
  const [launchProvider, setLaunchProvider] = useState<"claude" | "codex">("claude");
  const [launchPending, setLaunchPending] = useState(false);
  const [launchError, setLaunchError] = useState("");

  function onWorkerClick(sessionId: string) {
    if (location.pathname !== "/workshop") return;
    navigate(`/terminal/${sessionId}`, {
      state: { backgroundLocation: location },
    });
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

  function openLaunchDialog(provider: "claude" | "codex") {
    setLaunchProvider(provider);
    setLaunchTitle("");
    setLaunchCwd("");
    setLaunchError("");
    setShowLaunchDialog(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <MenuButton />
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
              AgentTown
            </p>
            <h1 className="text-lg font-bold leading-tight">Workshop</h1>
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
          <Button size="sm" variant="outline" onClick={() => openLaunchDialog("claude")}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Claude
          </Button>
          <Button size="sm" variant="outline" onClick={() => openLaunchDialog("codex")}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Codex
          </Button>
        </div>
      </header>

      {/* Godot Frame */}
      <section className="flex-1">
        <GodotWorkshopFrame
          connected={connected}
          sessions={sessions}
          onWorkerClick={onWorkerClick}
        />
      </section>

      {/* Launch Dialog */}
      <Dialog open={showLaunchDialog} onOpenChange={setShowLaunchDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Launch {launchProvider === "claude" ? "Claude" : "Codex"}
            </DialogTitle>
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
              <Input
                id="launch-cwd"
                placeholder="/Users/you/project (optional)"
                value={launchCwd}
                onChange={(e) => setLaunchCwd(e.target.value)}
              />
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
