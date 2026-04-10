import type { ActiveQuestion, WorkflowStep } from "../lib/workflow";
import TopNav from "./top-nav";
import WorkflowStepsSidebar from "./workflow-steps-sidebar";
import ActiveQuestionBanner from "./active-question-banner";
import { MethodologyGuidance } from "./methodology-guidance";

interface Props {
  currentStep: WorkflowStep;
  activeQuestion: ActiveQuestion | null;
  draftText?: string;
  onClearQuestion: () => void;
  onStageOverride?: (stage: string) => void;
  children: React.ReactNode;
}

export default function WorkflowLayout({
  currentStep,
  activeQuestion,
  draftText,
  onClearQuestion,
  onStageOverride,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-[1400px] px-6 py-6 space-y-5">
        <ActiveQuestionBanner
          activeQuestion={activeQuestion}
          draftText={draftText}
          onClear={onClearQuestion}
          onStageOverride={onStageOverride}
        />

        <div className="flex gap-6">
          <div className="space-y-4">
            <WorkflowStepsSidebar
              currentStep={currentStep}
              hasActiveQuestion={!!activeQuestion}
            />
            {activeQuestion && (
              <MethodologyGuidance
                questionText={activeQuestion.text || ""}
                currentStep={currentStep}
              />
            )}
          </div>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
