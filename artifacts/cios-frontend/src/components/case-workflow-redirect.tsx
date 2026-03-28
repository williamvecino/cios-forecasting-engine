import { useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetCase } from "@workspace/api-client-react";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { clearCaseState } from "@/lib/workflow";
import { Loader2 } from "lucide-react";

const STEP_MAP: Record<string, string> = {
  question: "/question",
  signals: "/signals",
  forecast: "/forecast",
  decide: "/decide",
  respond: "/respond",
  ledger: "/forecast",
  scenario: "/forecast",
  discover: "/signals",
  "pending-signals": "/signals",
  analogs: "/forecast",
  portfolio: "/decide",
  agents: "/signals",
};

function inferQuestionType(text: string): string {
  const lower = text.toLowerCase();
  if (/\bwhich\b.*\b(first|fastest|most|best|rank)\b/.test(lower)) return "ranking";
  if (/\bcompare\b|\bversus\b|\bvs\.?\b|\bfaster than\b|\bmore than\b/.test(lower)) return "comparative";
  if (/\bexceed\b|\bthreshold\b|\breach\b.*%|\bsurpass\b/.test(lower)) return "threshold";
  if (/\bwhen\b.*\bwill\b|\btiming\b|\bhow soon\b/.test(lower)) return "timing";
  return "binary";
}

function inferEntities(text: string): string[] {
  const vsMatch = text.match(/\b(\w[\w\s-]+?)\s+(?:vs\.?|versus|compared to|or)\s+(\w[\w\s-]+?)(?:\s+(?:in|within|by|for|among)\b|\?|$)/i);
  if (vsMatch) return [vsMatch[1].trim(), vsMatch[2].trim()];
  return [];
}

export default function CaseWorkflowRedirect({ targetStep }: { targetStep: string }) {
  const [, params] = useRoute("/case/:caseId/:rest*");
  const caseId = params?.caseId ?? "";
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion } = useActiveQuestion();
  const redirectedRef = useRef(false);

  const { data: caseData, isLoading, isError } = useGetCase(caseId, {
    query: { enabled: !!caseId },
  });

  useEffect(() => {
    if (redirectedRef.current) return;
    if (!caseId || isLoading) return;

    if (activeQuestion?.caseId === caseId) {
      redirectedRef.current = true;
      navigate(STEP_MAP[targetStep] || "/question", { replace: true });
      return;
    }

    if (!caseData) return;

    const cd = caseData as any;
    const questionText = cd.strategicQuestion || cd.assetName || "Untitled case";
    const questionType = inferQuestionType(questionText);
    const entities = inferEntities(questionText);

    const prevCaseId = activeQuestion?.caseId;
    if (prevCaseId && prevCaseId !== caseId) {
      clearCaseState(prevCaseId);
    }
    try { localStorage.removeItem("cios.therapeuticArea"); } catch {}
    try { localStorage.removeItem("cios.questionDraft"); } catch {}

    createQuestion({
      text: questionText,
      rawInput: cd.strategicQuestion || "",
      caseId: cd.caseId || cd.id,
      timeHorizon: cd.timeHorizon || "12 months",
      questionType,
      entities,
      subject: cd.assetName || cd.primaryBrand || "",
      outcome: cd.outcomeDefinition || "adoption",
    });

    if (cd.therapeuticArea) {
      try {
        localStorage.setItem("cios.therapeuticArea", cd.therapeuticArea);
      } catch {}
    }

    redirectedRef.current = true;
    navigate(STEP_MAP[targetStep] || "/question", { replace: true });
  }, [caseId, caseData, isLoading, activeQuestion, targetStep, navigate, createQuestion]);

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-sm text-muted-foreground">Case not found.</div>
          <button
            type="button"
            onClick={() => navigate("/question", { replace: true })}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Start New Forecast
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <div className="text-sm text-muted-foreground">Loading case...</div>
      </div>
    </div>
  );
}
