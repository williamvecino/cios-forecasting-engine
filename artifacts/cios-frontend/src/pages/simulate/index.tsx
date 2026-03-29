import { useState, useRef, useEffect, useMemo } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  Loader2,
  AlertTriangle,
  Upload,
  Play,
  FileText,
  Image as ImageIcon,
  X,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { ActorSegmentationPanel } from "@/components/simulate/ActorSegmentationPanel";
import { StakeholderReactionPanel } from "@/components/simulate/StakeholderReactionPanel";
import { detectCaseType, REGULATORY_SEGMENTS, COMMERCIAL_SEGMENTS, getRegulatorySegments } from "@/lib/case-type-utils";

interface ArchetypeInfo {
  segment_name: string;
  primary_archetype: { archetype_name: string; confidence: string };
  secondary_archetype: { archetype_name: string; confidence: string } | null;
  why_assigned: string;
  likely_triggers: string[];
  likely_barriers: string[];
}

interface MaterialFeature {
  feature: string;
  strength: "strong" | "moderate" | "weak" | "absent";
  detail: string;
}

interface SignalClassification {
  signal: string;
  type: string;
}

interface DecisionSensitivityItem {
  factor: string;
  sensitivity: "HIGH" | "MODERATE" | "LOW";
  impact_estimate: string;
}

interface SimulationResult {
  adoption_likelihood: number;
  confidence: string;
  primary_reaction: string;
  what_this_changes: string;
  what_this_does_not_change: string;
  primary_remaining_barrier: string;
  strongest_trigger_for_movement: string;
  material_effectiveness: string;
  material_features: MaterialFeature[];
  signal_classifications?: SignalClassification[];
  propagation_pathway?: string[];
  decision_sensitivity?: DecisionSensitivityItem[];
}

const DEFAULT_SEGMENTS = COMMERCIAL_SEGMENTS;

const FEATURE_LABELS: Record<string, string> = {
  efficacy_strength: "Efficacy Strength",
  survival_benefit: "Survival Benefit",
  safety_reassurance: "Safety Reassurance",
  real_world_evidence: "Real-World Evidence",
  guideline_relevance: "Guideline Relevance",
  access_support: "Access Support",
  heor_cost_effectiveness: "HEOR / Cost-Effectiveness",
  workflow_convenience: "Workflow Convenience",
  operational_support: "Operational Support",
  comparative_evidence: "Comparative Evidence",
  implementation_burden: "Implementation Burden",
  patient_support_adherence: "Patient Support / Adherence",
};

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

function strengthIcon(strength: string) {
  if (strength === "strong") return <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (strength === "moderate") return <ArrowUp className="w-3.5 h-3.5 text-amber-400" />;
  if (strength === "weak") return <ArrowDown className="w-3.5 h-3.5 text-orange-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground/40" />;
}

