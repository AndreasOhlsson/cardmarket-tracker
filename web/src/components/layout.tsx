import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import GlobalSearch from "@/components/global-search";

const NAV_ITEMS = [
  { path: "/", label: "Deals", icon: "⚔️" },
  { path: "/watchlist", label: "Watchlist", icon: "👁" },
  { path: "/stats", label: "Stats", icon: "📊" },
];

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex md:hidden items-center gap-3 px-4 h-14 bg-sidebar border-b border-sidebar-border">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 -ml-1.5 text-sidebar-foreground"
          aria-label="Open menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link to="/" className="font-display text-sm text-primary tracking-wide">
          Planeswalker's Trading Desk
        </Link>
        <div className="flex-1 max-w-xs ml-auto">
          <GlobalSearch />
        </div>
      </div>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden animate-backdrop-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ease-in-out",
          "md:static md:w-56 md:translate-x-0 md:shrink-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg text-primary tracking-wide">
              Planeswalker's
            </h1>
            <p className="font-display text-xs text-muted-foreground tracking-widest uppercase">
              Trading Desk
            </p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-3 pt-3">
          <GlobalSearch onNavigate={() => setSidebarOpen(false)} />
        </div>

        <nav className="flex-1 p-2 space-y-1 mt-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                location.pathname === item.path
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground">
          MTG Deal Finder
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
