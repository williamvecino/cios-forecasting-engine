import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  X,
  Loader2,
  Check,
  AlertTriangle,
  ArrowRight,
  Search,
  Files,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word",
  "application/msword": "Word (Legacy)",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PowerPoint",
  "application/vnd.ms-powerpoint": "PowerPoint (Legacy)",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-excel": "Excel",
  "text/csv": "CSV",
  "text/plain": "Text",
  "image/jpeg": "Image",
  "image/jpg": "Image",
  "image/png": "Image",
  "image/webp": "Image",
};

const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xlsx",
  ".xls",
  ".csv",
  ".txt",
  ".md",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

interface ExtractedSignal {
  text: string;
  direction: string;
  importance: string;
  confidence: string;
  category: string;
  source_description: string;
  source_file?: string;
  rationale: string;
}

interface MissingSignal {
  text: string;
  importance: string;
  category: string;
  reason: string;
}

interface ExtractedQuestion {
  text: string;
  restatedQuestion: string;
  subject: string;
  outcome: string;
  timeHorizon: string;
  questionType: string;
  entities: string[];
  primaryConstraint: string;
  decisionType: string;
}

interface DetectedEnvironment {
  context: string;
  label: string;
  rationale: string;
}

interface FileManifestEntry {
  fileName: string;
  textLength: number;
  confidence: string;
  isImage: boolean;
}

interface Contradiction {
  description: string;
  file_a: string;
  file_b: string;
  resolution_suggestion: string;
}

interface DecisionArchetypeResult {
  primary: string;
  secondary: string[];
  framing: string;
  guardrailApplied: boolean;
  guardrailReason?: string | null;
  documentType?: string;
  evidenceSpans?: string[];
  secondaryDecisions?: string[];
  alternativeArchetype?: string | null;
  confidenceLevel?: string;
  confidenceRationale?: string;
}

interface ImportResult {
  question: ExtractedQuestion;
  signals: ExtractedSignal[];
  missingSignals: MissingSignal[];
  suggestedCaseType?: string;
  confidence?: string;
  summary: string;
  environment?: DetectedEnvironment;
  lowConfidence?: boolean;
  fileManifest?: FileManifestEntry[];
  contradictions?: Contradiction[];
  primaryFile?: string;
  decisionArchetype?: DecisionArchetypeResult;
}

interface RecommendedQuestion {
  text: string;
  rationale: string;
  category: string;
  priority: "critical" | "important" | "supplementary";
  suggestedTimeHorizon: string;
  suggestedSubject: string;
}

interface DecisionPack {
  documentType: string;
  primaryDecision: string;
  secondaryDecisions: string[];
  requiredOutputs: string[];
  businessContext: string;
  targetAudiences: string[];
  competitiveContext: string;
  missingInformation: string[];
  recommendedQuestions: RecommendedQuestion[];
  evidenceSpans: string[];
  confidence: string;
  confidenceRationale: string;
  sourceFiles: string[];
  extractedTextLength: number;
}

interface Props {
  onImportComplete: (result: ImportResult) => void;
  onMultiImport?: (questions: RecommendedQuestion[], decisionPack: DecisionPack) => void;
  onClose: () => void;
  initialFile?: File | null;
}

type ImportPhase = "upload" | "processing" | "interpreting" | "decision-pack" | "summary";

const confidenceColor = (c: string) => {
  const lower = c.toLowerCase();
  if (lower === "high") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (lower === "moderate") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
};

