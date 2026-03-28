import { useState, useEffect, useCallback, useRef } from "react";

export interface Assumption {
  id: string;
  text: string;
  category: string;
  source_step: string;
  status: "active" | "challenged" | "invalidated";
  confidence: "high" | "moderate" | "low";
  linked_gates: string[];
  version: number;
  created_at: string;
  updated_at: string;
  invalidation_reason?: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

function storageKey(caseId: string) {
  return `cios.assumptions:${caseId}`;
}

export function useAssumptions(caseId: string | undefined) {
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExtracted, setLastExtracted] = useState<string | null>(null);
  const extractingRef = useRef(false);

  useEffect(() => {
    if (!caseId) {
      setAssumptions([]);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey(caseId));
      if (stored) {
        const parsed = JSON.parse(stored);
        setAssumptions(parsed.assumptions || []);
        setLastExtracted(parsed.lastExtracted || null);
      } else {
        setAssumptions([]);
        setLastExtracted(null);
      }
    } catch {
      setAssumptions([]);
    }
  }, [caseId]);

  const extractAssumptions = useCallback(async (silent = false) => {
    if (!caseId || extractingRef.current) return;
    extractingRef.current = true;
    if (!silent) setLoading(true);
    setError(null);

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
        if (!silent) setLoading(false);
        return;
      }

      const existing = assumptions.length > 0 ? assumptions : undefined;

      const res = await fetch(`${getApiBase()}/ai-assumptions/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
          existing_assumptions: existing,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      const newAssumptions: Assumption[] = data.assumptions || [];
      const now = new Date().toISOString();

      setAssumptions(newAssumptions);
      setLastExtracted(now);

      localStorage.setItem(storageKey(caseId), JSON.stringify({
        assumptions: newAssumptions,
        lastExtracted: now,
      }));
    } catch (err: any) {
      if (!silent) setError(err.message || "Failed to extract assumptions");
      console.error("[assumptions] extraction error:", err);
    } finally {
      extractingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [caseId, assumptions]);

  return {
    assumptions,
    loading,
    error,
    lastExtracted,
    extractAssumptions,
  };
}
