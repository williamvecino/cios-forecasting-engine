import { AppLayout } from "@/components/layout";
import { Map } from "lucide-react";
import WorkflowIndicator from "@/components/workflow-indicator";
import DataFlowBox from "@/components/data-flow-box";
import { moduleMeta } from "@/lib/module-meta";
import type { NavKey } from "@/types";
import { Link } from "wouter";

const steps: Array<{ key: NavKey; label: string; description: string; path: string }> = [
  { key: "questions", label: "Questions", description: "Define what we are predicting", path: "/cases" },
  { key: "adopter-discovery", label: "Adopter Discovery", description: "Define who will act", path: "/discovery" },
  { key: "event-radar", label: "Event Radar", description: "Track future signals", path: "/event-radar" },
  { key: "signal-detection", label: "Signal Detection", description: "Capture new information", path: "/signal-detection" },
  { key: "signal-review", label: "Signal Validation", description: "Confirm signal quality", path: "/review" },
  { key: "dashboard", label: "Dashboard / Forecast Ledger", description: "Update and review forecast", path: "/dashboard" },
  { key: "calibration", label: "Calibration", description: "Learn from outcomes", path: "/calibration" },
];

export default function SystemMapPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Map className="w-6 h-6 text-primary" />
            System Map
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Understand how modules connect across the CIOS forecasting workflow.
          </p>
        </div>

        <WorkflowIndicator current={moduleMeta["system-map"].workflowStep} />
        <DataFlowBox
          purpose={moduleMeta["system-map"].purpose}
          input={moduleMeta["system-map"].input}
          output={moduleMeta["system-map"].output}
        />

        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="mb-6 text-lg font-semibold">CIOS System Flow</div>

          <div className="space-y-4">
            {steps.map((step, idx) => (
              <Link key={step.key} href={step.path} className="flex items-center gap-4 group">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground group-hover:bg-muted/40 transition-colors">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-muted-foreground"> — {step.description}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
