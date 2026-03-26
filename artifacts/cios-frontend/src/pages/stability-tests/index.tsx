import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ForecastCaseInput } from "@/lib/types";
import { runStabilitySuite, type StabilityTestResult } from "@/lib/stability-tests";

const sampleCase: ForecastCaseInput = {
  caseId: "CASE_STABILITY_001",
  question: "Will adoption exceed 35% within 24 months?",
  priorProbability: 0.42,
  environment: {
    specialtyActorProfile: "general",
    payerEnvironment: "balanced",
    guidelineLeverage: "medium",
    competitiveLandscape: "entrenched_standard_of_care",
    accessFrictionIndex: 0.5,
    adoptionPhase: "early_adoption",
    forecastHorizonMonths: 12,
  },
  signals: [
    {
      id: "SIG_001",
      label: "Positive pivotal efficacy signal",
      likelihoodRatio: 1.5,
      reliability: 0.9,
      strength: 0.9,
      direction: "positive",
      enabled: true,
    },
    {
      id: "SIG_002",
      label: "Restrictive payer commentary",
      likelihoodRatio: 0.8,
      reliability: 0.8,
      strength: 0.7,
      direction: "negative",
      enabled: true,
    },
  ],
};

export default function CIOSStabilityTestPage() {
  const [results, setResults] = useState<StabilityTestResult[]>([]);

  const allPassed = results.length > 0 && results.every((r) => r.passed);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Stability Test Suite
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify engine determinism, probability bounds, and sensitivity correctness.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                CIOS Engine Stability Suite
              </div>
              {results.length > 0 && (
                <div className={`mt-2 text-sm font-medium ${allPassed ? "text-green-400" : "text-red-400"}`}>
                  {allPassed
                    ? `All ${results.length} tests passed`
                    : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed`}
                </div>
              )}
            </div>
            <Button onClick={() => setResults(runStabilitySuite(sampleCase))}>
              Run Stability Suite
            </Button>
          </div>
        </div>

        {results.map((result) => (
          <div
            key={result.testName}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div
              className={`text-sm font-semibold ${
                result.passed ? "text-green-400" : "text-red-400"
              }`}
            >
              {result.passed ? "PASS" : "FAIL"} — {result.testName}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{result.details}</div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
