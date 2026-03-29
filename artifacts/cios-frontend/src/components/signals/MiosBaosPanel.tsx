import { useState } from "react";
import { Loader2, FlaskConical, Brain, CheckCircle2, XCircle, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Check, X, RotateCcw } from "lucide-react";

interface MiosEvidence {
  beliefShift: string;
  evidenceText: string;
  trialOrSource: string;
  direction: "positive" | "negative";
  strength: string;
  confidence: string;
  whyItMatters: string;
  relevanceToQuestion: string;
}

interface BaosBarrier {
  cognitiveLens: string;
  barrierText: string;
  triggeringEvidence: string;
  direction: "positive" | "negative";
  strength: string;
  confidence: string;
  whyItMatters: string;
  affectedSegment: string;
}

interface MiosResult {
  brand: string;
  beliefShiftsIdentified: string[];
  evidenceSignals: MiosEvidence[];
  searchSummary: string;
}

interface BaosResult {
  brand: string;
  barrierSignals: BaosBarrier[];
  barrierSummary: string;
}

interface AcceptedSignal {
  id: string;
  text: string;
  caveat: string;
  direction: "positive" | "negative" | "neutral";
  strength: "High" | "Medium" | "Low";
  reliability: "Confirmed" | "Probable" | "Speculative";
  impact: "High" | "Medium" | "Low";
  category: string;
  source: string;
  accepted: boolean;
  signal_class: string;
  signal_family: string;
  source_type: string;
  priority_source: string;
  is_locked: boolean;
  workbook_meta: {
    sourceWorkbook: string;
    programId: string;
    whyItMatters: string;
    trialOrSource?: string;
    cognitiveLens?: string;
  };
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

type SignalDecision = "pending" | "accepted" | "rejected";

export default function MiosBaosPanel({
  brand,
  question,
  therapeuticArea,
  indication,
  onAcceptSignals,
}: {
  brand: string;
  question: string;
  therapeuticArea?: string;
  indication?: string;
  onAcceptSignals: (signals: AcceptedSignal[]) => void;
}) {
  const [miosResult, setMiosResult] = useState<MiosResult | null>(null);
  const [baosResult, setBaosResult] = useState<BaosResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "mios" | "baos" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<{ mios: boolean; baos: boolean }>({ mios: false, baos: false });

  const [miosDecisions, setMiosDecisions] = useState<SignalDecision[]>([]);
  const [baosDecisions, setBaosDecisions] = useState<SignalDecision[]>([]);
  const [submitted, setSubmitted] = useState(false);

  async function runMiosBaos() {
    setLoading(true);
    setError(null);
    setPhase("mios");
    setMiosResult(null);
    setBaosResult(null);
    setMiosDecisions([]);
    setBaosDecisions([]);
    setSubmitted(false);

    try {
      const miosRes = await fetch(`${getApiBase()}/agents/mios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, question, therapeuticArea, indication }),
      });
      if (!miosRes.ok) throw new Error(`MIOS failed: HTTP ${miosRes.status}`);
      const mios: MiosResult = await miosRes.json();
      setMiosResult(mios);
      setMiosDecisions(mios.evidenceSignals.map(() => "pending" as SignalDecision));

      setPhase("baos");
      const baosRes = await fetch(`${getApiBase()}/agents/baos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          question,
          therapeuticArea,
          indication,
          miosEvidence: mios.evidenceSignals,
        }),
      });
      if (!baosRes.ok) throw new Error(`BAOS failed: HTTP ${baosRes.status}`);
      const baos: BaosResult = await baosRes.json();
      setBaosResult(baos);
      setBaosDecisions(baos.barrierSignals.map(() => "pending" as SignalDecision));
      setPhase("done");
      setExpandedSections({ mios: true, baos: true });
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  function setMiosDecision(index: number, decision: SignalDecision) {
    setMiosDecisions(prev => {
      const next = [...prev];
      next[index] = decision;
      return next;
    });
  }

  function setBaosDecision(index: number, decision: SignalDecision) {
    setBaosDecisions(prev => {
      const next = [...prev];
      next[index] = decision;
      return next;
    });
  }

  function acceptAllMios() {
    setMiosDecisions(prev => prev.map(() => "accepted"));
  }

