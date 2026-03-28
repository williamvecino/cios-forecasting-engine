import { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  Download,
} from "lucide-react";
import {
  processWorkbook,
  type ImportResult,
} from "@/lib/workbook/importSignalsFromWorkbook";

interface WorkbookImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: (signals: any[]) => void;
}

export function WorkbookImportDialog({
  open,
  onClose,
  onImportComplete,
}: WorkbookImportDialogProps) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setImportResult({
        success: false,
        signals: [],
        totalImported: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        warnings: [],
        errors: ["File must be an Excel workbook (.xlsx)"],
      });
      setStep("review");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      const result = processWorkbook(data, file.name);
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
    if (!importResult?.signals) return;
    onImportComplete(importResult.signals);
    setStep("done");
  }

  function handleClose() {
    setStep("upload");
    setImportResult(null);
    setShowWarnings(false);
    onClose();
  }

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
              <p className="text-xs text-slate-500">Reads CIOS_Signal_Export sheet, ActiveFlag = Yes only</p>
              <div className="mt-3 flex items-center justify-center gap-4">
                <a
                  href={`${import.meta.env.BASE_URL}workbooks/MIOS_BAOS_Calibration_20_Signals.xlsx`}
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Calibration (20 signals)
                </a>
                <a
                  href={`${import.meta.env.BASE_URL}workbooks/ARIKAYCE_Analog_10_Signals.xlsx`}
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  ARIKAYCE Analog (10 signals)
                </a>
              </div>
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

          {step === "review" && importResult?.success && (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">
                    {importResult.totalImported} active signal{importResult.totalImported !== 1 ? "s" : ""} found
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                      <span className="text-xl font-bold text-emerald-400">{importResult.positiveCount}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">Positive</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <ArrowDownRight className="w-3 h-3 text-rose-400" />
                      <span className="text-xl font-bold text-rose-400">{importResult.negativeCount}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">Negative</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Minus className="w-3 h-3 text-slate-400" />
                      <span className="text-xl font-bold text-slate-400">{importResult.neutralCount}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">Neutral</div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {importResult.signals.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {s.direction === "positive" ? (
                        <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : s.direction === "negative" ? (
                        <ArrowDownRight className="w-3 h-3 text-rose-400 shrink-0" />
                      ) : (
                        <Minus className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <span className="text-slate-200 flex-1 truncate">{s.text}</span>
                      <span className="text-[10px] text-slate-500">{s.strength}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3">
                <p className="text-[11px] text-slate-400">
                  This will <span className="text-white font-medium">replace</span> all existing signals with the {importResult.totalImported} imported signals, then run the forecast.
                </p>
              </div>

              {importResult.warnings.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowWarnings(!showWarnings)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 cursor-pointer"
                  >
                    <Info className="w-3 h-3" />
                    {importResult.warnings.length} warning{importResult.warnings.length > 1 ? "s" : ""}
                    {showWarnings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showWarnings && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {importResult.warnings.map((w, i) => (
                        <div key={i} className="text-[11px] text-amber-300/60 pl-4">{w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep("upload"); setImportResult(null); }}
                  className="flex-1 rounded-lg border border-slate-600 px-4 py-2.5 text-xs font-medium text-slate-300 hover:border-slate-500 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2.5 text-xs font-bold text-white transition-colors cursor-pointer"
                >
                  Replace & Import ({importResult.totalImported})
                </button>
              </div>
            </div>
          )}

          {step === "done" && importResult && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <div>
                <p className="text-sm font-bold text-white">Import Complete</p>
                <p className="text-xs text-slate-400 mt-1">
                  {importResult.totalImported} signals replaced. Forecast will run with imported data.
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
