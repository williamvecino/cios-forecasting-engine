import { useListCases, useGetCalibrationStats } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, ProbabilityGauge } from "@/components/ui-components";
import { Activity, TrendingUp, AlertTriangle, ArrowRight, BrainCircuit, BarChart3, CheckCircle2, FlaskConical } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: cases, isLoading: loadingCases } = useListCases();
  const { data: stats, isLoading: loadingStats } = useGetCalibrationStats();

  if (loadingCases || loadingStats) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground animate-pulse">
          Initializing CIOS platform…
        </div>
      </AppLayout>
    );
  }

  const allCases = cases || [];
  const activeCases = allCases.filter(c => c.currentProbability != null);
  const pendingCases = allCases.filter(c => c.currentProbability == null);
  const demoCases = allCases.filter(c => (c as any).isDemo === "true");
  const avgProb = activeCases.length > 0
    ? activeCases.reduce((acc, c) => acc + (c.currentProbability || 0), 0) / activeCases.length
    : 0;

  // Dynamic system alerts derived from data
  const alerts: { level: "warn" | "info" | "ok"; text: string }[] = [];
  if (pendingCases.length > 0) {
    alerts.push({ level: "warn", text: `${pendingCases.length} case${pendingCases.length > 1 ? "s" : ""} initialized but not yet forecast — open each case and run the engine.` });
  }
  if (activeCases.some(c => c.confidenceLevel === "Low" || c.confidenceLevel === "Developing")) {
    alerts.push({ level: "warn", text: "One or more cases have low signal coverage. Add more signals to improve confidence." });
  }
  if (stats && stats.calibratedForecasts === 0) {
    alerts.push({ level: "info", text: "No resolved forecasts yet. Calibration metrics will appear once outcomes are recorded." });
  }
  if (activeCases.length > 0 && allCases.length >= 3) {
    alerts.push({ level: "ok", text: `${activeCases.length} forecast${activeCases.length > 1 ? "s" : ""} computed across ${new Set(allCases.map((c: any) => c.therapeuticArea).filter(Boolean)).size || "multiple"} therapeutic areas.` });
  }
  if (alerts.length === 0) {
    alerts.push({ level: "ok", text: "Platform ready. Create a forecast case to begin." });
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Header */}
        <header className="flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Clinical Intelligence &amp; Outcome System
              </span>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
              Platform Overview
            </h1>
            <p className="text-muted-foreground mt-1">
              Bayesian HCP adoption forecasting — any asset, any specialty, any geography.{" "}
              <span className="text-foreground font-medium">{allCases.length}</span> active case{allCases.length !== 1 ? "s" : ""}.
              {demoCases.length > 0 && (
                <span className="text-muted-foreground/60 text-xs ml-2">({demoCases.length} demo)</span>
              )}
            </p>
          </div>
          <Link href="/cases">
            <Button className="gap-2 group">
              <FlaskConical className="w-4 h-4" />
              New Forecast Case
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </header>

        {/* Top KPI row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Global probability gauge */}
          <Card className="flex flex-col items-center justify-center py-10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <ProbabilityGauge value={avgProb} label="Portfolio Avg." />
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {activeCases.length > 0
                ? `Across ${activeCases.length} computed forecast${activeCases.length > 1 ? "s" : ""}`
                : "No computed forecasts yet"}
            </p>
          </Card>

          {/* Active cases */}
          <Card className="col-span-2">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-primary" />
              Active Forecast Cases
            </h3>
            <div className="space-y-3">
              {activeCases.slice(0, 3).map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/50 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-sm">{(c as any).assetName || c.primaryBrand}</span>
                      {(c as any).therapeuticArea && (
                        <Badge variant="default" className="text-[10px]">{(c as any).therapeuticArea}</Badge>
                      )}
                      {(c as any).isDemo === "true" && (
                        <Badge variant="default" className="text-[10px]">Demo</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{c.strategicQuestion}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <Badge variant={c.confidenceLevel === "High" ? "success" : c.confidenceLevel === "Moderate" ? "warning" : "default"}>
                      {c.confidenceLevel}
                    </Badge>
                    <div className="font-bold text-lg text-primary font-display w-14 text-right">
                      {((c.currentProbability || 0) * 100).toFixed(1)}%
                    </div>
                    <Link href={`/cases/${c.caseId}/forecast`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                </div>
              ))}
              {pendingCases.slice(0, 3 - activeCases.slice(0, 3).length).map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-muted/10 border border-border/30 opacity-60 hover:opacity-80 transition-opacity"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm">{(c as any).assetName || c.primaryBrand}</span>
                      {(c as any).isDemo === "true" && (
                        <Badge variant="default" className="text-[10px]">Demo</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{c.strategicQuestion}</div>
                  </div>
                  <div className="shrink-0 ml-4">
                    <Link href={`/cases/${c.caseId}/forecast`}>
                      <Button variant="ghost" size="sm">Run</Button>
                    </Link>
                  </div>
                </div>
              ))}
              {allCases.length === 0 && (
                <div className="text-center py-10 text-muted-foreground flex flex-col items-center">
                  <Activity className="w-8 h-8 mb-3 opacity-20" />
                  <p>No cases yet.</p>
                  <Link href="/cases">
                    <Button variant="ghost" className="mt-2 text-sm">Create your first case</Button>
                  </Link>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Calibration */}
          <Card>
            <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-accent" />
              Calibration Health
            </h3>
            {stats && stats.totalForecasts > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-background rounded-xl border border-border">
                  <div className="text-xs text-muted-foreground">Brier Score</div>
                  <div className="text-2xl font-bold mt-1">{stats.meanBrierScore?.toFixed(3) ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">lower = better</div>
                </div>
                <div className="p-3.5 bg-background rounded-xl border border-border">
                  <div className="text-xs text-muted-foreground">Mean Error</div>
                  <div className="text-2xl font-bold mt-1 text-success">
                    {stats.meanForecastError != null ? (stats.meanForecastError * 100).toFixed(1) + "%" : "—"}
                  </div>
                </div>
                <div className="col-span-2 p-3.5 bg-background rounded-xl border border-border flex justify-between items-center">
                  <div className="text-sm font-medium">Resolved forecasts</div>
                  <Badge variant="primary">{stats.calibratedForecasts} / {stats.totalForecasts}</Badge>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm py-4 text-center">
                Calibration metrics appear after forecast outcomes are recorded.
              </div>
            )}
          </Card>

          {/* System alerts — dynamic */}
          <Card>
            <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Platform Alerts
            </h3>
            <div className="space-y-2.5">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex gap-3 p-3 rounded-lg text-sm border ${
                    alert.level === "warn"
                      ? "bg-warning/5 border-warning/15"
                      : alert.level === "ok"
                      ? "bg-success/5 border-success/15"
                      : "bg-primary/5 border-primary/10"
                  }`}
                >
                  {alert.level === "warn" && <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />}
                  {alert.level === "ok" && <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />}
                  {alert.level === "info" && <Activity className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                  <p className="text-muted-foreground">{alert.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
