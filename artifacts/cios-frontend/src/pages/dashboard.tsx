import { useState } from "react";
import { useListCases, useGetCalibrationStats } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { Activity, TrendingUp, AlertTriangle, ArrowRight, CheckCircle2, FlaskConical, BarChart3, Target, HelpCircle, MessageSquare, Send, BookOpen } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/cn";

export default function Dashboard() {
  const { data: cases, isLoading: loadingCases } = useListCases();
  const { data: stats, isLoading: loadingStats } = useGetCalibrationStats();
  const [questionDraft, setQuestionDraft] = useState("");
  const [, navigate] = useLocation();

  if (loadingCases || loadingStats) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <Target className="w-10 h-10 text-primary animate-pulse" />
          <div className="text-muted-foreground">Loading strategic forecasts…</div>
        </div>
      </AppLayout>
    );
  }

  const allCases = cases || [];
  const activeCases = allCases.filter(c => c.currentProbability != null);
  const pendingCases = allCases.filter(c => c.currentProbability == null);

  const alerts: { level: "warn" | "info" | "ok"; text: string }[] = [];
  if (pendingCases.length > 0) {
    alerts.push({ level: "warn", text: `${pendingCases.length} question${pendingCases.length > 1 ? "s" : ""} pending — open each to generate an assessment.` });
  }
  if (activeCases.some(c => c.confidenceLevel === "Low" || c.confidenceLevel === "Developing")) {
    alerts.push({ level: "warn", text: "Some assessments have limited evidence coverage. Adding more signals will improve confidence." });
  }
  if (stats && stats.calibratedForecasts === 0) {
    alerts.push({ level: "info", text: "No resolved outcomes yet. Track record metrics will appear once outcomes are recorded." });
  }
  if (activeCases.length > 0 && allCases.length >= 3) {
    alerts.push({ level: "ok", text: `${activeCases.length} assessment${activeCases.length > 1 ? "s" : ""} computed across ${new Set(allCases.map((c: any) => c.therapeuticArea).filter(Boolean)).size || "multiple"} therapeutic areas.` });
  }
  if (alerts.length === 0) {
    alerts.push({ level: "ok", text: "Platform ready. Ask a strategic question to begin." });
  }

  const handleAsk = () => {
    if (questionDraft.trim()) {
      navigate(`/cases?q=${encodeURIComponent(questionDraft.trim())}`);
    } else {
      navigate("/cases");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Strategic Intelligence Engine
            </span>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            Strategic Forecasts
          </h1>
          <p className="text-muted-foreground mt-1">
            <span className="text-foreground font-medium">{allCases.length}</span> active forecast{allCases.length !== 1 ? "s" : ""} across {new Set(allCases.map((c: any) => c.therapeuticArea).filter(Boolean)).size || 0} therapeutic areas.
          </p>
        </header>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-60 h-60 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Ask a Strategic Question</span>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={questionDraft}
                onChange={(e) => setQuestionDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Will therapy X achieve first-line adoption within 12 months?"
                className="flex-1 bg-input border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
              <Button onClick={handleAsk} className="gap-2 shrink-0 px-5">
                <Send className="w-4 h-4" />
                Ask
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
              <span className="text-[11px] text-muted-foreground/60 font-medium">Examples:</span>
              <button onClick={() => setQuestionDraft("Will competitor X launch before 2027?")} className="text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                Will competitor X launch before 2027?
              </button>
              <button onClick={() => setQuestionDraft("Will therapy Y achieve first-line adoption?")} className="text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                Will therapy Y achieve first-line adoption?
              </button>
              <button onClick={() => setQuestionDraft("Will payer coverage expand to 80% of target accounts?")} className="text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                Will payer coverage expand to 80% of target accounts?
              </button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="flex flex-col items-center justify-center py-8 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Activity className="w-5 h-5 text-primary mb-2" />
            <div className="text-3xl font-bold font-display text-primary">{activeCases.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Active Strategic Questions</div>
            {pendingCases.length > 0 && (
              <div className="text-[10px] text-amber-400 mt-2">{pendingCases.length} pending assessment</div>
            )}
          </Card>

          <Card className="flex flex-col items-center justify-center py-8 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mb-2" />
            <div className="text-3xl font-bold font-display text-emerald-400">{stats?.calibratedForecasts ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Resolved Forecasts</div>
            <div className="text-[10px] text-muted-foreground mt-2">
              {(stats?.calibratedForecasts ?? 0) > 0 ? `${stats?.totalForecasts ?? 0} total tracked` : "Awaiting outcomes"}
            </div>
          </Card>

          <Card className="flex flex-col items-center justify-center py-8 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <BarChart3 className="w-5 h-5 text-blue-400 mb-2" />
            <div className="text-3xl font-bold font-display text-blue-400">
              {stats?.calibratedForecasts && stats.calibratedForecasts > 0
                ? (stats.meanBrierScore ?? 0).toFixed(3)
                : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Calibration Score (Brier)</div>
            {stats?.calibratedForecasts && stats.calibratedForecasts > 0 ? (
              <div className="text-[10px] text-muted-foreground mt-2">Lower is better · 0 = perfect</div>
            ) : (
              <div className="text-[10px] text-muted-foreground mt-2">Awaiting resolved outcomes</div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card>
            <h3 className="text-base font-semibold flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-primary" />
              Active Questions
            </h3>
            <div className="space-y-3">
              {activeCases.slice(0, 4).map(c => {
                const cd = c as any;
                return (
                  <Link key={c.id} href={`/cases/${c.caseId}`}>
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/50 hover:bg-muted/40 hover:border-primary/20 transition-all cursor-pointer group">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                          {c.strategicQuestion}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-muted-foreground">{cd?.assetName || c.primaryBrand}</span>
                          {cd?.therapeuticArea && (
                            <Badge variant="default" className="text-[9px] py-0">{cd.therapeuticArea}</Badge>
                          )}
                          {cd?.isDemo === "true" && (
                            <Badge variant="default" className="text-[9px] py-0">Demo</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <Badge variant={c.confidenceLevel === "High" ? "success" : c.confidenceLevel === "Moderate" ? "warning" : "default"}>
                          {c.confidenceLevel}
                        </Badge>
                        <div className="font-bold text-lg text-primary font-display w-14 text-right">
                          {((c.currentProbability || 0) * 100).toFixed(1)}%
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>
                );
              })}
              {pendingCases.slice(0, Math.max(0, 4 - activeCases.slice(0, 4).length)).map(c => {
                const cd = c as any;
                return (
                  <Link key={c.id} href={`/cases/${c.caseId}`}>
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/10 border border-border/30 opacity-60 hover:opacity-80 transition-opacity cursor-pointer">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug line-clamp-1">
                          {c.strategicQuestion}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">{cd?.assetName || c.primaryBrand}</div>
                      </div>
                      <Badge variant="default">Pending</Badge>
                    </div>
                  </Link>
                );
              })}
              {allCases.length === 0 && (
                <div className="text-center py-10 text-muted-foreground flex flex-col items-center">
                  <HelpCircle className="w-8 h-8 mb-3 opacity-20" />
                  <p>No strategic questions yet.</p>
                  <Link href="/cases">
                    <Button variant="ghost" className="mt-2 text-sm">Ask your first question</Button>
                  </Link>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/case-library">
            <Card className="group cursor-pointer hover:border-primary/30 transition-colors">
              <h3 className="text-base font-semibold flex items-center gap-2 mb-5">
                <BookOpen className="w-4 h-4 text-primary" />
                Forecast Ledger
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-muted-foreground">Resolved predictions</span>
                  <span className="text-xl font-bold text-foreground">{stats?.calibratedForecasts ?? 0}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-muted-foreground">Calibration score</span>
                  <span className="text-xl font-bold text-foreground">{stats?.meanBrierScore?.toFixed(3) ?? "—"}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-muted-foreground">Last evaluation</span>
                  <span className="text-sm font-medium text-foreground">{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/30 flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                View full ledger <ArrowRight className="w-3 h-3" />
              </div>
            </Card>
          </Link>

          <Card className="col-span-2">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-warning" />
              System Status
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
