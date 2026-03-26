import { useEffect, useMemo, useState } from "react";
import {
  MOCK_CASE,
  MOCK_CASE_STEPS,
} from "@/lib/mock-case";
import type { Scenario, DriverImpact, ScenarioDecision } from "@/lib/mock-case";

interface Props {
  open: boolean;
  onClose: () => void;
}

const AUTO_PLAY_MS = 2500;

export default function MockCaseTour({ open, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    if (!open || !autoPlay) return;

    const id = window.setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= MOCK_CASE_STEPS.length - 1) {
          window.clearInterval(id);
          return prev;
        }
        return prev + 1;
      });
    }, AUTO_PLAY_MS);

    return () => window.clearInterval(id);
  }, [open, autoPlay]);

  useEffect(() => {
    if (!open) {
      setCurrentIndex(0);
      setAutoPlay(false);
    }
  }, [open]);

  const currentStep = MOCK_CASE_STEPS[currentIndex];

  const stepContent = useMemo(() => {
    switch (currentStep.key) {
      case "question":
        return (
          <div className="space-y-4">
            <MockBlock title="Strategic Question">
              {MOCK_CASE.question}
            </MockBlock>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MockBlock title="Case ID">{MOCK_CASE.caseId}</MockBlock>
              <MockBlock title="Time Horizon">{MOCK_CASE.timeHorizon}</MockBlock>
            </div>
          </div>
        );

      case "signals":
        return (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MockBlock title="Positive Signals">
              <BulletItems items={MOCK_CASE.signals.positive} />
            </MockBlock>
            <MockBlock title="Negative Signals">
              <BulletItems items={MOCK_CASE.signals.negative} />
            </MockBlock>
            <MockBlock title="Context">
              <BulletItems items={MOCK_CASE.signals.context} />
            </MockBlock>
          </div>
        );

      case "forecast":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MockMetric title="Probability" value={MOCK_CASE.forecast.probability} />
              <MockMetric title="Timing" value={MOCK_CASE.forecast.timing} />
              <MockMetric title="Case" value={MOCK_CASE.caseId} />
            </div>

            <MockBlock title="Key Drivers">
              <BulletItems items={MOCK_CASE.forecast.keyDrivers} />
            </MockBlock>

            <div>
              <div className="text-sm font-semibold text-foreground">
                Scenario Planning
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                {MOCK_CASE.scenarios.map((s) => (
                  <ScenarioCard key={s.name} scenario={s} />
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-foreground">
                Driver Impact
              </div>
              <div className="mt-3 rounded-xl border border-border bg-muted/10 p-4">
                {MOCK_CASE.driverImpact.map((d) => (
                  <DriverImpactRow key={d.name} driver={d} />
                ))}
              </div>
            </div>
          </div>
        );

      case "decide":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MockBlock title="Adoption Segment">
                {MOCK_CASE.decision.adoptionSegment}
              </MockBlock>
              <MockBlock title="Barrier Diagnosis">
                {MOCK_CASE.decision.barrier}
              </MockBlock>
              <MockBlock title="Readiness Timeline">
                {MOCK_CASE.decision.readiness}
              </MockBlock>
              <MockBlock title="Competitive Risk">
                {MOCK_CASE.decision.competitiveRisk}
              </MockBlock>
              <div className="md:col-span-2">
                <MockBlock title="Growth Feasibility">
                  {MOCK_CASE.decision.growthFeasibility}
                </MockBlock>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-foreground">
                Recommended Actions by Scenario
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                {MOCK_CASE.scenarioDecisions.map((item) => (
                  <ScenarioDecisionCard key={item.scenario} item={item} />
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [currentStep.key]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="h-full w-full max-w-[680px] overflow-y-auto border-l border-border bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Mock Case Demo
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              See how the tool works from question to decision
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This is a guided example flow. It teaches the process without requiring a live case.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
          >
            Close
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {MOCK_CASE_STEPS.map((step, index) => {
            const active = index === currentIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={[
                  "rounded-xl border px-4 py-3 text-left transition",
                  active
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border bg-muted/10 text-muted-foreground hover:border-border/80 hover:bg-muted/20",
                ].join(" ")}
              >
                <div className="text-sm font-semibold">{step.label}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {currentStep.label}
          </div>
          <h3 className="mt-2 text-xl font-semibold text-foreground">
            {currentStep.title}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">{currentStep.description}</p>

          <div className="mt-4 rounded-xl border border-border bg-muted/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              What this step shows
            </div>
            <div className="mt-3 space-y-2">
              {currentStep.highlights.map((item) => (
                <div key={item} className="text-sm text-muted-foreground">
                  • {item}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">{stepContent}</div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
              disabled={currentIndex === 0}
              className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>

            <button
              type="button"
              onClick={() =>
                setCurrentIndex((prev) =>
                  Math.min(prev + 1, MOCK_CASE_STEPS.length - 1)
                )
              }
              disabled={currentIndex === MOCK_CASE_STEPS.length - 1}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAutoPlay((prev) => !prev)}
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
          >
            {autoPlay ? "Stop autoplay" : "Play walkthrough"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MockBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        {title}
      </div>
      <div className="mt-3 text-sm text-foreground/90">{children}</div>
    </div>
  );
}

function MockMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        {title}
      </div>
      <div className="mt-3 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function BulletItems({ items }: { items: string[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item} className="text-sm text-muted-foreground">
          • {item}
        </div>
      ))}
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        {scenario.name}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">
        {scenario.probability}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        {scenario.description}
      </div>
    </div>
  );
}

function DriverImpactRow({ driver }: { driver: DriverImpact }) {
  const color =
    driver.direction === "up" ? "text-emerald-400" : "text-red-400";

  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2.5 last:border-b-0">
      <div className="text-sm text-foreground/90">{driver.name}</div>
      <div className={`text-sm font-semibold ${color}`}>
        {driver.direction === "up" ? "Upward" : "Downward"}
      </div>
      <div className="text-sm text-muted-foreground">{driver.strength}</div>
    </div>
  );
}

function ScenarioDecisionCard({ item }: { item: ScenarioDecision }) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        {item.scenario}
      </div>
      <div className="mt-2 text-sm text-foreground/90">{item.action}</div>
    </div>
  );
}
