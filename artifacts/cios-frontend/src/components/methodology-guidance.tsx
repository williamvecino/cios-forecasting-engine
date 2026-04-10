import { useState } from "react";
import { Info, ChevronDown, ChevronUp, Users, BarChart3, Shield, Target } from "lucide-react";
import { detectCaseType, type CaseTypeInfo } from "@/lib/case-type-utils";

type GuidanceTab = "segmentation" | "methodology";

interface MethodologyGuidanceProps {
  questionText: string;
  currentStep?: string;
}

function segmentationTitle(caseInfo: CaseTypeInfo): string {
  if (caseInfo.isSafety) return "Decision Segmentation";
  if (caseInfo.isRegulatory) return "Stakeholder Segmentation";
  return "Adoption Segmentation";
}

function SafetySegmentationGuidance() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Shield className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-white/90">Decision Segmentation</p>
          <p className="text-xs text-white/60 mt-1">
            Safety/risk cases segment prescribers by behavioral response to safety signals: continue prescribing, pause pending clarification, wait for guideline direction, or switch immediately. Risk gatekeepers and payer reviewers act as institutional constraints.
          </p>
        </div>
      </div>
      <div className="border-l-2 border-rose-500/30 pl-3 space-y-2">
        <p className="text-xs text-white/70 font-medium">Key success measures for safety cases:</p>
        <ul className="text-xs text-white/50 space-y-1 list-disc list-inside">
          <li>Switch rate monitoring — tracking prescriber movement between segments</li>
          <li>Adverse event reporting trends — frequency and severity trajectory</li>
          <li>Media sentiment trajectory — public and professional perception shifts</li>
          <li>Guideline committee response timing and direction</li>
          <li>Payer policy review outcomes and access condition changes</li>
        </ul>
      </div>
      <div className="border-l-2 border-amber-500/30 pl-3 space-y-2">
        <p className="text-xs text-white/70 font-medium">Risk management focus areas:</p>
        <ul className="text-xs text-white/50 space-y-1 list-disc list-inside">
          <li>Monitor institutional risk gatekeeper decisions (P&T committees, formulary reviews)</li>
          <li>Track regulatory safety communications and REMS updates</li>
          <li>Assess competitive displacement from alternative therapies</li>
        </ul>
      </div>
    </div>
  );
}

function RegulatorySegmentationGuidance({ caseInfo }: { caseInfo: CaseTypeInfo }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Users className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-white/90">Stakeholder Segmentation</p>
          <p className="text-xs text-white/60 mt-1">
            Regulatory cases use stakeholder segments (review divisions, safety committees, advisory panels) instead of adoption segments. Each stakeholder evaluates evidence differently based on their mandate.
          </p>
        </div>
      </div>
      <div className="border-l-2 border-blue-500/30 pl-3 space-y-2">
        <p className="text-xs text-white/70 font-medium">When segmentation adds value:</p>
        <ul className="text-xs text-white/50 space-y-1 list-disc list-inside">
          <li>Cases with mixed safety-efficacy signals affecting stakeholders differently</li>
          <li>Multiple regulatory gates with different decision-makers</li>
          <li>Cases where advisory committee sentiment diverges from review division</li>
        </ul>
      </div>
      <div className="border-l-2 border-amber-500/30 pl-3 space-y-2">
        <p className="text-xs text-white/70 font-medium">When to skip segmentation:</p>
        <ul className="text-xs text-white/50 space-y-1 list-disc list-inside">
          <li>Straightforward approval with uniform evidence quality</li>
          <li>Early-stage cases with insufficient signals for differentiation</li>
          <li>Cases where all stakeholders align on the same assessment</li>
        </ul>
      </div>
      {caseInfo.authority === "ema" && (
        <div className="bg-blue-500/10 rounded-lg p-2 mt-2">
          <p className="text-xs text-blue-300">
            <strong>EMA detected:</strong> Stakeholders include CHMP/Rapporteur, PRAC, MAH, and Scientific Advisory Group. Patient advocacy is classified as an influence factor.
          </p>
        </div>
      )}
    </div>
  );
}

