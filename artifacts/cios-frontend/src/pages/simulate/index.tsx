import { useState, useRef } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  Loader2,
  AlertTriangle,
  Upload,
  Play,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { Link } from "wouter";

const SEGMENTS = [
  { key: "Early Adopters", description: "First movers who act on clinical data alone" },
  { key: "Persuadables", description: "Open to adoption when key barriers are resolved" },
  { key: "Late Movers", description: "Adopt only after widespread institutional validation" },
  { key: "Resistant", description: "Unlikely to adopt without compelling systemic change" },
];

interface SimulationResult {
  adoption_likelihood: number;
  confidence: string;
  primary_reaction: string;
  barrier_sensitivity: string;
  trigger_condition: string;
  material_effectiveness: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function SimulatePage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [materialText, setMaterialText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";
  const hasInput = selectedSegment && (materialText.trim() || file);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  function clearFile() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function runSimulation() {
    if (!activeQuestion || !selectedSegment || !hasInput) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let gates: any[] = [];
      let barriers: any[] = [];
      let triggers: any[] = [];
      let signals: any[] = [];
      let probability: number | null = null;
      let constrainedProbability: number | null = null;

      try {
        const decomp = localStorage.getItem(`cios.eventDecomposition:${caseId}`);
        if (decomp) {
          const parsed = JSON.parse(decomp);
          gates = parsed.event_gates || [];
          probability = parsed.brand_outlook_probability ?? null;
          constrainedProbability = parsed.constrained_probability ?? null;
        }
      } catch {}

      try {
        const decide = localStorage.getItem(`cios.decideResult:${caseId}`);
        if (decide) {
          const parsed = JSON.parse(decide);
          barriers = parsed.derived_decisions?.barriers || [];
          triggers = parsed.derived_decisions?.trigger_events || [];
        }
      } catch {}

      try {
        const sigRaw = localStorage.getItem(`cios.signals:${caseId}`);
        if (sigRaw) {
          signals = JSON.parse(sigRaw)
            .filter((s: any) => s.accepted && !s.dismissed)
            .map((s: any) => ({ text: s.text, direction: s.direction, importance: s.importance }));
        }
      } catch {}

      const contextData: Record<string, any> = {
        segment: selectedSegment,
        questionText: activeQuestion.text,
        subject: activeQuestion.subject || activeQuestion.text,
        timeHorizon: activeQuestion.timeHorizon || "12 months",
        probability,
        constrainedProbability,
        gates,
        barriers,
        triggers,
        signals,
      };

      let res: Response;

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        if (materialText.trim()) {
          contextData.materialText = materialText.trim();
        }
        formData.append("data", JSON.stringify(contextData));

        res = await fetch(`${getApiBase()}/ai-simulate/reaction`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`${getApiBase()}/ai-simulate/reaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...contextData, materialText: materialText.trim() }),
        });
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setSelectedSegment(null);
    setMaterialText("");
    clearFile();
    setError(null);
  }

  function likelihoodColor(value: number): string {
    if (value >= 65) return "text-emerald-400";
    if (value >= 40) return "text-amber-400";
    return "text-rose-400";
  }

  function confidenceColor(level: string): string {
    if (level === "High") return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
    if (level === "Moderate") return "text-amber-400 bg-amber-400/10 border-amber-400/30";
    return "text-rose-400 bg-rose-400/10 border-rose-400/30";
  }

  return (
    <WorkflowLayout currentStep="respond" activeQuestion={activeQuestion} onClearQuestion={clearQuestion}>
      <QuestionGate activeQuestion={activeQuestion}>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Link href="/respond" className="text-muted-foreground hover:text-foreground transition">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">Simulate Adoption Reaction</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Test how a segment responds to specific materials given current constraints.
              </p>
            </div>
          </div>

          {!result && !loading && (
            <div className="space-y-6">
              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Select Segment</h2>
                <div className="grid grid-cols-2 gap-3">
                  {SEGMENTS.map(seg => (
                    <button
                      key={seg.key}
                      onClick={() => setSelectedSegment(seg.key)}
                      className={`text-left rounded-xl border px-4 py-3 transition ${
                        selectedSegment === seg.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      <p className="text-sm font-semibold">{seg.key}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{seg.description}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Upload Material</h2>

                <div className="space-y-3">
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="rounded-xl border border-dashed border-border bg-card/50 p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition"
                  >
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop or click to upload PPT, PDF, image, or document
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      onChange={handleFileChange}
                      accept=".pptx,.ppt,.pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                    />
                  </div>

                  {file && (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                      {file.type.startsWith("image/")
                        ? <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
                        : <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      }
                      <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
                      <button onClick={clearFile} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <textarea
                      value={materialText}
                      onChange={e => setMaterialText(e.target.value)}
                      placeholder="Or paste message text, talking points, or key claims here..."
                      rows={4}
                      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>
              </section>

              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-400">{error}</p>
                </div>
              )}

              <button
                onClick={runSimulation}
                disabled={!hasInput}
                className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  hasInput
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted/20 text-muted-foreground cursor-not-allowed"
                }`}
              >
                <Play className="w-4 h-4" />
                Run Simulation
              </button>
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Simulating {selectedSegment} reaction...
              </p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Segment:</span>
                  <span className="text-sm font-semibold text-foreground">{selectedSegment}</span>
                </div>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
                >
                  New Simulation
                </button>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Adoption Likelihood</p>
                    <p className={`text-4xl font-bold mt-1 ${likelihoodColor(result.adoption_likelihood)}`}>
                      {result.adoption_likelihood}%
                    </p>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidenceColor(result.confidence)}`}>
                    {result.confidence} Confidence
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Primary Reaction</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{result.primary_reaction}</p>
                  </div>

                  <div className="border-t border-border/40" />

                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Barrier Sensitivity</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{result.barrier_sensitivity}</p>
                  </div>

                  <div className="border-t border-border/40" />

                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Trigger Condition</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{result.trigger_condition}</p>
                  </div>

                  <div className="border-t border-border/40" />

                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Material Effectiveness</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{result.material_effectiveness}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </QuestionGate>
    </WorkflowLayout>
  );
}
