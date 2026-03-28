import { useState, useRef, useCallback } from "react";
import { Upload, FileSpreadsheet, FileText, FileJson, AlertTriangle, CheckCircle2, X, ArrowRight, Image, FileType, Loader2, Crosshair } from "lucide-react";
import { parseFile, type ImportPreview, type ImportedRow } from "@/lib/data-import";

const API = import.meta.env.VITE_API_URL || "";

interface DetectedEnvironment {
  context: string;
  label: string;
  rationale: string;
}

const ENV_COLORS: Record<string, string> = {
  clinical_adoption: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  operational_deployment: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  regulatory_approval: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  commercial_launch: "text-violet-400 bg-violet-400/10 border-violet-400/30",
  technology_implementation: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
};

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function isStructuredDataFile(file: File): boolean {
  return /\.(csv|tsv|xlsx|xls|json)$/i.test(file.name);
}

interface DataImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ImportedRow[]) => void;
  activeQuestion?: string;
}

type ImportMode = "upload" | "paste";

export default function DataImportDialog({ open, onClose, onImport, activeQuestion }: DataImportDialogProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<ImportMode>("upload");
  const [pasteText, setPasteText] = useState("");
  const [aiSignals, setAiSignals] = useState<ImportedRow[] | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [detectedEnv, setDetectedEnv] = useState<DetectedEnvironment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleStructuredFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      const result = await parseFile(file);
      if (result.rows.length === 0) {
        setError("No signal data found in the file. Make sure it has a column with signal descriptions.");
        setPreview(null);
      } else {
        setPreview(result);
      }
    } catch (err: any) {
      setError(err.message || "Failed to parse file");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUnstructuredFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);
    if (isImageFile(file)) {
      setImagePreview(URL.createObjectURL(file));
    }
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (activeQuestion) formData.append("question", activeQuestion);
      const resp = await fetch(`${API}/api/import-project/analyze`, {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) throw new Error("Analysis failed");
      const data = await resp.json();
      if (data.environment) setDetectedEnv(data.environment);
      const signals: ImportedRow[] = (data.signals || []).map((s: any) => ({
        text: s.text || s.signal || "",
        direction: s.direction === "Supports" || s.direction === "positive" ? "positive"
          : s.direction === "Slows" || s.direction === "negative" ? "negative" : "neutral",
        strength: s.importance || "Medium",
        reliability: s.confidence === "Strong" ? "Confirmed" : s.confidence === "Weak" ? "Speculative" : "Probable",
        category: s.category || "general",
        source_url: s.source_description || file.name,
        signal_source: (s.signal_source === "internal" || s.signal_source === "external" || s.signal_source === "missing") ? s.signal_source : undefined,
      }));
      if (signals.length === 0) {
        setError("No signals could be extracted from this file.");
      } else {
        setAiSignals(signals);
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze file");
    } finally {
      setLoading(false);
    }
  }, [activeQuestion]);

  const handleFile = useCallback(async (file: File) => {
    setPreview(null);
    setAiSignals(null);
    setImagePreview(null);
    if (isStructuredDataFile(file)) {
      await handleStructuredFile(file);
    } else {
      await handleUnstructuredFile(file);
    }
  }, [handleStructuredFile, handleUnstructuredFile]);

  const handlePasteAnalyze = useCallback(async () => {
    if (!pasteText.trim()) return;
    setLoading(true);
    setError(null);
    setFileName("Pasted text");
    try {
      const resp = await fetch(`${API}/api/import-project/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText.trim(), question: activeQuestion || "" }),
      });
      if (!resp.ok) throw new Error("Analysis failed");
      const data = await resp.json();
      if (data.environment) setDetectedEnv(data.environment);
      const signals: ImportedRow[] = (data.signals || []).map((s: any) => ({
        text: s.text || s.signal || "",
        direction: s.direction === "Supports" || s.direction === "positive" ? "positive"
          : s.direction === "Slows" || s.direction === "negative" ? "negative" : "neutral",
        strength: s.importance || "Medium",
        reliability: s.confidence === "Strong" ? "Confirmed" : s.confidence === "Weak" ? "Speculative" : "Probable",
        category: s.category || "general",
        source_url: s.source_description || "Pasted text",
        signal_source: (s.signal_source === "internal" || s.signal_source === "external" || s.signal_source === "missing") ? s.signal_source : undefined,
      }));
      if (signals.length === 0) {
        setError("No signals could be extracted from the text.");
      } else {
        setAiSignals(signals);
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze text");
    } finally {
      setLoading(false);
    }
  }, [pasteText, activeQuestion]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirmImport = () => {
    if (preview) {
      onImport(preview.rows);
    } else if (aiSignals) {
      onImport(aiSignals);
    }
    setPreview(null);
    setAiSignals(null);
    setFileName("");
    setImagePreview(null);
    onClose();
  };

  const resetState = () => {
    setPreview(null);
    setAiSignals(null);
    setFileName("");
    setError(null);
    setDetectedEnv(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const importableSignals = preview?.rows || aiSignals;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import Data</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload files, images, or paste text to add signals
            </p>
          </div>
          <button onClick={() => { resetState(); onClose(); }} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!importableSignals && !loading && !error && (
            <>
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setMode("upload")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === "upload" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground border border-transparent"}`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setMode("paste")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === "paste" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground border border-transparent"}`}
                >
                  Paste Text
                </button>
              </div>

              {mode === "upload" ? (
                <>
                  <div
                    className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                      dragOver
                        ? "border-blue-400 bg-blue-500/10"
                        : "border-border hover:border-muted-foreground/40"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <div className="text-sm text-foreground font-medium mb-1">
                      Drop a file here or click to browse
                    </div>
                    <div className="text-xs text-muted-foreground mb-4">
                      PDF, PPTX, Excel, CSV, JSON, JPG, PNG, TXT
                    </div>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Choose File
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="*/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <div className="mt-6 grid grid-cols-5 gap-3">
                    <div className="rounded-xl border border-border bg-muted/5 p-3 text-center">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
                      <div className="text-xs font-medium text-foreground">Excel</div>
                      <div className="text-[10px] text-muted-foreground">.xlsx, .xls</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/5 p-3 text-center">
                      <FileText className="w-5 h-5 text-blue-400 mx-auto mb-1.5" />
                      <div className="text-xs font-medium text-foreground">CSV</div>
                      <div className="text-[10px] text-muted-foreground">.csv, .tsv</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/5 p-3 text-center">
                      <FileType className="w-5 h-5 text-red-400 mx-auto mb-1.5" />
                      <div className="text-xs font-medium text-foreground">PDF</div>
                      <div className="text-[10px] text-muted-foreground">.pdf</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/5 p-3 text-center">
                      <FileText className="w-5 h-5 text-orange-400 mx-auto mb-1.5" />
                      <div className="text-xs font-medium text-foreground">PPTX</div>
                      <div className="text-[10px] text-muted-foreground">.pptx, .docx</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/5 p-3 text-center">
                      <Image className="w-5 h-5 text-violet-400 mx-auto mb-1.5" />
                      <div className="text-xs font-medium text-foreground">Images</div>
                      <div className="text-[10px] text-muted-foreground">.jpg, .png</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-muted/5 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Compatible data sources
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {["Veeva CRM", "Veeva Vault", "IQVIA", "Salesforce", "Power BI", "Tableau", "Market Research", "Custom Exports"].map((src) => (
                        <span key={src} className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                          {src}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste text content here — meeting notes, reports, research summaries, competitive intelligence..."
                    rows={8}
                    className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handlePasteAnalyze}
                    disabled={!pasteText.trim()}
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    Analyze Text
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}

          {loading && (
            <div className="py-16 text-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">Analyzing {fileName}...</div>
              <div className="text-xs text-muted-foreground/60 mt-1">Extracting signals from your content</div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-red-300">{error}</div>
                <button
                  onClick={resetState}
                  className="mt-2 text-xs text-blue-400 hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-sm font-medium text-foreground">{fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {preview.rows.length} signal{preview.rows.length !== 1 ? "s" : ""} detected from {preview.totalRows} row{preview.totalRows !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {preview.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-border bg-muted/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Column mapping
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(preview.mappedFields).map(([field, col]) => (
                    <div key={field} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground capitalize">{field}:</span>
                      <span className="text-foreground font-medium">{col}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/10 px-3 py-2 border-b border-border">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Preview (first {Math.min(preview.rows.length, 5)})
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <div key={i} className="px-3 py-2.5">
                      <div className="text-xs text-foreground">{row.text}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[10px] font-medium ${
                          row.direction === "positive" ? "text-emerald-400" :
                          row.direction === "negative" ? "text-red-400" : "text-slate-400"
                        }`}>
                          {row.direction === "positive" ? "Supports" : row.direction === "negative" ? "Slows" : "Neutral"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Importance: {row.strength || "Medium"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Confidence: {row.reliability === "Confirmed" ? "Strong" : row.reliability === "Speculative" ? "Weak" : "Moderate"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {preview.rows.length > 5 && (
                  <div className="px-3 py-2 bg-muted/5 text-center text-[10px] text-muted-foreground">
                    + {preview.rows.length - 5} more signal{preview.rows.length - 5 !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          )}

          {aiSignals && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-sm font-medium text-foreground">{fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {aiSignals.length} signal{aiSignals.length !== 1 ? "s" : ""} extracted
                  </div>
                </div>
              </div>

              {detectedEnv && (
                <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${ENV_COLORS[detectedEnv.context] || "text-slate-400 bg-slate-400/10 border-slate-400/30"}`}>
                  <Crosshair className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold">{detectedEnv.label}</div>
                    <div className="text-[11px] opacity-80 mt-0.5">{detectedEnv.rationale}</div>
                  </div>
                </div>
              )}

              {imagePreview && (
                <div className="rounded-xl border border-border bg-muted/5 p-3 flex justify-center">
                  <img src={imagePreview} alt="Uploaded" className="max-h-32 rounded-lg object-contain" />
                </div>
              )}

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/10 px-3 py-2 border-b border-border">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Extracted signals (first {Math.min(aiSignals.length, 5)})
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {aiSignals.slice(0, 5).map((row, i) => (
                    <div key={i} className="px-3 py-2.5">
                      <div className="text-xs text-foreground">{row.text}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[10px] font-medium ${
                          row.direction === "positive" ? "text-emerald-400" :
                          row.direction === "negative" ? "text-red-400" : "text-slate-400"
                        }`}>
                          {row.direction === "positive" ? "Supports" : row.direction === "negative" ? "Slows" : "Neutral"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Importance: {row.strength || "Medium"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {aiSignals.length > 5 && (
                  <div className="px-3 py-2 bg-muted/5 text-center text-[10px] text-muted-foreground">
                    + {aiSignals.length - 5} more signal{aiSignals.length - 5 !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {importableSignals && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <button
              onClick={resetState}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Try Different Source
            </button>
            <button
              onClick={handleConfirmImport}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              Import {importableSignals.length} Signal{importableSignals.length !== 1 ? "s" : ""}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
