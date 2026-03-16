import { useState, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, Label } from "@/components/ui-components";
import { cn } from "@/lib/cn";
import {
  Sparkles, CheckCircle2, XCircle, Pencil, ChevronDown, ChevronUp,
  AlertTriangle, BarChart3, Lightbulb, FileText, RotateCcw, Info,
  TrendingUp, TrendingDown, ShieldCheck, Zap,
} from "lucide-react";
import { useGetCase } from "@workspace/api-client-react";
import { SIGNAL_TYPES } from "@/lib/lr-config";

const DOMAIN_LABELS: Record<string, string> = {
  clinical_efficacy: "Clinical Efficacy",
  safety_tolerability: "Safety & Tolerability",
  delivery_convenience: "Delivery & Convenience",
  adherence_impact: "Adherence & Persistence",
  physician_perception: "Physician Perception",
  specialist_concentration: "Specialist Concentration",
  guideline_endorsement: "Guideline & Society Endorsement",
  payer_reimbursement: "Payer & Reimbursement",
  hospital_workflow: "Hospital & Workflow",
  competitor_pressure: "Competitor Pressure",
  kol_endorsement: "KOL Endorsement",
  real_world_evidence: "Real-World Evidence",
  regulatory_status: "Regulatory Status",
  patient_segmentation: "Patient Segmentation",
};

const DOMAIN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  clinical_efficacy: BarChart3,
  safety_tolerability: ShieldCheck,
  delivery_convenience: Zap,
  adherence_impact: CheckCircle2,
  physician_perception: Lightbulb,
  specialist_concentration: BarChart3,
  guideline_endorsement: FileText,
  payer_reimbursement: CheckCircle2,
  hospital_workflow: RotateCcw,
  competitor_pressure: TrendingDown,
  kol_endorsement: Sparkles,
  real_world_evidence: BarChart3,
  regulatory_status: ShieldCheck,
  patient_segmentation: Lightbulb,
};

const DIRECTION_COLORS = {
  Positive: "bg-success/10 text-success border-success/30",
  Negative: "bg-destructive/10 text-destructive border-destructive/30",
};

const STRENGTH_LABELS = ["", "Weak", "Mild", "Moderate", "Strong", "Very Strong"];

function ScoreRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "w-7 h-7 rounded-lg text-xs font-semibold border transition-all",
              value === v
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{STRENGTH_LABELS[value]}</span>
    </div>
  );
}

type Candidate = {
  id: string;
  status: string;
  signalDescription: string;
  signalType: string;
  direction: string;
  strengthScore: number;
  reliabilityScore: number;
  scope: string;
  timing: string;
  likelihoodRatio: number;
  domain: string;
  promotedSignalId: string | null;
};

type CoverageItem = {
  domain: string;
  label: string;
  present: boolean;
  priority: string;
};

