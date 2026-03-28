import { memo } from "react";
import { X, BookOpen, Target, Lightbulb, ShieldAlert, Zap } from "lucide-react";
import type { AnalogCaseDetail } from "@/lib/judgment-engine";

interface AnalogModalProps {
  analog: AnalogCaseDetail;
  onClose: () => void;
}

const confidenceBadge: Record<string, string> = {
  High: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  Moderate: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  Low: "bg-rose-500/15 text-rose-300 border-rose-500/20",
};

const AnalogModal = memo(function AnalogModal({ analog, onClose }: AnalogModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-b from-[#0C1E42] to-[#0A1736] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Comparable Case</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">{analog.brand}</h2>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${confidenceBadge[analog.confidence] || "bg-slate-500/15 text-slate-300 border-slate-500/20"}`}>
              {analog.confidence} Confidence
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Indication</div>
              <div className="text-sm text-slate-200">{analog.indication}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Match Strength</div>
              <div className="text-sm text-cyan-300">{analog.similarityScore}%</div>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5 text-blue-400" />
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Similarity</div>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{analog.similarity}</p>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Outcome</div>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{analog.outcome}</p>
          </div>

          <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
              <div className="text-[10px] uppercase tracking-wider text-indigo-400">Lesson</div>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{analog.lesson}</p>
          </div>

          {(analog.keyBarrier || analog.keyEnabler) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {analog.keyBarrier && (
                <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                    <div className="text-[10px] uppercase tracking-wider text-red-400">Key Barrier</div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{analog.keyBarrier}</p>
                </div>
              )}
              {analog.keyEnabler && (
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <div className="text-[10px] uppercase tracking-wider text-emerald-400">Key Enabler</div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{analog.keyEnabler}</p>
                </div>
              )}
            </div>
          )}

          {analog.keyDifferences.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Key Differences from Current Case</div>
              <div className="space-y-1">
                {analog.keyDifferences.map((diff, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="text-slate-500 shrink-0">•</span>
                    <span>{diff}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export { AnalogModal };
