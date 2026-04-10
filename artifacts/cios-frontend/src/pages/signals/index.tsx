import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  recalculateGatesFromSignals,
  type RecalculationResult,
  type SignalDiagnostic,
  type GateImpact,
} from "@/lib/signal-gate-engine";
import {
  Plus,
  Sparkles,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FlaskConical,
  Shield,
  Swords,
  BookOpen,
  Clock,
  Users,
  Pencil,
  Trash2,
  Zap,
  Radio,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  Activity,
  Briefcase,
  Stethoscope,
  ExternalLink,
  Globe,
  AlertTriangle,
  Lock,
  Unlock,
  Upload,
  Info,
  Search,
  FileSpreadsheet,
  Ruler,
  Target,
  TrendingDown,
  BarChart3,
  Loader2,
  Layers,
} from "lucide-react";
import DataImportDialog from "@/components/signals/DataImportDialog";
import { SignalProvenanceDrawer, buildProvenance } from "@/components/signals/SignalProvenanceDrawer";
import type { ImportedRow } from "@/lib/data-import";
import type { WorkbookMeta } from "@/lib/workbook/normalizeCiosSignals";
import SignalDependencyPanel, { type SignalLineageInfo } from "@/components/signals/SignalDependencyPanel";
import SignalMapPanel from "@/components/signals/SignalMapPanel";
import DriverCoveragePanel from "@/components/signals/DriverCoveragePanel";
import SavedQuestionsPanel from "@/components/question/SavedQuestionsPanel";


const GENERIC_SIGNAL_PHRASES = [
  "launch trajectory tracking above historical comparators",
  "patient awareness campaigns driving demand",
  "favorable guideline positioning supporting rapid",
  "market access barriers may cap penetration below target threshold",
  "tracking above historical",
  "driving demand-side pull",
  "supporting rapid initial uptake",
  "cap penetration below target",
  "creating competitive pressure",
  "early adoption momentum",
  "favorable positioning supporting",
  "awareness campaigns driving",
];

function isGenericTemplateSignal(text: string): boolean {
  const lower = (text || "").toLowerCase().trim();
  return GENERIC_SIGNAL_PHRASES.some(phrase => lower.includes(phrase));
}

const ADOPTION_MECHANISM_FAMILIES = [
  { id: "clinical_evidence_strength", label: "Clinical Evidence Strength", keywords: ["trial", "efficacy", "endpoint", "phase", "pivotal", "data", "evidence", "clinical", "study", "outcome"] },
  { id: "guideline_soc_movement", label: "Guideline / Standard-of-Care Movement", keywords: ["guideline", "recommendation", "standard of care", "consensus", "nccn", "asco", "idsa", "ats", "endorsement", "positioning"] },
  { id: "access_reimbursement", label: "Access / Reimbursement", keywords: ["payer", "formulary", "prior auth", "step therapy", "coverage", "reimbursement", "copay", "access", "restriction", "tier"] },
  { id: "prescriber_behavior", label: "Prescriber Behavior", keywords: ["prescrib", "physician", "clinician", "adoption", "intent", "familiarity", "comfort", "experience", "uptake", "switching"] },
  { id: "operational_delivery_friction", label: "Operational / Delivery Friction", keywords: ["administration", "infusion", "nebuliz", "inhal", "injection", "workflow", "training", "burden", "logistic", "compliance"] },
  { id: "competitive_soc_pressure", label: "Competitive / Standard-of-Care Pressure", keywords: ["competitor", "competing", "entrenched", "incumbent", "alternative", "standard of care", "sequencing", "inertia", "displacement"] },
  { id: "launch_market_signals", label: "Launch / Market Signals", keywords: ["launch", "kol", "awareness", "education", "field force", "medical affairs", "advocacy", "market shaping", "readiness"] },
] as const;

function recomputeAdoptionCoverage(signals: { text: string; accepted: boolean; direction?: string; strength?: string; impact?: string; countTowardPosterior?: boolean }[]) {
  const validated = signals.filter((s) => (s.accepted || (s as any).source === "system") && s.countTowardPosterior === true);
  const candidates = signals.filter((s) => (s.accepted || (s as any).source === "system") && s.countTowardPosterior !== true);

  const mechanism_coverage = ADOPTION_MECHANISM_FAMILIES.map((fam) => {
    const matchValidated = validated.filter((s) => {
      const text = (s.text || "").toLowerCase();
      return fam.keywords.some((kw) => text.includes(kw));
    });
    const matchCandidates = candidates.filter((s) => {
      const text = (s.text || "").toLowerCase();
      return fam.keywords.some((kw) => text.includes(kw));
    });
    return {
      family_id: fam.id,
      family_label: fam.label,
      covered: matchValidated.length > 0,
      has_candidates: matchCandidates.length > 0,
      signal_count: matchValidated.length,
    };
  });

  const covered_count = mechanism_coverage.filter((c) => c.covered).length;
  const missing_families = mechanism_coverage.filter((c) => !c.covered).map((c) => c.family_label);

  const supportive = validated.filter((s) =>
    s.direction === "increases_probability" || s.direction === "positive"
  );
  const constraining = validated.filter((s) =>
    s.direction === "decreases_probability" || s.direction === "negative"
  );
  const highSupportive = supportive.filter((s) => s.strength === "High" || s.impact === "High");
  const highConstraining = constraining.filter((s) => s.strength === "High" || s.impact === "High");

  const dominant_supportive_driver = highSupportive.length > 0
    ? highSupportive[0].text
    : supportive.length > 0 ? supportive[0].text : null;

  const dominant_constraining_driver = highConstraining.length > 0
    ? highConstraining[0].text
    : constraining.length > 0 ? constraining[0].text : null;

  const is_under_specified = validated.length < 6 || covered_count < 4;

  let sufficiency_warning: string | null = null;
  if (validated.length < 6) {
    sufficiency_warning = `Signal set may be incomplete — ${validated.length} validated signals, but adoption cases typically require 6–8 materially distinct signals across major driver families. Additional driver families should be explored.`;
  } else if (validated.length < 8 && missing_families.length >= 3) {
    sufficiency_warning = `Signal coverage is thin — ${missing_families.length} mechanism families have no signals. Consider exploring: ${missing_families.join(", ")}.`;
  }

  const parts: string[] = [];
  if (dominant_supportive_driver) {
    const trunc = dominant_supportive_driver.length > 120 ? dominant_supportive_driver.slice(0, 117) + "..." : dominant_supportive_driver;
    parts.push(`Dominant supportive driver: ${trunc}`);
  }
  if (dominant_constraining_driver) {
    const trunc = dominant_constraining_driver.length > 120 ? dominant_constraining_driver.slice(0, 117) + "..." : dominant_constraining_driver;
    parts.push(`Dominant constraining driver: ${trunc}`);
  }
  if (missing_families.length > 0) {
    parts.push(`Missing mechanism families: ${missing_families.join(", ")}`);
  }
  if (is_under_specified) {
    parts.push("Case may be under-specified — additional signals needed for a robust forecast.");
  }

  return {
    mechanism_coverage,
    covered_count,
    total_families: ADOPTION_MECHANISM_FAMILIES.length,
    missing_families,
    dominant_supportive_driver,
    dominant_constraining_driver,
    is_under_specified,
    sufficiency_warning,
    summary: parts.join(" | "),
  };
}

function stripNonMatchingBrandSignals(signals: any[], currentSubject?: string): any[] {
  if (!signals || signals.length === 0) return signals;
  return signals.filter((s: any) => {
    if (isGenericTemplateSignal(s.text)) return false;
    return true;
  });
}

type Direction = "positive" | "negative" | "neutral" | "increases_probability" | "decreases_probability" | "signals_uncertainty" | "signals_risk_escalation" | "operational_readiness" | "market_response";

type SignalDomain = "clinical_evidence" | "safety_pharmacovigilance" | "regulatory_activity" | "guideline_activity" | "market_access" | "operational_readiness" | "competitive_dynamics" | "legal_litigation";

const SIGNAL_DOMAIN_LABELS: Record<SignalDomain, string> = {
  clinical_evidence: "Clinical Evidence",
  safety_pharmacovigilance: "Safety / PV",
  regulatory_activity: "Regulatory",
  guideline_activity: "Guideline",
  market_access: "Market Access",
  operational_readiness: "Operational",
  competitive_dynamics: "Competitive",
  legal_litigation: "Legal",
};

const SIGNAL_DOMAIN_COLORS: Record<SignalDomain, string> = {
  clinical_evidence: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  safety_pharmacovigilance: "text-rose-400 bg-rose-400/10 border-rose-400/30",
  regulatory_activity: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  guideline_activity: "text-violet-400 bg-violet-400/10 border-violet-400/30",
  market_access: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  operational_readiness: "text-slate-400 bg-slate-400/10 border-slate-400/30",
  competitive_dynamics: "text-red-400 bg-red-400/10 border-red-400/30",
  legal_litigation: "text-orange-400 bg-orange-400/10 border-orange-400/30",
};
type Strength = "High" | "Medium" | "Low";
type Reliability = "Confirmed" | "Probable" | "Speculative";
type Impact = "High" | "Medium" | "Low";
type Category = "evidence" | "access" | "competition" | "guideline" | "timing" | "adoption";

type SignalClass = "observed" | "derived" | "uncertainty";
type SignalFamily = "brand_clinical_regulatory" | "payer_access" | "competitor" | "patient_demand" | "provider_behavioral" | "system_operational";

const ALL_SIGNAL_FAMILIES: SignalFamily[] = [
  "brand_clinical_regulatory",
  "payer_access",
  "competitor",
  "patient_demand",
  "provider_behavioral",
  "system_operational",
];

const SIGNAL_FAMILY_LABELS: Record<SignalFamily, string> = {
  brand_clinical_regulatory: "Brand / Clinical / Regulatory",
  payer_access: "Payer / Access",
  competitor: "Competitor",
  patient_demand: "Patient / Demand",
  provider_behavioral: "Provider / Behavioral",
  system_operational: "System / Operational",
};

type TranslationConfidence = "high" | "moderate" | "low";
type GateStatus = "strong" | "moderate" | "weak" | "unresolved";

interface EventGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: GateStatus;
  reasoning: string;
  constrains_probability_to: number;
}

interface EventDecomposition {
  event_gates: EventGate[];
  brand_outlook_probability: number;
  constrained_probability: number;
  constraint_explanation: string;
}
type LineOfTherapyApplicability = "current_label" | "future_label" | "uncertain";
type TimeHorizonApplicability = "yes" | "partial" | "unlikely";

type PrioritySource = "manual_confirmed" | "observed_verified" | "ai_derived" | "ai_uncertainty";

const PRIORITY_RANK: Record<PrioritySource, number> = {
  manual_confirmed: 4,
  observed_verified: 3,
  ai_derived: 2,
  ai_uncertainty: 1,
};

type SignalSource = "internal" | "external" | "missing";

type DriverRole = "primary_driver" | "supporting_driver" | "counterforce" | "context_signal" | "noise";

const DRIVER_ROLE_LABELS: Record<DriverRole, string> = {
  primary_driver: "Primary Driver",
  supporting_driver: "Supporting Driver",
  counterforce: "Counterforce",
  context_signal: "Context Signal",
  noise: "Noise",
};

const DRIVER_ROLE_COLORS: Record<DriverRole, string> = {
  primary_driver: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  supporting_driver: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  counterforce: "text-red-400 bg-red-500/10 border-red-500/20",
  context_signal: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  noise: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20",
};

type MechanismGroup = "economic_pressure" | "structural_protection" | "competitive_threat" | "execution_change";

const MECHANISM_LABELS: Record<MechanismGroup, string> = {
  economic_pressure: "Economic Pressure",
  structural_protection: "Structural Protection",
  competitive_threat: "Competitive Threat",
  execution_change: "Execution Change",
};

const MECHANISM_COLORS: Record<MechanismGroup, { border: string; bg: string; text: string; icon: string }> = {
  economic_pressure: { border: "border-amber-500/20", bg: "bg-amber-500/5", text: "text-amber-400", icon: "text-amber-400" },
  structural_protection: { border: "border-blue-500/20", bg: "bg-blue-500/5", text: "text-blue-400", icon: "text-blue-400" },
  competitive_threat: { border: "border-red-500/20", bg: "bg-red-500/5", text: "text-red-400", icon: "text-red-400" },
  execution_change: { border: "border-emerald-500/20", bg: "bg-emerald-500/5", text: "text-emerald-400", icon: "text-emerald-400" },
};

const DRIVER_COVERAGE_CATEGORIES: Record<string, { label: string; keywords: string[] }> = {
  economic: { label: "Economic driver", keywords: ["price", "cost", "revenue", "margin", "reimbursement", "formulary", "copay", "economic", "financial", "budget", "payer", "payment", "rebate", "discount", "spend"] },
  structural: { label: "Structural defense", keywords: ["patent", "exclusivity", "regulatory", "fda", "ema", "approval", "label", "indication", "guideline", "formulary position", "lock", "barrier", "protection", "ip", "litigation"] },
  competitive: { label: "Competitive pressure", keywords: ["competitor", "biosimilar", "generic", "market share", "launch", "entrant", "rivalry", "competing", "alternative", "switch", "displacement", "threat"] },
  execution: { label: "Execution capacity", keywords: ["supply", "manufacturing", "distribution", "sales force", "launch readiness", "field", "commercial", "capacity", "infrastructure", "training", "operational", "execution"] },
};

const STRUCTURAL_TRIGGER_KEYWORDS = [
  "part d", "redesign", "ira ", "inflation reduction", "coverage reduction",
  "manufacturer liability", "catastrophic", "formulary exclusion",
  "step therapy", "prior authorization mandate", "rebate rule",
  "340b", "price negotiation", "out-of-pocket cap",
];

function assignDriverRole(signal: { text: string; direction: Direction; strength: Strength; impact: Impact; category: Category }): DriverRole {
  const text = signal.text.toLowerCase();
  const isNegative = signal.direction === "decreases_probability" || signal.direction === "negative" || signal.direction === "signals_risk_escalation";
  if (isNegative && (signal.strength === "High" || signal.impact === "High")) return "counterforce";
  if (signal.impact === "High" && signal.strength === "High") return "primary_driver";
  const isStructuralTrigger = STRUCTURAL_TRIGGER_KEYWORDS.some(kw => text.includes(kw));
  if (isStructuralTrigger && (signal.impact === "High" || signal.strength === "High" || signal.category === "access")) return "primary_driver";
  if (signal.impact === "High" || signal.strength === "High") return "supporting_driver";
  if (isStructuralTrigger) return "supporting_driver";
  if (signal.impact === "Low" && signal.strength === "Low") return "noise";
  if (signal.direction === "neutral" || signal.direction === "signals_uncertainty") return "context_signal";
  return "supporting_driver";
}

function assignMechanismGroup(signal: { text: string; category: Category; signal_domain?: SignalDomain }): MechanismGroup {
  const text = signal.text.toLowerCase();
  for (const [key, { keywords }] of Object.entries(DRIVER_COVERAGE_CATEGORIES)) {
    if (keywords.some(kw => text.includes(kw))) {
      if (key === "economic") return "economic_pressure";
      if (key === "structural") return "structural_protection";
      if (key === "competitive") return "competitive_threat";
      if (key === "execution") return "execution_change";
    }
  }
  if (signal.category === "competition" || signal.signal_domain === "competitive_dynamics") return "competitive_threat";
  if (signal.category === "access" || signal.signal_domain === "market_access") return "economic_pressure";
  if (signal.category === "evidence" || signal.signal_domain === "regulatory_activity" || signal.signal_domain === "clinical_evidence") return "structural_protection";
  return "execution_change";
}

