import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import TopNav from "@/components/top-nav";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  FileText,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  Quote,
  Tag,
  Target,
  Layers,
  Clock,
  Loader2,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const ARCHETYPE_LABELS: Record<string, string> = {
  launch_strategy: "Launch Strategy",
  adoption_risk: "Adoption Risk",
  market_access: "Market Access",
  competitive_positioning: "Competitive Positioning",
  operational_readiness: "Operational Readiness",
  resource_allocation: "Resource Allocation",
  stakeholder_behavior: "Stakeholder Behavior",
  capability_gap: "Capability Gap",
  vendor_selection: "Vendor Selection",
  portfolio_strategy: "Portfolio Strategy",
  evidence_positioning: "Evidence Positioning",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-400 border-green-500/30 bg-green-500/10",
  moderate: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  low: "text-red-400 border-red-500/30 bg-red-500/10",
};

interface EvidenceSpan {
  judgment: string;
  span: string;
  reasoning: string;
}

interface CandidateQuestion {
  rank: number;
  questionText: string;
  rationale: string;
}

interface ClassificationResult {
  classificationId: string;
  domain: string;
  decisionArchetype: string;
  primaryDecision: string;
  supportingDecisions: string[];
  deferredDecisions: string[];
  confidence: string;
  confidenceRationale: string | null;
  evidenceSpans: EvidenceSpan[];
  alternativeArchetype: string | null;
  candidateQuestions: CandidateQuestion[];
  guardrailApplied: boolean;
  guardrailReason: string | null;
  documentType: string;
  requiresReview: boolean;
}

type Phase = "input" | "classifying" | "review";

