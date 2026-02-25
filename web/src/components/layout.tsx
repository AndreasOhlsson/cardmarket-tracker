import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Deals", icon: "\u2694\uFE0F" },
  { path: "/watchlist", label: "Watchlist", icon: "\uD83D\uDC41" },
  { path: "/stats", label: "Stats", icon: "\uD83D\uDCCA" },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <h1 className="font-display text-lg text-primary tracking-wide">
            Planeswalker's
          </h1>
          <p className="font-display text-xs text-muted-foreground tracking-widest uppercase">
            Trading Desk
          </p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
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

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