  function acceptAllBaos() {
    setBaosDecisions(prev => prev.map(() => "accepted"));
  }

  function acceptAllSignals() {
    setMiosDecisions(prev => prev.map(() => "accepted"));
    setBaosDecisions(prev => prev.map(() => "accepted"));
  }

  function submitSelected() {
    const signals: AcceptedSignal[] = [];
    const brandUpper = brand.toUpperCase().replace(/\s+/g, "_");

    if (miosResult) {
      miosResult.evidenceSignals.forEach((e, i) => {
        if (miosDecisions[i] !== "accepted") return;
        const str = e.strength as "High" | "Medium" | "Low";
        signals.push({
          id: `mios_${brandUpper.toLowerCase()}_${i}`,
          text: e.evidenceText,
          caveat: e.whyItMatters,
          direction: e.direction,
          strength: str,
          reliability: e.confidence as "Confirmed" | "Probable" | "Speculative",
          impact: str,
          category: "evidence",
          source: "system",
          accepted: true,
          signal_class: "observed",
          signal_family: "brand_clinical_regulatory",
          source_type: "MIOS",
          priority_source: "observed_verified",
          is_locked: true,
          workbook_meta: {
            sourceWorkbook: `MIOS — ${brand}`,
            programId: `MIOS-${brandUpper}`,
            whyItMatters: e.whyItMatters,
            trialOrSource: e.trialOrSource,
          },
        });
      });
    }

    if (baosResult) {
      baosResult.barrierSignals.forEach((b, i) => {
        if (baosDecisions[i] !== "accepted") return;
        const str = b.strength as "High" | "Medium" | "Low";
        signals.push({
          id: `baos_${brandUpper.toLowerCase()}_${i}`,
          text: b.barrierText,
          caveat: b.whyItMatters,
          direction: b.direction,
          strength: str,
          reliability: b.confidence as "Confirmed" | "Probable" | "Speculative",
          impact: str,
          category: "adoption",
          source: "system",
          accepted: true,
          signal_class: "observed",
          signal_family: "provider_behavioral",
          source_type: "BAOS",
          priority_source: "observed_verified",
          is_locked: true,
          workbook_meta: {
            sourceWorkbook: `BAOS — ${brand}`,
            programId: `BAOS-${brandUpper}`,
            whyItMatters: b.whyItMatters,
            cognitiveLens: b.cognitiveLens,
          },
        });
      });
    }

    setSubmitted(true);
    onAcceptSignals(signals);
  }

