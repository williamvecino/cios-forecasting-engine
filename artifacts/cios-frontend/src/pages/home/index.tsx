import { useState, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useListCases } from "@workspace/api-client-react";
import TopNav from "@/components/top-nav";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { clearCaseState } from "@/lib/workflow";
import {
  ArrowRight,
  Clock,
  X,
  Upload,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  FileText,
} from "lucide-react";

const EXAMPLE_QUESTIONS = [
  {
    category: "Regulatory & Safety",
    prompts: [
      "Will the FDA approve a supplemental indication for Keytruda in adjuvant melanoma within 12 months?",
    ],
  },
  {
    category: "Competitive Positioning",
    prompts: [
      "Will Humira biosimilar uptake exceed 40% formulary share among commercial payers by Q4 2026?",
    ],
  },
  {
    category: "Physician Adoption",
    prompts: [
      "Will Kisqali achieve first-line CDK4/6 inhibitor preference among community oncologists within 18 months?",
    ],
  },
  {
    category: "Access & Barriers",
    prompts: [
      "Will Leqembi reach 5,000 active patients in the US despite REMS and infusion-site access barriers within 24 months?",
    ],
  },
];

export default function HomePage() {
  const [, navigate] = useLocation();
  const { data: cases } = useListCases();
  const { activeQuestion, createQuestion } = useActiveQuestion();
  const [input, setInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const allCases = (cases as any[]) || [];
  const recentCases = allCases.slice(0, 5);

  function handleFileSelected(file: File) {
    localStorage.setItem("cios.pendingImportFile", file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        localStorage.setItem("cios.pendingImportData", reader.result as string);
      } catch {}
      navigate("/question?import=file");
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    dragCounterRef.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setIsDragging(false);
      dragCounterRef.current = 0;
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  const openCase = useCallback((c: any) => {
    const cid = c.caseId || c.id;
    if (activeQuestion?.caseId === cid) {
      navigate("/signals");
      return;
    }
    const prevCaseId = activeQuestion?.caseId;
    if (prevCaseId && prevCaseId !== cid) {
      clearCaseState(prevCaseId);
    }
    try { localStorage.removeItem("cios.therapeuticArea"); } catch {}
    try { localStorage.removeItem("cios.questionDraft"); } catch {}
    const questionText = c.strategicQuestion || c.assetName || "Untitled";
    createQuestion({
      text: questionText,
      rawInput: c.strategicQuestion || "",
      caseId: cid,
      timeHorizon: c.timeHorizon || "12 months",
      subject: c.assetName || c.primaryBrand || "",
      outcome: c.outcomeDefinition || "adoption",
    });
    if (c.therapeuticArea) {
      try { localStorage.setItem("cios.therapeuticArea", c.therapeuticArea); } catch {}
    }
    navigate("/signals");
  }, [activeQuestion, createQuestion, navigate]);

  function handleStart() {
    if (!input.trim()) return;
    localStorage.setItem("cios.questionDraft", input.trim());
    navigate("/question");
  }

  function handleExampleClick(q: string) {
    setInput(q);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-3xl px-6 py-16 space-y-10">
        <section className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            What do you want to forecast?
          </h1>
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            Define a specific, measurable question about adoption, market access, or stakeholder behavior.
          </p>
        </section>

        <section
          className="max-w-2xl mx-auto"
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
        >
          <div className={`relative rounded-2xl transition ${isDragging ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Will community oncologists adopt Drug X as first-line within 18 months of launch?"
              rows={3}
              className="w-full rounded-2xl border border-border bg-card px-5 py-4 pr-12 text-foreground placeholder:text-muted-foreground/40 resize-none text-base leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                  e.preventDefault();
                  handleStart();
                }
              }}
            />
            {input.trim() && (
              <button
                type="button"
                onClick={() => setInput("")}
                className="absolute top-3 right-3 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition"
                title="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {isDragging && (
              <div className="absolute inset-0 rounded-2xl bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <Upload className="w-5 h-5" />
                  Drop file to import
                </div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="*/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleStart}
              disabled={!input.trim()}
              className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 text-sm"
            >
              Start Forecast
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-border px-5 py-3 font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 inline-flex items-center gap-2 text-sm transition"
            >
              <Paperclip className="w-4 h-4" />
              Attach file
            </button>
            <Link
              href="/case-input"
              className="rounded-xl border border-border px-5 py-3 font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 inline-flex items-center gap-2 text-sm transition"
            >
              <FileText className="w-4 h-4" />
              Structured Input
            </Link>
          </div>
        </section>

        {activeQuestion && (
          <section className="max-w-2xl mx-auto">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-2">
                Continue where you left off
              </div>
              <div className="text-foreground font-medium text-sm">{activeQuestion.text}</div>
              <Link
                href="/question"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition"
              >
                Resume Forecast <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        <section className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lightbulb className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-widest">Example questions</span>
          </div>
          <div className="space-y-3">
            {EXAMPLE_QUESTIONS.map((group) => (
              <div key={group.category}>
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1.5">{group.category}</p>
                <div className="space-y-1.5">
                  {group.prompts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleExampleClick(q)}
                      className="w-full rounded-lg border border-border/50 bg-card/50 px-4 py-2.5 text-left text-sm text-foreground/70 hover:text-foreground hover:bg-muted/10 hover:border-border transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {recentCases.length > 0 && (
          <section className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setShowRecent(!showRecent)}
              className="w-full flex items-center justify-between rounded-xl border border-border bg-card/50 px-4 py-3 text-left hover:bg-muted/10 transition"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Recent Forecasts</span>
                <span className="text-xs text-muted-foreground/50">{recentCases.length}</span>
              </div>
              {showRecent
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </button>
            {showRecent && (
              <div className="mt-2 rounded-xl border border-border bg-card/30 divide-y divide-border/30 overflow-hidden">
                {recentCases.map((c: any) => {
                  const cid = c.caseId || c.id;
                  const prob = c.currentProbability;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => openCase(c)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/10 transition"
                    >
                      <span className="text-sm text-foreground/80 line-clamp-1 flex-1 mr-4">
                        {c.strategicQuestion || c.assetName || "Untitled"}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        {prob != null && (
                          <span className="text-sm font-semibold text-primary">
                            {Math.round(prob * 100)}%
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/40 font-mono">{cid}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
