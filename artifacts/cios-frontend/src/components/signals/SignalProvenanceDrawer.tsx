import { X, FileSpreadsheet, Info, Globe, User, Radar, Upload, Layers, Cpu } from "lucide-react";
import type { WorkbookMeta } from "@/lib/workbook/normalizeCiosSignals";

interface ProvenanceData {
  sourceLayer: "manual" | "workbook" | "external" | "scout" | "gating" | "import" | "system";
  sourceReference: string;
  sourceType: string;
  originatingFile?: string;
  programId?: string;
  signalId?: string;
  bridgeId?: string;
  statementId?: string;
  evidenceId?: string;
  observedDate?: string | null;
  sourceUrl?: string | null;
  citationExcerpt?: string | null;
  agentName?: string;
  whyItMatters?: string;
}

interface SignalProvenanceDrawerProps {
  open: boolean;
  onClose: () => void;
  signalLabel: string;
  meta?: WorkbookMeta;
  provenance?: ProvenanceData;
  signalDirection?: string;
  signalStrength?: string;
  signalConfidence?: string;
  signalCategory?: string;
}

const LAYER_CONFIG: Record<string, { icon: typeof Globe; label: string; color: string }> = {
  manual: { icon: User, label: "Manual Entry", color: "text-blue-400" },
  workbook: { icon: FileSpreadsheet, label: "MIOS/BAOS Workbook", color: "text-violet-400" },
  external: { icon: Globe, label: "External Source", color: "text-amber-400" },
  scout: { icon: Radar, label: "External Signal Scout", color: "text-blue-400" },
  gating: { icon: Layers, label: "Decision Gating Agent", color: "text-cyan-400" },
  import: { icon: Upload, label: "Data Import", color: "text-emerald-400" },
  system: { icon: Cpu, label: "System Generated", color: "text-zinc-400" },
};

export function buildProvenance(signal: {
  source?: string;
  source_type?: string;
  signal_source?: string;
  source_url?: string | null;
  observed_date?: string | null;
  citation_excerpt?: string | null;
  workbook_meta?: WorkbookMeta;
  priority_source?: string;
}): ProvenanceData {
  let sourceLayer: ProvenanceData["sourceLayer"] = "system";

  if (signal.workbook_meta) {
    sourceLayer = "workbook";
  } else if (signal.source === "user") {
    sourceLayer = "manual";
  } else if (signal.source_type?.includes("scout") || signal.source_type?.includes("Scout")) {
    sourceLayer = "scout";
  } else if (signal.source_type?.includes("gating") || signal.source_type?.includes("Gating")) {
    sourceLayer = "gating";
  } else if (signal.source_type?.includes("import") || signal.source_type?.includes("Import")) {
    sourceLayer = "import";
  } else if (signal.signal_source === "external") {
    sourceLayer = "external";
  } else if (signal.signal_source === "internal") {
    sourceLayer = "manual";
  }

  return {
    sourceLayer,
    sourceReference: signal.source_type || signal.source || "unknown",
    sourceType: signal.source_type || (signal.source === "user" ? "manual entry" : "system"),
    originatingFile: signal.workbook_meta?.sourceWorkbook,
    programId: signal.workbook_meta?.programId,
    observedDate: signal.observed_date,
    sourceUrl: signal.source_url,
    citationExcerpt: signal.citation_excerpt,
    whyItMatters: signal.workbook_meta?.whyItMatters,
  };
}

export function SignalProvenanceDrawer({ open, onClose, signalLabel, meta, provenance, signalDirection, signalStrength, signalConfidence, signalCategory }: SignalProvenanceDrawerProps) {
  if (!open) return null;

  const prov = provenance || (meta ? {
    sourceLayer: "workbook" as const,
    sourceReference: "MIOS/BAOS Workbook",
    sourceType: "workbook",
    originatingFile: meta.sourceWorkbook,
    programId: meta.programId,
    whyItMatters: meta.whyItMatters,
  } : {
    sourceLayer: "system" as const,
    sourceReference: "Unknown",
    sourceType: "unknown",
  });

  const layerCfg = LAYER_CONFIG[prov.sourceLayer] || LAYER_CONFIG.system;
  const LayerIcon = layerCfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-slate-900 border-l border-slate-700 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <LayerIcon className={`w-4 h-4 ${layerCfg.color}`} />
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

          {(signalDirection || signalStrength || signalConfidence || signalCategory) && (
            <div className="flex flex-wrap gap-2">
              {signalDirection && (
                <span className={`rounded-md px-2 py-0.5 text-[10px] border ${
                  signalDirection === "positive" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                  : signalDirection === "negative" ? "border-red-500/30 text-red-400 bg-red-500/10"
                  : "border-zinc-500/30 text-zinc-400 bg-zinc-500/10"
                }`}>{signalDirection}</span>
              )}
              {signalStrength && (
                <span className="rounded-md px-2 py-0.5 text-[10px] border border-slate-600 text-slate-300 bg-slate-800">{signalStrength}</span>
              )}
              {signalConfidence && (
                <span className="rounded-md px-2 py-0.5 text-[10px] border border-slate-600 text-slate-300 bg-slate-800">{signalConfidence}</span>
              )}
              {signalCategory && (
                <span className="rounded-md px-2 py-0.5 text-[10px] border border-slate-600 text-slate-300 bg-slate-800">{signalCategory}</span>
              )}
            </div>
          )}

          <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source Origin</div>
            <div className="space-y-1.5">
              <ProvenanceField label="Source Layer" value={layerCfg.label} />
              <ProvenanceField label="Source Type" value={prov.sourceType} />
              <ProvenanceField label="Reference" value={prov.sourceReference} />
              {prov.originatingFile && <ProvenanceField label="File" value={prov.originatingFile} />}
              {prov.programId && <ProvenanceField label="Program" value={prov.programId} />}
              {prov.observedDate && <ProvenanceField label="Observed" value={prov.observedDate} />}
              {prov.agentName && <ProvenanceField label="Agent" value={prov.agentName} />}
            </div>
          </div>

          {(prov.bridgeId || prov.statementId || prov.evidenceId || prov.signalId) && (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trace IDs</div>
              <div className="space-y-1.5">
                {prov.signalId && <ProvenanceField label="Signal ID" value={prov.signalId} />}
                {prov.bridgeId && <ProvenanceField label="Bridge ID" value={prov.bridgeId} />}
                {prov.statementId && <ProvenanceField label="Statement ID" value={prov.statementId} />}
                {prov.evidenceId && <ProvenanceField label="Evidence ID" value={prov.evidenceId} />}
              </div>
            </div>
          )}

          {prov.sourceUrl && /^https?:\/\//i.test(prov.sourceUrl) && (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Source URL</div>
              <a href={prov.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline break-all">
                {prov.sourceUrl}
              </a>
            </div>
          )}

          {prov.citationExcerpt && (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Citation</div>
              <p className="text-xs text-slate-200 leading-relaxed italic">"{prov.citationExcerpt}"</p>
            </div>
          )}

          {prov.whyItMatters && (
            <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Info className="w-3 h-3 text-indigo-400" />
                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Why It Matters</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{prov.whyItMatters}</p>
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
