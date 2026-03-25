import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, Input, Select, Label } from "@/components/ui-components";
import {
  Search, ChevronRight, Eye, CheckCircle2, ShieldCheck, Zap,
  XCircle, Archive, RotateCcw, X, Clock, AlertTriangle, FileText,
  ExternalLink, History, Edit3, Save, Radio,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { SIGNAL_TYPE_ORDER, SIGNAL_TYPE_META } from "@/lib/signal-taxonomy";
import type { SignalStatus } from "@/types";

const API = import.meta.env.VITE_API_URL || "";

const STATUSES: SignalStatus[] = ["candidate", "reviewed", "validated", "active", "archived", "rejected"];

const STATUS_CONFIG: Record<SignalStatus, { label: string; variant: "default" | "success" | "warning" | "danger" | "primary"; icon: React.FC<any> }> = {
  candidate: { label: "Candidate", variant: "default", icon: Clock },
  reviewed: { label: "Reviewed", variant: "primary", icon: Eye },
  validated: { label: "Validated", variant: "warning", icon: ShieldCheck },
  active: { label: "Active", variant: "success", icon: Zap },
  archived: { label: "Archived", variant: "default", icon: Archive },
  rejected: { label: "Rejected", variant: "danger", icon: XCircle },
};

const ACTIONS: Record<string, { label: string; icon: React.FC<any>; variant: "primary" | "secondary" | "outline" | "ghost" | "danger" }> = {
  review: { label: "Mark Reviewed", icon: Eye, variant: "primary" },
  validate: { label: "Validate", icon: ShieldCheck, variant: "primary" },
  activate: { label: "Activate", icon: Zap, variant: "primary" },
  reject: { label: "Reject", icon: XCircle, variant: "danger" },
  archive: { label: "Archive", icon: Archive, variant: "secondary" },
  revert: { label: "Revert to Candidate", icon: RotateCcw, variant: "outline" },
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  candidate: ["review", "reject"],
  reviewed: ["validate", "reject", "revert"],
  validated: ["activate", "reject", "revert"],
  active: ["archive", "reject"],
  archived: ["revert"],
  rejected: ["revert"],
};

interface Signal {
  id: string;
  signalId: string;
  caseId: string;
  signalDescription: string;
  signalType: string;
  direction: string;
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  scope: string;
  timing: string;
  status: SignalStatus;
  createdByType: string | null;
  createdById: string | null;
  strength: string | null;
  reliability: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  evidenceSnippet: string | null;
  observedAt: string | null;
  notes: string | null;
  signalScope: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface AuditLog {
  id: string;
  objectType: string;
  objectId: string;
  action: string;
  performedByType: string | null;
  performedById: string | null;
  beforeStateJson: any;
  afterStateJson: any;
  timestamp: string;
}

function useSignals(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  params.set("limit", "200");
  return useQuery<Signal[]>({
    queryKey: ["review-signals", filters],
    queryFn: () => fetch(`${API}/api/signals?${params}`).then(r => r.json()),
  });
}

function useCases() {
  return useQuery<{ caseId: string; assetName: string }[]>({
    queryKey: ["cases-list"],
    queryFn: () => fetch(`${API}/api/cases`).then(r => r.json()),
  });
}

function useAuditLogs(signalId: string | null) {
  return useQuery<AuditLog[]>({
    queryKey: ["audit-logs", signalId],
    queryFn: () => fetch(`${API}/api/audit-logs?objectType=signal&objectId=${signalId}`).then(r => r.json()),
    enabled: !!signalId,
  });
}

export default function SignalReviewQueue() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({ status: "" });
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Signal>>({});

  const { data: rawSignals = [], isLoading } = useSignals(filters);

  const signals = rawSignals.filter(s => {
    if (!filters.search) return true;
    const q = filters.search.toLowerCase();
    return s.signalDescription?.toLowerCase().includes(q) ||
      s.signalId?.toLowerCase().includes(q) ||
      s.signalType?.toLowerCase().includes(q);
  });
  const { data: cases = [] } = useCases();
  const { data: auditLogs = [] } = useAuditLogs(selectedSignal?.signalId ?? null);

  const transitionMut = useMutation({
    mutationFn: ({ signalId, action }: { signalId: string; action: string }) =>
      fetch(`${API}/api/signals/${signalId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw data;
        return data;
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["review-signals"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      setSelectedSignal(data);
    },
  });

  const editMut = useMutation({
    mutationFn: ({ signalId, updates }: { signalId: string; updates: Partial<Signal> }) =>
      fetch(`${API}/api/signals/${signalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw data;
        return data;
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["review-signals"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      setSelectedSignal(data);
      setEditing(false);
    },
  });

  const updateFilter = useCallback((key: string, val: string) => {
    setFilters(f => ({ ...f, [key]: val }));
  }, []);

  const availableActions = selectedSignal ? (VALID_TRANSITIONS[selectedSignal.status] || []) : [];

  const validationIssues = selectedSignal ? getValidationIssues(selectedSignal) : [];

  const statusCounts = signals.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                Signal Review Queue
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Review, validate, and manage signal lifecycle across all forecasting questions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => updateFilter("status", filters.status === s ? "" : s)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-lg border transition-all",
                    filters.status === s
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground border-border hover:bg-muted/50"
                  )}
                >
                  {STATUS_CONFIG[s].label}
                  {statusCounts[s] ? ` (${statusCounts[s]})` : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search signals..."
                className="pl-9 py-2"
                value={filters.search || ""}
                onChange={e => updateFilter("search", e.target.value)}
              />
            </div>
            <Select value={filters.signalType || ""} onChange={e => updateFilter("signalType", e.target.value)} className="w-48">
              <option value="">All Signal Types</option>
              {SIGNAL_TYPE_ORDER.map(t => (
                <option key={t} value={SIGNAL_TYPE_META[t].label}>{SIGNAL_TYPE_META[t].label}</option>
              ))}
              <option disabled>──────────</option>
              <option value="Field intelligence">Field intelligence</option>
              <option value="Competitor counteraction">Competitor counteraction</option>
              <option value="Access friction">Access friction</option>
              <option value="Experience infrastructure">Experience infrastructure</option>
            </Select>
            <Select value={filters.caseId || ""} onChange={e => updateFilter("caseId", e.target.value)} className="w-52">
              <option value="">All Questions</option>
              {cases.map(c => (
                <option key={c.caseId} value={c.caseId}>{c.assetName} ({c.caseId.slice(0, 12)})</option>
              ))}
            </Select>
            <Select value={filters.createdByType || ""} onChange={e => updateFilter("createdByType", e.target.value)} className="w-36">
              <option value="">All Sources</option>
              <option value="human">Human</option>
              <option value="system">System</option>
            </Select>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className={cn("flex-1 overflow-y-auto", selectedSignal && "border-r border-border")}>
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading signals...</div>
            ) : signals.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Radio className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p>No signals match the current filters.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10">
                  <tr className="text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Signal</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Direction</th>
                    <th className="text-left px-4 py-3 font-medium">Source</th>
                    <th className="text-left px-4 py-3 font-medium">Question</th>
                    <th className="text-left px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map(sig => {
                    const sc = STATUS_CONFIG[sig.status] || STATUS_CONFIG.candidate;
                    const isSelected = selectedSignal?.signalId === sig.signalId;
                    const issues = getValidationIssues(sig);
                    return (
                      <tr
                        key={sig.signalId}
                        onClick={() => { setSelectedSignal(sig); setEditing(false); }}
                        className={cn(
                          "border-b border-border/50 cursor-pointer transition-colors",
                          isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground truncate max-w-[280px]">{sig.signalDescription}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{sig.signalId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{sig.signalType}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "text-xs font-medium",
                            sig.direction === "Positive" ? "text-success" : sig.direction === "Negative" ? "text-destructive" : "text-muted-foreground"
                          )}>
                            {sig.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            sig.createdByType === "system" ? "bg-violet-500/10 text-violet-400" : "bg-blue-500/10 text-blue-400"
                          )}>
                            {sig.createdByType || "human"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground truncate max-w-[120px] block">
                            {cases.find(c => c.caseId === sig.caseId)?.assetName || sig.caseId.slice(0, 12)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">
                            {sig.createdAt ? new Date(sig.createdAt).toLocaleDateString() : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {issues.length > 0 && (
                              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                            )}
                            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {selectedSignal && (
            <SignalDetailPanel
              signal={selectedSignal}
              auditLogs={auditLogs}
              validationIssues={validationIssues}
              availableActions={availableActions}
              editing={editing}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={() => { setEditing(true); setEditForm(selectedSignal); }}
              onCancelEdit={() => setEditing(false)}
              onSaveEdit={() => {
                if (!selectedSignal) return;
                const { sourceLabel, sourceUrl, evidenceSnippet, observedAt, notes, signalDescription } = editForm;
                editMut.mutate({ signalId: selectedSignal.signalId, updates: { sourceLabel, sourceUrl, evidenceSnippet, observedAt, notes, signalDescription } as any });
              }}
              onTransition={(action: string) => transitionMut.mutate({ signalId: selectedSignal.signalId, action })}
              transitionError={transitionMut.error as any}
              transitionLoading={transitionMut.isPending}
              editLoading={editMut.isPending}
              onClose={() => { setSelectedSignal(null); setEditing(false); }}
              cases={cases}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function getValidationIssues(sig: Signal): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  if (!sig.sourceLabel) issues.push({ field: "sourceLabel", message: "Source label is required for validation." });
  if (!sig.observedAt) issues.push({ field: "observedAt", message: "Observation date is required for validation." });
  if (!sig.signalDescription || sig.signalDescription.length < 5) issues.push({ field: "signalDescription", message: "Description too short." });
  return issues;
}

function SignalDetailPanel({
  signal, auditLogs, validationIssues, availableActions, editing, editForm, setEditForm,
  onStartEdit, onCancelEdit, onSaveEdit, onTransition, transitionError, transitionLoading,
  editLoading, onClose, cases,
}: {
  signal: Signal;
  auditLogs: AuditLog[];
  validationIssues: { field: string; message: string }[];
  availableActions: string[];
  editing: boolean;
  editForm: Partial<Signal>;
  setEditForm: (f: Partial<Signal>) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onTransition: (action: string) => void;
  transitionError: any;
  transitionLoading: boolean;
  editLoading: boolean;
  onClose: () => void;
  cases: { caseId: string; assetName: string }[];
}) {
  const sc = STATUS_CONFIG[signal.status] || STATUS_CONFIG.candidate;
  const StatusIcon = sc.icon;

  return (
    <div className="w-[440px] flex-shrink-0 overflow-y-auto bg-card/50">
      <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Signal Detail</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-muted/50 rounded">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={sc.variant}>{sc.label}</Badge>
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              signal.createdByType === "system" ? "bg-violet-500/10 text-violet-400" : "bg-blue-500/10 text-blue-400"
            )}>
              {signal.createdByType || "human"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{signal.signalId}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Question: {cases.find(c => c.caseId === signal.caseId)?.assetName || signal.caseId}
          </p>
        </div>

        {validationIssues.length > 0 && (
          <div className="bg-warning/5 border border-warning/20 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              <span className="text-xs font-semibold text-warning">Validation Issues</span>
            </div>
            {validationIssues.map(i => (
              <p key={i.field} className="text-xs text-warning/80 ml-5">
                {i.field}: {i.message}
              </p>
            ))}
          </div>
        )}

        {transitionError && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
            <p className="text-xs text-destructive font-medium">
              {transitionError.error || "Transition failed"}
            </p>
            {transitionError.missingFields?.map((f: any) => (
              <p key={f.field} className="text-xs text-destructive/80 ml-3 mt-0.5">{f.field}: {f.message}</p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {availableActions.map(action => {
            const cfg = ACTIONS[action];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <Button
                key={action}
                variant={cfg.variant}
                size="sm"
                onClick={() => onTransition(action)}
                disabled={transitionLoading}
              >
                <Icon className="w-3.5 h-3.5 mr-1.5" />
                {cfg.label}
              </Button>
            );
          })}
          {!editing && (
            <Button variant="ghost" size="sm" onClick={onStartEdit}>
              <Edit3 className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <Label>Description</Label>
              <textarea
                className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px] resize-none"
                value={editForm.signalDescription || ""}
                onChange={e => setEditForm({ ...editForm, signalDescription: e.target.value })}
              />
            </div>
            <div>
              <Label>Source Label</Label>
              <Input
                value={editForm.sourceLabel || ""}
                onChange={e => setEditForm({ ...editForm, sourceLabel: e.target.value })}
                placeholder="e.g., NEJM 2025, ClinicalTrials.gov"
              />
            </div>
            <div>
              <Label>Source URL</Label>
              <Input
                value={editForm.sourceUrl || ""}
                onChange={e => setEditForm({ ...editForm, sourceUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label>Evidence Snippet</Label>
              <textarea
                className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px] resize-none"
                value={editForm.evidenceSnippet || ""}
                onChange={e => setEditForm({ ...editForm, evidenceSnippet: e.target.value })}
                placeholder="Key excerpt supporting this signal..."
              />
            </div>
            <div>
              <Label>Observed At</Label>
              <Input
                type="date"
                value={editForm.observedAt ? editForm.observedAt.slice(0, 10) : ""}
                onChange={e => setEditForm({ ...editForm, observedAt: e.target.value })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <textarea
                className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px] resize-none"
                value={editForm.notes || ""}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Internal reviewer notes..."
              />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={onSaveEdit} disabled={editLoading}>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Save Changes
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancelEdit}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <DetailRow label="Description" value={signal.signalDescription} />
            <DetailRow label="Type" value={signal.signalType} />
            <DetailRow label="Direction" value={signal.direction} />
            <DetailRow label="Scope" value={signal.signalScope || signal.scope} />
            <DetailRow label="Timing" value={signal.timing} />
            <DetailRow label="Strength" value={`${signal.strengthScore}/5${signal.strength ? ` (${signal.strength})` : ""}`} />
            <DetailRow label="Reliability" value={`${signal.reliabilityScore}/5${signal.reliability ? ` (${signal.reliability})` : ""}`} />
            <DetailRow label="LR" value={signal.likelihoodRatio?.toFixed(2)} />
            <DetailRow label="Source" value={signal.sourceLabel} missing={!signal.sourceLabel} />
            {signal.sourceUrl && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-24 shrink-0">Source URL</span>
                <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 truncate">
                  {signal.sourceUrl.slice(0, 50)}{signal.sourceUrl.length > 50 ? "..." : ""}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}
            <DetailRow label="Evidence" value={signal.evidenceSnippet} />
            <DetailRow label="Observed" value={signal.observedAt ? new Date(signal.observedAt).toLocaleDateString() : null} missing={!signal.observedAt} />
            <DetailRow label="Notes" value={signal.notes} />
            <DetailRow label="Created" value={signal.createdAt ? new Date(signal.createdAt).toLocaleString() : "—"} />
            {signal.updatedAt && <DetailRow label="Updated" value={new Date(signal.updatedAt).toLocaleString()} />}
          </div>
        )}

        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-1.5 mb-3">
            <History className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Audit History</span>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">No audit history yet.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map(log => (
                <div key={log.id} className="bg-muted/30 rounded-lg p-2.5 border border-border/30">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-foreground capitalize">{log.action}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  {log.beforeStateJson?.status && log.afterStateJson?.status && (
                    <p className="text-[11px] text-muted-foreground">
                      {log.beforeStateJson.status} → {log.afterStateJson.status}
                    </p>
                  )}
                  {log.performedByType && (
                    <p className="text-[10px] text-muted-foreground/60">by {log.performedByType}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, missing }: { label: string; value: string | null | undefined; missing?: boolean }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-xs text-muted-foreground w-24 shrink-0 pt-0.5">{label}</span>
      {value ? (
        <span className="text-xs text-foreground">{value}</span>
      ) : (
        <span className={cn("text-xs italic", missing ? "text-warning/60" : "text-muted-foreground/40")}>
          {missing ? "Missing" : "—"}
        </span>
      )}
    </div>
  );
}
