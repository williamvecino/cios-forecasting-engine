import { useState } from "react";
import { Search, Check, X, Loader2, ChevronDown, ChevronUp, ExternalLink, FileText, AlertTriangle, ShieldAlert, Quote, ShieldCheck, Database, Globe, Clock } from "lucide-react";

interface EvidenceCandidate {
  tempId: string;
  category: string;
  trialName: string | null;
  pmid: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  finding: string;
  signalType: string;
  direction: "Positive" | "Negative";
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  precedentMatched: boolean;
  sourceQuote?: string | null;
  sourceConfidence?: "Strong" | "Moderate" | "Weak";
  unverifiedTrialName?: boolean;
  knownTrialHint?: string | null;
  registryVerified?: boolean;
  verificationTier?: 0 | 1 | "1S" | 2 | 3;
  nctNumber?: string | null;
  sponsorSource?: boolean;
  sponsorCompany?: string | null;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  Strong: "bg-green-500/20 text-green-400 border-green-500/30",
  Moderate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Weak: "bg-red-500/20 text-red-400 border-red-500/30",
};

const TIER_BADGES: Record<string, { label: string; style: string; icon: "registry" | "known" | "sponsor" | "found" | "blocked" }> = {
  "0": { label: "Registry Verified", style: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: "registry" },
  "1": { label: "Known Trial", style: "bg-green-500/20 text-green-400 border-green-500/30", icon: "known" },
  "1S": { label: "Sponsor Source", style: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: "sponsor" },
  "2": { label: "Found in Source", style: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: "found" },
  "3": { label: "Unverified", style: "bg-red-500/20 text-red-400 border-red-500/30", icon: "blocked" },
};

interface SponsorProfile {
  company: string;
  irUrl: string;
  ticker: string;
}

interface PipelinePhase {
  phase: string;
  detail: string;
  timestamp: string;
}

interface DocumentFetched {
  url: string;
  title: string;
  textLength: number;
  contentType: string;
  error?: string;
}

interface CategorySourceEntry {
  rank: number;
  sourceId: string;
  label: string;
  queryTemplate: string;
  fetchStrategy: string;
  isProxy: boolean;
  proxyNote: string | null;
  noDataFlag: string | null;
}

interface CategorySourceMap {
  category: string;
  categoryLabel: string;
  sources: CategorySourceEntry[];
  analystNote: string | null;
}

interface StageClassification {
  stage: string;
  label: string;
  rationale: string;
  sourcePriority: { rank: number; sourceType: string; description: string }[];
  categoryMap?: CategorySourceMap[];
}

interface PivotalSearchResult {
  caseId?: string;
  drugName: string;
  indication: string;
  sponsorProfile?: SponsorProfile | null;
  stageClassification?: StageClassification;
  searchCategories?: string[];
  categoriesSearched?: string[];
  candidates: EvidenceCandidate[];
  sourcesFound?: { url: string; category: string; query: string }[];
  documentsFetched?: DocumentFetched[];
  phases?: PipelinePhase[];
  totalTimeMs?: number;
}

interface Props {
  caseId: string;
  drugName: string;
  indication: string;
  onSignalsApproved: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Clinical Evidence": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Regulatory / Label": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Guidelines": "bg-green-500/20 text-green-400 border-green-500/30",
  "Safety": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "Payer / Access": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "Competitive / Market": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "ClinicalTrials.gov Registry": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Pivotal Trials": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Label / Approval Data": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Label / Regulatory": "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export default function PivotalEvidenceSearch({ caseId, drugName, indication, onSignalsApproved }: Props) {
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<PivotalSearchResult | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showPipelineDetails, setShowPipelineDetails] = useState(false);

