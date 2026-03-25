import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, Input, Select, Label } from "@/components/ui-components";
import {
  Search, Plus, Trash2, Zap, ChevronRight, X, CheckCircle2,
  XCircle, Clock, ExternalLink, Link2, FileText, AlertTriangle,
  Radar, Eye,
} from "lucide-react";
import { cn } from "@/lib/cn";
import WorkflowIndicator from "@/components/workflow-indicator";
import DataFlowBox from "@/components/data-flow-box";
import { moduleMeta } from "@/lib/module-meta";

const API = import.meta.env.VITE_API_URL || "";

const SIGNAL_TYPES = ["Clinical", "Access", "Regulatory", "KOL", "Operational", "Competitor", "Safety", "InstitutionalReadiness", "ReferralBehavior"] as const;

interface Source {
  label: string;
  url: string;
  text: string;
}

interface DetectedSignal {
  id: string;
  runId: string;
  sourceLabel: string;
  sourceUrl: string | null;
  detectedDate: string | null;
  signalType: string;
  suggestedDirection: string;
  suggestedStrength: string;
  suggestedScope: string;
  possibleEventFamily: string | null;
  extractionConfidence: string;
  evidenceSnippet: string;
  therapyArea: string | null;
  geography: string | null;
  specialty: string | null;
  subspecialty: string | null;
  institutionName: string | null;
  physicianName: string | null;
  status: string;
  createdAt: string;
}

interface CaseSuggestion {
  id: string;
  detectedSignalId: string;
  caseId: string;
  matchConfidence: string;
  matchReason: string;
  caseName?: string;
  caseTherapyArea?: string;
}

interface DetectionRun {
  id: number;
  runId: string;
  sourceListJson: any;
  filtersJson: any;
  totalSignalsDetected: number;
  totalCaseSuggestions: number;
  runStatus: string;
  createdAt: string;
}

const DIRECTION_COLORS: Record<string, string> = {
  positive: "text-success",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
};

const CONFIDENCE_VARIANT: Record<string, "success" | "warning" | "default"> = {
  high: "success",
  medium: "warning",
  low: "default",
};

