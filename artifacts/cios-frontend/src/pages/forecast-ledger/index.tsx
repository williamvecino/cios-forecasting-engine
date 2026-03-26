import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, Badge } from "@/components/ui-components";
import { BookOpen, Clock, Target, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface LedgerEntry {
  id: string;
  predictionId: string;
  caseId: string;
  strategicQuestion: string;
  forecastProbability: number;
  forecastDate: string;
  timeHorizon: string;
  expectedResolutionDate: string | null;
  actualOutcome: number | null;
  resolutionDate: string | null;
  predictionError: number | null;
  calibrationBucket: string;
}

export default function ForecastLedger() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/forecast-ledger`)
      .then((r) => r.json())
      .then((data) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const resolved = entries.filter((e) => e.actualOutcome !== null);
  const pending = entries.filter((e) => e.actualOutcome === null);

  const avgError =
    resolved.length > 0
      ? resolved.reduce((sum, e) => sum + (e.predictionError ?? 0), 0) / resolved.length
      : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Forecast Tracking
            </span>
          </div>
          <h1 className="text-3xl font-bold">Forecast Ledger</h1>
          <p className="text-muted-foreground mt-1">
            Formal prediction history with resolution tracking and calibration scoring.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="flex flex-col items-center justify-center py-6">
            <Target className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-bold text-primary">{entries.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Predictions</div>
          </Card>
          <Card className="flex flex-col items-center justify-center py-6">
            <Clock className="w-5 h-5 text-amber-400 mb-2" />
            <div className="text-2xl font-bold text-amber-400">{pending.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Awaiting Resolution</div>
          </Card>
          <Card className="flex flex-col items-center justify-center py-6">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mb-2" />
            <div className="text-2xl font-bold text-emerald-400">{resolved.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Resolved</div>
          </Card>
          <Card className="flex flex-col items-center justify-center py-6">
            <AlertCircle className="w-5 h-5 text-blue-400 mb-2" />
            <div className="text-2xl font-bold text-blue-400">
              {avgError !== null ? avgError.toFixed(3) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Mean Prediction Error</div>
          </Card>
        </div>

        <Card noPadding>
          <div className="p-4 border-b border-border bg-muted/10">
            <h3 className="text-sm font-semibold text-foreground">Prediction History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-semibold">Prediction ID</th>
                  <th className="px-4 py-3 font-semibold">Question</th>
                  <th className="px-4 py-3 font-semibold text-right">Forecast</th>
                  <th className="px-4 py-3 font-semibold">Bucket</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Horizon</th>
                  <th className="px-4 py-3 font-semibold text-center">Outcome</th>
                  <th className="px-4 py-3 font-semibold text-right">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      Loading ledger...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <BookOpen className="w-8 h-8 opacity-20" />
                        <p>No predictions recorded yet.</p>
                        <p className="text-xs">
                          Record a forecast from any active case to populate the ledger.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-primary">
                        {entry.predictionId}
                      </td>
                      <td className="px-4 py-3 max-w-[220px] truncate">
                        {entry.strategicQuestion}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {(entry.forecastProbability * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="default">{entry.calibrationBucket}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(entry.forecastDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {entry.timeHorizon}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {entry.actualOutcome === null ? (
                          <Badge variant="warning">Pending</Badge>
                        ) : entry.actualOutcome === 1 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <XCircle className="w-3.5 h-3.5" /> No
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {entry.predictionError !== null
                          ? entry.predictionError.toFixed(3)
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
