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
  Eye,
  Activity,
  BarChart3,
  Layers,
  Search,
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

interface SignalDetail {
  signalId: string;
  description?: string;
  rawLikelihoodRatio?: number;
  effectiveLikelihoodRatio?: number;
  dependencyRole?: string;
  pointContribution?: number;
  correlationGroup?: string;
  direction?: string;
}

interface ForecastData {
  posteriorProbability?: number;
  thresholdProbability?: number;
  priorProbability?: number;
  currentProbability?: number;
  confidenceLevel?: string;
  signalDetails?: SignalDetail[];
  sensitivityAnalysis?: {
    swingFactor?: {
      signalId: string;
      description: string;
      probabilityDeltaIfReversed: number;
    };
    stabilityNote?: string;
  };
  _calibrationChecks?: {
    confidenceCeiling?: number;
    posteriorFragility?: number;
    overconfidence?: {
      fragility?: number;
      diversityScore?: number;
      signalConcentration?: number;
    };
    independence?: {
      rawIndependenceScore?: number;
      summary?: string;
    };
  };
  _integrityMetrics?: {
    correlationGroupsDetected?: number;
    signalsDampened?: number;
    independentSignalCount?: number;
    lrCompressionApplied?: boolean;
  };
  _consistency?: {
    score?: string;
    details?: string;
  };
}

interface CaseData {
  strategicQuestion?: string;
  outcomeDefinition?: string;
  outcomeThreshold?: string;
  timeHorizon?: string;
  assetName?: string;
}

interface DiagnosticTriggers {
  lowConfidence: boolean;
  largeShift: boolean;
  signalConflict: boolean;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

function computeDiagnosticTriggers(forecastData: ForecastData): DiagnosticTriggers {
  const confidence = (forecastData.confidenceLevel || "").toLowerCase();
  const lowConfidence = confidence === "low" || confidence === "very low";

  const prior = forecastData.priorProbability ?? 0.5;
  const current = forecastData.currentProbability ?? forecastData.posteriorProbability ?? prior;
  const shiftPp = Math.abs((current - prior) * 100);
  const largeShift = shiftPp >= 10;

  const signals = forecastData.signalDetails || [];
  const positiveCount = signals.filter(s => (s.pointContribution ?? 0) > 0).length;
  const negativeCount = signals.filter(s => (s.pointContribution ?? 0) < 0).length;
  const signalConflict = positiveCount >= 2 && negativeCount >= 2;

  return { lowConfidence, largeShift, signalConflict };
}

export default function RespondPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [data, setData] = useState<RespondResult | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData>({});
  const [coherence, setCoherence] = useState<CoherenceResult | null>(null);
  const [usingRevised, setUsingRevised] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [diagnosticsUserOverride, setDiagnosticsUserOverride] = useState<boolean | null>(null);

  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";
  const questionText = activeQuestion?.question || activeQuestion?.rawInput || activeQuestion?.text || "";
  const caseTypeInfo = useMemo(() => detectCaseType(questionText), [questionText]);

  const diagnosticTriggers = useMemo(() => computeDiagnosticTriggers(forecastData), [forecastData]);
  const diagnosticsAutoOpen = diagnosticTriggers.lowConfidence || diagnosticTriggers.largeShift || diagnosticTriggers.signalConflict;
  const diagnosticsVisible = diagnosticsUserOverride !== null ? diagnosticsUserOverride : diagnosticsAutoOpen;

  function handleDiagnosticsToggle() {
    if (diagnosticsUserOverride !== null) {
      setDiagnosticsUserOverride(prev => !prev);
    } else {
      setDiagnosticsUserOverride(!diagnosticsAutoOpen);
    }
  }

