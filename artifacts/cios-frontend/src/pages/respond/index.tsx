import { useState, useEffect, useMemo } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { detectCaseType } from "@/lib/case-type-utils";
import {
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  FlaskConical,
  Target,
  Clock,
  TrendingUp,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Crosshair,
} from "lucide-react";
import { Link } from "wouter";
import SavedQuestionsPanel from "@/components/question/SavedQuestionsPanel";

interface GapViolation {
  phrase: string;
  context: string;
  requiredStructure: {
    observedValue: string | null;
    expectedValue: string | null;
    difference: string | null;
    drivers: string | null;
  };
}

interface GapGuardResult {
  clean: boolean;
  violationCount: number;
  violations: GapViolation[];
}

interface DecisionClarity {
  successDefinition: string | null;
  outcomeThreshold: string | null;
  timeHorizon: string | null;
  targetProbability: number | null;
  environmentStrength: number | null;
}

interface NeedleDriver {
  name: string;
  category: string;
  direction: string;
  impact: "high" | "moderate" | "low";
  contribution: string;
}

interface NeedleMovement {
  moves_up: NeedleDriver[];
  moves_down: NeedleDriver[];
  recommended_actions: {
    strategic: string[];
    tactical: string[];
  };
}

interface RespondResult {
  strategic_recommendation: string;
  primary_constraint: string;
  highest_impact_lever: string;
  realistic_ceiling: string;
  decision_clarity?: DecisionClarity;
  needle_movement?: NeedleMovement;
  _gapGuard?: GapGuardResult;
}

interface CoherenceIssue {
  rule: string;
  ruleNumber: number;
  severity: "fail" | "warn";
  detail: string;
}

interface CoherenceResult {
  pass: boolean;
  issueCount: number;
  issues: CoherenceIssue[];
  revisedOutput: RespondResult | null;
}

interface ForecastData {
  posteriorProbability?: number;
  thresholdProbability?: number;
  signalDetails?: {
    signalId: string;
    description?: string;
    rawLikelihoodRatio?: number;
    effectiveLikelihoodRatio?: number;
    dependencyRole?: string;
    pointContribution?: number;
    correlationGroup?: string;
  }[];
}

interface CaseData {
  strategicQuestion?: string;
  outcomeDefinition?: string;
  outcomeThreshold?: string;
  timeHorizon?: string;
  assetName?: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function RespondPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [data, setData] = useState<RespondResult | null>(null);
  const [coherence, setCoherence] = useState<CoherenceResult | null>(null);
  const [usingRevised, setUsingRevised] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";
  const questionText = activeQuestion?.question || activeQuestion?.rawInput || activeQuestion?.text || "";
  const caseTypeInfo = useMemo(() => detectCaseType(questionText), [questionText]);

  useEffect(() => {
    if (!caseId) return;

    const cached = localStorage.getItem(`cios.respondResult:${caseId}`);
    if (cached) {
      try {
        const raw = JSON.parse(cached);
        const normalized = normalizeResult(raw);
        if (normalized) {
          setData(normalized);
          return;
        }
        localStorage.removeItem(`cios.respondResult:${caseId}`);
      } catch {
        localStorage.removeItem(`cios.respondResult:${caseId}`);
      }
    }

    generate();
  }, [caseId]);