export default function SignalDetection() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"input" | "results">("input");
  const [sources, setSources] = useState<Source[]>([{ label: "", url: "", text: "" }]);
  const [filters, setFilters] = useState({ therapyArea: "", geography: "", specialty: "", subspecialty: "" });
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<DetectedSignal | null>(null);
  const [linkCaseId, setLinkCaseId] = useState("");

  const { data: runs = [] } = useQuery<DetectionRun[]>({
    queryKey: ["detection-runs"],
    queryFn: () => fetch(`${API}/api/detection-runs`).then(r => r.json()),
  });

  const { data: runDetail } = useQuery<{ run: DetectionRun; signals: DetectedSignal[]; caseSuggestions: CaseSuggestion[] }>({
    queryKey: ["detection-run", activeRunId],
    queryFn: () => fetch(`${API}/api/detection-runs/${activeRunId}`).then(r => r.json()),
    enabled: !!activeRunId,
  });

  const { data: signalSuggestions = [] } = useQuery<CaseSuggestion[]>({
    queryKey: ["signal-suggestions", selectedSignal?.id],
    queryFn: () => fetch(`${API}/api/detected-signals/${selectedSignal!.id}/suggestions`).then(r => r.json()),
    enabled: !!selectedSignal,
  });

  const { data: cases = [] } = useQuery<{ caseId: string; assetName: string }[]>({
    queryKey: ["cases-list"],
    queryFn: () => fetch(`${API}/api/cases`).then(r => r.json()),
  });

  const detectMut = useMutation({
    mutationFn: (body: any) =>
      fetch(`${API}/api/detection-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async r => {
        const d = await r.json();
        if (!r.ok) throw d;
        return d;
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["detection-runs"] });
      setActiveRunId(data.runId);
      setMode("results");
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`${API}/api/detected-signals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detection-run", activeRunId] });
    },
  });

  const linkMut = useMutation({
    mutationFn: ({ id, caseId }: { id: string; caseId: string }) =>
      fetch(`${API}/api/detected-signals/${id}/link-to-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signal-suggestions", selectedSignal?.id] });
      setLinkCaseId("");
    },
  });

  const addSource = () => setSources([...sources, { label: "", url: "", text: "" }]);
  const removeSource = (i: number) => setSources(sources.filter((_, idx) => idx !== i));
  const updateSource = (i: number, field: keyof Source, val: string) => {
    const next = [...sources];
    next[i] = { ...next[i], [field]: val };
    setSources(next);
  };

  const canSubmit = sources.some(s => s.label.trim() && s.text.trim().length >= 20);

  const handleSubmit = () => {
    const validSources = sources.filter(s => s.label.trim() && s.text.trim().length >= 20);
    detectMut.mutate({
      sources: validSources,
      ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)),
    });
  };

  const signals = runDetail?.signals || [];
  const caseSuggestions = runDetail?.caseSuggestions || [];

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Radar className="w-5 h-5 text-primary" />
                Signal Detection Agent
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Scan sources, extract candidate signals, and match them to existing forecasting questions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={mode === "input" ? "primary" : "outline"}
                size="sm"
                onClick={() => setMode("input")}
              >
                New Scan
              </Button>
              {runs.length > 0 && (
                <Select
                  value={activeRunId || ""}
                  onChange={e => { setActiveRunId(e.target.value); setMode("results"); }}
                  className="w-52"
                >
                  <option value="">Past Runs</option>
                  {runs.map(r => (
                    <option key={r.runId} value={r.runId}>
                      {r.runId} ({r.totalSignalsDetected} signals)
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>
          <div className="mt-3 px-0">
            <WorkflowIndicator current={moduleMeta["signal-detection"].workflowStep} />
            <DataFlowBox
              purpose={moduleMeta["signal-detection"].purpose}
              input={moduleMeta["signal-detection"].input}
              output={moduleMeta["signal-detection"].output}
            />
          </div>
        </div>

        {mode === "input" ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground">Sources</h2>
                  <Button variant="ghost" size="sm" onClick={addSource}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Source
                  </Button>
                </div>

                {sources.map((source, i) => (
                  <div key={i} className="mb-4 p-4 bg-muted/20 rounded-xl border border-border/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-muted-foreground">Source {i + 1}</span>
                      {sources.length > 1 && (
                        <button onClick={() => removeSource(i)} className="p-1 hover:bg-muted/50 rounded">
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <Label>Source Label *</Label>
                        <Input
                          value={source.label}
                          onChange={e => updateSource(i, "label", e.target.value)}
                          placeholder="e.g., NEJM Article, FDA Press Release"
                        />
                      </div>
                      <div>
                        <Label>URL (optional)</Label>
                        <Input
                          value={source.url}
                          onChange={e => updateSource(i, "url", e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Content *</Label>
                      <textarea
                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[120px] resize-none"
                        value={source.text}
                        onChange={e => updateSource(i, "text", e.target.value)}
                        placeholder="Paste article text, press release, clinical summary, or other source content..."
                      />
                    </div>
                  </div>
                ))}
              </Card>

              <Card>
                <h2 className="text-sm font-semibold text-foreground mb-4">Optional Filters</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Therapy Area</Label>
                    <Input
                      value={filters.therapyArea}
                      onChange={e => setFilters({ ...filters, therapyArea: e.target.value })}
                      placeholder="e.g., Oncology"
                    />
                  </div>
                  <div>
                    <Label>Geography</Label>
                    <Input
                      value={filters.geography}
                      onChange={e => setFilters({ ...filters, geography: e.target.value })}
                      placeholder="e.g., USA, EU5"
                    />
                  </div>
                  <div>
                    <Label>Specialty</Label>
                    <Input
                      value={filters.specialty}
                      onChange={e => setFilters({ ...filters, specialty: e.target.value })}
                      placeholder="e.g., Pulmonology"
                    />
                  </div>
                  <div>
                    <Label>Subspecialty</Label>
                    <Input
                      value={filters.subspecialty}
                      onChange={e => setFilters({ ...filters, subspecialty: e.target.value })}
                      placeholder="e.g., Interventional Cardiology"
                    />
                  </div>
                </div>
              </Card>

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!canSubmit || detectMut.isPending}
                >
                  {detectMut.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                      Scanning Sources...
                    </>
                  ) : (
                    <>
                      <Radar className="w-4 h-4 mr-2" />
                      Run Signal Detection
                    </>
                  )}
                </Button>
              </div>

              {detectMut.error && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
                  <p className="text-sm text-destructive">{(detectMut.error as any)?.error || "Detection failed"}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            <div className={cn("flex-1 overflow-y-auto", selectedSignal && "border-r border-border")}>
              {!runDetail ? (
                <div className="p-8 text-center text-muted-foreground">Loading detection results...</div>
              ) : signals.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Radar className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p>No signals detected in this run.</p>
                </div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-border bg-card/50 flex items-center gap-4">
                    <Badge variant="primary">{signals.length} Signals Detected</Badge>
                    <Badge variant="default">{caseSuggestions.length} Case Suggestions</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Run: {activeRunId} | Status: {runDetail.run.runStatus}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10">
                      <tr className="text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-medium">Signal</th>
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                        <th className="text-left px-4 py-3 font-medium">Direction</th>
                        <th className="text-left px-4 py-3 font-medium">Strength</th>
                        <th className="text-left px-4 py-3 font-medium">Confidence</th>
                        <th className="text-left px-4 py-3 font-medium">Scope</th>
                        <th className="text-left px-4 py-3 font-medium">Source</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {signals.map(sig => {
                        const isSelected = selectedSignal?.id === sig.id;
                        const affectedCount = caseSuggestions.filter(cs => cs.detectedSignalId === sig.id).length;
                        return (
                          <tr
                            key={sig.id}
                            onClick={() => setSelectedSignal(sig)}
                            className={cn(
                              "border-b border-border/50 cursor-pointer transition-colors",
                              isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground truncate max-w-[260px]">{sig.evidenceSnippet}</div>
                              {sig.possibleEventFamily && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">{sig.possibleEventFamily}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs">{sig.signalType}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("text-xs font-medium capitalize", DIRECTION_COLORS[sig.suggestedDirection] || "text-muted-foreground")}>
                                {sig.suggestedDirection}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs capitalize">{sig.suggestedStrength}</span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={CONFIDENCE_VARIANT[sig.extractionConfidence] || "default"}>
                                {sig.extractionConfidence}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs capitalize">{sig.suggestedScope}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-muted-foreground truncate max-w-[100px] block">{sig.sourceLabel}</span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={sig.status === "validated" ? "success" : sig.status === "rejected" ? "danger" : "default"}>
                                {sig.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {affectedCount > 0 && (
                                  <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{affectedCount} cases</span>
                                )}
                                <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {selectedSignal && (
              <div className="w-[420px] flex-shrink-0 overflow-y-auto bg-card/50">
                <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Signal Detail</span>
                  </div>
                  <button onClick={() => setSelectedSignal(null)} className="p-1 hover:bg-muted/50 rounded">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  <div className="bg-muted/20 rounded-xl p-3 border border-border/30">
                    <p className="text-sm text-foreground leading-relaxed">{selectedSignal.evidenceSnippet}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedSignal.status === "candidate" && (
                      <>
                        <Button variant="primary" size="sm" onClick={() => statusMut.mutate({ id: selectedSignal.id, status: "validated" })} disabled={statusMut.isPending}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Validate
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => statusMut.mutate({ id: selectedSignal.id, status: "rejected" })} disabled={statusMut.isPending}>
                          <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                        </Button>
                      </>
                    )}
                    {selectedSignal.status === "validated" && (
                      <Button variant="outline" size="sm" onClick={() => statusMut.mutate({ id: selectedSignal.id, status: "candidate" })} disabled={statusMut.isPending}>
                        Revert to Candidate
                      </Button>
                    )}
                    {selectedSignal.status === "rejected" && (
                      <Button variant="outline" size="sm" onClick={() => statusMut.mutate({ id: selectedSignal.id, status: "candidate" })} disabled={statusMut.isPending}>
                        Revert to Candidate
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <DetailRow label="Type" value={selectedSignal.signalType} />
                    <DetailRow label="Direction" value={selectedSignal.suggestedDirection} />
                    <DetailRow label="Strength" value={selectedSignal.suggestedStrength} />
                    <DetailRow label="Scope" value={selectedSignal.suggestedScope} />
                    <DetailRow label="Confidence" value={selectedSignal.extractionConfidence} />
                    <DetailRow label="Event Family" value={selectedSignal.possibleEventFamily} />
                    <DetailRow label="Detected Date" value={selectedSignal.detectedDate} />
                    <DetailRow label="Source" value={selectedSignal.sourceLabel} />
                    {selectedSignal.sourceUrl && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs text-muted-foreground w-24 shrink-0 pt-0.5">URL</span>
                        <a href={selectedSignal.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 truncate">
                          {selectedSignal.sourceUrl.slice(0, 40)}...
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    )}
                    <DetailRow label="Therapy Area" value={selectedSignal.therapyArea} />
                    <DetailRow label="Geography" value={selectedSignal.geography} />
                    <DetailRow label="Specialty" value={selectedSignal.specialty} />
                    <DetailRow label="Institution" value={selectedSignal.institutionName} />
                    <DetailRow label="Physician" value={selectedSignal.physicianName} />
                  </div>

                  <div className="border-t border-border pt-4">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Likely Affected Cases</span>
                    </div>

                    {signalSuggestions.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60">No case matches found.</p>
                    ) : (
                      <div className="space-y-2">
                        {signalSuggestions.map(cs => (
                          <div key={cs.id} className="bg-muted/30 rounded-lg p-2.5 border border-border/30">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-medium text-foreground">{cs.caseName || cs.caseId}</span>
                              <Badge variant={CONFIDENCE_VARIANT[cs.matchConfidence] || "default"}>{cs.matchConfidence}</Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{cs.matchReason}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <Select value={linkCaseId} onChange={e => setLinkCaseId(e.target.value)} className="flex-1">
                        <option value="">Link to case...</option>
                        {cases.map(c => (
                          <option key={c.caseId} value={c.caseId}>{c.assetName} ({c.caseId.slice(0, 12)})</option>
                        ))}
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!linkCaseId || linkMut.isPending}
                        onClick={() => linkMut.mutate({ id: selectedSignal.id, caseId: linkCaseId })}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-xs text-muted-foreground w-24 shrink-0 pt-0.5">{label}</span>
      {value ? (
        <span className="text-xs text-foreground capitalize">{value}</span>
      ) : (
        <span className="text-xs text-muted-foreground/40 italic">—</span>
      )}
    </div>
  );
}