function strengthBadge(strength: string) {
  const styles: Record<string, string> = {
    strong: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    moderate: "text-amber-400 bg-amber-400/10 border-amber-400/30",
    weak: "text-orange-400 bg-orange-400/10 border-orange-400/30",
    absent: "text-muted-foreground/50 bg-muted/10 border-muted/30",
  };
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${styles[strength] || styles.absent}`}>
      {strength}
    </span>
  );
}

export default function SimulatePage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [materialText, setMaterialText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archetypes, setArchetypes] = useState<ArchetypeInfo[]>([]);
  const [showFeatures, setShowFeatures] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";
  const questionText = activeQuestion?.text || "";
  const caseTypeInfo = useMemo(() => detectCaseType(questionText), [questionText]);
  const SEGMENTS = caseTypeInfo.isRegulatory ? getRegulatorySegments(questionText) : DEFAULT_SEGMENTS;
  const hasInput = selectedSegment && (materialText.trim() || file);

  useEffect(() => {
    if (!caseId) {
      setArchetypes([]);
      return;
    }
    try {
      const decide = localStorage.getItem(`cios.decideResult:${caseId}`);
      if (decide) {
        const parsed = JSON.parse(decide);
        setArchetypes(parsed.archetype_assignments?.length ? parsed.archetype_assignments : []);
      } else {
        setArchetypes([]);
      }
    } catch {
      setArchetypes([]);
    }
  }, [caseId]);

  const selectedArchetype = archetypes.find(
    a => a.segment_name.toLowerCase() === selectedSegment?.toLowerCase()
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  function clearFile() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function runSimulation() {
    if (!activeQuestion || !selectedSegment || !hasInput) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let gates: any[] = [];
      let barriers: any[] = [];
      let triggers: any[] = [];
      let signals: any[] = [];
      let probability: number | null = null;
      let constrainedProbability: number | null = null;

      try {
        const decomp = localStorage.getItem(`cios.eventDecomposition:${caseId}`);
        if (decomp) {
          const parsed = JSON.parse(decomp);
          gates = parsed.event_gates || [];
          probability = parsed.brand_outlook_probability ?? null;
          constrainedProbability = parsed.constrained_probability ?? null;
        }
      } catch {}

      try {
        const decide = localStorage.getItem(`cios.decideResult:${caseId}`);
        if (decide) {
          const parsed = JSON.parse(decide);
          barriers = parsed.derived_decisions?.barriers || [];
          triggers = parsed.derived_decisions?.trigger_events || [];
        }
      } catch {}

      try {
        const sigRaw = localStorage.getItem(`cios.signals:${caseId}`);
        if (sigRaw) {
          signals = JSON.parse(sigRaw)
            .filter((s: any) => s.accepted && !s.dismissed)
            .map((s: any) => ({ text: s.text, direction: s.direction, importance: s.importance }));
        }
      } catch {}

      const contextData: Record<string, any> = {
        segment: selectedSegment,
        archetype: selectedArchetype?.primary_archetype?.archetype_name || null,
        questionText,
        subject: activeQuestion.subject || questionText,
        timeHorizon: activeQuestion.timeHorizon || "12 months",
        probability,
        constrainedProbability,
        gates,
        barriers,
        triggers,
        signals,
      };

      let res: Response;

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        if (materialText.trim()) {
          contextData.materialText = materialText.trim();
        }
        formData.append("data", JSON.stringify(contextData));

        res = await fetch(`${getApiBase()}/ai-simulate/reaction`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`${getApiBase()}/ai-simulate/reaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...contextData, materialText: materialText.trim() }),
        });
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setSelectedSegment(null);
    setMaterialText("");
    clearFile();
    setError(null);
    setShowFeatures(true);
  }

  function likelihoodColor(value: number): string {
    if (value >= 65) return "text-emerald-400";
    if (value >= 40) return "text-amber-400";
    return "text-rose-400";
  }

  function confidenceColor(level: string): string {
    if (level === "High") return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
    if (level === "Moderate") return "text-amber-400 bg-amber-400/10 border-amber-400/30";
    return "text-rose-400 bg-rose-400/10 border-rose-400/30";
  }

  return (
    <WorkflowLayout currentStep="simulate" activeQuestion={activeQuestion} onClearQuestion={clearQuestion}>
      <QuestionGate activeQuestion={activeQuestion}>
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Step 6</p>
            <h1 className="text-xl font-bold text-foreground">{caseTypeInfo.stepNames.simulate}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Test how a defined segment responds to specific materials under current constraints.
            </p>
          </div>

          {!result && !loading && (
            <div className="space-y-6">
              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Select Segment</h2>
                <div className="grid grid-cols-2 gap-3">
                  {SEGMENTS.map(seg => {
                    const arch = archetypes.find(a => a.segment_name === seg.key);
                    const selected = selectedSegment === seg.key;
                    return (
                      <button
                        key={seg.key}
                        onClick={() => setSelectedSegment(seg.key)}
                        className={`text-left rounded-xl border px-4 py-3 transition ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                        }`}
                      >
                        <p className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{seg.key}</p>
                        {arch && (
                          <p className="text-[11px] text-violet-400 mt-0.5">{arch.primary_archetype.archetype_name}</p>
                        )}
                        {!arch && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">No archetype assigned</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {selectedSegment && selectedArchetype && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">{selectedSegment}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-xs font-semibold text-violet-300">{selectedArchetype.primary_archetype.archetype_name}</span>
                    </div>
                    {selectedArchetype.secondary_archetype && (
                      <span className="text-[10px] text-muted-foreground/60">
                        Also: {selectedArchetype.secondary_archetype.archetype_name}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">{selectedArchetype.why_assigned}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {selectedArchetype.likely_triggers.slice(0, 2).map((t, i) => (
                      <span key={i} className="text-[11px] text-emerald-400/80">↑ {t}</span>
                    ))}
                    {selectedArchetype.likely_barriers.slice(0, 2).map((b, i) => (
                      <span key={i} className="text-[11px] text-rose-400/80">↓ {b}</span>
                    ))}
                  </div>
                </div>
              )}

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Upload Material</h2>

                <div className="space-y-3">
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="rounded-xl border border-dashed border-border bg-card/50 p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition"
                  >
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop or click to upload PPT, PDF, image, or document
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      onChange={handleFileChange}
                      accept=".pptx,.ppt,.pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                    />
                  </div>

                  {file && (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                      {file.type.startsWith("image/")
                        ? <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
                        : <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      }
                      <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
                      <button onClick={clearFile} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <textarea
                    value={materialText}
                    onChange={e => setMaterialText(e.target.value)}
                    placeholder="Or paste message text, talking points, or key claims here..."
                    rows={4}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </section>

              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-400">{error}</p>
                </div>
              )}

              <button
                onClick={runSimulation}
                disabled={!hasInput}
                className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  hasInput
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted/20 text-muted-foreground cursor-not-allowed"
                }`}
              >
                <Play className="w-4 h-4" />
                Run Simulation
              </button>
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Extracting material features and scoring {selectedSegment} reaction...
              </p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Segment:</span>
                  <span className="text-sm font-semibold text-foreground">{selectedSegment}</span>
                  {selectedArchetype && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-xs font-semibold text-violet-400">{selectedArchetype.primary_archetype.archetype_name}</span>
                    </>
                  )}
                </div>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
                >
                  New Simulation
                </button>
              </div>

              {result.material_features?.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                  <button
                    onClick={() => setShowFeatures(!showFeatures)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/10 transition"
                  >
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Extracted Material Features
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {result.material_features.filter(f => f.strength !== "absent").length} present · {result.material_features.filter(f => f.strength === "absent").length} absent
                    </span>
                  </button>
                  {showFeatures && (
                    <div className="px-5 pb-4 space-y-1.5">
                      {result.material_features
                        .sort((a, b) => {
                          const order = { strong: 0, moderate: 1, weak: 2, absent: 3 };
                          return (order[a.strength] ?? 4) - (order[b.strength] ?? 4);
                        })
                        .map(f => (
                          <div
                            key={f.feature}
                            className={`flex items-start gap-2.5 rounded-lg px-3 py-2 ${
                              f.strength === "absent" ? "opacity-40" : ""
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">{strengthIcon(f.strength)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-medium text-foreground">
                                  {FEATURE_LABELS[f.feature] || f.feature}
                                </span>
                                {strengthBadge(f.strength)}
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{f.detail}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Adoption Likelihood</p>
                    <p className={`text-4xl font-bold mt-1 ${likelihoodColor(result.adoption_likelihood)}`}>
                      {result.adoption_likelihood}%
                    </p>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidenceColor(result.confidence)}`}>
                    {result.confidence} Confidence
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Primary Reaction</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{result.primary_reaction}</p>
                  </div>

                  <div className="border-t border-border/40" />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">What This Changes</p>
                      <p className="text-[13px] text-foreground leading-relaxed">{result.what_this_changes}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-2">What This Does Not Change</p>
                      <p className="text-[13px] text-foreground leading-relaxed">{result.what_this_does_not_change}</p>
                    </div>
                  </div>

                  <div className="border-t border-border/40" />

                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Primary Remaining Barrier</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{result.primary_remaining_barrier}</p>
                  </div>

                  <div className="border-t border-border/40" />

                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Strongest Trigger for Movement</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{result.strongest_trigger_for_movement}</p>
                  </div>

                  <div className="border-t border-border/40" />

                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Material Effectiveness</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{result.material_effectiveness}</p>
                  </div>
                </div>
              </div>

              {result.propagation_pathway && result.propagation_pathway.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Propagation Pathway</p>
                  <div className="space-y-2">
                    {result.propagation_pathway.map((pathway, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[11px] text-primary/60 font-mono mt-0.5 shrink-0">{i + 1}.</span>
                        <p className="text-[13px] text-foreground leading-relaxed font-mono">{pathway}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.decision_sensitivity && result.decision_sensitivity.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Decision Sensitivity</p>
                  <div className="space-y-2">
                    {result.decision_sensitivity.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2 bg-muted/5">
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                          item.sensitivity === "HIGH"
                            ? "text-rose-400 bg-rose-400/10 border-rose-400/30"
                            : item.sensitivity === "MODERATE"
                            ? "text-amber-400 bg-amber-400/10 border-amber-400/30"
                            : "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                        }`}>
                          {item.sensitivity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground">{item.factor}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.impact_estimate}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.signal_classifications && result.signal_classifications.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Signal Classifications</p>
                  <div className="flex flex-wrap gap-2">
                    {result.signal_classifications.map((sc, i) => (
                      <div key={i} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 max-w-xs">
                        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">{sc.type.replace(/_/g, " ")}</span>
                        <p className="text-[11px] text-foreground/80 mt-0.5 leading-relaxed">{sc.signal}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <ActorSegmentationPanel
          question={activeQuestion?.text || ""}
          brand={activeQuestion?.subject}
          therapeuticArea={typeof window !== "undefined" ? localStorage.getItem("cios.therapeuticArea") || undefined : undefined}
          signals={[]}
          context={`Case: ${caseId}. Simulating material impact on ${selectedSegment || "all segments"}.`}
        />

        <StakeholderReactionPanel
          question={activeQuestion?.text || ""}
          brand={activeQuestion?.subject}
          therapeuticArea={typeof window !== "undefined" ? localStorage.getItem("cios.therapeuticArea") || undefined : undefined}
          context={`Case: ${caseId}. Simulating material impact on ${selectedSegment || "all segments"}.`}
        />
      </QuestionGate>
    </WorkflowLayout>
  );
}
