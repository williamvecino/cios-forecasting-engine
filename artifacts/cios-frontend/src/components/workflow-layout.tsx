import { useState } from "react";
import type { ActiveQuestion, WorkflowStep } from "../lib/workflow";
import ActiveQuestionBanner from "./active-question-banner";
import AdvancedDrawer from "./advanced-drawer";
import WorkflowSidebar from "./workflow-sidebar";
import MockCaseTour from "./mock-case/mock-case-tour";

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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mockCaseOpen, setMockCaseOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-7xl space-y-6">
        <ActiveQuestionBanner
          activeQuestion={activeQuestion}
          onClear={onClearQuestion}
        />

        <div className="flex flex-col gap-6 lg:flex-row">
          <WorkflowSidebar
            currentStep={currentStep}
            hasActiveQuestion={!!activeQuestion}
            onToggleAdvanced={() => setAdvancedOpen(true)}
            onOpenMockCase={() => setMockCaseOpen(true)}
          />

          <main className="flex-1">{children}</main>
        </div>
      </div>

      <AdvancedDrawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
      />

      <MockCaseTour
        open={mockCaseOpen}
        onClose={() => setMockCaseOpen(false)}
      />
    </div>
  );
}
