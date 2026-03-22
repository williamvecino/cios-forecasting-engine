import { useState } from "react";
import { useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Card, Badge, ProbabilityGauge, Button } from "@/components/ui-components";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Plus,
  Trash2,
  Play,
  Layers,
  ShieldAlert,
  ArrowUpRight,
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface QuestionInput {
  label: string;
  strategicQuestion: string;
  priorOverride?: number;
}

const DEFAULT_QUESTIONS: QuestionInput[] = [
  { label: "Base Adoption", strategicQuestion: "What is the probability of meaningful HCP adoption within 12 months?" },
  { label: "Competitive Survival", strategicQuestion: "Will the product maintain share versus the entrenched standard of care?" },
  { label: "Time to Threshold", strategicQuestion: "Will adoption reach the 30% threshold within 18 months?" },
];

export default function PortfolioPage() {
  const [, params] = useRoute("/case/:caseId/portfolio");
  const caseId = params?.caseId || "";

  const { data: caseData } = useGetCase(caseId);

  const [questions, setQuestions] = useState<QuestionInput[]>(DEFAULT_QUESTIONS);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const portfolioMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/cases/${caseId}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const portfolio = portfolioMutation.data;

  const addQuestion = () => {
    if (questions.length >= 10) return;
    setQuestions([...questions, { label: `Question ${questions.length + 1}`, strategicQuestion: "" }]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: keyof QuestionInput, value: string | number | undefined) => {
    const next = [...questions];
    next[idx] = { ...next[idx], [field]: value };
    setQuestions(next);
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-8 pb-16">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Layers className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold">Forecast Portfolio</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Evaluate multiple strategic questions against the same signal set for{" "}
            <span className="font-semibold text-foreground">{(caseData as any)?.assetName ?? caseId}</span>
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Questions</h2>
            <button
              onClick={addQuestion}
              disabled={questions.length >= 10}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Add Question
            </button>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div key={idx} className="border border-border rounded-lg p-4 space-y-3 bg-card/50">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <input
                      value={q.label}
                      onChange={(e) => updateQuestion(idx, "label", e.target.value)}
                      placeholder="Label"
                      className="w-full bg-transparent border-b border-border/50 focus:border-primary outline-none text-sm font-semibold pb-1"
                    />
                    <textarea
                      value={q.strategicQuestion}
                      onChange={(e) => updateQuestion(idx, "strategicQuestion", e.target.value)}
                      placeholder="Strategic question text..."
                      rows={2}
                      className="w-full bg-muted/30 border border-border rounded-md px-3 py-2 text-sm resize-none focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="flex flex-col items-end gap-2 min-w-[120px]">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-muted-foreground uppercase">Prior Override</label>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={q.priorOverride ?? ""}
                        onChange={(e) => updateQuestion(idx, "priorOverride", e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder={(caseData as any)?.priorProbability?.toFixed(2) ?? "—"}
                        className="w-16 bg-muted/30 border border-border rounded px-2 py-1 text-xs text-center outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    {questions.length > 1 && (
                      <button onClick={() => removeQuestion(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => portfolioMutation.mutate()}
              disabled={portfolioMutation.isPending || questions.some((q) => !q.strategicQuestion.trim())}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              {portfolioMutation.isPending ? "Running..." : "Run Portfolio Forecast"}
            </Button>
          </div>
        </Card>

        {portfolio && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                icon={<ShieldAlert className="w-4 h-4 text-destructive" />}
                title="Highest Risk"
                label={portfolio.portfolio.highestRisk.label}
                value={`${(portfolio.portfolio.highestRisk.calibratedProbability * 100).toFixed(1)}%`}
                color="text-destructive"
              />
              <SummaryCard
                icon={<ArrowUpRight className="w-4 h-4 text-success" />}
                title="Highest Upside"
                label={portfolio.portfolio.highestUpside.label}
                value={`${(portfolio.portfolio.highestUpside.calibratedProbability * 100).toFixed(1)}%`}
                color="text-success"
              />
              <SummaryCard
                icon={<Activity className="w-4 h-4 text-amber-500" />}
                title="Most Sensitive"
                label={portfolio.portfolio.mostSensitive?.label ?? "—"}
                value={portfolio.portfolio.mostSensitive ? `Δ ${(portfolio.portfolio.mostSensitive.swingDelta * 100).toFixed(1)}pp` : "—"}
                color="text-amber-500"
              />
              <SummaryCard
                icon={<BarChart3 className="w-4 h-4 text-blue-500" />}
                title="Cross-Question Spread"
                label={`${portfolio.portfolio.questionCount} questions`}
                value={`${portfolio.portfolio.crossQuestionConsistency.calibratedSpreadPp.toFixed(1)}pp`}
                color="text-blue-500"
              />
            </div>

            {portfolio.portfolio.crossQuestionConsistency.note && (
              <div className="flex items-start gap-2 bg-muted/30 border border-border rounded-lg px-4 py-3">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-sm text-muted-foreground">{portfolio.portfolio.crossQuestionConsistency.note}</span>
              </div>
            )}

            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Per-Question Results</h2>
              {portfolio.questions.map((q: any, idx: number) => {
                const isExpanded = expandedIdx === idx;
                return (
                  <Card key={idx} className="overflow-hidden">
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <ProbabilityGauge value={q.calibratedProbability} size="sm" />
                        <div>
                          <div className="font-semibold text-sm">{q.label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{q.strategicQuestion}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <ConfidenceBadge level={q.calibrationConfidence.level} />
                        <QuestionTypeBadge type={q.questionType} />
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-5 py-4 space-y-4 bg-muted/5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <StatBlock label="Prior" value={`${(q.priorProbability * 100).toFixed(1)}%`} />
                          <StatBlock label="Raw Probability" value={`${(q.rawProbability * 100).toFixed(1)}%`} />
                          <StatBlock label="Calibrated" value={`${(q.calibratedProbability * 100).toFixed(1)}%`} highlight />
                          <StatBlock label="Calibration Level" value={q.hierarchicalCalibration.fallbackLevel.replace(/_/g, " ")} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <TrendingUp className="w-3 h-3 text-success" /> Top Positive Drivers
                            </h4>
                            {q.keyDrivers.topPositive.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">No positive signals</p>
                            )}
                            {q.keyDrivers.topPositive.map((d: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                                <span className="text-foreground truncate max-w-[70%]">{d.description}</span>
                                <span className="font-mono text-success">LR {d.lr.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <TrendingDown className="w-3 h-3 text-destructive" /> Top Negative Drivers
                            </h4>
                            {q.keyDrivers.topNegative.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">No negative signals</p>
                            )}
                            {q.keyDrivers.topNegative.map((d: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                                <span className="text-foreground truncate max-w-[70%]">{d.description}</span>
                                <span className="font-mono text-destructive">LR {d.lr.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {q.keyDrivers.swingFactor && (
                          <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                            <Zap className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                            <div className="text-xs">
                              <span className="font-semibold text-amber-600">Swing Factor: </span>
                              <span className="text-foreground">{q.keyDrivers.swingFactor.description}</span>
                              <span className="text-muted-foreground"> — if reversed: Δ {(q.keyDrivers.swingFactor.deltaIfReversed * 100).toFixed(1)}pp</span>
                            </div>
                          </div>
                        )}

                        <div className="bg-muted/30 rounded-lg px-3 py-2">
                          <p className="text-xs text-muted-foreground font-mono">{q.traceSummary}</p>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryCard({ icon, title, label, value, color }: { icon: React.ReactNode; title: string; label: string; value: string; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className={cn("text-xl font-bold font-mono", color)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 truncate">{label}</div>
    </Card>
  );
}

function StatBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-lg font-bold font-mono", highlight ? "text-primary" : "text-foreground")}>{value}</div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const config: Record<string, string> = {
    high: "bg-success/15 text-success border-success/25",
    medium: "bg-blue-500/15 text-blue-500 border-blue-500/25",
    low: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  };
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border", config[level] ?? config.low)}>
      {level}
    </span>
  );
}

function QuestionTypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
      {type.replace(/_/g, " ")}
    </span>
  );
}
