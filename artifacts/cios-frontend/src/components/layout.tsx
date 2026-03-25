import { ReactNode, useState } from "react";
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
  Link2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActiveQuestion } from "@/types";

interface NavItem {
  name: string;
  path: string;
  icon: React.FC<any>;
  isChild?: boolean;
  disabled?: boolean;
  helperText?: string;
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
        { name: "Questions", path: "/cases", icon: FileQuestion, helperText: activeQuestion ? "Prediction target defined" : "Define the prediction target" },
        { name: "Adopter Discovery", path: "/discovery", icon: Sparkles, isChild: true, helperText: activeQuestion ? "Derived from active question" : "Select or create a question first" },
      ],
    },
    {
      title: "Evidence",
      items: [
        { name: "Signal Detection", path: "/signal-detection", icon: Radar },
        { name: "Signals", path: "/watchlist", icon: Radio },
        { name: "Signal Review", path: "/review", icon: ClipboardCheck },
      ],
    },
    {
      title: "Prediction",
      items: [
        { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
        { name: "Forecast Ledger", path: "/case-library", icon: BookOpen },
      ],
    },
    {
      title: "Learning",
      items: [
        { name: "Calibration", path: "/calibration", icon: BarChart3 },
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
      <aside className="w-[280px] flex-shrink-0 border-r border-white/10 bg-[#08133a] flex flex-col z-20">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#2b4da6] bg-[#0d2158] text-[#76a0ff] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="text-2xl leading-none font-semibold tracking-tight text-white">CIOS</div>
              <div className="mt-1 text-xs text-slate-400">Strategic Intelligence Engine</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="flex items-start gap-2">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Active Question Context
                </div>
                {activeQuestion ? (
                  <div className="mt-1">
                    <div className="truncate text-sm font-medium text-white">
                      {activeQuestion.title}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex items-start gap-2 text-xs text-amber-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>No active question selected</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-3">
          {navSections.map((section, sIdx) => (
            <div key={section.title} className={cn(sIdx > 0 && "mt-4")}>
              <div className="px-3 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {section.title}
              </div>

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.name}
                      href={item.path}
                      className={cn(
                        "group w-full rounded-2xl text-left transition-all duration-150 block",
                        "border border-transparent",
                        item.isChild ? "pl-10 pr-3 py-2" : "px-3 py-2.5",
                        active
                          ? "bg-[#182a63] text-[#7ea2ff] border-[#22397f]"
                          : "text-slate-300 hover:bg-white/5 hover:text-white",
                        item.disabled && "opacity-50 pointer-events-none"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {!item.isChild && (
                          <span className={cn("shrink-0", active ? "text-[#7ea2ff]" : "text-slate-400 group-hover:text-slate-200")}>
                            <item.icon className="h-[18px] w-[18px]" />
                          </span>
                        )}

                        {item.isChild && (
                          <span className="flex items-center gap-2 text-slate-500">
                            <span className="h-px w-4 bg-slate-600" />
                            <span className={cn(active ? "text-[#7ea2ff]" : "text-slate-400 group-hover:text-slate-200")}>
                              <item.icon className="h-4 w-4" />
                            </span>
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-[14px] font-medium">{item.name}</span>
                            {active && <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
                          </div>
                          {item.helperText && (
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">
                              {item.helperText}
                            </div>
                          )}
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
