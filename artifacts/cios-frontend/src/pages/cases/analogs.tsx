import { useRoute } from "wouter";
import { useGetAnalogs, useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { Library, CheckCircle2, RefreshCcw } from "lucide-react";

export default function AnalogRetrieval() {
  const [, params] = useRoute("/cases/:caseId/analogs");
  const caseId = params?.caseId || "";

  const { data: caseData } = useGetCase(caseId);
  const { data: analogs, isLoading } = useGetAnalogs(caseId);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="primary">ANALOG ENGINE</Badge>
              <span className="text-sm font-medium text-muted-foreground">{caseId}</span>
            </div>
            <h1 className="text-3xl font-bold">Analog Case Retrieval</h1>
            <p className="text-muted-foreground mt-1">Matched historical patterns based on specialty, leverage, and actors.</p>
          </div>
          <Button variant="outline" className="gap-2"><RefreshCcw className="w-4 h-4"/> Rerun Matching</Button>
        </header>

        {isLoading ? (
          <div className="text-center p-12 text-muted-foreground animate-pulse">Running similarity vectors against library...</div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {analogs?.map((match, i) => (
              <Card key={i} className="relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-primary/80" />
                <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm text-primary font-semibold">{match.analogCase.caseId}</span>
                      <Badge variant="default">{match.analogCase.therapyArea}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">{match.similarityReasoning}</p>
                    <div className="flex flex-wrap gap-2">
                      {match.matchedDimensions?.map(dim => (
                        <div key={dim} className="flex items-center gap-1 text-xs bg-muted/30 px-2 py-1 rounded-md text-foreground">
                          <CheckCircle2 className="w-3 h-3 text-success" />
                          {dim}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="lg:w-48 bg-background rounded-xl border border-border p-4 flex flex-col items-center justify-center shrink-0">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Similarity Score</div>
                    <div className="text-3xl font-display font-bold text-foreground">{(match.similarityScore * 100).toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground mt-2">Historical Outcome:</div>
                    <div className="text-sm font-medium text-center truncate w-full" title={match.analogCase.finalObservedOutcome || ''}>
                      {match.analogCase.finalObservedOutcome || 'N/A'}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {analogs?.length === 0 && (
              <Card className="text-center py-12">
                <Library className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground">No close analogs found</h3>
                <p className="text-muted-foreground">The current case profile does not strongly match historical records.</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
