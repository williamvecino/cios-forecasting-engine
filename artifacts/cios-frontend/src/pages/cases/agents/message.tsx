import { useRoute, Link } from "wouter";
import { useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { MessageSquare, ArrowLeft, ChevronRight, BarChart3 } from "lucide-react";

export default function AgentMessage() {
  const [, params] = useRoute("/case/:caseId/agents/message");
  const caseId = params?.caseId ?? "";
  const { data: caseData } = useGetCase(caseId);

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
          <span className="text-foreground">Message Impact</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message Agent</span>
          </div>
          <h1 className="text-2xl font-bold">Review Message Impact</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyze how specific messages or communications may influence HCP adoption and forecast outcomes.
          </p>
        </div>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Badge variant="primary">Case Context</Badge>
            <span className="text-sm text-muted-foreground font-mono">{caseData?.caseId}</span>
          </div>
          <p className="text-sm text-foreground">{caseData?.strategicQuestion}</p>
        </Card>

        <Card className="text-center py-12">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 text-primary/30" />
          <h3 className="text-lg font-semibold mb-2">Message Impact Agent</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            This agent will evaluate message content, delivery channel, and audience to estimate the potential impact on adoption probability.
          </p>
          <p className="text-xs text-muted-foreground">Coming soon — agent under development.</p>
        </Card>
      </div>
    </AppLayout>
  );
}
