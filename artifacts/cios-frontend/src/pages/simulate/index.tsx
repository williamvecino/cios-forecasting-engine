import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import type { ActiveQuestion } from "@/lib/workflow";
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
  Star,
  Check,
  Paperclip,
  Users,
  Zap,
  Target,
  Shield,
  TrendingUp,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Activity,
  TrendingDown,
  Newspaper,
  HelpCircle,
} from "lucide-react";
import { ActorSegmentationPanel } from "@/components/simulate/ActorSegmentationPanel";
import { MethodologyGuidance } from "@/components/methodology-guidance";
import { detectCaseType, COMMERCIAL_SEGMENTS, SAFETY_RISK_SEGMENTS, getRegulatorySegments } from "@/lib/case-type-utils";

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

interface DriverItem {
  driver: string;
  weight: "HIGH" | "MODERATE" | "LOW";
  direction: "supporting" | "opposing" | "neutral";
  rationale: string;
}

interface SimulationResult {
  case_type?: string;
  vocabulary_replacements?: Record<string, string>;
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
  drivers?: DriverItem[];
}

const DEFAULT_SEGMENTS = COMMERCIAL_SEGMENTS;

const RECOMMENDED_SEGMENTS: Record<string, Record<string, string> | string> = {
  commercial: "Persuadables",
  safety_risk: "Pause Pending Clarification",
  regulatory_approval: {
    fda: "FDA Review Division",
    ema: "CHMP / Rapporteur Team",
    mhra: "CHMP / Rapporteur Team",
    other: "FDA Review Division",
    default: "FDA Review Division",
  },
  clinical_outcome: "Persuadables",
};

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

const SCENARIO_TYPES = [
  { value: "regulatory_update", label: "Regulatory Update" },
  { value: "safety_communication", label: "Safety Communication" },
  { value: "guideline_change", label: "Guideline Change" },
  { value: "market_restriction", label: "Market Restriction" },
  { value: "competitor_action", label: "Competitor Action" },
  { value: "new_evidence", label: "New Clinical Evidence" },
  { value: "payer_decision", label: "Payer Decision" },
];

const MESSAGE_SOURCES = [
  { value: "fda", label: "FDA" },
  { value: "ema", label: "EMA" },
  { value: "guideline_committee", label: "Guideline Committee" },
  { value: "payer", label: "Payer / PBM" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "journal", label: "Published Study" },
  { value: "media", label: "Media / Press" },
];

const IMPACT_LEVELS = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];

const TIME_FRAMES = [
  { value: "immediate", label: "Immediate" },
  { value: "3mo", label: "Within 3 months" },
  { value: "6mo", label: "Within 6 months" },
  { value: "12mo", label: "Within 12 months" },
];

const CONFIDENCE_LEVELS = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];

const EXPECTED_EFFECTS = [
  { value: "increases", label: "Increases probability" },
  { value: "decreases", label: "Decreases probability" },
  { value: "mixed", label: "Mixed / uncertain" },
  { value: "delays", label: "Delays timeline" },
  { value: "reverses", label: "Reverses prior trend" },
];

const SCENARIO_POLARITY = [
  { value: "positive", label: "Positive scenario" },
  { value: "negative", label: "Negative scenario" },
  { value: "neutral", label: "Neutral scenario" },
  { value: "delay", label: "Delay scenario" },
  { value: "reversal", label: "Reversal scenario" },
];

const PRIMARY_TARGETS = [
  { value: "regulators", label: "Regulators" },
  { value: "guideline_bodies", label: "Guideline bodies" },
  { value: "payers", label: "Payers" },
  { value: "prescribers", label: "Prescribers" },
  { value: "institutions", label: "Institutions / formulary committees" },
  { value: "patients", label: "Patients / advocacy groups" },
  { value: "competitors", label: "Competitors" },
];

const EVIDENCE_BASIS_OPTIONS = [
  { value: "regulatory_communication", label: "Regulatory communication" },
  { value: "peer_reviewed_study", label: "Peer-reviewed study" },
  { value: "observational_rwd", label: "Observational / real-world data" },
  { value: "legal_litigation", label: "Legal / litigation event" },
  { value: "guideline_update", label: "Guideline update" },
  { value: "media_pressure", label: "Media / public pressure" },
  { value: "internal_hypothesis", label: "Internal hypothesis / scenario assumption" },
];

const SEGMENT_META: Record<string, { color: string; behaviorType: string; decisionRole: string; riskPosture: string; icon: typeof TrendingUp }> = {
  "Early Adopters": { color: "emerald", behaviorType: "Innovation-seeking", decisionRole: "First prescriber", riskPosture: "Risk tolerant", icon: TrendingUp },
  "Persuadables": { color: "blue", behaviorType: "Evidence-driven", decisionRole: "Fast follower", riskPosture: "Moderate risk", icon: Target },
  "Late Movers": { color: "amber", behaviorType: "Inertia-bound", decisionRole: "Delayed adopter", riskPosture: "Risk averse", icon: Clock },
  "Resistant": { color: "rose", behaviorType: "Status-quo defender", decisionRole: "Active holdout", riskPosture: "High risk aversion", icon: Shield },
  "Risk Gatekeepers": { color: "violet", behaviorType: "Compliance-focused", decisionRole: "Institutional gatekeeper", riskPosture: "Policy-driven", icon: Shield },
  "Switch Immediately": { color: "emerald", behaviorType: "Rapid responder", decisionRole: "Early mover", riskPosture: "Action-oriented", icon: Zap },
  "Pause Pending Clarification": { color: "amber", behaviorType: "Evidence-seeker", decisionRole: "Cautious evaluator", riskPosture: "Risk averse", icon: Clock },
  "Wait for Consensus": { color: "blue", behaviorType: "Guideline follower", decisionRole: "Consensus-driven", riskPosture: "Moderate", icon: Users },
  "Defend Current Use": { color: "rose", behaviorType: "Loyalty-driven", decisionRole: "Defender", riskPosture: "Inertia-bound", icon: Shield },
  "FDA Review Division": { color: "blue", behaviorType: "Evidence-evaluating", decisionRole: "Primary reviewer", riskPosture: "Benefit-risk focused", icon: Shield },
  "Advisory Committee Members": { color: "violet", behaviorType: "Consensus-building", decisionRole: "External advisor", riskPosture: "Risk-conscious", icon: Users },
  "Sponsor Regulatory Team": { color: "emerald", behaviorType: "Strategy-driven", decisionRole: "Submission owner", riskPosture: "Outcome-oriented", icon: Target },
  "Safety Reviewers": { color: "rose", behaviorType: "Signal-monitoring", decisionRole: "Safety evaluator", riskPosture: "Precautionary", icon: Shield },
  "Patient Advocacy Groups": { color: "amber", behaviorType: "Access-focused", decisionRole: "External stakeholder", riskPosture: "Benefit-driven", icon: Users },
  "CHMP / Rapporteur Team": { color: "blue", behaviorType: "Scientific assessment", decisionRole: "Lead evaluator", riskPosture: "Benefit-risk focused", icon: Shield },
  "PRAC Safety Reviewers": { color: "rose", behaviorType: "Pharmacovigilance-focused", decisionRole: "Risk assessor", riskPosture: "Precautionary", icon: Shield },
  "Marketing Authorization Holder (MAH)": { color: "emerald", behaviorType: "Compliance-driven", decisionRole: "Authorization holder", riskPosture: "Regulatory-aligned", icon: Target },
  "Scientific Advisory Group": { color: "violet", behaviorType: "Expert-consulting", decisionRole: "Scientific advisor", riskPosture: "Evidence-driven", icon: Users },
  "Continue Prescribing (Risk-Benefit)": { color: "emerald", behaviorType: "Risk-tolerant", decisionRole: "Active prescriber", riskPosture: "Benefit outweighs risk", icon: TrendingUp },
  "Wait for Guideline Direction": { color: "blue", behaviorType: "Guideline-dependent", decisionRole: "Consensus follower", riskPosture: "Cautious", icon: Clock },
  "Payer Safety Reviewers": { color: "violet", behaviorType: "Coverage-evaluating", decisionRole: "Formulary reviewer", riskPosture: "Policy-driven", icon: Shield },
};

