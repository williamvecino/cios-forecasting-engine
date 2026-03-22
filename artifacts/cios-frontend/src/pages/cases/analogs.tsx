import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetAnalogs, useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Card, Badge, Button } from "@/components/ui-components";
import { Library, CheckCircle2, RefreshCcw, AlertTriangle, BookOpen, Minus, Repeat2 } from "lucide-react";

function ConfidenceBand({ band }: { band: string }) {
  const styles: Record<string, string> = {
    High: "bg-success/10 text-success border-success/20",
    Moderate: "bg-warning/10 text-warning border-warning/20",
    Low: "bg-muted/20 text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
        styles[band] ?? styles["Low"]
      )}
    >
      {band} Confidence
    </span>
  );
}

function SimilarityMeter({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color =
    pct >= 65
      ? "bg-success"
      : pct >= 35
        ? "bg-warning"
        : "bg-muted-foreground/40";
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Similarity Score
        </span>
        <span className="text-2xl font-display font-bold">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function AnalogRetrieval() {
  const [, params] = useRoute("/case/:caseId/analogs");
  const caseId = params?.caseId || "";

  const { data: caseData } = useGetCase(caseId);
  const { data: analogs, isLoading, refetch } = useGetAnalogs(caseId);

  interface PatternSummary {
    id: string;
    label: string;
    description: string;
    signalTypes: string[];
    caseCount: number;
    exampleCases: Array<{ caseId: string; therapyArea: string; finalOutcome: string | null; finalProbability: number | null }>;
  }
  const { data: patterns = [] } = useQuery<PatternSummary[]>({
    queryKey: ["/api/patterns"],
    queryFn: () => fetch("/api/patterns").then((r) => r.json()),
    staleTime: 1000 * 60 * 10,
  });

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
            <p className="text-muted-foreground mt-1">
              Historical patterns ranked by structural similarity to{" "}
              <span className="text-foreground font-medium">
                {(caseData as any)?.assetName || caseData?.primaryBrand || caseId}
              </span>
              . Explains why each analog was selected and what its trajectory teaches.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => refetch()}>
            <RefreshCcw className="w-4 h-4" /> Rerun Matching
          </Button>
        </header>

        {isLoading ? (
          <div className="text-center p-12 text-muted-foreground animate-pulse">
            Running similarity vectors against library…
          </div>
        ) : (
          <div className="space-y-4">
            {analogs?.map((match, i) => {
              const m = match as any;
              const score = match.similarityScore; // already 0-100
              const rank = i + 1;
              return (
                <Card key={i} className="relative overflow-hidden">
                  {/* Rank stripe */}
                  <div
                    className={cn(
                      "absolute top-0 left-0 w-1.5 h-full",
                      score >= 65
                        ? "bg-success/70"
                        : score >= 35
                          ? "bg-warning/60"
                          : "bg-muted-foreground/30"
                    )}
                  />

                  <div className="pl-2">
                    {/* Top row */}
                    <div className="flex flex-col lg:flex-row gap-5">
                      {/* Left: metadata + reasoning */}
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center flex-wrap gap-2 mb-2">
                          <span className="text-xs text-muted-foreground font-mono font-semibold">
                            #{rank}
                          </span>
                          <span className="font-mono text-sm text-primary font-bold">
                            {match.analogCase.caseId}
                          </span>
                          {match.analogCase.therapyArea && (
                            <Badge variant="default">{match.analogCase.therapyArea}</Badge>
                          )}
                          {match.analogCase.specialty && (
                            <Badge variant="default">{match.analogCase.specialty}</Badge>
                          )}
                          {match.analogCase.productType && (
                            <span className="text-xs text-muted-foreground">
                              · {match.analogCase.productType}
                            </span>
                          )}
                          {match.analogCase.lifecycleStage && (
                            <span className="text-xs text-muted-foreground">
                              · {match.analogCase.lifecycleStage}
                            </span>
                          )}
                          <ConfidenceBand band={m.confidenceBand ?? "Low"} />
                        </div>

                        {/* Why selected */}
                        <div className="mb-3">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                            Why selected
                          </div>
                          <p className="text-sm text-foreground/80 leading-relaxed">
                            {match.similarityReasoning}
                          </p>
                        </div>

                        {/* Matched dimensions */}
                        {match.matchedDimensions && match.matchedDimensions.length > 0 && (
                          <div className="mb-3">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                              Matched dimensions
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {match.matchedDimensions.map((dim) => (
                                <div
                                  key={dim}
                                  className="flex items-center gap-1 text-[11px] bg-success/8 border border-success/15 text-success px-2 py-0.5 rounded-md"
                                >
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  {dim}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Key differences */}
                        {m.keyDifferences && m.keyDifferences.length > 0 && (
                          <div className="mb-3">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                              Key differences
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {m.keyDifferences.map((diff: string) => (
                                <div
                                  key={diff}
                                  className="flex items-center gap-1 text-[11px] bg-destructive/5 border border-destructive/15 text-destructive/80 px-2 py-0.5 rounded-md"
                                >
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  {diff}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Adoption lesson */}
                        {m.adoptionLesson && (
                          <div className="bg-muted/20 border border-border rounded-lg p-3">
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                              <BookOpen className="w-3 h-3" />
                              Adoption lesson
                            </div>
                            <p className="text-xs text-foreground/75 leading-relaxed">
                              {m.adoptionLesson}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Right: score panel */}
                      <div className="lg:w-52 shrink-0 flex flex-col gap-3">
                        <div className="bg-background rounded-xl border border-border p-4">
                          <SimilarityMeter score={score} />
                        </div>

                        {(match.analogCase.finalObservedOutcome ||
                          match.analogCase.finalProbability !== null) && (
                          <div className="bg-background rounded-xl border border-border p-4">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                              Historical outcome
                            </div>
                            {match.analogCase.finalProbability !== null &&
                              match.analogCase.finalProbability !== undefined && (
                                <div className="text-xl font-display font-bold text-foreground mb-1">
                                  {(Number(match.analogCase.finalProbability) * 100).toFixed(0)}%
                                </div>
                              )}
                            {match.analogCase.finalObservedOutcome && (
                              <div
                                className="text-xs text-muted-foreground leading-snug"
                                title={match.analogCase.finalObservedOutcome}
                              >
                                {match.analogCase.finalObservedOutcome}
                              </div>
                            )}
                          </div>
                        )}

                        {match.analogCase.actorMix && (
                          <div className="bg-background rounded-xl border border-border p-3">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                              Actor mix
                            </div>
                            <p className="text-xs text-foreground/70 leading-snug">
                              {match.analogCase.actorMix}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {analogs?.length === 0 && (
              <Card className="text-center py-12">
                <Library className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground">No close analogs found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  The current case profile does not strongly match historical records in the
                  library.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Pattern Intelligence */}
        {patterns.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Repeat2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pattern Intelligence</span>
              <span className="text-xs text-muted-foreground">Recurring adoption patterns from the Case Library</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {patterns.map((p) => (
                <Card key={p.id}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Repeat2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold leading-snug">{p.label}</p>
                        {p.caseCount > 0 && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                            {p.caseCount} {p.caseCount === 1 ? "case" : "cases"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-2">{p.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {p.signalTypes.map((st) => (
                          <span key={st} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-medium">
                            {st}
                          </span>
                        ))}
                      </div>
                      {p.exampleCases.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          {p.exampleCases.map((ec) => (
                            <div key={ec.caseId} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <span className="font-mono">{ec.caseId}</span>
                              {ec.therapyArea && <span>· {ec.therapyArea}</span>}
                              {ec.finalProbability !== null && ec.finalProbability !== undefined && (
                                <span className="font-semibold text-primary">{(Number(ec.finalProbability) * 100).toFixed(0)}% final</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
