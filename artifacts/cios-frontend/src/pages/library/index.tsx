import { Link } from "wouter";
import { useListCases } from "@workspace/api-client-react";
import TopNav from "@/components/top-nav";
import { BookOpen, Sparkles, FileText, Target, Loader2 } from "lucide-react";
const SAMPLE_QUESTIONS = [
  { type: "Binary", q: "Will the FDA approve a supplemental indication for Keytruda in adjuvant melanoma within 12 months?" },
  { type: "Comparative", q: "Will Humira biosimilar uptake exceed 40% formulary share among commercial payers by Q4 2026?" },
  { type: "Threshold", q: "Will Kisqali achieve first-line CDK4/6 inhibitor preference among community oncologists within 18 months?" },
  { type: "Timing", q: "Will Leqembi reach 5,000 active patients in the US despite REMS and infusion-site access barriers within 24 months?" },
];

const TEMPLATES = [
  { name: "Adoption Forecast", description: "Predict whether a therapy will gain adoption in a target segment." },
  { name: "Competitive Displacement", description: "Assess probability of a new entrant displacing incumbent therapy." },
  { name: "Payer Access Risk", description: "Forecast likelihood of payer restrictions or formulary changes." },
  { name: "Geographic Expansion", description: "Rank geographic areas by adoption readiness." },
];

export default function LibraryPage() {
  const { data: cases, isLoading } = useListCases();
  const allCases = (cases as any[]) || [];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sample forecasts, question templates, and saved cases.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            Question Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SAMPLE_QUESTIONS.map((item) => (
              <Link
                key={item.q}
                href="/question"
                className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4 hover:bg-blue-500/10 hover:border-blue-500/30 transition"
              >
                <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-400 mb-1 block">
                  {item.type}
                </span>
                <span className="text-sm text-foreground/80">{item.q}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-violet-400" />
            Forecast Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TEMPLATES.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-border bg-card px-5 py-4 space-y-1"
              >
                <div className="text-sm font-semibold text-foreground">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            Saved Cases
          </h2>
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          {!isLoading && allCases.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No saved cases yet. Start a forecast to build your library.
            </div>
          )}
          {!isLoading && allCases.length > 0 && (
            <div className="space-y-2">
              {allCases.map((c: any) => {
                const cid = c.caseId || c.id;
                const prob = c.currentProbability;
                return (
                  <Link
                    key={cid}
                    href={`/case/${cid}/question`}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 hover:border-border/80 hover:bg-muted/10 transition"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {c.strategicQuestion || c.assetName || "Untitled"}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">{cid}</div>
                    </div>
                    {prob != null && (
                      <span className="text-lg font-bold text-primary">
                        {Math.round(prob * 100)}%
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
