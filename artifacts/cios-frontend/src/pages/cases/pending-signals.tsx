import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { cn } from "@/lib/cn";
import {
  ClipboardCheck, ChevronRight, ArrowLeft, Clock,
  CheckCircle2, XCircle, AlertTriangle, Radio,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
  candidate: { label: "Candidate", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Clock },
  reviewed: { label: "Reviewed", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: AlertTriangle },
  validated: { label: "Validated", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
};

export default function PendingSignals() {
  const [, params] = useRoute("/case/:caseId/pending-signals");
  const caseId = params?.caseId ?? "";
  const { data: caseData } = useGetCase(caseId);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: signals, isLoading } = useQuery<any[]>({
    queryKey: [`/api/cases/${caseId}/signals`, "pending"],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${caseId}/signals`);
      const all = await res.json();
      return all.filter((s: any) => s.status && s.status !== "active" && s.status !== "archived" && s.status !== "rejected");
    },
    enabled: !!caseId,
  });

  const filtered = signals?.filter((s: any) => statusFilter === "all" || s.status === statusFilter) ?? [];

  const statusCounts = signals?.reduce((acc: Record<string, number>, s: any) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Link href={`/case/${caseId}/question`}>
            <span className="hover:text-foreground cursor-pointer flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> {caseData?.caseId || "Case"}
            </span>
          </Link>
          <ChevronRight className="w-3 h-3 opacity-40" />
          <span className="text-foreground">Pending Signals</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Signal Review</span>
          </div>
          <h1 className="text-2xl font-bold">Pending Signals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signals awaiting review for this case. Only active signals affect forecasts.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              statusFilter === "all"
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
            )}
            onClick={() => setStatusFilter("all")}
          >
            All ({signals?.length || 0})
          </button>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                statusFilter === key
                  ? `${cfg.color}`
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
              )}
              onClick={() => setStatusFilter(key)}
            >
              {cfg.label} ({statusCounts[key] || 0})
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center p-12 text-muted-foreground animate-pulse">Loading pending signals…</div>
        ) : filtered.length === 0 ? (
          <Card className="text-center py-16">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-4 text-emerald-500/30" />
            <p className="text-muted-foreground">No pending signals for this case.</p>
            <p className="text-xs text-muted-foreground mt-2">
              All signals are either active or have been resolved.
            </p>
            <Link href="/review">
              <Button variant="outline" size="sm" className="mt-4">
                Open Full Review Queue
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((signal: any) => {
              const cfg = STATUS_CONFIG[signal.status] || STATUS_CONFIG.candidate;
              const Icon = cfg.icon;
              return (
                <Card key={signal.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge variant="default">{signal.signalType || "Unknown"}</Badge>
                        <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border", cfg.color)}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </div>
                        {signal.direction && (
                          <span className={cn(
                            "text-xs font-medium",
                            signal.direction === "positive" ? "text-emerald-400" :
                            signal.direction === "negative" ? "text-red-400" : "text-muted-foreground"
                          )}>
                            {signal.direction === "positive" ? "↑" : signal.direction === "negative" ? "↓" : "→"} {signal.direction}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground">{signal.description || signal.evidenceSnippet || "No description"}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {signal.sourceLabel && <span>Source: {signal.sourceLabel}</span>}
                        {signal.observedAt && <span>· {new Date(signal.observedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <Link href="/review">
                      <Button variant="outline" size="sm">
                        Review <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