function getSegmentMeta(key: string) {
  return SEGMENT_META[key] || { color: "slate", behaviorType: "General", decisionRole: "Participant", riskPosture: "Neutral", icon: Users };
}

const SEGMENT_COLOR_MAP: Record<string, { border: string; bg: string; text: string; ring: string; badge: string }> = {
  emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-400", ring: "ring-emerald-500/40", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  blue: { border: "border-blue-500/30", bg: "bg-blue-500/5", text: "text-blue-400", ring: "ring-blue-500/40", badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  amber: { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-400", ring: "ring-amber-500/40", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  rose: { border: "border-rose-500/30", bg: "bg-rose-500/5", text: "text-rose-400", ring: "ring-rose-500/40", badge: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  violet: { border: "border-violet-500/30", bg: "bg-violet-500/5", text: "text-violet-400", ring: "ring-violet-500/40", badge: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  slate: { border: "border-slate-500/30", bg: "bg-slate-500/5", text: "text-slate-400", ring: "ring-slate-500/40", badge: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
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

type AccordionSection = "reaction" | "features" | "drivers" | "propagation" | "sensitivity" | "classifications" | "safety_measures" | null;

const SAFETY_SUCCESS_MEASURES = [
  { label: "Switch Rate Monitoring", icon: Activity, description: "Track prescriber movement between behavioral segments (continue, pause, wait, switch) over time. Measure velocity and volume of switches to alternative therapies." },
  { label: "Adverse Event Reporting Trends", icon: TrendingDown, description: "Monitor frequency, severity, and case seriousness trends in spontaneous and solicited adverse event reports. Track reporting rate changes relative to prescription volume." },
  { label: "Media Sentiment Trajectory", icon: Newspaper, description: "Monitor professional media, social media, and patient community sentiment about the safety signal. Track narrative shifts that influence prescriber and patient behavior." },
];

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isComplete = stepNum < current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-initial">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                isComplete ? "bg-primary text-primary-foreground" :
                isActive ? "bg-primary/20 text-primary border-2 border-primary" :
                "bg-muted/20 text-muted-foreground border border-border"
              }`}>
                {isComplete ? <Check className="w-3.5 h-3.5" /> : stepNum}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${isActive ? "text-foreground" : isComplete ? "text-primary" : "text-muted-foreground/60"}`}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-3 ${isComplete ? "bg-primary/40" : "bg-border/40"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DropdownField({ label, value, onChange, options, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-muted-foreground mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function ResultsAccordion({ result, selectedSegment, selectedArchetype, caseTypeInfo, onReset }: {
  result: SimulationResult;
  selectedSegment: string | null;
  selectedArchetype: ArchetypeInfo | undefined;
  caseTypeInfo: { isSafety: boolean; isRegulatory: boolean; stepNames: { simulate: string } };
  onReset: () => void;
}) {
  const [activeSection, setActiveSection] = useState<AccordionSection>("reaction");

  interface SavedScenarioLocal {
    name: string;
    label: "Base" | "Bull" | "Bear" | string;
    probability: number;
    reaction: string;
    barrier: string;
    trigger: string;
    confidence: string;
  }
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioLocal[]>([]);
  const [scenarioName] = useState("");

  const apiCaseType = result.case_type;
  const isSafetyFromApi = apiCaseType === "safety_risk";
  const isRegulatoryFromApi = apiCaseType === "regulatory_approval";
  const isSafety = isSafetyFromApi || caseTypeInfo.isSafety;
  const isRegulatory = isRegulatoryFromApi || caseTypeInfo.isRegulatory;

  function toggle(section: AccordionSection) {
    setActiveSection(prev => prev === section ? null : section);
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

  function applyVocab(text: string): string {
    const replacements = result.vocabulary_replacements;
    if (!replacements || Object.keys(replacements).length === 0) return text;
    let out = text;
    for (const [from, to] of Object.entries(replacements)) {
      out = out.replaceAll(from, to);
    }
    return out;
  }

  function AccordionHeader({ title, isOpen, onClick, count }: { title: string; isOpen: boolean; onClick: () => void; count?: number }) {
    return (
      <button onClick={onClick} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/10 transition text-left">
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</span>
        </div>
        {count !== undefined && <span className="text-[10px] text-muted-foreground/50">{count} items</span>}
      </button>
    );
  }

  return (
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
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
        >
          New Simulation
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {isSafety ? "Safety Impact Likelihood" : isRegulatory ? "Regulatory Adoption Likelihood" : "Adoption Likelihood"}
            </p>
            <p className={`text-4xl font-bold mt-1 ${likelihoodColor(result.adoption_likelihood)}`}>
              {result.adoption_likelihood}%
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidenceColor(result.confidence)}`}>
              {result.confidence} Confidence
            </div>
            <div className="flex gap-1">
              {(["Base", "Bull", "Bear"] as const).map((label) => (
                <button
                  key={label}
                  onClick={() => {
                    const existing = savedScenarios.findIndex((s) => s.label === label);
                    const entry: SavedScenarioLocal = {
                      name: scenarioName || label,
                      label,
                      probability: result.adoption_likelihood,
                      reaction: result.primary_reaction,
                      barrier: result.primary_remaining_barrier,
                      trigger: result.strongest_trigger_for_movement,
                      confidence: result.confidence,
                    };
                    if (existing >= 0) {
                      setSavedScenarios((prev) => prev.map((s, i) => (i === existing ? entry : s)));
                    } else {
                      setSavedScenarios((prev) => [...prev, entry]);
                    }
                  }}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                    label === "Bull" ? "border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" :
                    label === "Bear" ? "border border-rose-500/30 text-rose-400 hover:bg-rose-500/10" :
                    "border border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  } ${savedScenarios.some((s) => s.label === label) ? "bg-opacity-20" : ""}`}
                >
                  Save as {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Primary Reaction</p>
          <p className="text-[15px] text-foreground leading-relaxed">{applyVocab(result.primary_reaction)}</p>
        </div>
      </div>

      {savedScenarios.length >= 2 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Scenario Comparison</h3>
          <div className={`grid gap-4 ${savedScenarios.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {savedScenarios.map((s) => (
              <div
                key={s.label}
                className={`rounded-xl border p-4 space-y-3 ${
                  s.label === "Bull" ? "border-emerald-500/20 bg-emerald-500/5" :
                  s.label === "Bear" ? "border-rose-500/20 bg-rose-500/5" :
                  "border-blue-500/20 bg-blue-500/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    s.label === "Bull" ? "text-emerald-400" : s.label === "Bear" ? "text-rose-400" : "text-blue-400"
                  }`}>{s.label} Case</span>
                  <span className={`text-2xl font-bold ${likelihoodColor(s.probability)}`}>{s.probability}%</span>
                </div>
                <div className="text-[10px] text-muted-foreground font-medium">{s.name}</div>
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Reaction</div>
                    <p className="text-xs text-foreground/80 line-clamp-2">{s.reaction}</p>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Key Barrier</div>
                    <p className="text-xs text-foreground/80 line-clamp-2">{s.barrier}</p>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Trigger for Movement</div>
                    <p className="text-xs text-foreground/80 line-clamp-2">{s.trigger}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/30">
        <div>
          <AccordionHeader title="Impact Analysis" isOpen={activeSection === "reaction"} onClick={() => toggle("reaction")} />
          {activeSection === "reaction" && (
            <div className="px-5 pb-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">What This Changes</p>
                  <p className="text-[13px] text-foreground leading-relaxed">{applyVocab(result.what_this_changes)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-2">What This Does Not Change</p>
                  <p className="text-[13px] text-foreground leading-relaxed">{applyVocab(result.what_this_does_not_change)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Primary Remaining Barrier</p>
                  <p className="text-[13px] text-foreground leading-relaxed">{applyVocab(result.primary_remaining_barrier)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Strongest Trigger for Movement</p>
                  <p className="text-[13px] text-foreground leading-relaxed">{applyVocab(result.strongest_trigger_for_movement)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Material Effectiveness</p>
                <p className="text-[13px] text-foreground leading-relaxed">{applyVocab(result.material_effectiveness)}</p>
              </div>
            </div>
          )}
        </div>

        {result.material_features?.length > 0 && (
          <div>
            <AccordionHeader
              title="Extracted Material Features"
              isOpen={activeSection === "features"}
              onClick={() => toggle("features")}
              count={result.material_features.filter(f => f.strength !== "absent").length}
            />
            {activeSection === "features" && (
              <div className="px-5 pb-4 space-y-1.5">
                {result.material_features
                  .sort((a, b) => {
                    const order = { strong: 0, moderate: 1, weak: 2, absent: 3 };
                    return (order[a.strength] ?? 4) - (order[b.strength] ?? 4);
                  })
                  .map(f => (
                    <div
                      key={f.feature}
                      className={`flex items-start gap-2.5 rounded-lg px-3 py-2 ${f.strength === "absent" ? "opacity-40" : ""}`}
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

        {result.drivers && result.drivers.length > 0 && (
          <div>
            <AccordionHeader
              title="Driver Analysis"
              isOpen={activeSection === "drivers"}
              onClick={() => toggle("drivers")}
              count={result.drivers.length}
            />
            {activeSection === "drivers" && (
              <div className="px-5 pb-4 space-y-2">
                {result.drivers
                  .sort((a, b) => {
                    const order = { HIGH: 0, MODERATE: 1, LOW: 2 };
                    return (order[a.weight] ?? 1) - (order[b.weight] ?? 1);
                  })
                  .map((d, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2 bg-muted/5">
                      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                          d.weight === "HIGH"
                            ? "text-rose-400 bg-rose-400/10 border-rose-400/30"
                            : d.weight === "MODERATE"
                            ? "text-amber-400 bg-amber-400/10 border-amber-400/30"
                            : "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                        }`}>
                          {d.weight}
                        </span>
                        <span className={`text-[9px] font-medium ${
                          d.direction === "supporting" ? "text-emerald-400"
                            : d.direction === "opposing" ? "text-rose-400"
                            : "text-slate-400"
                        }`}>
                          {d.direction === "supporting" ? "▲" : d.direction === "opposing" ? "▼" : "—"} {d.direction}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground">{d.driver}</p>
                        {d.rationale && <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{d.rationale}</p>}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {result.propagation_pathway && result.propagation_pathway.length > 0 && (
          <div>
            <AccordionHeader title="Propagation Pathway" isOpen={activeSection === "propagation"} onClick={() => toggle("propagation")} />
            {activeSection === "propagation" && (
              <div className="px-5 pb-4 space-y-2">
                {result.propagation_pathway.map((pathway, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[11px] text-primary/60 font-mono mt-0.5 shrink-0">{i + 1}.</span>
                    <p className="text-[13px] text-foreground leading-relaxed font-mono">{pathway}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {result.decision_sensitivity && result.decision_sensitivity.length > 0 && (
          <div>
            <AccordionHeader title="Decision Sensitivity" isOpen={activeSection === "sensitivity"} onClick={() => toggle("sensitivity")} />
            {activeSection === "sensitivity" && (
              <div className="px-5 pb-4 space-y-2">
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
            )}
          </div>
        )}

        {result.signal_classifications && result.signal_classifications.length > 0 && (
          <div>
            <AccordionHeader title="Signal Classifications" isOpen={activeSection === "classifications"} onClick={() => toggle("classifications")} />
            {activeSection === "classifications" && (
              <div className="px-5 pb-4 flex flex-wrap gap-2">
                {result.signal_classifications.map((sc, i) => (
                  <div key={i} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 max-w-xs">
                    <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">{sc.type.replace(/_/g, " ")}</span>
                    <p className="text-[11px] text-foreground/80 mt-0.5 leading-relaxed">{sc.signal}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isSafety && (
          <div>
            <AccordionHeader title="Safety-Specific Success Measures" isOpen={activeSection === "safety_measures"} onClick={() => toggle("safety_measures")} />
            {activeSection === "safety_measures" && (
              <div className="px-5 pb-4 space-y-3">
                {SAFETY_SUCCESS_MEASURES.map((measure) => {
                  const Icon = measure.icon;
                  return (
                    <div key={measure.label} className="flex items-start gap-3 rounded-lg border border-rose-500/10 bg-rose-500/5 px-4 py-3">
                      <Icon className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">{measure.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{measure.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SYNTHETIC COHORT PANEL ────────────────────────────────────────────────────
// Behavioral anchors are prompt-only — never surfaced in the UI.

const BEHAVIORAL_ANCHORS: Record<string, string> = {
  innovator: `
Calibration context (do not mention in your response):
- Specialist physicians adopt new drugs 4–6 months ahead of generalists on average.
- Physicians with the highest within-class prescribing volume and strong scientific
  commitment are the most consistent innovators across therapeutic areas.
- KOL peer network exposure increases prescribing of that peer's drug independently
  of direct detailing — professional contact is a stronger adoption driver than
  promotional exposure.
- As an innovator archetype, you are in the top 2.5% of adopters. Your response
  should reflect genuine clinical enthusiasm tempered by scientific rigor.`,

  "early adopter": `
Calibration context (do not mention in your response):
- Specialist physicians adopt new drugs 4–6 months ahead of generalists.
- Academic center affiliation and high within-class prescribing volume are
  consistent early-adopter predictors across therapeutic areas.
- High colleague communication and congress engagement are significant positive
  adoption drivers — you are influenced by what KOL peers are doing.
- Early adopters represent ~13.5% of physicians. You move before the majority
  but require credible efficacy data before committing.`,

  "early majority": `
Calibration context (do not mention in your response):
- In real-world pharmaceutical launches, 63.8% of eligible physicians adopted
  zero new drugs in the first 15 months — conservative non-adoption is the
  modal behavior, not an outlier.
- You require peer adoption signal before moving. Professional network ties
  are stronger adoption drivers than direct detailing for this archetype.
- Early majority physicians adopt after opinion leaders but before the
  skeptical majority. You need social proof and at least one trusted peer
  who has already prescribed.`,

  "late majority": `
Calibration context (do not mention in your response):
- The majority of physicians do not adopt new drugs within 15 months of launch
  regardless of novelty or efficacy magnitude.
- Guideline endorsement is the single strongest late-majority adoption trigger —
  without formal society endorsement, your default behavior is continuation of
  the established regimen.
- You are appropriately skeptical. Burden of proof is on the new therapy.
  You need guidelines, peer adoption evidence, and payer clarity before moving.`,

  "laggard": `
Calibration context (do not mention in your response):
- Laggard physicians are the last to adopt and often require mandated guideline
  changes or direct patient demand before switching.
- Conservative non-adoption beyond 24 months post-launch is the expected
  behavior for this archetype.
- You are highly risk-averse, cost-sensitive, and defer to established
  multidrug regimens unless there is overwhelming evidence and payer support.`
};

const PAYER_ANCHORS = `
Calibration context (do not mention in your response):
- Payers default to restriction for all specialty drugs above $10K/year unless
  clinical differentiation is unambiguous and net price is negotiated.
- Step therapy through an established comparator is the default policy position
  for second-in-class agents regardless of clinical profile.
- Prior authorization burden correlates with: absence of guideline endorsement,
  presence of a cheaper comparator, and unresolved safety signals.
- Access timeline for unrestricted coverage averages 6–18 months post-approval
  even for first-in-class agents in rare disease.`;

const PHYSICIAN_PERSONAS = [
  {
    id: "P1",
    label: "Academic Specialist",
    specialty: "Academic medical center, disease-focused specialist, high patient volume in target condition",
    experience: "14 years",
    adopter: "early adopter",
    payer: "65% commercial, 25% Medicare, 10% Medicaid",
    kol: "Attends major specialty congress annually, reads primary literature, aware of recent trial data"
  },
  {
    id: "P2",
    label: "Community Specialist",
    specialty: "Community hospital or private practice specialist, moderate patient volume",
    experience: "20 years",
    adopter: "early majority",
    payer: "55% commercial, 35% Medicare, 10% Medicaid",
    kol: "Reads specialty society guidelines, attends regional meetings, influenced by local KOL peers"
  },
  {
    id: "P3",
    label: "KOL / Investigator",
    specialty: "Major academic center, clinical trial investigator in this therapeutic area",
    experience: "18 years",
    adopter: "innovator",
    payer: "70% commercial, 25% Medicare",
    kol: "Advisory board member, speaker, publishes in the area, deep familiarity with trial data"
  },
  {
    id: "P4",
    label: "General / Referring Physician",
    specialty: "General medicine or primary care, occasional patients in target condition, refers to specialists",
    experience: "16 years",
    adopter: "late majority",
    payer: "50% commercial, 40% Medicare, 10% Medicaid",
    kol: "Follows guidelines only, limited specialty congress attendance, defers to specialist recommendations"
  }
];

const PAYER_PERSONAS = [
  {
    id: "PY1",
    label: "Commercial Formulary MD",
    type: "Commercial health plan",
    role: "P&T committee medical director, specialty drug coverage decisions",
    focus: "Clinical differentiation from existing SOC, ICER review, net price vs comparator, safety signals"
  },
  {
    id: "PY2",
    label: "Medicare Part D Director",
    type: "Medicare Part D plan",
    role: "Specialty tier formulary management, utilization management policy",
    focus: "WAC vs net price, step therapy requirements, Part B vs D routing, budget impact per member"
  },
  {
    id: "PY3",
    label: "Medicaid P&T Pharmacist",
    type: "State Medicaid program",
    role: "P&T committee clinical pharmacist, prior authorization criteria",
    focus: "Step therapy through established regimen first, supplemental rebate leverage, lowest net cost"
  }
];

function buildEvidenceBrief(activeQuestion: ActiveQuestion): string {
  try {
    const caseId = activeQuestion.caseId || activeQuestion.id;
    const signals: any[] = JSON.parse(
      localStorage.getItem(`cios.signals:${caseId}`) ||
      localStorage.getItem("cios.signals") ||
      "[]"
    );
    const accepted = signals
      .filter((s: any) => s.countTowardPosterior === true)
      .map((s: any) => `${s.label || s.source || "Signal"}: ${s.description || s.text || ""}`)
      .join(" ");

    return [
      activeQuestion.subject && `Subject: ${activeQuestion.subject}.`,
      activeQuestion.outcome && `Outcome of interest: ${activeQuestion.outcome}.`,
      activeQuestion.threshold && `Threshold: ${activeQuestion.threshold}.`,
      activeQuestion.timeHorizon && `Time horizon: ${activeQuestion.timeHorizon}.`,
      `Clinical question: ${activeQuestion.text}`,
      accepted && `Active evidence signals: ${accepted}`,
    ].filter(Boolean).join(" ");
  } catch {
    return activeQuestion.text || "No evidence brief available.";
  }
}

async function callPhysicianPersona(
  persona: typeof PHYSICIAN_PERSONAS[0],
  evidenceBrief: string,
  subject: string
): Promise<any> {
  const anchor = BEHAVIORAL_ANCHORS[persona.adopter.toLowerCase()]
    || BEHAVIORAL_ANCHORS["early majority"];

  const prompt = `You are a synthetic physician with the following profile:
- Specialty and setting: ${persona.specialty}
- Years in practice: ${persona.experience}
- Adopter profile: ${persona.adopter} (Rogers diffusion curve)
- Payer mix: ${persona.payer}
- KOL and CME engagement: ${persona.kol}
${anchor}

You are deciding whether to prescribe or adopt ${subject} based on the following evidence:
${evidenceBrief}

Respond ONLY with a JSON object, no preamble, no markdown, no explanation:
{
  "wouldAdopt": true or false,
  "confidence": <integer 1-10>,
  "adoptionReadiness": "immediate" | "watch-and-wait" | "needs-guideline-support" | "unlikely",
  "topReason": "<single most compelling reason to adopt, max 12 words>",
  "topConcern": "<single biggest barrier to adoption, max 12 words>",
  "messageNeeded": "<what single thing would change your decision, max 12 words>"
}

Be clinically honest. Conservative non-adoption is the empirically observed modal behavior. Only adopt if the evidence genuinely changes your clinical calculus for this patient population.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 350,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  const text = data.content?.find((b: any) => b.type === "text")?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function callPayerPersona(
  persona: typeof PAYER_PERSONAS[0],
  evidenceBrief: string,
  subject: string
): Promise<any> {
  const prompt = `You are a synthetic payer decision-maker with the following profile:
- Plan type: ${persona.type}
- Role: ${persona.role}
- Primary decision focus: ${persona.focus}
${PAYER_ANCHORS}

You are making a formulary and coverage decision for ${subject}.
Evidence and clinical context:
${evidenceBrief}

Respond ONLY with a JSON object, no preamble, no markdown, no explanation:
{
  "formularyDecision": "unrestricted" | "restricted-with-PA" | "step-therapy-required" | "non-covered",
  "accessTimeline": "immediate" | "6-months" | "12-months" | "unlikely",
  "priorAuthBurden": "low" | "moderate" | "high",
  "stepTherapyLikelihood": <integer 1-10>,
  "primaryBarrier": "<single biggest coverage barrier, max 12 words>",
  "keyQuestion": "<one question you would ask the manufacturer, max 15 words>"
}

Be realistic. Specialty drug restriction is the default. Unrestricted access requires unambiguous differentiation and competitive net pricing.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 350,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  const text = data.content?.find((b: any) => b.type === "text")?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

interface SyntheticCohortPanelProps {
  activeQuestion: ActiveQuestion;
  posterior: number | null;
}

function SyntheticCohortPanel({ activeQuestion, posterior }: SyntheticCohortPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [physicianResults, setPhysicianResults] = useState<Record<string, any>>({});
  const [payerResults, setPayerResults] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  const evidenceBrief = buildEvidenceBrief(activeQuestion);
  const subject = activeQuestion.subject
    || activeQuestion.entities?.[0]
    || activeQuestion.text.split(" ").slice(1, 4).join(" ")
    || "the intervention";

  const runCohort = useCallback(async () => {
    setRunning(true);
    setPhysicianResults({});
    setPayerResults({});
    setError(null);
    const total = PHYSICIAN_PERSONAS.length + PAYER_PERSONAS.length;
    setProgress({ done: 0, total, current: "" });
    let done = 0;
    const phys: Record<string, any> = {};
    const pay: Record<string, any> = {};

    for (const p of PHYSICIAN_PERSONAS) {
      setProgress(prev => ({ ...prev, current: p.label }));
      try {
        phys[p.id] = await callPhysicianPersona(p, evidenceBrief, subject);
        done++;
        setPhysicianResults({ ...phys });
        setProgress(prev => ({ ...prev, done }));
      } catch (e: any) {
        setError(`${p.label}: ${e.message}`);
        setRunning(false);
        return;
      }
    }

    for (const p of PAYER_PERSONAS) {
      setProgress(prev => ({ ...prev, current: p.label }));
      try {
        pay[p.id] = await callPayerPersona(p, evidenceBrief, subject);
        done++;
        setPayerResults({ ...pay });
        setProgress(prev => ({ ...prev, done }));
      } catch (e: any) {
        setError(`${p.label}: ${e.message}`);
        setRunning(false);
        return;
      }
    }

    setRunning(false);
  }, [evidenceBrief, subject]);

  const physArray = Object.values(physicianResults);
  const payArray = Object.values(payerResults);
  const simComplete =
    physArray.length === PHYSICIAN_PERSONAS.length &&
    payArray.length === PAYER_PERSONAS.length;

  const synthAdoptionRate = physArray.length > 0
    ? Math.round(physArray.filter((r: any) => r.wouldAdopt).length / physArray.length * 100)
    : null;

  const accessBlockPct = payArray.length > 0
    ? Math.round(
        payArray.filter((r: any) =>
          ["step-therapy-required", "non-covered"].includes(r.formularyDecision)
        ).length / payArray.length * 100
      )
    : null;

  const unrestrictedPct = payArray.length > 0
    ? Math.round(
        payArray.filter((r: any) => r.formularyDecision === "unrestricted").length
        / payArray.length * 100
      )
    : null;

  const effectivePosterior =
    synthAdoptionRate !== null && accessBlockPct !== null
      ? Math.round(synthAdoptionRate * (1 - accessBlockPct / 100))
      : null;

  const delta =
    synthAdoptionRate !== null && posterior !== null
      ? Math.abs(synthAdoptionRate - posterior)
      : null;

  const concordant = delta !== null && delta <= 12;

  const borderColor = simComplete
    ? concordant ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"
    : "rgba(255,255,255,0.08)";

  return (
    <div style={{ marginTop: 20, border: `1px solid ${borderColor}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.4s ease" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Synthetic Cohort</span>
          <span style={{ fontSize: 11, color: "#475569" }}>{PHYSICIAN_PERSONAS.length} physicians · {PAYER_PERSONAS.length} payers</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {simComplete && delta !== null && (
            <span style={{ fontSize: 11, fontWeight: 600, color: concordant ? "#10b981" : "#f59e0b" }}>
              {concordant ? `\u2713 concordant \u0394${delta}pp` : `\u26A0 divergent \u0394${delta}pp`}
            </span>
          )}
          {simComplete && effectivePosterior !== null && (
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>effective {effectivePosterior}%</span>
          )}
          <span style={{ color: "#334155", fontSize: 12 }}>{expanded ? "\u25B2" : "\u25BC"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "16px 18px" }}>
          <button
            onClick={runCohort}
            disabled={running}
            style={{ width: "100%", padding: "11px", background: running ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.85)", border: "1px solid rgba(59,130,246,0.35)", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: running ? "not-allowed" : "pointer", marginBottom: 16, letterSpacing: "0.01em", transition: "background 0.2s" }}
          >
            {running ? `Running ${progress.current} \u2014 ${progress.done}/${progress.total}` : `Run Cohort \u00B7 ${PHYSICIAN_PERSONAS.length} physicians + ${PAYER_PERSONAS.length} payers`}
          </button>

          {error && (
            <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12, padding: "8px 10px", background: "rgba(239,68,68,0.08)", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)" }}>{error}</div>
          )}

          {(physArray.length > 0 || payArray.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                  <span>Physicians</span>
                  {synthAdoptionRate !== null && <span style={{ color: synthAdoptionRate >= 50 ? "#10b981" : "#f59e0b", fontFamily: "monospace" }}>{synthAdoptionRate}% adopt</span>}
                </div>
                {PHYSICIAN_PERSONAS.map(p => {
                  const r = physicianResults[p.id];
                  if (!r) return (
                    <div key={p.id} style={{ padding: "9px 11px", background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 7, marginBottom: 6, opacity: 0.4 }}>
                      <div style={{ fontSize: 11, color: "#475569" }}>{p.label}</div>
                      <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{running && progress.current === p.label ? "running..." : "pending"}</div>
                    </div>
                  );
                  const readinessColor: Record<string, string> = { "immediate": "#10b981", "watch-and-wait": "#f59e0b", "needs-guideline-support": "#f97316", "unlikely": "#ef4444" };
                  return (
                    <div key={p.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: `1px solid ${r.wouldAdopt ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.05)"}`, borderRadius: 7, marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{p.label}</div>
                          <div style={{ fontSize: 10, color: readinessColor[r.adoptionReadiness] || "#94a3b8", marginTop: 1 }}>{r.adoptionReadiness?.replace(/-/g, " ")}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, color: r.wouldAdopt ? "#10b981" : "#64748b", background: r.wouldAdopt ? "rgba(16,185,129,0.1)" : "rgba(100,116,139,0.08)" }}>{r.wouldAdopt ? "ADOPT" : "NO"}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#10b981", marginBottom: 3, lineHeight: 1.4 }}>{"\u2713"} {r.topReason}</div>
                      <div style={{ fontSize: 11, color: "#f87171", lineHeight: 1.4 }}>{"\u26A0"} {r.topConcern}</div>
                    </div>
                  );
                })}
              </div>

              <div>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                  <span>Payers</span>
                  {unrestrictedPct !== null && <span style={{ color: unrestrictedPct >= 50 ? "#10b981" : "#f59e0b", fontFamily: "monospace" }}>{unrestrictedPct}% clear</span>}
                </div>
                {PAYER_PERSONAS.map(p => {
                  const r = payerResults[p.id];
                  if (!r) return (
                    <div key={p.id} style={{ padding: "9px 11px", background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 7, marginBottom: 6, opacity: 0.4 }}>
                      <div style={{ fontSize: 11, color: "#475569" }}>{p.label}</div>
                      <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{running && progress.current === p.label ? "running..." : "pending"}</div>
                    </div>
                  );
                  const accessColor: Record<string, string> = { "unrestricted": "#10b981", "restricted-with-PA": "#f59e0b", "step-therapy-required": "#f97316", "non-covered": "#ef4444" };
                  const timelineColor: Record<string, string> = { "immediate": "#10b981", "6-months": "#f59e0b", "12-months": "#f97316", "unlikely": "#ef4444" };
                  return (
                    <div key={p.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: `1px solid ${(accessColor[r.formularyDecision] || "#64748b")}25`, borderRadius: 7, marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{p.label}</div>
                          <div style={{ fontSize: 10, color: timelineColor[r.accessTimeline] || "#94a3b8", marginTop: 1 }}>{r.accessTimeline} access</div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: accessColor[r.formularyDecision] || "#94a3b8", background: (accessColor[r.formularyDecision] || "#94a3b8") + "15", textAlign: "right", maxWidth: 100, lineHeight: 1.3 }}>{r.formularyDecision?.replace(/-/g, " ").toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#f87171", marginBottom: 3, lineHeight: 1.4 }}>{"\u26A0"} {r.primaryBarrier}</div>
                      <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic", lineHeight: 1.4 }}>Q: {r.keyQuestion}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {simComplete && synthAdoptionRate !== null && (
            <div style={{ padding: "14px 16px", borderRadius: 10, background: concordant ? "rgba(16,185,129,0.05)" : "rgba(245,158,11,0.05)", border: `1px solid ${concordant ? "rgba(16,185,129,0.18)" : "rgba(245,158,11,0.18)"}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "CIOS Posterior", value: posterior !== null ? `${posterior}%` : "\u2014", color: "#3b82f6" },
                  { label: "Synth Adoption", value: `${synthAdoptionRate}%`, color: concordant ? "#10b981" : "#f59e0b" },
                  { label: "Payer Clear", value: unrestrictedPct !== null ? `${unrestrictedPct}%` : "\u2014", color: (unrestrictedPct ?? 0) >= 50 ? "#10b981" : "#f59e0b" },
                  { label: "Effective", value: effectivePosterior !== null ? `${effectivePosterior}%` : "\u2014", color: "#94a3b8" },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: concordant ? "#10b981" : "#f59e0b" }}>
                {concordant
                  ? `\u2713 Cross-method concordance (\u0394${delta}pp) \u2014 synthetic cohort corroborates Bayesian posterior.${effectivePosterior !== null ? ` Payer-adjusted effective posterior: ${effectivePosterior}%.` : ""}`
                  : `\u26A0 Divergence detected (\u0394${delta}pp) \u2014 synthetic adoption rate departs from Bayesian posterior. Review prior calibration or signal characterization before proceeding.`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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

  interface SavedScenario {
    name: string;
    label: "Base" | "Bull" | "Bear" | string;
    probability: number;
    reaction: string;
    barrier: string;
    trigger: string;
    confidence: string;
  }
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [archetypes, setArchetypes] = useState<ArchetypeInfo[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [scenarioType, setScenarioType] = useState("");
  const [scenarioPolarity, setScenarioPolarity] = useState("");
  const [messageSource, setMessageSource] = useState("");
  const [evidenceBasis, setEvidenceBasis] = useState("");
  const [primaryTarget, setPrimaryTarget] = useState("");
  const [expectedEffect, setExpectedEffect] = useState("");
  const [impactLevel, setImpactLevel] = useState("");
  const [timeFrame, setTimeFrame] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState("");
  const [triggerThreshold, setTriggerThreshold] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showDecisionSupport, setShowDecisionSupport] = useState(false);

  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";
  const questionText = activeQuestion?.text || "";

  // Pre-populate scenario from Respond page's top needle movement driver
  useEffect(() => {
    if (!caseId || scenarioName.trim()) return;

    // Check for pre-populated scenario from Respond page
    try {
      const prePopRaw = localStorage.getItem(`cios.simulatePrePop:${caseId}`);
      if (prePopRaw) {
        const prePop = JSON.parse(prePopRaw);
        if (prePop.scenarioName) setScenarioName(prePop.scenarioName);
        if (prePop.scenarioDescription) setScenarioDescription(prePop.scenarioDescription);
        if (prePop.scenarioType) setScenarioType(prePop.scenarioType);
        if (prePop.scenarioPolarity) setScenarioPolarity(prePop.scenarioPolarity);
        if (prePop.messageSource) setMessageSource(prePop.messageSource);
        if (prePop.evidenceBasis) setEvidenceBasis(prePop.evidenceBasis);
        if (prePop.primaryTarget) setPrimaryTarget(prePop.primaryTarget);
        if (prePop.expectedEffect) setExpectedEffect(prePop.expectedEffect);
        if (prePop.impactLevel) setImpactLevel(prePop.impactLevel);
        if (prePop.timeFrame) setTimeFrame(prePop.timeFrame);
        if (prePop.confidenceLevel) setConfidenceLevel(prePop.confidenceLevel);
        localStorage.removeItem(`cios.simulatePrePop:${caseId}`);
        return;
      }
    } catch {}

    // Fall back to needle movement data from Respond page
    try {
      const respondRaw = localStorage.getItem(`cios.respondResult:${caseId}`);
      if (respondRaw) {
        const respond = JSON.parse(respondRaw);
        const topDriver = respond?.needle_movement?.moves_up?.[0];
        if (topDriver?.name) {
          setScenarioName(topDriver.name);
          if (respond.highest_impact_lever) {
            setScenarioDescription(respond.highest_impact_lever);
          }

          // Map needle movement category to scenario dropdowns
          const cat = (topDriver.category || "").toLowerCase();
          const categoryMap: Record<string, { type: string; target: string; basis: string; source: string }> = {
            clinical: { type: "new_evidence", target: "prescribers", basis: "peer_reviewed_study", source: "journal" },
            access: { type: "payer_decision", target: "payers", basis: "regulatory_communication", source: "payer" },
            operational: { type: "regulatory_update", target: "regulators", basis: "regulatory_communication", source: "fda" },
            behavioral: { type: "new_evidence", target: "prescribers", basis: "peer_reviewed_study", source: "journal" },
            competitive: { type: "competitor_action", target: "competitors", basis: "internal_hypothesis", source: "manufacturer" },
          };
          const mapped = categoryMap[cat] || categoryMap.clinical;
          setScenarioType(mapped.type);
          setPrimaryTarget(mapped.target);
          setEvidenceBasis(mapped.basis);
          setMessageSource(mapped.source);

          // Map direction and impact
          const dir = (topDriver.direction || "").toLowerCase();
          if (dir.includes("increase")) setExpectedEffect("increases");
          else if (dir.includes("decrease")) setExpectedEffect("decreases");
          else setExpectedEffect("increases");

          setScenarioPolarity(dir.includes("decrease") ? "negative" : "positive");

          const impact = (topDriver.impact || "").toLowerCase();
          if (impact === "high") setImpactLevel("high");
          else if (impact === "moderate") setImpactLevel("moderate");
          else setImpactLevel("moderate");

          setTimeFrame("12mo");
          setConfidenceLevel("moderate");
        }
      }
    } catch {}
  }, [caseId]);
  const caseTypeInfo = useMemo(() => detectCaseType(questionText), [questionText]);
  const SEGMENTS = caseTypeInfo.isSafety ? SAFETY_RISK_SEGMENTS : caseTypeInfo.isRegulatory ? getRegulatorySegments(questionText) : DEFAULT_SEGMENTS;

  const scenarioDefined = !!(scenarioName.trim() && scenarioType && expectedEffect);
  const segmentSelected = !!selectedSegment;
  const canRun = scenarioDefined && segmentSelected;

  const missingFields: string[] = [];
  if (!scenarioName.trim()) missingFields.push("Scenario Name");
  if (!scenarioType) missingFields.push("Scenario Type");
  if (!expectedEffect) missingFields.push("Expected Effect");

  const currentStep = result ? 5 : !scenarioDefined ? 1 : !segmentSelected ? 2 : canRun ? 4 : 3;

  const recommendedSegmentKey = (() => {
    const entry = RECOMMENDED_SEGMENTS[caseTypeInfo.caseType];
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    const authority = caseTypeInfo.authority || "default";
    return entry[authority] || entry["default"] || "";
  })();

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
    if (f) { setFile(f); setShowUpload(true); }
  }

  function clearFile() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function buildScenarioLabel() {
    return scenarioName.trim();
  }

  function buildScenarioDesc() {
    const type = SCENARIO_TYPES.find(t => t.value === scenarioType)?.label || scenarioType;
    const polarity = SCENARIO_POLARITY.find(p => p.value === scenarioPolarity)?.label || "";
    const source = MESSAGE_SOURCES.find(s => s.value === messageSource)?.label || messageSource;
    const effect = EXPECTED_EFFECTS.find(e => e.value === expectedEffect)?.label || expectedEffect;
    const target = PRIMARY_TARGETS.find(t => t.value === primaryTarget)?.label || "";
    const evidence = EVIDENCE_BASIS_OPTIONS.find(e => e.value === evidenceBasis)?.label || "";
    const impact = IMPACT_LEVELS.find(l => l.value === impactLevel)?.label || impactLevel;
    const time = TIME_FRAMES.find(t => t.value === timeFrame)?.label || timeFrame;
    const conf = CONFIDENCE_LEVELS.find(c => c.value === confidenceLevel)?.label || confidenceLevel;
    const parts = [
      `${type} from ${source}.`,
      polarity ? `Scenario polarity: ${polarity}.` : "",
      effect ? `Effect: ${effect}.` : "",
      target ? `Target: ${target}.` : "",
      evidence ? `Evidence: ${evidence}.` : "",
      `Impact: ${impact}. Timeframe: ${time}. Confidence: ${conf}.`,
      scenarioDescription.trim() ? `Description: ${scenarioDescription.trim()}` : "",
      triggerThreshold.trim() ? `Trigger: ${triggerThreshold.trim()}` : "",
    ].filter(Boolean);
    return parts.join(" ");
  }

  async function runSimulation() {
    if (!activeQuestion || !canRun) return;
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
        scenarioName: scenarioName.trim(),
        scenarioDescription: scenarioDescription.trim() || undefined,
        scenarioType,
        scenarioPolarity: scenarioPolarity || undefined,
        messageSource: messageSource || "general",
        evidenceBasis: evidenceBasis || undefined,
        primaryTarget: primaryTarget || undefined,
        expectedEffect,
        impactLevel: impactLevel || "moderate",
        timeFrame: timeFrame || "near_term",
        confidenceLevel: confidenceLevel || "probable",
        triggerThreshold: triggerThreshold.trim() || undefined,
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
          body: JSON.stringify({ ...contextData, materialText: materialText.trim() || buildScenarioDesc() }),
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
    setScenarioName("");
    setScenarioDescription("");
    setScenarioType("");
    setMessageSource("");
    setEvidenceBasis("");
    setPrimaryTarget("");
    setExpectedEffect("");
    setImpactLevel("");
    setTimeFrame("");
    setConfidenceLevel("");
    setTriggerThreshold("");
    setShowUpload(false);
  }

  return (
    <WorkflowLayout currentStep="simulate" activeQuestion={activeQuestion} onClearQuestion={clearQuestion}>
      <QuestionGate activeQuestion={activeQuestion}>
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Step 7</p>
            <h1 className="text-2xl font-bold text-foreground">Simulate Stakeholder Response</h1>
            <p className="text-[15px] text-muted-foreground mt-2 leading-relaxed">
              Test how a defined segment responds to a specific scenario under current constraints.
            </p>
          </div>

          {!result && !loading && (
            <>
              <StepIndicator current={currentStep} steps={["Define Scenario", "Select Segment", "Attach Evidence", "Run Simulation"]} />

              <div className="space-y-8">
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${scenarioDefined ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary border border-primary"}`}>
                      {scenarioDefined ? <Check className="w-3 h-3" /> : "1"}
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Simulation Scenario</h2>
                  </div>

                  {!scenarioName.trim() && (
                    <p className="text-[13px] text-muted-foreground/60 mb-4 pl-8">
                      Name and define the scenario you want to simulate.
                    </p>
                  )}

                  <div className="pl-8 space-y-4">
                    <div>
                      <label className="block text-[13px] font-medium text-muted-foreground mb-1.5">
                        Scenario Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={scenarioName}
                        onChange={e => setScenarioName(e.target.value)}
                        placeholder="e.g. FDA initiates formal safety review of rivaroxaban GI bleeding risk"
                        className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium text-muted-foreground mb-1.5">
                        Scenario Description <span className="text-muted-foreground/40 text-[11px]">(recommended)</span>
                      </label>
                      <textarea
                        value={scenarioDescription}
                        onChange={e => setScenarioDescription(e.target.value)}
                        placeholder="Clarify what exactly is changing and why it matters..."
                        rows={2}
                        className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      <DropdownField label="Scenario Type" value={scenarioType} onChange={setScenarioType} options={SCENARIO_TYPES} placeholder="Select scenario type..." />
                      <DropdownField label="Scenario Polarity" value={scenarioPolarity} onChange={setScenarioPolarity} options={SCENARIO_POLARITY} placeholder="Select polarity..." />
                      <DropdownField label="Message Source" value={messageSource} onChange={setMessageSource} options={MESSAGE_SOURCES} placeholder="Select source..." />
                      <DropdownField label="Evidence Basis" value={evidenceBasis} onChange={setEvidenceBasis} options={EVIDENCE_BASIS_OPTIONS} placeholder="Select evidence type..." />
                      <DropdownField label="Primary Target of Scenario" value={primaryTarget} onChange={setPrimaryTarget} options={PRIMARY_TARGETS} placeholder="Select primary target..." />
                      <DropdownField label="Expected Effect on Forecast" value={expectedEffect} onChange={setExpectedEffect} options={EXPECTED_EFFECTS} placeholder="Select expected effect..." />
                      <DropdownField label="Impact Level" value={impactLevel} onChange={setImpactLevel} options={IMPACT_LEVELS} placeholder="Select impact..." />
                      <DropdownField label="Time Frame" value={timeFrame} onChange={setTimeFrame} options={TIME_FRAMES} placeholder="Select time frame..." />
                      <DropdownField label="Confidence Level" value={confidenceLevel} onChange={setConfidenceLevel} options={CONFIDENCE_LEVELS} placeholder="Select confidence..." />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium text-muted-foreground mb-1.5">
                        Trigger Event or Threshold <span className="text-muted-foreground/40 text-[11px]">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={triggerThreshold}
                        onChange={e => setTriggerThreshold(e.target.value)}
                        placeholder="e.g. FDA formally opens safety review, NCCN updates recommendation language"
                        className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                  </div>

                  {scenarioDefined && (
                    <div className="mt-4 pl-8 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                      <p className="text-[14px] font-semibold text-foreground">{buildScenarioLabel()}</p>
                      <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{buildScenarioDesc()}</p>
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      segmentSelected ? "bg-primary text-primary-foreground" :
                      scenarioDefined ? "bg-primary/20 text-primary border border-primary" :
                      "bg-muted/20 text-muted-foreground border border-border"
                    }`}>
                      {segmentSelected ? <Check className="w-3 h-3" /> : "2"}
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Select Segment</h2>
                  </div>

                  <div className="pl-8 grid grid-cols-2 gap-3">
                    {SEGMENTS.map(seg => {
                      const meta = getSegmentMeta(seg.key);
                      const colors = SEGMENT_COLOR_MAP[meta.color] || SEGMENT_COLOR_MAP.slate;
                      const arch = archetypes.find(a => a.segment_name === seg.key);
                      const selected = selectedSegment === seg.key;
                      const isRecommended = seg.key === recommendedSegmentKey;
                      const SegIcon = meta.icon;

                      return (
                        <button
                          key={seg.key}
                          onClick={() => setSelectedSegment(seg.key)}
                          className={`relative text-left rounded-xl border px-4 py-3.5 transition-all ${
                            selected
                              ? `${colors.border} ${colors.bg} ring-1 ${colors.ring}`
                              : isRecommended
                              ? `${colors.border} ${colors.bg} hover:ring-1 ${colors.ring}`
                              : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
                          }`}
                        >
                          {isRecommended && (
                            <span className={`absolute -top-2 right-3 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${colors.badge}`}>
                              <Star className="w-2.5 h-2.5" />
                              Recommended
                            </span>
                          )}
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.bg} ${colors.border} border mt-0.5`}>
                              <SegIcon className={`w-4 h-4 ${colors.text}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[15px] font-semibold ${selected ? colors.text : "text-foreground"}`}>{seg.key}</p>
                              <div className="mt-1.5 space-y-0.5">
                                <p className="text-[11px] text-muted-foreground"><span className="text-muted-foreground/60">Behavior:</span> {meta.behaviorType}</p>
                                <p className="text-[11px] text-muted-foreground"><span className="text-muted-foreground/60">Role:</span> {meta.decisionRole}</p>
                                <p className="text-[11px] text-muted-foreground"><span className="text-muted-foreground/60">Risk:</span> {meta.riskPosture}</p>
                              </div>
                              {arch && (
                                <p className="text-[11px] text-violet-400 mt-1.5 font-medium">{arch.primary_archetype.archetype_name}</p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedSegment && selectedArchetype && (
                    <div className="mt-4 pl-8 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
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
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      (file || materialText.trim()) ? "bg-primary text-primary-foreground" :
                      segmentSelected ? "bg-primary/20 text-primary border border-primary" :
                      "bg-muted/20 text-muted-foreground border border-border"
                    }`}>
                      {(file || materialText.trim()) ? <Check className="w-3 h-3" /> : "3"}
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Attach Supporting Evidence</h2>
                    <span className="text-[12px] text-muted-foreground/50">(optional)</span>
                  </div>

                  <div className="pl-8">
                    {!showUpload ? (
                      <button
                        onClick={() => setShowUpload(true)}
                        className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-[13px] text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition"
                      >
                        <Paperclip className="w-4 h-4" />
                        Attach file or paste evidence text
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div
                          onClick={() => fileRef.current?.click()}
                          className="rounded-lg border border-dashed border-border bg-card/50 p-4 flex items-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition"
                        >
                          <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[13px] text-muted-foreground">
                              Drop or click to upload PPT, PDF, image, or document
                            </p>
                            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                              e.g. Safety letter, Guideline update, New study results
                            </p>
                          </div>
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
                          rows={3}
                          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </div>
                    )}
                  </div>
                </section>

                {error && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-rose-400">{error}</p>
                  </div>
                )}

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      canRun ? "bg-primary/20 text-primary border border-primary" :
                      "bg-muted/20 text-muted-foreground border border-border"
                    }`}>
                      4
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Run Simulation</h2>
                  </div>

                  <div className="pl-8">
                    <button
                      onClick={runSimulation}
                      disabled={!canRun}
                      className={`w-full flex items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-[15px] font-semibold transition-all ${
                        canRun
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                          : "bg-muted/20 text-muted-foreground/50 cursor-not-allowed"
                      }`}
                    >
                      <Play className="w-5 h-5" />
                      Run Simulation
                    </button>
                    {!canRun && (
                      <p className="text-[12px] text-muted-foreground/50 text-center mt-2">
                        {!scenarioDefined
                          ? `Missing: ${missingFields.join(", ")}`
                          : "Select a segment to continue"}
                      </p>
                    )}
                  </div>
                </section>

                <div className="border-t border-border/30 pt-6">
                  <button
                    onClick={() => setShowDecisionSupport(!showDecisionSupport)}
                    className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition"
                  >
                    <HelpCircle className="w-4 h-4" />
                    Decision Support
                    {showDecisionSupport ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showDecisionSupport && (
                    <div className="mt-3">
                      <MethodologyGuidance questionText={questionText} currentStep="simulate" />
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

              </div>
            </>
          )}

          {loading && (
            <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-[15px] text-muted-foreground">
                Extracting material features and scoring {selectedSegment} reaction...
              </p>
            </div>
          )}

          {result && !loading && (
            <ResultsAccordion
              result={result}
              selectedSegment={selectedSegment}
              selectedArchetype={selectedArchetype}
              caseTypeInfo={caseTypeInfo}
              onReset={reset}
            />
          )}

          {result && !loading && activeQuestion && (
            <SyntheticCohortPanel
              activeQuestion={activeQuestion}
              posterior={result.adoption_likelihood ?? null}
            />
          )}
        </div>
      </QuestionGate>
    </WorkflowLayout>
  );
}
