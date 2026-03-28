import { useState } from "react";
import { Loader2, ShieldAlert, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface IntegrityCheck {
  checkId: string;
  checkName: string;
  category: string;
  status: string;
  severity: string;
  detail: string;
  suggestion?: string;
}

interface IntegrityResult {
  checks: IntegrityCheck[];
  overallIntegrity: string;
  passCount: number;
  warningCount: number;
  failCount: number;
  summary: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export function IntegrityPanel({ question, probability, signals, gates, judgment }: {
  question: string;
  probability?: number;
  signals?: Array<{ text: string; direction: string; strength: string; confidence: string }>;
  gates?: Array<{ label: string; status: string; constrains_to: number }>;
  judgment?: { headline?: string; narrative?: string; recommendation?: string; confidenceLevel?: string };
}) {
  const [result, setResult] = useState<IntegrityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runIntegrity() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/agents/integrity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, probability, signals, gates, judgment }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const integrityColor = (i: string) =>
    i === "sound" ? "text-emerald-400" : i === "minor_issues" ? "text-amber-400" : i === "significant_issues" ? "text-orange-400" : "text-red-400";

  const statusIcon = (s: string) =>
    s === "pass" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> :
    s === "warning" ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> :
    <XCircle className="w-3.5 h-3.5 text-red-400" />;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-foreground">Integrity Check</h3>
          {result && (
            <span className={`text-xs font-medium ${integrityColor(result.overallIntegrity)}`}>
              {result.overallIntegrity.replace(/_/g, " ")}
            </span>
          )}
        </div>
        {!result && (
          <button
            onClick={runIntegrity}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
            {loading ? "Checking integrity..." : "Run Integrity Check"}
          </button>
        )}
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>}

      {result && (
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-emerald-400">Pass: {result.passCount}</span>
            <span className="text-amber-400">Warnings: {result.warningCount}</span>
            <span className="text-red-400">Fail: {result.failCount}</span>
          </div>

          <p className="text-xs text-foreground/70 leading-relaxed">{result.summary}</p>

          <div className="space-y-1.5">
            {result.checks.map((c) => (
              <div key={c.checkId} className="flex items-start gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2">
                {statusIcon(c.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{c.checkName}</span>
                    <span className="text-[10px] text-muted-foreground">{c.category.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-xs text-foreground/60 mt-0.5">{c.detail}</p>
                  {c.suggestion && c.status !== "pass" && (
                    <p className="text-xs text-blue-400/70 mt-0.5">{c.suggestion}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
