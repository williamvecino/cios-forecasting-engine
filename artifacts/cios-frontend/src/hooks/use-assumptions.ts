import { useState, useEffect, useCallback, useRef } from "react";

export interface Assumption {
  assumptionId: string;
  caseId: string;
  assumptionStatement: string;
  assumptionCategory: string;
  assumptionStatus: "active" | "validated" | "invalidated" | "unknown";
  confidenceLevel: "high" | "moderate" | "low";
  sourceType: string;
  impactLevel: "high" | "moderate" | "low";
  owner: string;
  linkedGates: string;
  invalidationReason: string | null;
  lastUpdated: string;
  createdAt: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export function useAssumptions(caseId: string | undefined) {
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExtracted, setLastExtracted] = useState<string | null>(null);
  const [recalculationTriggered, setRecalculationTriggered] = useState(false);
  const extractingRef = useRef(false);

  const fetchAssumptions = useCallback(async () => {
    if (!caseId) {
      setAssumptions([]);
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/assumptions/${encodeURIComponent(caseId)}`);
      if (res.ok) {
        const data = await res.json();
        setAssumptions(data.assumptions || []);
        if (data.assumptions?.length) {
          const latest = data.assumptions.reduce((max: string, a: Assumption) =>
            a.lastUpdated > max ? a.lastUpdated : max, "");
          setLastExtracted(latest);
        }
      }
    } catch {
      setAssumptions([]);
    }
  }, [caseId]);

  useEffect(() => {
    fetchAssumptions();
  }, [fetchAssumptions]);

  const extractAssumptions = useCallback(async (silent = false) => {
    if (!caseId || extractingRef.current) return;
    extractingRef.current = true;
    if (!silent) setExtracting(true);
    setError(null);
    setRecalculationTriggered(false);

    try {
      let gates: any[] = [];
      let signals: any[] = [];
      let probability: number | null = null;
      let constrainedProbability: number | null = null;
      let derived_decisions: any = null;
      let adoption_segmentation: any = null;
      let respond_result: any = null;
      let subject = "";
      let questionText = "";
      let outcome = "";
      let timeHorizon = "";

      try {
        const aq = localStorage.getItem("cios.activeQuestion");
        if (aq) {
          const parsed = JSON.parse(aq);
          subject = parsed.subject || parsed.text || "";
          questionText = parsed.rawInput || parsed.text || parsed.question || "";
          outcome = parsed.outcome || "adoption";
          timeHorizon = parsed.timeHorizon || "12 months";
        }
      } catch {}

      try {
        const decomp = localStorage.getItem(`cios.eventDecomposition:${caseId}`);
        if (decomp) {
          const parsed = JSON.parse(decomp);
          gates = parsed.event_gates || [];
          probability = parsed.brand_outlook_probability ?? null;
          constrainedProbability = parsed.constrained_probability ?? null;
        }
      } catch {}

      try {
        const sigRaw = localStorage.getItem(`cios.signals:${caseId}`);
        if (sigRaw) {
          signals = JSON.parse(sigRaw)
            .filter((s: any) => s.accepted && !s.dismissed)
            .map((s: any) => ({ text: s.text, direction: s.direction, importance: s.importance, confidence: s.confidence }));
        }
      } catch {}

      try {
        const decide = localStorage.getItem(`cios.decideResult:${caseId}`);
        if (decide) {
          const parsed = JSON.parse(decide);
          derived_decisions = parsed.derived_decisions || null;
          adoption_segmentation = parsed.adoption_segmentation || null;
        }
      } catch {}

      try {
        const respond = localStorage.getItem(`cios.respondResult:${caseId}`);
        if (respond) {
          respond_result = JSON.parse(respond);
        }
      } catch {}

      if (!subject || !questionText) {
        extractingRef.current = false;
        if (!silent) setExtracting(false);
        return;
      }

      const res = await fetch(`${getApiBase()}/ai-assumptions/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          subject,
          questionText,
          outcome,
          timeHorizon,
          probability,
          constrainedProbability,
          gates,
          signals,
          derived_decisions,
          adoption_segmentation,
          respond_result,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setAssumptions(data.assumptions || []);
      setRecalculationTriggered(data.recalculation_triggered || false);
      setLastExtracted(new Date().toISOString());
    } catch (err: any) {
      if (!silent) setError(err.message || "Failed to extract assumptions");
      console.error("[assumptions] extraction error:", err);
    } finally {
      extractingRef.current = false;
      if (!silent) setExtracting(false);
    }
  }, [caseId]);

  const updateStatus = useCallback(async (assumptionId: string, status: string, reason?: string) => {
    try {
      setError(null);
      const res = await fetch(`${getApiBase()}/assumptions/${encodeURIComponent(assumptionId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, invalidation_reason: reason }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setError(errBody.error || `Failed to update status (${res.status})`);
        return;
      }

      const data = await res.json();
      setRecalculationTriggered(data.recalculation_triggered || false);
      await fetchAssumptions();
    } catch (err: any) {
      setError(err.message || "Failed to update assumption status");
      console.error("[assumptions] status update error:", err);
    }
  }, [fetchAssumptions]);

  return {
    assumptions,
    loading: extracting,
    error,
    lastExtracted,
    recalculationTriggered,
    extractAssumptions,
    updateStatus,
    refetch: fetchAssumptions,
  };
}
