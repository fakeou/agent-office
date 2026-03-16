import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

/* -----------------------------------------------
   Context
   ----------------------------------------------- */

type NavContextValue = {
  openNav: () => void;
};

const NavContext = createContext<NavContextValue>({ openNav: () => {} });

export function useNav() {
  return useContext(NavContext);
}

/* -----------------------------------------------
   Menu button (hamburger) — light variant
   ----------------------------------------------- */

export function MenuButton({ dark = false }: { dark?: boolean }) {
  const { openNav } = useNav();
  return (
    <button
      className={`menu-btn${dark ? " menu-btn--dark" : ""}`}
      type="button"
      onClick={openNav}
      aria-label="Open navigation"
    >
      <span />
      <span />
      <span />
    </button>
  );
}

/* -----------------------------------------------
   NavProvider — wraps the whole app
   ----------------------------------------------- */

export function NavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  function close() {
    setOpen(false);
  }

  function go(path: string) {
    close();
    navigate(path);
  }

  async function logout() {
    close();
    try {
      await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout transport failures; local auth still gets cleared.
    }
    clearAuth();
    navigate("/auth", { replace: true });
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <NavContext.Provider value={{ openNav: () => setOpen(true) }}>
      {children}

      {/* Backdrop */}
      {open && <div className="nav-backdrop" onClick={close} />}

      {/* Sidebar panel */}
      <aside className={`nav-sidebar${open ? " nav-sidebar--open" : ""}`} aria-hidden={!open}>
        <div className="nav-sidebar-head">
          <div className="brand-mark" style={{ margin: 0 }}>AT</div>
          <button className="nav-close-btn" type="button" onClick={close} aria-label="Close navigation">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {token && user && (
          <div className="nav-user">
            <strong className="nav-user-name">{user.displayName || "User"}</strong>
            <span className="nav-user-email">{user.email}</span>
          </div>
        )}

        {token && (
          <nav className="nav-links">
            <button
              className={`nav-link${isActive("/workshop") ? " nav-link--active" : ""}`}
              type="button"
              onClick={() => go("/workshop")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              Workshop
            </button>
            <button
              className={`nav-link${isActive("/dashboard") ? " nav-link--active" : ""}`}
              type="button"
              onClick={() => go("/dashboard")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.4" />
                <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Dashboard
            </button>
          </nav>
        )}

        <div className="nav-footer">
          {token && (
            <button className="nav-link nav-link--danger" type="button" onClick={() => void logout()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Log Out
            </button>
          )}
        </div>
      </aside>
    </NavContext.Provider>
  );
}
