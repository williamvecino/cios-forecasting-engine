import { useState, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, Input, Label, Select } from "@/components/ui-components";
import { cn } from "@/lib/cn";
import {
  CheckCircle2, XCircle, Pencil, AlertTriangle, Sparkles,
  TrendingUp, TrendingDown, Check, X, ChevronRight,
} from "lucide-react";
import { useGetCase } from "@workspace/api-client-react";
import { SIGNAL_TYPES } from "@/lib/lr-config";
import { lrToStrengthLabel } from "@/lib/lr-config";

const DOCUMENT_TYPES = [
  "Press release / news",
  "Phase II / III trial summary",
  "Conference abstract / presentation",
  "Payer / formulary update",
  "Field intelligence report",
  "Regulatory communication",
  "Competitive intelligence note",
  "Real-world evidence summary",
  "KOL interview / transcript",
  "Other",
] as const;

const DOMAIN_LABELS: Record<string, string> = {
  clinical_efficacy: "Clinical Efficacy",
  safety_tolerability: "Safety & Tolerability",
  delivery_convenience: "Delivery & Convenience",
  adherence_impact: "Adherence & Persistence",
  physician_perception: "Physician Perception",
  specialist_concentration: "Specialist Concentration",
  guideline_endorsement: "Guideline Endorsement",
  payer_reimbursement: "Payer & Reimbursement",
  hospital_workflow: "Hospital & Workflow",
  competitor_pressure: "Competitor Pressure",
  kol_endorsement: "KOL Endorsement",
  real_world_evidence: "Real-World Evidence",
  regulatory_status: "Regulatory Status",
  patient_segmentation: "Patient Segmentation",
};

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

