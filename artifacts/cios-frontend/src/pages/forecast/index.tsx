import { useEffect, useState } from "react";
import { Link } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { MOCK_CASE } from "@/lib/mock-case";
import {
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  BookOpen,
  Target,
  BarChart3,
  Layers,
  TrendingUp,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type Tab = "forecast" | "scenarios" | "drivers" | "library";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "forecast", label: "Current Forecast", icon: <Target className="w-4 h-4" /> },
  { key: "scenarios", label: "Scenario Planning", icon: <Layers className="w-4 h-4" /> },
  { key: "drivers", label: "Driver Impact", icon: <TrendingUp className="w-4 h-4" /> },
  { key: "library", label: "Case Library", icon: <BookOpen className="w-4 h-4" /> },
];

interface CaseRow {
  id: string;
  caseId: string;
  strategicQuestion: string;
  currentProbability: number | null;
  confidenceLevel: string | null;
  timeHorizon: string | null;
  updatedAt: string;
  primaryBrand: string | null;
  therapeuticArea?: string;
}

export default function ForecastPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [tab, setTab] = useState<Tab>("forecast");

  return (
    <WorkflowLayout
      currentStep="forecast"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <section className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Step 3
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            What is likely to happen?
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Review forecasts, explore scenarios, understand driver impact,
            and browse all cases in one place.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 border-b border-border pb-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition",
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                ].join(" ")}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "forecast" && <CurrentForecastTab activeQuestion={activeQuestion} />}
        {tab === "scenarios" && <ScenarioPlanningTab />}
        {tab === "drivers" && <DriverImpactTab />}
        {tab === "library" && <CaseLibraryTab />}
      </section>
    </WorkflowLayout>
  );
}

function CurrentForecastTab({ activeQuestion }: { activeQuestion: any }) {
  return (
    <>
      <QuestionGate
        activeQuestion={activeQuestion}
        title="An active question is required"
        body="Forecasts must be generated in the context of a defined question."
      >
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ForecastCard label="Probability" value="—" body="Primary forecast output." />
            <ForecastCard label="Key Drivers" value="—" body="Main factors moving the forecast." />
            <ForecastCard label="Timing" value="—" body="When the shift is likely to occur." />
          </div>
        </div>
      </QuestionGate>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="text-sm font-semibold text-foreground">What comes next</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Once the forecast is visible, the next layer helps convert that output into action:
          who to target, what blocks movement, when to act, and what competitive risks to watch.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            "Adoption Segmentation",
            "Barrier Diagnosis",
            "Readiness Timeline",
            "Competitive Risk",
            "Growth Feasibility",
          ].map((item) => (
            <span
              key={item}
              className="rounded-full bg-muted/20 px-3 py-1 text-xs text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
        <Link
          href="/decide"
          className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
        >
          Go to Decide
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="text-sm font-semibold text-foreground">Advanced forecast tools</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Keep these accessible without crowding the main workflow.
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/forecast-ledger"
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
          >
            Forecast Ledger
          </Link>
          <Link
            href="/calibration"
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
          >
            Calibration
          </Link>
          <Link
            href="/workbench"
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
          >
            Workbench
          </Link>
        </div>
      </div>
    </>
  );
}

function ScenarioPlanningTab() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
      <div>
        <div className="text-sm font-semibold text-foreground">Scenario Planning</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Three strategic scenarios with probability estimates under different assumptions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {MOCK_CASE.scenarios.map((s) => (
          <div
            key={s.name}
            className="rounded-xl border border-border bg-muted/10 p-5 space-y-3"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {s.name}
            </div>
            <div className="text-3xl font-bold text-foreground">{s.probability}</div>
            <div className="text-sm text-muted-foreground">{s.description}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-muted/10 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Scenario Comparison
        </div>
        <div className="space-y-3">
          {MOCK_CASE.scenarios.map((s) => {
            const pct = parseInt(s.probability);
            return (
              <div key={s.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground/90">{s.name}</span>
                  <span className="font-semibold text-foreground">{s.probability}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className={[
                      "h-full rounded-full transition-all",
                      s.name === "Upside Scenario"
                        ? "bg-emerald-500"
                        : s.name === "Downside Scenario"
                        ? "bg-red-400"
                        : "bg-primary",
                    ].join(" ")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DriverImpactTab() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
      <div>
        <div className="text-sm font-semibold text-foreground">Key Driver Impact</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Forces pushing the forecast higher or lower, with estimated strength.
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="flex-1">Driver</div>
          <div className="w-28 text-center">Direction</div>
          <div className="w-24 text-center">Strength</div>
        </div>
        {MOCK_CASE.driverImpact.map((d) => (
          <div
            key={d.name}
            className="flex items-center gap-4 rounded-xl border border-border bg-muted/10 px-4 py-3"
          >
            <div className="flex-1 text-sm text-foreground/90">{d.name}</div>
            <div className="w-28 flex items-center justify-center gap-1.5">
              {d.direction === "up" ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-400" />
              )}
              <span
                className={[
                  "text-sm font-semibold",
                  d.direction === "up" ? "text-emerald-400" : "text-red-400",
                ].join(" ")}
              >
                {d.direction === "up" ? "Upward" : "Downward"}
              </span>
            </div>
            <div className="w-24 text-center">
              <span
                className={[
                  "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  d.strength === "High"
                    ? "bg-amber-500/15 text-amber-300"
                    : d.strength === "Medium"
                    ? "bg-blue-500/15 text-blue-300"
                    : "bg-muted/30 text-muted-foreground",
                ].join(" ")}
              >
                {d.strength}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-muted/10 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Net Assessment
        </div>
        <div className="text-sm text-muted-foreground">
          Two upward drivers (efficacy evidence + guideline momentum) compete against two
          downward forces (access friction + entrenched competition). The balance is
          moderately negative, keeping the base case at 42%.
        </div>
      </div>
    </div>
  );
}

function CaseLibraryTab() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/cases`)
      .then((r) => r.json())
      .then((data) => setCases(data))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Case Library
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              All strategic cases in one view. Click any row to open.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {cases.length} case{cases.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
            <tr>
              <th className="px-4 py-3 font-semibold">Case ID</th>
              <th className="px-4 py-3 font-semibold">Strategic Question</th>
              <th className="px-4 py-3 font-semibold text-right">Probability</th>
              <th className="px-4 py-3 font-semibold">Confidence</th>
              <th className="px-4 py-3 font-semibold">Horizon</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 font-semibold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading cases...
                </td>
              </tr>
            ) : cases.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <BookOpen className="w-8 h-8 opacity-20" />
                    <p>No cases yet. Ask a strategic question to begin.</p>
                  </div>
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-muted/10 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-primary whitespace-nowrap">
                    {c.caseId}
                  </td>
                  <td className="px-4 py-3 max-w-[260px] truncate">
                    {c.strategicQuestion}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                    {c.currentProbability !== null
                      ? `${(c.currentProbability * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.confidenceLevel ? (
                      <span
                        className={[
                          "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          c.confidenceLevel === "High"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : c.confidenceLevel === "Moderate"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-muted/30 text-muted-foreground",
                        ].join(" ")}
                      >
                        {c.confidenceLevel}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {c.timeHorizon || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(c.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/case/${c.caseId}/question`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted/20 transition"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ForecastCard({
  label,
  value,
  body,
}: {
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground/70">{body}</div>
    </div>
  );
}
