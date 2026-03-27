import type { ActiveQuestion, WorkflowStep } from "../lib/workflow";
import TopNav from "./top-nav";
import ForecastStepper from "./forecast-stepper";
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

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-5">
        <ActiveQuestionBanner
          activeQuestion={activeQuestion}
          onClear={onClearQuestion}
        />

        <ForecastStepper hasActiveQuestion={!!activeQuestion} />

        <main>{children}</main>
      </div>
    </div>
  );
}
