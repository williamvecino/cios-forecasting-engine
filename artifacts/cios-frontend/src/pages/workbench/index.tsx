import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Wrench } from "lucide-react";
import type { ForecastCaseInput } from "@/lib/types";
import {
  initialForecastRunState,
  markForecastDirty,
  recalculateForecast,
} from "@/lib/recalculation-controller";
import ForecastStabilityPanel from "@/components/forecast-stability-panel";
import { toPercent } from "@/lib/stability";

const defaultCase: ForecastCaseInput = {
  caseId: "CASE_001",
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
    {
      id: "SIG_003",
      label: "Guideline pathway plausible but not imminent",
      likelihoodRatio: 1.1,
      reliability: 0.6,
      strength: 0.5,
      direction: "positive",
      enabled: true,
    },
  ],
};

export default function CIOSWorkbench() {
  const [forecastInput, setForecastInput] = useState<ForecastCaseInput>(defaultCase);
  const [runState, setRunState] = useState(initialForecastRunState);

  const currentOutput = useMemo(() => runState.lastOutput, [runState.lastOutput]);

  const onRecalculate = async () => {
    setRunState((prev) => ({ ...prev, status: "running", errorMessage: null }));
    const nextState = await recalculateForecast(forecastInput);
    setRunState(nextState);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Wrench className="w-6 h-6 text-primary" />
            CIOS Workbench
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Interactive forecast sandbox — adjust inputs, run the core engine, and inspect outputs.
          </p>
        </div>

        <ForecastStabilityPanel state={runState} onRecalculate={onRecalculate} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Quick Stability Controls
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-2 block text-sm text-muted-foreground">
                  Prior Probability
                </label>
                <input
                  type="number"
                  min={0.01}
                  max={0.99}
                  step={0.01}
                  value={forecastInput.priorProbability}
                  onChange={(e) => {
                    setForecastInput((prev) => ({
                      ...prev,
                      priorProbability: Number(e.target.value),
                    }));
                    setRunState((prev) =>
                      markForecastDirty(prev, "Prior probability changed")
                    );
                  }}
                  className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-muted-foreground">
                  Access Friction Index
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={forecastInput.environment.accessFrictionIndex ?? 0.5}
                  onChange={(e) => {
                    setForecastInput((prev) => ({
                      ...prev,
                      environment: {
                        ...prev.environment,
                        accessFrictionIndex: Number(e.target.value),
                      },
                    }));
                    setRunState((prev) =>
                      markForecastDirty(prev, "Environment changed")
                    );
                  }}
                  className="w-full"
                />
                <div className="mt-2 text-sm text-muted-foreground">
                  {Number(forecastInput.environment.accessFrictionIndex ?? 0.5).toFixed(2)}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-muted-foreground">
                  Forecast Horizon
                </label>
                <select
                  value={forecastInput.environment.forecastHorizonMonths ?? 12}
                  onChange={(e) => {
                    setForecastInput((prev) => ({
                      ...prev,
                      environment: {
                        ...prev.environment,
                        forecastHorizonMonths: Number(e.target.value) as 6 | 12 | 24 | 36,
                      },
                    }));
                    setRunState((prev) =>
                      markForecastDirty(prev, "Forecast horizon changed")
                    );
                  }}
                  className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground"
                >
                  <option value={6}>6 months</option>
                  <option value={12}>12 months</option>
                  <option value={24}>24 months</option>
                  <option value={36}>36 months</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Forecast Output
            </div>

            {!currentOutput ? (
              <div className="mt-6 text-muted-foreground">
                No forecast yet. Run recalculation.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <Metric label="Starting Probability" value={toPercent(currentOutput.priorProbability)} />
                <Metric label="Updated Probability" value={toPercent(currentOutput.posteriorProbability)} />
                <Metric label="Adjusted Probability" value={toPercent(currentOutput.adjustedProbability)} />
                <Metric label="Signal Count" value={`${currentOutput.signalCount}`} />
                <Metric label="Effective Signal Count" value={`${currentOutput.effectiveSignalCount}`} />

                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="text-sm font-medium text-foreground">
                    Stability fingerprints
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Input: {currentOutput.inputFingerprint}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Environment: {currentOutput.environmentFingerprint}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
