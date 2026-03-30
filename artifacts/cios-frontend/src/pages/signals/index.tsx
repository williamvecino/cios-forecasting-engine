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
  Upload,
  Info,
  Search,
  FileSpreadsheet,
} from "lucide-react";
import DataImportDialog from "@/components/signals/DataImportDialog";
import { WorkbookImportDialog } from "@/components/signals/WorkbookImportDialog";
import { SignalProvenanceDrawer, buildProvenance } from "@/components/signals/SignalProvenanceDrawer";
import ExternalSignalScoutPanel from "@/components/signals/ExternalSignalScoutPanel";
import SignalNormalizerPanel from "@/components/signals/SignalNormalizerPanel";
import SignalQualityPanel from "@/components/signals/SignalQualityPanel";
import ConflictResolverPanel from "@/components/signals/ConflictResolverPanel";
import type { ImportedRow } from "@/lib/data-import";
import type { WorkbookMeta } from "@/lib/workbook/normalizeCiosSignals";
import MiosBaosPanel from "@/components/signals/MiosBaosPanel";
import SignalDependencyPanel from "@/components/signals/SignalDependencyPanel";

function isMiosBaosSignal(s: any): boolean {
  const st = (s.source_type || "").toUpperCase();
  if (st === "MIOS" || st === "BAOS" || st.includes("MIOS") || st.includes("BAOS")) return true;
  const pid = (s.workbook_meta?.programId || "").toUpperCase();
  if (pid.startsWith("MIOS-") || pid.startsWith("BAOS-")) return true;
  const src = (s.workbook_meta?.sourceWorkbook || "").toUpperCase();
  if (src.includes("MIOS") || src.includes("BAOS")) return true;
  const id = (s.id || "");
  if (id.startsWith("mios_") || id.startsWith("baos_")) return true;
  return false;
}

function doesMiosBaosMatchBrand(s: any, currentSubject: string): boolean {
  const brandUpper = currentSubject.toUpperCase().replace(/\s+/g, "_");
  const brandLower = currentSubject.toLowerCase().replace(/\s+/g, "_");
  const pid = (s.workbook_meta?.programId || "").toUpperCase();
  if (pid && pid.includes(brandUpper)) return true;
  const src = (s.workbook_meta?.sourceWorkbook || "").toUpperCase();
  if (src && src.includes(currentSubject.toUpperCase())) return true;
  const id = (s.id || "").toLowerCase();
  if (id.startsWith(`mios_${brandLower}_`) || id.startsWith(`baos_${brandLower}_`)) return true;
  return false;
}

function stripNonMatchingBrandSignals(signals: any[], currentSubject?: string): any[] {
  if (!signals || signals.length === 0) return signals;
  return signals.filter((s: any) => {
    if (!isMiosBaosSignal(s)) return true;
    if (!currentSubject) return false;
    return doesMiosBaosMatchBrand(s, currentSubject);
  });
}

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

