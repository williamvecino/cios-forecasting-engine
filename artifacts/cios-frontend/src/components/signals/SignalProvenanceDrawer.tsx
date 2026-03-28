import { X, FileSpreadsheet, ArrowRight, Link2, Info } from "lucide-react";
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

          <div className="grid grid-cols-1 gap-3">
            <ProvenanceField label="Signal ID" value={meta.signalId} />
            <ProvenanceField label="Source Layer" value={meta.sourceLayer} />
            <ProvenanceField label="Source Reference" value={meta.sourceReference} />
            <ProvenanceField label="Category" value={meta.signalCategory} />
            <ProvenanceField label="Forecast Domain" value={meta.forecastDomain} />
            {meta.rank != null && <ProvenanceField label="Rank" value={String(meta.rank)} />}
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

          <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source</div>
            <div className="grid grid-cols-1 gap-1.5">
              <ProvenanceField label="Workbook" value={meta.sourceWorkbook} />
              <ProvenanceField label="Sheet" value={meta.sourceSheet} />
              <ProvenanceField label="Program" value={meta.programId} />
              <ProvenanceField label="Brand" value={meta.brand} />
            </div>
          </div>

          {meta.traceability && (
            <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-4 space-y-3">
              <div className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">Traceability Chain</div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                {meta.traceability.bridgeId && (
                  <>
                    <span className="rounded bg-slate-700 px-2 py-1 text-violet-300 font-mono">{meta.traceability.bridgeId}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </>
                )}
                {meta.traceability.statementId && (
                  <>
                    <span className="rounded bg-slate-700 px-2 py-1 text-blue-300 font-mono">{meta.traceability.statementId}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </>
                )}
                {meta.traceability.evidenceId && (
                  <>
                    <span className="rounded bg-slate-700 px-2 py-1 text-emerald-300 font-mono">{meta.traceability.evidenceId}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </>
                )}
                {meta.traceability.baosId && (
                  <>
                    <span className="rounded bg-slate-700 px-2 py-1 text-amber-300 font-mono">{meta.traceability.baosId}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </>
                )}
                <span className="rounded bg-slate-700 px-2 py-1 text-white font-mono">{meta.signalId}</span>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                <ProvenanceField label="Trace Status" value={meta.traceability.traceStatus} />
                {meta.traceability.notes && <ProvenanceField label="Notes" value={meta.traceability.notes} />}
              </div>
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
