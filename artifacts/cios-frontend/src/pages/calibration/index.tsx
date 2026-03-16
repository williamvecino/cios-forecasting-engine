import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListCalibration, useGetCalibrationStats } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import {
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Label,
} from "recharts";
import { BarChart2, Target, TrendingDown, TrendingUp, Minus, CheckCircle2, Clock, AlertTriangle, FlaskConical, ShieldCheck, ShieldAlert, Activity, FileSearch, ChevronRight, LayoutGrid, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/cn";

interface ErrorPattern {
  name: string;
  category: "signal_type" | "actor";
  sampleSize: number;
  meanError: number;
  meanBrierScore: number;
  bias: "over" | "under" | "balanced";
}

interface ErrorPatternsResponse {
  signalPatterns: ErrorPattern[];
  actorPatterns: ErrorPattern[];
  calibratedCount: number;
}

const BIAS_COLORS = {
  over: "hsl(38 92% 50%)",
  under: "hsl(217 91% 60%)",
  balanced: "hsl(142 71% 45%)",
};

function BiasIcon({ bias }: { bias: "over" | "under" | "balanced" }) {
  if (bias === "over") return <TrendingDown className="w-3.5 h-3.5 text-amber-500" />;
  if (bias === "under") return <TrendingUp className="w-3.5 h-3.5 text-blue-500" />;
  return <Minus className="w-3.5 h-3.5 text-green-500" />;
}

function biasBadgeVariant(bias: "over" | "under" | "balanced") {
  if (bias === "over") return "warning";
  if (bias === "under") return "primary";
  return "success";
}

function biasLabel(bias: "over" | "under" | "balanced") {
  if (bias === "over") return "Overforecasting";
  if (bias === "under") return "Underforecasting";
  return "Balanced";
}

export default function Calibration() {
  const queryClient = useQueryClient();
  const { data: logs, isLoading: loadingLogs, refetch: refetchLogs } = useListCalibration();
  const { data: stats, refetch: refetchStats } = useGetCalibrationStats();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [activePatternTab, setActivePatternTab] = useState<"signal_type" | "actor">("signal_type");

  const { data: errorData } = useQuery<ErrorPatternsResponse>({
    queryKey: ["/api/calibration/error-patterns"],
    queryFn: () => fetch("/api/calibration/error-patterns").then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: diagnostics, refetch: refetchDiagnostics } = useQuery<any>({
    queryKey: ["/api/calibration/diagnostics"],
    queryFn: () => fetch("/api/calibration/diagnostics").then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: validationReport, refetch: refetchValidation } = useQuery<any>({
    queryKey: ["/api/calibration/validation-report"],
    queryFn: () => fetch("/api/calibration/validation-report").then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: coverageMap } = useQuery<any>({
    queryKey: ["/api/calibration/coverage-map"],
    queryFn: () => fetch("/api/calibration/coverage-map").then((r) => r.json()),
    staleTime: 30_000,
  });

  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [showValidation, setShowValidation] = useState(false);
  const [showCoverageMap, setShowCoverageMap] = useState(false);

  const errorPatterns = activePatternTab === "signal_type"
    ? (errorData?.signalPatterns ?? [])
    : (errorData?.actorPatterns ?? []);

  // Reliability diagram scatter data
  const calibratedPoints = (logs ?? [])
    .filter((l) => l.observedOutcome !== null && l.observedOutcome !== undefined)
    .map((l) => ({
      x: Number((l.predictedProbability * 100).toFixed(1)),
      y: Number((l.observedOutcome! * 100).toFixed(1)),
      caseId: l.caseId,
      brier: l.brierComponent?.toFixed(4) ?? "—",
      error: l.forecastError != null ? `${(l.forecastError * 100) > 0 ? "+" : ""}${(l.forecastError * 100).toFixed(1)}pp` : "—",
    }));

  // Perfect calibration reference line data (y = x)
  const diagPoints = [{ x: 0, y: 0 }, { x: 100, y: 100 }];

  const handleSubmitOutcome = async (forecastId: string) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0 || val > 100) return;
    setSubmitting(true);
    try {
      await fetch(`/api/calibration/${forecastId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedOutcome: val / 100 }),
      });
      setEditingId(null);
      setEditValue("");
      await refetchLogs();
      await refetchStats();
      queryClient.invalidateQueries({ queryKey: ["/api/calibration/error-patterns"] });
    } finally {
      setSubmitting(false);
    }
  };

  const brier = stats?.meanBrierScore;
  const brierColor = brier == null
    ? "text-muted-foreground"
    : brier < 0.10 ? "text-green-600"
    : brier < 0.20 ? "text-amber-500"
    : "text-red-500";

  const meanErr = stats?.meanForecastError;
  const errLabel = meanErr == null
    ? "No outcome data yet"
    : meanErr > 0.05 ? "Systematically underforecasting"
    : meanErr < -0.05 ? "Systematically overforecasting"
    : "No systematic bias detected";

  const coveragePct = stats?.totalForecasts
    ? Math.round(((stats.calibratedForecasts ?? 0) / stats.totalForecasts) * 100)
    : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="primary">CALIBRATION</Badge>
          </div>
          <h1 className="text-3xl font-bold">Engine Calibration</h1>
          <p className="text-muted-foreground mt-1">
            Measure forecast accuracy, track signal-type bias, and close the prediction–outcome feedback loop.
          </p>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <div className="text-sm text-muted-foreground">Mean Brier Score</div>
            <div className={cn("text-3xl font-display font-bold mt-2", brierColor)}>
              {brier != null ? brier.toFixed(3) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">0 = perfect · 0.25 = random</div>
          </Card>
          <Card>
            <div className="text-sm text-muted-foreground">Mean Forecast Error</div>
            <div className="text-3xl font-display font-bold mt-2">
              {meanErr != null
                ? `${meanErr > 0 ? "+" : ""}${(meanErr * 100).toFixed(1)}pp`
                : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{errLabel}</div>
          </Card>
          <Card>
            <div className="text-sm text-muted-foreground">Calibrated Records</div>
            <div className="text-3xl font-display font-bold mt-2">
              {stats?.calibratedForecasts ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats ? `of ${stats.totalForecasts} total forecasts` : ""}
            </div>
          </Card>
          <Card>
            <div className="text-sm text-muted-foreground">Calibration Coverage</div>
            <div className="text-3xl font-display font-bold mt-2">
              {coveragePct != null ? `${coveragePct}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Forecasts with observed outcome</div>
          </Card>
        </div>

        {/* Reliability diagram + Error patterns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Reliability Diagram */}
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Reliability Diagram</span>
              <span className="text-xs text-muted-foreground">Predicted vs. actual outcome</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Points on the diagonal indicate perfect calibration. Above = underforecast; below = overforecast.
            </p>

            {calibratedPoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-muted-foreground/40 gap-2">
                <Target className="w-10 h-10" />
                <p className="text-sm font-medium">No calibrated forecasts yet</p>
                <p className="text-xs text-center max-w-48">
                  Record actual outcomes on the Forecast page or in the table below to populate this chart.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11 }}
                  >
                    <Label value="Predicted (%)" position="insideBottom" offset={-18} fontSize={11} fill="hsl(var(--muted-foreground))" />
                  </XAxis>
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11 }}
                  >
                    <Label value="Actual (%)" angle={-90} position="insideLeft" offset={18} fontSize={11} fill="hsl(var(--muted-foreground))" />
                  </YAxis>
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-background border border-border rounded-lg p-2.5 text-xs shadow-lg">
                          <p className="font-mono font-semibold mb-1">{d?.caseId}</p>
                          <p>Predicted: <span className="font-medium">{d?.x}%</span></p>
                          <p>Actual: <span className="font-medium">{d?.y}%</span></p>
                          <p className="text-muted-foreground">Error: {d?.error}</p>
                          <p className="text-muted-foreground">Brier: {d?.brier}</p>
                        </div>
                      );
                    }}
                  />
                  {/* Diagonal reference — perfect calibration */}
                  <ReferenceLine
                    segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    strokeOpacity={0.5}
                  />
                  <Scatter
                    data={calibratedPoints}
                    fill="hsl(var(--primary))"
                    fillOpacity={0.8}
                    r={5}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Error by Signal Type / Actor */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Forecast Bias Analysis</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setActivePatternTab("signal_type")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    activePatternTab === "signal_type"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  By Signal Type
                </button>
                <button
                  onClick={() => setActivePatternTab("actor")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    activePatternTab === "actor"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  By Actor
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Mean forecast error (pp) in calibrated cases where this {activePatternTab === "signal_type" ? "signal type was active" : "actor had a meaningful stance"}.
              Amber = overforecast · Blue = underforecast · Green = balanced.
            </p>

            {errorPatterns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-muted-foreground/40 gap-2">
                <BarChart2 className="w-10 h-10" />
                <p className="text-sm font-medium">No bias data yet</p>
                <p className="text-xs text-center max-w-48">
                  Calibrated outcomes will reveal which {activePatternTab === "signal_type" ? "signal types" : "actors"} are systematically mis-estimated.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={errorPatterns}
                  layout="vertical"
                  margin={{ top: 0, right: 24, bottom: 0, left: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}pp`}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 16) + "…" : v}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload as ErrorPattern;
                      return (
                        <div className="bg-background border border-border rounded-lg p-2.5 text-xs shadow-lg min-w-40">
                          <p className="font-semibold mb-1">{d.name}</p>
                          <p>Mean error: <span className="font-mono">{(d.meanError * 100) > 0 ? "+" : ""}{(d.meanError * 100).toFixed(1)}pp</span></p>
                          <p>Mean Brier: <span className="font-mono">{d.meanBrierScore.toFixed(4)}</span></p>
                          <p>Sample size: {d.sampleSize}</p>
                          <p className={cn(
                            "font-medium mt-1",
                            d.bias === "over" ? "text-amber-500" : d.bias === "under" ? "text-blue-500" : "text-green-500"
                          )}>
                            {biasLabel(d.bias)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeOpacity={0.6} />
                  <Bar dataKey="meanError" name="Mean Forecast Error" radius={[0, 3, 3, 0]}>
                    {errorPatterns.map((entry, idx) => (
                      <Cell key={idx} fill={BIAS_COLORS[entry.bias]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Bias legend + interpretation */}
        {(errorData?.calibratedCount ?? 0) > 0 && errorPatterns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {errorPatterns.slice(0, 3).map((p) => (
              <Card key={p.name} className={cn(
                "border",
                p.bias === "over" ? "border-amber-200/50 bg-amber-50/20" :
                p.bias === "under" ? "border-blue-200/50 bg-blue-50/20" :
                "border-green-200/50 bg-green-50/20"
              )}>
                <div className="flex items-start gap-2">
                  <BiasIcon bias={p.bias} />
                  <div>
                    <p className="text-xs font-semibold leading-snug">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {biasLabel(p.bias)} by {Math.abs(p.meanError * 100).toFixed(1)}pp
                      on average across {p.sampleSize} calibrated forecast{p.sampleSize !== 1 ? "s" : ""}.
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Prediction Log */}
        <Card noPadding>
          <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Target className="w-4 h-4 text-primary" />
              Prediction Log
            </div>
            <span className="text-xs text-muted-foreground">
              {logs?.length ?? 0} entries · {stats?.calibratedForecasts ?? 0} calibrated
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Case</th>
                  <th className="px-5 py-3 font-semibold text-right">Predicted</th>
                  <th className="px-5 py-3 font-semibold text-right">Actual</th>
                  <th className="px-5 py-3 font-semibold text-right">Error</th>
                  <th className="px-5 py-3 font-semibold text-right">Brier</th>
                  <th className="px-5 py-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loadingLogs ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                      Loading log…
                    </td>
                  </tr>
                ) : logs?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                      No forecast entries yet. Run a forecast to begin logging.
                    </td>
                  </tr>
                ) : (
                  [...(logs ?? [])].reverse().map((log) => {
                    const isCalibrated = log.observedOutcome !== null && log.observedOutcome !== undefined;
                    const isEditing = editingId === log.forecastId;
                    const errPp = log.forecastError != null
                      ? `${(log.forecastError * 100) > 0 ? "+" : ""}${(log.forecastError * 100).toFixed(1)}pp`
                      : null;

                    return (
                      <tr key={log.id} className={cn("hover:bg-muted/10 transition-colors", isCalibrated && "bg-green-50/10")}>
                        <td className="px-5 py-3 whitespace-nowrap text-muted-foreground text-xs">
                          {log.predictionDate ? format(new Date(log.predictionDate), "MMM dd, yyyy HH:mm") : "—"}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs font-medium">{log.caseId}</td>
                        <td className="px-5 py-3 text-right font-mono text-sm">
                          {(log.predictedProbability * 100).toFixed(1)}%
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-sm">
                          {isCalibrated ? `${(log.observedOutcome! * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className={cn(
                          "px-5 py-3 text-right font-mono text-xs",
                          log.forecastError != null
                            ? log.forecastError > 0.05 ? "text-blue-500"
                            : log.forecastError < -0.05 ? "text-amber-500"
                            : "text-green-600"
                            : "text-muted-foreground"
                        )}>
                          {errPp ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">
                          {log.brierComponent != null ? log.brierComponent.toFixed(4) : "—"}
                        </td>
                        <td className="px-5 py-3">
                          {isCalibrated ? (
                            <div className="flex justify-center">
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Calibrated
                              </span>
                            </div>
                          ) : isEditing ? (
                            <div className="flex items-center gap-1.5 justify-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                placeholder="%"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSubmitOutcome(log.forecastId);
                                  if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                                }}
                                autoFocus
                                className="w-16 text-center text-xs border border-border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <Button
                                size="sm"
                                variant="primary"
                                className="h-6 text-xs px-2"
                                onClick={() => handleSubmitOutcome(log.forecastId)}
                                disabled={submitting || !editValue}
                              >
                                {submitting ? "…" : "Save"}
                              </Button>
                              <button
                                onClick={() => { setEditingId(null); setEditValue(""); }}
                                className="text-xs text-muted-foreground hover:text-foreground"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-center">
                              <button
                                onClick={() => { setEditingId(log.forecastId); setEditValue(""); }}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Clock className="w-3 h-3" />
                                Record outcome
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Bucket Diagnostics Panel */}
        <Card>
          <button
            onClick={() => setShowDiagnostics((v) => !v)}
            className="w-full flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Bucket Calibration Diagnostics</span>
              <span className="text-xs text-muted-foreground">Full inspection of correction state per probability range</span>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showDiagnostics && "rotate-90")} />
          </button>

          {showDiagnostics && diagnostics && (
            <div className="mt-4 pt-4 border-t border-border space-y-4">
              {/* Aggregate */}
              {diagnostics.aggregate && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl border border-border bg-background text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Calibrated Cases</p>
                    <p className="text-2xl font-display font-bold">{diagnostics.aggregate.calibratedCaseCount}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-background text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Mean Raw Error</p>
                    <p className={cn("text-2xl font-display font-bold", diagnostics.aggregate.meanRawError > 0 ? "text-blue-500" : "text-amber-500")}>
                      {diagnostics.aggregate.meanRawError !== null ? `${(diagnostics.aggregate.meanRawError * 100).toFixed(1)}pp` : "—"}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-background text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Mean Calibrated Error</p>
                    <p className={cn("text-2xl font-display font-bold", diagnostics.aggregate.meanCalibratedError > 0 ? "text-blue-500" : "text-amber-500")}>
                      {diagnostics.aggregate.meanCalibratedError !== null ? `${(diagnostics.aggregate.meanCalibratedError * 100).toFixed(1)}pp` : "—"}
                    </p>
                  </div>
                </div>
              )}

              {/* Bucket table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold">Bucket</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold">n</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold">Mean Signed Error</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold">Mean Abs Error</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold">Correction Applied</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold">Status</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold">Warnings</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(diagnostics.bucketDiagnostics ?? []).map((bk: any) => (
                      <tr key={bk.bucket} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="py-2.5 px-3 font-mono font-semibold">{bk.bucket}</td>
                        <td className="py-2.5 px-3 text-right">{bk.sampleSize}</td>
                        <td className={cn("py-2.5 px-3 text-right font-mono", bk.meanSignedError === null ? "text-muted-foreground" : bk.meanSignedError < 0 ? "text-amber-500" : "text-blue-500")}>
                          {bk.meanSignedError !== null ? `${(bk.meanSignedError * 100).toFixed(1)}pp` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {bk.meanAbsoluteError !== null ? `${(bk.meanAbsoluteError * 100).toFixed(1)}pp` : "—"}
                        </td>
                        <td className={cn("py-2.5 px-3 text-right font-mono font-semibold", bk.correctionAppliedPp === null ? "text-muted-foreground" : bk.correctionAppliedPp < 0 ? "text-amber-500" : "text-blue-500")}>
                          {bk.correctionAppliedPp !== null ? `${(bk.correctionAppliedPp * 100).toFixed(1)}pp` : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          {bk.warnings.pendingThreshold ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-muted border-border text-muted-foreground">Pending (n&lt;{bk.warnings.pendingThreshold ? 3 : 5})</span>
                          ) : bk.isActive ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-success/10 border-success/30 text-success font-semibold">
                              <ShieldCheck className="w-2.5 h-2.5" /> Active
                            </span>
                          ) : bk.belowThreshold ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-primary/10 border-primary/30 text-primary">Below threshold</span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 space-x-1">
                          {bk.warnings.lowSample && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-amber-400/10 border-amber-400/30 text-amber-600">Low sample</span>
                          )}
                          {bk.warnings.directionFlip && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-destructive/10 border-destructive/30 text-destructive">
                              Dir. flip ×{bk.warnings.flipCount}
                            </span>
                          )}
                          {!bk.warnings.lowSample && !bk.warnings.directionFlip && (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                          {bk.lastUpdated ? new Date(bk.lastUpdated).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Guardrail config note */}
              {diagnostics.guardrailConfig && (
                <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  <span>Min sample: <strong className="text-foreground">{diagnostics.guardrailConfig.minBucketSample}</strong></span>
                  <span>Error threshold: <strong className="text-foreground">{(diagnostics.guardrailConfig.errorThreshold * 100).toFixed(0)}pp</strong></span>
                  <span>Max correction: <strong className="text-foreground">±{(diagnostics.guardrailConfig.maxCorrectionPp * 100).toFixed(0)}pp</strong></span>
                  <span>Recency decay λ: <strong className="text-foreground">{diagnostics.guardrailConfig.recencyDecayLambda}</strong></span>
                  <span>LR corrections active: <strong className="text-foreground">{diagnostics.lrCorrectionsActive}</strong></span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Validation Report */}
        <Card>
          <button
            onClick={() => {
              if (!showValidation) refetchValidation();
              setShowValidation((v) => !v);
            }}
            className="w-full flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Validation Report</span>
              <span className="text-xs text-muted-foreground">Raw vs calibrated vs actual — per bucket and therapy area</span>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showValidation && "rotate-90")} />
          </button>

          {showValidation && validationReport && (
            <div className="mt-4 pt-4 border-t border-border space-y-5">
              {/* Coverage check */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Moderate cases", n: validationReport.coverageCheck?.moderateCases, req: 2 },
                  { label: "High-conf cases", n: validationReport.coverageCheck?.highConfCases, req: 2 },
                  { label: "Psychiatry cases", n: validationReport.coverageCheck?.psychiatryCases, req: 1 },
                  { label: "Cardiology cases", n: validationReport.coverageCheck?.cardiologyCases, req: 1 },
                ].map((item) => (
                  <div key={item.label} className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border",
                    item.n >= item.req ? "border-success/30 bg-success/5 text-success" : "border-amber-400/30 bg-amber-400/5 text-amber-600"
                  )}>
                    {item.n >= item.req ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                    <span className="font-semibold">{item.n}</span> {item.label} (req ≥{item.req})
                  </div>
                ))}
                <div className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-semibold",
                  validationReport.overall?.verdict === "improving" ? "border-success/40 bg-success/10 text-success" :
                  validationReport.overall?.verdict === "degrading" ? "border-destructive/40 bg-destructive/10 text-destructive" :
                  "border-border bg-muted/10 text-muted-foreground"
                )}>
                  <Activity className="w-3 h-3" />
                  {validationReport.overall?.verdict === "improving" ? "Calibration improving" :
                   validationReport.overall?.verdict === "degrading" ? "Calibration degrading" :
                   "Insufficient data"}
                </div>
              </div>

              {/* Segmented verdict banner */}
              {validationReport.overall?.segmentedVerdict && (
                <div className={cn(
                  "flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs",
                  validationReport.overall.mixedBehaviorDetected
                    ? "border-amber-400/40 bg-amber-400/8 text-amber-700"
                    : validationReport.overall.segmentedVerdict === "broadly_improving"
                    ? "border-success/30 bg-success/5 text-success"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                )}>
                  {validationReport.overall.mixedBehaviorDetected
                    ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    : <Activity className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <div>
                    <span className="font-semibold capitalize">
                      {validationReport.overall.segmentedVerdict === "broadly_improving" ? "Broadly improving" :
                       validationReport.overall.segmentedVerdict === "broadly_degrading" ? "Broadly degrading" :
                       "Mixed behaviour across segments"}
                    </span>
                    {validationReport.overall.mixedBehaviorDetected && (
                      <span className="ml-1.5 text-[10px] opacity-80">
                        — calibration is helping some therapy areas but not others. Check breakout below.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Bucket summary */}
              <div>
                <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Bucket-Level Summary</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 px-2 text-muted-foreground font-semibold">Bucket</th>
                      <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">n</th>
                      <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Mean Raw Error</th>
                      <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Mean Calib Error</th>
                      <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Improvement Rate</th>
                      <th className="text-left py-1.5 px-2 text-muted-foreground font-semibold">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(validationReport.bucketSummary ?? []).map((bk: any) => (
                      <tr key={bk.bucket} className="border-b border-border/50">
                        <td className="py-2 px-2 font-mono font-semibold">{bk.bucket}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{bk.n ?? 0}</td>
                        <td className={cn("py-2 px-2 text-right font-mono", !bk.meanRawError ? "text-muted-foreground" : bk.meanRawError < 0 ? "text-amber-500" : "text-blue-500")}>
                          {bk.meanRawError !== undefined ? `${(bk.meanRawError * 100).toFixed(1)}pp` : "—"}
                        </td>
                        <td className={cn("py-2 px-2 text-right font-mono", !bk.meanCalibratedError ? "text-muted-foreground" : bk.meanCalibratedError < 0 ? "text-amber-500" : "text-blue-500")}>
                          {bk.meanCalibratedError !== undefined ? `${(bk.meanCalibratedError * 100).toFixed(1)}pp` : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {bk.improvementRate !== undefined ? `${(bk.improvementRate * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className="py-2 px-2">
                          {bk.n > 0 ? (
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded border font-semibold",
                              bk.verdict === "improving" ? "bg-success/10 border-success/30 text-success" :
                              bk.verdict === "degrading" ? "bg-destructive/10 border-destructive/30 text-destructive" :
                              "bg-muted border-border text-muted-foreground"
                            )}>
                              {bk.verdict ?? "n/a"}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Therapy area breakout */}
              {(validationReport.therapyAreaBreakout ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Therapy Area Breakout</p>
                  <div className="grid grid-cols-2 gap-2">
                    {validationReport.therapyAreaBreakout.map((ta: any) => (
                      <div key={ta.therapyArea} className={cn(
                        "p-3 rounded-xl border text-xs",
                        ta.verdict === "improving" ? "border-success/20 bg-success/5" : "border-amber-400/20 bg-amber-400/5"
                      )}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">{ta.therapyArea}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold",
                            ta.verdict === "improving" ? "bg-success/10 border-success/30 text-success" : "bg-amber-400/10 border-amber-400/30 text-amber-600"
                          )}>{ta.verdict}</span>
                        </div>
                        <div className="flex gap-3 text-muted-foreground">
                          <span>n={ta.n}</span>
                          <span>Raw: <span className={cn("font-mono", ta.meanRawError < 0 ? "text-amber-500" : "text-blue-500")}>{(ta.meanRawError * 100).toFixed(1)}pp</span></span>
                          <span>Calib: <span className={cn("font-mono", ta.meanCalibratedError < 0 ? "text-amber-500" : "text-blue-500")}>{(ta.meanCalibratedError * 100).toFixed(1)}pp</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Question type breakout */}
              {(validationReport.questionTypeBreakout ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Question Type Breakout</p>
                  <div className="grid grid-cols-2 gap-2">
                    {validationReport.questionTypeBreakout.map((qt: any) => (
                      <div key={qt.questionType} className={cn(
                        "p-3 rounded-xl border text-xs",
                        qt.verdict === "improving" ? "border-success/20 bg-success/5" : "border-amber-400/20 bg-amber-400/5"
                      )}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold font-mono">{qt.questionType.replace(/_/g, " ")}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold",
                            qt.verdict === "improving" ? "bg-success/10 border-success/30 text-success" : "bg-amber-400/10 border-amber-400/30 text-amber-600"
                          )}>{qt.verdict}</span>
                        </div>
                        <div className="flex gap-3 text-muted-foreground">
                          <span>n={qt.n}</span>
                          <span>Raw: <span className={cn("font-mono", qt.meanRawError < 0 ? "text-amber-500" : "text-blue-500")}>{(qt.meanRawError * 100).toFixed(1)}pp</span></span>
                          <span>Calib: <span className={cn("font-mono", qt.meanCalibratedError < 0 ? "text-amber-500" : "text-blue-500")}>{(qt.meanCalibratedError * 100).toFixed(1)}pp</span></span>
                        </div>
                        <p className="text-muted-foreground mt-1">Improvement rate: {(qt.improvementRate * 100).toFixed(0)}% · +{qt.improvementPp.toFixed(1)}pp MAE reduction</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-case detail */}
              <div>
                <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Case-Level Detail</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 px-2 text-muted-foreground font-semibold">Case</th>
                        <th className="text-left py-1.5 px-2 text-muted-foreground font-semibold">Therapy Area</th>
                        <th className="text-left py-1.5 px-2 text-muted-foreground font-semibold">Bucket</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Raw %</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Calib %</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Actual %</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Raw Err</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Calib Err</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-semibold">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(validationReport.cases ?? []).map((c: any, i: number) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 px-2 font-mono text-[10px]">{c.caseId}</td>
                          <td className="py-2 px-2 text-muted-foreground">{c.therapyArea ?? "—"}</td>
                          <td className="py-2 px-2 font-mono">{c.bucket ?? "—"}</td>
                          <td className="py-2 px-2 text-right font-mono">{(c.rawProbability * 100).toFixed(1)}%</td>
                          <td className="py-2 px-2 text-right font-mono">{(c.calibratedProbability * 100).toFixed(1)}%</td>
                          <td className="py-2 px-2 text-right font-mono font-semibold">{(c.actual * 100).toFixed(1)}%</td>
                          <td className={cn("py-2 px-2 text-right font-mono", c.rawError < 0 ? "text-amber-500" : "text-blue-500")}>
                            {c.rawError > 0 ? "+" : ""}{(c.rawError * 100).toFixed(1)}pp
                          </td>
                          <td className={cn("py-2 px-2 text-right font-mono", c.calibratedError < 0 ? "text-amber-500" : "text-blue-500")}>
                            {c.calibratedError > 0 ? "+" : ""}{(c.calibratedError * 100).toFixed(1)}pp
                          </td>
                          <td className="py-2 px-2 text-center">
                            {c.improved ? (
                              <span className="text-success text-[10px] font-semibold">↑ Better</span>
                            ) : (
                              <span className="text-destructive text-[10px]">↓ Worse</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Coverage Map */}
        <Card>
          <button
            onClick={() => setShowCoverageMap((v) => !v)}
            className="w-full flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Calibration Coverage Map</span>
              <span className="text-xs text-muted-foreground">Maturity grid — bucket × therapy area × question type</span>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showCoverageMap && "rotate-90")} />
          </button>

          {showCoverageMap && coverageMap && (
            <div className="mt-4 pt-4 border-t border-border space-y-5">
              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span className="font-semibold text-foreground uppercase tracking-wider">Maturity:</span>
                {[
                  { label: "None", cls: "bg-muted/20 text-muted-foreground border-border" },
                  { label: "Low", cls: "bg-amber-400/10 text-amber-600 border-amber-400/30" },
                  { label: "Medium", cls: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
                  { label: "High", cls: "bg-success/10 text-success border-success/30" },
                ].map((m) => (
                  <span key={m.label} className={cn("px-1.5 py-0.5 rounded border font-semibold", m.cls)}>{m.label}</span>
                ))}
                <span className="ml-2 font-semibold text-foreground uppercase tracking-wider">Flags:</span>
                <span className="px-1.5 py-0.5 rounded border bg-success/10 text-success border-success/30 font-semibold">✓ active</span>
                <span className="px-1.5 py-0.5 rounded border bg-amber-400/10 text-amber-600 border-amber-400/30">⚠ low-n</span>
              </div>

              {(() => {
                const BUCKETS = ["0.40-0.60", "0.60-0.75", "0.75-0.90", "0.90+"];
                const maturityCls = (m: string) => {
                  if (m === "high") return "bg-success/10 text-success border-success/30";
                  if (m === "medium") return "bg-blue-500/10 text-blue-500 border-blue-500/30";
                  if (m === "low") return "bg-amber-400/10 text-amber-600 border-amber-400/30";
                  return "bg-muted/10 text-muted-foreground border-border";
                };
                const CoverageCell = ({ cell }: { cell: any }) => {
                  if (!cell || cell.n === 0) return <td className="py-2 px-2 text-center text-muted-foreground/30 text-[10px]">—</td>;
                  return (
                    <td className="py-2 px-2 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold", maturityCls(cell.maturity))}>
                          {cell.maturity}
                        </span>
                        <span className="text-[9px] text-muted-foreground">n={cell.n}</span>
                        <div className="flex gap-1 flex-wrap justify-center">
                          {cell.correctionActive && <span className="text-[8px] text-success font-semibold">✓ active</span>}
                          {cell.lowSampleWarning && <span className="text-[8px] text-amber-600">⚠ low-n</span>}
                          {cell.bucketThresholdMet && !cell.correctionActive && <span className="text-[8px] text-muted-foreground">threshold met</span>}
                        </div>
                      </div>
                    </td>
                  );
                };

                const TableSection = ({ title, rows, dimKey }: { title: string; rows: any[]; dimKey: string }) => (
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">{title}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1.5 px-3 text-muted-foreground font-semibold min-w-40">Segment</th>
                            <th className="text-right py-1.5 px-2 text-muted-foreground font-semibold">Total n</th>
                            {BUCKETS.map((b) => (
                              <th key={b} className="text-center py-1.5 px-2 text-muted-foreground font-semibold min-w-24">{b}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row: any) => (
                            <tr key={row[dimKey]} className="border-b border-border/50 hover:bg-muted/10">
                              <td className="py-2 px-3 font-semibold">{row[dimKey] === "__global" ? "Global" : row[dimKey]}</td>
                              <td className="py-2 px-2 text-right text-muted-foreground">{row.totalResolved}</td>
                              {BUCKETS.map((b) => <CoverageCell key={b} cell={row.buckets?.[b]} />)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );

                const globalRow = coverageMap.globalRow ? [{ ...coverageMap.globalRow, __global: "__global" }] : [];

                return (
                  <>
                    <TableSection title="Global" rows={globalRow} dimKey="__global" />
                    {(coverageMap.byTherapyArea ?? []).length > 0 && (
                      <TableSection title="By Therapy Area" rows={coverageMap.byTherapyArea} dimKey="therapyArea" />
                    )}
                    {(coverageMap.byQuestionType ?? []).length > 0 && (
                      <TableSection title="By Question Type" rows={coverageMap.byQuestionType.map((r: any) => ({ ...r, questionType: r.questionType.replace(/_/g, " ") }))} dimKey="questionType" />
                    )}
                  </>
                );
              })()}

              <p className="text-[10px] text-muted-foreground">
                Total forecasts tracked: <strong className="text-foreground">{coverageMap.totalForecasts}</strong> · Resolved cases: <strong className="text-foreground">{coverageMap.totalResolvedCases}</strong>
              </p>
            </div>
          )}
        </Card>

        {/* How calibration works */}
        <Card className="bg-muted/5 border-dashed">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">How the calibration loop works</p>
              <p>Every forecast run is automatically logged with the predicted probability at that moment. When an actual adoption outcome is recorded (on the Forecast page or in the table above), the system computes the Brier score component <span className="font-mono">(predicted − actual)²</span> and forecast error <span className="font-mono">(actual − predicted)</span> for that entry.</p>
              <p>Over time, the bias analysis reveals which signal types and actor stances are systematically associated with over- or under-forecasting. A positive mean error (blue) means the engine tends to underforecast when that signal type is active. A negative error (amber) means it overforecasts.</p>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
