import { useListCalibration, useGetCalibrationStats } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { BarChart2, Target } from "lucide-react";
import { format } from "date-fns";

export default function Calibration() {
  const { data: logs, isLoading: loadingLogs } = useListCalibration();
  const { data: stats } = useGetCalibrationStats();

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Engine Calibration</h1>
          <p className="text-muted-foreground mt-1">Brier scoring and forecast accuracy feedback loop.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <div className="text-sm text-muted-foreground">Mean Brier Score</div>
            <div className="text-3xl font-display font-bold mt-2 text-primary">
              {stats ? (stats.meanBrierScore ?? 0).toFixed(3) : '-'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Lower is better (0-1)</div>
          </Card>
          <Card>
            <div className="text-sm text-muted-foreground">Mean Forecast Error</div>
            <div className="text-3xl font-display font-bold mt-2 text-foreground">
              {stats ? ((stats.meanForecastError ?? 0) * 100).toFixed(1) + '%' : '-'}
            </div>
          </Card>
          <Card>
            <div className="text-sm text-muted-foreground">Calibrated Records</div>
            <div className="text-3xl font-display font-bold mt-2 text-foreground">{stats?.calibratedForecasts || 0}</div>
          </Card>
          <Card>
            <div className="text-sm text-muted-foreground">Total Forecasts</div>
            <div className="text-3xl font-display font-bold mt-2 text-foreground">{stats?.totalForecasts || 0}</div>
          </Card>
        </div>

        <Card noPadding>
          <div className="p-4 border-b border-border bg-muted/10 font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Prediction Log
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Case ID</th>
                  <th className="px-6 py-4 font-semibold text-right">Predicted</th>
                  <th className="px-6 py-4 font-semibold text-right">Actual</th>
                  <th className="px-6 py-4 font-semibold text-right">Brier Component</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loadingLogs ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading log...</td></tr>
                ) : logs?.map(log => (
                  <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {log.predictionDate ? format(new Date(log.predictionDate), 'MMM dd, yyyy') : 'Unknown'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-medium">{log.caseId}</td>
                    <td className="px-6 py-4 text-right font-mono">{(log.predictedProbability * 100).toFixed(1)}%</td>
                    <td className="px-6 py-4 text-right font-mono">
                      {log.observedOutcome !== undefined && log.observedOutcome !== null 
                        ? `${(log.observedOutcome * 100).toFixed(0)}%` 
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-muted-foreground">
                      {log.brierComponent?.toFixed(4) || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {log.observedOutcome !== undefined && log.observedOutcome !== null ? (
                        <Badge variant="success">Calibrated</Badge>
                      ) : (
                        <Button variant="outline" size="sm" className="h-7 text-xs">Record Outcome</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