function ScorePills({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange?.(v)}
          disabled={!onChange}
          className={cn(
            "w-5 h-5 rounded text-[9px] font-bold border transition-all",
            v <= value
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-muted/20 border-border text-muted-foreground/40",
            onChange && "cursor-pointer hover:border-primary/60"
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function InlineEditRow({
  candidate,
  onSave,
  onCancel,
}: {
  candidate: Candidate;
  onSave: (patch: Partial<Candidate>) => void;
  onCancel: () => void;
}) {
  const [desc, setDesc] = useState(candidate.signalDescription);
  const [type, setType] = useState(candidate.signalType);
  const [dir, setDir] = useState(candidate.direction);
  const [strength, setStrength] = useState(candidate.strengthScore);
  const [reliability, setReliability] = useState(candidate.reliabilityScore);

  return (
    <tr className="bg-primary/3 border-primary/20">
      <td colSpan={7} className="px-5 py-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-xs">Signal intelligence</Label>
              <textarea
                className="w-full mt-1 text-sm bg-background border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                rows={2}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Classification</Label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-1 text-xs w-full"
              >
                {SIGNAL_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-xs">Direction</Label>
              <div className="flex gap-2 mt-1.5">
                {["Positive", "Negative"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDir(d)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      dir === d
                        ? d === "Positive"
                          ? "bg-success/10 border-success/40 text-success"
                          : "bg-destructive/10 border-destructive/40 text-destructive"
                        : "bg-background border-border text-muted-foreground"
                    )}
                  >
                    {d === "Positive" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Impact</Label>
                <div className="mt-1"><ScorePills value={strength} onChange={setStrength} /></div>
              </div>
              <div>
                <Label className="text-xs">Reliability</Label>
                <div className="mt-1"><ScorePills value={reliability} onChange={setReliability} /></div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1 border-t border-border">
            <Button
              size="sm"
              onClick={() => onSave({ signalDescription: desc, signalType: type, direction: dir, strengthScore: strength, reliabilityScore: reliability })}
              className="h-7 px-3 text-xs gap-1"
            >
              <Check className="w-3 h-3" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 px-3 text-xs gap-1">
              <X className="w-3 h-3" /> Cancel
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function CandidateTableSection({
  title,
  candidates,
  onApprove,
  onReject,
  onUpdate,
  showActions,
  emptyMessage,
}: {
  title: string;
  candidates: Candidate[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<Candidate>) => void;
  showActions: boolean;
  emptyMessage?: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);

  if (candidates.length === 0 && !emptyMessage) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        <span className="text-xs text-muted-foreground">({candidates.length})</span>
      </div>
      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
              <tr>
                <th className="px-5 py-3 font-semibold">Domain</th>
                <th className="px-5 py-3 font-semibold">Intelligence</th>
                <th className="px-5 py-3 font-semibold">Classification</th>
                <th className="px-5 py-3 font-semibold text-center">Direction</th>
                <th className="px-5 py-3 font-semibold text-center">Impact / Reliability</th>
                <th className="px-5 py-3 font-semibold text-right">Suggested weight</th>
                {showActions && <th className="px-4 py-3 w-28" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {candidates.length === 0 && emptyMessage && (
                <tr>
                  <td colSpan={showActions ? 7 : 6} className="px-5 py-8 text-center text-muted-foreground text-xs">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {candidates.map((c) => (
                editingId === c.id ? (
                  <InlineEditRow
                    key={c.id}
                    candidate={c}
                    onSave={(patch) => {
                      onUpdate?.(c.id, patch);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={c.id} className={cn(
                    "group transition-colors",
                    c.status === "pending" && "hover:bg-muted/20",
                    c.status === "rejected" && "opacity-50"
                  )}>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium text-muted-foreground bg-muted/40 px-2 py-1 rounded-full whitespace-nowrap">
                        {DOMAIN_LABELS[c.domain] ?? c.domain}
                      </span>
                    </td>
                    <td className="px-5 py-3 max-w-xs">
                      <p className={cn("text-sm leading-snug line-clamp-2", c.status === "rejected" && "line-through")}>
                        {c.signalDescription}
                      </p>
                      {c.status === "approved" && c.promotedSignalId && (
                        <span className="text-[10px] text-success font-mono mt-0.5 block">→ {c.promotedSignalId}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-muted-foreground">{c.signalType}</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full",
                        c.direction === "Positive"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                      )}>
                        {c.direction === "Positive"
                          ? <TrendingUp className="w-3 h-3" />
                          : <TrendingDown className="w-3 h-3" />}
                        {c.direction}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ScorePills value={c.strengthScore} />
                        <ScorePills value={c.reliabilityScore} />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn(
                        "text-xs font-semibold",
                        lrToStrengthLabel(c.likelihoodRatio, c.direction).color
                      )}>
                        {lrToStrengthLabel(c.likelihoodRatio, c.direction).label.split(" — ")[0]}
                      </span>
                    </td>
                    {showActions && (
                      <td className="px-4 py-3 text-right">
                        {c.status === "pending" && (
                          confirmRejectId === c.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[10px] text-destructive font-medium whitespace-nowrap">Reject?</span>
                              <button
                                onClick={() => { onReject?.(c.id); setConfirmRejectId(null); }}
                                className="text-[10px] font-semibold text-destructive hover:underline"
                              >Yes</button>
                              <button
                                onClick={() => setConfirmRejectId(null)}
                                className="text-[10px] text-muted-foreground hover:text-foreground"
                              >Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => onApprove?.(c.id)}
                                title="Confirm signal"
                                className="opacity-30 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-all"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingId(c.id)}
                                title="Edit before confirming"
                                className="opacity-30 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmRejectId(c.id)}
                                title="Reject signal"
                                className="opacity-30 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        )}
                        {c.status === "approved" && (
                          <Badge variant="success" className="text-[10px]">Confirmed</Badge>
                        )}
                        {c.status === "rejected" && (
                          <Badge variant="secondary" className="text-[10px]">Rejected</Badge>
                        )}
                      </td>
                    )}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function SignalDiscover() {
  const [, params] = useRoute("/cases/:caseId/discover");
  const caseId = params?.caseId ?? "";

  const [docType, setDocType] = useState<string>(DOCUMENT_TYPES[0]);
  const [docSource, setDocSource] = useState("");
  const [docContent, setDocContent] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: caseData } = useGetCase(caseId);

  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: [`/api/cases/${caseId}/candidates`],
    queryFn: () => fetch(`/api/cases/${caseId}/candidates`).then((r) => r.json()),
    refetchInterval: false,
  });

  const { data: completeness } = useQuery<{
    coverage: CoverageItem[];
    totalDomains: number;
    coveredDomains: number;
    missingHighPriority: CoverageItem[];
    isComplete: boolean;
    warning: string | null;
  }>({
    queryKey: [`/api/cases/${caseId}/completeness`],
    queryFn: () => fetch(`/api/cases/${caseId}/completeness`).then((r) => r.json()),
    refetchInterval: false,
  });

  const pending = candidates.filter((c) => c.status === "pending");
  const approved = candidates.filter((c) => c.status === "approved");
  const rejected = candidates.filter((c) => c.status === "rejected");

  const analyze = useCallback(async () => {
    if (docContent.trim().length < 20) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    const contextHint = docSource ? `Source: ${docSource}. Document type: ${docType}.\n\n` : `Document type: ${docType}.\n\n`;
    try {
      const res = await fetch(`/api/cases/${caseId}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: contextHint + docContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setLastCount(data.extracted);
      setDocContent("");
      setDocSource("");
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/candidates`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/completeness`] });
    } catch (err: any) {
      setAnalyzeError(err.message ?? "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, [docContent, docType, docSource, caseId, queryClient]);

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

  const approveAll = () => pending.forEach((c) => approveMutation(c.id));

  const cd = caseData as any;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="primary">{caseId}</Badge>
              <span className="text-sm font-medium text-muted-foreground">
                {cd?.assetName ?? cd?.primaryBrand}
              </span>
            </div>
            <h1 className="text-3xl font-bold">Signal Detection</h1>
            <p className="text-muted-foreground mt-1">
              Analyze documents to extract candidate signals. Review each candidate before it enters the forecast.
            </p>
          </div>
          {/* Coverage strip */}
          {completeness && (
            <div className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border shrink-0",
              completeness.isComplete
                ? "border-success/30 bg-success/5"
                : "border-amber-500/30 bg-amber-500/5"
            )}>
              {completeness.isComplete
                ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              }
              <div>
                <div className="text-xs font-semibold">
                  Signal coverage: {completeness.coveredDomains}/{completeness.totalDomains} domains
                </div>
                {!completeness.isComplete && completeness.missingHighPriority.length > 0 && (
                  <div className="text-[10px] text-amber-400 mt-0.5">
                    Missing: {completeness.missingHighPriority.map((d) => d.label).join(" · ")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Document Intake Form */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold">Document Intake</h3>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Specify the document type and paste its content below</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label>Document type</Label>
              <Select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="mt-1"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Source / author <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                value={docSource}
                onChange={(e) => setDocSource(e.target.value)}
                placeholder="e.g. NEJM, internal MSL report, congress abstract ID"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>Document content</Label>
            <textarea
              className="w-full mt-1 h-36 text-sm bg-background border border-border rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
              placeholder="Paste the document text here. The system will extract adoption-relevant signals automatically."
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
            />
          </div>
          {analyzeError && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{analyzeError}</p>
            </div>
          )}
          {lastCount !== null && !analyzeError && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-muted/30 border border-border rounded-lg">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                {lastCount === 0
                  ? "No adoption-relevant signals detected in this document."
                  : `${lastCount} candidate signal${lastCount !== 1 ? "s" : ""} extracted and queued for review below.`}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">{docContent.length.toLocaleString()} characters</span>
            <Button
              onClick={analyze}
              disabled={isAnalyzing || docContent.trim().length < 20}
              className="gap-2"
            >
              {isAnalyzing ? (
                <><Sparkles className="w-4 h-4 animate-spin" /> Analyzing…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Analyze Document</>
              )}
            </Button>
          </div>
        </Card>

        {/* Review queue — pending candidates */}
        {pending.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Review Queue — {pending.length} awaiting decision
                </span>
              </div>
              {pending.length > 1 && (
                <button
                  onClick={approveAll}
                  className="text-xs font-medium text-success hover:underline"
                >
                  Confirm all ({pending.length})
                </button>
              )}
            </div>
            <CandidateTableSection
              title=""
              candidates={pending}
              onApprove={(id) => approveMutation(id)}
              onReject={(id) => rejectMutation(id)}
              onUpdate={(id, patch) => updateMutation({ id, patch })}
              showActions
            />
          </div>
        )}

        {/* No candidates yet */}
        {pending.length === 0 && approved.length === 0 && rejected.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-border rounded-2xl bg-muted/10">
            <Sparkles className="w-8 h-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No candidates yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
              Select a document type, paste its content above, and click Analyze Document to extract adoption signals.
            </p>
          </div>
        )}

        {/* Confirmed signals */}
        {approved.length > 0 && (
          <CandidateTableSection
            title="Confirmed Signals — added to forecast"
            candidates={approved}
            showActions={false}
          />
        )}

        {/* Rejected */}
        {rejected.length > 0 && (
          <CandidateTableSection
            title="Rejected"
            candidates={rejected}
            showActions={false}
          />
        )}
      </div>
    </AppLayout>
  );
}
