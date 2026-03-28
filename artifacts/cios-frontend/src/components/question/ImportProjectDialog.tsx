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
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PowerPoint",
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
  ".docx",
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

interface ImportResult {
  question: ExtractedQuestion;
  signals: ExtractedSignal[];
  missingSignals: MissingSignal[];
  suggestedCaseType?: string;
  confidence?: string;
  summary: string;
  environment?: DetectedEnvironment;
  lowConfidence?: boolean;
}

interface Props {
  onImportComplete: (result: ImportResult) => void;
  onClose: () => void;
  initialFile?: File | null;
}

type ImportPhase = "upload" | "processing" | "summary";

const confidenceColor = (c: string) => {
  const lower = c.toLowerCase();
  if (lower === "high") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (lower === "moderate") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
};

function isImageType(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
}

export default function ImportProjectDialog({ onImportComplete, onClose, initialFile }: Props) {
  const [phase, setPhase] = useState<ImportPhase>("upload");
  const [pasteText, setPasteText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(() => {
    if (initialFile && isImageType(initialFile)) return URL.createObjectURL(initialFile);
    return null;
  });
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const selectFile = useCallback((file: File) => {
    setSelectedFile(file);
    setPasteText("");
    setError(null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return isImageType(file) ? URL.createObjectURL(file) : null;
    });
  }, []);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const imagePreviewRef = useRef(imagePreview);
  imagePreviewRef.current = imagePreview;
  useEffect(() => {
    return () => {
      if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current);
    };
  }, []);

  const isValidFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError("File is too large. Maximum file size is 10 MB.");
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
      const file = e.dataTransfer.files[0];
      if (file && isValidFile(file)) {
        selectFile(file);
      } else {
        setError(
          "Unsupported file type. Please upload PDF, Word, PowerPoint, Excel, CSV, images, or text files.",
        );
      }
    },
    [selectFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidFile(file)) {
      selectFile(file);
    }
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
              selectFile(named);
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
        clearFile();
      }
    };

    const el = containerRef.current;
    if (el) {
      el.addEventListener("paste", handlePaste);
      return () => el.removeEventListener("paste", handlePaste);
    }
  }, [phase, selectFile, clearFile]);

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

  const processImport = async () => {
    setPhase("processing");
    setError(null);

    try {
      let body: Record<string, string> = {};

      if (selectedFile) {
        const base64 = await fileToBase64(selectedFile);
        body = {
          fileBase64: base64,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
        };
      } else if (pasteText.trim()) {
        body = { text: pasteText.trim() };
      } else {
        setError("Please upload a file or paste text to import.");
        setPhase("upload");
        return;
      }

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
    } catch (err: any) {
      console.error("Import failed:", err);
      setError(
        err.message ||
          "Failed to analyze the project materials. Please try again.",
      );
      setPhase("upload");
    }
  };

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
              Extracting decision question, signals, and gaps
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

    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
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

        {result.signals.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Signals Found
            </div>
            <div className="rounded-xl border border-border bg-muted/5 divide-y divide-border">
              {result.signals.map((s, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  <div className="text-sm text-foreground">{s.text}</div>
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
              clearFile();
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
            Upload files, drag in images, or paste text. We will extract the decision
            question and signals automatically.
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
            : selectedFile
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
          onChange={handleFileSelect}
        />
        {selectedFile && imagePreview ? (
          <div className="flex flex-col items-center gap-3">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-32 max-w-full rounded-lg border border-border object-contain"
            />
            <div className="flex items-center gap-3">
              <ImageIcon className="w-5 h-5 text-emerald-400" />
              <div className="text-left">
                <div className="text-sm font-medium text-foreground">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(0)} KB — Image
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="w-6 h-6 text-emerald-400" />
            <div className="text-left">
              <div className="text-sm font-medium text-foreground">
                {selectedFile.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(0)} KB —{" "}
                {ACCEPTED_TYPES[selectedFile.type] || "Document"}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="ml-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <div className="text-sm text-foreground font-medium">
              Drop a file or image here, or click to browse
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              PDF, Word, Excel, CSV, JPG, PNG, or text files
            </div>
            <div className="text-[11px] text-muted-foreground/60 mt-2">
              You can also paste text or images with Ctrl+V
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
          if (e.target.value.trim()) clearFile();
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
          disabled={!selectedFile && !pasteText.trim()}
          className="flex-1 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          Analyze Materials
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
