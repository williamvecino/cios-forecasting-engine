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
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidenceColor(result.confidence)}`}>
            {result.confidence} Confidence
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Primary Reaction</p>
          <p className="text-[15px] text-foreground leading-relaxed">{applyVocab(result.primary_reaction)}</p>
        </div>
      </div>

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

export default function SimulatePage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [materialText, setMaterialText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        </div>
      </QuestionGate>
    </WorkflowLayout>
  );
}