function AdoptionSegmentationGuidance() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Users className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-white/90">Adoption Segmentation</p>
          <p className="text-xs text-white/60 mt-1">
            Commercial cases segment the market into adoption archetypes (Early Adopters, Persuadables, Late Movers, Resistant) to model differential uptake across physician populations.
          </p>
        </div>
      </div>
      <div className="border-l-2 border-emerald-500/30 pl-3 space-y-2">
        <p className="text-xs text-white/70 font-medium">When segmentation adds value:</p>
        <ul className="text-xs text-white/50 space-y-1 list-disc list-inside">
          <li>Heterogeneous prescriber populations with different evidence thresholds</li>
          <li>Cases with payer variation, access friction, or guideline dependencies</li>
          <li>Products requiring infrastructure or workflow changes for adoption</li>
        </ul>
      </div>
    </div>
  );
}

function SegmentationGuidance({ caseInfo }: { caseInfo: CaseTypeInfo }) {
  if (caseInfo.isSafety) return <SafetySegmentationGuidance />;
  if (caseInfo.isRegulatory) return <RegulatorySegmentationGuidance caseInfo={caseInfo} />;
  return <AdoptionSegmentationGuidance />;
}

function MethodologyInfo({ caseInfo }: { caseInfo: CaseTypeInfo }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <BarChart3 className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-white/90">CIOS Methodology</p>
          <p className="text-xs text-white/60 mt-1">
            Clinical Intelligence & Outcome System — a 7-step structured forecasting process that transforms evidence into calibrated probability estimates.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 mt-2">
        <div className="flex items-start gap-2">
          <Target className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-white/70">MIOS (Market Intelligence Operating System)</p>
            <p className="text-xs text-white/50">
              Automated signal scanning and normalization. Detects, deduplicates, and classifies evidence signals from multiple sources.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Shield className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-white/70">Forecast Engine</p>
            <p className="text-xs text-white/50">
              Converts signals into a calibrated probability with environment adjustments, guardrails, and {caseInfo.isSafety ? "safety-driven behavioral segmentation" : caseInfo.isRegulatory ? "safety ceiling constraints" : "actor-weighted scoring"}.
            </p>
          </div>
        </div>
      </div>
      {caseInfo.isSafety && (
        <div className="bg-rose-500/10 rounded-lg p-2 mt-2">
          <p className="text-xs text-rose-300">
            <strong>Safety mode:</strong> Decision layers focus on risk mitigation — prescriber behavioral segments replace adoption segments, and success measures track switch rates, adverse event trends, and media sentiment.
          </p>
        </div>
      )}
      {caseInfo.isRegulatory && !caseInfo.isSafety && (
        <div className="bg-violet-500/10 rounded-lg p-2 mt-2">
          <p className="text-xs text-violet-300">
            <strong>Regulatory mode:</strong> Decision layers are separated — regulatory approval drivers (efficacy, safety, compliance) are isolated from downstream reimbursement and adoption factors.
          </p>
        </div>
      )}
    </div>
  );
}

export function MethodologyGuidance({ questionText, currentStep }: MethodologyGuidanceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<GuidanceTab>("segmentation");
  const caseInfo = detectCaseType(questionText || "");

  const showSegmentation = !currentStep || ["forecast", "respond", "simulate"].includes(currentStep);

  if (!showSegmentation && currentStep !== "signals") return null;

  const tabLabel = segmentationTitle(caseInfo);

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white/80">Guidance</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-white/40" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <div className="flex gap-1 mb-3 border-b border-white/10 pb-2">
            <button
              onClick={() => setActiveTab("segmentation")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "segmentation"
                  ? "bg-blue-500/20 text-blue-300"
                  : "text-white/50 hover:text-white/70 hover:bg-white/5"
              }`}
            >
              {tabLabel}
            </button>
            <button
              onClick={() => setActiveTab("methodology")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "methodology"
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-white/50 hover:text-white/70 hover:bg-white/5"
              }`}
            >
              MIOS / CIOS
            </button>
          </div>
          {activeTab === "segmentation" ? (
            <SegmentationGuidance caseInfo={caseInfo} />
          ) : (
            <MethodologyInfo caseInfo={caseInfo} />
          )}
        </div>
      )}
    </div>
  );
}
