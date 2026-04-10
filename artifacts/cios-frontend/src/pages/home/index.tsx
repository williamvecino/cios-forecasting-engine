import { useState, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useListCases } from "@workspace/api-client-react";
import TopNav from "@/components/top-nav";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { clearCaseState } from "@/lib/workflow";
import {
  ArrowRight,
  Clock,
  Rocket,
  Swords,
  FlaskConical,
  Shield,
  Layers,
  Radar,
  ChevronDown,
  ChevronUp,
  Lock,
} from "lucide-react";

interface ArchetypeCard {
  id: string;
  name: string;
  subtitle: string;
  whyItMatters: string;
  icon: React.ReactNode;
  active: boolean;
  priorArchetypes: string[];
  color: string;
  placeholder: string;
}

const ARCHETYPES: ArchetypeCard[] = [
  {
    id: "launch-adoption",
    name: "Launch Adoption Risk",
    subtitle: "Will this product achieve expected uptake?",
    whyItMatters: "The single most common decision problem in pharma strategy.",
    icon: <Rocket className="w-5 h-5" />,
    active: true,
    priorArchetypes: ["First-in-class / novel mechanism", "Orphan / rare disease launch"],
    color: "emerald",
    placeholder: "Will [drug] achieve [target]% of new [indication] starts within [time] of launch?",
  },
  {
    id: "competitive-displacement",
    name: "Competitive Displacement",
    subtitle: "Can a new entrant displace the incumbent?",
    whyItMatters: "Displacement behaves differently than launch — switching friction dominates.",
    icon: <Swords className="w-5 h-5" />,
    active: true,
    priorArchetypes: ["Same-mechanism second-in-class", "Differentiated challenger (H2H superiority)"],
    color: "blue",
    placeholder: "What is the probability that [asset] achieves meaningful share against [incumbent] in [indication]?",
  },
  {
    id: "evidence-impact",
    name: "Evidence Impact",
    subtitle: "How will new data change adoption behavior?",
    whyItMatters: "Most strategy pivots happen after new evidence appears.",
    icon: <FlaskConical className="w-5 h-5" />,
    active: true,
    priorArchetypes: [],
    color: "violet",
    placeholder: "How will [trial/data] change prescriber behavior for [drug] in [indication]?",
  },
  {
    id: "access-coverage",
    name: "Access & Coverage Risk",
    subtitle: "Will payers allow this therapy to be used?",
    whyItMatters: "Access often determines adoption more than clinical evidence.",
    icon: <Shield className="w-5 h-5" />,
    active: false,
    priorArchetypes: [],
    color: "amber",
    placeholder: "",
  },
  {
    id: "lifecycle-expansion",
    name: "Lifecycle Expansion",
    subtitle: "Will a new indication or population succeed?",
    whyItMatters: "Expansion dynamics depend heavily on existing physician familiarity.",
    icon: <Layers className="w-5 h-5" />,
    active: false,
    priorArchetypes: [],
    color: "cyan",
    placeholder: "",
  },
  {
    id: "competitive-threat",
    name: "Competitive Threat Monitoring",
    subtitle: "Is a competitor about to change the market?",
    whyItMatters: "The early-warning function of CIOS.",
    icon: <Radar className="w-5 h-5" />,
    active: false,
    priorArchetypes: [],
    color: "rose",
    placeholder: "",
  },
];

