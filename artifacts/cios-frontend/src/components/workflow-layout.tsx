import { useState, useEffect, useRef } from "react";
import { Shield } from "lucide-react";
import type { ActiveQuestion, WorkflowStep } from "../lib/workflow";
import TopNav from "./top-nav";
import WorkflowStepsSidebar from "./workflow-steps-sidebar";
import ActiveQuestionBanner from "./active-question-banner";
import AssumptionRegistry from "./assumption-registry";
import { useAssumptions } from "../hooks/use-assumptions";

interface Props {
  currentStep: WorkflowStep;
  activeQuestion: ActiveQuestion | null;
  draftText?: string;
  onClearQuestion: () => void;
  children: React.ReactNode;
}

const AUTO_TRIGGER_STEPS: WorkflowStep[] = ["decide", "respond"];
const DIAGNOSTICS_VISIBLE_STEPS: WorkflowStep[] = ["forecast", "decide", "respond", "simulate"];

export default function WorkflowLayout({
  currentStep,
  activeQuestion,
  draftText,
  onClearQuestion,
  children,
}: Props) {
  const caseId = activeQuestion?.caseId || activeQuestion?.id;
  const [showAssumptions, setShowAssumptions] = useState(false);
  const {
    assumptions,
    loading,
    error,
    lastExtracted,
    recalculationTriggered,
    extractAssumptions,
    updateStatus,
  } = useAssumptions(caseId);
  const autoTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!caseId || !AUTO_TRIGGER_STEPS.includes(currentStep)) return;

    const triggerKey = `${currentStep}:${caseId}`;
    if (autoTriggeredRef.current === triggerKey) return;

    const stepDataKey = currentStep === "decide"
      ? `cios.decideResult:${caseId}`
      : `cios.respondResult:${caseId}`;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkAndTrigger = () => {
      const hasData = localStorage.getItem(stepDataKey);
      if (hasData) {
        autoTriggeredRef.current = triggerKey;
        timeoutId = setTimeout(() => extractAssumptions(true), 2000);
      }
    };

    checkAndTrigger();

    const interval = setInterval(checkAndTrigger, 5000);
    return () => {
      clearInterval(interval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [caseId, currentStep, extractAssumptions]);

  const hasInvalidated = assumptions.some(a => a.assumptionStatus === "invalidated");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-[1400px] px-6 py-6 space-y-5">
        <ActiveQuestionBanner
          activeQuestion={activeQuestion}
          draftText={draftText}
          onClear={onClearQuestion}
        />

        <div className="flex gap-6">
          <WorkflowStepsSidebar
            currentStep={currentStep}
            hasActiveQuestion={!!activeQuestion}
            assumptionCount={assumptions.length}
            hasInvalidatedAssumptions={hasInvalidated}
            onOpenAssumptions={() => setShowAssumptions(true)}
          />

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>

      {activeQuestion && DIAGNOSTICS_VISIBLE_STEPS.includes(currentStep) && (
        <button
          onClick={() => setShowAssumptions(true)}
          className="fixed bottom-6 right-6 lg:hidden z-40 flex items-center gap-2 rounded-full bg-card border border-border shadow-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
        >
          <Shield className="w-4 h-4" />
          Assumptions
          {assumptions.length > 0 && (
            <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-bold">
              {assumptions.length}
            </span>
          )}
          {hasInvalidated && (
            <span className="rounded-full bg-rose-400/10 text-rose-400 px-1.5 py-0.5 text-[10px] font-bold">
              !
            </span>
          )}
        </button>
      )}

      {showAssumptions && (
        <AssumptionRegistry
          assumptions={assumptions}
          loading={loading}
          error={error}
          lastExtracted={lastExtracted}
          recalculationTriggered={recalculationTriggered}
          onExtract={extractAssumptions}
          onUpdateStatus={updateStatus}
          onClose={() => setShowAssumptions(false)}
        />
      )}
    </div>
  );
}
