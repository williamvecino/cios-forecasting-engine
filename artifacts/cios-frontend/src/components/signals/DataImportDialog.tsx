import { useState, useRef, useCallback } from "react";
import { Upload, FileSpreadsheet, FileText, FileJson, AlertTriangle, CheckCircle2, X, ArrowRight } from "lucide-react";
import { parseFile, type ImportPreview, type ImportedRow } from "@/lib/data-import";

interface DataImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ImportedRow[]) => void;
}

export default function DataImportDialog({ open, onClose, onImport }: DataImportDialogProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirmImport = () => {
    if (preview) {
      onImport(preview.rows);
      setPreview(null);
      setFileName("");
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import Data</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload CSV, Excel, or JSON files to add signals
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!preview && !loading && (
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
                  Supports CSV, Excel (.xlsx), and JSON
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
                  accept=".csv,.tsv,.xlsx,.xls,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
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
                  <FileJson className="w-5 h-5 text-amber-400 mx-auto mb-1.5" />
                  <div className="text-xs font-medium text-foreground">JSON</div>
                  <div className="text-[10px] text-muted-foreground">.json</div>
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
          )}

          {loading && (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">Reading {fileName}...</div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-red-300">{error}</div>
                <button
                  onClick={() => { setError(null); setPreview(null); setFileName(""); }}
                  className="mt-2 text-xs text-blue-400 hover:underline"
                >
                  Try another file
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
        </div>

        {preview && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <button
              onClick={() => { setPreview(null); setFileName(""); }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Choose Different File
            </button>
            <button
              onClick={handleConfirmImport}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              Import {preview.rows.length} Signal{preview.rows.length !== 1 ? "s" : ""}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
