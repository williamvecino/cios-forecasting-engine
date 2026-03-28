import { useState, useEffect, useRef } from "react";
import type { ActiveQuestion, WorkflowStep } from "../lib/workflow";
import TopNav from "./top-nav";
import WorkflowStepsSidebar from "./workflow-steps-sidebar";
import ActiveQuestionBanner from "./active-question-banner";
import AssumptionRegistry, { AssumptionTriggerButton } from "./assumption-registry";
import { useAssumptions } from "../hooks/use-assumptions";

interface Props {
  currentStep: WorkflowStep;
  activeQuestion: ActiveQuestion | null;
  draftText?: string;
  onClearQuestion: () => void;
  children: React.ReactNode;
}

const ASSUMPTION_VISIBLE_STEPS: WorkflowStep[] = ["forecast", "decide", "respond", "simulate"];
const AUTO_TRIGGER_STEPS: WorkflowStep[] = ["decide", "respond"];

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

  const showButton = activeQuestion && ASSUMPTION_VISIBLE_STEPS.includes(currentStep);
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
          <div className="space-y-3">
            <WorkflowStepsSidebar
              currentStep={currentStep}
              hasActiveQuestion={!!activeQuestion}
            />
            {showButton && (
              <div className="pl-2">
                <AssumptionTriggerButton
                  count={assumptions.length}
                  hasInvalidated={hasInvalidated}
                  onClick={() => setShowAssumptions(true)}
                />
              </div>
            )}
          </div>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>

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
