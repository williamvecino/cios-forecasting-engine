import { Link } from "wouter";
import { useState, useEffect } from "react";
import { useListCases } from "@workspace/api-client-react";
import TopNav from "@/components/top-nav";
import {
  BarChart3,
  Plus,
  Target,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

interface CaseCompleteness {
  caseId: string;
  pass: boolean;
  hardBlocked: boolean;
  allChecks: { category: string; tier: number; present: boolean; message: string }[];
}

function useCompletenessAll() {
  const [data, setData] = useState<Record<string, CaseCompleteness>>({});
  useEffect(() => {
    fetch(`${getApiBase()}/completeness-check/all`)
      .then(r => r.json())
      .then(res => {
        const map: Record<string, CaseCompleteness> = {};
        for (const c of res.cases || []) {
          map[c.caseId] = c;
        }
        setData(map);
      })
      .catch(() => {});
  }, []);
  return data;
}

export default function ForecastsPage() {
  const { data: cases, isLoading } = useListCases();
  const allCases = (cases as any[]) || [];
  const completeness = useCompletenessAll();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Forecasts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              All your forecast cases. Each opens into the 6-step workflow.
            </p>
          </div>
          <Link
            href="/question"
            className="rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            New Forecast
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-[40vh]">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!isLoading && allCases.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-4">
            <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">No forecasts yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Start by defining a strategic question. The system will structure it and create a forecast case automatically.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Define Question
            </Link>
          </div>
        )}

        {!isLoading && allCases.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allCases.map((c: any) => {
              const cid = c.caseId || c.id;
              const prob = c.currentProbability;
              const conf = c.confidenceLevel;
              return (
                <Link
                  key={cid}
                  href={`/case/${cid}/question`}
                  className="rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:bg-muted/10 transition space-y-3 group"
                >
                  <div className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition">
                    {c.strategicQuestion || c.assetName || "Untitled"}
                  </div>

                  <div className="flex items-center gap-3">
                    {prob != null ? (
                      <span className="text-2xl font-bold text-primary">
                        {Math.round(prob * 100)}%
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">No forecast</span>
                    )}
                    {conf && (
                      <span className="rounded-full bg-muted/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {conf}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{cid}</span>
                    {c.primaryBrand && <span>· {c.primaryBrand}</span>}
                  </div>

                  {completeness[cid] && completeness[cid].hardBlocked && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/30 px-2.5 py-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="text-[10px] font-semibold text-red-400">Missing Clinical Evidence</span>
                    </div>
                  )}
                  {completeness[cid] && !completeness[cid].hardBlocked && !completeness[cid].pass && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[10px] font-medium text-amber-400">
                        {completeness[cid].allChecks.filter(ch => !ch.present).length} signal gap{completeness[cid].allChecks.filter(ch => !ch.present).length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                  {completeness[cid] && completeness[cid].pass && (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] font-medium text-emerald-400">Signal coverage complete</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
