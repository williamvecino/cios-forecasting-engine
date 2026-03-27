import type { ActiveQuestion, WorkflowStep } from "../lib/workflow";
import TopNav from "./top-nav";
import WorkflowStepsSidebar from "./workflow-steps-sidebar";
import ActiveQuestionBanner from "./active-question-banner";

interface Props {
  currentStep: WorkflowStep;
  activeQuestion: ActiveQuestion | null;
  onClearQuestion: () => void;
  children: React.ReactNode;
}

export default function WorkflowLayout({
  currentStep,
  activeQuestion,
  onClearQuestion,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-[1400px] px-6 py-6 space-y-5">
        <ActiveQuestionBanner
          activeQuestion={activeQuestion}
          onClear={onClearQuestion}
        />

        <div className="flex gap-6">
          <WorkflowStepsSidebar
            currentStep={currentStep}
            hasActiveQuestion={!!activeQuestion}
          />

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
