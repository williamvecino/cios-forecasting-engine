import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  Activity, 
  Briefcase, 
  Target, 
  Library, 
  BarChart2, 
  Eye, 
  Radio, 
  Cpu,
  ChevronRight
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { name: "Dashboard", path: "/", icon: Activity },
  { name: "Question Engine", path: "/cases", icon: Cpu },
  { name: "Forecast Engine", path: "/cases/active/forecast", icon: Target, isSub: true },
  { name: "Signal Register", path: "/cases/active/signals", icon: Radio, isSub: true },
  { name: "Analog Retrieval", path: "/cases/active/analogs", icon: Library, isSub: true },
  { name: "Case Library", path: "/case-library", icon: Briefcase },
  { name: "Calibration", path: "/calibration", icon: BarChart2 },
  { name: "Field Intelligence", path: "/field-intelligence", icon: Eye },
  { name: "Watchlist", path: "/watchlist", icon: Radio },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  // Highlight logic that handles active cases temporarily
  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    if (path.includes("/cases/active")) {
      // Dynamic matching for any active case sub-route
      const basePath = path.replace("/cases/active", "");
      return location.startsWith("/cases/") && location.endsWith(basePath) && location !== "/cases";
    }
    return location.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground selection:bg-primary/30">
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col z-20 shadow-2xl">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <div className="flex items-center gap-3 text-primary">
            <Cpu className="w-6 h-6" />
            <span className="font-display font-bold text-lg tracking-wide text-foreground">CIOS Engine</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-2">Strategic Core</div>
          {navItems.map((item) => {
            const active = isActive(item.path);
            // Quick hack to link to actual cases if we're on a case page
            const actualPath = item.path.includes("/cases/active") 
              ? location.startsWith("/cases/") && location !== "/cases" 
                ? location.split('/').slice(0, 3).join('/') + item.path.replace("/cases/active", "")
                : "/cases" // redirect to cases if no active case
              : item.path;

            return (
              <Link 
                key={item.name} 
                href={actualPath}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-sm font-medium",
                  active 
                    ? "bg-primary/15 text-primary" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  item.isSub && "ml-6 border-l border-border rounded-l-none"
                )}
              >
                <item.icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.name}
                {active && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
              </Link>
            )
          })}
        </div>

        <div className="p-4 border-t border-border/50">
          <div className="bg-muted/30 p-4 rounded-xl border border-border/50 backdrop-blur-sm">
            <div className="text-xs text-muted-foreground">System Status</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
              <div className="text-sm font-medium">Engine Calibrated</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10" />
        
        <div className="flex-1 overflow-y-auto p-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
