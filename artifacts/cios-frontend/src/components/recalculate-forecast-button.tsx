import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui-components";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

type RecalcState = "idle" | "running" | "success" | "error";

interface RecalculateForecastButtonProps {
  caseId: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
  onComplete?: (result: any) => void;
}

export function RecalculateForecastButton({
  caseId,
  variant = "outline",
  size = "sm",
  className,
  onComplete,
}: RecalculateForecastButtonProps) {
  const [state, setState] = useState<RecalcState>("idle");
  const [result, setResult] = useState<{ probability: number; forecastId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleRecalculate = async () => {
    setState("running");
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/cases/${caseId}/forecast`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Forecast failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      setResult({
        probability: data.currentProbability,
        forecastId: data.forecastId,
      });
      setState("success");

      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/forecast`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });

      onComplete?.(data);

      setTimeout(() => setState("idle"), 4000);
    } catch (err: any) {
      setError(err.message || "Recalculation failed");
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        variant={state === "success" ? "primary" : state === "error" ? "danger" : variant}
        size={size}
        className={cn("gap-1.5 relative", className)}
        onClick={handleRecalculate}
        disabled={state === "running"}
      >
        {state === "running" && (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Recalculating…
          </>
        )}
        {state === "idle" && (
          <>
            <RefreshCw className="w-3.5 h-3.5" />
            Recalculate Forecast
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="w-3.5 h-3.5" />
            Updated — {((result?.probability ?? 0) * 100).toFixed(1)}%
          </>
        )}
        {state === "error" && (
          <>
            <AlertTriangle className="w-3.5 h-3.5" />
            Failed
          </>
        )}
      </Button>
      {state === "success" && result && (
        <span className="text-[10px] text-emerald-400 pl-1">
          Ledger entry {result.forecastId} saved
        </span>
      )}
      {state === "error" && error && (
        <span className="text-[10px] text-destructive pl-1">
          {error}
        </span>
      )}
    </div>
  );
}