function CandidateCard({
  candidate,
  onApprove,
  onReject,
  onUpdate,
}: {
  candidate: Candidate;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Candidate>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Candidate>>({});

  const current = { ...candidate, ...draft };
  const DomainIcon = DOMAIN_ICONS[current.domain] ?? Lightbulb;

  const commitEdit = () => {
    if (Object.keys(draft).length > 0) onUpdate(candidate.id, draft);
    setEditing(false);
    setDraft({});
  };

  if (candidate.status === "approved") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-success/20 bg-success/5">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <p className="text-sm text-muted-foreground flex-1 line-clamp-1">{candidate.signalDescription}</p>
        <Badge variant="success" className="text-[10px] shrink-0">Confirmed → {candidate.promotedSignalId}</Badge>
      </div>
    );
  }

  if (candidate.status === "rejected") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/10 opacity-50">
        <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground flex-1 line-clamp-1 line-through">{candidate.signalDescription}</p>
        <Badge variant="secondary" className="text-[10px] shrink-0">Rejected</Badge>
      </div>
    );
  }

  return (
    <div className={cn(
      "border rounded-2xl transition-all",
      editing ? "border-primary/30 bg-primary/3" : "border-border bg-card hover:border-border/80"
    )}>
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-1.5 rounded-lg bg-muted/30 shrink-0">
            <DomainIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                DIRECTION_COLORS[current.direction as "Positive" | "Negative"] ?? "bg-muted text-muted-foreground border-border"
              )}>
                {current.direction === "Positive" ? "▲" : "▼"} {current.direction}
              </span>
              <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                {DOMAIN_LABELS[current.domain] ?? current.domain}
              </span>
              <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                {current.signalType}
              </span>
            </div>
            {editing ? (
              <textarea
                className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                rows={2}
                value={draft.signalDescription ?? candidate.signalDescription}
                onChange={(e) => setDraft((d) => ({ ...d, signalDescription: e.target.value }))}
              />
            ) : (
              <p className="text-sm leading-relaxed">{current.signalDescription}</p>
            )}
          </div>
        </div>

        {editing && (
          <div className="mt-4 space-y-4 pl-8">
            <div>
              <Label className="text-xs">Classification</Label>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {SIGNAL_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, signalType: t }))}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                      (draft.signalType ?? candidate.signalType) === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Effect direction</Label>
              <div className="flex gap-2 mt-1.5">
                {["Positive", "Negative"].map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, direction: dir }))}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border transition-all",
                      (draft.direction ?? candidate.direction) === dir
                        ? dir === "Positive"
                          ? "bg-success/10 border-success/40 text-success"
                          : "bg-destructive/10 border-destructive/40 text-destructive"
                        : "bg-background border-border text-muted-foreground"
                    )}
                  >
                    {dir === "Positive" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            <ScoreRow
              label="Impact"
              value={Number(draft.strengthScore ?? candidate.strengthScore)}
              onChange={(v) => setDraft((d) => ({ ...d, strengthScore: v }))}
            />
            <ScoreRow
              label="Reliability"
              value={Number(draft.reliabilityScore ?? candidate.reliabilityScore)}
              onChange={(v) => setDraft((d) => ({ ...d, reliabilityScore: v }))}
            />

            <div className="flex gap-3 pt-2">
              <Button size="sm" onClick={commitEdit}>Save changes</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft({}); }}>Cancel</Button>
            </div>
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-2 mt-3 pl-8">
            <span className="text-[10px] text-muted-foreground">
              Impact {current.strengthScore}/5 · Reliability {current.reliabilityScore}/5 · LR {current.likelihoodRatio?.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {!editing && (
        <div className="px-5 pb-4 flex items-center gap-2 pl-14">
          <Button
            size="sm"
            onClick={() => onApprove(candidate.id)}
            className="bg-success/10 text-success border border-success/30 hover:bg-success/20 h-8 px-3 text-xs font-semibold"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-3 h-3 mr-1" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onReject(candidate.id)}
            className="h-8 px-3 text-xs text-destructive/70 hover:text-destructive"
          >
            <XCircle className="w-3 h-3 mr-1" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function CompletenessPanel({ caseId }: { caseId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery<{
    coverage: CoverageItem[];
    totalDomains: number;
    coveredDomains: number;
    missingHighPriority: CoverageItem[];
    isComplete: boolean;
    warning: string | null;
  }>({
    queryKey: [`/api/cases/${caseId}/completeness`],
    queryFn: () => fetch(`/api/cases/${caseId}/completeness`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  if (!data) return null;

  const pct = Math.round((data.coveredDomains / data.totalDomains) * 100);

  return (
    <Card className={cn(
      "border transition-all",
      data.isComplete ? "border-success/30 bg-success/3" : "border-amber-500/30 bg-amber-500/3"
    )}>
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className={cn(
          "p-2 rounded-xl",
          data.isComplete ? "bg-success/10" : "bg-amber-500/10"
        )}>
          {data.isComplete
            ? <CheckCircle2 className="w-4 h-4 text-success" />
            : <AlertTriangle className="w-4 h-4 text-amber-400" />
          }
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Signal Coverage</span>
            <span className={cn(
              "text-xs font-bold",
              data.isComplete ? "text-success" : "text-amber-400"
            )}>
              {data.coveredDomains}/{data.totalDomains} domains · {pct}%
            </span>
          </div>
          {data.warning && (
            <p className="text-xs text-amber-400 mt-0.5">{data.warning}</p>
          )}
          {data.isComplete && (
            <p className="text-xs text-success mt-0.5">All critical signal domains are covered.</p>
          )}
        </div>
        <button className="p-1 text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.coverage.map((item) => {
            const Icon = DOMAIN_ICONS[item.domain] ?? Lightbulb;
            return (
              <div
                key={item.domain}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs",
                  item.present
                    ? "border-success/20 bg-success/5 text-success"
                    : item.priority === "high"
                      ? "border-amber-500/30 bg-amber-500/5 text-amber-400"
                      : "border-border text-muted-foreground"
                )}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="leading-tight">{item.label}</span>
                {item.present
                  ? <CheckCircle2 className="w-3 h-3 ml-auto shrink-0" />
                  : item.priority === "high"
                    ? <AlertTriangle className="w-3 h-3 ml-auto shrink-0" />
                    : null
                }
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function SignalDiscover() {
  const [, params] = useRoute("/cases/:caseId/discover");
  const caseId = params?.caseId ?? "";

  const [inputText, setInputText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: caseData } = useGetCase(caseId);

  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: [`/api/cases/${caseId}/candidates`],
    queryFn: () => fetch(`/api/cases/${caseId}/candidates`).then((r) => r.json()),
  });

  const pending = candidates.filter((c) => c.status === "pending");
  const approved = candidates.filter((c) => c.status === "approved");
  const rejected = candidates.filter((c) => c.status === "rejected");

  const extract = useCallback(async () => {
    if (!inputText.trim() || inputText.trim().length < 20) return;
    setIsExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      setLastCount(data.extracted);
      setInputText("");
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/candidates`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/completeness`] });
    } catch (err: any) {
      setExtractError(err.message ?? "Extraction failed");
    } finally {
      setIsExtracting(false);
    }
  }, [inputText, caseId, queryClient]);

  const { mutate: approveMutation } = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/candidates/${id}/approve`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/candidates`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/signals`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/forecast`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/completeness`] });
    },
  });

  const { mutate: rejectMutation } = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/candidates/${id}/reject`, { method: "PATCH" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/candidates`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/completeness`] });
    },
  });

  const { mutate: updateMutation } = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Candidate> }) =>
      fetch(`/api/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/candidates`] });
    },
  });

  const handleApproveAll = () => {
    pending.forEach((c) => approveMutation(c.id));
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-display font-bold">Signal Discovery</h1>
            </div>
            {caseData && (
              <p className="text-sm text-muted-foreground">
                {caseData.assetName ?? caseData.caseId} · Auto-extract adoption signals from any document
              </p>
            )}
          </div>
          {approved.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-success/10 border border-success/20">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-sm font-semibold text-success">{approved.length} confirmed</span>
            </div>
          )}
        </div>

        {/* Coverage check */}
        <CompletenessPanel caseId={caseId} />

        {/* Input area */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Paste a document for analysis</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Paste any text — press releases, trial summaries, conference abstracts, competitive intelligence notes, payer updates, field reports, or regulatory communications. The AI will extract candidate signals automatically.
          </p>
          <textarea
            className="w-full h-44 text-sm bg-background border border-border rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
            placeholder="Paste text here… e.g. 'Phase III CLARITY trial showed 62% reduction in primary endpoint vs. standard of care (p<0.001). KOL Dr. Chen presented at ASH endorsing first-line use. Payer Blue Shield denied prior auth in 40% of cases due to step therapy requirements. Competitor NOVA launched a once-weekly formulation…'"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          {extractError && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{extractError}</p>
            </div>
          )}
          {lastCount !== null && !extractError && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-success/10 border border-success/20 rounded-lg">
              <Sparkles className="w-3.5 h-3.5 text-success shrink-0" />
              <p className="text-xs text-success">
                {lastCount === 0
                  ? "No signals detected in that text. Try pasting more specific clinical or market intelligence content."
                  : `${lastCount} candidate signal${lastCount !== 1 ? "s" : ""} detected. Review them below.`}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">{inputText.length.toLocaleString()} chars</span>
            <Button
              onClick={extract}
              disabled={isExtracting || inputText.trim().length < 20}
              className="gap-2"
            >
              {isExtracting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  Detecting signals…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Detect Signals
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Detected signals */}
        {pending.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="text-sm font-semibold">
                  Detected Signals
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {pending.length} awaiting review
                  </span>
                </h2>
              </div>
              {pending.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleApproveAll}
                  className="text-xs h-8 gap-1.5 text-success border border-success/30 hover:bg-success/10"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Confirm all ({pending.length})
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {pending.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  onApprove={(id) => approveMutation(id)}
                  onReject={(id) => rejectMutation(id)}
                  onUpdate={(id, patch) => updateMutation({ id, patch })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Confirmed signals */}
        {approved.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <h2 className="text-sm font-semibold">
                Confirmed Signals
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {approved.length} added to forecast
                </span>
              </h2>
            </div>
            <div className="space-y-2">
              {approved.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  onApprove={() => {}}
                  onReject={() => {}}
                  onUpdate={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {/* Rejected signals */}
        {rejected.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground">
                Rejected
                <span className="ml-2 text-xs font-normal">{rejected.length}</span>
              </h2>
            </div>
            <div className="space-y-2">
              {rejected.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  onApprove={() => {}}
                  onReject={() => {}}
                  onUpdate={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {pending.length === 0 && approved.length === 0 && rejected.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-5 rounded-full bg-muted/30 mb-4">
              <Sparkles className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-base font-semibold mb-1">No signals yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Paste a document above and click "Detect Signals" to automatically extract adoption intelligence.
            </p>
            <div className="mt-6 flex flex-col gap-2 text-left max-w-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Works with any of these:</p>
              {[
                "Clinical trial summaries or press releases",
                "Conference abstracts or KOL presentations",
                "Payer coverage or formulary updates",
                "Competitive intelligence notes",
                "Field force reports or MSL summaries",
                "Regulatory communications or label updates",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <Card className="bg-muted/10">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">How signal discovery works</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { step: "1", label: "Paste text", desc: "Any document, report, or note" },
              { step: "2", label: "AI extracts", desc: "Identifies 14 signal domains" },
              { step: "3", label: "You validate", desc: "Approve, edit, or reject each" },
              { step: "4", label: "Forecast updates", desc: "Confirmed signals feed the model" },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {s.step}
                </div>
                <div>
                  <p className="text-xs font-semibold">{s.label}</p>
                  <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