const COLOR_MAP: Record<string, { border: string; bg: string; text: string; hover: string }> = {
  emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-400", hover: "hover:border-emerald-500/50 hover:bg-emerald-500/10" },
  blue: { border: "border-blue-500/30", bg: "bg-blue-500/5", text: "text-blue-400", hover: "hover:border-blue-500/50 hover:bg-blue-500/10" },
  violet: { border: "border-violet-500/30", bg: "bg-violet-500/5", text: "text-violet-400", hover: "hover:border-violet-500/50 hover:bg-violet-500/10" },
  amber: { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-400", hover: "" },
  cyan: { border: "border-cyan-500/30", bg: "bg-cyan-500/5", text: "text-cyan-400", hover: "" },
  rose: { border: "border-rose-500/30", bg: "bg-rose-500/5", text: "text-rose-400", hover: "" },
};

export default function HomePage() {
  const [, navigate] = useLocation();
  const { data: cases } = useListCases();
  const { activeQuestion, createQuestion } = useActiveQuestion();
  const [showRecent, setShowRecent] = useState(false);

  const allCases = (cases as any[]) || [];
  const recentCases = allCases.slice(0, 5);

  function handleArchetypeClick(arch: ArchetypeCard) {
    if (!arch.active) return;
    localStorage.setItem("cios.selectedArchetype", JSON.stringify({
      id: arch.id,
      name: arch.name,
      priorArchetypes: arch.priorArchetypes,
      placeholder: arch.placeholder,
    }));
    navigate(`/question?archetype=${encodeURIComponent(arch.id)}`);
  }

  const openCase = useCallback((c: any) => {
    const cid = c.caseId || c.id;
    if (activeQuestion?.caseId === cid) {
      navigate("/signals");
      return;
    }
    const prevCaseId = activeQuestion?.caseId;
    if (prevCaseId && prevCaseId !== cid) {
      clearCaseState(prevCaseId);
    }
    try { localStorage.removeItem("cios.therapeuticArea"); } catch {}
    try { localStorage.removeItem("cios.questionDraft"); } catch {}
    const questionText = c.strategicQuestion || c.assetName || "Untitled";
    createQuestion({
      text: questionText,
      rawInput: c.strategicQuestion || "",
      caseId: cid,
      timeHorizon: c.timeHorizon || "12 months",
      subject: c.assetName || c.primaryBrand || "",
      outcome: c.outcomeDefinition || "adoption",
    });
    if (c.therapeuticArea) {
      try { localStorage.setItem("cios.therapeuticArea", c.therapeuticArea); } catch {}
    }
    navigate("/signals");
  }, [activeQuestion, createQuestion, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-4xl px-6 py-12 space-y-10">
        {/* ── Archetype Selector Grid ── */}
        <section className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            What decision are you forecasting?
          </h1>
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            Select a decision type to begin. CIOS will configure the right prior, signal types, and governance rules.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ARCHETYPES.map((arch) => {
            const colors = COLOR_MAP[arch.color];
            return (
              <button
                key={arch.id}
                type="button"
                disabled={!arch.active}
                onClick={() => handleArchetypeClick(arch)}
                className={`relative rounded-2xl border p-5 text-left transition ${
                  arch.active
                    ? `${colors.border} ${colors.bg} ${colors.hover} cursor-pointer`
                    : "border-border/20 bg-card/30 opacity-50 cursor-default"
                }`}
              >
                {!arch.active && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <Lock className="w-2.5 h-2.5" />
                    Coming Soon
                  </span>
                )}

                <div className={`mb-3 ${arch.active ? colors.text : "text-muted-foreground/50"}`}>
                  {arch.icon}
                </div>

                <h3 className={`text-base font-bold ${arch.active ? "text-foreground" : "text-muted-foreground/60"}`}>
                  {arch.name}
                </h3>

                <p className={`text-xs mt-1 ${arch.active ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                  {arch.subtitle}
                </p>

                <p className={`text-[10px] mt-3 leading-relaxed italic ${arch.active ? colors.text + "/70" : "text-muted-foreground/30"}`}>
                  {arch.whyItMatters}
                </p>

                {arch.active && (
                  <div className={`mt-4 inline-flex items-center gap-1.5 text-xs font-semibold ${colors.text}`}>
                    Start Forecast <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            );
          })}
        </section>

        {/* ── Continue where you left off ── */}
        {activeQuestion && (
          <section className="max-w-2xl mx-auto">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-2">
                Continue where you left off
              </div>
              <div className="text-foreground font-medium text-sm">{activeQuestion.text}</div>
              <Link
                href="/question"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition"
              >
                Resume Forecast <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        {/* ── Recent Forecasts ── */}
        {recentCases.length > 0 && (
          <section className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setShowRecent(!showRecent)}
              className="w-full flex items-center justify-between rounded-xl border border-border bg-card/50 px-4 py-3 text-left hover:bg-muted/10 transition"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Recent Forecasts</span>
                <span className="text-xs text-muted-foreground/50">{recentCases.length}</span>
              </div>
              {showRecent
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </button>
            {showRecent && (
              <div className="mt-2 rounded-xl border border-border bg-card/30 divide-y divide-border/30 overflow-hidden">
                {recentCases.map((c: any) => {
                  const cid = c.caseId || c.id;
                  const prob = c.currentProbability;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => openCase(c)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/10 transition"
                    >
                      <span className="text-sm text-foreground/80 line-clamp-1 flex-1 mr-4">
                        {c.strategicQuestion || c.assetName || "Untitled"}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        {prob != null && (
                          <span className="text-sm font-semibold text-primary">
                            {Math.round(prob * 100)}%
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/40 font-mono">{cid}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
