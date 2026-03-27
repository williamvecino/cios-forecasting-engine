import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, Input, Select, Label } from "@/components/ui-components";
import {
  Search, ChevronRight, ChevronDown, User, Building2, FlaskConical,
  CheckCircle2, XCircle, Clock, Send, Pause, Trash2, ExternalLink,
  Sparkles, AlertTriangle, ShieldCheck, Eye, ArrowRight, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import WorkflowIndicator from "@/components/workflow-indicator";
import DataFlowBox from "@/components/data-flow-box";
import { moduleMeta } from "@/lib/module-meta";

const THERAPY_AREAS = [
  "Oncology", "Cardiology", "Neurology", "Immunology / Rheumatology",
  "Rare disease / Orphan", "Respiratory / Pulmonology", "Infectious Disease",
  "Dermatology", "Endocrinology / Metabolic", "Ophthalmology",
  "Psychiatry / CNS", "Gastroenterology", "Nephrology / Urology",
  "Hematology", "Musculoskeletal", "Pain", "Women's Health", "Other",
];

const TARGET_TYPES = [
  { value: "physician", label: "Physician" },
  { value: "institution", label: "Institution" },
  { value: "both", label: "Both" },
];

interface DiscoverySignal {
  signalId: string;
  candidateId: string;
  signalType: string;
  direction: "positive" | "negative" | "neutral";
  strength: "high" | "medium" | "low";
  reliability: "high" | "medium" | "low";
  signalScope: string;
  sourceLabel: string;
  sourceUrl: string | null;
  evidenceSnippet: string | null;
  observedAt: string | null;
  eventFamilyId: string | null;
  status: "candidate" | "validated" | "rejected";
}

interface DiscoveryCandidate {
  candidateId: string;
  discoveryRunId: string;
  candidateType: "physician" | "institution";
  candidateName: string;
  specialty: string | null;
  subspecialty: string | null;
  institutionName: string | null;
  geography: string | null;
  prepScore: number;
  suggestedAction: string;
  positiveSignals: number;
  negativeSignals: number;
  evidenceCompleteness: number;
  status: string;
  signals: DiscoverySignal[];
}

interface ParsedQuestion {
  therapyArea: string;
  geography: string;
  targetType: string;
  specialty: string | null;
  subspecialty: string | null;
  timeHorizon: string | null;
  adoptionOutcome: string | null;
}

interface DiscoveryRun {
  runId: string;
  questionText: string;
  parsedQuestion?: ParsedQuestion;
  parsedQuestionJson?: ParsedQuestion;
  status?: string;
  runStatus?: string;
  totalCandidates?: number;
  totalCandidatesFound?: number;
  totalSignals?: number;
  totalSignalsFound?: number;
  createdAt: string;
  candidates?: DiscoveryCandidate[];
}

function normalizeRun(raw: any): DiscoveryRun {
  return {
    ...raw,
    parsedQuestion: raw.parsedQuestion || raw.parsedQuestionJson || null,
    status: raw.status || raw.runStatus || "completed",
    totalCandidates: raw.totalCandidates ?? raw.totalCandidatesFound ?? 0,
    totalSignals: raw.totalSignals ?? raw.totalSignalsFound ?? 0,
  };
}

async function fetchDiscoveryRuns(): Promise<DiscoveryRun[]> {
  const res = await fetch("/api/discovery-runs");
  if (!res.ok) throw new Error("Failed to fetch discovery runs");
  const data = await res.json();
  return data.map(normalizeRun);
}

async function fetchDiscoveryRun(runId: string): Promise<DiscoveryRun> {
  const res = await fetch(`/api/discovery-runs/${runId}`);
  if (!res.ok) throw new Error("Failed to fetch discovery run");
  const data = await res.json();
  return normalizeRun(data);
}

async function createDiscoveryRun(data: {
  questionText: string;
  therapyArea?: string;
  geography?: string;
  targetType?: string;
  specialty?: string;
  subspecialty?: string;
  timeHorizon?: string;
}): Promise<DiscoveryRun> {
  const res = await fetch("/api/discovery-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create discovery run");
  return res.json();
}

async function signalAction(signalId: string, action: "validate" | "reject" | "defer") {
  const res = await fetch(`/api/discovery-candidate-signals/${signalId}/${action}`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to ${action} signal`);
  return res.json();
}

async function candidateAction(candidateId: string, action: "send-to-cios" | "hold" | "remove") {
  const res = await fetch(`/api/discovery-candidates/${candidateId}/${action}`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to ${action} candidate`);
  return res.json();
}

function strengthColor(strength: string) {
  if (strength === "high") return "text-success";
  if (strength === "medium") return "text-warning";
  return "text-muted-foreground";
}

function directionIcon(direction: string) {
  if (direction === "positive") return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
  if (direction === "negative") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function statusBadge(status: string) {
  if (status === "validated") return <Badge variant="success">Validated</Badge>;
  if (status === "rejected") return <Badge variant="danger">Rejected</Badge>;
  return <Badge>Pending</Badge>;
}

function actionBadge(action: string) {
  if (action === "send to CIOS scoring") return <Badge variant="success">Send to CIOS</Badge>;
  if (action === "hold — needs more evidence") return <Badge variant="warning">Hold</Badge>;
  if (action === "review — mixed signals") return <Badge variant="warning">Review</Badge>;
  return <Badge>{action}</Badge>;
}

function SignalRow({ signal, onAction }: { signal: DiscoverySignal; onAction: (id: string, action: "validate" | "reject" | "defer") => void }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/20 transition-colors group">
      <div className="mt-0.5">{directionIcon(signal.direction)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{signal.signalType}</span>
          <span className={cn("text-xs font-medium", strengthColor(signal.strength))}>
            {signal.strength}
          </span>
          {statusBadge(signal.status)}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{signal.sourceLabel}</span>
          {signal.sourceUrl && (
            <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        {signal.evidenceSnippet && (
          <div className="text-xs text-muted-foreground/80 mt-1 italic leading-relaxed">
            "{signal.evidenceSnippet}"
          </div>
        )}
        {!signal.evidenceSnippet && (
          <div className="text-xs text-warning/70 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Missing evidence snippet
          </div>
        )}
      </div>
      {signal.status === "candidate" && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAction(signal.signalId, "validate")}
            className="p-1 rounded hover:bg-success/10 text-success transition-colors"
            title="Validate"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onAction(signal.signalId, "defer")}
            className="p-1 rounded hover:bg-warning/10 text-warning transition-colors"
            title="Defer"
          >
            <Clock className="w-4 h-4" />
          </button>
          <button
            onClick={() => onAction(signal.signalId, "reject")}
            className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
            title="Reject"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CandidateDrawer({
  candidate,
  onClose,
  onSignalAction,
  onCandidateAction,
}: {
  candidate: DiscoveryCandidate;
  onClose: () => void;
  onSignalAction: (id: string, action: "validate" | "reject" | "defer") => void;
  onCandidateAction: (id: string, action: "send-to-cios" | "hold" | "remove") => void;
}) {
  const validatedCount = candidate.signals.filter(s => s.status === "validated").length;
  const canPromote = validatedCount > 0 && candidate.status !== "promoted";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-card border-l border-border shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center border",
              candidate.candidateType === "physician"
                ? "bg-primary/10 border-primary/20"
                : "bg-warning/10 border-warning/20"
            )}>
              {candidate.candidateType === "physician"
                ? <User className="w-4.5 h-4.5 text-primary" />
                : <Building2 className="w-4.5 h-4.5 text-warning" />}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{candidate.candidateName}</h3>
              <p className="text-xs text-muted-foreground">{candidate.candidateType === "physician" ? "Physician" : "Institution"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Specialty</div>
              <div className="text-sm font-medium text-foreground">{candidate.specialty || "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Subspecialty</div>
              <div className="text-sm font-medium text-foreground">{candidate.subspecialty || "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Institution</div>
              <div className="text-sm font-medium text-foreground">{candidate.institutionName || "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Geography</div>
              <div className="text-sm font-medium text-foreground">{candidate.geography || "—"}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/20 rounded-xl p-3 border border-border/30 text-center">
              <div className="text-2xl font-bold text-foreground">{candidate.prepScore.toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Prep Score</div>
            </div>
            <div className="bg-success/5 rounded-xl p-3 border border-success/10 text-center">
              <div className="text-2xl font-bold text-success">{candidate.positiveSignals}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Positive</div>
            </div>
            <div className="bg-destructive/5 rounded-xl p-3 border border-destructive/10 text-center">
              <div className="text-2xl font-bold text-destructive">{candidate.negativeSignals}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Negative</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">Evidence completeness</div>
            <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  candidate.evidenceCompleteness >= 0.7 ? "bg-success" : candidate.evidenceCompleteness >= 0.4 ? "bg-warning" : "bg-destructive"
                )}
                style={{ width: `${candidate.evidenceCompleteness * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-foreground">{(candidate.evidenceCompleteness * 100).toFixed(0)}%</span>
          </div>

          {(() => {
            const missing: string[] = [];
            if (!candidate.subspecialty) missing.push("Subspecialty");
            if (!candidate.institutionName && candidate.candidateType === "physician") missing.push("Institution");
            if (candidate.signals.some(s => !s.evidenceSnippet)) missing.push("Evidence snippets");
            if (candidate.signals.some(s => !s.sourceUrl)) missing.push("Source URLs");
            if (candidate.evidenceCompleteness < 0.5) missing.push("Additional signals needed");
            if (missing.length === 0) return null;
            return (
              <div className="bg-warning/5 border border-warning/15 rounded-xl p-3">
                <div className="text-xs font-semibold text-warning mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Missing data ({missing.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map(m => (
                    <span key={m} className="px-2 py-0.5 bg-warning/10 text-warning text-[10px] font-medium rounded-md border border-warning/15">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Signals ({candidate.signals.length})
            </h4>
            <div className="space-y-0.5">
              {candidate.signals.map(sig => (
                <SignalRow key={sig.signalId} signal={sig} onAction={onSignalAction} />
              ))}
            </div>
          </div>

          {candidate.status !== "promoted" && candidate.status !== "removed" && (
            <div className="flex gap-2 pt-2 border-t border-border/30">
              <Button
                variant="primary"
                size="sm"
                disabled={!canPromote}
                onClick={() => onCandidateAction(candidate.candidateId, "send-to-cios")}
                className="flex-1"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Send to CIOS
                {validatedCount > 0 && <span className="ml-1 opacity-70">({validatedCount} signals)</span>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCandidateAction(candidate.candidateId, "hold")}
              >
                <Pause className="w-3.5 h-3.5 mr-1.5" />
                Hold
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onCandidateAction(candidate.candidateId, "remove")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {candidate.status === "promoted" && (
            <div className="flex items-center gap-2 p-3 bg-success/5 border border-success/20 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-sm font-medium text-success">Promoted to CIOS — case created</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdopterDiscovery() {
  const queryClient = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [questionText, setQuestionText] = useState("");
  const [therapyArea, setTherapyArea] = useState("");
  const [geography, setGeography] = useState("US");
  const [targetType, setTargetType] = useState("physician");
  const [specialty, setSpecialty] = useState("");
  const [subspecialty, setSubspecialty] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("");

  const runsQuery = useQuery({
    queryKey: ["discovery-runs"],
    queryFn: fetchDiscoveryRuns,
  });

  const activeRunQuery = useQuery({
    queryKey: ["discovery-run", activeRunId],
    queryFn: () => fetchDiscoveryRun(activeRunId!),
    enabled: !!activeRunId,
  });

  const createMutation = useMutation({
    mutationFn: createDiscoveryRun,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["discovery-runs"] });
      setActiveRunId(data.runId);
      setShowForm(false);
      setQuestionText("");
    },
  });

  const signalMutation = useMutation({
    mutationFn: ({ signalId, action }: { signalId: string; action: "validate" | "reject" | "defer" }) =>
      signalAction(signalId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discovery-run", activeRunId] });
    },
  });

  const candidateMutation = useMutation({
    mutationFn: ({ candidateId, action }: { candidateId: string; action: "send-to-cios" | "hold" | "remove" }) =>
      candidateAction(candidateId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discovery-run", activeRunId] });
      queryClient.invalidateQueries({ queryKey: ["discovery-runs"] });
      setSelectedCandidateId(null);
    },
  });

  const handleSignalAction = useCallback((signalId: string, action: "validate" | "reject" | "defer") => {
    signalMutation.mutate({ signalId, action });
  }, [signalMutation]);

  const handleCandidateAction = useCallback((candidateId: string, action: "send-to-cios" | "hold" | "remove") => {
    candidateMutation.mutate({ candidateId, action });
  }, [candidateMutation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    createMutation.mutate({
      questionText,
      therapyArea: therapyArea || undefined,
      geography: geography || undefined,
      targetType: targetType || undefined,
      specialty: specialty || undefined,
      subspecialty: subspecialty || undefined,
      timeHorizon: timeHorizon || undefined,
    });
  };

  const activeRun = activeRunQuery.data;
  const runs = runsQuery.data || [];

  const selectedCandidate = selectedCandidateId && activeRun?.candidates
    ? activeRun.candidates.find(c => c.candidateId === selectedCandidateId) || null
    : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
              <Sparkles className="w-6 h-6 text-primary" />
              Adopter Discovery
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Identify high-potential physician and institution adoption candidates with structured evidence
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} variant={showForm ? "outline" : "primary"}>
            {showForm ? (
              <>
                <X className="w-4 h-4 mr-1.5" />
                Cancel
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-1.5" />
                New Discovery
              </>
            )}
          </Button>
        </div>

        <WorkflowIndicator current={moduleMeta["adopter-discovery"].workflowStep} />
        <DataFlowBox
          purpose={moduleMeta["adopter-discovery"].purpose}
          input={moduleMeta["adopter-discovery"].input}
          output={moduleMeta["adopter-discovery"].output}
        />

        {showForm && (
          <Card>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Discovery question</Label>
                <textarea
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  placeholder="e.g., Who are the most likely physician adopters of ARIKAYCE for MAC lung disease in the United States?"
                  rows={3}
                  className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Therapy area</Label>
                  <Select value={therapyArea} onChange={e => setTherapyArea(e.target.value)}>
                    <option value="">Auto-detect</option>
                    {THERAPY_AREAS.map(ta => <option key={ta} value={ta}>{ta}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Geography</Label>
                  <Input value={geography} onChange={e => setGeography(e.target.value)} placeholder="US" />
                </div>
                <div>
                  <Label>Target type</Label>
                  <Select value={targetType} onChange={e => setTargetType(e.target.value)}>
                    {TARGET_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Specialty</Label>
                  <Input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Subspecialty</Label>
                  <Input value={subspecialty} onChange={e => setSubspecialty(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Time horizon</Label>
                  <Input value={timeHorizon} onChange={e => setTimeHorizon(e.target.value)} placeholder="e.g., 12 months" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={createMutation.isPending || !questionText.trim()}>
                  {createMutation.isPending ? (
                    <>
                      <FlaskConical className="w-4 h-4 mr-1.5 animate-spin" />
                      Running discovery...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-1.5" />
                      Run Discovery
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {runs.length > 0 && !activeRun && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Previous Runs</h3>
            <div className="space-y-2">
              {runs.map(run => (
                <button
                  key={run.runId}
                  onClick={() => setActiveRunId(run.runId)}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted/30 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{run.questionText}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{run.totalCandidates} candidates</span>
                      <span className="text-xs text-muted-foreground">{run.totalSignals} signals</span>
                      <Badge variant="primary">{run.parsedQuestion?.targetType || "—"}</Badge>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
              ))}
            </div>
          </Card>
        )}

        {activeRun && (
          <>
            <Card>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setActiveRunId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      All runs
                    </button>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">{activeRun.runId}</span>
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{activeRun.questionText}</h3>
                </div>
                <Badge variant="success">{activeRun.status}</Badge>
              </div>

              {activeRun.parsedQuestion && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeRun.parsedQuestion.therapyArea && (
                    <span className="px-2.5 py-1 bg-primary/10 text-primary text-xs font-medium rounded-lg border border-primary/20">
                      {activeRun.parsedQuestion.therapyArea}
                    </span>
                  )}
                  <span className="px-2.5 py-1 bg-muted/30 text-foreground text-xs font-medium rounded-lg border border-border/30">
                    {activeRun.parsedQuestion.geography || "USA"}
                  </span>
                  <span className="px-2.5 py-1 bg-muted/30 text-foreground text-xs font-medium rounded-lg border border-border/30">
                    {activeRun.parsedQuestion.targetType}
                  </span>
                  {activeRun.parsedQuestion.specialty && (
                    <span className="px-2.5 py-1 bg-muted/30 text-foreground text-xs font-medium rounded-lg border border-border/30">
                      {activeRun.parsedQuestion.specialty}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="bg-muted/20 rounded-xl p-3 border border-border/30 text-center">
                  <div className="text-xl font-bold text-foreground">{activeRun.totalCandidates}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Candidates</div>
                </div>
                <div className="bg-muted/20 rounded-xl p-3 border border-border/30 text-center">
                  <div className="text-xl font-bold text-foreground">{activeRun.totalSignals}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Total Signals</div>
                </div>
                <div className="bg-muted/20 rounded-xl p-3 border border-border/30 text-center">
                  <div className="text-xl font-bold text-foreground">
                    {activeRun.candidates?.filter(c => c.status === "promoted").length || 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Promoted</div>
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div className="px-6 py-4 border-b border-border/30">
                <h3 className="text-sm font-semibold text-foreground">Candidate Shortlist</h3>
              </div>
              <div className="divide-y divide-border/20">
                {activeRun.candidates?.map(candidate => (
                  <div
                    key={candidate.candidateId}
                    className={cn(
                      "flex items-center gap-4 px-6 py-4 hover:bg-muted/10 transition-colors cursor-pointer",
                      candidate.status === "promoted" && "opacity-60",
                      candidate.status === "removed" && "opacity-30"
                    )}
                    onClick={() => setSelectedCandidateId(candidate.candidateId)}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center border shrink-0",
                      candidate.candidateType === "physician"
                        ? "bg-primary/10 border-primary/20"
                        : "bg-warning/10 border-warning/20"
                    )}>
                      {candidate.candidateType === "physician"
                        ? <User className="w-4 h-4 text-primary" />
                        : <Building2 className="w-4 h-4 text-warning" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{candidate.candidateName}</span>
                        {candidate.status === "promoted" && <Badge variant="success">Promoted</Badge>}
                        {candidate.status === "on-hold" && <Badge variant="warning">On Hold</Badge>}
                        {candidate.status === "removed" && <Badge variant="danger">Removed</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">{candidate.specialty || "—"}</span>
                        {candidate.institutionName && (
                          <span className="text-xs text-muted-foreground">{candidate.institutionName}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center">
                        <div className="text-sm font-bold text-foreground">{candidate.prepScore.toFixed(1)}</div>
                        <div className="text-[10px] text-muted-foreground">Score</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-success">{candidate.positiveSignals}+</span>
                        <span className="text-xs text-muted-foreground">/</span>
                        <span className="text-xs font-medium text-destructive">{candidate.negativeSignals}-</span>
                      </div>
                      {actionBadge(candidate.suggestedAction)}
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {!activeRun && runs.length === 0 && !showForm && (
          <Card>
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 text-primary/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No discovery runs yet</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Define a question to identify potential adoption candidates across physicians and institutions.
              </p>
              <Button onClick={() => setShowForm(true)}>
                <Search className="w-4 h-4 mr-1.5" />
                Start Discovery
              </Button>
            </div>
          </Card>
        )}
      </div>

      {selectedCandidate && (
        <CandidateDrawer
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidateId(null)}
          onSignalAction={handleSignalAction}
          onCandidateAction={handleCandidateAction}
        />
      )}
    </AppLayout>
  );
}
