import { ReactNode } from "react";
import { useLocation } from "wouter";
import { useActiveQuestion } from "@/hooks/use-active-question";
import type { WorkflowStep } from "@/lib/workflow";
import WorkflowLayout from "./workflow-layout";

function resolveCurrentStep(location: string): WorkflowStep {
  if (location.startsWith("/question")) return "question";
  if (location.startsWith("/signals")) return "signals";
  if (location.startsWith("/forecast")) return "forecast";
  return "question";
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const currentStep = resolveCurrentStep(location);

  return (
    <WorkflowLayout
      currentStep={currentStep}
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      {children}
    </WorkflowLayout>
  );
}
