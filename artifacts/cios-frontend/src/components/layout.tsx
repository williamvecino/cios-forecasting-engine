import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FlaskConical,
  TrendingUp,
  Radio,
  BookOpen,
  Library,
  BarChart3,
  Rss,
  ListChecks,
  Cpu,
  ChevronRight,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

const navItems = [
  { name: "Overview", path: "/", icon: LayoutDashboard },
  { name: "Forecast Cases", path: "/cases", icon: FlaskConical },
  { name: "Run Forecast", path: "/cases/active/forecast", icon: TrendingUp, isSub: true },
  { name: "Signal Detection", path: "/cases/active/discover", icon: Sparkles, isSub: true },
  { name: "Signal Register", path: "/cases/active/signals", icon: Radio, isSub: true },
  { name: "Analog Matches", path: "/cases/active/analogs", icon: Library, isSub: true },
  { name: "Agent Simulation", path: "/cases/active/agents", icon: Users, isSub: true },
  { name: "Case Library", path: "/case-library", icon: BookOpen },
  { name: "Calibration", path: "/calibration", icon: BarChart3 },
  { name: "Field Intelligence", path: "/field-intelligence", icon: Rss },
  { name: "Signal Watchlist", path: "/watchlist", icon: ListChecks },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    if (path.includes("/cases/active")) {
      const basePath = path.replace("/cases/active", "");
      return location.startsWith("/cases/") && location.endsWith(basePath) && location !== "/cases";
    }
    return location.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground selection:bg-primary/30">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col z-20 shadow-2xl">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-border/50 gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-bold text-sm text-foreground tracking-wide">CIOS</div>
            <div className="text-[10px] text-muted-foreground leading-none">HCP Adoption Forecast Engine</div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-5 px-3 space-y-0.5">
          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3 px-2">
            Platform
          </div>
          {navItems.map((item) => {
            const active = isActive(item.path);
            const actualPath = item.path.includes("/cases/active")
              ? location.startsWith("/cases/") && location !== "/cases"
                ? location.split("/").slice(0, 3).join("/") + item.path.replace("/cases/active", "")
                : "/cases"
              : item.path;

            return (
              <Link
                key={item.name}
                href={actualPath}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-[13px] font-medium",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  item.isSub && "ml-5 text-[12px]"
                )}
              >
                <item.icon
                  className={cn(
                    "shrink-0",
                    item.isSub ? "w-3.5 h-3.5" : "w-4 h-4",
                    active ? "text-primary" : "text-muted-foreground/70"
                  )}
                />
                <span>{item.name}</span>
                {active && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
              </Link>
            );
          })}
        </div>

        {/* Footer status */}
        <div className="p-3 border-t border-border/50">
          <div className="bg-muted/20 px-3 py-2.5 rounded-lg border border-border/30 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
            <div>
              <div className="text-[11px] font-medium text-foreground">Engine ready</div>
              <div className="text-[10px] text-muted-foreground">Bayesian core active</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-[400px] bg-primary/4 blur-[120px] rounded-full pointer-events-none -z-10" />
        <div className="flex-1 overflow-y-auto p-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
