import { useRoute, Link } from "wouter";
import { useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { FileText, ArrowLeft, ChevronRight, Lightbulb } from "lucide-react";

export default function AgentRefinement() {
  const [, params] = useRoute("/case/:caseId/agents/refinement");
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
          <span className="text-foreground">Question Refinement</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Refinement Agent</span>
          </div>
          <h1 className="text-2xl font-bold">Refine Question</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyze the strategic question for clarity, specificity, and forecastability. Suggest improvements.
          </p>
        </div>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Badge variant="primary">Current Question</Badge>
            <span className="text-sm text-muted-foreground font-mono">{caseData?.caseId}</span>
          </div>
          <p className="text-base text-foreground font-medium leading-relaxed">
            {caseData?.strategicQuestion}
          </p>
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
            {(caseData as any)?.therapeuticArea && <span>{(caseData as any).therapeuticArea}</span>}
            {(caseData as any)?.geography && <span>· {(caseData as any).geography}</span>}
            {caseData?.timeHorizon && <span>· {caseData.timeHorizon}</span>}
          </div>
        </Card>

        <Card className="text-center py-12">
          <Lightbulb className="w-12 h-12 mx-auto mb-4 text-yellow-500/30" />
          <h3 className="text-lg font-semibold mb-2">Question Refinement Agent</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            This agent will analyze your strategic question and suggest improvements to make it more precise, measurable, and forecastable.
          </p>
          <p className="text-xs text-muted-foreground">Coming soon — agent under development.</p>
        </Card>
      </div>
    </AppLayout>
  );
}