  const acceptedMiosCount = miosDecisions.filter(d => d === "accepted").length;
  const rejectedMiosCount = miosDecisions.filter(d => d === "rejected").length;
  const pendingMiosCount = miosDecisions.filter(d => d === "pending").length;
  const acceptedBaosCount = baosDecisions.filter(d => d === "accepted").length;
  const rejectedBaosCount = baosDecisions.filter(d => d === "rejected").length;
  const pendingBaosCount = baosDecisions.filter(d => d === "pending").length;
  const totalAccepted = acceptedMiosCount + acceptedBaosCount;
  const totalPending = pendingMiosCount + pendingBaosCount;
  const hasPending = totalPending > 0;

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-violet-500/20">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-foreground">MIOS / BAOS</h3>
          <span className="text-xs text-muted-foreground">Brand-specific evidence & cognitive barriers</span>
        </div>
        {phase === "idle" && (
          <button
            onClick={runMiosBaos}
            disabled={!brand}
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            <FlaskConical className="w-3 h-3" />
            Run MIOS → BAOS
          </button>
        )}
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>}

      {loading && (
        <div className="px-5 py-6 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          <div>
            <div className="text-sm text-foreground">
              {phase === "mios" ? "MIOS: Finding clinical evidence..." : "BAOS: Identifying cognitive barriers..."}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {phase === "mios"
                ? `Searching for ${brand} trial data, FDA actions, safety signals`
                : `Analyzing HCP behavioral barriers from ${miosResult?.evidenceSignals.length || 0} evidence signals`}
            </div>
          </div>
        </div>
      )}

      {phase === "done" && miosResult && baosResult && !submitted && (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-cyan-300">
                  {miosResult.evidenceSignals.length} MIOS
                  {acceptedMiosCount > 0 && <span className="text-emerald-400 ml-1">({acceptedMiosCount} accepted)</span>}
                  {rejectedMiosCount > 0 && <span className="text-rose-400 ml-1">({rejectedMiosCount} rejected)</span>}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-amber-300">
                  {baosResult.barrierSignals.length} BAOS
                  {acceptedBaosCount > 0 && <span className="text-emerald-400 ml-1">({acceptedBaosCount} accepted)</span>}
                  {rejectedBaosCount > 0 && <span className="text-rose-400 ml-1">({rejectedBaosCount} rejected)</span>}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasPending && (
                <button
                  onClick={acceptAllSignals}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Accept All
                </button>
              )}
              {totalAccepted > 0 && (
                <button
                  onClick={submitSelected}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Add {totalAccepted} Signal{totalAccepted !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5">
            <button
              onClick={() => setExpandedSections(prev => ({ ...prev, mios: !prev.mios }))}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  MIOS — Clinical Evidence ({miosResult.evidenceSignals.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {pendingMiosCount > 0 && pendingMiosCount < miosResult.evidenceSignals.length && (
                  <span className="text-[10px] text-muted-foreground">{pendingMiosCount} pending</span>
                )}
                {pendingMiosCount > 0 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(ev) => { ev.stopPropagation(); acceptAllMios(); }}
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.stopPropagation(); acceptAllMios(); } }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                  >
                    Accept all
                  </span>
                )}
                {expandedSections.mios ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
              </div>
            </button>
            {expandedSections.mios && (
              <div className="px-4 pb-4 space-y-2">
                {miosResult.beliefShiftsIdentified.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Belief Shifts</div>
                    {miosResult.beliefShiftsIdentified.map((bs, i) => (
                      <div key={i} className="text-xs text-foreground/80 pl-2 border-l-2 border-cyan-500/30 mb-1">{bs}</div>
                    ))}
                  </div>
                )}
                {miosResult.evidenceSignals.map((e, i) => {
                  const decision = miosDecisions[i];
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 space-y-2 transition-all ${
                        decision === "accepted"
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : decision === "rejected"
                          ? "bg-rose-500/5 border-rose-500/20 opacity-60"
                          : "bg-slate-800/50 border-border"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {e.direction === "positive" ? (
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <span className="text-xs text-foreground/90 leading-relaxed flex-1">{e.evidenceText}</span>
                      </div>
                      <div className="text-[10px] text-cyan-400/70">{e.trialOrSource}</div>
                      {e.whyItMatters && (
                        <div className="text-[10px] text-foreground/60 italic">{e.whyItMatters}</div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          <span className="text-[10px] text-muted-foreground" title={
                            e.strength === "High" ? "Strong evidence — large effect size or definitive trial results"
                            : e.strength === "Medium" ? "Moderate evidence — meaningful but not conclusive"
                            : "Weak evidence — suggestive but not definitive"
                          }>{e.strength}</span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground" title={
                            e.confidence === "Confirmed" ? "Verified — from published trials, FDA filings, or official sources"
                            : e.confidence === "Probable" ? "Likely accurate — from credible but not fully verified sources"
                            : "Speculative — from early reports, conference abstracts, or analyst commentary"
                          }>{e.confidence}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {decision === "accepted" && (
                            <button
                              onClick={() => setMiosDecision(i, "pending")}
                              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition cursor-pointer"
                            >
                              <Check className="w-3 h-3" /> Accepted
                            </button>
                          )}
                          {decision === "rejected" && (
                            <button
                              onClick={() => setMiosDecision(i, "pending")}
                              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition cursor-pointer"
                            >
                              <X className="w-3 h-3" /> Rejected
                            </button>
                          )}
                          {decision === "pending" && (
                            <>
                              <button
                                onClick={() => setMiosDecision(i, "accepted")}
                                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-emerald-400/70 hover:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 border border-emerald-500/20 transition cursor-pointer"
                              >
                                <Check className="w-3 h-3" /> Accept
                              </button>
                              <button
                                onClick={() => setMiosDecision(i, "rejected")}
                                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-rose-400/70 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/20 transition cursor-pointer"
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {miosResult.searchSummary && (
                  <div className="text-xs text-muted-foreground/70 italic mt-2">{miosResult.searchSummary}</div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5">
            <button
              onClick={() => setExpandedSections(prev => ({ ...prev, baos: !prev.baos }))}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  BAOS — Cognitive Barriers ({baosResult.barrierSignals.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {pendingBaosCount > 0 && pendingBaosCount < baosResult.barrierSignals.length && (
                  <span className="text-[10px] text-muted-foreground">{pendingBaosCount} pending</span>
                )}
                {pendingBaosCount > 0 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(ev) => { ev.stopPropagation(); acceptAllBaos(); }}
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.stopPropagation(); acceptAllBaos(); } }}
                    className="text-[10px] text-amber-400 hover:text-amber-300 transition cursor-pointer"
                  >
                    Accept all
                  </span>
                )}
                {expandedSections.baos ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
              </div>
            </button>
            {expandedSections.baos && (
              <div className="px-4 pb-4 space-y-2">
                {baosResult.barrierSignals.map((b, i) => {
                  const decision = baosDecisions[i];
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 space-y-2 transition-all ${
                        decision === "accepted"
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : decision === "rejected"
                          ? "bg-rose-500/5 border-rose-500/20 opacity-60"
                          : "bg-slate-800/50 border-border"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {b.direction === "positive" ? (
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <span className="text-xs text-foreground/90 leading-relaxed flex-1">{b.barrierText}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded" title="The cognitive bias or mental model that creates this barrier to adoption">{b.cognitiveLens}</span>
                        <span className="text-[10px] text-muted-foreground" title="The specific group of prescribers or stakeholders affected by this barrier">{b.affectedSegment}</span>
                      </div>
                      {b.whyItMatters && (
                        <div className="text-[10px] text-foreground/60 italic">{b.whyItMatters}</div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          <span className="text-[10px] text-muted-foreground" title={
                            b.strength === "High" ? "Strong barrier — likely to significantly slow or prevent adoption"
                            : b.strength === "Medium" ? "Moderate barrier — can be overcome with targeted effort"
                            : "Mild barrier — unlikely to significantly impede adoption"
                          }>{b.strength}</span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground" title={
                            b.confidence === "Confirmed" ? "Well-documented barrier — observed in clinical practice"
                            : b.confidence === "Probable" ? "Likely barrier based on related evidence"
                            : "Hypothesized barrier — inferred from limited data"
                          }>{b.confidence}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {decision === "accepted" && (
                            <button
                              onClick={() => setBaosDecision(i, "pending")}
                              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition cursor-pointer"
                            >
                              <Check className="w-3 h-3" /> Accepted
                            </button>
                          )}
                          {decision === "rejected" && (
                            <button
                              onClick={() => setBaosDecision(i, "pending")}
                              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition cursor-pointer"
                            >
                              <X className="w-3 h-3" /> Rejected
                            </button>
                          )}
                          {decision === "pending" && (
                            <>
                              <button
                                onClick={() => setBaosDecision(i, "accepted")}
                                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-emerald-400/70 hover:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 border border-emerald-500/20 transition cursor-pointer"
                              >
                                <Check className="w-3 h-3" /> Accept
                              </button>
                              <button
                                onClick={() => setBaosDecision(i, "rejected")}
                                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-rose-400/70 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/20 transition cursor-pointer"
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {baosResult.barrierSummary && (
                  <div className="text-xs text-muted-foreground/70 italic mt-2">{baosResult.barrierSummary}</div>
                )}
              </div>
            )}
          </div>

          {totalAccepted > 0 && (
            <div className="flex items-center justify-end pt-2">
              <button
                onClick={submitSelected}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Add {totalAccepted} Signal{totalAccepted !== 1 ? "s" : ""} to Forecast
              </button>
            </div>
          )}
        </div>
      )}

      {submitted && (
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">{totalAccepted} signal{totalAccepted !== 1 ? "s" : ""} added</span>
              {(rejectedMiosCount + rejectedBaosCount) > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({rejectedMiosCount + rejectedBaosCount} rejected)
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setSubmitted(false);
                setPhase("idle");
                setMiosResult(null);
                setBaosResult(null);
                setMiosDecisions([]);
                setBaosDecisions([]);
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Run Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