type SignalSource = "internal" | "external" | "missing";

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
  priority_source?: PrioritySource;
  is_locked?: boolean;
  conflict_with?: string;
  superseded_by?: string;
  superseded?: boolean;
  workbook_meta?: WorkbookMeta;
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
    case "positive": return `Supports ${target}`;
    case "negative": return `Slows ${target}`;
    default: return "Neutral";
  }
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

  const persistSignals = useCallback((sigs: Signal[]) => {
    try {
      const serializable = sigs.map(({ ...s }) => s);
      localStorage.setItem(`cios.signals:${caseKey}`, JSON.stringify(serializable));
    } catch {}
  }, [caseKey]);

  const [signals, setSignals] = useState<Signal[]>(() => {
    const persisted = (() => { try { const raw = localStorage.getItem(`cios.signals:${caseKey}`); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length > 0) return stripNonMatchingBrandSignals(p, subject) as Signal[]; } } catch {} return null; })();
    if (persisted) return persisted;
    return [...fallbackSuggestions];
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
  const prevCaseKeyRef = useRef(caseKey);

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

  useEffect(() => {
    if (prevCaseKeyRef.current === caseKey) return;
    prevCaseKeyRef.current = caseKey;

    const persisted = (() => {
      try {
        const raw = localStorage.getItem(`cios.signals:${caseKey}`);
        if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length > 0) return stripNonMatchingBrandSignals(p, subject) as Signal[]; }
      } catch {}
      return null;
    })();
    if (persisted && persisted.length > 0) {
      setSignals(persisted);
    } else {
      setSignals([...fallbackSuggestions]);
    }
    setIncomingEvents(fallbackEvents);
    setAiLoading(false);
    setAiError(null);
    setMarketSummary(null);
    setTranslationSummary(null);
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
  const VALID_DIRECTIONS = new Set(["positive", "negative", "neutral"]);
  const VALID_STRENGTHS = new Set(["High", "Medium", "Low"]);
  const VALID_RELIABILITIES = new Set(["Confirmed", "Probable", "Speculative"]);

  const contextKey = `${subject}|${questionText}|${outcome}|${questionType}|${comparisonGroups.join(",")}|${entities.join(",")}|${timeHorizon}`;

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
            const idPrefix = searchKeywords?.length ? "find" : "ai";
            const VALID_SIGNAL_SOURCES = new Set(["internal", "external", "missing"]);
            const signal_source = VALID_SIGNAL_SOURCES.has(s.signal_source) ? s.signal_source as SignalSource : undefined;
            return {
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
            const keepSignals = prev.filter((s) => s.is_locked || s.source === "user" || s.accepted);
            const keepTexts = new Set(keepSignals.map(s => s.text.toLowerCase().trim()));
            const newAi = mapped.filter(s => !keepTexts.has(s.text.toLowerCase().trim()));
            const merged = [...newAi, ...keepSignals];
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
  }, [subject, questionText, outcome, questionType, timeHorizon, entities, caseKey, fallbackEvents, fallbackSuggestions]);

  useEffect(() => {
    if (!subject || !questionText) return;
    if (hasPersistedSignals() && aiAlreadyRan()) return;
    if (aiAlreadyRan()) return;
    runSignalSearch();
  }, [contextKey]);

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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showWorkbookImport, setShowWorkbookImport] = useState(false);
  const [provenanceSignal, setProvenanceSignal] = useState<Signal | null>(null);
  const [showFindPanel, setShowFindPanel] = useState(false);
  const [findKeywords, setFindKeywords] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [newText, setNewText] = useState("");
  const [newDirection, setNewDirection] = useState<Direction>("positive");
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
    const dbDirection = signal.direction === "negative" ? "Negative" : signal.direction === "neutral" ? "Neutral" : "Positive";

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
    const autoCategory = inferCategory(newText.trim());
    const sig: Signal = {
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
    setShowAddForm(false);
  }

  function handleWorkbookImport(importedSignals: any[]) {
    const isServerImported = importedSignals.length > 0 && importedSignals[0]?._serverImported;
    if (isServerImported) {
      const uiSignals = importedSignals.map((s: any) => ({
        ...s,
        _serverImported: undefined,
        accepted: true,
        source: "system" as const,
        is_locked: true,
      }));
      persistSignals(uiSignals);
      setSignals(uiSignals);
    } else {
      persistSignals(importedSignals);
      setSignals(importedSignals);
      importedSignals.forEach((sig: any) => persistSignalToDb(sig));
    }
    if (importedSignals.length > 0) {
      setTimeout(() => triggerGateRecalculation(importedSignals, `Replaced with ${importedSignals.length} workbook signals`), 0);
    }
  }

  function handleImportedRows(rows: ImportedRow[]) {
    const newSignals: Signal[] = rows.map((row, i) => {
      const dir = row.direction || "neutral";
      const str = row.strength || "Medium";
      const rel = row.reliability || "Probable";
      const base = { strength: str as Strength, reliability: rel as Reliability };
      const cat = (row.category as Category) || inferCategory(row.text);
      return {
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
      };
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
  const summary = generateSummary(allSignals, questionType, comparisonGroups.length >= 2 ? comparisonGroups : entities);

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
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              What new information do we have?
            </h1>
          </div>

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

          {!showFindPanel ? (
            <button
              type="button"
              onClick={() => setShowFindPanel(true)}
              disabled={aiLoading}
              className="w-full rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-4 text-left transition hover:border-primary/50 hover:from-primary/15 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/15 p-2.5 group-hover:bg-primary/25 transition">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">Find New Signals</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Search public sources for regulatory, clinical, market, and competitive intelligence</div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition" />
              </div>
            </button>
          ) : (
            <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/15 p-2">
                    <Search className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Find New Signals</h3>
                    <p className="text-xs text-muted-foreground">What should we look for?</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowFindPanel(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Searches regulatory filings, press releases, clinical trial registries, congress presentations, and news</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Focus areas (optional)</label>
                  <input
                    type="text"
                    value={findKeywords}
                    onChange={(e) => setFindKeywords(e.target.value)}
                    placeholder={`e.g. "payer coverage, competitor launch, FDA advisory committee"`}
                    className="w-full rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !aiLoading) {
                        const kws = findKeywords.trim()
                          ? findKeywords.split(",").map(k => k.trim()).filter(Boolean)
                          : undefined;
                        setShowFindPanel(false);
                        runSignalSearch(kws);
                      }
                    }}
                  />
                  <p className="text-[10px] text-muted-foreground/60">Separate multiple terms with commas. Leave blank to search based on your question.</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const kws = findKeywords.trim()
                        ? findKeywords.split(",").map(k => k.trim()).filter(Boolean)
                        : undefined;
                      setShowFindPanel(false);
                      runSignalSearch(kws);
                    }}
                    disabled={aiLoading}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    <Search className="w-4 h-4" />
                    Search Sources
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFindKeywords("");
                      setShowFindPanel(false);
                    }}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {aiLoading && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-muted-foreground animate-pulse" />
                <div className="flex-1">
                  <div className="text-sm text-foreground">Researching signals for {subject}...</div>
                  <div className="mt-2 h-1 w-full rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/40 animate-[loading_2s_ease-in-out_infinite]" style={{ width: "60%" }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {aiError && (
            <div className="rounded-xl border border-border px-4 py-3 text-xs text-muted-foreground">
              {aiError}
            </div>
          )}

          <MiosBaosPanel
            brand={subject || ""}
            question={questionText}
            onAcceptSignals={(accepted) => {
              setSignals((prev) => {
                const filtered = prev.filter((s) => !isMiosBaosSignal(s));
                const updated = [...accepted as Signal[], ...filtered];
                persistSignals(updated);
                accepted.forEach((s) => persistSignalToDb(s as Signal));
                setTimeout(() => triggerGateRecalculation(updated), 0);
                return updated;
              });
            }}
          />

          <ExternalSignalScoutPanel
            activeQuestion={questionText}
            subject={subject}
            programId={subject ? `SCOUT-${subject.toUpperCase().replace(/\s+/g, "_")}` : undefined}
            therapeuticArea={storedTherapeuticArea}
            timeHorizon={activeQuestion?.timeHorizon}
            existingSignalTexts={allSignals.map((s) => s.text)}
            onAcceptSignal={(sig) => {
              const newSignal: Signal = {
                id: `scout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                text: sig.text,
                caveat: `Source: ${sig.sourceType}`,
                direction: sig.direction,
                strength: sig.strength,
                reliability: sig.reliability,
                impact: sig.strength === "High" ? "High" : sig.strength === "Low" ? "Low" : "Medium",
                category: (["evidence", "access", "competition", "guideline", "timing", "adoption"].includes(sig.category) ? sig.category : "evidence") as Category,
                source: "system",
                accepted: false,
                signal_class: "observed",
                signal_family: "brand_clinical_regulatory",
                signal_source: "external",
                source_url: null,
                source_type: sig.sourceType,
                observed_date: sig.sourceDate || null,
                citation_excerpt: null,
                brand_verified: false,
                priority_source: "ai_derived",
                is_locked: false,
              };
              setSignals((prev) => {
                const updated = [...prev, newSignal];
                persistSignals(updated);
                return updated;
              });
              persistSignalToDb(newSignal);
            }}
          />

          <SignalNormalizerPanel
            signals={allSignals.map((s) => ({
              id: s.id,
              text: s.text,
              direction: s.direction,
              strength: s.strength,
              confidence: s.reliability,
              source: s.source,
              sourceType: s.source_type,
              category: s.category,
              signalSource: s.signal_source,
            }))}
            activeQuestion={questionText}
            onRemoveDuplicate={(signalId) => {
              setSignals((prev) => {
                const updated = prev.filter((s) => s.id !== signalId);
                persistSignals(updated);
                return updated;
              });
            }}
            onFlagConflict={(signalId, conflictsWith) => {
              setSignals((prev) => {
                const updated = prev.map((s) =>
                  s.id === signalId
                    ? { ...s, conflict_with: conflictsWith }
                    : s.id === conflictsWith
                    ? { ...s, conflict_with: signalId }
                    : s
                );
                persistSignals(updated);
                return updated;
              });
            }}
          />

          <SignalQualityPanel
            question={questionText}
            signals={allSignals.map((s) => ({
              id: s.id,
              text: s.text,
              direction: s.direction,
              strength: s.strength,
              reliability: s.reliability,
              source: s.source,
              source_type: s.source_type,
              observed_date: s.observed_date || null,
            }))}
          />

          {activeQuestion?.caseId && (
            <SignalDependencyPanel caseId={activeQuestion.caseId} />
          )}

          <ConflictResolverPanel
            question={questionText}
            signals={allSignals.map((s) => ({
              id: s.id,
              text: s.text,
              direction: s.direction,
              strength: s.strength,
              reliability: s.reliability,
              source: s.source,
              source_type: s.source_type,
            }))}
          />

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
                      {topDriver.direction === "positive" ? "Supporting" : topDriver.direction === "negative" ? "Opposing" : "Neutral"}
                    </span>
                  </div>
                ) : null;
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
                      />
                    ))}
                  </div>
                )}
              </div>

              {unclassifiedPending.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-foreground">Suggested Signals From AI</h2>
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
                onClick={() => setShowWorkbookImport(true)}
                className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3 text-sm text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/50 transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Import MIOS / BAOS
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFindPanel(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={aiLoading}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Search className="w-4 h-4" />
                Find More Signals
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
                <SelectField label="Direction" value={newDirection} onChange={(v) => setNewDirection(v as Direction)} options={["positive", "negative", "neutral"]} displayLabels={["Supports outcome", "Slows outcome", "Neutral"]} />
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

          <div className="border-t border-border pt-3">
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

              {!aiLoading && allSignals.length > 0 && (
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

          <div className="flex justify-end">
            <Link href="/forecast" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500">
              Continue to Judgment
            </Link>
          </div>
        </section>
      </QuestionGate>
      <DataImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImportedRows}
        activeQuestion={questionText}
      />
      <WorkbookImportDialog
        open={showWorkbookImport}
        onClose={() => setShowWorkbookImport(false)}
        onImportComplete={handleWorkbookImport}
        caseId={activeQuestion?.caseId}
        useServerImport={true}
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
}) {
  return (
    <div className={`rounded-xl border ${isPrimaryDriver ? "border-primary/40 ring-1 ring-primary/20" : signal.workbook_meta ? "border-violet-500/20" : "border-border"} bg-card p-5 ${signal.superseded ? "opacity-40" : ""}`}>
      {isPrimaryDriver && (
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Primary Driver</span>
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
            {signal.workbook_meta ? "MIOS/BAOS" : getSourceLabel(signal)}
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
        <div className="mt-3 grid grid-cols-3 gap-3">
          <SelectField label="Direction" value={signal.direction} onChange={(v) => onUpdate({ direction: v as Direction })} options={["positive", "negative", "neutral"]} displayLabels={[`Supports ${outcomeLabel}`, `Slows ${outcomeLabel}`, "Neutral"]} />
          <SelectField label="Strength" value={signal.strength} onChange={(v) => onUpdate({ strength: v as Strength })} options={["High", "Medium", "Low"]} />
          <SelectField label="Confidence" value={signal.reliability} onChange={(v) => onUpdate({ reliability: v as Reliability })} options={["Confirmed", "Probable", "Speculative"]} displayLabels={["Strong", "Moderate", "Weak"]} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-4">
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
