import { useState } from "react";
import { Search, Check, X, Loader2, ChevronDown, ChevronUp, ExternalLink, FileText, AlertTriangle, ShieldAlert, Quote, ShieldCheck, Database } from "lucide-react";

interface EvidenceCandidate {
  tempId: string;
  category: string;
  trialName: string | null;
  pmid: string | null;
  sourceUrl: string | null;
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
  verificationTier?: 0 | 1 | 2 | 3;
  nctNumber?: string | null;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  Strong: "bg-green-500/20 text-green-400 border-green-500/30",
  Moderate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Weak: "bg-red-500/20 text-red-400 border-red-500/30",
};

const TIER_BADGES: Record<number, { label: string; style: string; icon: "registry" | "known" | "found" | "blocked" }> = {
  0: { label: "Registry Verified", style: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: "registry" },
  1: { label: "Known Trial", style: "bg-green-500/20 text-green-400 border-green-500/30", icon: "known" },
  2: { label: "Found in Source", style: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: "found" },
  3: { label: "Unverified", style: "bg-red-500/20 text-red-400 border-red-500/30", icon: "blocked" },
};

interface PivotalSearchResult {
  caseId: string;
  drugName: string;
  indication: string;
  searchCategories: string[];
  candidates: EvidenceCandidate[];
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

  const runSearch = async () => {
    setSearching(true);
    setError(null);
    setResult(null);
    setApproved(new Set());
    setRejected(new Set());
    setSubmitted(false);

    const API = import.meta.env.VITE_API_URL || "";
    try {
      const resp = await fetch(`${API}/api/cases/${caseId}/pivotal-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
              Find Pivotal Evidence
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Structured search across pivotal trials, FDA labels, guidelines, safety data, and payer coverage for <span className="text-foreground font-medium">{drugName}</span>{indication ? ` in ${indication}` : ""}.
            </p>
          </div>
          <button
            onClick={runSearch}
            disabled={searching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searching ? "Searching..." : "Search Evidence"}
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
              Structured Evidence Search — {result.drugName}
              {result.indication ? ` / ${result.indication}` : ""}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {result.candidates.length} candidate{result.candidates.length !== 1 ? "s" : ""} found across {categories.length} categories.
              {" "}<span className="text-blue-400">{approved.size} approved</span>
              {rejected.size > 0 && <>, <span className="text-red-400">{rejected.size} rejected</span></>}
              {undecided.length > 0 && <>, <span className="text-muted-foreground">{undecided.length} pending</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runSearch}
              disabled={searching}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/50 text-xs hover:bg-accent/50 transition-colors"
            >
              {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Re-search
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
                    const tierBadge = TIER_BADGES[tier] || TIER_BADGES[3];
                    const canApprove = tier <= 1 || hasQuote;
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
                            ) : tier <= 1 ? (
                              <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-xs text-emerald-400 font-medium">
                                  {tier === 0 ? "Registry/journal verified source — safe to approve" : "Known trial match — safe to approve"}
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
                                {c.pmid ? `PubMed ${c.pmid}` : "Source"}
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
