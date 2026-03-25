import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Radio,
  BarChart3,
  ChevronRight,
  BookOpen,
  FileQuestion,
  Sparkles,
  ClipboardCheck,
  Radar,
  LayoutDashboard,
  BrainCircuit,
  Map,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActiveQuestion, NavKey } from "@/types";

interface NavItem {
  key: NavKey;
  name: string;
  path: string;
  icon: React.FC<any>;
  isChild?: boolean;
  disabled?: boolean;
  description: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function useActiveQuestion(): ActiveQuestion {
  const [location] = useLocation();
  const match = location.match(/\/case\/([^/]+)/);
  if (!match) return null;
  return { id: match[1], title: match[1] };
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const activeQuestion = useActiveQuestion();

  const navSections: NavSection[] = [
    {
      title: "Decision",
      items: [
        { key: "questions", name: "Questions", path: "/cases", icon: FileQuestion, description: "Define what we are predicting" },
        { key: "adopter-discovery", name: "Adopter Discovery", path: "/discovery", icon: Sparkles, isChild: true, disabled: !activeQuestion, description: activeQuestion ? "Define who will act on the active question" : "Select or create a question first" },
      ],
    },
    {
      title: "Evidence",
      items: [
        { key: "event-radar", name: "Event Radar", path: "/event-radar", icon: Radar, description: "Track future signals" },
        { key: "signal-detection", name: "Signal Detection", path: "/signal-detection", icon: Radio, description: "Capture new information" },
        { key: "signal-review", name: "Signal Validation", path: "/review", icon: ClipboardCheck, description: "Confirm signal quality" },
      ],
    },
    {
      title: "Prediction",
      items: [
        { key: "dashboard", name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, description: "Show current forecast" },
        { key: "forecast-ledger", name: "Forecast Ledger", path: "/case-library", icon: BookOpen, description: "Track prediction history" },
      ],
    },
    {
      title: "Learning",
      items: [
        { key: "calibration", name: "Calibration", path: "/calibration", icon: BarChart3, description: "Measure accuracy" },
        { key: "system-map", name: "System Map", path: "/system-map", icon: Map, description: "Understand how the app works" },
      ],
    },
  ];

  const isActive = (path: string) => {
    if (path === "/dashboard") return location === "/" || location === "/dashboard";
    if (path === "/cases") return location === "/cases" || location.startsWith("/case/");
    return location.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground selection:bg-primary/30">
      <aside className="flex h-screen w-[300px] flex-shrink-0 flex-col border-r border-white/10 bg-[#071238] z-20">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-700 bg-blue-950 text-blue-300">
              <BrainCircuit className="h-7 w-7" />
            </div>
            <div className="pt-1">
              <div className="text-[34px] font-semibold leading-none tracking-tight text-white">CIOS</div>
              <div className="mt-1 text-sm text-slate-400">Strategic Intelligence Engine</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Active Question Context
            </div>
            {activeQuestion ? (
              <>
                <div className="text-sm font-medium text-white">{activeQuestion.title}</div>
                {(activeQuestion.therapyArea || activeQuestion.targetPopulation) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeQuestion.therapyArea && (
                      <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
                        {activeQuestion.therapyArea}
                      </span>
                    )}
                    {activeQuestion.targetPopulation && (
                      <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
                        {activeQuestion.targetPopulation}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-300">
                <AlertCircle className="h-4 w-4" />
                <span>No active question selected</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <div className="px-3 pt-6 pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {section.title}
              </div>

              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.key}
                      href={item.disabled ? "#" : item.path}
                      className={cn(
                        "group w-full rounded-2xl border text-left transition-all duration-150 block",
                        item.isChild ? "pl-10 pr-3 py-2.5" : "px-3 py-3",
                        active
                          ? "border-blue-700 bg-blue-950 text-white"
                          : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white",
                        item.disabled && "cursor-not-allowed opacity-50 pointer-events-none"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {item.isChild && <div className="ml-3 mt-0.5 shrink-0"><item.icon className="h-4 w-4" /></div>}
                        {!item.isChild && <div className="mt-0.5 shrink-0"><item.icon className="h-5 w-5" /></div>}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate text-[15px] font-medium">{item.name}</div>
                            {active && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">{item.description}</div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-white/10">
          <div className="bg-white/5 px-3 py-2.5 rounded-2xl border border-white/10 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div>
              <div className="text-[11px] font-medium text-white">Engine ready</div>
              <div className="text-[10px] text-slate-400">All systems operational</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-[#0a1628]">
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
