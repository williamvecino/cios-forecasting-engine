import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Shield, Activity } from "lucide-react";

interface CalibrationCheck {
  check: string;
  passed: boolean;
  summary: string;
  details?: Record<string, any>;
}

interface CalibrationChecksData {
  checksRun: number;
  checksPassed: number;
  checksFailed: number;
  independentEvidenceCount: number;
  totalSignalCount: number;
  independenceRatio: number;
  adjustedProbability: number;
  uncertaintyRange: { low: number; high: number };
  volatilityScore: number;
  evidenceEcho: CalibrationCheck;
  anchorBias: CalibrationCheck;
  missingSignal: CalibrationCheck;
  correlation: CalibrationCheck;
  overconfidence: CalibrationCheck;
}

const CHECK_LABELS: Record<string, { label: string; description: string }> = {
  evidence_echo: {
    label: "Evidence Echo",
    description: "Detects duplicate or overlapping evidence counted multiple times",
  },
  anchor_bias: {
    label: "Anchor Bias",
    description: "Checks if the prior probability anchor distorts the assessment",
  },
  missing_signal: {
    label: "Missing Signal",
    description: "Identifies expected evidence categories not yet represented",
  },
  correlation: {
    label: "Correlation",
    description: "Detects shared causal drivers that reduce evidence independence",
  },
  overconfidence: {
    label: "Overconfidence",
    description: "Validates the probability sits within defensible uncertainty bounds",
  },
};

function StatusIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
  ) : (
    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
  );
}

export function CalibrationChecksPanel({ data }: { data: CalibrationChecksData | null | undefined }) {
  const [expanded, setExpanded] = useState(false);

  if (!data || data.checksRun === 0) return null;

  const checks = [
    data.evidenceEcho,
    data.anchorBias,
    data.missingSignal,
    data.correlation,
    data.overconfidence,
  ].filter(Boolean);

  const allPassed = data.checksFailed === 0;
  const lowPct = Math.round(data.uncertaintyRange.low * 100);
  const highPct = Math.round(data.uncertaintyRange.high * 100);
  const volPct = Math.round(data.volatilityScore * 100);

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0A1736] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Calibration Checks</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            allPassed
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}>
            {data.checksPassed}/{data.checksRun} passed
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400">
            <span>Range: {lowPct}%–{highPct}%</span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              Volatility: {volPct}%
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-5 space-y-4 border-t border-white/5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Independent Evidence</div>
              <div className="text-lg font-bold text-white mt-0.5">
                {data.independentEvidenceCount}
                <span className="text-sm text-slate-500 font-normal"> / {data.totalSignalCount}</span>
              </div>
              <div className={`text-[10px] font-medium mt-0.5 ${
                data.independenceRatio >= 0.8 ? "text-emerald-400" :
                data.independenceRatio >= 0.5 ? "text-yellow-400" : "text-amber-400"
              }`}>
                {Math.round(data.independenceRatio * 100)}% independent
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Uncertainty Range</div>
              <div className="text-lg font-bold text-white mt-0.5">
                {lowPct}%
                <span className="text-sm text-slate-400 font-normal"> – </span>
                {highPct}%
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Volatility</div>
              <div className={`text-lg font-bold mt-0.5 ${
                volPct > 30 ? "text-amber-400" : volPct > 15 ? "text-yellow-400" : "text-emerald-400"
              }`}>
                {volPct}%
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Checks</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-emerald-400 text-sm font-medium">{data.checksPassed} pass</span>
                {data.checksFailed > 0 && (
                  <span className="text-amber-400 text-sm font-medium">{data.checksFailed} flag</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {checks.map((c) => {
              const meta = CHECK_LABELS[c.check] || { label: c.check, description: "" };
              return (
                <div
                  key={c.check}
                  className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 border ${
                    c.passed
                      ? "border-white/5 bg-white/[0.01]"
                      : "border-amber-500/15 bg-amber-500/[0.03]"
                  }`}
                >
                  <div className="mt-0.5">
                    <StatusIcon passed={c.passed} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{meta.label}</span>
                      <span className="text-[10px] text-slate-600">{meta.description}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{c.summary}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-slate-600 pt-1">
            Calibration checks run automatically before every probability update to detect systematic bias.
          </div>
        </div>
      )}
    </div>
  );
}
