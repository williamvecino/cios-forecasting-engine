import { Link } from "wouter";
import { useListCases } from "@workspace/api-client-react";
import TopNav from "@/components/top-nav";
import {
  BarChart3,
  Plus,
  Target,
} from "lucide-react";

export default function ForecastsPage() {
  const { data: cases, isLoading } = useListCases();
  const allCases = (cases as any[]) || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Forecasts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              All your forecast cases. Each opens into the 4-step workflow.
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
            <Target className="w-8 h-8 text-primary animate-pulse" />
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
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
