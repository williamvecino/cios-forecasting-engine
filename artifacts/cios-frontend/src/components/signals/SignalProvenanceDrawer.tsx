import { X, FileSpreadsheet, Info } from "lucide-react";
import type { WorkbookMeta } from "@/lib/workbook/normalizeCiosSignals";

interface SignalProvenanceDrawerProps {
  open: boolean;
  onClose: () => void;
  signalLabel: string;
  meta: WorkbookMeta;
}

export function SignalProvenanceDrawer({ open, onClose, signalLabel, meta }: SignalProvenanceDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-slate-900 border-l border-slate-700 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-violet-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Signal Provenance</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Signal</div>
            <p className="text-sm text-white font-medium leading-relaxed">{signalLabel}</p>
          </div>

          <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source</div>
            <div className="space-y-1.5">
              <ProvenanceField label="Workbook" value={meta.sourceWorkbook} />
              <ProvenanceField label="Sheet" value="CIOS_Signal_Export" />
              <ProvenanceField label="Program" value={meta.programId} />
            </div>
          </div>

          {meta.whyItMatters && (
            <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Info className="w-3 h-3 text-indigo-400" />
                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Why It Matters</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{meta.whyItMatters}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProvenanceField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider whitespace-nowrap w-24 shrink-0">{label}</span>
      <span className="text-xs text-slate-200">{value}</span>
    </div>
  );
}
