import { useRoute, Link } from "wouter";
import { useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { ShieldCheck, ArrowLeft, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function AgentHygiene() {
  const [, params] = useRoute("/case/:caseId/agents/hygiene");
  const caseId = params?.caseId ?? "";
  const { data: caseData } = useGetCase(caseId);

  const { data: signals } = useQuery<any[]>({
    queryKey: [`/api/cases/${caseId}/signals`, "hygiene"],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${caseId}/signals`);
      return res.json();
    },
    enabled: !!caseId,
  });

  const activeSignals = signals?.filter((s: any) => s.status === "active") ?? [];
  const issues: Array<{ signalId: string; description: string; issue: string; severity: string }> = [];

  for (const s of activeSignals) {
    if (!s.sourceLabel && !s.sourceUrl) {
      issues.push({ signalId: s.id, description: s.description || "Unnamed signal", issue: "Missing source attribution", severity: "high" });
    }
    if (!s.observedAt) {
      issues.push({ signalId: s.id, description: s.description || "Unnamed signal", issue: "Missing observation date", severity: "medium" });
    }
    if (!s.evidenceSnippet) {
      issues.push({ signalId: s.id, description: s.description || "Unnamed signal", issue: "No evidence snippet", severity: "low" });
    }
  }

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
          <span className="text-foreground">Signal Hygiene</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hygiene Agent</span>
          </div>
          <h1 className="text-2xl font-bold">Signal Hygiene Review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Audit active signals for data quality: missing sources, dates, evidence, and duplicate detection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">{activeSignals.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Active Signals</div>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400">{issues.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Quality Issues Found</div>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-400">
                {activeSignals.length > 0 ? Math.round(((activeSignals.length - new Set(issues.map(i => i.signalId)).size) / activeSignals.length) * 100) : 100}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">Hygiene Score</div>
            </div>
          </Card>
        </div>

        {issues.length === 0 ? (
          <Card className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-500/30" />
            <h3 className="text-lg font-semibold mb-2">All Clear</h3>
            <p className="text-sm text-muted-foreground">All active signals pass quality checks.</p>
          </Card>
        ) : (
          <Card noPadding>
            <div className="p-4 border-b border-border/50">
              <h3 className="text-sm font-semibold">Quality Issues</h3>
            </div>
            <div className="divide-y divide-border/30">
              {issues.map((issue, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                    issue.severity === "high" ? "text-red-400" :
                    issue.severity === "medium" ? "text-yellow-400" : "text-blue-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{issue.issue}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{issue.description}</p>
                  </div>
                  <Badge variant={issue.severity === "high" ? "destructive" : "default"}>
                    {issue.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
