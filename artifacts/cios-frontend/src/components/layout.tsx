import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  TrendingUp,
  Radio,
  Library,
  BarChart3,
  ListChecks,
  Cpu,
  ChevronRight,
  Users,
  Layers,
  Target,
  BookOpen,
  Compass,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  name: string;
  path: string;
  icon: React.FC<any>;
  isSub?: boolean;
  section?: string;
}

const navItems: NavItem[] = [
  { name: "Strategic Questions", path: "/", icon: Target, section: "Platform" },
  { name: "Probability Forecast", path: "/cases/active/forecast", icon: TrendingUp, isSub: true, section: "Question Detail" },
  { name: "Key Drivers", path: "/cases/active/agents", icon: Users, isSub: true, section: "Question Detail" },
  { name: "Signals", path: "/cases/active/signals", icon: Radio, isSub: true, section: "Question Detail" },
  { name: "Scenario Simulation", path: "/cases/active/analogs", icon: Compass, isSub: true, section: "Question Detail" },
  { name: "Strategic Recommendation", path: "/cases/active/portfolio", icon: Layers, isSub: true, section: "Question Detail" },
  { name: "Signal Monitor", path: "/watchlist", icon: ListChecks, section: "Intelligence" },
  { name: "Forecast Ledger", path: "/case-library", icon: BookOpen, section: "Intelligence" },
  { name: "Calibration", path: "/calibration", icon: BarChart3, section: "System" },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const insideCase = location.startsWith("/cases/") && location !== "/cases";
  const currentCaseBase = insideCase
    ? location.split("/").slice(0, 3).join("/")
    : null;

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "/cases";
    if (path.includes("/cases/active")) {
      const suffix = path.replace("/cases/active", "");
      return insideCase && location.endsWith(suffix);
    }
    return location.startsWith(path);
  };

  const resolveHref = (item: NavItem) => {
    if (item.path.includes("/cases/active")) {
      if (currentCaseBase) {
        return currentCaseBase + item.path.replace("/cases/active", "");
      }
      return "/";
    }
    return item.path;
  };

  let lastSection = "";

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

        <div className="flex-1 overflow-y-auto py-4 px-3">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const actualPath = resolveHref(item);
            const showSection = item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;

            const isQuestionDetailItem = item.section === "Question Detail";
            const questionDetailDisabled = isQuestionDetailItem && !insideCase;

            return (
              <div key={item.name}>
                {showSection && (
                  <div className={cn(
                    "text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2",
                    item.section === "Platform" ? "mb-2" : "mt-5 mb-2"
                  )}>
                    {item.section}
                  </div>
                )}
                <Link
                  href={questionDetailDisabled ? "#" : actualPath}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-[13px] font-medium",
                    active
                      ? "bg-primary/15 text-primary"
                      : questionDetailDisabled
                      ? "text-muted-foreground/25 cursor-default opacity-40"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    item.isSub && "ml-4 text-[12px]"
                  )}
                  onClick={questionDetailDisabled ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                >
                  <item.icon
                    className={cn(
                      "shrink-0",
                      item.isSub ? "w-3.5 h-3.5" : "w-4 h-4",
                      active ? "text-primary" : questionDetailDisabled ? "text-muted-foreground/25" : "text-muted-foreground/70"
                    )}
                  />
                  <span>{item.name}</span>
                  {active && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
                </Link>
              </div>
            );
          })}
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
