import { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Info,
  X,
} from "lucide-react";
import {
  processWorkbook,
  checkQuestionAlignment,
  applyImport,
  type ImportResult,
  type ImportMode,
} from "@/lib/workbook/importSignalsFromWorkbook";

interface WorkbookImportDialogProps {
  open: boolean;
  onClose: () => void;
  activeQuestionText: string;
  existingSignals: any[];
  onImportComplete: (signals: any[]) => void;
}

export function WorkbookImportDialog({
  open,
  onClose,
  activeQuestionText,
  existingSignals,
  onImportComplete,
}: WorkbookImportDialogProps) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("replace");
  const [showWarnings, setShowWarnings] = useState(false);
  const [questionMismatchAck, setQuestionMismatchAck] = useState(false);
  const [readinessAck, setReadinessAck] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setImportResult({
        success: false,
        parseResult: { success: false, fileName: file.name, programs: [], activeProgram: null, signals: [], readinessChecks: [], traceRows: [], warnings: [], errors: ["File must be an Excel workbook (.xlsx)"] },
        normalizedSignals: [],
        summary: null,
        errors: ["File must be an Excel workbook (.xlsx)"],
        questionMismatch: false,
        questionMismatchDetail: null,
      });
      setStep("review");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      const result = processWorkbook(data, file.name);

      if (result.success && result.summary) {
        const { mismatch, detail } = checkQuestionAlignment(
          result.summary.strategicQuestion,
          activeQuestionText,
        );
        result.questionMismatch = mismatch;
        result.questionMismatchDetail = detail;
      }

      setImportResult(result);
      setStep("review");
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleConfirm() {
    if (!importResult?.normalizedSignals) return;
    const merged = applyImport(importMode, existingSignals, importResult.normalizedSignals);
    onImportComplete(merged);
    setStep("done");
  }

  function handleClose() {
    setStep("upload");
    setImportResult(null);
    setQuestionMismatchAck(false);
    setReadinessAck(false);
    onClose();
  }

  const needsReadinessAck = importResult?.summary && !importResult.summary.readinessAllPassed && !readinessAck;
  const needsQuestionAck = importResult?.questionMismatch && !questionMismatchAck;
  const canConfirm = importResult?.success && !needsReadinessAck && !needsQuestionAck;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-violet-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Import MIOS / BAOS Signals</h2>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {step === "upload" && (
            <div
              className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
                dragOver ? "border-violet-400 bg-violet-500/10" : "border-slate-600 hover:border-slate-500"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-sm text-slate-300 mb-1">Drop your MIOS/BAOS workbook here</p>
              <p className="text-xs text-slate-500">or click to browse (.xlsx)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {step === "review" && importResult && !importResult.success && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="w-5 h-5" />
                <span className="text-sm font-bold">Import Failed</span>
              </div>
              {importResult.errors.map((err, i) => (
                <div key={i} className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">{err}</div>
              ))}
              <button onClick={() => { setStep("upload"); setImportResult(null); }} className="text-xs text-violet-400 hover:text-violet-300 cursor-pointer">
                Try another file
              </button>
            </div>
          )}

          {step === "review" && importResult?.success && importResult.summary && (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">Workbook Parsed Successfully</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-slate-400">Program</div>
                  <div className="text-white font-medium">{importResult.summary.programId}</div>
                  <div className="text-slate-400">Brand</div>
                  <div className="text-white font-medium">{importResult.summary.brand}</div>
                  <div className="text-slate-400">Strategic question</div>
                  <div className="text-white font-medium text-[11px] leading-relaxed">{importResult.summary.strategicQuestion}</div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signal Summary</div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{importResult.summary.totalImported}</div>
                    <div className="text-[10px] text-slate-500">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{importResult.summary.positiveCount}</div>
                    <div className="text-[10px] text-slate-500">Positive</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-rose-400">{importResult.summary.negativeCount}</div>
                    <div className="text-[10px] text-slate-500">Negative</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-400">{importResult.summary.neutralCount}</div>
                    <div className="text-[10px] text-slate-500">Neutral</div>
                  </div>
                </div>

                {importResult.summary.topByRank.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-slate-500 uppercase">Top signals by rank</div>
                    {importResult.summary.topByRank.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-mono w-4">{i + 1}.</span>
                        {s.direction === "positive" ? (
                          <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : s.direction === "negative" ? (
                          <ArrowDownRight className="w-3 h-3 text-rose-400 shrink-0" />
                        ) : (
                          <Minus className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                        <span className="text-slate-200 flex-1 truncate">{s.label}</span>
                        <span className="text-[10px] text-slate-500">{s.strength}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {importResult.questionMismatch && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">Question Mismatch</span>
                  </div>
                  <p className="text-[11px] text-amber-200/70 leading-relaxed whitespace-pre-line">{importResult.questionMismatchDetail}</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={questionMismatchAck} onChange={(e) => setQuestionMismatchAck(e.target.checked)} className="rounded border-amber-500/30" />
                    <span className="text-xs text-amber-300">Import anyway</span>
                  </label>
                </div>
              )}

              {!importResult.summary.readinessAllPassed && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">Readiness Warning</span>
                  </div>
                  <div className="space-y-1">
                    {importResult.summary.readinessChecks.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {c.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-400" />
                        )}
                        <span className={c.passed ? "text-slate-300" : "text-red-300"}>{c.rule}</span>
                      </div>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={readinessAck} onChange={(e) => setReadinessAck(e.target.checked)} className="rounded border-amber-500/30" />
                    <span className="text-xs text-amber-300">Continue anyway</span>
                  </label>
                </div>
              )}

              {importResult.summary.warningCount > 0 && (
                <div>
                  <button
                    onClick={() => setShowWarnings(!showWarnings)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 cursor-pointer"
                  >
                    <Info className="w-3 h-3" />
                    {importResult.summary.warningCount} import warning{importResult.summary.warningCount > 1 ? "s" : ""}
                    {showWarnings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showWarnings && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {importResult.summary.warnings.map((w, i) => (
                        <div key={i} className="text-[11px] text-amber-300/60 pl-4">{w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Import Mode</div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setImportMode("replace")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      importMode === "replace"
                        ? "border-violet-500 bg-violet-500/15 text-violet-300"
                        : "border-slate-600 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    Replace
                    <div className="text-[10px] text-slate-500 mt-0.5">Clear & import fresh</div>
                  </button>
                  <button
                    onClick={() => setImportMode("merge")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      importMode === "merge"
                        ? "border-violet-500 bg-violet-500/15 text-violet-300"
                        : "border-slate-600 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    Merge
                    <div className="text-[10px] text-slate-500 mt-0.5">Keep manual signals</div>
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep("upload"); setImportResult(null); }}
                  className="flex-1 rounded-lg border border-slate-600 px-4 py-2.5 text-xs font-medium text-slate-300 hover:border-slate-500 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                    canConfirm
                      ? "bg-violet-600 hover:bg-violet-500 text-white"
                      : "bg-slate-700 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  Confirm Import ({importResult.summary.totalImported} signals)
                </button>
              </div>
            </div>
          )}

          {step === "done" && importResult?.summary && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <div>
                <p className="text-sm font-bold text-white">Import Complete</p>
                <p className="text-xs text-slate-400 mt-1">
                  {importResult.summary.totalImported} signals imported from {importResult.summary.brand} — {importResult.summary.programId}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg bg-violet-600 hover:bg-violet-500 px-6 py-2.5 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
