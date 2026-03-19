import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LayoutGrid, User, LogOut, Menu } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

type NavContextValue = { openNav: () => void };
const NavContext = createContext<NavContextValue>({ openNav: () => {} });
export function useNav() {
  return useContext(NavContext);
}

export function MenuButton({ dark = false }: { dark?: boolean }) {
  const { openNav } = useNav();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={
        dark
          ? "h-8 w-8 text-terminal-muted hover:text-terminal-text hover:bg-white/5"
          : "h-8 w-8"
      }
      onClick={openNav}
      aria-label="Open navigation"
    >
      <Menu className="h-4 w-4" />
    </Button>
  );
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  async function logout() {
    setOpen(false);
    try {
      await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout transport failures
    }
    clearAuth();
    navigate("/auth", { replace: true });
  }

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/office", label: "Office", icon: LayoutGrid },
    { path: "/dashboard", label: "Dashboard", icon: User },
  ];

  return (
    <NavContext.Provider value={{ openNav: () => setOpen(true) }}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-72 max-w-[82vw] p-0"
          style={{
            paddingTop: "calc(env(safe-area-inset-top) + 8px)",
            paddingLeft: "env(safe-area-inset-left)",
          }}
        >
          <SheetHeader className="p-5 pb-4">
            <SheetTitle className="flex items-center gap-2.5">
              <img src="/favicon.png" alt="AgentOffice" className="h-8 w-8 rounded-lg object-contain" />
              <span className="text-sm font-semibold">AgentOffice</span>
            </SheetTitle>
          </SheetHeader>

          {token && user && (
            <>
              <div className="px-5 pb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-foreground text-background text-xs font-bold">
                      {(user.displayName || user.email || "U")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.displayName || "User"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          <nav className="flex-1 px-2 py-2">
            {token &&
              navItems.map(({ path, label, icon: Icon }) => (
                <Button
                  key={path}
                  variant={isActive(path) ? "secondary" : "ghost"}
                  className={`w-full justify-start gap-2.5 ${
                    isActive(path) ? "bg-orange-50 text-primary hover:bg-orange-100" : ""
                  }`}
                  onClick={() => go(path)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
          </nav>

          <Separator />
          <div className="p-2">
            {token && (
              <Button
                variant="ghost"
                className="w-full justify-start gap-2.5 text-destructive hover:text-destructive"
                onClick={() => void logout()}
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </NavContext.Provider>
  );
}
