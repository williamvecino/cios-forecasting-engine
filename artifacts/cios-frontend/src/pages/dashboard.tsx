import { useListCases, useGetCalibrationStats } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, ProbabilityGauge } from "@/components/ui-components";
import { Activity, Target, AlertTriangle, ArrowRight, BrainCircuit, BarChart2 } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: cases, isLoading: loadingCases } = useListCases();
  const { data: stats, isLoading: loadingStats } = useGetCalibrationStats();

  if (loadingCases || loadingStats) return <AppLayout><div className="p-8 text-center text-muted-foreground animate-pulse">Initializing strategic core...</div></AppLayout>;

  const activeCases = cases?.filter(c => c.currentProbability !== undefined) || [];
  const avgProb = activeCases.length > 0 
    ? activeCases.reduce((acc, c) => acc + (c.currentProbability || 0), 0) / activeCases.length 
    : 0;

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">CIOS Executive Overview</h1>
            <p className="text-muted-foreground mt-2 text-lg">System active. Monitoring {cases?.length || 0} strategic cases.</p>
          </div>
          <Link href="/cases">
            <Button className="gap-2 group">
              <BrainCircuit className="w-4 h-4" />
              New Forecast Case
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="flex flex-col items-center justify-center py-10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <ProbabilityGauge value={avgProb} label="Global Confidence" />
          </Card>
          
          <Card className="col-span-2">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <Target className="w-5 h-5 text-primary" />
              Active Strategic Cases
            </h3>
            <div className="space-y-4">
              {activeCases.slice(0, 3).map(c => (
                <div key={c.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/50 hover:bg-muted/40 transition-colors">
                  <div>
                    <div className="font-medium text-foreground">{c.primaryBrand}</div>
                    <div className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{c.strategicQuestion}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={c.confidenceLevel === 'High' ? 'success' : c.confidenceLevel === 'Moderate' ? 'warning' : 'default'}>
                      {c.confidenceLevel} Conf
                    </Badge>
                    <div className="text-right">
                      <div className="font-bold text-lg font-display text-primary">{((c.currentProbability || 0) * 100).toFixed(1)}%</div>
                    </div>
                    <Link href={`/cases/${c.caseId}/forecast`}>
                      <Button variant="ghost" size="sm" className="ml-2">View</Button>
                    </Link>
                  </div>
                </div>
              ))}
              {activeCases.length === 0 && (
                <div className="text-center py-8 text-muted-foreground flex flex-col items-center">
                  <Activity className="w-8 h-8 mb-3 opacity-20" />
                  No computed forecasts yet.
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <BarChart2 className="w-5 h-5 text-accent" />
              Calibration Health
            </h3>
            {stats ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-background rounded-xl border border-border">
                  <div className="text-sm text-muted-foreground">Brier Score</div>
                  <div className="text-2xl font-bold mt-1">{stats.meanBrierScore?.toFixed(3) || 'N/A'}</div>
                </div>
                <div className="p-4 bg-background rounded-xl border border-border">
                  <div className="text-sm text-muted-foreground">Mean Error</div>
                  <div className="text-2xl font-bold mt-1 text-success">{stats.meanForecastError ? (stats.meanForecastError * 100).toFixed(1) + '%' : 'N/A'}</div>
                </div>
                <div className="col-span-2 p-4 bg-background rounded-xl border border-border flex justify-between items-center">
                  <div className="text-sm font-medium">Forecasts Calibrated</div>
                  <Badge variant="primary">{stats.calibratedForecasts} / {stats.totalForecasts}</Badge>
                </div>
              </div>
            ) : (
               <div className="text-muted-foreground text-sm">Calibration data unavailable.</div>
            )}
          </Card>

          <Card>
             <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-warning" />
              System Alerts
            </h3>
            <div className="space-y-3">
              <div className="flex gap-3 p-3 rounded-lg bg-warning/5 border border-warning/10 text-sm">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-muted-foreground">Competitor counteraction showing stronger negative impact across general pulmonology segments.</p>
              </div>
              <div className="flex gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm">
                <Activity className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-muted-foreground">3 new signals detected in Field Intelligence requiring validation.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