  const runSearch = async () => {
    setSearching(true);
    setError(null);
    setResult(null);
    setApproved(new Set());
    setRejected(new Set());
    setSubmitted(false);
    setShowPipelineDetails(false);

    const API = import.meta.env.VITE_API_URL || "";
    try {
      const resp = await fetch(`${API}/api/cases/${caseId}/evidence-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeFilterMonths: 12 }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Search failed" }));
        setError(data.error || "Search failed");
        return;
      }
      const data: PivotalSearchResult = await resp.json();
      setResult(data);
      const cats = new Set(data.candidates.map((c) => c.category));
      setExpandedCategories(cats);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setSearching(false);
    }
  };

  const toggleApprove = (tempId: string) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) {
        next.delete(tempId);
      } else {
        next.add(tempId);
        setRejected((r) => { const nr = new Set(r); nr.delete(tempId); return nr; });
      }
      return next;
    });
  };

  const toggleReject = (tempId: string) => {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) {
        next.delete(tempId);
      } else {
        next.add(tempId);
        setApproved((a) => { const na = new Set(a); na.delete(tempId); return na; });
      }
      return next;
    });
  };

  const submitApproved = async () => {
    if (!result || approved.size === 0) return;
    setSubmitting(true);
    const API = import.meta.env.VITE_API_URL || "";
    try {
      const resp = await fetch(`${API}/api/cases/${caseId}/pivotal-search/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempIds: Array.from(approved) }),
      });
      if (resp.ok) {
        setSubmitted(true);
        onSignalsApproved();
      } else {
        const data = await resp.json().catch(() => ({}));
        setError(data.error || "Failed to approve signals");
      }
    } catch {
      setError("Network error during approval.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
        <div className="flex items-center gap-2 text-green-400 font-medium">
          <Check className="w-5 h-5" />
          {approved.size} evidence signal{approved.size !== 1 ? "s" : ""} approved and added to the register
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          These signals are now active with full posterior contribution. Review them in the signal list below.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Search className="w-4 h-4 text-blue-400" />
              Find Evidence
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Automatically discovers, fetches, and extracts evidence from authoritative sources for <span className="text-foreground font-medium">{drugName}</span>{indication ? ` in ${indication}` : ""}.
            </p>
            {searching && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Searching sponsor IR, FDA, ClinicalTrials.gov, PubMed, society guidelines, SEC EDGAR...</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="w-3 h-3" />
                  <span>Fetching full document text from discovered sources...</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="w-3 h-3" />
                  <span>Extracting signal candidates with exact source quotes...</span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={runSearch}
            disabled={searching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searching ? "Running pipeline..." : "Find Evidence"}
          </button>
        </div>
        {error && (
          <p className="text-xs text-destructive mt-2">{error}</p>
        )}
      </div>
    );
  }

  const categories = [...new Set(result.candidates.map((c) => c.category))];
  const undecided = result.candidates.filter((c) => !approved.has(c.tempId) && !rejected.has(c.tempId));

  return (
    <div className="rounded-xl border border-blue-500/20 bg-card/50">
      <div className="p-4 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="w-4 h-4 text-blue-400" />
              Evidence Pipeline — {result.drugName}
              {result.indication ? ` / ${result.indication}` : ""}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {result.candidates.length} candidate{result.candidates.length !== 1 ? "s" : ""} found across {categories.length} categories.
              {" "}<span className="text-blue-400">{approved.size} approved</span>
              {rejected.size > 0 && <>, <span className="text-red-400">{rejected.size} rejected</span></>}
              {undecided.length > 0 && <>, <span className="text-muted-foreground">{undecided.length} pending</span></>}
            </p>
            {result.stageClassification && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  result.stageClassification.stage === "INVESTIGATIONAL" ? "bg-violet-500/15 text-violet-400 border-violet-500/30" :
                  result.stageClassification.stage === "RECENTLY_APPROVED" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                  result.stageClassification.stage === "ESTABLISHED" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                  "bg-gray-500/15 text-gray-400 border-gray-500/30"
                }`}>
                  {result.stageClassification.stage.replace("_", " ")}
                </span>
                <span className="text-[10px] text-muted-foreground/60">{result.stageClassification.rationale}</span>
              </div>
            )}
            <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
              {result.sponsorProfile && (
                <span className="text-blue-400">
                  Sponsor: <span className="font-medium">{result.sponsorProfile.company}</span>
                  {result.sponsorProfile.ticker && ` (${result.sponsorProfile.ticker})`}
                </span>
              )}
              {result.sourcesFound && (
                <span><Globe className="w-3 h-3 inline mr-1" />{result.sourcesFound.length} sources discovered</span>
              )}
              {result.documentsFetched && (
                <span><FileText className="w-3 h-3 inline mr-1" />{result.documentsFetched.filter(d => !d.error && d.textLength > 100).length} documents fetched</span>
              )}
              {result.totalTimeMs && (
                <span><Clock className="w-3 h-3 inline mr-1" />{(result.totalTimeMs / 1000).toFixed(1)}s</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPipelineDetails(!showPipelineDetails)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/50 text-xs hover:bg-accent/50 transition-colors"
            >
              {showPipelineDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Pipeline
            </button>
            <button
              onClick={runSearch}
              disabled={searching}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/50 text-xs hover:bg-accent/50 transition-colors"
            >
              {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Re-run
            </button>
            <button
              onClick={submitApproved}
              disabled={submitting || approved.size === 0}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Approve {approved.size} Signal{approved.size !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
        {showPipelineDetails && (
          <div className="mt-3 space-y-3">
            {result.stageClassification?.categoryMap && result.stageClassification.categoryMap.length > 0 && (
              <div className="rounded-lg border border-border/30 bg-background/50 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Source Map — {result.stageClassification.stage.replace(/_/g, " ")}
                </div>
                <div className="space-y-3">
                  {result.stageClassification.categoryMap.map((cat) => {
                    const catColor = CATEGORY_COLORS[cat.categoryLabel] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
                    return (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${catColor}`}>
                            {cat.categoryLabel}
                          </span>
                          {cat.analystNote && (
                            <span className="text-[10px] text-amber-400/70 italic">{cat.analystNote}</span>
                          )}
                        </div>
                        {cat.sources.map((src) => (
                          <div key={src.sourceId} className="flex items-start gap-2 text-xs pl-2">
                            <span className="text-blue-400 font-mono w-4 text-right shrink-0">{src.rank}.</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-foreground/80">{src.label}</span>
                                {src.isProxy && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">PROXY</span>
                                )}
                                {src.noDataFlag && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 shrink-0">NO DATA</span>
                                )}
                              </div>
                              {src.proxyNote && (
                                <div className="text-[10px] text-amber-400/60 mt-0.5">{src.proxyNote}</div>
                              )}
                              {src.noDataFlag && !src.proxyNote && (
                                <div className="text-[10px] text-red-400/60 mt-0.5">{src.noDataFlag}</div>
                              )}
                            </div>
                            <span className="text-muted-foreground/40 text-[10px] shrink-0">{src.fetchStrategy.replace(/_/g, " ")}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {result.stageClassification && !result.stageClassification.categoryMap && result.stageClassification.sourcePriority.length > 0 && (
              <div className="rounded-lg border border-border/30 bg-background/50 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">Source Priority ({result.stageClassification.stage.replace("_", " ")})</div>
                <div className="space-y-1">
                  {result.stageClassification.sourcePriority.map((sp, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-blue-400 font-mono w-4 text-right shrink-0">{sp.rank}.</span>
                      <span className="font-medium text-foreground/80">{sp.sourceType.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground/60">— {sp.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.phases && result.phases.length > 0 && (
              <div className="rounded-lg border border-border/30 bg-background/50 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">Pipeline Log</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.phases.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-blue-400 font-mono shrink-0">{p.phase}</span>
                      <span className="text-muted-foreground">{p.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.documentsFetched && result.documentsFetched.length > 0 && (
              <div className="rounded-lg border border-border/30 bg-background/50 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">Fetched Documents</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.documentsFetched.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {d.error ? (
                        <X className="w-3 h-3 text-red-400 shrink-0" />
                      ) : (
                        <Check className="w-3 h-3 text-green-400 shrink-0" />
                      )}
                      <span className="truncate max-w-md text-muted-foreground" title={d.url}>
                        {d.title || new URL(d.url).hostname}
                      </span>
                      <span className="text-muted-foreground/60 shrink-0">
                        {d.textLength > 0 ? `${(d.textLength / 1000).toFixed(1)}k chars` : d.error || "empty"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="divide-y divide-border/20">
        {categories.map((cat) => {
          const catCandidates = result.candidates.filter((c) => c.category === cat);
          const expanded = expandedCategories.has(cat);
          const catApproved = catCandidates.filter((c) => approved.has(c.tempId)).length;
          const colorClass = CATEGORY_COLORS[cat] || "bg-gray-500/20 text-gray-400 border-gray-500/30";

          return (
            <div key={cat}>
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${colorClass}`}>
                    {cat}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {catCandidates.length} result{catCandidates.length !== 1 ? "s" : ""}
                    {catApproved > 0 && <span className="text-green-400 ml-1">({catApproved} approved)</span>}
                  </span>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {expanded && (
                <div className="px-4 pb-3 space-y-2">
                  {catCandidates.map((c) => {
                    const isApproved = approved.has(c.tempId);
                    const isRejected = rejected.has(c.tempId);
                    const pmidUrl = c.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/` : null;
                    const displayUrl = pmidUrl || c.sourceUrl;
                    const hasQuote = !!c.sourceQuote && c.sourceQuote.trim().length > 0;
                    const tier = c.verificationTier ?? (c.unverifiedTrialName ? 3 : 2);
                    const tierKey = String(tier);
                    const tierBadge = TIER_BADGES[tierKey] || TIER_BADGES["3"];
                    const canApprove = tier === 0 || tier === 1 || tier === "1S" || hasQuote;
                    const confidence = c.sourceConfidence || "Weak";
                    const confidenceStyle = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.Weak;

                    return (
                      <div
                        key={c.tempId}
                        className={`rounded-lg border p-3 transition-colors ${
                          isApproved ? "border-green-500/40 bg-green-500/5" :
                          isRejected ? "border-red-500/30 bg-red-500/5 opacity-60" :
                          "border-border/30 bg-background/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {c.trialName ? (
                                <span className="font-medium text-sm text-foreground">{c.trialName}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground/50 italic">Trial not identified in sources</span>
                              )}
                              <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium ${tierBadge.style}`}>
                                {tierBadge.icon === "registry" ? <Database className="w-3 h-3" /> :
                                 tierBadge.icon === "known" ? <ShieldCheck className="w-3 h-3" /> :
                                 tierBadge.icon === "sponsor" ? <FileText className="w-3 h-3" /> :
                                 tierBadge.icon === "blocked" ? <AlertTriangle className="w-3 h-3" /> : null}
                                {tierBadge.label}
                              </span>
                              {c.nctNumber && (
                                <span className="text-xs text-emerald-400 font-mono">{c.nctNumber}</span>
                              )}
                              {c.pmid && (
                                <span className="text-xs text-muted-foreground font-mono">PMID: {c.pmid}</span>
                              )}
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                c.direction === "Positive" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                              }`}>
                                {c.direction}
                              </span>
                              <span className="text-xs text-muted-foreground">{c.signalType}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${confidenceStyle}`}>
                                {confidence}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{c.finding}</p>
                            {hasQuote ? (
                              <div className="mt-2 pl-3 border-l-2 border-blue-500/30">
                                <p className="text-xs text-blue-300/80 italic">
                                  <Quote className="w-3 h-3 inline mr-1 -mt-0.5" />
                                  Source says: "{c.sourceQuote}"
                                </p>
                              </div>
                            ) : tier === 0 || tier === 1 ? (
                              <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-xs text-emerald-400 font-medium">
                                  {tier === 0 ? "Registry/journal verified source — safe to approve" : "Known trial match — safe to approve"}
                                </span>
                              </div>
                            ) : tier === "1S" ? (
                              <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                                <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="text-xs text-blue-400 font-medium">
                                  Sponsor source{c.sponsorCompany ? ` (${c.sponsorCompany})` : ""} — company-reported data. Verify against independent source before approving for posterior.
                                </span>
                              </div>
                            ) : (
                              <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
                                <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span className="text-xs text-red-400 font-medium">No source quote — high fabrication risk. Do not approve.</span>
                              </div>
                            )}
                            {c.knownTrialHint && (
                              <p className="text-xs text-amber-400/80 mt-1 italic">{c.knownTrialHint}</p>
                            )}
                            {displayUrl && (
                              <a
                                href={displayUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {c.pmid ? `PubMed ${c.pmid}` : c.sourceTitle ? c.sourceTitle.slice(0, 80) : "Source"}
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => canApprove && toggleApprove(c.tempId)}
                              disabled={!canApprove}
                              className={`p-1.5 rounded-md transition-colors ${
                                !canApprove
                                  ? "opacity-30 cursor-not-allowed text-muted-foreground"
                                  : isApproved
                                  ? "bg-green-500 text-white"
                                  : "hover:bg-green-500/20 text-muted-foreground hover:text-green-400"
                              }`}
                              title={canApprove ? "Approve — add to signal register" : "Cannot approve — no source quote"}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleReject(c.tempId)}
                              className={`p-1.5 rounded-md transition-colors ${
                                isRejected
                                  ? "bg-red-500 text-white"
                                  : "hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                              }`}
                              title="Reject — exclude from register"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive border-t border-border/20">{error}</div>
      )}
    </div>
  );
}