function checkCausalAlignment(signalText: string, questionText: string, outcome: string): boolean {
  const sigWords = new Set(signalText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const qWords = new Set(questionText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const oWords = new Set(outcome.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const combined = new Set([...qWords, ...oWords]);
  let overlap = 0;
  for (const w of sigWords) {
    if (combined.has(w)) overlap++;
  }
  return overlap >= 2 || (sigWords.size <= 5 && overlap >= 1);
}

interface Signal {
  id: string;
  text: string;
  caveat: string;
  direction: Direction;
  strength: Strength;
  reliability: Reliability;
  impact: Impact;
  category: Category;
  source: "system" | "user";
  accepted: boolean;
  signal_class?: SignalClass;
  signal_family?: SignalFamily;
  signal_source?: SignalSource;
  source_url?: string | null;
  source_type?: string;
  observed_date?: string | null;
  citation_excerpt?: string | null;
  brand_verified?: boolean;
  applies_to_line_of_therapy?: LineOfTherapyApplicability;
  applies_to_stakeholder_group?: string;
  applies_within_time_horizon?: TimeHorizonApplicability;
  translation_confidence?: TranslationConfidence;
  question_relevance_note?: string;
  signal_domain?: SignalDomain;
  priority_source?: PrioritySource;
  is_locked?: boolean;
  conflict_with?: string;
  superseded_by?: string;
  superseded?: boolean;
  workbook_meta?: WorkbookMeta;
  verificationStatus?: string;
  evidenceStatus?: string;
  evidenceClass?: string;
  countTowardPosterior?: boolean;
  identifierType?: string;
  identifierValue?: string;
  registryMatch?: boolean;
  verificationRedFlags?: string;
  driver_role?: DriverRole;
  mechanism_group?: MechanismGroup;
  causal_aligned?: boolean;
  measurement_criteria?: MeasurementCriteria;
  trigger_rules?: TriggerRule[];
  triggered_flags?: string[];
}

interface ForecastSignalDetail {
  likelihoodRatio: number;
  effectiveLikelihoodRatio: number;
  correlationGroup: string | null;
  correlationDampened: boolean;
  dependencyRole: "Root" | "Derivative" | "Independent";
  rawLikelihoodRatio: number;
  pointContribution: number;
}

interface MeasurementCriteria {
  baseline_value?: string;
  observed_change?: string;
  geographic_scope?: string;
  time_window?: string;
  evidence_source?: string;
  confidence_level?: "Confirmed" | "Probable" | "Speculative";
  derived_metrics?: DerivedMetric[];
}

interface DerivedMetric {
  name: string;
  definition: string;
  value?: number;
  unit?: string;
}

interface TriggerRule {
  id: string;
  condition: string;
  action_impact: Impact;
  action_message: string;
  time_window_months?: [number, number];
  active: boolean;
}

const DEFAULT_COMPETITOR_TRIGGER: TriggerRule = {
  id: "trigger-competitor-field-capacity",
  condition: "Competitor field capacity increases in affected territories within 3–6 months of coverage reduction",
  action_impact: "High",
  action_message: "Auto-flagged: Competitor field expansion detected in coverage reduction window",
  time_window_months: [3, 6],
  active: true,
};

function evaluateTriggerRules(signal: Signal, allSignals: Signal[]): string[] {
  const flags: string[] = [];
  const rules = signal.trigger_rules || [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const text = signal.text.toLowerCase();
    const isCompetitorField = text.includes("field force") || text.includes("field capacity") || text.includes("headcount") || text.includes("sales force") || text.includes("coverage");
    const isCompetitive = signal.mechanism_group === "competitive_threat" || signal.category === "competition";
    if (isCompetitorField && isCompetitive) {
      const hasCoverageReduction = allSignals.some(s =>
        s.id !== signal.id &&
        s.accepted &&
        (s.text.toLowerCase().includes("coverage reduction") ||
         s.text.toLowerCase().includes("formulary exclusion") ||
         s.text.toLowerCase().includes("market share loss") ||
         s.text.toLowerCase().includes("access restriction"))
      );
      if (hasCoverageReduction) {
        flags.push(rule.action_message);
      }
    }
  }
  return flags;
}

function computeCompetitiveCoverageRatio(signals: Signal[]): DerivedMetric | null {
  const competitorSignals = signals.filter(s =>
    s.accepted &&
    (s.mechanism_group === "competitive_threat" || s.category === "competition")
  );
  const brandSignals = signals.filter(s =>
    s.accepted &&
    s.mechanism_group !== "competitive_threat" &&
    s.category !== "competition" &&
    (s.text.toLowerCase().includes("field") || s.text.toLowerCase().includes("sales force") || s.text.toLowerCase().includes("commercial") || s.text.toLowerCase().includes("capacity"))
  );
  if (competitorSignals.length === 0 && brandSignals.length === 0) return null;

  const competitorStrength = competitorSignals.reduce((sum, s) => {
    return sum + (s.impact === "High" ? 3 : s.impact === "Medium" ? 2 : 1);
  }, 0);
  const brandStrength = brandSignals.reduce((sum, s) => {
    return sum + (s.impact === "High" ? 3 : s.impact === "Medium" ? 2 : 1);
  }, 0);
  const ratio = brandStrength > 0 ? competitorStrength / brandStrength : competitorStrength > 0 ? 999 : 0;

  return {
    name: "Competitive Coverage Ratio",
    definition: "Competitor field capacity ÷ brand field capacity in affected territories",
    value: Math.round(ratio * 100) / 100,
    unit: "ratio",
  };
}

function enrichSignalFields(sig: Signal, questionText?: string, outcomeText?: string): Signal {
  const enriched = { ...sig };
  if (!enriched.driver_role) {
    enriched.driver_role = assignDriverRole(enriched);
  }
  if (!enriched.mechanism_group) {
    enriched.mechanism_group = assignMechanismGroup(enriched);
  }
  if (questionText) {
    enriched.causal_aligned = checkCausalAlignment(enriched.text, questionText, outcomeText || questionText);
  }
  const text = enriched.text.toLowerCase();
  const isCompetitorField = text.includes("field force") || text.includes("field capacity") || text.includes("headcount") || text.includes("sales force") || text.includes("coverage intensity") || text.includes("competitor") && (text.includes("capacity") || text.includes("coverage"));
  if (isCompetitorField && !enriched.trigger_rules?.length) {
    enriched.trigger_rules = [DEFAULT_COMPETITOR_TRIGGER];
  }
  return enriched;
}

function reEnrichSignalFields(sig: Signal, questionText?: string, outcomeText?: string): Signal {
  return {
    ...sig,
    driver_role: assignDriverRole(sig),
    mechanism_group: assignMechanismGroup(sig),
    causal_aligned: questionText ? checkCausalAlignment(sig.text, questionText, outcomeText || questionText) : sig.causal_aligned,
  };
}

interface IncomingEvent {
  id: string;
  title: string;
  type: string;
  description: string;
  icon: React.ElementType;
}

const CATEGORY_CONFIG: Record<Category, { icon: React.ElementType; label: string; color: string }> = {
  evidence: { icon: FlaskConical, label: "Evidence", color: "text-emerald-400" },
  access: { icon: Shield, label: "Access", color: "text-blue-400" },
  competition: { icon: Swords, label: "Competition", color: "text-red-400" },
  guideline: { icon: BookOpen, label: "Guideline", color: "text-violet-400" },
  timing: { icon: Clock, label: "Timing", color: "text-amber-400" },
  adoption: { icon: Users, label: "Adoption", color: "text-cyan-400" },
};

function generateIncomingEvents(ctx: QuestionContext): IncomingEvent[] {
  const subjectLabel = ctx.subject || "this therapy";
  const outcomeLabel = ctx.outcome || "adoption";
  const q = (ctx.text || "").toLowerCase();

  const events: IncomingEvent[] = [];

  if (q.includes("payer") || q.includes("coverage") || q.includes("restrict") || q.includes("access") || q.includes("formulary")) {
    events.push(
      { id: "ev-1", title: "Formulary Review", type: "access", description: `Regional payer formulary committee reviewing ${subjectLabel} coverage`, icon: Shield },
      { id: "ev-2", title: "HEOR Data Release", type: "evidence", description: `Health economics data package for ${subjectLabel} expected this quarter`, icon: FlaskConical },
      { id: "ev-3", title: "Prior Auth Policy", type: "access", description: `Step-therapy requirements under review for ${subjectLabel}`, icon: BookOpen },
      { id: "ev-4", title: "Competitor Pricing", type: "competition", description: `Competing therapy pricing announcement anticipated`, icon: Swords },
      { id: "ev-5", title: "Patient Advocacy", type: "adoption", description: `Patient advocacy group lobbying for ${subjectLabel} access`, icon: Users },
    );
  } else if (q.includes("compet") || q.includes("rival") || q.includes("displace")) {
    events.push(
      { id: "ev-1", title: "Competitor Filing", type: "competition", description: `Competing asset regulatory submission expected`, icon: Swords },
      { id: "ev-2", title: "Head-to-Head Data", type: "evidence", description: `Comparative efficacy data for ${subjectLabel} vs competitor pending`, icon: FlaskConical },
      { id: "ev-3", title: "Market Entry", type: "competition", description: `New entrant approaching approval in ${subjectLabel}'s space`, icon: Swords },
      { id: "ev-4", title: "KOL Endorsement", type: "guideline", description: `Key opinion leaders expected to comment on ${subjectLabel} differentiation`, icon: BookOpen },
      { id: "ev-5", title: "Switching Analysis", type: "adoption", description: `Real-world switching pattern data expected`, icon: Users },
    );
  } else if (q.includes("safety") || q.includes("phase 3") || q.includes("phase iii") || q.includes("tolerab")) {
    events.push(
      { id: "ev-1", title: "Safety Data Release", type: "evidence", description: `Phase 3 safety analysis for ${subjectLabel} expected`, icon: FlaskConical },
      { id: "ev-2", title: "REMS Update", type: "access", description: `Risk management program review for ${subjectLabel}`, icon: Shield },
      { id: "ev-3", title: "Conference Presentation", type: "guideline", description: `${subjectLabel} tolerability data to be presented at upcoming conference`, icon: BookOpen },
      { id: "ev-4", title: "Post-Market Surveillance", type: "evidence", description: `Real-world safety monitoring report for ${subjectLabel} due`, icon: FlaskConical },
      { id: "ev-5", title: "Prescriber Survey", type: "adoption", description: `Safety perception survey among ${subjectLabel} prescribers planned`, icon: Users },
    );
  } else if (q.includes("guideline") || q.includes("nccn") || q.includes("asco")) {
    events.push(
      { id: "ev-1", title: "Guideline Update", type: "guideline", description: `Treatment guideline committee reviewing ${subjectLabel} positioning`, icon: BookOpen },
      { id: "ev-2", title: "Evidence Review", type: "evidence", description: `Systematic review incorporating ${subjectLabel} clinical data`, icon: FlaskConical },
      { id: "ev-3", title: "Expert Panel", type: "guideline", description: `Expert consensus panel on ${subjectLabel} role in treatment`, icon: BookOpen },
      { id: "ev-4", title: "Payer Response", type: "access", description: `Payer coverage anticipated to follow guideline update for ${subjectLabel}`, icon: Shield },
      { id: "ev-5", title: "Practice Update", type: "adoption", description: `Clinical practice adaptation to new ${subjectLabel} recommendations`, icon: Users },
    );
  } else {
    events.push(
      { id: "ev-1", title: "Guideline Update", type: "guideline", description: `Treatment guidelines under review for ${subjectLabel}`, icon: BookOpen },
      { id: "ev-2", title: "Trial Readout", type: "evidence", description: `Clinical data readout expected for ${subjectLabel}`, icon: FlaskConical },
      { id: "ev-3", title: "Payer Decision", type: "access", description: `Formulary review in progress for ${subjectLabel}`, icon: Shield },
      { id: "ev-4", title: "Competitor Activity", type: "competition", description: `Competing therapy activity in ${subjectLabel}'s segment`, icon: Swords },
      { id: "ev-5", title: "Field Intelligence", type: "adoption", description: `${subjectLabel} ${outcomeLabel} tracking update expected`, icon: Users },
    );
  }

  return events;
}

function computeImpact(s: { strength: Strength; reliability: Reliability; translation_confidence?: TranslationConfidence }): Impact {
  if (s.translation_confidence === "low") {
    return s.strength === "High" ? "Medium" : "Low";
  }
  if (s.translation_confidence === "moderate" && s.strength === "High" && s.reliability !== "Confirmed") {
    return "Medium";
  }
  if (s.strength === "High" && s.reliability === "Confirmed") return "High";
  if (s.strength === "High" || (s.strength === "Medium" && s.reliability === "Confirmed")) return "Medium";
  return "Low";
}

interface QuestionContext {
  text: string;
  questionType?: string;
  entities?: string[];
  subject?: string;
  outcome?: string;
  timeHorizon?: string;
}

function generateComparativeSuggestions(ctx: QuestionContext): Signal[] {
  const groupA = ctx.entities?.[0] || "Group A";
  const groupB = ctx.entities?.[1] || "Group B";
  const subjectLabel = ctx.subject || "this therapy";

  const raw: Omit<Signal, "impact">[] = [
    { id: "sys-c1", text: `Clinical familiarity difference: ${groupA} may have more experience with ${subjectLabel}'s mechanism of action than ${groupB}`, caveat: "", direction: "positive", strength: "High", reliability: "Probable", category: "evidence", source: "system", accepted: false },
    { id: "sys-c2", text: `Patient mix difference: ${groupA} sees a different proportion of eligible patients compared to ${groupB}`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "adoption", source: "system", accepted: false },
    { id: "sys-c3", text: `Workflow difference: monitoring and diagnostic capabilities vary between ${groupA} and ${groupB} practices`, caveat: "", direction: "negative", strength: "Medium", reliability: "Confirmed", category: "access", source: "system", accepted: false },
    { id: "sys-c4", text: `Economic difference: reimbursement and prior authorization burden differs between ${groupA} and ${groupB}`, caveat: "", direction: "negative", strength: "High", reliability: "Probable", category: "access", source: "system", accepted: false },
    { id: "sys-c5", text: `Behavioral difference: innovation adoption tendency and risk tolerance may vary between ${groupA} and ${groupB}`, caveat: "", direction: "neutral", strength: "Medium", reliability: "Speculative", category: "adoption", source: "system", accepted: false },
  ];

  return raw.map((s) => ({ ...s, impact: computeImpact(s) }));
}

function generateContextualSuggestions(ctx: QuestionContext): Signal[] {
  const q = (ctx.text || "").toLowerCase();
  const subjectLabel = ctx.subject || "this therapy";
  const outcomeLabel = ctx.outcome || "adoption";
  const timeLabel = ctx.timeHorizon || "the forecast window";
  const isRegOrSafetyCase = /\b(black.?box|boxed.?warning|rems|label.?change|label.?update|fda.?(warn|restrict|withdraw|safety|review)|ema.?(warn|restrict|withdraw|safety)|pharmacovigilance|safety.?signal|adverse.?event|contraindication|class.?warning|benefit.?risk|safety.?review|mortality.?signal|bleeding.?risk|hepatotoxic|nephrotoxic)\b/i.test(q);
  const raw: Omit<Signal, "impact">[] = [];

  if (isRegOrSafetyCase) {
    raw.push(
      { id: "sys-rs1", text: `Comparative safety data showing elevated risk profile for ${subjectLabel} relative to therapeutic alternatives`, caveat: "Head-to-head or indirect comparison evidence directly influences regulatory risk assessment", direction: "negative", strength: "High", reliability: "Probable", category: "evidence", source: "system", accepted: false },
      { id: "sys-rs2", text: `Increase in adverse event reports for ${subjectLabel} in pharmacovigilance databases (FAERS/EudraVigilance)`, caveat: "Rising signal volume in post-marketing surveillance is a key regulatory trigger", direction: "negative", strength: "High", reliability: "Probable", category: "evidence", source: "system", accepted: false },
      { id: "sys-rs3", text: `FDA or EMA initiates formal safety review or signal assessment for ${subjectLabel}`, caveat: "Formal regulatory safety review is the most direct precursor to label action", direction: "negative", strength: "High", reliability: "Probable", category: "guideline", source: "system", accepted: false },
      { id: "sys-rs4", text: `Active or pending litigation citing safety complications related to ${subjectLabel}`, caveat: "Litigation clusters increase regulatory and public pressure for label action", direction: "negative", strength: "Medium", reliability: "Probable", category: "evidence", source: "system", accepted: false },
      { id: "sys-rs5", text: `Conflicting or unresolved post-marketing safety evidence for ${subjectLabel}`, caveat: "Unresolved safety uncertainty maintains regulatory risk and may trigger additional review", direction: "neutral", strength: "High", reliability: "Probable", category: "evidence", source: "system", accepted: false },
    );
    if (q.includes("bleed") || q.includes("gi") || q.includes("hemorrhag") || q.includes("gastrointestin"))
      raw.push({ id: "sys-rs6", text: `Published real-world evidence on bleeding event rates for ${subjectLabel} across clinical settings`, caveat: "Real-world bleeding data strengthens or weakens the regulatory safety signal", direction: "neutral", strength: "High", reliability: "Confirmed", category: "evidence", source: "system", accepted: false });
  } else if (q.includes("payer") || q.includes("prior auth") || q.includes("coverage") || q.includes("restrict")) {
    raw.push(
      { id: "sys-pa1", text: `Payer advisory boards actively reviewing ${subjectLabel} coverage criteria`, caveat: "", direction: "negative", strength: "High", reliability: "Probable", category: "access", source: "system", accepted: false },
      { id: "sys-pa2", text: `Prior authorization step-therapy requirements being implemented in key plans`, caveat: "", direction: "negative", strength: "High", reliability: "Confirmed", category: "access", source: "system", accepted: false },
      { id: "sys-pa3", text: `Health economics data package supporting favorable cost-effectiveness for ${subjectLabel}`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "evidence", source: "system", accepted: false },
      { id: "sys-pa4", text: `Regional payer expanding formulary access in select geographies`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "access", source: "system", accepted: false },
    );
    if (q.includes("community") || q.includes("small"))
      raw.push({ id: "sys-pa5", text: `Community practices reporting increased administrative burden from authorization requirements`, caveat: "", direction: "negative", strength: "Medium", reliability: "Confirmed", category: "access", source: "system", accepted: false });
  } else if (q.includes("compet") || q.includes("rival") || q.includes("threat")) {
    raw.push(
      { id: "sys-cp1", text: `Competing therapy approaching regulatory decision within ${timeLabel}`, caveat: "", direction: "negative", strength: "High", reliability: "Probable", category: "competition", source: "system", accepted: false },
      { id: "sys-cp2", text: `Competitor's clinical profile may fragment ${subjectLabel}'s addressable market`, caveat: "", direction: "negative", strength: "High", reliability: "Speculative", category: "competition", source: "system", accepted: false },
      { id: "sys-cp3", text: `${subjectLabel} retains differentiated efficacy advantage in head-to-head comparisons`, caveat: "", direction: "positive", strength: "High", reliability: "Confirmed", category: "evidence", source: "system", accepted: false },
      { id: "sys-cp4", text: `Early adopters likely to maintain ${subjectLabel} if switching costs are high`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "adoption", source: "system", accepted: false },
    );
  } else if (q.includes("safety") || q.includes("phase 3") || q.includes("phase iii") || q.includes("tolerab") || q.includes("monitor")) {
    raw.push(
      { id: "sys-sf1", text: `Phase 3 safety data showing favorable tolerability profile for ${subjectLabel}`, caveat: "", direction: "positive", strength: "High", reliability: "Confirmed", category: "evidence", source: "system", accepted: false },
      { id: "sys-sf2", text: `Monitoring requirements may create workflow friction in smaller practice settings`, caveat: "", direction: "negative", strength: "Medium", reliability: "Confirmed", category: "access", source: "system", accepted: false },
      { id: "sys-sf3", text: `KOL endorsements citing manageable safety profile at recent conferences`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "guideline", source: "system", accepted: false },
      { id: "sys-sf4", text: `Post-marketing surveillance plan may reassure hesitant prescribers`, caveat: "", direction: "positive", strength: "Medium", reliability: "Speculative", category: "adoption", source: "system", accepted: false },
    );
    if (q.includes("monitor") || q.includes("small practice"))
      raw.push({ id: "sys-sf5", text: `Small practices lacking infrastructure for required monitoring protocols`, caveat: "", direction: "negative", strength: "High", reliability: "Probable", category: "access", source: "system", accepted: false });
  } else if (q.includes("segment") || q.includes("academic") || q.includes("clinic") || q.includes("which")) {
    raw.push(
      { id: "sys-sg1", text: `Academic centers initiating formulary review processes for ${subjectLabel}`, caveat: "", direction: "positive", strength: "High", reliability: "Confirmed", category: "adoption", source: "system", accepted: false },
      { id: "sys-sg2", text: `Specialty clinics showing higher intent-to-prescribe in early surveys`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "adoption", source: "system", accepted: false },
      { id: "sys-sg3", text: `Community practices slower to adopt due to workflow complexity`, caveat: "", direction: "negative", strength: "Medium", reliability: "Confirmed", category: "access", source: "system", accepted: false },
      { id: "sys-sg4", text: `KOL influence strongest in academic and specialty settings`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "guideline", source: "system", accepted: false },
    );
  } else if (q.includes("exceed") || q.includes("threshold") || q.includes("%")) {
    raw.push(
      { id: "sys-th1", text: `Current prescribing volume trend for ${subjectLabel} relative to threshold target`, caveat: "Direct measurement of whether the adoption target is on track", direction: "positive", strength: "High", reliability: "Probable", category: "adoption", source: "system", accepted: false },
      { id: "sys-th2", text: `Payer coverage restrictions or prior authorization requirements limiting ${subjectLabel} access`, caveat: "Access barriers directly constrain achievable market share", direction: "negative", strength: "High", reliability: "Probable", category: "access", source: "system", accepted: false },
      { id: "sys-th3", text: `Guideline committee positioning of ${subjectLabel} for the target indication`, caveat: "Guideline inclusion directly influences prescribing behavior at scale", direction: "positive", strength: "High", reliability: "Confirmed", category: "guideline", source: "system", accepted: false },
      { id: "sys-th4", text: `Competitive alternatives to ${subjectLabel} that may fragment the addressable market`, caveat: "Competitor presence constrains maximum achievable share", direction: "negative", strength: "Medium", reliability: "Probable", category: "competition", source: "system", accepted: false },
    );
  } else {
    raw.push(
      { id: "sys-1", text: `Clinical evidence supports ${subjectLabel} differentiation for ${outcomeLabel}`, caveat: "", direction: "positive", strength: "High", reliability: "Confirmed", category: "evidence", source: "system", accepted: false },
      { id: "sys-2", text: `Guideline committee reviewing ${subjectLabel} for updated treatment recommendations`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "guideline", source: "system", accepted: false },
      { id: "sys-3", text: `Payer friction observed in early ${subjectLabel} access negotiations`, caveat: "", direction: "negative", strength: "Medium", reliability: "Confirmed", category: "access", source: "system", accepted: false },
      { id: "sys-4", text: `Entrenched standard of care creating switching inertia against ${subjectLabel}`, caveat: "", direction: "negative", strength: "High", reliability: "Confirmed", category: "competition", source: "system", accepted: false },
    );
    if (q.includes("adoption") || q.includes("indication"))
      raw.push({ id: "sys-5", text: `Early adopter segment showing interest in ${subjectLabel} after recent conference data`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "adoption", source: "system", accepted: false });
    if (q.includes("prescri"))
      raw.push({ id: "sys-8", text: `KOL prescribing pattern shifting toward ${subjectLabel} in target population`, caveat: "", direction: "positive", strength: "High", reliability: "Probable", category: "guideline", source: "system", accepted: false });
    if (!isRegOrSafetyCase && q.includes("segment"))
      raw.push({ id: "sys-9", text: `Launch readiness assessments underway for ${subjectLabel} in priority markets`, caveat: "", direction: "positive", strength: "Medium", reliability: "Confirmed", category: "timing", source: "system", accepted: false });
  }

  if (!isRegOrSafetyCase && (q.includes("launch") || q.includes("manufact") || q.includes("supply") || q.includes("produc") || q.includes("capacity") || q.includes("timing"))) {
    const supplySignals: Omit<Signal, "impact">[] = [
      { id: "sys-mfg1", text: `Manufacturing slot scheduling status for ${subjectLabel} — slot allocation confirmed or pending`, caveat: "Critical determinant of launch readiness timeline", direction: "neutral", strength: "High", reliability: "Probable", category: "timing", source: "system", accepted: false },
      { id: "sys-mfg2", text: `Production capacity allocation for ${subjectLabel} at designated manufacturing sites`, caveat: "Capacity constraints can delay launch by 6-12 months", direction: "neutral", strength: "High", reliability: "Probable", category: "timing", source: "system", accepted: false },
      { id: "sys-mfg3", text: `Portfolio priority ranking of ${subjectLabel} relative to other pipeline assets`, caveat: "Internal portfolio decisions affect resource allocation and timing", direction: "neutral", strength: "Medium", reliability: "Probable", category: "timing", source: "system", accepted: false },
      { id: "sys-mfg4", text: `Commercial inventory build progress for ${subjectLabel} pre-launch stocking`, caveat: "Inventory readiness determines go/no-go for commercial launch date", direction: "neutral", strength: "High", reliability: "Probable", category: "timing", source: "system", accepted: false },
      { id: "sys-mfg5", text: `Pre-launch supply readiness assessment for ${subjectLabel} — packaging, labeling, distribution`, caveat: "Supply chain readiness is a necessary condition for on-time launch", direction: "neutral", strength: "High", reliability: "Probable", category: "timing", source: "system", accepted: false },
    ];
    const existingIds = new Set(raw.map(s => s.id));
    for (const s of supplySignals) {
      if (!existingIds.has(s.id)) raw.push(s);
    }
  }

  return raw.map((s) => ({ ...s, impact: computeImpact(s) }));
}

function generateSuggestions(ctx: QuestionContext): Signal[] {
  if (ctx.questionType === "comparative" && ctx.entities && ctx.entities.length >= 2) {
    return generateComparativeSuggestions(ctx);
  }
  return generateContextualSuggestions(ctx);
}

function generateSummary(signals: Signal[], questionType?: string, entities?: string[], adoptionSummary?: string | null): string {
  if (adoptionSummary) return adoptionSummary;

  const accepted = signals.filter((s) => s.accepted || s.source === "system");
  const positiveHigh = accepted.filter((s) => isPositiveDirection(s.direction) && s.impact === "High");
  const negativeHigh = accepted.filter((s) => isNegativeDirection(s.direction) && s.impact === "High");

  if (questionType === "comparative" && entities && entities.length >= 2) {
    const groupA = entities[0];
    const groupB = entities[1];
    if (positiveHigh.length > 0 && negativeHigh.length > 0) {
      return `Clinical familiarity and patient mix differences suggest ${groupA} may adopt earlier than ${groupB}, while workflow and economic constraints may slow uptake differently.`;
    }
    if (positiveHigh.length > 0) {
      return `Strong difference signals suggest ${groupA} and ${groupB} will diverge in adoption.`;
    }
    if (negativeHigh.length > 0) {
      return `Shared constraints may reduce the gap between ${groupA} and ${groupB}.`;
    }
    return `${accepted.length} difference signals registered between ${groupA} and ${groupB}. Confirm or add signals to sharpen the comparison.`;
  }

  const supportiveDrivers = accepted.filter((s) => isPositiveDirection(s.direction));
  const constrainingDrivers = accepted.filter((s) => isNegativeDirection(s.direction));
  const highSupportive = supportiveDrivers.filter((s) => s.impact === "High" || s.strength === "High");
  const highConstraining = constrainingDrivers.filter((s) => s.impact === "High" || s.strength === "High");

  const parts: string[] = [];

  if (highSupportive.length > 0) {
    const topSupp = highSupportive[0];
    const suppLabel = CATEGORY_CONFIG[topSupp.category]?.label || topSupp.category;
    parts.push(`Dominant supportive driver: ${suppLabel.toLowerCase()} (${supportiveDrivers.length} supporting signal${supportiveDrivers.length > 1 ? "s" : ""})`);
  }

  if (highConstraining.length > 0) {
    const topCon = highConstraining[0];
    const conLabel = CATEGORY_CONFIG[topCon.category]?.label || topCon.category;
    parts.push(`Dominant constraining driver: ${conLabel.toLowerCase()} (${constrainingDrivers.length} constraining signal${constrainingDrivers.length > 1 ? "s" : ""})`);
  }

  if (parts.length === 0) {
    return `${accepted.length} signals registered. The balance is moderately uncertain — confirm or add signals to sharpen the forecast.`;
  }

  return parts.join(" | ");
}

function getStepHeading(questionType?: string): string {
  switch (questionType) {
    case "ranking": return "What will make one scenario lead?";
    default: return "What new information do we have?";
  }
}

function inferCategory(text: string): Category {
  const t = text.toLowerCase();
  if (t.includes("payer") || t.includes("formulary") || t.includes("prior auth") || t.includes("coverage") || t.includes("reimbursement") || t.includes("access")) return "access";
  if (t.includes("competitor") || t.includes("competing") || t.includes("rival") || t.includes("switching") || t.includes("standard of care") || t.includes("entrenched")) return "competition";
  if (t.includes("guideline") || t.includes("recommendation") || t.includes("kol") || t.includes("consensus") || t.includes("nccn") || t.includes("asco")) return "guideline";
  if (t.includes("timing") || t.includes("launch") || t.includes("timeline") || t.includes("delay") || t.includes("approval date")) return "timing";
  if (t.includes("adoption") || t.includes("prescrib") || t.includes("uptake") || t.includes("market share") || t.includes("demand") || t.includes("patient")) return "adoption";
  return "evidence";
}

function getDirectionLabel(direction: Direction, outcomeLabel?: string): string {
  const target = outcomeLabel || "outcome";
  switch (direction) {
    case "positive":
    case "increases_probability": return `Supports ${target}`;
    case "negative":
    case "decreases_probability": return `Slows ${target}`;
    case "signals_risk_escalation": return "Risk escalation";
    case "operational_readiness": return "Operational readiness";
    case "market_response": return "Market response";
    case "signals_uncertainty":
    default: return "Neutral / Uncertain";
  }
}

function isPositiveDirection(d: Direction): boolean {
  return d === "positive" || d === "increases_probability";
}

function isNegativeDirection(d: Direction): boolean {
  return d === "negative" || d === "decreases_probability" || d === "signals_risk_escalation";
}

function getConfidenceLabel(reliability: Reliability): string {
  switch (reliability) {
    case "Confirmed": return "Strong";
    case "Probable": return "Moderate";
    case "Speculative": return "Weak";
  }
}

function getSourceLabel(signal: { source: string; source_type?: string; category: Category }): string {
  if (signal.source === "user") return "Manual entry";
  if (signal.source_type) {
    return signal.source_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  const map: Record<Category, string> = {
    evidence: "Published clinical data",
    access: "Market access data",
    competition: "Competitive intelligence",
    guideline: "Treatment guidelines",
    timing: "Market timing",
    adoption: "Adoption tracking",
  };
  return map[signal.category] || "Analysis";
}

function SignalLockBar({ caseId, signals, onPersistSignal }: { caseId?: string; signals?: Signal[]; onPersistSignal?: (signal: Signal) => Promise<void> }) {
  const [, navigate] = useLocation();
  const [locked, setLocked] = useState(() => {
    try { return localStorage.getItem(`cios.signalsLocked:${caseId}`) === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { setLocked(localStorage.getItem(`cios.signalsLocked:${caseId}`) === "true"); } catch {}
  }, [caseId]);

  useEffect(() => {
    const key = `cios.signalsLocked:${caseId}`;
    const interval = setInterval(() => {
      try {
        const val = localStorage.getItem(key) === "true";
        setLocked((prev) => (prev !== val ? val : prev));
      } catch {}
    }, 500);
    return () => clearInterval(interval);
  }, [caseId]);

  function toggle() {
    if (!caseId) return;
    const next = !locked;
    localStorage.setItem(`cios.signalsLocked:${caseId}`, next ? "true" : "false");
    setLocked(next);
  }

  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
          locked
            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
            : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
        }`}
      >
        {locked
          ? <><Lock className="w-3.5 h-3.5" /> Signals Locked</>
          : <><Unlock className="w-3.5 h-3.5" /> Lock Signals</>
        }
      </button>
      <button
        type="button"
        onClick={async () => {
          if (signals && onPersistSignal) {
            const unpersisted = signals.filter((s) => !s.accepted && !s.superseded);
            if (unpersisted.length > 0) {
              await Promise.all(unpersisted.map((s) => onPersistSignal(s)));
              await new Promise((r) => setTimeout(r, 500));
            }
          }
          navigate("/forecast");
        }}
        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
      >
        Continue to Judgment
      </button>
    </div>
  );
}

export default function SignalsPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const questionText = activeQuestion?.rawInput || activeQuestion?.text || "";
  const questionType = activeQuestion?.questionType;
  const entities = activeQuestion?.entities || [];
  const comparisonGroups = activeQuestion?.comparisonGroups || [];
  const subject = activeQuestion?.subject;
  const outcome = activeQuestion?.outcome;
  const timeHorizon = activeQuestion?.timeHorizon;
  const storedTherapeuticArea = typeof window !== "undefined" ? localStorage.getItem("cios.therapeuticArea") || undefined : undefined;
  const isComparative = comparisonGroups.length >= 2;

  const questionCtx: QuestionContext = useMemo(() => ({
    text: questionText,
    questionType,
    entities: comparisonGroups.length >= 2 ? comparisonGroups : entities,
    subject,
    outcome,
    timeHorizon,
  }), [questionText, questionType, comparisonGroups, entities, subject, outcome, timeHorizon]);

  const fallbackSuggestions = useMemo(
    () => generateSuggestions(questionCtx),
    [questionCtx]
  );

  const fallbackEvents = useMemo(
    () => generateIncomingEvents(questionCtx),
    [questionCtx]
  );

  const caseKey = activeQuestion?.caseId || "unknown";

  const [caseDetails, setCaseDetails] = useState<{ assetName?: string; diseaseState?: string; therapeuticArea?: string } | null>(null);
  useEffect(() => {
    if (!caseKey || caseKey === "unknown") return;
    const API = import.meta.env.VITE_API_URL || "";
    fetch(`${API}/api/cases/${caseKey}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setCaseDetails(data); })
      .catch(() => {});
  }, [caseKey]);

  const loadPersistedSignals = useCallback((): Signal[] | null => {
    try {
      const raw = localStorage.getItem(`cios.signals:${caseKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = stripNonMatchingBrandSignals(parsed, subject) as Signal[];
          return filtered.length > 0 ? filtered : null;
        }
      }
    } catch {}
    return null;
  }, [caseKey, subject]);

  const dbSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextKeyRef = useRef("");
  const persistSignals = useCallback((sigs: Signal[]) => {
    try {
      const serializable = sigs.map(({ ...s }) => s);
      localStorage.setItem(`cios.signals:${caseKey}`, JSON.stringify(serializable));
    } catch {}
    if (caseKey && caseKey !== "unknown") {
      if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
      dbSaveTimerRef.current = setTimeout(() => {
        const API = import.meta.env.VITE_API_URL || "";
        fetch(`${API}/api/cases/${caseKey}/signal-state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signals: sigs, contextKey: contextKeyRef.current }),
        }).catch(() => {});
      }, 1000);
    }
  }, [caseKey]);

  const [signals, setSignals] = useState<Signal[]>(() => {
    return [...fallbackSuggestions];
  });
  useEffect(() => {
    if (!caseKey || caseKey === "unknown") return;
    const API = import.meta.env.VITE_API_URL || "";
    fetch(`${API}/api/cases/${caseKey}/signals`)
      .then((r) => r.json())
      .then((dbSignals: any[]) => {
        if (!Array.isArray(dbSignals) || dbSignals.length === 0) return;
        const enrichById = new Map<string, { evidenceStatus?: string; evidenceClass?: string; countTowardPosterior?: boolean }>();
        const enrichByDesc = new Map<string, { evidenceStatus?: string; evidenceClass?: string; countTowardPosterior?: boolean }>();
        for (const ds of dbSignals) {
          const data: { evidenceStatus?: string; evidenceClass?: string; countTowardPosterior?: boolean } = {};
          if (ds.evidenceStatus) data.evidenceStatus = ds.evidenceStatus;
          if (ds.evidenceClass) data.evidenceClass = ds.evidenceClass;
          if (typeof ds.countTowardPosterior === "boolean") data.countTowardPosterior = ds.countTowardPosterior;
          if (Object.keys(data).length === 0) continue;
          if (ds.signalId) {
            enrichById.set(ds.signalId, data);
            if (ds.signalId.startsWith("SIG-")) enrichById.set(ds.signalId.slice(4), data);
          }
          if (ds.signalDescription) enrichByDesc.set(ds.signalDescription.slice(0, 80), data);
        }
        if (enrichById.size === 0 && enrichByDesc.size === 0) return;
        setSignals((prev) => prev.map((s) => {
          const enrichment = enrichById.get(`SIG-${s.id}`) || enrichById.get(s.id) || enrichByDesc.get(s.text?.slice(0, 80) || "");
          return enrichment ? { ...s, ...enrichment } : s;
        }));
      })
      .catch(() => {});
  }, [caseKey]);

  const [incomingEvents, setIncomingEvents] = useState<IncomingEvent[]>(fallbackEvents);
  const [aiLoading, setAiLoading] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<"searching" | "collecting" | "normalizing" | "assessing" | "preparing" | "processing" | "ready" | null>(null);
  const [processingCounts, setProcessingCounts] = useState({ found: 0, normalized: 0, validated: 0 });
  const [showReadyBanner, setShowReadyBanner] = useState(false);
  const [slowWarning, setSlowWarning] = useState(false);
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const readyBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const searchSucceededRef = useRef(false);
  const searchStartTimeRef = useRef<number>(0);
  const MIN_ACTIVITY_DISPLAY_MS = 3000;
  const [aiError, setAiError] = useState<string | null>(null);
  const [marketSummary, setMarketSummary] = useState<string | null>(null);
  const [translationSummary, setTranslationSummary] = useState<string | null>(null);
  const [adoptionCoverage, setAdoptionCoverage] = useState<{
    mechanism_coverage: { family_id: string; family_label: string; covered: boolean; signal_count: number }[];
    covered_count: number;
    total_families: number;
    missing_families: string[];
    dominant_supportive_driver: string | null;
    dominant_constraining_driver: string | null;
    is_under_specified: boolean;
    sufficiency_warning: string | null;
  } | null>(null);
  const [signalSummaryText, setSignalSummaryText] = useState<string | null>(null);
  const [sufficiencyWarning, setSufficiencyWarning] = useState<string | null>(null);
  const [eventGates, setEventGates] = useState<EventGate[] | null>(() => {
    try {
      const raw = localStorage.getItem(`cios.eventDecomposition:${caseKey}`);
      if (raw) { const p = JSON.parse(raw); if (p?.event_gates) return p.event_gates; }
    } catch {}
    return null;
  });
  const [baseGates, setBaseGates] = useState<EventGate[] | null>(() => {
    try {
      const raw = localStorage.getItem(`cios.baseGates:${caseKey}`);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; }
    } catch {}
    return null;
  });
  const [brandOutlook, setBrandOutlook] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`cios.eventDecomposition:${caseKey}`);
      if (raw) { const p = JSON.parse(raw); if (typeof p?.brand_outlook_probability === "number") return p.brand_outlook_probability; }
    } catch {}
    return 0.5;
  });
  const [recalcResult, setRecalcResult] = useState<RecalculationResult | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [lastImpact, setLastImpact] = useState<{ signalText: string; gateImpact: GateImpact | null; forecastBefore: number; forecastAfter: number } | null>(null);
  const [brandCheckDone, setBrandCheckDone] = useState(false);
  const [verifiedFound, setVerifiedFound] = useState(false);
  const aiRequestIdRef = useRef(0);
  const prevCaseKeyRef = useRef(caseKey);

  const triggerHash = useMemo(() => signals.map(s =>
    `${s.id}|${s.accepted}|${s.text.slice(0, 40)}|${s.mechanism_group}|${s.category}|${(s.trigger_rules || []).length}`
  ).join(","), [signals]);

  useEffect(() => {
    setSignals((prev) => {
      let changed = false;
      const updated = prev.map(s => {
        const flags = evaluateTriggerRules(s, prev);
        const prevFlags = s.triggered_flags || [];
        const flagsChanged = flags.length !== prevFlags.length || flags.some((f, i) => f !== prevFlags[i]);
        if (flagsChanged) {
          changed = true;
          const updatedSignal = { ...s, triggered_flags: flags };
          if (flags.length > 0 && s.impact !== "High") {
            updatedSignal.impact = "High";
          }
          return updatedSignal;
        }
        return s;
      });
      return changed ? updated : prev;
    });
  }, [triggerHash]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cios.signals:${caseKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = stripNonMatchingBrandSignals(parsed, subject);
          if (cleaned.length !== parsed.length) {
            localStorage.setItem(`cios.signals:${caseKey}`, JSON.stringify(cleaned));
            setSignals((prev) => {
              const updated = stripNonMatchingBrandSignals(prev, subject) as Signal[];
              return updated;
            });
          }
        }
      }
    } catch {}
  }, [caseKey, subject]);

  const signalLoadedRef = useRef(false);
  useEffect(() => {
    if (signalLoadedRef.current && prevCaseKeyRef.current === caseKey) return;
    prevCaseKeyRef.current = caseKey;
    signalLoadedRef.current = true;

    const restoreSignals = (sigs: Signal[]) => {
      setShowActivityPanel(true);
      setProcessingPhase("preparing");
      setProcessingCounts({ found: sigs.length, normalized: sigs.length, validated: sigs.length });
      setSignals([]);
      setTimeout(() => {
        setSignals(sigs.map((s: Signal) => enrichSignalFields(s, questionText, outcome)));
        setShowActivityPanel(false);
        setProcessingPhase("ready");
        setShowReadyBanner(true);
      }, 1200);
    };

    if (caseKey && caseKey !== "unknown") {
      const API = import.meta.env.VITE_API_URL || "";

      fetch(`${API}/api/cases/${caseKey}/signal-state`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.signals && Array.isArray(data.signals) && data.signals.length > 0) {
            const apiCleaned = stripNonMatchingBrandSignals(data.signals, subject) as Signal[];
            if (apiCleaned.length > 0) {
              try { localStorage.setItem(`cios.signals:${caseKey}`, JSON.stringify(apiCleaned)); } catch {}
              if (data.contextKey) {
                try { localStorage.setItem(`cios.aiRequested:${caseKey}`, data.contextKey); } catch {}
              }
              restoreSignals(apiCleaned);
              return;
            }
          }
          return fetch(`${API}/api/cases/${caseKey}/signals`)
            .then((r2) => r2.json())
            .then((sigs) => {
              if (Array.isArray(sigs) && sigs.length > 0) {
                const mapped = sigs.map((s: any) => ({
                  id: s.signalId || s.id,
                  text: s.signalDescription || s.text || "",
                  type: s.signalType || s.type || "",
                  direction: s.direction || "Neutral",
                  source: s.sourceUrl || s.source || "",
                  sourceLabel: s.sourceLabel || "",
                  countTowardPosterior: s.countTowardPosterior !== false,
                  likelihoodRatio: s.likelihoodRatio ?? 1.0,
                  strengthScore: s.strengthScore ?? 0,
                  reliabilityScore: s.reliabilityScore ?? 0,
                }));
                const cleaned = stripNonMatchingBrandSignals(mapped, subject) as Signal[];
                if (cleaned.length > 0) {
                  try { localStorage.setItem(`cios.signals:${caseKey}`, JSON.stringify(cleaned)); } catch {}
                  restoreSignals(cleaned);
                }
              }
            });
        })
        .catch(() => {});
    } else {
      setSignals(fallbackSuggestions.map((s: Signal) => enrichSignalFields(s, questionText, outcome)));
    }
    setIncomingEvents(fallbackEvents);
    setAiLoading(false);
    setAiError(null);
    setMarketSummary(null);
    setTranslationSummary(null);
    setAdoptionCoverage(null);
    setSignalSummaryText(null);
    setSufficiencyWarning(null);
    setRecalcResult(null);
    setLastImpact(null);
    setBrandCheckDone(false);
    setVerifiedFound(false);
    setBrandOutlook(() => {
      try {
        const raw = localStorage.getItem(`cios.eventDecomposition:${caseKey}`);
        if (raw) { const p = JSON.parse(raw); if (typeof p?.brand_outlook_probability === "number") return p.brand_outlook_probability; }
      } catch {}
      return 0.5;
    });
    setEventGates(() => {
      try {
        const raw = localStorage.getItem(`cios.eventDecomposition:${caseKey}`);
        if (raw) { const p = JSON.parse(raw); if (p?.event_gates) return p.event_gates; }
      } catch {}
      return null;
    });
    setBaseGates(() => {
      try {
        const raw = localStorage.getItem(`cios.baseGates:${caseKey}`);
        if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; }
      } catch {}
      return null;
    });
    aiRequestIdRef.current++;
  }, [caseKey, fallbackSuggestions, fallbackEvents]);

  const VALID_CATEGORIES = new Set(["evidence", "access", "competition", "guideline", "timing", "adoption"]);
  const VALID_DIRECTIONS = new Set(["positive", "negative", "neutral", "increases_probability", "decreases_probability", "signals_uncertainty", "signals_risk_escalation", "operational_readiness", "market_response"]);
  const VALID_SIGNAL_DOMAINS = new Set(["clinical_evidence", "safety_pharmacovigilance", "regulatory_activity", "guideline_activity", "market_access", "operational_readiness", "competitive_dynamics", "legal_litigation"]);
  const VALID_STRENGTHS = new Set(["High", "Medium", "Low"]);
  const VALID_RELIABILITIES = new Set(["Confirmed", "Probable", "Speculative"]);

  const contextKey = `${subject}|${questionText}|${outcome}|${questionType}|${comparisonGroups.join(",")}|${entities.join(",")}|${timeHorizon}`;
  contextKeyRef.current = contextKey;

  const hasPersistedSignals = useCallback(() => {
    try {
      const raw = localStorage.getItem(`cios.signals:${caseKey}`);
      if (raw) { const p = JSON.parse(raw); return Array.isArray(p) && p.length > 0; }
    } catch {}
    return false;
  }, [caseKey]);

  const aiAlreadyRan = useCallback(() => {
    try {
      const stored = localStorage.getItem(`cios.aiRequested:${caseKey}`);
      if (!stored) return false;
      if (stored === contextKey) return true;
      if (stored.startsWith("imported-")) return true;
      return false;
    } catch {}
    return false;
  }, [caseKey, contextKey]);

  const markAiRan = useCallback(() => {
    try { localStorage.setItem(`cios.aiRequested:${caseKey}`, contextKey); } catch {}
  }, [caseKey, contextKey]);

  const runSignalSearch = useCallback((searchKeywords?: string[]) => {
    if (!subject || !questionText) return;

    markAiRan();
    const requestId = ++aiRequestIdRef.current;

    setAiLoading(true);
    setShowActivityPanel(true);
    setProcessingPhase("searching");
    setProcessingCounts({ found: 0, normalized: 0, validated: 0 });
    setShowReadyBanner(false);
    setSlowWarning(false);
    searchSucceededRef.current = false;
    searchStartTimeRef.current = Date.now();
    if (readyBannerTimerRef.current) {
      clearTimeout(readyBannerTimerRef.current);
      readyBannerTimerRef.current = null;
    }
    if (slowWarningTimerRef.current) {
      clearTimeout(slowWarningTimerRef.current);
      slowWarningTimerRef.current = null;
    }
    for (const t of phaseTimerRefs.current) clearTimeout(t);
    phaseTimerRefs.current = [];

    slowWarningTimerRef.current = setTimeout(() => {
      setSlowWarning(true);
    }, 15000);

    const phaseSequence: Array<{ phase: "collecting" | "normalizing" | "assessing" | "preparing"; delay: number }> = [
      { phase: "collecting", delay: 2500 },
      { phase: "normalizing", delay: 5000 },
      { phase: "assessing", delay: 8000 },
      { phase: "preparing", delay: 11000 },
    ];
    for (const step of phaseSequence) {
      const timerId = setTimeout(() => {
        if (aiRequestIdRef.current === requestId) {
          setProcessingPhase((current) => {
            if (current === "ready" || current === "processing") return current;
            return step.phase;
          });
        }
      }, step.delay);
      phaseTimerRefs.current.push(timerId);
    }

    setAiError(null);
    setMarketSummary(null);
    setTranslationSummary(null);
    setAdoptionCoverage(null);
    setSignalSummaryText(null);
    setSufficiencyWarning(null);
    if (!hasPersistedSignals()) {
      setEventGates(null);
      setBaseGates(null);
      setRecalcResult(null);
      setLastImpact(null);
      try {
        localStorage.removeItem(`cios.eventDecomposition:${caseKey}`);
        localStorage.removeItem(`cios.translationSummary:${caseKey}`);
      } catch {}
    }
    setIncomingEvents(fallbackEvents);
    if (!hasPersistedSignals()) {
      setSignals((prev) => {
        const userSignals = prev.filter((s) => s.source === "user" || s.is_locked);
        return [...fallbackSuggestions, ...userSignals];
      });
    }

    const API = import.meta.env.VITE_API_URL || "";
    const doFetch = () => fetch(`${API}/api/ai-signals/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        outcome,
        questionType,
        questionText,
        timeHorizon,
        entities: comparisonGroups.length >= 2 ? comparisonGroups : entities,
        ...(searchKeywords?.length ? { keywords: searchKeywords } : {}),
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (aiRequestIdRef.current !== requestId) return;

        setProcessingPhase("processing");

        if (data.signals && Array.isArray(data.signals)) {
          setProcessingCounts(prev => ({ ...prev, found: data.signals.length }));
          const VALID_SIGNAL_CLASSES = new Set(["observed", "derived", "uncertainty"]);
          const VALID_SIGNAL_FAMILIES = new Set(ALL_SIGNAL_FAMILIES);
          const mapped: Signal[] = data.signals.map((s: any, i: number) => {
            const category = VALID_CATEGORIES.has(s.category) ? s.category : "evidence";
            const direction = VALID_DIRECTIONS.has(s.direction) ? s.direction : "neutral";
            const strength = VALID_STRENGTHS.has(s.strength) ? s.strength : "Medium";
            const reliability = VALID_RELIABILITIES.has(s.reliability) ? s.reliability : "Probable";
            const signal_class = VALID_SIGNAL_CLASSES.has(s.signal_class) ? s.signal_class as SignalClass : "derived";
            const signal_family = VALID_SIGNAL_FAMILIES.has(s.signal_family) ? s.signal_family as SignalFamily : "brand_clinical_regulatory";
            const VALID_TRANSLATION_CONFIDENCE = new Set(["high", "moderate", "low"]);
            const VALID_LINE_THERAPY = new Set(["current_label", "future_label", "uncertain"]);
            const VALID_TIME_HORIZON_APP = new Set(["yes", "partial", "unlikely"]);
            const translation_confidence = VALID_TRANSLATION_CONFIDENCE.has(s.translation_confidence) ? s.translation_confidence as TranslationConfidence : undefined;
            const applies_to_line_of_therapy = VALID_LINE_THERAPY.has(s.applies_to_line_of_therapy) ? s.applies_to_line_of_therapy as LineOfTherapyApplicability : undefined;
            const applies_within_time_horizon = VALID_TIME_HORIZON_APP.has(s.applies_within_time_horizon) ? s.applies_within_time_horizon as TimeHorizonApplicability : undefined;
            const idPrefix = searchKeywords?.length ? "find" : "ai";
            const VALID_SIGNAL_SOURCES = new Set(["internal", "external", "missing"]);
            const signal_source = VALID_SIGNAL_SOURCES.has(s.signal_source) ? s.signal_source as SignalSource : undefined;
            const signal_domain = VALID_SIGNAL_DOMAINS.has(s.signal_domain) ? s.signal_domain as SignalDomain : undefined;
            return enrichSignalFields({
              id: `${idPrefix}-${i + 1}`,
              text: s.text,
              caveat: s.rationale || "",
              direction,
              strength,
              reliability,
              impact: computeImpact({ strength, reliability, translation_confidence }),
              category,
              source: "system" as const,
              accepted: false,
              signal_class,
              signal_family,
              signal_source,
              signal_domain,
              source_url: s.source_url || null,
              source_type: s.source_type || undefined,
              observed_date: s.observed_date || null,
              citation_excerpt: s.citation_excerpt || null,
              brand_verified: !!s.brand_verified,
              applies_to_line_of_therapy,
              applies_to_stakeholder_group: s.applies_to_stakeholder_group || undefined,
              applies_within_time_horizon,
              translation_confidence,
              question_relevance_note: s.question_relevance_note || undefined,
              priority_source: signal_class === "uncertainty" ? "ai_uncertainty" as PrioritySource : "ai_derived" as PrioritySource,
              is_locked: false,
            }, questionText, outcome);
          });
          setProcessingCounts(prev => ({ ...prev, normalized: mapped.length }));
          setSignals((prev) => {
            const keepSignals = prev.filter((s) => s.is_locked || s.source === "user" || s.accepted);
            const keepTexts = new Set(keepSignals.map(s => s.text.toLowerCase().trim()));
            const newAi = mapped.filter(s => !keepTexts.has(s.text.toLowerCase().trim()));
            const merged = [...newAi, ...keepSignals];
            persistSignals(merged);
            setProcessingCounts(p => ({ ...p, validated: merged.length }));
            return merged;
          });
        }

        setBrandCheckDone(true);
        setVerifiedFound(data.verified_developments_found === true);

        if (data.incoming_events && Array.isArray(data.incoming_events)) {
          const iconMap: Record<string, React.ElementType> = {
            evidence: FlaskConical,
            access: Shield,
            competition: Swords,
            guideline: BookOpen,
            timing: Clock,
            adoption: Users,
          };
          const mappedEvents: IncomingEvent[] = data.incoming_events.map((e: any) => ({
            id: e.id || `ev-${Math.random().toString(36).slice(2, 6)}`,
            title: e.title,
            type: VALID_CATEGORIES.has(e.type) ? e.type : "evidence",
            description: e.description,
            icon: iconMap[e.type] || Sparkles,
          }));
          setIncomingEvents(mappedEvents);
        }

        if (data.market_summary) {
          setMarketSummary(data.market_summary);
        }

        const caseKey = activeQuestion?.caseId || "unknown";
        if (data.question_translation_summary) {
          setTranslationSummary(data.question_translation_summary);
          localStorage.setItem(`cios.translationSummary:${caseKey}`, data.question_translation_summary);
        } else {
          setTranslationSummary(null);
          localStorage.removeItem(`cios.translationSummary:${caseKey}`);
        }

        if (data.event_gates && Array.isArray(data.event_gates) && data.event_gates.length > 0) {
          const validStatuses = new Set(["strong", "moderate", "weak", "unresolved"]);
          const gates: EventGate[] = data.event_gates.map((g: any) => ({
            gate_id: g.gate_id || "unknown",
            gate_label: g.gate_label || "Unknown Gate",
            description: g.description || "",
            status: validStatuses.has(g.status) ? g.status : "unresolved",
            reasoning: g.reasoning || "",
            constrains_probability_to: typeof g.constrains_probability_to === "number" ? Math.max(0, Math.min(1, g.constrains_probability_to)) : 0.5,
          }));
          const computedCap = Math.min(...gates.map((g) => g.constrains_probability_to));
          const hasWeakOrUnresolved = gates.some((g) => g.status === "weak" || g.status === "unresolved");
          const enforcedCap = hasWeakOrUnresolved ? Math.min(computedCap, 0.70) : computedCap;
          const brandOutlook = typeof data.brand_outlook_probability === "number" ? Math.max(0, Math.min(1, data.brand_outlook_probability)) : 0.5;
          const decomp: EventDecomposition = {
            event_gates: gates,
            brand_outlook_probability: brandOutlook,
            constrained_probability: enforcedCap,
            constraint_explanation: data.constraint_explanation || "",
          };
          setEventGates(decomp.event_gates);
          setBaseGates(decomp.event_gates);
          setBrandOutlook(decomp.brand_outlook_probability);
          localStorage.setItem(`cios.eventDecomposition:${caseKey}`, JSON.stringify(decomp));
          try { localStorage.setItem(`cios.baseGates:${caseKey}`, JSON.stringify(decomp.event_gates)); } catch {}
        } else {
          setEventGates(null);
          setBaseGates(null);
          setRecalcResult(null);
          localStorage.removeItem(`cios.eventDecomposition:${caseKey}`);
        }

        if (data.therapeutic_area) {
          localStorage.setItem("cios.therapeuticArea", data.therapeutic_area);
        }

        if (data.adoption_coverage) {
          setAdoptionCoverage(data.adoption_coverage);
        } else {
          setAdoptionCoverage(null);
        }
        if (data.signal_summary) {
          setSignalSummaryText(data.signal_summary);
        } else {
          setSignalSummaryText(null);
        }
        if (data.sufficiency_warning) {
          setSufficiencyWarning(data.sufficiency_warning);
        } else {
          setSufficiencyWarning(null);
        }

        searchSucceededRef.current = true;
      })
      .catch((err) => {
        if (aiRequestIdRef.current !== requestId) return;
        console.error("[CIOS AI Signals] AI research failed, using template signals:", err);
        setAiError("Signal research unavailable — showing template signals. You can still add signals manually.");
        setIncomingEvents(fallbackEvents);
      })
      .finally(() => {
        if (aiRequestIdRef.current === requestId) {
          if (slowWarningTimerRef.current) {
            clearTimeout(slowWarningTimerRef.current);
            slowWarningTimerRef.current = null;
          }
          for (const t of phaseTimerRefs.current) clearTimeout(t);
          phaseTimerRefs.current = [];

          const elapsed = Date.now() - searchStartTimeRef.current;
          const remaining = Math.max(0, MIN_ACTIVITY_DISPLAY_MS - elapsed);

          const finishSearch = () => {
            setAiLoading(false);
            setSlowWarning(false);
            setShowActivityPanel(false);
            if (searchSucceededRef.current) {
              setProcessingPhase("ready");
              setShowReadyBanner(true);
            } else {
              setProcessingPhase(null);
            }
          };

          if (remaining > 0) {
            setProcessingPhase("preparing");
            setTimeout(() => {
              if (aiRequestIdRef.current === requestId) {
                finishSearch();
              }
            }, remaining);
          } else {
            finishSearch();
          }
        }
      });

    requestAnimationFrame(() => {
      setTimeout(doFetch, 50);
    });
  }, [subject, questionText, outcome, questionType, timeHorizon, entities, caseKey, fallbackEvents, fallbackSuggestions]);

  const runStructuredSearch = useCallback(() => {
    if (!subject) return;
    setStructuredSearchLoading(true);
    setStructuredSearchError(null);
    setStructuredCandidates([]);
    setStructuredSearchDone(false);

    const API = import.meta.env.VITE_API_URL || "";
    fetch(`${API}/api/ai-signals/structured-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        indication: caseDetails?.diseaseState || caseDetails?.therapeuticArea || outcome || "",
        questionText: questionText || "",
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.signals && Array.isArray(data.signals)) {
          setStructuredCandidates(data.signals);
        }
        setStructuredSearchDone(true);
      })
      .catch((err) => {
        console.error("[CIOS] Structured search failed:", err);
        setStructuredSearchError("Evidence search failed. Please try again.");
      })
      .finally(() => {
        setStructuredSearchLoading(false);
      });
  }, [subject, questionText, caseDetails, outcome]);

  const approveStructuredCandidate = useCallback((candidate: any) => {
    const VALID_SIGNAL_CLASSES = new Set(["observed", "derived", "uncertainty"]);
    const VALID_SIGNAL_FAMILIES = new Set(ALL_SIGNAL_FAMILIES);
    const direction = VALID_DIRECTIONS.has(candidate.direction) ? candidate.direction : "signals_uncertainty";
    const strength = VALID_STRENGTHS.has(candidate.strength) ? candidate.strength : "Medium";
    const reliability = VALID_RELIABILITIES.has(candidate.reliability) ? candidate.reliability : "Probable";
    const signal_class = VALID_SIGNAL_CLASSES.has(candidate.signal_class) ? candidate.signal_class as SignalClass : "observed";
    const signal_family = VALID_SIGNAL_FAMILIES.has(candidate.signal_family) ? candidate.signal_family as SignalFamily : "brand_clinical_regulatory";
    const signal_domain = VALID_SIGNAL_DOMAINS.has(candidate.signal_domain) ? candidate.signal_domain as SignalDomain : undefined;

    const newSignal = enrichSignalFields({
      id: `evid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: candidate.text,
      caveat: candidate.rationale || "",
      direction,
      strength,
      reliability,
      impact: computeImpact({ strength, reliability }),
      category: VALID_CATEGORIES.has(candidate.category) ? candidate.category : "evidence",
      source: "user" as const,
      accepted: true,
      signal_class,
      signal_family,
      signal_source: "external" as SignalSource,
      signal_domain,
      source_url: candidate.source_url || null,
      source_type: candidate.signalType || undefined,
      observed_date: null,
      citation_excerpt: null,
      brand_verified: true,
      countTowardPosterior: false,
      priority_source: "human_added" as PrioritySource,
      is_locked: false,
    }, questionText, outcome);

    setSignals((prev) => {
      const merged = [newSignal, ...prev];
      persistSignals(merged);
      return merged;
    });

    setStructuredCandidates((prev) => prev.filter((c) => c.tempId !== candidate.tempId));
  }, [questionText, outcome]);

  const rejectStructuredCandidate = useCallback((tempId: string) => {
    setStructuredCandidates((prev) => prev.filter((c) => c.tempId !== tempId));
  }, []);

  useEffect(() => {
    if (!subject || !questionText) return;
    if (hasPersistedSignals()) return;
    if (aiAlreadyRan()) return;
    runSignalSearch();
  }, [contextKey]);

  const prevQuestionRef = useRef(questionText);
  useEffect(() => {
    if (questionText !== prevQuestionRef.current) {
      const wasUndefined = prevQuestionRef.current === undefined;
      prevQuestionRef.current = questionText;
      if (wasUndefined) return;
      if (!aiLoading && !hasPersistedSignals()) {
        setSignals((prev) => {
          const lockedSignals = prev.filter((s) => s.is_locked || s.source === "user");
          return [...fallbackSuggestions, ...lockedSignals];
        });
      }
      setEditingId(null);
    }
  }, [questionText, fallbackSuggestions]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [provenanceSignal, setProvenanceSignal] = useState<Signal | null>(null);
  const [showFindPanel, setShowFindPanel] = useState(false);
  const [findKeywords, setFindKeywords] = useState("");
  const [structuredCandidates, setStructuredCandidates] = useState<any[]>([]);
  const [structuredSearchLoading, setStructuredSearchLoading] = useState(false);
  const [structuredSearchError, setStructuredSearchError] = useState<string | null>(null);
  const [structuredSearchDone, setStructuredSearchDone] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [signalLineageMap, setSignalLineageMap] = useState<Record<string, SignalLineageInfo>>({});
  const [lineageRefreshKey, setLineageRefreshKey] = useState(0);
  const [forecastDetailMap, setForecastDetailMap] = useState<Record<string, ForecastSignalDetail>>({});
  const prevCaseRef = useRef(activeQuestion?.caseId);
  useEffect(() => {
    if (activeQuestion?.caseId !== prevCaseRef.current) {
      setSignalLineageMap({});
      setForecastDetailMap({});
      setShowReadyBanner(false);
      prevCaseRef.current = activeQuestion?.caseId;
    }
  }, [activeQuestion?.caseId]);

  useEffect(() => {
    const caseId = activeQuestion?.caseId;
    if (!caseId) return;
    const controller = new AbortController();
    const API = import.meta.env.VITE_API_URL || "";
    fetch(`${API}/api/cases/${encodeURIComponent(caseId)}/forecast`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.signalDetails) return;
        const map: Record<string, ForecastSignalDetail> = {};
        for (const d of data.signalDetails) {
          const detail: ForecastSignalDetail = {
            likelihoodRatio: d.likelihoodRatio,
            effectiveLikelihoodRatio: d.effectiveLikelihoodRatio,
            correlationGroup: d.correlationGroup,
            correlationDampened: d.correlationDampened,
            dependencyRole: d.dependencyRole,
            rawLikelihoodRatio: d.rawLikelihoodRatio,
            pointContribution: d.pointContribution,
          };
          map[d.signalId] = detail;
          if (d.description) {
            map[`desc:${d.description.slice(0, 80)}`] = detail;
          }
        }
        setForecastDetailMap(map);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [activeQuestion?.caseId, lineageRefreshKey]);

  const handleDependencyData = useCallback((_data: any, lineageMap: Record<string, SignalLineageInfo>) => {
    setSignalLineageMap(lineageMap);
  }, []);

  const getForecastDetail = useCallback((sig: Signal): ForecastSignalDetail | undefined => {
    return forecastDetailMap[`SIG-${sig.id}`] || forecastDetailMap[`desc:${sig.text.slice(0, 80)}`];
  }, [forecastDetailMap]);

  const handleLineageUpdated = useCallback(() => {
    setSignalLineageMap({});
    setLineageRefreshKey(k => k + 1);
  }, []);

  const [newText, setNewText] = useState("");
  const [newDirection, setNewDirection] = useState<Direction>("increases_probability");
  const [newStrength, setNewStrength] = useState<Strength>("Medium");
  const [newReliability, setNewReliability] = useState<Reliability>("Probable");

  const CATEGORY_TO_SIGNAL_TYPE: Record<Category, string> = {
    evidence: "Phase III clinical",
    access: "Access / commercial",
    competition: "Competitor counteraction",
    guideline: "Guideline inclusion",
    timing: "Operational friction",
    adoption: "Market adoption / utilization",
  };

  const STRENGTH_TO_SCORE: Record<Strength, number> = { High: 4, Medium: 3, Low: 2 };
  const RELIABILITY_TO_SCORE: Record<Reliability, number> = { Confirmed: 5, Probable: 3, Speculative: 2 };

  function detectConflicts(sigs: Signal[]): Signal[] {
    const PRIORITY_RANK: Record<string, number> = {
      manual_confirmed: 4,
      observed_verified: 3,
      ai_derived: 2,
      ai_uncertainty: 1,
    };

    const updated = sigs.map(s => ({
      ...s,
      conflict_with: undefined as string | undefined,
      superseded_by: undefined as string | undefined,
      superseded: false,
    }));

    const accepted = updated.filter(s => s.accepted && !s.superseded);
    const gateGroups: Record<string, typeof updated> = {};
    for (const s of accepted) {
      const cat = s.category;
      if (!gateGroups[cat]) gateGroups[cat] = [];
      gateGroups[cat].push(s);
    }

    const CONTRADICTION_PAIRS: Array<[RegExp, RegExp]> = [
      [/prior\s*auth(orization)?\s*(not|no longer|no)\s*(needed|required)/i, /prior\s*auth(orization)?\s*(required|needed|barrier)/i],
      [/formulary\s*(included|added|approved|listed)/i, /formulary\s*(excluded|removed|denied|not\s+covered)/i],
      [/payer\s*(approved|favorable|included|no\s+barrier)/i, /payer\s*(friction|barrier|denied|restricted)/i],
      [/reimbursement\s*(resolved|approved|favorable)/i, /reimbursement\s*(denied|barrier|restricted|challenging)/i],
      [/access\s*(approved|granted|expanded|open)/i, /access\s*(restricted|denied|limited|barrier)/i],
    ];

    function areContradictory(a: string, b: string): boolean {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      for (const [patternA, patternB] of CONTRADICTION_PAIRS) {
        if ((patternA.test(aLower) && patternB.test(bLower)) ||
            (patternB.test(aLower) && patternA.test(bLower))) {
          return true;
        }
      }
      return false;
    }

    function signalScore(s: Signal): number {
      const rank = PRIORITY_RANK[s.priority_source || "ai_derived"] || 2;
      const idNum = parseInt(s.id.replace(/\D/g, ""), 10) || 0;
      return rank * 10000 + idNum;
    }

    for (const cat of Object.keys(gateGroups)) {
      const group = gateGroups[cat];
      if (group.length < 2) continue;

      const positives = group.filter(s => isPositiveDirection(s.direction));
      const negatives = group.filter(s => isNegativeDirection(s.direction));

      if (positives.length > 0 && negatives.length > 0) {
        for (const pos of positives) {
          const posIdx = updated.findIndex(s => s.id === pos.id);
          for (const neg of negatives) {
            const negIdx = updated.findIndex(s => s.id === neg.id);
            if (posIdx < 0 || negIdx < 0) continue;
            if (updated[posIdx].superseded || updated[negIdx].superseded) continue;

            const isDirectContradiction = areContradictory(pos.text, neg.text);
            const posScore = signalScore(pos);
            const negScore = signalScore(neg);

            if (isDirectContradiction) {
              if (posScore >= negScore) {
                updated[negIdx].superseded = true;
                updated[negIdx].superseded_by = pos.id;
                updated[posIdx].conflict_with = neg.id;
              } else {
                updated[posIdx].superseded = true;
                updated[posIdx].superseded_by = neg.id;
                updated[negIdx].conflict_with = pos.id;
              }
            } else {
              updated[posIdx].conflict_with = neg.id;
              updated[negIdx].conflict_with = pos.id;
            }
          }
        }
      }
    }

    return updated;
  }

  function persistSignalToDb(signal: Signal): Promise<void> {
    const caseId = activeQuestion?.caseId;
    if (!caseId) return Promise.resolve();

    const API = import.meta.env.VITE_API_URL || "";
    const dbDirection = isNegativeDirection(signal.direction) ? "Negative" : (signal.direction === "neutral" || signal.direction === "signals_uncertainty") ? "Neutral" : "Positive";

    return fetch(`${API}/api/cases/${caseId}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signalId: `SIG-${signal.id}`,
        signalDescription: signal.text,
        signalType: CATEGORY_TO_SIGNAL_TYPE[signal.category] || "Field intelligence",
        direction: dbDirection,
        strengthScore: STRENGTH_TO_SCORE[signal.strength] || 3,
        reliabilityScore: RELIABILITY_TO_SCORE[signal.reliability] || 3,
        scope: "national",
        timing: "current",
        status: "active",
        sourceLabel: signal.source === "user" ? "User input" : "CIOS research",
        sourceUrl: signal.source_url || "https://cios.internal/user-reported",
        evidenceSnippet: signal.text,
        signalScope: "market",
        observedAt: signal.observed_date || new Date().toISOString(),
        createdByType: "human",
        brand: subject || "",
        dependencyRole: "Root",
        rootEvidenceId: `SIG-${signal.id}`,
        novelInformationFlag: "Yes",
      }),
    }).then(async (resp) => {
      if (resp && resp.ok) {
        const data = await resp.json();
        const updates: Partial<Signal> = {};
        if (data.evidenceStatus) updates.evidenceStatus = data.evidenceStatus;
        if (data.evidenceClass) updates.evidenceClass = data.evidenceClass;
        if (typeof data.countTowardPosterior === "boolean") updates.countTowardPosterior = data.countTowardPosterior;
        if (data._classification) {
          updates.evidenceClass = data._classification.evidenceClass;
          updates.countTowardPosterior = data._classification.countTowardPosterior;
        }
        if (Object.keys(updates).length > 0) {
          setSignals((prev) => prev.map((s) =>
            s.id === signal.id ? { ...s, ...updates } : s
          ));
        }
      }
    }).catch(() => {});
  }

  const triggerGateRecalculation = useCallback((updatedSignals: Signal[], triggerSignalText?: string) => {
    if (!baseGates || baseGates.length === 0) return;
    const caseKey = activeQuestion?.caseId || "unknown";

    const acceptedInputs = updatedSignals
      .filter(s => s.accepted && !s.superseded)
      .map(s => ({
        id: s.id,
        text: s.text,
        direction: s.direction,
        strength: s.strength,
        reliability: s.reliability,
        category: s.category,
        signal_family: s.signal_family,
        accepted: true,
        priority_source: s.priority_source,
        is_locked: s.is_locked,
      }));

    const outcomeThresholdStr = activeQuestion?.threshold || null;
    const result = recalculateGatesFromSignals(baseGates, acceptedInputs, brandOutlook, outcomeThresholdStr);
    setRecalcResult(result);
    setEventGates(result.updated_gates);

    const enforcedCap = result.new_forecast / 100;
    const updatedDecomp: EventDecomposition = {
      event_gates: result.updated_gates,
      brand_outlook_probability: brandOutlook,
      constrained_probability: enforcedCap,
      constraint_explanation: "Recalculated from signal evidence",
    };
    localStorage.setItem(`cios.eventDecomposition:${caseKey}`, JSON.stringify(updatedDecomp));

    if (triggerSignalText) {
      const triggerDiag = result.diagnostics.find(d => d.signal_text === triggerSignalText);
      const gateImpact = triggerDiag
        ? result.gate_impacts.find(gi => gi.gate_id === triggerDiag.gate_affected) || null
        : null;
      setLastImpact({
        signalText: triggerSignalText,
        gateImpact,
        forecastBefore: result.previous_forecast,
        forecastAfter: result.new_forecast,
      });
      setTimeout(() => setLastImpact(null), 8000);
    }
  }, [baseGates, brandOutlook, activeQuestion]);

  function acceptSignal(id: string) {
    setSignals((prev) => {
      const signal = prev.find((s) => s.id === id);
      if (signal && !signal.accepted) {
        persistSignalToDb(signal);
        const updated = prev.map((s) => (s.id === id ? { ...s, accepted: true } : s));
        persistSignals(updated);
        setTimeout(() => triggerGateRecalculation(updated, signal.text), 0);
        return updated;
      }
      const updated = prev.map((s) => (s.id === id ? { ...s, accepted: true } : s));
      persistSignals(updated);
      return updated;
    });
  }

  function dismissSignal(id: string) {
    setSignals((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      persistSignals(updated);
      setTimeout(() => triggerGateRecalculation(updated), 0);
      return updated;
    });
  }

  function updateSignal(id: string, updates: Partial<Signal>) {
    const isEditingThis = editingId === id;
    setSignals((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const merged = { ...s, ...updates };
      if (!isEditingThis) {
        return { ...merged, impact: computeImpact(merged) };
      }
      return merged;
    }));
  }

  function commitEdit(id: string) {
    setSignals((prev) => {
      const original = prev.find(s => s.id === id);
      const updated = prev.map((s) => {
        if (s.id !== id) return s;
        const withImpact = { ...s, impact: computeImpact(s) };
        return enrichSignalFields(withImpact, questionText, outcome);
      });
      const editedSignal = updated.find(s => s.id === id);
      if (editedSignal?.accepted) {
        setTimeout(() => triggerGateRecalculation(updated, editedSignal.text), 0);
      }
      persistSignals(updated);

      if (original && editedSignal && original.accepted) {
        const textChanged = original.text !== editedSignal.text;
        const directionChanged = original.direction !== editedSignal.direction;
        const strengthChanged = original.strength !== editedSignal.strength;
        if (textChanged || directionChanged || strengthChanged) {
          const cid = activeQuestion?.caseId;
          if (cid) {
            localStorage.setItem(`cios.signalsLocked:${cid}`, "false");
          }
        }
      }

      return updated;
    });
    setEditingId(null);
  }

  function addCustomSignal() {
    if (!newText.trim()) return;
    const trimmed = newText.trim().toLowerCase();
    const isDuplicate = signals.some(
      (s) => s.text.toLowerCase() === trimmed
    );
    if (isDuplicate) {
      alert("This signal already exists. Each signal can only be added once.");
      return;
    }
    const base = { strength: newStrength, reliability: newReliability };
    const autoCategory = inferCategory(newText.trim());
    const sig: Signal = enrichSignalFields({
      id: `user-${Date.now()}`,
      text: newText.trim(),
      caveat: "",
      direction: newDirection,
      strength: newStrength,
      reliability: newReliability,
      impact: computeImpact(base),
      category: autoCategory,
      source: "user",
      accepted: true,
      priority_source: "manual_confirmed",
      is_locked: true,
    }, questionText, outcome);
    setSignals((prev) => {
      const updated = [...prev, sig];
      persistSignals(updated);
      setTimeout(() => triggerGateRecalculation(updated, sig.text), 0);
      return updated;
    });
    persistSignalToDb(sig);
    const cid = activeQuestion?.caseId;
    if (cid) {
      localStorage.setItem(`cios.signalsLocked:${cid}`, "false");
    }
    setNewText("");
    setNewDirection("positive");
    setNewStrength("Medium");
    setNewReliability("Probable");
    setShowAddForm(false);
  }

  function handleImportedRows(rows: ImportedRow[]) {
    const newSignals: Signal[] = rows.map((row, i) => {
      const dir = row.direction || "neutral";
      const str = row.strength || "Medium";
      const rel = row.reliability || "Probable";
      const base = { strength: str as Strength, reliability: rel as Reliability };
      const cat = (row.category as Category) || inferCategory(row.text);
      return enrichSignalFields({
        id: `import-${Date.now()}-${i}`,
        text: row.text,
        caveat: "",
        direction: dir as Direction,
        strength: str as Strength,
        reliability: rel as Reliability,
        impact: computeImpact(base),
        category: cat,
        source: "user" as const,
        accepted: true,
        priority_source: "manual_confirmed" as const,
        is_locked: true,
        source_url: row.source_url,
        signal_source: row.signal_source,
      }, questionText, outcome);
    });

    const seen = new Set<string>();
    const intraDeduped = newSignals.filter((s) => {
      const key = s.text.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setSignals((prev) => {
      const existing = new Set(prev.map((s) => s.text.toLowerCase().trim()));
      const deduped = intraDeduped.filter((s) => !existing.has(s.text.toLowerCase().trim()));
      const updated = [...prev, ...deduped];
      persistSignals(updated);
      if (deduped.length > 0) {
        setTimeout(() => triggerGateRecalculation(updated, `Imported ${deduped.length} signals`), 0);
      }
      deduped.forEach((sig) => persistSignalToDb(sig));
      return updated;
    });
  }

  function convertEvent(ev: IncomingEvent) {
    const evText = `${ev.title}: ${ev.description}`;
    const isDuplicate = signals.some(
      (s) => s.text.toLowerCase() === evText.toLowerCase()
    );
    if (isDuplicate) {
      alert("This signal already exists. Each signal can only be added once.");
      return;
    }
    const sig: Signal = enrichSignalFields({
      id: `ev-conv-${Date.now()}`,
      text: evText,
      caveat: "",
      direction: "neutral",
      strength: "Medium",
      reliability: "Speculative",
      impact: "Low",
      category: ev.type as Category,
      source: "user",
      accepted: true,
      priority_source: "observed_verified",
      is_locked: true,
    }, questionText, outcome);
    setSignals((prev) => {
      const updated = [...prev, sig];
      persistSignals(updated);
      setTimeout(() => triggerGateRecalculation(updated, sig.text), 0);
      return updated;
    });
    persistSignalToDb(sig);
  }

  const allSignals = useMemo(() => detectConflicts(signals), [signals]);
  const competitiveCoverageRatio = useMemo(() => computeCompetitiveCoverageRatio(allSignals.filter(s => !s.superseded)), [allSignals]);
  const primaryDrivers = allSignals.filter((s) => s.impact === "High");
  const supportingSignals = allSignals.filter((s) => s.impact !== "High");

  const primaryDriverId = useMemo(() => {
    const accepted = allSignals.filter((s) => s.accepted && !s.superseded);
    if (accepted.length === 0) return null;
    const impactRank: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
    const reliabilityRank: Record<string, number> = { Confirmed: 3, Probable: 2, Speculative: 1 };
    const strengthRank: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
    const sorted = [...accepted].sort((a, b) => {
      const aScore = (impactRank[a.impact] || 0) * 9 + (reliabilityRank[a.reliability] || 0) * 3 + (strengthRank[a.strength] || 0);
      const bScore = (impactRank[b.impact] || 0) * 9 + (reliabilityRank[b.reliability] || 0) * 3 + (strengthRank[b.strength] || 0);
      return bScore - aScore;
    });
    return sorted[0]?.id || null;
  }, [allSignals]);
  const pending = allSignals.filter((s) => !s.accepted);
  const accepted = allSignals.filter((s) => s.accepted);

  const isAdoptionQuestion = useMemo(() => {
    if (adoptionCoverage) return true;
    const qt = (questionText || "").toLowerCase();
    const adoptionKeywords = ["adoption", "adopt", "prescrib", "uptake", "first-line", "second-line", "practice change", "guideline", "standard of care"];
    return adoptionKeywords.some((kw) => qt.includes(kw));
  }, [adoptionCoverage, questionText]);

  const liveAdoptionCoverage = useMemo(() => {
    if (!isAdoptionQuestion) return null;
    return recomputeAdoptionCoverage(allSignals);
  }, [isAdoptionQuestion, allSignals]);

  const liveSufficiencyWarning = useMemo(() => {
    return liveAdoptionCoverage?.sufficiency_warning || null;
  }, [liveAdoptionCoverage]);

  const liveSignalSummary = useMemo(() => {
    return liveAdoptionCoverage?.summary || null;
  }, [liveAdoptionCoverage]);

  const summary = generateSummary(allSignals, questionType, comparisonGroups.length >= 2 ? comparisonGroups : entities, liveSignalSummary);

  const hasSourceClassification = allSignals.some((s) => s.signal_source);
  const internalSignals = allSignals.filter((s) => s.signal_source === "internal");
  const externalSignals = allSignals.filter((s) => s.signal_source === "external");
  const missingSignals = allSignals.filter((s) => s.signal_source === "missing");
  const unclassifiedSignals = allSignals.filter((s) => !s.signal_source);
  const unclassifiedAccepted = unclassifiedSignals.filter((s) => s.accepted);
  const unclassifiedPending = unclassifiedSignals.filter((s) => !s.accepted);

  const coverageByFamily = useMemo(() => {
    const counts: Record<SignalFamily, number> = {
      brand_clinical_regulatory: 0,
      payer_access: 0,
      competitor: 0,
      patient_demand: 0,
      provider_behavioral: 0,
      system_operational: 0,
    };
    allSignals.forEach((s) => {
      if (s.signal_family && counts[s.signal_family] !== undefined) {
        counts[s.signal_family]++;
      }
    });
    return counts;
  }, [allSignals]);

  const missingFamilies = useMemo(() => {
    return ALL_SIGNAL_FAMILIES.filter((f) => coverageByFamily[f] === 0);
  }, [coverageByFamily]);

  const coveredFamilies = useMemo(() => {
    return ALL_SIGNAL_FAMILIES.filter((f) => coverageByFamily[f] > 0);
  }, [coverageByFamily]);

  useEffect(() => {
    const confirmedDrivers = primaryDrivers.filter((s) => s.accepted).length;
    const confirmedSupporting = supportingSignals.filter((s) => s.accepted).length;
    const hasDirection = allSignals.some((s) => s.accepted && s.direction !== "neutral");
    const readiness = {
      confirmedDrivers,
      confirmedSupporting,
      totalConfirmed: confirmedDrivers + confirmedSupporting,
      hasDirection,
      questionType: questionType || "binary",
      comparisonGroups: comparisonGroups,
      entities: entities,
      updatedAt: Date.now(),
      coveredFamilies: coveredFamilies.length,
      totalFamilies: ALL_SIGNAL_FAMILIES.length,
      missingFamilies: missingFamilies.map((f) => SIGNAL_FAMILY_LABELS[f]),
    };
    const caseKey = activeQuestion?.caseId || "unknown";
    localStorage.setItem(`cios.signalReadiness:${caseKey}`, JSON.stringify(readiness));
  }, [allSignals, primaryDrivers, supportingSignals, questionType, entities, coveredFamilies, missingFamilies]);


  return (
    <WorkflowLayout
      currentStep="signals"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate activeQuestion={activeQuestion}>
        <section className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Step 3
            </div>
            <div className="mt-2 flex items-start justify-between gap-4">
              <h1 className="text-2xl font-semibold text-foreground">
                What new information do we have?
              </h1>
              <p className="text-xs text-muted-foreground text-right max-w-sm shrink-0 leading-relaxed pt-1">
                Accept, modify, or delete each signal before you go to the next step. You can also add your own signals or ask the engine to search for them.
              </p>
            </div>
          </div>

          {activeQuestion?.caseId && (
            <SavedQuestionsPanel caseId={activeQuestion.caseId} />
          )}

          {showActivityPanel && processingPhase && processingPhase !== "ready" && (
            <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-500/[0.06] to-[#0A1736] p-6" data-testid="signal-search-activity">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">Finding evidence...</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Searching sources, collecting signals, and validating relevance</div>
                </div>
                {processingCounts.found > 0 && (
                  <span className="text-xs text-blue-400 font-medium">{processingCounts.found} found</span>
                )}
              </div>
            </div>
          )}

          {isComparative && (
            <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 via-card to-card p-4">
              <div className="flex items-center gap-3">
                <GitCompareArrows className="w-5 h-5 text-violet-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider mb-1">Scenario Comparison</div>
                  <div className="text-sm font-medium text-foreground">
                    {comparisonGroups.map((g, i) => (
                      <span key={g}>
                        {i > 0 && <span className="text-muted-foreground mx-1.5">vs</span>}
                        <span className="text-violet-300">{g}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!aiLoading && !showActivityPanel && !showReadyBanner && allSignals.length === 0 && (
            <button
              type="button"
              onClick={() => runSignalSearch()}
              disabled={aiLoading || showActivityPanel}
              className="w-full rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5 text-left transition hover:border-primary/50 hover:from-primary/15 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/15 p-3 group-hover:bg-primary/25 transition">
                  <Search className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-semibold text-foreground">Find Evidence</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Automatically search, collect, normalize, and validate signals from authoritative sources</div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition" />
              </div>
            </button>
          )}

          {(showReadyBanner || (!aiLoading && !showActivityPanel && allSignals.length > 0)) && (
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-card p-5 transition-all duration-500">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/20 p-1.5">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-emerald-300">Signals ready for review</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Accept or reject each signal below</div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Found: <span className="text-foreground font-medium">{allSignals.length}</span></span>
                  <span>Accepted: <span className="text-foreground font-medium">{allSignals.filter(s => s.accepted).length}</span></span>
                </div>
                <button
                  type="button"
                  onClick={() => runSignalSearch()}
                  disabled={aiLoading || showActivityPanel}
                  className="ml-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition disabled:opacity-50"
                >
                  Re-harvest
                </button>
              </div>
            </div>
          )}

          {aiError && (
            <div className="rounded-xl border border-border px-4 py-3 text-xs text-muted-foreground">
              {aiError}
            </div>
          )}

          {!aiLoading && hasSourceClassification && (
            <>
              {(() => {
                const topDriver = allSignals
                  .filter((s) => s.accepted && s.impact === "High")
                  .sort((a, b) => {
                    const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
                    return (order[a.strength] ?? 1) - (order[b.strength] ?? 1);
                  })[0];
                return topDriver ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Primary Driver</span>
                      <p className="text-sm font-medium text-foreground mt-0.5">{topDriver.text}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 uppercase">
                      {isPositiveDirection(topDriver.direction) ? "Supporting" : isNegativeDirection(topDriver.direction) ? "Opposing" : "Neutral"}
                    </span>
                  </div>
                ) : null;
              })()}

              {(() => {
                const rootGroups: Record<string, { texts: string[]; compressions: number[] }> = {};
                const allSigs = [...internalSignals, ...externalSignals, ...missingSignals].filter(s => s.accepted && !s.superseded);
                for (const s of allSigs) {
                  const lin = signalLineageMap[`SIG-${s.id}`];
                  if (lin?.rootEvidenceId) {
                    if (!rootGroups[lin.rootEvidenceId]) rootGroups[lin.rootEvidenceId] = { texts: [], compressions: [] };
                    rootGroups[lin.rootEvidenceId].texts.push(s.text.slice(0, 60));
                    rootGroups[lin.rootEvidenceId].compressions.push(lin.compressionFactor);
                  }
                }
                const shared = Object.entries(rootGroups).filter(([, v]) => v.texts.length > 1);
                if (shared.length === 0) return null;
                return (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Shared Root Evidence Detected
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {shared.length} root event{shared.length > 1 ? "s" : ""} each drive multiple signals. These signals may be counted redundantly — consider editing lineage or consolidating.
                    </div>
                    <div className="space-y-1">
                      {shared.map(([rootId, group]) => {
                        const compressed = group.compressions.filter(c => c < 1);
                        const minC = compressed.length > 0 ? Math.min(...compressed) : 1;
                        const maxC = compressed.length > 0 ? Math.max(...compressed) : 1;
                        return (
                          <div key={rootId} className="text-[10px] text-foreground/70">
                            <span className="font-mono text-amber-400/70">{rootId}</span>
                            <span className="text-muted-foreground"> — {group.texts.length} signals</span>
                            {compressed.length > 0 && (
                              <span className="text-amber-400/60 ml-1">
                                ({compressed.length} compressed: {minC === maxC ? `×${minC.toFixed(2)}` : `×${minC.toFixed(2)}–${maxC.toFixed(2)}`} weight)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <h2 className="text-sm font-bold text-foreground">Primary Signals</h2>
                  <span className="text-xs text-muted-foreground">Internal controllable drivers</span>
                </div>
                {internalSignals.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    No internal signals detected. Add your own or import data.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {internalSignals.map((sig) => (
                      <MinimalSignalCard
                        key={sig.id}
                        signal={sig}
                        editing={editingId === sig.id}
                        onEdit={() => { if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); } }}
                        onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                        onDismiss={() => dismissSignal(sig.id)}
                        onUpdate={(u) => updateSignal(sig.id, u)}
                        outcomeLabel={outcome || "outcome"}
                        onShowProvenance={() => setProvenanceSignal(sig)}
                        isPrimaryDriver={sig.id === primaryDriverId}
                        lineage={signalLineageMap[`SIG-${sig.id}`]}
                        forecastDetail={getForecastDetail(sig)}
                        caseId={activeQuestion?.caseId}
                        onLineageUpdated={handleLineageUpdated}
                      />
                    ))}
                  </div>
                )}
              </div>

              {externalSignals.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <h2 className="text-sm font-bold text-foreground">External Signals</h2>
                    <span className="text-xs text-muted-foreground">Environment changes outside your control</span>
                  </div>
                  <div className="space-y-3">
                    {externalSignals.map((sig) => (
                      <MinimalSignalCard
                        key={sig.id}
                        signal={sig}
                        editing={editingId === sig.id}
                        onEdit={() => { if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); } }}
                        onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                        onDismiss={() => dismissSignal(sig.id)}
                        onUpdate={(u) => updateSignal(sig.id, u)}
                        outcomeLabel={outcome || "outcome"}
                        onShowProvenance={() => setProvenanceSignal(sig)}
                        isPrimaryDriver={sig.id === primaryDriverId}
                        lineage={signalLineageMap[`SIG-${sig.id}`]}
                        forecastDetail={getForecastDetail(sig)}
                        caseId={activeQuestion?.caseId}
                        onLineageUpdated={handleLineageUpdated}
                      />
                    ))}
                  </div>
                </div>
              )}

              {missingSignals.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <h2 className="text-sm font-bold text-foreground">Missing Signals</h2>
                    <span className="text-xs text-muted-foreground">Unknowns that determine risk</span>
                  </div>
                  <div className="space-y-3">
                    {missingSignals.map((sig) => (
                      <MinimalSignalCard
                        key={sig.id}
                        signal={sig}
                        editing={editingId === sig.id}
                        onEdit={() => { if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); } }}
                        onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                        onDismiss={() => dismissSignal(sig.id)}
                        onUpdate={(u) => updateSignal(sig.id, u)}
                        outcomeLabel={outcome || "outcome"}
                        onShowProvenance={() => setProvenanceSignal(sig)}
                        isPrimaryDriver={sig.id === primaryDriverId}
                        lineage={signalLineageMap[`SIG-${sig.id}`]}
                        forecastDetail={getForecastDetail(sig)}
                        caseId={activeQuestion?.caseId}
                        onLineageUpdated={handleLineageUpdated}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!aiLoading && !hasSourceClassification && (
            <>
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-foreground">Primary Signals</h2>
                {unclassifiedAccepted.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    No confirmed signals yet. Review the suggestions below or add your own.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unclassifiedAccepted.map((sig) => (
                      <MinimalSignalCard
                        key={sig.id}
                        signal={sig}
                        editing={editingId === sig.id}
                        onEdit={() => { if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); } }}
                        onDismiss={() => dismissSignal(sig.id)}
                        onUpdate={(u) => updateSignal(sig.id, u)}
                        outcomeLabel={outcome || "outcome"}
                        onShowProvenance={() => setProvenanceSignal(sig)}
                        isPrimaryDriver={sig.id === primaryDriverId}
                        lineage={signalLineageMap[`SIG-${sig.id}`]}
                        forecastDetail={getForecastDetail(sig)}
                        caseId={activeQuestion?.caseId}
                        onLineageUpdated={handleLineageUpdated}
                      />
                    ))}
                  </div>
                )}
              </div>

              {unclassifiedPending.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-foreground">Suggested Signals From CIOS</h2>
                  <div className="space-y-3">
                    {unclassifiedPending.map((sig) => (
                      <MinimalSignalCard
                        key={sig.id}
                        signal={sig}
                        editing={editingId === sig.id}
                        onEdit={() => { if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); } }}
                        onAccept={() => acceptSignal(sig.id)}
                        onDismiss={() => dismissSignal(sig.id)}
                        onUpdate={(u) => updateSignal(sig.id, u)}
                        outcomeLabel={outcome || "outcome"}
                        onShowProvenance={() => setProvenanceSignal(sig)}
                        lineage={signalLineageMap[`SIG-${sig.id}`]}
                        forecastDetail={getForecastDetail(sig)}
                        caseId={activeQuestion?.caseId}
                        onLineageUpdated={handleLineageUpdated}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!aiLoading && hasSourceClassification && unclassifiedSignals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <h2 className="text-sm font-bold text-foreground">Other Signals</h2>
                <span className="text-xs text-muted-foreground">Manually added or previously imported</span>
              </div>
              <div className="space-y-3">
                {unclassifiedSignals.map((sig) => (
                  <MinimalSignalCard
                    key={sig.id}
                    signal={sig}
                    editing={editingId === sig.id}
                    onEdit={() => { if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); } }}
                    onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                    onDismiss={() => dismissSignal(sig.id)}
                    onUpdate={(u) => updateSignal(sig.id, u)}
                    outcomeLabel={outcome || "outcome"}
                    onShowProvenance={() => setProvenanceSignal(sig)}
                    isPrimaryDriver={sig.id === primaryDriverId}
                    lineage={signalLineageMap[`SIG-${sig.id}`]}
                        forecastDetail={getForecastDetail(sig)}
                    caseId={activeQuestion?.caseId}
                    onLineageUpdated={handleLineageUpdated}
                  />
                ))}
              </div>
            </div>
          )}

          {lastImpact && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground animate-in fade-in duration-300">
              <span className="text-muted-foreground">Signal confirmed.</span>
              {lastImpact.forecastBefore !== lastImpact.forecastAfter ? (
                <span> Outlook shifted from {lastImpact.forecastBefore}% to {lastImpact.forecastAfter}%.</span>
              ) : (
                <span> Outlook unchanged at {lastImpact.forecastBefore}%.</span>
              )}
            </div>
          )}

          {!showAddForm ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="flex-1 flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition justify-center"
              >
                <Plus className="w-4 h-4" />
                Add Signal
              </button>
              <button
                type="button"
                onClick={() => setShowImportDialog(true)}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition"
              >
                <Upload className="w-4 h-4" />
                Import Data
              </button>
              <button
                type="button"
                onClick={() => {
                  runSignalSearch();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={aiLoading || showActivityPanel}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Search className="w-4 h-4" />
                Re-harvest
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Add Signal</h3>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Describe the signal..."
                rows={2}
                className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50"
              />
              <div className="grid grid-cols-3 gap-3">
                <SelectField label="Direction" value={newDirection} onChange={(v) => setNewDirection(v as Direction)} options={["increases_probability", "decreases_probability", "signals_uncertainty", "signals_risk_escalation", "operational_readiness", "market_response"]} displayLabels={["Supports outcome", "Slows outcome", "Uncertain", "Risk Escalation", "Operational", "Market Response"]} />
                <SelectField label="Strength" value={newStrength} onChange={(v) => setNewStrength(v as Strength)} options={["High", "Medium", "Low"]} />
                <SelectField label="Confidence" value={newReliability} onChange={(v) => setNewReliability(v as Reliability)} options={["Confirmed", "Probable", "Speculative"]} displayLabels={["Strong", "Moderate", "Weak"]} />
              </div>
              <button
                type="button"
                onClick={addCustomSignal}
                disabled={!newText.trim()}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add Signal
              </button>
            </div>
          )}

          {!aiLoading && allSignals.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-foreground leading-relaxed">{summary}</div>
            </div>
          )}

          {!aiLoading && allSignals.length > 0 && (
            <SignalMapPanel
              signals={allSignals.map((s) => ({
                id: s.id,
                text: s.text,
                mechanism_group: s.mechanism_group,
                driver_role: s.driver_role,
                accepted: s.accepted,
              }))}
            />
          )}

          {!aiLoading && allSignals.length > 0 && (
            <DriverCoveragePanel
              signals={allSignals.map((s) => ({ id: s.id, text: s.text, accepted: s.accepted, countTowardPosterior: s.countTowardPosterior }))}
              adoptionCoverage={liveAdoptionCoverage}
              searchLoading={aiLoading || showActivityPanel}
              onSearchMissing={(missingLabels) => {
                runSignalSearch(missingLabels);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}

          {!aiLoading && competitiveCoverageRatio && (
            <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-violet-500/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-foreground">Derived Metric</h3>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-indigo-300">{competitiveCoverageRatio.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{competitiveCoverageRatio.definition}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold tabular-nums ${
                    (competitiveCoverageRatio.value || 0) > 1.5 ? "text-red-400" :
                    (competitiveCoverageRatio.value || 0) > 1.0 ? "text-amber-400" :
                    (competitiveCoverageRatio.value || 0) > 0.5 ? "text-yellow-400" :
                    "text-emerald-400"
                  }`}>
                    {competitiveCoverageRatio.value?.toFixed(2)}
                  </span>
                  <div className="text-[9px] text-muted-foreground">
                    {(competitiveCoverageRatio.value || 0) > 1.5 ? (
                      <span className="text-red-400">High competitive pressure</span>
                    ) : (competitiveCoverageRatio.value || 0) > 1.0 ? (
                      <span className="text-amber-400">Elevated risk</span>
                    ) : (competitiveCoverageRatio.value || 0) > 0.5 ? (
                      <span className="text-yellow-400">Moderate exposure</span>
                    ) : (
                      <span className="text-emerald-400">Low competitive pressure</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* Show Advanced View toggle — hidden for demo readiness */}
          <div className="border-t border-border pt-3" style={{ display: "none" }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
            >
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showAdvanced ? "Hide" : "Show"} Advanced View
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4">
              {marketSummary && !aiLoading && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Market Intelligence Summary</div>
                  <div className="text-sm text-foreground leading-relaxed">{marketSummary}</div>
                </div>
              )}

              {brandCheckDone && !aiLoading && (() => {
                const observedSignals = allSignals.filter((s) => s.signal_class === "observed" && s.brand_verified);
                if (observedSignals.length > 0) {
                  return (
                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Latest Verified Brand Developments ({observedSignals.length})</div>
                      {observedSignals.slice(0, 5).map((sig) => (
                        <div key={sig.id} className="text-sm text-foreground leading-snug">
                          {sig.text}
                          {sig.source_url && (
                            <a href={sig.source_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                              <ExternalLink className="w-3 h-3" /> Source
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                } else if (!verifiedFound) {
                  return (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Brand Development Check</div>
                      <div className="text-xs text-muted-foreground">No recent verified brand developments found for {subject}.</div>
                    </div>
                  );
                }
                return null;
              })()}

              {translationSummary && !aiLoading && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Question Relevance Translation</div>
                  <div className="text-sm text-foreground leading-relaxed">{translationSummary}</div>
                </div>
              )}

              {!aiLoading && allSignals.length > 0 && !adoptionCoverage && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Signal Coverage — {coveredFamilies.length}/{ALL_SIGNAL_FAMILIES.length} families
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {ALL_SIGNAL_FAMILIES.map((fam) => {
                      const count = coverageByFamily[fam];
                      return (
                        <div key={fam} className="text-xs text-foreground/80">
                          {SIGNAL_FAMILY_LABELS[fam]}: {count > 0 ? `${count} signal${count > 1 ? "s" : ""}` : "\u2014"}
                        </div>
                      );
                    })}
                  </div>
                  {missingFamilies.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Missing: {missingFamilies.map((f) => SIGNAL_FAMILY_LABELS[f]).join(", ")}
                    </div>
                  )}
                </div>
              )}

              {liveSufficiencyWarning && !aiLoading && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-400">{liveSufficiencyWarning}</div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Incoming Events</div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-5">
                  {incomingEvents.map((ev) => {
                    const EvIcon = ev.icon;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => convertEvent(ev)}
                        className="rounded-lg border border-border p-3 text-left hover:bg-muted/20 transition text-xs"
                      >
                        <div className="font-semibold text-foreground">{ev.title}</div>
                        <div className="mt-1 text-muted-foreground leading-snug">{ev.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {recalcResult && recalcResult.diagnostics.length > 0 && !aiLoading && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Signal Diagnostics — {recalcResult.diagnostics.length} mapped</div>
                  {recalcResult.gate_impacts.filter(gi => gi.signal_count > 0).map((gi) => (
                    <div key={gi.gate_id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{gi.gate_label}</span>
                        <span className="text-muted-foreground">
                          {gi.changed ? `${gi.previous_status} \u2192 ${gi.new_status}` : gi.previous_status}
                        </span>
                      </div>
                      {recalcResult.diagnostics.filter(d => d.gate_affected === gi.gate_id).map((diag) => (
                        <div key={diag.signal_id} className="text-[11px] text-muted-foreground pl-2">
                          {diag.signal_text.length > 100 ? diag.signal_text.slice(0, 100) + "\u2026" : diag.signal_text}
                          <span className={diag.evidence_weight > 0 ? " text-emerald-400" : " text-red-400"}>
                            {" "}{diag.evidence_weight > 0 ? "+" : ""}{diag.evidence_weight.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {recalcResult.previous_forecast !== recalcResult.new_forecast && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Overall forecast: {recalcResult.previous_forecast}% → {recalcResult.new_forecast}%
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <SignalLockBar caseId={activeQuestion?.caseId} signals={signals} onPersistSignal={persistSignalToDb} />
        </section>
      </QuestionGate>
      <DataImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImportedRows}
        activeQuestion={questionText}
      />
      {provenanceSignal && (
        <SignalProvenanceDrawer
          open={true}
          onClose={() => setProvenanceSignal(null)}
          signalLabel={provenanceSignal.text}
          meta={provenanceSignal.workbook_meta}
          provenance={buildProvenance(provenanceSignal)}
          signalDirection={provenanceSignal.direction}
          signalStrength={provenanceSignal.strength}
          signalConfidence={provenanceSignal.reliability}
          signalCategory={provenanceSignal.category}
        />
      )}
    </WorkflowLayout>
  );
}

function MinimalSignalCard({
  signal,
  editing,
  onEdit,
  onAccept,
  onDismiss,
  onUpdate,
  outcomeLabel,
  onShowProvenance,
  isPrimaryDriver,
  lineage,
  forecastDetail,
  caseId,
  onLineageUpdated,
}: {
  signal: Signal;
  editing: boolean;
  onEdit: () => void;
  onAccept?: () => void;
  onDismiss: () => void;
  onUpdate: (u: Partial<Signal>) => void;
  outcomeLabel: string;
  onShowProvenance?: () => void;
  isPrimaryDriver?: boolean;
  lineage?: SignalLineageInfo;
  forecastDetail?: ForecastSignalDetail;
  caseId?: string;
  onLineageUpdated?: () => void;
}) {
  const [editingLineage, setEditingLineage] = useState(false);
  const [lineageForm, setLineageForm] = useState({ dependencyRole: "", rootEvidenceId: "" });

  const LINEAGE_ROLE_COLORS: Record<string, string> = {
    Echo: "bg-slate-700/50 text-slate-400 border-slate-600/30",
    Translation: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Independent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "Independent parallel evidence": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Root: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    "Root Evidence": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    Corroborating: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    Derivative: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Direct derivative": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Second-order derivative": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };

  const DEPENDENCY_ROLES = ["Root", "Direct derivative", "Second-order derivative", "Independent parallel evidence", "Corroborating"];
  const ECHO_TYPES = ["Echo", "Translation", "Independent"];

  const handleOverrideSave = async () => {
    if (!caseId) return;
    const API = import.meta.env.VITE_API_URL || "";
    try {
      await fetch(`${API}/api/cases/${encodeURIComponent(caseId)}/signals/SIG-${signal.id}/lineage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dependencyRole: lineageForm.dependencyRole || undefined,
          rootEvidenceId: lineageForm.rootEvidenceId || undefined,
        }),
      });
      setEditingLineage(false);
      if (onLineageUpdated) onLineageUpdated();
    } catch {}
  };

  return (
    <div className={`rounded-xl border ${isPrimaryDriver ? "border-primary/40 ring-1 ring-primary/20" : signal.workbook_meta ? "border-violet-500/20" : "border-border"} bg-card p-5 ${signal.superseded ? "opacity-40" : ""}`}>
      {isPrimaryDriver && (
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Primary Driver</span>
        </div>
      )}
      {signal.driver_role && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${DRIVER_ROLE_COLORS[signal.driver_role] || "text-slate-400 bg-slate-500/10 border-slate-500/20"}`}>
            {DRIVER_ROLE_LABELS[signal.driver_role] || signal.driver_role}
          </span>
          {signal.causal_aligned === false && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[9px] font-medium text-amber-400">
              <AlertTriangle className="w-2.5 h-2.5" />
              Indirect signal — low decision relevance
            </span>
          )}
        </div>
      )}
      {signal.superseded && (
        <div className="text-xs text-muted-foreground mb-2">Superseded by newer evidence</div>
      )}
      {onShowProvenance && (
        <button
          type="button"
          onClick={onShowProvenance}
          className={`flex items-center gap-1.5 mb-2 text-[10px] transition-colors cursor-pointer ${
            signal.workbook_meta ? "text-violet-400 hover:text-violet-300" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          {signal.workbook_meta ? <FileSpreadsheet className="w-3 h-3" /> : <Info className="w-3 h-3" />}
          <span className="font-semibold uppercase tracking-wider">
            {signal.workbook_meta ? "Workbook" : getSourceLabel(signal)}
          </span>
          {signal.workbook_meta?.programId && (
            <>
              <span className="text-violet-400/50">·</span>
              <span className="text-violet-400/70">{signal.workbook_meta.programId}</span>
            </>
          )}
          <span className="text-[9px] opacity-60 ml-1">Provenance</span>
        </button>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {editing ? (
            <textarea
              value={signal.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground"
            />
          ) : (
            <div className="text-sm font-medium text-foreground leading-relaxed">{signal.text}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit} className={`rounded-lg border p-1.5 transition ${editing ? "border-primary/30 text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/20"}`} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {onAccept && (
            <button type="button" onClick={onAccept} className="rounded-lg border border-emerald-500/30 p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition" title="Confirm">
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" onClick={onDismiss} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition" title="Remove">
            {signal.accepted ? <Trash2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <SelectField label="Direction" value={signal.direction} onChange={(v) => onUpdate({ direction: v as Direction })} options={["increases_probability", "decreases_probability", "signals_uncertainty", "signals_risk_escalation", "operational_readiness", "market_response"]} displayLabels={[`Supports ${outcomeLabel}`, `Slows ${outcomeLabel}`, "Uncertain", "Risk Escalation", "Operational", "Market Response"]} />
            <SelectField label="Strength" value={signal.strength} onChange={(v) => onUpdate({ strength: v as Strength })} options={["High", "Medium", "Low"]} />
            <SelectField label="Confidence" value={signal.reliability} onChange={(v) => onUpdate({ reliability: v as Reliability })} options={["Confirmed", "Probable", "Speculative"]} displayLabels={["Strong", "Moderate", "Weak"]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Driver Role" value={signal.driver_role || "supporting_driver"} onChange={(v) => onUpdate({ driver_role: v as DriverRole })} options={["primary_driver", "supporting_driver", "counterforce", "context_signal", "noise"]} displayLabels={["Primary Driver", "Supporting Driver", "Counterforce", "Context Signal", "Noise"]} />
            <SelectField label="Mechanism" value={signal.mechanism_group || "execution_change"} onChange={(v) => onUpdate({ mechanism_group: v as MechanismGroup })} options={["economic_pressure", "structural_protection", "competitive_threat", "execution_change"]} displayLabels={["Economic Pressure", "Structural Protection", "Competitive Threat", "Execution Change"]} />
          </div>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
              <Ruler className="w-3 h-3" />
              Measurement Criteria
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Baseline Value</label>
                <input type="text" value={signal.measurement_criteria?.baseline_value || ""} onChange={(e) => onUpdate({ measurement_criteria: { ...signal.measurement_criteria, baseline_value: e.target.value } })} placeholder="e.g. 450 reps, 68% coverage" className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1 text-xs text-foreground" />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Observed Change</label>
                <input type="text" value={signal.measurement_criteria?.observed_change || ""} onChange={(e) => onUpdate({ measurement_criteria: { ...signal.measurement_criteria, observed_change: e.target.value } })} placeholder="e.g. +120 reps, -15% coverage" className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1 text-xs text-foreground" />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Geographic Scope</label>
                <input type="text" value={signal.measurement_criteria?.geographic_scope || ""} onChange={(e) => onUpdate({ measurement_criteria: { ...signal.measurement_criteria, geographic_scope: e.target.value } })} placeholder="e.g. US Northeast, EU5" className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1 text-xs text-foreground" />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Time Window</label>
                <input type="text" value={signal.measurement_criteria?.time_window || ""} onChange={(e) => onUpdate({ measurement_criteria: { ...signal.measurement_criteria, time_window: e.target.value } })} placeholder="e.g. Q1 2026, 3–6 months" className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1 text-xs text-foreground" />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Evidence Source</label>
                <input type="text" value={signal.measurement_criteria?.evidence_source || ""} onChange={(e) => onUpdate({ measurement_criteria: { ...signal.measurement_criteria, evidence_source: e.target.value } })} placeholder="e.g. Internal field report, SEC filing" className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1 text-xs text-foreground" />
              </div>
              <SelectField label="Measurement Confidence" value={signal.measurement_criteria?.confidence_level || "Probable"} onChange={(v) => onUpdate({ measurement_criteria: { ...signal.measurement_criteria, confidence_level: v as "Confirmed" | "Probable" | "Speculative" } })} options={["Confirmed", "Probable", "Speculative"]} displayLabels={["Confirmed", "Probable", "Speculative"]} />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {signal.signal_domain && (
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${SIGNAL_DOMAIN_COLORS[signal.signal_domain] || "text-slate-400 bg-slate-400/10 border-slate-400/30"}`}>
              {SIGNAL_DOMAIN_LABELS[signal.signal_domain] || signal.signal_domain}
            </span>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-4">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Direction</div>
              <div className="text-foreground/90">{getDirectionLabel(signal.direction, outcomeLabel)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Importance</div>
              <div className="text-foreground/90">{signal.impact}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</div>
              <div className="text-foreground/90">{getConfidenceLabel(signal.reliability)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Source</div>
              <div className="text-foreground/90">{getSourceLabel(signal)}</div>
            </div>
          </div>
          {signal.measurement_criteria && (signal.measurement_criteria.baseline_value || signal.measurement_criteria.observed_change || signal.measurement_criteria.geographic_scope || signal.measurement_criteria.time_window || signal.measurement_criteria.evidence_source || signal.measurement_criteria.confidence_level) && (
            <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 p-3 mt-2">
              <div className="flex items-center gap-1.5 mb-2">
                <Ruler className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Measurement Criteria</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-3">
                {signal.measurement_criteria.baseline_value && (
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase">Baseline:</span>
                    <span className="ml-1 text-foreground/90">{signal.measurement_criteria.baseline_value}</span>
                  </div>
                )}
                {signal.measurement_criteria.observed_change && (
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase">Change:</span>
                    <span className="ml-1 text-foreground/90">{signal.measurement_criteria.observed_change}</span>
                  </div>
                )}
                {signal.measurement_criteria.geographic_scope && (
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase">Scope:</span>
                    <span className="ml-1 text-foreground/90">{signal.measurement_criteria.geographic_scope}</span>
                  </div>
                )}
                {signal.measurement_criteria.time_window && (
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase">Window:</span>
                    <span className="ml-1 text-foreground/90">{signal.measurement_criteria.time_window}</span>
                  </div>
                )}
                {signal.measurement_criteria.evidence_source && (
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase">Evidence:</span>
                    <span className="ml-1 text-foreground/90">{signal.measurement_criteria.evidence_source}</span>
                  </div>
                )}
                {signal.measurement_criteria.confidence_level && (
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase">Confidence:</span>
                    <span className="ml-1 text-foreground/90">{signal.measurement_criteria.confidence_level}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {signal.triggered_flags && signal.triggered_flags.length > 0 && (
            <div className="mt-2 space-y-1">
              {signal.triggered_flags.map((flag, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5">
                  <Target className="w-3 h-3 text-red-400 shrink-0" />
                  <span className="text-[10px] font-medium text-red-400">{flag}</span>
                </div>
              ))}
            </div>
          )}
          {signal.trigger_rules && signal.trigger_rules.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-500/15 bg-amber-500/5 p-2">
              <div className="flex items-center gap-1.5">
                <Target className="w-2.5 h-2.5 text-amber-400" />
                <span className="text-[9px] text-amber-400 font-semibold uppercase tracking-wider">Active Trigger Rule</span>
              </div>
              <div className="text-[10px] text-amber-400/80 mt-1">{signal.trigger_rules[0].condition}</div>
            </div>
          )}
          {(signal.evidenceClass || signal.evidenceStatus) && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {signal.evidenceClass && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  signal.evidenceClass === "Eligible" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" :
                  signal.evidenceClass === "ContextOnly" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                  signal.evidenceClass === "Rejected" ? "text-red-400 bg-red-500/10 border-red-500/20" :
                  "text-slate-400 bg-slate-500/10 border-slate-500/20"
                }`}>
                  {signal.evidenceClass === "Eligible" ? "◆ Eligible" :
                   signal.evidenceClass === "ContextOnly" ? "◇ Context Only" :
                   signal.evidenceClass === "Rejected" ? "✗ Rejected" :
                   signal.evidenceClass}
                </span>
              )}
              {signal.countTowardPosterior === true && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 uppercase tracking-wider">
                  ✓ Counts Toward Forecast
                </span>
              )}
              {signal.countTowardPosterior === false && signal.evidenceClass !== "Rejected" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/20 bg-slate-500/5 px-2 py-0.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                  Context Only
                </span>
              )}
              {signal.evidenceStatus && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  signal.evidenceStatus === "Verified" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                  signal.evidenceStatus === "Rejected" ? "text-red-400 bg-red-500/10 border-red-500/20" :
                  "text-slate-400 bg-slate-500/10 border-slate-500/20"
                }`}>
                  {signal.evidenceStatus === "Verified" ? "✓ Evidence Verified" :
                   signal.evidenceStatus === "Rejected" ? "✗ Evidence Rejected" :
                   "Evidence Pending"}
                </span>
              )}
            </div>
          )}
          {signal.verificationStatus && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                signal.verificationStatus === "verified" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                signal.verificationStatus === "invalid" ? "text-red-400 bg-red-500/10 border-red-500/20" :
                signal.verificationStatus === "flagged" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                "text-slate-400 bg-slate-500/10 border-slate-500/20"
              }`}>
                {signal.verificationStatus === "verified" ? "✓ Verified" :
                 signal.verificationStatus === "invalid" ? "✗ Invalid ID" :
                 signal.verificationStatus === "flagged" ? "⚠ Flagged" :
                 "Unverified"}
              </span>
              {signal.identifierType && signal.identifierType !== "unknown" && (
                <span className="text-[9px] text-muted-foreground font-mono">
                  {signal.identifierType.toUpperCase()}: {signal.identifierValue}
                </span>
              )}
              {signal.verificationRedFlags && (() => {
                try {
                  const flags = JSON.parse(signal.verificationRedFlags) as string[];
                  return flags.map((f, i) => (
                    <span key={i} className="text-[9px] text-amber-400/80 bg-amber-500/5 rounded px-1.5 py-0.5 border border-amber-500/15">
                      {f}
                    </span>
                  ));
                } catch { return null; }
              })()}
            </div>
          )}
          {lineage && (
            <div className="space-y-1.5 mt-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${LINEAGE_ROLE_COLORS[lineage.echoVsTranslation] || LINEAGE_ROLE_COLORS[lineage.dependencyRole] || "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                  {lineage.echoVsTranslation}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-medium ${LINEAGE_ROLE_COLORS[lineage.dependencyRole] || "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                  {lineage.dependencyRole}
                </span>
                <span className="text-[9px] text-muted-foreground">{lineage.sourceCluster}</span>
                {lineage.compressionFactor < 1 && (
                  <span className="text-[9px] text-amber-400/70" title={`This signal's weight is reduced to ${Math.round(lineage.compressionFactor * 100)}% because it echoes or derives from an upstream signal`}>
                    ×{lineage.compressionFactor.toFixed(2)} weight
                  </span>
                )}
                {lineage.novelInformationFlag === "Yes" && (
                  <span className="text-[9px] text-emerald-400/60 bg-emerald-500/10 rounded-full px-1.5 py-0.5 border border-emerald-500/20">Novel</span>
                )}
                {lineage.novelInformationFlag === "No" && (
                  <span className="text-[9px] text-rose-400/60 bg-rose-500/10 rounded-full px-1.5 py-0.5 border border-rose-500/20">No novel info</span>
                )}
                {lineage.novelInformationFlag === "Partial" && (
                  <span className="text-[9px] text-amber-400/60 bg-amber-500/10 rounded-full px-1.5 py-0.5 border border-amber-500/20">Partial novelty</span>
                )}
                {lineage.lineageOverride && (
                  <span className="text-[9px] text-violet-400/70 bg-violet-500/10 rounded-full px-1.5 py-0.5 border border-violet-500/20">Manual override</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[9px]">
                <span className="text-muted-foreground">Root: <span className="text-foreground/70 font-mono">{lineage.rootEvidenceId}</span></span>
                {caseId && (
                  <button
                    type="button"
                    onClick={() => {
                      setLineageForm({ dependencyRole: lineage.dependencyRole, rootEvidenceId: lineage.rootEvidenceId });
                      setEditingLineage(!editingLineage);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 transition cursor-pointer underline"
                  >
                    {editingLineage ? "Cancel" : "Edit lineage"}
                  </button>
                )}
              </div>
              {editingLineage && (
                <div className="mt-2 p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">Dependency Role</label>
                      <select
                        value={lineageForm.dependencyRole}
                        onChange={(e) => setLineageForm(f => ({ ...f, dependencyRole: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1.5 text-xs text-foreground"
                      >
                        {DEPENDENCY_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">Root Evidence ID</label>
                      <input
                        type="text"
                        value={lineageForm.rootEvidenceId}
                        onChange={(e) => setLineageForm(f => ({ ...f, rootEvidenceId: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1.5 text-xs text-foreground font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingLineage(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1 rounded-lg border border-border transition cursor-pointer">Cancel</button>
                    <button type="button" onClick={handleOverrideSave} className="text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 transition cursor-pointer">Save Override</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Signal Weight section — hidden for demo readiness, kept contribution only */}
          {forecastDetail && (
            <div className="mt-2 rounded-lg border border-slate-500/15 bg-slate-500/5 p-2.5">
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-[11px]">
                <div>
                  <span className="text-[9px] text-muted-foreground uppercase">Contribution</span>
                  <div className={`font-mono ${forecastDetail.pointContribution > 0 ? "text-emerald-400" : forecastDetail.pointContribution < 0 ? "text-red-400" : "text-foreground/90"}`}>
                    {forecastDetail.pointContribution > 0 ? "+" : ""}{(forecastDetail.pointContribution * 100).toFixed(1)}pp
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options, displayLabels }: { label: string; value: string; onChange: (v: string) => void; options: string[]; displayLabels?: string[] }) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1.5 text-xs text-foreground">
        {options.map((o, i) => <option key={o} value={o}>{displayLabels?.[i] || o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
      </select>
    </div>
  );
}
