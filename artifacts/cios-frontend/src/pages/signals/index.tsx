import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
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
  Brain,
  Stethoscope,
  ExternalLink,
  Globe,
  AlertTriangle,
  Lock,
} from "lucide-react";

type Direction = "positive" | "negative" | "neutral";
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
  priority_source?: PrioritySource;
  is_locked?: boolean;
  conflict_with?: string;
  superseded_by?: string;
  superseded?: boolean;
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
  const raw: Omit<Signal, "impact">[] = [];

  if (q.includes("payer") || q.includes("prior auth") || q.includes("coverage") || q.includes("restrict")) {
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
      { id: "sys-th1", text: `Early launch trajectory for ${subjectLabel} tracking above historical comparators`, caveat: "", direction: "positive", strength: "High", reliability: "Probable", category: "adoption", source: "system", accepted: false },
      { id: "sys-th2", text: `Market access barriers may cap penetration below target threshold`, caveat: "", direction: "negative", strength: "Medium", reliability: "Probable", category: "access", source: "system", accepted: false },
      { id: "sys-th3", text: `Favorable guideline positioning supporting rapid initial uptake`, caveat: "", direction: "positive", strength: "High", reliability: "Confirmed", category: "guideline", source: "system", accepted: false },
      { id: "sys-th4", text: `Patient awareness campaigns driving demand-side pull`, caveat: "", direction: "positive", strength: "Medium", reliability: "Speculative", category: "adoption", source: "system", accepted: false },
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
    if (q.includes("launch") || q.includes("segment"))
      raw.push({ id: "sys-9", text: `Launch readiness assessments underway for ${subjectLabel} in priority markets`, caveat: "", direction: "positive", strength: "Medium", reliability: "Confirmed", category: "timing", source: "system", accepted: false });
  }

  return raw.map((s) => ({ ...s, impact: computeImpact(s) }));
}

function generateSuggestions(ctx: QuestionContext): Signal[] {
  if (ctx.questionType === "comparative" && ctx.entities && ctx.entities.length >= 2) {
    return generateComparativeSuggestions(ctx);
  }
  return generateContextualSuggestions(ctx);
}

function generateSummary(signals: Signal[], questionType?: string, entities?: string[]): string {
  const accepted = signals.filter((s) => s.accepted || s.source === "system");
  const positiveHigh = accepted.filter((s) => s.direction === "positive" && s.impact === "High");
  const negativeHigh = accepted.filter((s) => s.direction === "negative" && s.impact === "High");
  const posCount = accepted.filter((s) => s.direction === "positive").length;
  const negCount = accepted.filter((s) => s.direction === "negative").length;

  if (questionType === "comparative" && entities && entities.length >= 2) {
    const groupA = entities[0];
    const groupB = entities[1];
    if (positiveHigh.length > 0 && negativeHigh.length > 0) {
      return `Clinical familiarity and patient mix differences suggest ${groupA} may adopt earlier than ${groupB}, while workflow and economic constraints may slow uptake differently. ${posCount} difference signals favoring divergence vs. ${negCount} converging.`;
    }
    if (positiveHigh.length > 0) {
      return `Strong difference signals suggest ${groupA} and ${groupB} will diverge in adoption. ${posCount} signals point to meaningful group differences.`;
    }
    if (negativeHigh.length > 0) {
      return `Shared constraints may reduce the gap between ${groupA} and ${groupB}. ${negCount} signals suggest convergence.`;
    }
    return `${accepted.length} difference signals registered between ${groupA} and ${groupB}. Confirm or add signals to sharpen the comparison.`;
  }

  if (positiveHigh.length > 0 && negativeHigh.length > 0) {
    const posDriver = positiveHigh[0].category;
    const negDriver = negativeHigh[0].category;
    const posLabel = CATEGORY_CONFIG[posDriver]?.label || posDriver;
    const negLabel = CATEGORY_CONFIG[negDriver]?.label || negDriver;
    return `Strong ${posLabel.toLowerCase()} signal is driving adoption potential, but ${negLabel.toLowerCase()} friction is limiting near-term uptake. ${posCount} positive vs. ${negCount} negative signals registered.`;
  }
  if (positiveHigh.length > 0) {
    return `Strong positive signals favor the forecast. ${posCount} positive vs. ${negCount} negative signals registered.`;
  }
  if (negativeHigh.length > 0) {
    return `High-impact headwinds are constraining the outlook. ${posCount} positive vs. ${negCount} negative signals registered.`;
  }
  return `${accepted.length} signals registered. The balance is moderately uncertain — confirm or add signals to sharpen the forecast.`;
}

function getStepHeading(questionType?: string): string {
  switch (questionType) {
    case "comparative": return "What explains the difference between groups?";
    case "ranking": return "What will make one group lead?";
    default: return "What new information do we have?";
  }
}

function getDriverLabel(questionType?: string): string {
  return questionType === "comparative" ? "Difference Drivers" : "Primary Drivers";
}

function getDriverSubtitle(questionType?: string): string {
  return questionType === "comparative" ? "Key factors explaining group differences" : "Highest forecast impact";
}