  async function generate() {
    if (!activeQuestion) return;
    setLoading(true);
    setError(null);

    try {
      const apiBase = getApiBase();

      let forecastData: ForecastData = {};
      let caseData: CaseData = {};

      try {
        const [forecastRes, caseRes] = await Promise.all([
          fetch(`${apiBase}/cases/${caseId}/forecast`),
          fetch(`${apiBase}/cases/${caseId}`),
        ]);
        if (forecastRes.ok) forecastData = await forecastRes.json();
        if (caseRes.ok) {
          const caseJson = await caseRes.json();
          caseData = caseJson.data || caseJson;
        }
      } catch {}

      const decideRaw = localStorage.getItem(`cios.decideResult:${caseId}`);
      const decideData = decideRaw ? JSON.parse(decideRaw) : null;

      let probability: number | null = null;
      let constrainedProbability: number | null = null;
      try {
        const decomp = localStorage.getItem(`cios.eventDecomposition:${caseId}`);
        if (decomp) {
          const parsed = JSON.parse(decomp);
          probability = parsed.brand_outlook_probability ?? null;
          constrainedProbability = parsed.constrained_probability ?? null;
        }
      } catch {}

      let signals: any[] = [];
      try {
        const sigRaw = localStorage.getItem(`cios.signals:${caseId}`);
        if (sigRaw) {
          const allSigs = JSON.parse(sigRaw);
          signals = (allSigs || [])
            .filter((s: any) => s.accepted && !s.dismissed)
            .map((s: any) => ({
              text: s.text,
              direction: s.direction,
              importance: s.importance,
              confidence: s.confidence,
              source: s.source,
              signal_source: s.signal_source,
            }));
        }
      } catch {}

      const payload = {
        subject: activeQuestion.subject || caseData.assetName || activeQuestion.text,
        questionText: activeQuestion.text,
        outcome: caseData.outcomeDefinition || activeQuestion.outcome || "adoption",
        timeHorizon: caseData.timeHorizon || activeQuestion.timeHorizon || "12 months",
        probability,
        constrainedProbability,
        posteriorProbability: forecastData.posteriorProbability ?? null,
        thresholdProbability: forecastData.thresholdProbability ?? null,
        successDefinition: caseData.outcomeDefinition || null,
        outcomeThreshold: caseData.outcomeThreshold || null,
        strategicQuestion: caseData.strategicQuestion || null,
        signalDetails: forecastData.signalDetails || [],
        signals,
        derived_decisions: decideData?.derived_decisions || null,
        adoption_segmentation: decideData?.adoption_segmentation || null,
        readiness_timeline: decideData?.readiness_timeline || null,
        competitive_risk: decideData?.competitive_risk || null,
      };

      const res = await fetch(`${apiBase}/ai-respond/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const result = await res.json();
      setData(result);
      localStorage.setItem(`cios.respondResult:${caseId}`, JSON.stringify(result));

      setVerifying(true);
      try {
        const verifyPayload = {
          respondOutput: result,
          caseId,
          strategicQuestion: caseData.strategicQuestion || activeQuestion.text,
          successDefinition: caseData.outcomeDefinition || null,
          outcomeThreshold: caseData.outcomeThreshold || null,
          timeHorizon: caseData.timeHorizon || activeQuestion.timeHorizon || "12 months",
          posteriorProbability: forecastData.posteriorProbability ?? null,
          thresholdProbability: forecastData.thresholdProbability ?? null,
          signalDetails: forecastData.signalDetails || [],
        };

        const verifyRes = await fetch(`${apiBase}/agent-coherence/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(verifyPayload),
        });

        if (verifyRes.ok) {
          const coherenceResult = await verifyRes.json();
          setCoherence(coherenceResult);

          if (!coherenceResult.pass && coherenceResult.revisedOutput) {
            const revised = {
              ...coherenceResult.revisedOutput,
              decision_clarity: result.decision_clarity,
              needle_movement: result.needle_movement,
              _gapGuard: result._gapGuard,
            };
            setData(revised);
            setUsingRevised(true);
            localStorage.setItem(`cios.respondResult:${caseId}`, JSON.stringify(revised));
          }
        }
      } catch {}
      setVerifying(false);
    } catch (err: any) {
      setError(err.message || "Failed to generate response");
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  }

  function handleCopyAll() {
    if (!data) return;
    const text = formatAsText(data);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRegenerate() {
    if (caseId) {
      localStorage.removeItem(`cios.respondResult:${caseId}`);
    }
    setData(null);
    setCoherence(null);
    setUsingRevised(false);
    generate();
  }

  return (
    <WorkflowLayout currentStep="respond" activeQuestion={activeQuestion} onClearQuestion={clearQuestion}>
      <QuestionGate activeQuestion={activeQuestion}>
        <div className="max-w-3xl mx-auto space-y-6">
          {caseId && <SavedQuestionsPanel caseId={caseId} />}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">{caseTypeInfo.stepNames.respond}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Executive brief derived from your decision analysis.
              </p>
            </div>
            {data && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRegenerate}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Regenerate
                </button>
                <button
                  onClick={handleCopyAll}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy All"}
                </button>
              </div>
            )}
          </div>

          {loading && (
            <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Generating executive brief...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-rose-400">Generation failed</p>
                <p className="text-xs text-rose-400/70 mt-1">{error}</p>
                <button
                  onClick={generate}
                  className="mt-2 text-xs font-medium text-rose-400 underline hover:text-rose-300"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-6">
              {data._gapGuard && !data._gapGuard.clean && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-amber-400">
                        {data._gapGuard.violationCount} narrative gap{data._gapGuard.violationCount > 1 ? "s" : ""} blocked
                      </p>
                      <p className="text-xs text-amber-400/80">
                        Vague gap statements were detected and replaced.
                      </p>
                      {data._gapGuard.violations.map((v, i) => (
                        <div key={i} className="text-xs text-amber-400/70 border-t border-amber-500/20 pt-1.5 mt-1.5">
                          <span className="font-medium">Blocked phrase:</span> "{v.phrase}"
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {verifying && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                  <p className="text-sm text-blue-400">Verifying coherence...</p>
                </div>
              )}

              {coherence && !verifying && (
                <CoherencePanel coherence={coherence} usingRevised={usingRevised} />
              )}

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Strategic Recommendation</h2>
                <p className="text-[15px] text-foreground leading-relaxed">{data.strategic_recommendation}</p>
              </section>

              <div className="border-t border-border/40" />

              {data.decision_clarity && (
                <>
                  <section>
                    <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Decision Clarity</h2>
                    <div className="rounded-xl border border-border/60 bg-card/50 divide-y divide-border/40">
                      <ClarityRow
                        icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                        label={`Probability of achieving the target within ${data.decision_clarity.timeHorizon || "forecast horizon"}`}
                        value={data.decision_clarity.targetProbability != null
                          ? `${Math.round(data.decision_clarity.targetProbability * 100)}%`
                          : "Not calculated"}
                        valueColor={getProbabilityColor(data.decision_clarity.targetProbability)}
                      />
                      <ClarityRow
                        icon={<Gauge className="w-4 h-4 text-amber-400" />}
                        label="Overall environment strength"
                        value={data.decision_clarity.environmentStrength != null
                          ? `${Math.round(data.decision_clarity.environmentStrength * 100)}%`
                          : "Not calculated"}
                        valueColor={getProbabilityColor(data.decision_clarity.environmentStrength)}
                      />
                      <ClarityRow
                        icon={<Target className="w-4 h-4 text-blue-400" />}
                        label="Success definition"
                        value={data.decision_clarity.outcomeThreshold || data.decision_clarity.successDefinition || "Not defined"}
                      />
                      <ClarityRow
                        icon={<Clock className="w-4 h-4 text-blue-400" />}
                        label="Most likely current range under present constraints"
                        value={data.realistic_ceiling}
                      />
                    </div>
                  </section>

                  <div className="border-t border-border/40" />
                </>
              )}

              {data.needle_movement && (
                <>
                  <NeedleMovementSection movement={data.needle_movement} />
                  <div className="border-t border-border/40" />
                </>
              )}

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Why the Probability Is Low</h2>
                <p className="text-[15px] text-foreground leading-relaxed">{data.primary_constraint}</p>
              </section>

              <div className="border-t border-border/40" />

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">What Would Change the Forecast</h2>
                <p className="text-[15px] text-foreground leading-relaxed">{data.highest_impact_lever}</p>
              </section>

              <div className="border-t border-border/40 pt-2" />

              <Link
                href="/simulate"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
              >
                Continue to Simulate
                <FlaskConical className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function CoherencePanel({ coherence, usingRevised }: { coherence: CoherenceResult; usingRevised: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const failCount = coherence.issues.filter(i => i.severity === "fail").length;
  const warnCount = coherence.issues.filter(i => i.severity === "warn").length;

  if (coherence.pass && coherence.issueCount === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-emerald-400">Coherence verified — all 11 rules pass</p>
          <p className="text-xs text-emerald-400/70 mt-0.5">Output is rule-compliant, internally coherent, and decision-clear.</p>
        </div>
      </div>
    );
  }

  const borderColor = failCount > 0 ? "border-rose-500/30" : "border-amber-500/30";
  const bgColor = failCount > 0 ? "bg-rose-500/10" : "bg-amber-500/10";
  const iconColor = failCount > 0 ? "text-rose-400" : "text-amber-400";
  const Icon = failCount > 0 ? ShieldAlert : ShieldCheck;

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 text-left"
      >
        <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium ${iconColor}`}>
              Coherence {coherence.pass ? "passed with warnings" : "issues detected"}
              {failCount > 0 && ` — ${failCount} fail`}
              {warnCount > 0 && ` — ${warnCount} warning${warnCount > 1 ? "s" : ""}`}
            </p>
            {expanded
              ? <ChevronDown className={`w-3.5 h-3.5 ${iconColor}`} />
              : <ChevronRight className={`w-3.5 h-3.5 ${iconColor}`} />
            }
          </div>
          {usingRevised && (
            <p className="text-xs text-emerald-400/80 mt-1">
              Output was auto-corrected for coherence. Probabilities and data unchanged.
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 pl-8">
          {coherence.issues.map((issue, i) => (
            <div key={i} className={`text-xs border-t ${failCount > 0 ? "border-rose-500/20" : "border-amber-500/20"} pt-2`}>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  issue.severity === "fail"
                    ? "bg-rose-500/20 text-rose-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}>
                  {issue.severity}
                </span>
                <span className={`font-medium ${issue.severity === "fail" ? "text-rose-400" : "text-amber-400"}`}>
                  Rule {issue.ruleNumber}: {issue.rule}
                </span>
              </div>
              <p className={`mt-1 ${issue.severity === "fail" ? "text-rose-400/70" : "text-amber-400/70"}`}>
                {issue.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImpactBadge({ impact }: { impact: "high" | "moderate" | "low" }) {
  const colors = {
    high: "bg-rose-500/20 text-rose-400",
    moderate: "bg-amber-500/20 text-amber-400",
    low: "bg-slate-500/20 text-slate-400",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${colors[impact]}`}>
      {impact}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    clinical: "bg-blue-500/15 text-blue-400",
    operational: "bg-violet-500/15 text-violet-400",
    access: "bg-emerald-500/15 text-emerald-400",
    behavioral: "bg-amber-500/15 text-amber-400",
    competitive: "bg-rose-500/15 text-rose-400",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${colors[category] || "bg-slate-500/15 text-slate-400"}`}>
      {category}
    </span>
  );
}

function NeedleMovementSection({ movement }: { movement: NeedleMovement }) {
  return (
    <section>
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Needle Movement Analysis</h2>

      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">What moves the probability up</h3>
          </div>
          <div className="space-y-2">
            {movement.moves_up.map((d, i) => (
              <div key={i} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground leading-snug flex-1">{d.name}</p>
                  <span className="text-xs font-semibold text-emerald-400 whitespace-nowrap">{d.contribution}</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <CategoryBadge category={d.category} />
                  <ImpactBadge impact={d.impact} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <ArrowDownRight className="w-4 h-4 text-rose-400" />
            <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wide">What moves the probability down</h3>
          </div>
          <div className="space-y-2">
            {movement.moves_down.map((d, i) => (
              <div key={i} className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground leading-snug flex-1">{d.name}</p>
                  <span className="text-xs font-semibold text-rose-400 whitespace-nowrap">{d.contribution}</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <CategoryBadge category={d.category} />
                  <ImpactBadge impact={d.impact} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Crosshair className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Recommended Actions</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/60 bg-card/50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Strategic</span>
              </div>
              <ul className="space-y-1.5">
                {movement.recommended_actions.strategic.map((a, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-400/40">{a}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Tactical</span>
              </div>
              <ul className="space-y-1.5">
                {movement.recommended_actions.tactical.map((a, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-400/40">{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClarityRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${valueColor || "text-foreground"}`}>{value}</span>
    </div>
  );
}

function getProbabilityColor(prob: number | null | undefined): string {
  if (prob == null) return "text-muted-foreground";
  const pct = prob * 100;
  if (pct >= 60) return "text-emerald-400";
  if (pct >= 40) return "text-amber-400";
  return "text-rose-400";
}

function normalizeResult(raw: any): RespondResult | null {
  if (!raw || typeof raw !== "object") return null;

  const sr = raw.strategic_recommendation;
  const strategic_recommendation = typeof sr === "string"
    ? sr
    : (sr?.headline || sr?.text || "");
  if (!strategic_recommendation) return null;

  const pc = raw.primary_constraint;
  const primary_constraint = typeof pc === "string"
    ? pc
    : (pc?.text || raw.why_this_matters || "");

  const hil = raw.highest_impact_lever;
  const highest_impact_lever = typeof hil === "string"
    ? hil
    : (hil?.text || "");

  const rc = raw.realistic_ceiling;
  const realistic_ceiling = typeof rc === "string"
    ? rc
    : (rc?.text || raw.execution_focus || "");

  return {
    strategic_recommendation,
    primary_constraint,
    highest_impact_lever,
    realistic_ceiling,
    decision_clarity: raw.decision_clarity || undefined,
    needle_movement: raw.needle_movement || undefined,
  };
}

function formatAsText(data: RespondResult): string {
  const lines: string[] = [];

  lines.push("STRATEGIC RECOMMENDATION");
  lines.push(data.strategic_recommendation);
  lines.push("");

  if (data.decision_clarity) {
    lines.push("DECISION CLARITY");
    const dc = data.decision_clarity;
    if (dc.targetProbability != null) lines.push(`Probability of achieving the target within ${dc.timeHorizon || "forecast horizon"}: ${Math.round(dc.targetProbability * 100)}%`);
    if (dc.environmentStrength != null) lines.push(`Overall environment strength: ${Math.round(dc.environmentStrength * 100)}%`);
    lines.push(`Success definition: ${dc.outcomeThreshold || dc.successDefinition || "Not defined"}`);
    if (data.realistic_ceiling) lines.push(`Most likely current range under present constraints: ${data.realistic_ceiling}`);
    lines.push("");
  }

  if (data.needle_movement) {
    lines.push("NEEDLE MOVEMENT ANALYSIS");
    lines.push("");
    lines.push("What moves the probability up:");
    data.needle_movement.moves_up.forEach(d => {
      lines.push(`  ${d.name} [${d.category}] ${d.contribution} — ${d.impact} impact`);
    });
    lines.push("");
    lines.push("What moves the probability down:");
    data.needle_movement.moves_down.forEach(d => {
      lines.push(`  ${d.name} [${d.category}] ${d.contribution} — ${d.impact} impact`);
    });
    lines.push("");
    lines.push("Recommended Actions:");
    lines.push("  Strategic:");
    data.needle_movement.recommended_actions.strategic.forEach(a => lines.push(`    - ${a}`));
    lines.push("  Tactical:");
    data.needle_movement.recommended_actions.tactical.forEach(a => lines.push(`    - ${a}`));
    lines.push("");
  }

  lines.push("WHY THE PROBABILITY IS LOW");
  lines.push(data.primary_constraint);
  lines.push("");

  lines.push("WHAT WOULD CHANGE THE FORECAST");
  lines.push(data.highest_impact_lever);

  return lines.join("\n");
}
