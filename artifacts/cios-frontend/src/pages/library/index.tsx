import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListCases } from "@workspace/api-client-react";
import TopNav from "@/components/top-nav";
import { BookOpen, Sparkles, FileText, Target, Loader2, BookMarked, Search, ChevronDown, ChevronUp } from "lucide-react";
const SAMPLE_QUESTIONS = [
  { type: "Binary", q: "Will the FDA approve a supplemental indication for Keytruda in adjuvant melanoma within 12 months?" },
  { type: "Comparative", q: "Will Humira biosimilar uptake exceed 40% formulary share among commercial payers by Q4 2026?" },
  { type: "Threshold", q: "Will Kisqali achieve first-line CDK4/6 inhibitor preference among community oncologists within 18 months?" },
  { type: "Timing", q: "Will Leqembi reach 5,000 active patients in the US despite REMS and infusion-site access barriers within 24 months?" },
];

const TEMPLATES = [
  { name: "Adoption Forecast", slug: "adoption-forecast", description: "Predict whether a therapy will gain adoption in a target segment.", placeholder: "Will [therapy] achieve [X]% adoption among [target specialists] within [timeframe]?", archetype: "Early Adoption Acceleration" },
  { name: "Competitive Displacement", slug: "competitive-displacement", description: "Assess probability of a new entrant displacing incumbent therapy.", placeholder: "Will [new entrant] displace [incumbent therapy] in [segment] within [timeframe]?", archetype: "Launch Timing Decision" },
  { name: "Payer Access Risk", slug: "payer-access-risk", description: "Forecast likelihood of payer restrictions or formulary changes.", placeholder: "Will [payer/PBM] implement [restriction type] for [therapy] within [timeframe]?", archetype: "Market Access Constraint" },
  { name: "Geographic Expansion", slug: "geographic-expansion", description: "Rank geographic areas by adoption readiness.", placeholder: "Will [therapy] achieve formulary access in [geographic region] within [timeframe]?", archetype: "Broad Adoption Expansion" },
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
              <Link
                key={t.name}
                href={`/question?template=${t.slug}`}
                className="rounded-xl border border-border bg-card px-5 py-4 space-y-1 hover:border-violet-500/30 hover:bg-violet-500/5 transition cursor-pointer block"
              >
                <div className="text-sm font-semibold text-foreground">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </Link>
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

        <ReferenceCasesSection />
      </div>
    </div>
  );
}

function ReferenceCasesSection() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const API = (import.meta as any).env?.VITE_API_URL || "";
    fetch(`${API}/api/reference-cases`)
      .then((r) => r.json())
      .then((data) => {
        setCases(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = cases.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.caseName || "").toLowerCase().includes(q) ||
      (c.decisionDomain || "").toLowerCase().includes(q) ||
      (c.caseSummary || "").toLowerCase().includes(q) ||
      (c.structuralTags || []).some((t: string) => t.toLowerCase().includes(q))
    );
  });

  const resolutionColor = (type: string) => {
    if (type === "resolved_true") return "text-emerald-400";
    if (type === "resolved_false") return "text-rose-400";
    return "text-amber-400";
  };

  const resolutionLabel = (type: string) => {
    if (type === "resolved_true") return "Achieved";
    if (type === "resolved_false") return "Not achieved";
    return "Partial";
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-amber-400" />
          Reference Cases
        </h2>
        <span className="text-xs text-muted-foreground">{cases.length} cases</span>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Pharmaceutical precedent library — resolved forecasts that anchor every prior and likelihood ratio in the system.
      </p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name, domain, tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {cases.length === 0
            ? "No reference cases loaded. Run POST /seed to populate."
            : "No cases match your search."}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((c: any) => {
            const isExpanded = expandedId === c.referenceCaseId;
            const tags = (() => { try { return Array.isArray(c.structuralTags) ? c.structuralTags : JSON.parse(c.structuralTags || "[]"); } catch { return []; } })();
            const drivers = (() => { try { return Array.isArray(c.keyDrivers) ? c.keyDrivers : JSON.parse(c.keyDrivers || "[]"); } catch { return []; } })();
            const constraints = (() => { try { return Array.isArray(c.keyConstraints) ? c.keyConstraints : JSON.parse(c.keyConstraints || "[]"); } catch { return []; } })();

            return (
              <div
                key={c.referenceCaseId}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : c.referenceCaseId)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/10 transition text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{c.caseName}</span>
                      <span className={`text-[10px] font-bold uppercase ${resolutionColor(c.resolutionType)}`}>
                        {resolutionLabel(c.resolutionType)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground font-mono">{c.referenceCaseId}</span>
                      <span className="text-[10px] text-muted-foreground">{c.decisionDomain}</span>
                      {c.brierScore != null && (
                        <span className="text-[10px] text-muted-foreground">Brier: {Number(c.brierScore).toFixed(3)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Forecast</div>
                      <div className="text-sm font-bold text-foreground">
                        {c.initialForecast != null ? `${Math.round(c.initialForecast * 100)}%` : "-"}
                        {c.finalForecast != null && c.finalForecast !== c.initialForecast && (
                          <span className="text-muted-foreground font-normal"> → {Math.round(c.finalForecast * 100)}%</span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-5 py-4 space-y-4">
                    {c.caseSummary && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{c.caseSummary}</p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</div>
                        <div className="text-sm font-medium">{c.confidenceLevel || "-"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Evidence Diversity</div>
                        <div className="text-sm font-medium">{c.evidenceDiversityScore != null ? Number(c.evidenceDiversityScore).toFixed(2) : "-"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fragility</div>
                        <div className="text-sm font-medium">{c.posteriorFragilityScore != null ? Number(c.posteriorFragilityScore).toFixed(2) : "-"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Evidence Families</div>
                        <div className="text-sm font-medium">{c.independentEvidenceFamilyCount ?? "-"}</div>
                      </div>
                    </div>

                    {drivers.length > 0 && (
                      <div>
                        <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-1">Key Drivers</div>
                        <div className="space-y-1">
                          {drivers.map((d: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-foreground/80">{d.label || d.name || d}</span>
                              {d.lr && <span className="text-emerald-400 font-mono">LR {Number(d.lr).toFixed(2)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {constraints.length > 0 && (
                      <div>
                        <div className="text-[10px] text-rose-400 uppercase tracking-wider font-semibold mb-1">Key Constraints</div>
                        <div className="space-y-1">
                          {constraints.map((d: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-foreground/80">{d.label || d.name || d}</span>
                              {d.lr && <span className="text-rose-400 font-mono">LR {Number(d.lr).toFixed(2)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {c.calibrationLesson && (
                      <div>
                        <div className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold mb-1">Calibration Lesson</div>
                        <p className="text-xs text-muted-foreground">{c.calibrationLesson}</p>
                      </div>
                    )}

                    {c.biasPattern && (
                      <div>
                        <div className="text-[10px] text-violet-400 uppercase tracking-wider font-semibold mb-1">Bias Pattern</div>
                        <p className="text-xs text-muted-foreground">{c.biasPattern}</p>
                      </div>
                    )}

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t: string, i: number) => (
                          <span
                            key={i}
                            onClick={() => setSearch(t)}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground cursor-pointer hover:bg-muted/80 transition"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
