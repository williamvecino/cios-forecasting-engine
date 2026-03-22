import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Radio,
  BarChart3,
  Cpu,
  ChevronRight,
  Target,
  BookOpen,
  FileText,
  Sparkles,
  ClipboardCheck,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  name: string;
  path: string;
  icon: React.FC<any>;
  tooltip: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Decision",
    items: [
      { name: "Questions", path: "/cases", icon: FileText, tooltip: "Define the decision the system will forecast." },
      { name: "Adopter Discovery", path: "/discovery", icon: Sparkles, tooltip: "Identify physicians or institutions to evaluate." },
    ],
  },
  {
    title: "Evidence",
    items: [
      { name: "Signal Detection", path: "/signal-detection", icon: Radar, tooltip: "Scan sources to extract candidate signals." },
      { name: "Signals", path: "/watchlist", icon: Radio, tooltip: "Evidence that influences predictions." },
      { name: "Signal Review", path: "/review", icon: ClipboardCheck, tooltip: "Approve signals before they affect forecasts." },
    ],
  },
  {
    title: "Prediction",
    items: [
      { name: "Dashboard", path: "/dashboard", icon: Target, tooltip: "Current probability forecasts." },
      { name: "Forecast Ledger", path: "/case-library", icon: BookOpen, tooltip: "History of forecast changes." },
    ],
  },
  {
    title: "Learning",
    items: [
      { name: "Calibration", path: "/calibration", icon: BarChart3, tooltip: "Measure forecast accuracy." },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const isActive = (path: string) => {
    if (path === "/dashboard") return location === "/" || location === "/dashboard";
    if (path === "/cases") return location === "/cases" || location.startsWith("/case/");
    return location.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground selection:bg-primary/30">
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col z-20 shadow-2xl">
        <div className="h-16 flex items-center px-5 border-b border-border/50 gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-bold text-sm text-foreground tracking-wide">CIOS</div>
            <div className="text-[10px] text-muted-foreground leading-none">Strategic Intelligence Engine</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-3">
          {navSections.map((section, sIdx) => (
            <div key={section.title} className={cn(sIdx > 0 && "mt-5")}>
              <div className="px-3 mb-2">
                <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.12em]">
                  {section.title}
                </div>
              </div>

              {section.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <div key={item.name} className="relative">
                    <Link
                      href={item.path}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-150 text-[13px] font-medium mb-0.5",
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                      onMouseEnter={() => setHoveredItem(item.name)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <item.icon
                        className={cn(
                          "w-4 h-4 shrink-0",
                          active ? "text-primary" : "text-muted-foreground/70"
                        )}
                      />
                      <span>{item.name}</span>
                      {active && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
                    </Link>

                    {hoveredItem === item.name && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none">
                        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl shadow-black/30 whitespace-nowrap">
                          <p className="text-xs text-foreground">{item.tooltip}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border/50">
          <div className="bg-muted/20 px-3 py-2.5 rounded-lg border border-border/30 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
            <div>
              <div className="text-[11px] font-medium text-foreground">Engine ready</div>
              <div className="text-[10px] text-muted-foreground">All systems operational</div>
            </div>
          </div>
        </div>
      </aside>

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