export default function SignalsPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const questionText = activeQuestion?.rawInput || activeQuestion?.text || "";
  const questionType = activeQuestion?.questionType;
  const entities = activeQuestion?.entities || [];
  const subject = activeQuestion?.subject;
  const outcome = activeQuestion?.outcome;
  const timeHorizon = activeQuestion?.timeHorizon;
  const isComparative = questionType === "comparative" && entities.length >= 2;

  const questionCtx: QuestionContext = useMemo(() => ({
    text: questionText,
    questionType,
    entities,
    subject,
    outcome,
    timeHorizon,
  }), [questionText, questionType, entities, subject, outcome, timeHorizon]);

  const fallbackSuggestions = useMemo(
    () => generateSuggestions(questionCtx),
    [questionCtx]
  );

  const fallbackEvents = useMemo(
    () => generateIncomingEvents(questionCtx),
    [questionCtx]
  );

  const caseKey = activeQuestion?.caseId || "unknown";

  const loadPersistedSignals = useCallback((): Signal[] | null => {
    try {
      const raw = localStorage.getItem(`cios.signals:${caseKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return null;
  }, [caseKey]);

  const persistSignals = useCallback((sigs: Signal[]) => {
    try {
      const serializable = sigs.map(({ ...s }) => s);
      localStorage.setItem(`cios.signals:${caseKey}`, JSON.stringify(serializable));
    } catch {}
  }, [caseKey]);

  const [signals, setSignals] = useState<Signal[]>(() => {
    const persisted = (() => { try { const raw = localStorage.getItem(`cios.signals:${caseKey}`); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length > 0) return p; } } catch {} return null; })();
    return persisted || fallbackSuggestions;
  });
  const [incomingEvents, setIncomingEvents] = useState<IncomingEvent[]>(fallbackEvents);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [marketSummary, setMarketSummary] = useState<string | null>(null);
  const [translationSummary, setTranslationSummary] = useState<string | null>(null);
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

  const VALID_CATEGORIES = new Set(["evidence", "access", "competition", "guideline", "timing", "adoption"]);
  const VALID_DIRECTIONS = new Set(["positive", "negative", "neutral"]);
  const VALID_STRENGTHS = new Set(["High", "Medium", "Low"]);
  const VALID_RELIABILITIES = new Set(["Confirmed", "Probable", "Speculative"]);

  const contextKey = `${subject}|${questionText}|${outcome}|${questionType}|${entities.join(",")}|${timeHorizon}`;

  const hasPersistedSignals = useCallback(() => {
    try {
      const raw = localStorage.getItem(`cios.signals:${caseKey}`);
      if (raw) { const p = JSON.parse(raw); return Array.isArray(p) && p.length > 0; }
    } catch {}
    return false;
  }, [caseKey]);

  const aiAlreadyRan = useCallback(() => {
    try {
      return localStorage.getItem(`cios.aiRequested:${caseKey}`) === contextKey;
    } catch {}
    return false;
  }, [caseKey, contextKey]);

  const markAiRan = useCallback(() => {
    try { localStorage.setItem(`cios.aiRequested:${caseKey}`, contextKey); } catch {}
  }, [caseKey, contextKey]);

  const [forceRefreshAi, setForceRefreshAi] = useState(0);

  useEffect(() => {
    if (!subject || !questionText) return;

    if (hasPersistedSignals() && aiAlreadyRan() && forceRefreshAi === 0) return;

    if (aiAlreadyRan() && forceRefreshAi === 0) return;

    markAiRan();
    const requestId = ++aiRequestIdRef.current;

    setAiLoading(true);
    setAiError(null);
    setMarketSummary(null);
    setTranslationSummary(null);
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
    fetch(`${API}/api/ai-signals/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        outcome,
        questionType,
        questionText,
        timeHorizon,
        entities,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (aiRequestIdRef.current !== requestId) return;

        if (data.signals && Array.isArray(data.signals)) {
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
            return {
              id: `ai-${i + 1}`,
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
            };
          });
          setSignals((prev) => {
            const lockedSignals = prev.filter((s) => s.is_locked || s.source === "user");
            const lockedTexts = new Set(lockedSignals.map(s => s.text.toLowerCase().trim()));
            const newAi = mapped.filter(s => !lockedTexts.has(s.text.toLowerCase().trim()));
            const merged = [...newAi, ...lockedSignals];
            persistSignals(merged);
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
      })
      .catch((err) => {
        if (aiRequestIdRef.current !== requestId) return;
        console.error("[CIOS AI Signals] AI research failed, using template signals:", err);
        setAiError("AI research unavailable — showing template signals. You can still add signals manually.");
        setIncomingEvents(fallbackEvents);
      })
      .finally(() => {
        if (aiRequestIdRef.current === requestId) {
          setAiLoading(false);
        }
      });
  }, [contextKey, forceRefreshAi]);

  const prevQuestionRef = useRef(questionText);
  useEffect(() => {
    if (questionText !== prevQuestionRef.current) {
      prevQuestionRef.current = questionText;
      if (!aiLoading) {
        setSignals((prev) => {
          const lockedSignals = prev.filter((s) => s.is_locked || s.source === "user");
          return [...fallbackSuggestions, ...lockedSignals];
        });
      }
      setEditingId(null);
    }
  }, [questionText, fallbackSuggestions]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSupporting, setShowSupporting] = useState(false);

  const [newText, setNewText] = useState("");
  const [newDirection, setNewDirection] = useState<Direction>("positive");
  const [newStrength, setNewStrength] = useState<Strength>("Medium");
  const [newReliability, setNewReliability] = useState<Reliability>("Probable");
  const [newCategory, setNewCategory] = useState<Category>("evidence");

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

      const positives = group.filter(s => s.direction === "positive");
      const negatives = group.filter(s => s.direction === "negative");

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

  function persistSignalToDb(signal: Signal) {
    const caseId = activeQuestion?.caseId;
    if (!caseId) return;

    const API = import.meta.env.VITE_API_URL || "";
    const dbDirection = signal.direction === "negative" ? "Negative" : "Positive";

    fetch(`${API}/api/cases/${caseId}/signals`, {
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
        sourceLabel: signal.source === "user" ? "User input" : "AI research",
        evidenceSnippet: signal.text,
        signalScope: "market",
        observedAt: new Date().toISOString(),
        createdByType: "human",
        brand: subject || "",
      }),
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

    const result = recalculateGatesFromSignals(baseGates, acceptedInputs, brandOutlook);
    setRecalcResult(result);
    setEventGates(result.updated_gates);

    const hasWeakOrUnresolved = result.updated_gates.some(g => g.status === "weak" || g.status === "unresolved");
    const minCap = Math.min(...result.updated_gates.map(g => g.constrains_probability_to));
    const enforcedCap = hasWeakOrUnresolved ? Math.min(minCap, 0.70) : minCap;
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
      const updated = prev.map((s) => {
        if (s.id !== id) return s;
        return { ...s, impact: computeImpact(s) };
      });
      const editedSignal = updated.find(s => s.id === id);
      if (editedSignal?.accepted) {
        setTimeout(() => triggerGateRecalculation(updated, editedSignal.text), 0);
      }
      persistSignals(updated);
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
    const sig: Signal = {
      id: `user-${Date.now()}`,
      text: newText.trim(),
      caveat: "",
      direction: newDirection,
      strength: newStrength,
      reliability: newReliability,
      impact: computeImpact(base),
      category: newCategory,
      source: "user",
      accepted: true,
      priority_source: "manual_confirmed",
      is_locked: true,
    };
    setSignals((prev) => {
      const updated = [...prev, sig];
      persistSignals(updated);
      setTimeout(() => triggerGateRecalculation(updated, sig.text), 0);
      return updated;
    });
    persistSignalToDb(sig);
    setNewText("");
    setNewDirection("positive");
    setNewStrength("Medium");
    setNewReliability("Probable");
    setNewCategory("evidence");
    setShowAddForm(false);
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
    const sig: Signal = {
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
    };
    setSignals((prev) => {
      const updated = [...prev, sig];
      persistSignals(updated);
      setTimeout(() => triggerGateRecalculation(updated, sig.text), 0);
      return updated;
    });
    persistSignalToDb(sig);
  }

  const allSignals = useMemo(() => detectConflicts(signals), [signals]);
  const primaryDrivers = allSignals.filter((s) => s.impact === "High");
  const supportingSignals = allSignals.filter((s) => s.impact !== "High");
  const pending = allSignals.filter((s) => !s.accepted);
  const accepted = allSignals.filter((s) => s.accepted);
  const summary = generateSummary(allSignals, questionType, entities);
  const pendingSupporting = supportingSignals.filter((s) => !s.accepted).length;
  const effectiveShowSupporting = showSupporting || pendingSupporting > 0;

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

  const supportingByFamily = useMemo(() => {
    const grouped: Record<SignalFamily, Signal[]> = {
      brand_clinical_regulatory: [],
      payer_access: [],
      competitor: [],
      patient_demand: [],
      provider_behavioral: [],
      system_operational: [],
    };
    const ungrouped: Signal[] = [];
    supportingSignals.forEach((s) => {
      if (s.signal_family && grouped[s.signal_family]) {
        grouped[s.signal_family].push(s);
      } else {
        ungrouped.push(s);
      }
    });
    return { grouped, ungrouped };
  }, [supportingSignals]);

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
              Step 2
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              {getStepHeading(questionType)}
            </h1>
          </div>

          {isComparative && (
            <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 via-card to-card p-4">
              <div className="flex items-center gap-3">
                <GitCompareArrows className="w-5 h-5 text-violet-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider mb-1">Comparing</div>
                  <div className="text-sm font-medium text-foreground">
                    {entities.map((e, i) => (
                      <span key={e}>
                        {i > 0 && <span className="text-muted-foreground mx-1.5">vs</span>}
                        <span className="text-violet-300">{e}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {aiLoading && (
            <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 via-card to-card p-5">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Globe className="w-5 h-5 text-cyan-400 animate-pulse" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider mb-1">Brand Development Check in Progress</div>
                  <div className="text-sm text-foreground leading-relaxed">
                    Searching for latest verified developments on {subject} — checking company investor/press releases, official brand site, ClinicalTrials.gov, congress presentations, and news sources...
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full bg-cyan-500/60 animate-[loading_2s_ease-in-out_infinite]" style={{ width: "60%" }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {aiError && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
              {aiError}
            </div>
          )}

          {marketSummary && !aiLoading && (
            <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-card to-card p-5">
              <div className="flex items-start gap-3">
                <Activity className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-1">Market Intelligence Summary</div>
                  <div className="text-sm text-foreground leading-relaxed">{marketSummary}</div>
                </div>
              </div>
            </div>
          )}

          {brandCheckDone && !aiLoading && (() => {
            const observedSignals = allSignals.filter((s) => s.signal_class === "observed" && s.brand_verified);
            if (observedSignals.length > 0) {
              return (
                <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-card to-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-blue-400">Latest Verified Brand Developments</h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">{observedSignals.length} found</span>
                  </div>
                  <div className="space-y-2">
                    {observedSignals.slice(0, 5).map((sig) => (
                      <div key={sig.id} className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-3">
                        <div className="flex items-start gap-2">
                          <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${sig.direction === "positive" ? "bg-emerald-400" : sig.direction === "negative" ? "bg-red-400" : "bg-slate-400"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground leading-snug">{sig.text}</div>
                            {sig.citation_excerpt && (
                              <div className="mt-1 text-xs text-muted-foreground italic">"{sig.citation_excerpt}"</div>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                              {sig.observed_date && (
                                <span className="text-blue-300">{sig.observed_date}</span>
                              )}
                              {sig.source_type && (
                                <span className="px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{sig.source_type.replace(/_/g, " ")}</span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded font-medium ${sig.direction === "positive" ? "bg-emerald-500/15 text-emerald-400" : sig.direction === "negative" ? "bg-red-500/15 text-red-400" : "bg-slate-500/15 text-slate-400"}`}>
                                {sig.direction === "positive" ? "↑ Positive" : sig.direction === "negative" ? "↓ Negative" : "— Neutral"}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">Confirmed</span>
                              {sig.source_url && (
                                <a href={sig.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                                  <ExternalLink className="w-3 h-3" />
                                  Source
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0 ml-2">
                            {!sig.accepted ? (
                              <>
                                <button type="button" onClick={() => acceptSignal(sig.id)} className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400" title="Confirm">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={() => dismissSignal(sig.id)} className="p-1 rounded hover:bg-red-500/20 text-muted-foreground" title="Dismiss">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">Confirmed</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            } else if (!verifiedFound) {
              return (
                <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-card to-card p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-0.5">Brand Development Check</div>
                      <div className="text-xs text-muted-foreground">No recent verified brand developments found for {subject}. Signals below are derived from market knowledge and general analysis.</div>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {translationSummary && !aiLoading && (
            <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 via-card to-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-violet-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-violet-400">Question Relevance Translation</h2>
              </div>
              <div className="text-sm text-foreground leading-relaxed">{translationSummary}</div>
              {(() => {
                const lowConfCount = allSignals.filter((s) => s.translation_confidence === "low").length;
                const modConfCount = allSignals.filter((s) => s.translation_confidence === "moderate").length;
                const highConfCount = allSignals.filter((s) => s.translation_confidence === "high").length;
                if (lowConfCount === 0 && modConfCount === 0) return null;
                return (
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    {highConfCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold">
                        {highConfCount} directly relevant
                      </span>
                    )}
                    {modConfCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-semibold">
                        {modConfCount} conditionally relevant
                      </span>
                    )}
                    {lowConfCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 font-semibold">
                        {lowConfCount} upstream only
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {!aiLoading && allSignals.length > 0 && (
            <div className="rounded-2xl border border-slate-500/20 bg-gradient-to-r from-slate-500/5 via-card to-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Signal Coverage Summary</h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-300 font-medium">
                  {coveredFamilies.length}/{ALL_SIGNAL_FAMILIES.length} families
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {ALL_SIGNAL_FAMILIES.map((fam) => {
                  const count = coverageByFamily[fam];
                  const isCovered = count > 0;
                  return (
                    <div key={fam} className={`rounded-lg border px-3 py-2 text-xs ${isCovered ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${isCovered ? "text-emerald-300" : "text-amber-300"}`}>
                          {SIGNAL_FAMILY_LABELS[fam]}
                        </span>
                        <span className={`text-[10px] font-bold ${isCovered ? "text-emerald-400" : "text-amber-400"}`}>
                          {isCovered ? `${count} signal${count > 1 ? "s" : ""}` : "MISSING"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {missingFamilies.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-amber-300">
                    <span className="font-semibold">Coverage gap:</span> No signals for{" "}
                    {missingFamilies.map((f) => SIGNAL_FAMILY_LABELS[f]).join(", ")}.
                    Consider adding signals in these areas for a more complete forecast.
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card p-5">
            <div className="flex items-start gap-3">
              <BrainCircuit className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-primary font-semibold uppercase tracking-wider mb-1">Signal Analysis</div>
                <div className="text-sm text-foreground leading-relaxed">{summary}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-foreground">{getDriverLabel(questionType)}</h2>
              <span className="text-xs text-muted-foreground">{getDriverSubtitle(questionType)}</span>
            </div>

            {primaryDrivers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No high-impact drivers identified yet. Confirm suggestions or add signals.
              </div>
            ) : (
              <div className="space-y-3">
                {primaryDrivers.map((sig) => (
                  <PrimaryDriverCard
                    key={sig.id}
                    signal={sig}
                    editing={editingId === sig.id}
                    onEdit={() => {
                      if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); }
                    }}
                    onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                    onDismiss={() => dismissSignal(sig.id)}
                    onUpdate={(u) => updateSignal(sig.id, u)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowSupporting(!showSupporting)}
              className="flex items-center gap-2 w-full"
            >
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Supporting Signals</h2>
              <span className="text-xs text-muted-foreground">({supportingSignals.length})</span>
              {effectiveShowSupporting ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto" />}
            </button>

            {effectiveShowSupporting && (
              <div className="space-y-4">
                {supportingSignals.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No supporting signals.
                  </div>
                ) : (
                  <>
                    {ALL_SIGNAL_FAMILIES.map((fam) => {
                      const famSignals = supportingByFamily.grouped[fam];
                      if (famSignals.length === 0) return null;
                      return (
                        <div key={fam} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <FamilyBadge family={fam} />
                            <span className="text-[10px] text-muted-foreground">{famSignals.length} signal{famSignals.length > 1 ? "s" : ""}</span>
                          </div>
                          {famSignals.map((sig) => (
                            <SupportingSignalRow
                              key={sig.id}
                              signal={sig}
                              editing={editingId === sig.id}
                              onEdit={() => {
                                if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); }
                              }}
                              onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                              onDismiss={() => dismissSignal(sig.id)}
                              onUpdate={(u) => updateSignal(sig.id, u)}
                            />
                          ))}
                        </div>
                      );
                    })}
                    {supportingByFamily.ungrouped.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Other</div>
                        {supportingByFamily.ungrouped.map((sig) => (
                          <SupportingSignalRow
                            key={sig.id}
                            signal={sig}
                            editing={editingId === sig.id}
                            onEdit={() => {
                              if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); }
                            }}
                            onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                            onDismiss={() => dismissSignal(sig.id)}
                            onUpdate={(u) => updateSignal(sig.id, u)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {!showAddForm ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="flex-1 flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition justify-center"
              >
                <Plus className="w-4 h-4" />
                Add Signal Manually
              </button>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.removeItem(`cios.aiRequested:${caseKey}`); } catch {}
                  setForceRefreshAi(prev => prev + 1);
                }}
                disabled={aiLoading}
                className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300 hover:bg-blue-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                Refresh AI Signals
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Add Custom Signal</h3>
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
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SelectField label="Direction" value={newDirection} onChange={(v) => setNewDirection(v as Direction)} options={["positive", "negative", "neutral"]} />
                <SelectField label="Strength" value={newStrength} onChange={(v) => setNewStrength(v as Strength)} options={["High", "Medium", "Low"]} />
                <SelectField label="Reliability" value={newReliability} onChange={(v) => setNewReliability(v as Reliability)} options={["Confirmed", "Probable", "Speculative"]} />
                <SelectField label="Category" value={newCategory} onChange={(v) => setNewCategory(v as Category)} options={["evidence", "access", "competition", "guideline", "timing", "adoption"]} />
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

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-foreground">Incoming Events</h2>
              <span className="text-xs text-muted-foreground">Potential signal sources</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {incomingEvents.map((ev) => {
                const EvIcon = ev.icon;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => convertEvent(ev)}
                    className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/30 hover:bg-muted/20 transition group"
                  >
                    <EvIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition mb-2" />
                    <div className="text-xs font-semibold text-foreground">{ev.title}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground leading-snug">{ev.description}</div>
                    <div className="mt-2 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition">+ Convert to signal</div>
                  </button>
                );
              })}
            </div>
          </div>

          {lastImpact && (
            <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/5 via-card to-card p-5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Signal Impact</span>
              </div>
              <div className="text-sm text-foreground mb-3">
                <span className="text-muted-foreground">Signal:</span>{" "}
                <span className="font-medium">{lastImpact.signalText.length > 80 ? lastImpact.signalText.slice(0, 80) + "…" : lastImpact.signalText}</span>
              </div>
              {lastImpact.gateImpact ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">Gate affected:</span>
                    <span className="font-medium text-foreground">{lastImpact.gateImpact.gate_label}</span>
                  </div>
                  {lastImpact.gateImpact.changed ? (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">Gate change:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${lastImpact.gateImpact.previous_status === "strong" ? "bg-emerald-500/20 text-emerald-300" : lastImpact.gateImpact.previous_status === "moderate" ? "bg-yellow-500/20 text-yellow-300" : "bg-red-500/20 text-red-300"}`}>
                        {lastImpact.gateImpact.previous_status}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${lastImpact.gateImpact.new_status === "strong" ? "bg-emerald-500/20 text-emerald-300" : lastImpact.gateImpact.new_status === "moderate" ? "bg-yellow-500/20 text-yellow-300" : "bg-red-500/20 text-red-300"}`}>
                        {lastImpact.gateImpact.new_status}
                      </span>
                    </div>
                  ) : lastImpact.gateImpact.ceiling_hit ? (
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-300">No change — gate already strong</span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Gate unchanged — insufficient cumulative evidence for status shift</div>
                  )}
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">Forecast:</span>
                    {lastImpact.forecastBefore !== lastImpact.forecastAfter ? (
                      <span className="font-medium">
                        <span className="text-muted-foreground">{lastImpact.forecastBefore}%</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className={lastImpact.forecastAfter > lastImpact.forecastBefore ? "text-emerald-400" : "text-red-400"}>
                          {lastImpact.forecastAfter}%
                        </span>
                        <span className={`ml-2 text-xs ${lastImpact.forecastAfter > lastImpact.forecastBefore ? "text-emerald-400" : "text-red-400"}`}>
                          ({lastImpact.forecastAfter > lastImpact.forecastBefore ? "+" : ""}{lastImpact.forecastAfter - lastImpact.forecastBefore}pp)
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No change ({lastImpact.forecastBefore}%)</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Signal mapped — awaiting sufficient evidence for gate adjustment</div>
              )}
            </div>
          )}

          {recalcResult && recalcResult.diagnostics.length > 0 && !aiLoading && (
            <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 via-card to-card p-5">
              <button
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="flex items-center gap-2 w-full text-left"
              >
                <BrainCircuit className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Signal Diagnostics</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium ml-1">
                  {recalcResult.diagnostics.length} mapped
                </span>
                <span className="ml-auto">
                  {showDiagnostics ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </span>
              </button>
              {showDiagnostics && (
                <div className="mt-4 space-y-3">
                  {recalcResult.gate_impacts.filter(gi => gi.signal_count > 0).map((gi) => (
                    <div key={gi.gate_id} className="rounded-xl border border-border/50 bg-card/50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{gi.gate_label}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${gi.changed ? "bg-cyan-500/20 text-cyan-300" : gi.ceiling_hit ? "bg-amber-500/20 text-amber-300" : "bg-muted/30 text-muted-foreground"}`}>
                          {gi.changed ? "Updated" : gi.ceiling_hit ? "Ceiling" : "Stable"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${gi.previous_status === "strong" ? "bg-emerald-500/20 text-emerald-300" : gi.previous_status === "moderate" ? "bg-yellow-500/20 text-yellow-300" : "bg-red-500/20 text-red-300"}`}>
                          {gi.previous_status}
                        </span>
                        {gi.changed && (
                          <>
                            <span className="text-muted-foreground">→</span>
                            <span className={`px-1.5 py-0.5 rounded ${gi.new_status === "strong" ? "bg-emerald-500/20 text-emerald-300" : gi.new_status === "moderate" ? "bg-yellow-500/20 text-yellow-300" : "bg-red-500/20 text-red-300"}`}>
                              {gi.new_status}
                            </span>
                          </>
                        )}
                        <span className="text-muted-foreground ml-2">{gi.signal_count} signal(s) · net evidence: {gi.net_evidence > 0 ? "+" : ""}{gi.net_evidence.toFixed(1)}</span>
                      </div>
                      <div className="space-y-1">
                        {recalcResult.diagnostics.filter(d => d.gate_affected === gi.gate_id).map((diag) => (
                          <div key={diag.signal_id} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400/50 shrink-0" />
                            <span className="flex-1">{diag.signal_text.length > 100 ? diag.signal_text.slice(0, 100) + "…" : diag.signal_text}</span>
                            <span className={`shrink-0 ${diag.evidence_weight > 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {diag.evidence_weight > 0 ? "+" : ""}{diag.evidence_weight.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {recalcResult.previous_forecast !== recalcResult.new_forecast && (
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-cyan-300">Overall Forecast Impact</span>
                      <span className="text-sm font-semibold">
                        <span className="text-muted-foreground">{recalcResult.previous_forecast}%</span>
                        <span className="text-muted-foreground mx-1.5">→</span>
                        <span className={recalcResult.new_forecast > recalcResult.previous_forecast ? "text-emerald-400" : "text-red-400"}>
                          {recalcResult.new_forecast}%
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Link href="/forecast" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500">
              Continue to Judgment
            </Link>
          </div>
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function SignalSourceTags({ signal }: { signal: Signal }) {
  const tags: React.ReactElement[] = [];
  if (signal.is_locked) {
    tags.push(
      <span key="locked" className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-amber-500/15 text-amber-300">
        <Lock className="w-2.5 h-2.5" />
        Locked
      </span>
    );
  }
  if (signal.priority_source === "manual_confirmed") {
    tags.push(
      <span key="manual" className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-cyan-500/15 text-cyan-300">Manual</span>
    );
  } else if (signal.priority_source === "observed_verified") {
    tags.push(
      <span key="observed" className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-blue-500/15 text-blue-300">Verified</span>
    );
  } else if (signal.priority_source === "ai_derived") {
    tags.push(
      <span key="ai" className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-violet-500/15 text-violet-300">AI</span>
    );
  } else if (signal.priority_source === "ai_uncertainty") {
    tags.push(
      <span key="ai-unc" className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-slate-500/15 text-slate-400">AI Uncertain</span>
    );
  }
  if (signal.superseded) {
    tags.push(
      <span key="superseded" className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-slate-500/20 text-slate-400 line-through">
        Superseded
      </span>
    );
  } else if (signal.conflict_with) {
    tags.push(
      <span key="conflict" className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-red-500/15 text-red-300">
        <AlertTriangle className="w-2.5 h-2.5" />
        Conflict
      </span>
    );
  }
  if (tags.length === 0) return null;
  return <>{tags}</>;
}

function PrimaryDriverCard({
  signal,
  editing,
  onEdit,
  onAccept,
  onDismiss,
  onUpdate,
}: {
  signal: Signal;
  editing: boolean;
  onEdit: () => void;
  onAccept?: () => void;
  onDismiss: () => void;
  onUpdate: (u: Partial<Signal>) => void;
}) {
  const catCfg = CATEGORY_CONFIG[signal.category];
  const CatIcon = catCfg.icon;
  const dirColor = signal.direction === "positive" ? "border-emerald-500/30 bg-emerald-500/5" : signal.direction === "negative" ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/10";
  const dirAccent = signal.direction === "positive" ? "text-emerald-400" : signal.direction === "negative" ? "text-red-400" : "text-muted-foreground";

  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${dirColor} ${signal.superseded ? "opacity-40" : ""}`}>
      {signal.superseded && (
        <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-500/10 border border-slate-500/20 rounded-lg px-3 py-1.5 mb-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>Superseded by newer evidence — excluded from active calculations</span>
        </div>
      )}
      <div className="flex items-start gap-4">
        <div className={`shrink-0 rounded-xl p-2.5 bg-card border border-border ${dirAccent}`}>
          {signal.direction === "positive" ? <ArrowUpRight className="w-5 h-5" /> : signal.direction === "negative" ? <ArrowDownRight className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea value={signal.text} onChange={(e) => onUpdate({ text: e.target.value })} rows={2} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground" />
              <input value={signal.caveat} onChange={(e) => onUpdate({ caveat: e.target.value })} className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200 placeholder:text-amber-400/40" placeholder="Add caveat or note..." />
            </div>
          ) : (
            <div>
              <div className="text-base font-semibold text-foreground leading-snug">{signal.text}</div>
              {signal.caveat && <div className="mt-1 text-xs text-amber-300/70 italic">Caveat: {signal.caveat}</div>}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <ImpactBadge impact={signal.impact} />
            <DirectionBadge direction={signal.direction} />
            <StrengthBadge strength={signal.strength} />
            <ReliabilityBadge reliability={signal.reliability} />
            <div className={`flex items-center gap-1 text-xs ${catCfg.color}`}>
              <CatIcon className="w-3 h-3" />
              {catCfg.label}
            </div>
            {signal.signal_family && (
              <FamilyBadge family={signal.signal_family} />
            )}
            {signal.signal_class && signal.signal_class !== "observed" && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${signal.signal_class === "derived" ? "bg-violet-500/15 text-violet-300" : "bg-amber-500/15 text-amber-300"}`}>
                {signal.signal_class}
              </span>
            )}
            {signal.translation_confidence && (
              <TranslationBadge confidence={signal.translation_confidence} />
            )}
            <SignalSourceTags signal={signal} />
            {!signal.accepted && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300 font-semibold">Pending</span>}
          </div>
          {signal.question_relevance_note && (
            <div className="mt-1.5 text-[11px] text-violet-300/80 italic leading-snug">
              {signal.question_relevance_note}
            </div>
          )}
          {(signal.applies_to_line_of_therapy || signal.applies_within_time_horizon || signal.applies_to_stakeholder_group) && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {signal.applies_to_line_of_therapy && (
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${signal.applies_to_line_of_therapy === "current_label" ? "bg-emerald-500/15 text-emerald-300" : signal.applies_to_line_of_therapy === "future_label" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300"}`}>
                  {signal.applies_to_line_of_therapy === "current_label" ? "Current label" : signal.applies_to_line_of_therapy === "future_label" ? "Future label" : "Line uncertain"}
                </span>
              )}
              {signal.applies_within_time_horizon && (
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${signal.applies_within_time_horizon === "yes" ? "bg-emerald-500/15 text-emerald-300" : signal.applies_within_time_horizon === "partial" ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300"}`}>
                  {signal.applies_within_time_horizon === "yes" ? "Within horizon" : signal.applies_within_time_horizon === "partial" ? "Partial horizon" : "Beyond horizon"}
                </span>
              )}
              {signal.applies_to_stakeholder_group && signal.applies_to_stakeholder_group !== "unknown" && (
                <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-blue-500/15 text-blue-300">
                  {signal.applies_to_stakeholder_group}
                </span>
              )}
            </div>
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

      {editing && (
        <div className="grid grid-cols-2 gap-2 pl-14 md:grid-cols-4">
          <SelectField label="Direction" value={signal.direction} onChange={(v) => onUpdate({ direction: v as Direction })} options={["positive", "negative", "neutral"]} />
          <SelectField label="Strength" value={signal.strength} onChange={(v) => onUpdate({ strength: v as Strength })} options={["High", "Medium", "Low"]} />
          <SelectField label="Reliability" value={signal.reliability} onChange={(v) => onUpdate({ reliability: v as Reliability })} options={["Confirmed", "Probable", "Speculative"]} />
          <SelectField label="Category" value={signal.category} onChange={(v) => onUpdate({ category: v as Category })} options={["evidence", "access", "competition", "guideline", "timing", "adoption"]} />
        </div>
      )}
    </div>
  );
}

function SupportingSignalRow({
  signal,
  editing,
  onEdit,
  onAccept,
  onDismiss,
  onUpdate,
}: {
  signal: Signal;
  editing: boolean;
  onEdit: () => void;
  onAccept?: () => void;
  onDismiss: () => void;
  onUpdate: (u: Partial<Signal>) => void;
}) {
  const catCfg = CATEGORY_CONFIG[signal.category];
  const CatIcon = catCfg.icon;

  return (
    <div className={`rounded-xl border border-border bg-card p-3.5 space-y-2 ${signal.superseded ? "opacity-40" : ""}`}>
      {signal.superseded && (
        <div className="flex items-center gap-1.5 text-[9px] text-slate-400 bg-slate-500/10 rounded-lg px-2 py-1">
          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
          Superseded — excluded from calculations
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className={`shrink-0 mt-0.5 rounded-md bg-muted/20 p-1 ${catCfg.color}`}>
          <CatIcon className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea value={signal.text} onChange={(e) => onUpdate({ text: e.target.value })} rows={1} className="w-full rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs text-foreground" />
              <input value={signal.caveat} onChange={(e) => onUpdate({ caveat: e.target.value })} className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200 placeholder:text-amber-400/40" placeholder="Add caveat..." />
            </div>
          ) : (
            <div>
              <div className="text-xs text-foreground/80">{signal.text}</div>
              {signal.caveat && <div className="mt-0.5 text-[11px] text-amber-300/60 italic">Caveat: {signal.caveat}</div>}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <ImpactBadge impact={signal.impact} />
            <DirectionBadge direction={signal.direction} />
            <StrengthBadge strength={signal.strength} />
            {signal.signal_class && signal.signal_class !== "observed" && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${signal.signal_class === "derived" ? "bg-violet-500/15 text-violet-300" : "bg-amber-500/15 text-amber-300"}`}>
                {signal.signal_class}
              </span>
            )}
            {signal.source_url && (
              <a href={signal.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[9px] text-blue-400 hover:text-blue-300">
                <ExternalLink className="w-2.5 h-2.5" />
                Source
              </a>
            )}
            <SignalSourceTags signal={signal} />
            {!signal.accepted && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300 font-semibold">Pending</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit} className={`rounded-lg border p-1 transition ${editing ? "border-primary/30 text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/20"}`} title="Edit">
            <Pencil className="w-3 h-3" />
          </button>
          {onAccept && (
            <button type="button" onClick={onAccept} className="rounded-lg border border-emerald-500/30 p-1 text-emerald-400 hover:bg-emerald-500/10 transition" title="Confirm">
              <Check className="w-3 h-3" />
            </button>
          )}
          <button type="button" onClick={onDismiss} className="rounded-lg border border-border p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition" title="Remove">
            {signal.accepted ? <Trash2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
          </button>
        </div>
      </div>
      {editing && (
        <div className="grid grid-cols-2 gap-2 pl-7 md:grid-cols-4">
          <SelectField label="Direction" value={signal.direction} onChange={(v) => onUpdate({ direction: v as Direction })} options={["positive", "negative", "neutral"]} />
          <SelectField label="Strength" value={signal.strength} onChange={(v) => onUpdate({ strength: v as Strength })} options={["High", "Medium", "Low"]} />
          <SelectField label="Reliability" value={signal.reliability} onChange={(v) => onUpdate({ reliability: v as Reliability })} options={["Confirmed", "Probable", "Speculative"]} />
          <SelectField label="Category" value={signal.category} onChange={(v) => onUpdate({ category: v as Category })} options={["evidence", "access", "competition", "guideline", "timing", "adoption"]} />
        </div>
      )}
    </div>
  );
}

const FAMILY_COLORS: Record<SignalFamily, string> = {
  brand_clinical_regulatory: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  payer_access: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  competitor: "bg-red-500/15 text-red-300 border-red-500/20",
  patient_demand: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  provider_behavioral: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  system_operational: "bg-slate-500/15 text-slate-300 border-slate-500/20",
};

function TranslationBadge({ confidence }: { confidence: TranslationConfidence }) {
  const cls = confidence === "high"
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20"
    : confidence === "moderate"
    ? "bg-amber-500/15 text-amber-300 border-amber-500/20"
    : "bg-red-500/15 text-red-300 border-red-500/20";
  const label = confidence === "high"
    ? "Directly relevant"
    : confidence === "moderate"
    ? "Conditionally relevant"
    : "Upstream signal";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function FamilyBadge({ family }: { family: SignalFamily }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${FAMILY_COLORS[family] || "bg-muted/30 text-muted-foreground border-border"}`}>
      {SIGNAL_FAMILY_LABELS[family] || family}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: Impact }) {
  const cls = impact === "High" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : impact === "Medium" ? "bg-blue-500/15 text-blue-300 border-blue-500/20" : "bg-muted/30 text-muted-foreground border-border";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      Impact: {impact}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: Direction }) {
  const color = direction === "positive" ? "text-emerald-400" : direction === "negative" ? "text-red-400" : "text-muted-foreground";
  const Icon = direction === "positive" ? ArrowUpRight : direction === "negative" ? ArrowDownRight : Minus;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {direction.charAt(0).toUpperCase() + direction.slice(1)}
    </span>
  );
}

function StrengthBadge({ strength }: { strength: Strength }) {
  const cls = strength === "High" ? "bg-amber-500/15 text-amber-300" : strength === "Medium" ? "bg-blue-500/15 text-blue-300" : "bg-muted/30 text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{strength}</span>;
}

function ReliabilityBadge({ reliability }: { reliability: Reliability }) {
  const cls = reliability === "Confirmed" ? "bg-emerald-500/15 text-emerald-300" : reliability === "Probable" ? "bg-violet-500/15 text-violet-300" : "bg-muted/30 text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{reliability}</span>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1.5 text-xs text-foreground">
        {options.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
      </select>
    </div>
  );
}