function isImageType(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function getFileTypeLabel(file: File): string {
  if (ACCEPTED_TYPES[file.type]) return ACCEPTED_TYPES[file.type];
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if ([".doc"].includes(ext)) return "Word (Legacy)";
  if ([".ppt"].includes(ext)) return "PowerPoint (Legacy)";
  return "Document";
}

export default function ImportProjectDialog({ onImportComplete, onMultiImport, onClose, initialFile }: Props) {
  const [phase, setPhase] = useState<ImportPhase>("upload");
  const [pasteText, setPasteText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>(() => initialFile ? [initialFile] : []);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>(() => {
    if (initialFile && isImageType(initialFile)) {
      return { [initialFile.name + initialFile.size]: URL.createObjectURL(initialFile) };
    }
    return {};
  });
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [decisionPack, setDecisionPack] = useState<DecisionPack | null>(null);
  const [selectedQuestionIndexes, setSelectedQuestionIndexes] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 20;

  const addFiles = useCallback((newFiles: File[]) => {
    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      const unique = newFiles.filter(f => !existing.has(f.name + f.size));
      const combined = [...prev, ...unique].slice(0, MAX_FILES);
      return combined;
    });
    setPasteText("");
    setError(null);

    setImagePreviews(prev => {
      const next = { ...prev };
      newFiles.forEach(f => {
        if (isImageType(f) && !next[f.name + f.size]) {
          next[f.name + f.size] = URL.createObjectURL(f);
        }
      });
      return next;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => {
      const file = prev[index];
      if (file) {
        const key = file.name + file.size;
        setImagePreviews(p => {
          if (p[key]) {
            URL.revokeObjectURL(p[key]);
            const next = { ...p };
            delete next[key];
            return next;
          }
          return p;
        });
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setImagePreviews(prev => {
      Object.values(prev).forEach(url => URL.revokeObjectURL(url));
      return {};
    });
    setSelectedFiles([]);
  }, []);

  const previewsRef = useRef(imagePreviews);
  previewsRef.current = imagePreviews;
  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const isValidFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError("File is too large. Maximum file size is 10 MB per file.");
      return false;
    }
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    return (
      ACCEPTED_TYPES[file.type] ||
      ACCEPTED_EXTENSIONS.includes(ext)
    );
  };

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      const validFiles = droppedFiles.filter(f => isValidFile(f));
      if (validFiles.length > 0) {
        addFiles(validFiles);
      }
      if (validFiles.length < droppedFiles.length) {
        const skipped = droppedFiles.length - validFiles.length;
        setError(`${skipped} file${skipped > 1 ? "s" : ""} skipped (unsupported type or too large).`);
      }
    },
    [addFiles],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => isValidFile(f));
    if (validFiles.length > 0) {
      addFiles(validFiles);
    }
    if (e.target) e.target.value = "";
  };

  useEffect(() => {
    if (phase !== "upload") return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const named = new File([file], `pasted-image.${file.type.split("/")[1] || "png"}`, { type: file.type });
            if (isValidFile(named)) {
              addFiles([named]);
            }
          }
          return;
        }
      }

      const text = e.clipboardData?.getData("text/plain");
      if (text && text.trim().length > 0) {
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA") return;
        e.preventDefault();
        setPasteText((prev) => prev ? prev + "\n" + text : text);
        clearFiles();
      }
    };

    const el = containerRef.current;
    if (el) {
      el.addEventListener("paste", handlePaste);
      return () => el.removeEventListener("paste", handlePaste);
    }
  }, [phase, addFiles, clearFiles]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const runInterpretation = async () => {
    setPhase("interpreting");
    setError(null);

    try {
      let interpretRes: Response;

      if (selectedFiles.length > 0) {
        const formData = new FormData();
        selectedFiles.forEach(f => formData.append("files", f));
        if (pasteText.trim()) {
          formData.append("text", pasteText.trim());
        }
        interpretRes = await fetch(`${API}/api/import-project/interpret`, {
          method: "POST",
          body: formData,
        });
      } else if (pasteText.trim()) {
        interpretRes = await fetch(`${API}/api/import-project/interpret`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: pasteText.trim() }),
        });
      } else {
        setError("Please upload files or paste text to import.");
        setPhase("upload");
        return;
      }

      if (!interpretRes.ok) {
        const err = await interpretRes.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error ${interpretRes.status}`);
      }

      const pack: DecisionPack = await interpretRes.json();
      setDecisionPack(pack);
      const initialSelected = new Set<number>();
      pack.recommendedQuestions.forEach((q, i) => {
        if (q.priority === "critical" || q.priority === "important") {
          initialSelected.add(i);
        }
      });
      setSelectedQuestionIndexes(initialSelected);
      setPhase("decision-pack");
    } catch (err: any) {
      console.error("Interpretation failed:", err);
      setError(err.message || "Failed to interpret the document. Please try again.");
      setPhase("upload");
    }
  };

  const processLegacyImport = async () => {
    setPhase("processing");
    setError(null);

    try {
      if (selectedFiles.length === 1 && !pasteText.trim()) {
        const file = selectedFiles[0];
        const base64 = await fileToBase64(file);
        const body = {
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type,
        };

        const res = await fetch(`${API}/api/import-project`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || `Server error ${res.status}`);
        }

        const data = await res.json();
        setResult(data);
        setPhase("summary");
        return;
      }

      if (selectedFiles.length === 0 && pasteText.trim()) {
        const body = { text: pasteText.trim() };
        const res = await fetch(`${API}/api/import-project`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || `Server error ${res.status}`);
        }

        const data = await res.json();
        setResult(data);
        setPhase("summary");
        return;
      }

      if (selectedFiles.length === 0 && !pasteText.trim()) {
        setError("Please upload files or paste text to import.");
        setPhase("upload");
        return;
      }

      const formData = new FormData();
      selectedFiles.forEach(f => formData.append("files", f));
      if (pasteText.trim()) {
        formData.append("text", pasteText.trim());
      }

      const res = await fetch(`${API}/api/import-project/bundle`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
      setPhase("summary");
    } catch (err: any) {
      console.error("Import failed:", err);
      setError(
        err.message ||
          "Failed to analyze the project materials. Please try again.",
      );
      setPhase("upload");
    }
  };

  const processImport = runInterpretation;

  const handleCreateSelectedQuestions = () => {
    if (!decisionPack || !onMultiImport) return;
    const selected = decisionPack.recommendedQuestions.filter((_, i) => selectedQuestionIndexes.has(i));
    if (selected.length === 0) return;
    onMultiImport(selected, decisionPack);
  };

  const toggleQuestionSelection = (index: number) => {
    setSelectedQuestionIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (phase === "interpreting") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Document Interpreter</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <div className="text-center">
            <div className="text-sm font-medium text-foreground">Reading document like a strategist...</div>
            <div className="text-xs text-muted-foreground mt-1">Identifying decision threads, explicit asks, and generating focused questions</div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "decision-pack" && decisionPack) {
    const priorityColor = (p: string) => {
      if (p === "critical") return "text-red-400 bg-red-500/10 border-red-500/20";
      if (p === "important") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    };
    const categoryLabel = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Decision Pack</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Document interpreted — select which questions to create as CIOS cases</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-400/10 text-indigo-400 border border-indigo-400/20">{decisionPack.documentType}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${confidenceColor(decisionPack.confidence)}`}>{decisionPack.confidence} confidence</span>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="text-[10px] uppercase tracking-wider text-blue-400/70 mb-1">Primary Decision</div>
          <div className="text-sm font-medium text-foreground leading-relaxed">{decisionPack.primaryDecision}</div>
        </div>

        {decisionPack.businessContext && (
          <div className="rounded-xl border border-border bg-muted/5 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Business Context</div>
            <div className="text-sm text-foreground/80 leading-relaxed">{decisionPack.businessContext}</div>
          </div>
        )}

        {decisionPack.secondaryDecisions.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Secondary Decision Threads</div>
            <div className="rounded-xl border border-border bg-muted/5 divide-y divide-border">
              {decisionPack.secondaryDecisions.map((d, i) => (
                <div key={i} className="px-4 py-2.5 text-sm text-foreground/80 flex items-start gap-2">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  {d}
                </div>
              ))}
            </div>
          </div>
        )}

        {decisionPack.requiredOutputs.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Required Outputs from Document</div>
            <div className="rounded-xl border border-border bg-muted/5 divide-y divide-border">
              {decisionPack.requiredOutputs.map((o, i) => (
                <div key={i} className="px-4 py-2.5 text-sm text-foreground/80 flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  {o}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Recommended CIOS Questions ({decisionPack.recommendedQuestions.length})
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allIndexes = new Set(decisionPack.recommendedQuestions.map((_, i) => i));
                  setSelectedQuestionIndexes(allIndexes);
                }}
                className="text-[10px] text-primary hover:text-primary/80"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelectedQuestionIndexes(new Set())}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {decisionPack.recommendedQuestions.map((q, i) => {
              const isSelected = selectedQuestionIndexes.has(i);
              return (
                <div
                  key={i}
                  onClick={() => toggleQuestionSelection(i)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-muted/5 hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground leading-relaxed">{q.text}</div>
                      <div className="text-xs text-muted-foreground mt-1.5">{q.rationale}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityColor(q.priority)}`}>{q.priority}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">{categoryLabel(q.category)}</span>
                        {q.suggestedSubject && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{q.suggestedSubject}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{q.suggestedTimeHorizon}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {decisionPack.missingInformation.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              Missing Information
            </div>
            <div className="rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10">
              {decisionPack.missingInformation.map((m, i) => (
                <div key={i} className="px-4 py-2.5 text-sm text-foreground/80">{m}</div>
              ))}
            </div>
          </div>
        )}

        {decisionPack.competitiveContext && (
          <div className="rounded-xl border border-border bg-muted/5 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Competitive Context</div>
            <div className="text-sm text-foreground/80">{decisionPack.competitiveContext}</div>
          </div>
        )}

        {decisionPack.targetAudiences.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Audiences:</span>
            {decisionPack.targetAudiences.map((a, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{a}</span>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              if (onMultiImport) {
                handleCreateSelectedQuestions();
              } else if (selectedQuestionIndexes.size > 0) {
                const q = decisionPack.recommendedQuestions[Array.from(selectedQuestionIndexes)[0]];
                onImportComplete({
                  question: {
                    text: q.text,
                    restatedQuestion: q.text,
                    subject: q.suggestedSubject || "",
                    outcome: "",
                    timeHorizon: q.suggestedTimeHorizon || "12 months",
                    questionType: "binary",
                    entities: [],
                    primaryConstraint: "",
                    decisionType: q.category,
                  },
                  signals: [],
                  missingSignals: [],
                  summary: decisionPack.businessContext || "",
                  confidence: decisionPack.confidence,
                } as any);
              }
            }}
            disabled={selectedQuestionIndexes.size === 0}
            className="flex-1 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {onMultiImport
              ? `Create ${selectedQuestionIndexes.size} Case${selectedQuestionIndexes.size !== 1 ? "s" : ""}`
              : "Create Case"
            }
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("upload");
              setDecisionPack(null);
              setSelectedQuestionIndexes(new Set());
            }}
            className="rounded-xl border border-border px-5 py-3 font-semibold text-foreground hover:bg-muted/20 inline-flex items-center gap-2"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Import Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <div className="text-center">
            <div className="text-sm font-medium text-foreground">
              Analyzing project materials...
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {selectedFiles.length > 1
                ? `Processing ${selectedFiles.length} files — extracting decision question, signals, and gaps`
                : "Extracting decision question, signals, and gaps"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "summary" && result) {
    const q = result.question;
    const caseType = result.suggestedCaseType || q.decisionType || "Decision";
    const confidence = result.confidence || "Moderate";
    const hasBundle = result.fileManifest && result.fileManifest.length > 1;

    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Ingestion Summary
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {result.lowConfidence && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Low Confidence Ingestion</div>
              <div className="text-xs text-amber-300/70 mt-0.5">Review extracted question and signals before confirming. Content was inferred from limited or poorly structured materials.</div>
            </div>
          </div>
        )}

        {hasBundle && result.fileManifest && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Files className="w-3 h-3" />
              Source Files ({result.fileManifest.length})
            </div>
            <div className="rounded-xl border border-border bg-muted/5 divide-y divide-border">
              {result.fileManifest.map((f, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {f.isImage ? <ImageIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" /> : <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    <span className="text-sm text-foreground truncate">{f.fileName}</span>
                    {result.primaryFile === f.fileName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">Primary</span>
                    )}
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded border shrink-0 ${confidenceColor(f.confidence)}`}>
                    {f.confidence}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Proposed Decision
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="text-sm font-medium text-foreground leading-relaxed">
              {q.restatedQuestion || q.text}
            </div>
          </div>
        </div>

        {result.environment && (() => {
          const envColors: Record<string, string> = {
            clinical_adoption: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
            operational_deployment: "text-amber-400 bg-amber-400/10 border-amber-400/30",
            regulatory_approval: "text-blue-400 bg-blue-400/10 border-blue-400/30",
            commercial_launch: "text-violet-400 bg-violet-400/10 border-violet-400/30",
            technology_implementation: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
          };
          const cls = envColors[result.environment!.context] || "text-primary bg-primary/10 border-primary/30";
          return (
            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${cls}`}>
              <div className="mt-0.5 w-2 h-2 rounded-full bg-current shrink-0" />
              <div>
                <div className="text-xs font-semibold">{result.environment!.label}</div>
                <div className="text-[11px] opacity-80 mt-0.5">{result.environment!.rationale}</div>
              </div>
            </div>
          );
        })()}

        {result.decisionArchetype && (
          <div className="rounded-xl border border-indigo-400/30 bg-indigo-400/5 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {result.decisionArchetype.documentType && result.decisionArchetype.documentType !== "Unknown" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/20">{result.decisionArchetype.documentType}</span>
              )}
              <div className="text-xs font-semibold text-indigo-400">{result.decisionArchetype.primary}</div>
              {result.decisionArchetype.secondary.length > 0 && (
                <div className="flex gap-1">
                  {result.decisionArchetype.secondary.map((s, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-400/10 text-indigo-300 border border-indigo-400/20">{s}</span>
                  ))}
                </div>
              )}
              {result.decisionArchetype.confidenceLevel && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                  result.decisionArchetype.confidenceLevel === "high" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" :
                  result.decisionArchetype.confidenceLevel === "moderate" ? "text-amber-400 bg-amber-400/10 border-amber-400/20" :
                  "text-red-400 bg-red-400/10 border-red-400/20"
                }`}>{result.decisionArchetype.confidenceLevel}</span>
              )}
              {result.decisionArchetype.alternativeArchetype && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">alt: {result.decisionArchetype.alternativeArchetype}</span>
              )}
            </div>
            {result.decisionArchetype.framing && (
              <div className="text-[11px] text-indigo-300/80">{result.decisionArchetype.framing}</div>
            )}
            {result.decisionArchetype.secondaryDecisions && result.decisionArchetype.secondaryDecisions.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Secondary Decisions</div>
                {result.decisionArchetype.secondaryDecisions.map((d, i) => (
                  <div key={i} className="text-[11px] text-slate-300 pl-2 border-l border-indigo-400/20">{d}</div>
                ))}
              </div>
            )}
            {result.decisionArchetype.evidenceSpans && result.decisionArchetype.evidenceSpans.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Why we classified it this way</div>
                {result.decisionArchetype.evidenceSpans.map((span, i) => (
                  <div key={i} className="text-[11px] text-indigo-300/70 pl-2 border-l border-indigo-400/20 italic">"{span}"</div>
                ))}
              </div>
            )}
            {result.decisionArchetype.confidenceRationale && (
              <div className="text-[10px] text-slate-400 italic">{result.decisionArchetype.confidenceRationale}</div>
            )}
            {result.decisionArchetype.guardrailApplied && result.decisionArchetype.guardrailReason && (
              <div className="text-[10px] text-amber-400/90 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {result.decisionArchetype.guardrailReason}
              </div>
            )}
          </div>
        )}

        {result.contradictions && result.contradictions.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-orange-400" />
              Cross-File Contradictions
            </div>
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 divide-y divide-orange-500/10">
              {result.contradictions.map((c, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="text-sm text-foreground">{c.description}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {c.file_a} vs {c.file_b}
                    {c.resolution_suggestion && <span className="ml-2 text-orange-400">— {c.resolution_suggestion}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.signals.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Signals Found
            </div>
            <div className="rounded-xl border border-border bg-muted/5 divide-y divide-border">
              {result.signals.map((s, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">{s.text}</div>
                    {s.source_file && hasBundle && (
                      <div className="text-[10px] text-muted-foreground mt-1">Source: {s.source_file}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.missingSignals.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Search className="w-3 h-3" />
              Signals to Investigate
            </div>
            <div className="rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10">
              {result.missingSignals.map((s, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <div className="text-sm text-foreground">{s.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Suggested Case Type
            </div>
            <div className="rounded-lg border border-border bg-muted/10 px-3 py-2">
              <span className="text-sm font-medium text-foreground">{caseType}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Confidence
            </div>
            <div className={`rounded-lg border px-3 py-2 ${confidenceColor(confidence)}`}>
              <span className="text-sm font-medium">{confidence}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => onImportComplete(result)}
            className="flex-1 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-2"
          >
            Confirm and Continue
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("upload");
              setResult(null);
              clearFiles();
              setPasteText("");
            }}
            className="rounded-xl border border-border px-5 py-3 font-semibold text-foreground hover:bg-muted/20 inline-flex items-center gap-2"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} tabIndex={-1} className="rounded-2xl border border-border bg-card p-6 space-y-5 outline-none">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Import Project
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload files, drag in images, or paste text. Drop multiple files to analyze them as a bundle.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        onDrop={handleFileDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
          dragOver
            ? "border-primary bg-primary/5"
            : selectedFiles.length > 0
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-border hover:border-muted-foreground/50"
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="*/*"
          multiple
          onChange={handleFileSelect}
        />
        {selectedFiles.length > 0 ? (
          <div className="space-y-2" onClick={e => e.stopPropagation()}>
            {selectedFiles.map((file, i) => {
              const key = file.name + file.size;
              const preview = imagePreviews[key];
              return (
                <div key={key} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/10">
                  {preview ? (
                    <img src={preview} alt="" className="w-8 h-8 rounded object-cover border border-border shrink-0" />
                  ) : (
                    <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {file.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB — {getFileTypeLabel(file)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-primary hover:text-primary/80 mt-2"
            >
              + Add more files
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <div className="text-sm text-foreground font-medium">
              Drop files or images here, or click to browse
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              PDF, Word (.doc/.docx), PowerPoint (.ppt/.pptx), Excel, CSV, JPG, PNG, or text
            </div>
            <div className="text-[11px] text-muted-foreground/60 mt-2">
              Drop multiple files to analyze as a bundle — Ctrl+V to paste images or text
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs text-muted-foreground">
            or paste text
          </span>
        </div>
      </div>

      <textarea
        value={pasteText}
        onChange={(e) => {
          setPasteText(e.target.value);
          if (e.target.value.trim() && selectedFiles.length === 0) {
          }
        }}
        placeholder="Paste an email, RFP, meeting notes, market summary, or any project materials..."
        rows={5}
        className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none"
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={processImport}
          disabled={selectedFiles.length === 0 && !pasteText.trim()}
          className="flex-1 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {selectedFiles.length > 1 ? (
            <>
              <Files className="w-4 h-4" />
              Analyze Bundle ({selectedFiles.length} files)
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Analyze Materials
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-border px-5 py-3 font-semibold text-foreground hover:bg-muted/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