export default function IngestPage() {
  const [, navigate] = useLocation();
  const { createQuestion } = useActiveQuestion();

  const [sourceText, setSourceText] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<number>(0);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showDeferred, setShowDeferred] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  const handleClassify = useCallback(async () => {
    if (!sourceText.trim()) return;
    setPhase("classifying");
    setError(null);

    try {
      const res = await fetch(`${API}/api/agents/decision-classification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText: sourceText.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Classification failed");
      }

      const data = await res.json();
      setClassification(data.classification);
      setSelectedQuestion(0);
      setReviewConfirmed(false);
      setPhase("review");
    } catch (err: any) {
      setError(err.message || "Classification failed");
      setPhase("input");
    }
  }, [sourceText]);

  const handleApprove = useCallback(async () => {
    if (!classification) return;
    setSubmitting(true);
    setError(null);

    try {
      const q = classification.candidateQuestions[selectedQuestion];
      if (!q) throw new Error("No question selected");

      const caseId = `CASE-${Date.now()}`;

      const caseRes = await fetch(`${API}/api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          assetName: classification.domain,
          strategicQuestion: q.questionText,
          outcomeDefinition: classification.primaryDecision,
          targetType: classification.decisionArchetype,
        }),
      });

      if (!caseRes.ok) {
        throw new Error("Failed to create case");
      }

      await fetch(`${API}/api/decision-classifications/${classification.classificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "approved",
          caseId,
          userConfirmedArchetype: classification.decisionArchetype,
        }),
      });

      try {
        localStorage.setItem(`cios.scenarioName:${caseId}`, "Baseline");
        localStorage.setItem(`cios.signalsLocked:${caseId}`, "false");
      } catch {}

      if (classification.deferredDecisions.length > 0) {
        const questions = [
          {
            questionText: q.questionText,
            questionRole: "primary",
            questionType: "strategic",
          },
          ...classification.deferredDecisions.map((dd, i) => ({
            questionText: dd,
            questionRole: "secondary",
            questionType: "strategic",
            priorityRank: i + 1,
            source: "ingestion_deferred",
          })),
        ];

        await fetch(`${API}/api/cases/${caseId}/question-repository`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions }),
        });
      }

      createQuestion({
        text: q.questionText,
        rawInput: sourceText.trim(),
        caseId,
        subject: classification.domain,
        outcome: classification.primaryDecision,
      });

      const sentences = sourceText
        .trim()
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);

      const facts = sentences.map((s, i) => ({
        text: s,
        source: classification.documentType,
        category: i < Math.ceil(sentences.length / 2) ? "primary" : "supporting",
      }));

      if (facts.length > 0) {
        localStorage.setItem(
          "cios.interpretationPayload",
          JSON.stringify({
            facts,
            decisionContext: {
              primaryDecision: classification.primaryDecision,
              domain: classification.domain,
              decisionArchetype: classification.decisionArchetype,
              questionText: q.questionText,
            },
            caseId,
          })
        );
        navigate("/interpret");
      } else {
        navigate("/signals");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create case");
    } finally {
      setSubmitting(false);
    }
  }, [classification, selectedQuestion, sourceText, createQuestion, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Document Ingestion</h1>
          <span className="ml-auto text-xs text-muted-foreground uppercase tracking-wider">
            {phase === "input" ? "Step 1: Paste Text" : phase === "classifying" ? "Classifying..." : "Step 2: Review Classification"}
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {phase === "input" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <label className="block text-lg font-semibold">Paste your document text</label>
              <p className="text-sm text-muted-foreground">
                Paste full text from RFPs, competitive intelligence docs, emails, slide decks, strategy memos, or notes.
                The system will classify the decision before any forecast case is created.
              </p>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste the full document text here..."
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[240px] resize-y"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {sourceText.trim().split(/\s+/).filter(Boolean).length} words
                </span>
                <button
                  type="button"
                  disabled={!sourceText.trim() || sourceText.trim().split(/\s+/).length < 10}
                  onClick={handleClassify}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Classify Decision <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/question")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Question
            </button>
          </div>
        )}

        {phase === "classifying" && (
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Classifying decision from source text...</p>
          </div>
        )}

        {phase === "review" && classification && (
          <div className="space-y-6">
            {classification.requiresReview && (
              <div className="rounded-2xl border border-red-500/20 bg-gradient-to-b from-red-500/[0.06] to-[#0A1736] p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-7 h-7 text-red-400" />
                  <div>
                    <h3 className="text-white font-semibold text-sm">Low Confidence — Review Required</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      The classification confidence is low. You must review and confirm before proceeding.
                    </p>
                  </div>
                </div>
                {classification.confidenceRationale && (
                  <p className="text-sm text-red-200 bg-red-500/5 rounded-xl px-4 py-3 border border-red-500/10">
                    {classification.confidenceRationale}
                  </p>
                )}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reviewConfirmed}
                    onChange={(e) => setReviewConfirmed(e.target.checked)}
                    className="rounded border-red-500/30"
                  />
                  <span className="text-sm text-red-200">I have reviewed the classification and confirm it is correct</span>
                </label>
              </div>
            )}

            {classification.guardrailApplied && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-sm font-medium text-amber-300">Vendor Selection Guardrail Applied</span>
                  <p className="text-xs text-amber-200/70 mt-1">{classification.guardrailReason}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Tag className="w-3.5 h-3.5" /> Domain
                </div>
                <div className="text-lg font-bold">{classification.domain}</div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5" /> Archetype
                </div>
                <div className="text-lg font-bold">{ARCHETYPE_LABELS[classification.decisionArchetype] || classification.decisionArchetype}</div>
                {classification.alternativeArchetype && (
                  <div className="text-xs text-muted-foreground">
                    Alt: {classification.alternativeArchetype}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Target className="w-3.5 h-3.5" /> Confidence
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${CONFIDENCE_COLORS[classification.confidence] || ""}`}>
                  {classification.confidence === "high" && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {classification.confidence === "moderate" && <AlertTriangle className="w-3.5 h-3.5" />}
                  {classification.confidence === "low" && <ShieldAlert className="w-3.5 h-3.5" />}
                  {classification.confidence.charAt(0).toUpperCase() + classification.confidence.slice(1)}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" /> Document Type
                </div>
                <div className="text-lg font-bold capitalize">{classification.documentType.replace(/_/g, " ")}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Primary Decision</div>
              <div className="text-sm font-medium text-foreground">{classification.primaryDecision}</div>
            </div>

            {classification.supportingDecisions.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Supporting Decisions</div>
                <ul className="space-y-2">
                  {classification.supportingDecisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-xs text-muted-foreground mt-0.5 shrink-0">{i + 1}.</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {classification.deferredDecisions.length > 0 && (
              <div className="rounded-2xl border border-amber-500/10 bg-card p-5 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowDeferred(!showDeferred)}
                  className="flex items-center gap-2 text-xs text-amber-400 uppercase tracking-wider w-full"
                >
                  Deferred Decisions ({classification.deferredDecisions.length})
                  {showDeferred ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                </button>
                {showDeferred && (
                  <ul className="space-y-2 pt-2">
                    {classification.deferredDecisions.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-200/80">
                        <span className="text-xs text-amber-400 mt-0.5 shrink-0">→</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">These will be stored as deferred questions, separate from the active forecast.</p>
              </div>
            )}

            <div className="rounded-2xl border border-primary/20 bg-card p-5 space-y-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Candidate Questions — Select Primary</div>
              <div className="space-y-3">
                {classification.candidateQuestions.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedQuestion(i)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                      selectedQuestion === i
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:border-primary/20"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                        selectedQuestion === i ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground"
                      }`}>
                        #{q.rank}
                      </span>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground">{q.questionText}</div>
                        <div className="text-xs text-muted-foreground">{q.rationale}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <button
                type="button"
                onClick={() => setShowEvidence(!showEvidence)}
                className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider w-full"
              >
                <Quote className="w-3.5 h-3.5" /> Evidence Spans ({classification.evidenceSpans.length})
                {showEvidence ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
              </button>
              {showEvidence && (
                <div className="space-y-3 pt-2">
                  {classification.evidenceSpans.map((es, i) => (
                    <div key={i} className="rounded-xl border border-border bg-background/50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 text-[10px] font-medium text-cyan-400 uppercase">
                          {es.judgment}
                        </span>
                      </div>
                      <blockquote className="text-sm text-slate-300 border-l-2 border-cyan-500/30 pl-3 italic">
                        "{es.span}"
                      </blockquote>
                      <p className="text-xs text-muted-foreground">{es.reasoning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => { setPhase("input"); setClassification(null); }}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Reclassify
              </button>

              <button
                type="button"
                disabled={
                  submitting ||
                  (classification.requiresReview && !reviewConfirmed) ||
                  classification.candidateQuestions.length === 0
                }
                onClick={handleApprove}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating Case...</>
                ) : (
                  <>Approve & Create Case <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>

            <div className="rounded-xl bg-slate-800/30 border border-border px-4 py-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Audit Trail</div>
              <div className="text-xs text-slate-400 font-mono">{classification.classificationId}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
