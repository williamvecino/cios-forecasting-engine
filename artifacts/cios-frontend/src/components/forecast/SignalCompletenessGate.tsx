import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ShieldAlert,
} from "lucide-react";

interface CategoryCheck {
  category: string;
  tier: 1 | 2 | 3;
  present: boolean;
  message: string;
  matchingSignalIds: string[];
}

interface CompletenessResult {
  caseId: string;
  pass: boolean;
  hardBlocked: boolean;
  tier1: CategoryCheck[];
  tier2: CategoryCheck[];
  tier3: CategoryCheck[];
  allChecks: CategoryCheck[];
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function SignalCompletenessGate({
  caseId,
  onBlockedChange,
}: {
  caseId: string;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const [result, setResult] = useState<CompletenessResult | null>(null);
  const [tier2Acknowledged, setTier2Acknowledged] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    fetch(`${getApiBase()}/cases/${caseId}/completeness-check`)
      .then(r => r.json())
      .then(data => {
        setResult(data);
        onBlockedChange?.(data.hardBlocked === true);
      })
      .catch(() => {});
  }, [caseId]);

  if (!result) return null;

  const tier2Missing = result.tier2.filter(c => !c.present);
  const tier3Missing = result.tier3.filter(c => !c.present);

  if (result.pass) return null;

  return (
    <div className="space-y-3">
      {result.hardBlocked && (
        <div className="rounded-xl border-2 border-red-500/50 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span className="text-sm font-bold text-red-400">Forecast Blocked</span>
          </div>
          {result.tier1.filter(c => !c.present).map((c, i) => (
            <p key={i} className="text-xs text-red-300/90">{c.message}</p>
          ))}
        </div>
      )}

      {tier2Missing.length > 0 && !result.hardBlocked && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-400">Signal Coverage Warnings</span>
            </div>
            {!tier2Acknowledged && (
              <button
                onClick={() => setTier2Acknowledged(true)}
                className="text-[10px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 hover:bg-amber-500/20 transition cursor-pointer"
              >
                Acknowledge
              </button>
            )}
          </div>
          {tier2Missing.map((c, i) => (
            <div key={i} className="flex items-start gap-2 mt-1.5">
              <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-300/80">{c.message}</span>
            </div>
          ))}
        </div>
      )}

      {tier3Missing.length > 0 && !result.hardBlocked && (
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Coverage Notes</span>
          </div>
          {tier3Missing.map((c, i) => (
            <div key={i} className="flex items-start gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground/70">— {c.message}</span>
            </div>
          ))}
        </div>
      )}

      {!result.hardBlocked && result.allChecks.filter(c => c.present).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.allChecks.filter(c => c.present).map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              {c.category}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