  useEffect(() => {
    if (!caseId) return;

    fetchForecastData();

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

  async function fetchForecastData() {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/cases/${caseId}/forecast`);
      if (res.ok) {
        const fd = await res.json();
        setForecastData(fd);
      }
    } catch {}
  }

  async function generate() {
    if (!activeQuestion) return;
    setLoading(true);
    setError(null);

    try {
      const apiBase = getApiBase();

      let fetchedForecast: ForecastData = {};
      let caseData: CaseData = {};

      try {
        const [forecastRes, caseRes] = await Promise.all([
          fetch(`${apiBase}/cases/${caseId}/forecast`),
          fetch(`${apiBase}/cases/${caseId}`),
        ]);
        if (forecastRes.ok) {
          fetchedForecast = await forecastRes.json();
          setForecastData(fetchedForecast);
        }
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
        posteriorProbability: fetchedForecast.posteriorProbability ?? null,
        thresholdProbability: fetchedForecast.thresholdProbability ?? null,
        successDefinition: caseData.outcomeDefinition || null,
        outcomeThreshold: caseData.outcomeThreshold || null,
        strategicQuestion: caseData.strategicQuestion || null,
        signalDetails: fetchedForecast.signalDetails || [],
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
          posteriorProbability: fetchedForecast.posteriorProbability ?? null,
          thresholdProbability: fetchedForecast.thresholdProbability ?? null,
          signalDetails: fetchedForecast.signalDetails || [],
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
    const text = formatAsText(data, forecastData);
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

              {/* === SECTION 1: DECISION SNAPSHOT (always visible) === */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Crosshair className="w-4 h-4 text-blue-400" />
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Decision Snapshot</h2>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/50 divide-y divide-border/40">
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Decision</div>
                    <p className="text-[15px] text-foreground leading-relaxed">{data.strategic_recommendation}</p>
                  </div>

                  {data.decision_clarity && (
                    <>
                      <ClarityRow
                        icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                        label={`Probability of achieving the target within ${data.decision_clarity.timeHorizon || "forecast horizon"}`}
                        value={data.decision_clarity.targetProbability != null
                          ? `${Math.round(data.decision_clarity.targetProbability * 100)}%`
                          : "Not calculated"}
                        valueColor={getProbabilityColor(data.decision_clarity.targetProbability)}
                      />
                      <ClarityRow
                        icon={<Clock className="w-4 h-4 text-blue-400" />}
                        label="Most likely outcome"
                        value={data.realistic_ceiling}
                      />
                      <ClarityRow
                        icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
                        label="Primary blocker"
                        value={truncateToSentence(data.primary_constraint)}
                      />
                      <ClarityRow
                        icon={<Zap className="w-4 h-4 text-amber-400" />}
                        label="Fastest way to improve"
                        value={truncateToSentence(data.highest_impact_lever)}
                      />
                    </>
                  )}
                </div>
              </section>

              <div className="border-t border-border/40" />

              {/* === SECTION 2: INTERPRETATION (always visible) === */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="w-4 h-4 text-violet-400" />
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Interpretation</h2>
                </div>

                <div className="space-y-5">
                  {data.decision_clarity && (
                    <div className="rounded-xl border border-border/40 bg-card/30 p-4">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Environment Strength</div>
                          <div className={`text-xl font-bold ${getProbabilityColor(data.decision_clarity.environmentStrength)}`}>
                            {data.decision_clarity.environmentStrength != null
                              ? `${Math.round(data.decision_clarity.environmentStrength * 100)}%`
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Success Definition</div>
                          <div className="text-sm text-foreground">
                            {data.decision_clarity.outcomeThreshold || data.decision_clarity.successDefinition || "Not defined"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Why the probability looks like this</h3>
                    <p className="text-[15px] text-foreground leading-relaxed">{data.primary_constraint}</p>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">What would change the forecast</h3>
                    <p className="text-[15px] text-foreground leading-relaxed">{data.highest_impact_lever}</p>
                  </div>
                </div>
              </section>

              <div className="border-t border-border/40" />

              {/* === SECTION 3: NEEDLE MOVEMENT (visible) === */}
              {data.needle_movement && (
                <>
                  <NeedleMovementSection movement={data.needle_movement} />
                  <div className="border-t border-border/40" />
                </>
              )}

              {/* === SECTION 4: DIAGNOSTICS (hidden by default) === */}
              <DiagnosticsSection
                forecastData={forecastData}
                triggers={diagnosticTriggers}
                autoOpen={diagnosticsAutoOpen}
                onToggle={handleDiagnosticsToggle}
                visible={diagnosticsVisible}
              />

              <div className="pt-2" />

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

function DiagnosticsSection({
  forecastData,
  triggers,
  autoOpen,
  onToggle,
  visible,
}: {
  forecastData: ForecastData;
  triggers: DiagnosticTriggers;
  autoOpen: boolean;
  onToggle: () => void;
  visible: boolean;
}) {
  const signals = forecastData.signalDetails || [];
  const calibChecks = (forecastData as any)?._calibrationChecks;
  const integrityMetrics = (forecastData as any)?._integrityMetrics;
  const sensitivity = forecastData.sensitivityAnalysis;
  const consistency = (forecastData as any)?._consistency;

  const confidenceCeiling = calibChecks?.confidenceCeiling ?? (forecastData as any)?.distributionForecast?.achievableCeiling ?? null;
  const fragility = calibChecks?.overconfidence?.fragility ?? calibChecks?.posteriorFragility ?? null;
  const diversityScore = calibChecks?.overconfidence?.diversityScore ?? null;
  const independenceScore = calibChecks?.independence?.rawIndependenceScore ?? null;
  const signalConcentration = calibChecks?.overconfidence?.signalConcentration ?? null;

  const compressedCount = integrityMetrics?.signalsDampened ?? 0;
  const correlationGroups = integrityMetrics?.correlationGroupsDetected ?? 0;
  const independentCount = integrityMetrics?.independentSignalCount ?? signals.length;

  const prior = forecastData.priorProbability ?? 0.5;
  const current = forecastData.currentProbability ?? forecastData.posteriorProbability ?? prior;
  const shiftPp = Math.round((current - prior) * 100);

  const triggerReasons: string[] = [];
  if (triggers.lowConfidence) triggerReasons.push("Low confidence");
  if (triggers.largeShift) triggerReasons.push(`Large probability shift (${shiftPp >= 0 ? "+" : ""}${shiftPp}pp)`);
  if (triggers.signalConflict) triggerReasons.push("Conflicting signals detected");

  const hasData = signals.length > 0 || confidenceCeiling !== null || fragility !== null;

  if (!hasData && !visible) return null;

  return (
    <section>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 mb-3 group"
      >
        <Activity className="w-4 h-4 text-slate-400 group-hover:text-slate-300 transition" />
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition">
          Diagnostics
        </h2>
        {autoOpen && triggerReasons.length > 0 && (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 ml-1">
            auto-revealed
          </span>
        )}
        <div className="flex-1" />
        {!visible ? (
          <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition flex items-center gap-1">
            <Search className="w-3 h-3" /> Explain
          </span>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {visible && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          {triggerReasons.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-400/90">
                Diagnostics visible because: {triggerReasons.join(" · ")}
              </div>
            </div>
          )}

          {signals.length > 0 && (
            <div className="rounded-xl border border-border/40 bg-card/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Signal Details</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">{signals.length} signals</span>
              </div>
              <div className="space-y-1.5">
                {signals.map((s) => {
                  const pp = s.pointContribution != null ? s.pointContribution * 100 : 0;
                  const isPositive = pp > 0;
                  const compressed = s.dependencyRole === "Echo" || s.dependencyRole === "Translation";
                  return (
                    <div key={s.signalId} className="flex items-center gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPositive ? "bg-emerald-400" : "bg-rose-400"}`} />
                      <span className="text-foreground/80 truncate flex-1">{s.description || s.signalId}</span>
                      {compressed && (
                        <span className="text-[9px] text-amber-400/70 shrink-0">{s.dependencyRole}</span>
                      )}
                      <span className={`font-semibold shrink-0 tabular-nums ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                        {isPositive ? "+" : ""}{pp.toFixed(1)}pp
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DiagnosticCard
              label="Fragility"
              value={fragility !== null ? fragility.toFixed(3) : "—"}
              sublabel="Single-driver sensitivity"
              warn={fragility !== null && fragility > 0.15}
            />
            <DiagnosticCard
              label="Confidence Ceiling"
              value={confidenceCeiling !== null ? `${Math.round(confidenceCeiling * 100)}%` : "None"}
              sublabel="Max achievable probability"
              warn={confidenceCeiling !== null && confidenceCeiling < 0.5}
            />
            <DiagnosticCard
              label="Compression"
              value={`${compressedCount} / ${signals.length}`}
              sublabel={`${correlationGroups} correlation group${correlationGroups !== 1 ? "s" : ""}`}
              warn={compressedCount > 0}
            />
            <DiagnosticCard
              label="Independence"
              value={independenceScore !== null ? `${Math.round(independenceScore * 100)}%` : `${independentCount} ind.`}
              sublabel={diversityScore !== null ? `Diversity: ${(diversityScore * 100).toFixed(0)}%` : "Signal diversity"}
              warn={independenceScore !== null && independenceScore < 0.5}
            />
          </div>

          {sensitivity?.swingFactor && (
            <div className="rounded-xl border border-border/40 bg-card/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sensitivity</h3>
              </div>
              <p className="text-xs text-foreground/80">
                <span className="font-medium">Swing factor:</span>{" "}
                {sensitivity.swingFactor.description?.replace(/^CS-\d+\s*[-–—]\s*/, "") || "—"}
                {sensitivity.swingFactor.probabilityDeltaIfReversed != null && (
                  <span className="text-rose-400 font-semibold ml-1">
                    ({(sensitivity.swingFactor.probabilityDeltaIfReversed * 100).toFixed(1)}pp if reversed)
                  </span>
                )}
              </p>
              {sensitivity.stabilityNote && (
                <p className="text-[11px] text-muted-foreground mt-1.5">{sensitivity.stabilityNote}</p>
              )}
            </div>
          )}

          {consistency && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
              <span className="font-medium">Consistency:</span>
              <span className={consistency.score === "high" ? "text-emerald-400" : consistency.score === "moderate" ? "text-amber-400" : "text-rose-400"}>
                {consistency.score}
              </span>
              {consistency.details && <span>— {consistency.details}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DiagnosticCard({ label, value, sublabel, warn }: { label: string; value: string; sublabel: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? "border-amber-500/20 bg-amber-500/5" : "border-border/40 bg-card/30"}`}>
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-lg font-bold ${warn ? "text-amber-400" : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>
    </div>
  );
}

function truncateToSentence(text: string): string {
  const firstSentence = text.match(/^[^.!?]+[.!?]/);
  if (firstSentence && firstSentence[0].length < text.length * 0.8) {
    return firstSentence[0];
  }
  return text;
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
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-emerald-400" />
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Needle Movement Analysis</h2>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">What moves the probability up</h3>
          </div>
          <div className="space-y-2">
            {movement.moves_up.map((d, i) => (
              <div key={i} className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{d.name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <CategoryBadge category={d.category} />
                      <ImpactBadge impact={d.impact} />
                    </div>
                  </div>
                  <span className="text-emerald-400 font-bold text-sm shrink-0">{d.contribution}</span>
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
              <div key={i} className="rounded-lg border border-rose-500/15 bg-rose-500/5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{d.name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <CategoryBadge category={d.category} />
                      <ImpactBadge impact={d.impact} />
                    </div>
                  </div>
                  <span className="text-rose-400 font-bold text-sm shrink-0">{d.contribution}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Recommended Actions</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/40 bg-card/30 p-3">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Strategic</div>
              <ul className="space-y-1.5">
                {movement.recommended_actions.strategic.map((a, i) => (
                  <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border/40 bg-card/30 p-3">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Tactical</div>
              <ul className="space-y-1.5">
                {movement.recommended_actions.tactical.map((a, i) => (
                  <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0 mt-1.5" />
                    {a}
                  </li>
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
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground leading-snug">{label}</p>
        <p className={`text-sm font-medium mt-0.5 ${valueColor || "text-foreground"}`}>{value}</p>
      </div>
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

function formatAsText(data: RespondResult, forecastData?: ForecastData): string {
  const lines: string[] = [];

  lines.push("DECISION SNAPSHOT");
  lines.push(`Decision: ${data.strategic_recommendation}`);
  if (data.decision_clarity) {
    const dc = data.decision_clarity;
    if (dc.targetProbability != null) lines.push(`Probability of achieving the target within ${dc.timeHorizon || "forecast horizon"}: ${Math.round(dc.targetProbability * 100)}%`);
    lines.push(`Most likely outcome: ${data.realistic_ceiling}`);
    lines.push(`Primary blocker: ${truncateToSentence(data.primary_constraint)}`);
    lines.push(`Fastest way to improve: ${truncateToSentence(data.highest_impact_lever)}`);
  }
  lines.push("");

  lines.push("INTERPRETATION");
  if (data.decision_clarity) {
    if (data.decision_clarity.environmentStrength != null) lines.push(`Environment strength: ${Math.round(data.decision_clarity.environmentStrength * 100)}%`);
    lines.push(`Success definition: ${data.decision_clarity.outcomeThreshold || data.decision_clarity.successDefinition || "Not defined"}`);
  }
  lines.push(`Why the probability looks like this: ${data.primary_constraint}`);
  lines.push(`What would change the forecast: ${data.highest_impact_lever}`);
  lines.push("");

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

  if (forecastData && (forecastData.signalDetails?.length || 0) > 0) {
    lines.push("DIAGNOSTICS");
    const signals = forecastData.signalDetails || [];
    signals.forEach(s => {
      const pp = (s.pointContribution ?? 0) * 100;
      lines.push(`  ${s.description || s.signalId}: ${pp >= 0 ? "+" : ""}${pp.toFixed(1)}pp${s.dependencyRole && s.dependencyRole !== "Independent" ? ` (${s.dependencyRole})` : ""}`);
    });
  }

  return lines.join("\n");
}
