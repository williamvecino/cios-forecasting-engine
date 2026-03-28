import type { ForecastGate, DecisionItem, DerivedDecisions } from "./decision-derivation";

export interface IntegrityViolation {
  rule: string;
  severity: "error" | "warning";
  detail: string;
  decision_id?: string;
  gate_id?: string;
}

export interface IntegrityReport {
  valid: boolean;
  violations: IntegrityViolation[];
  gate_coverage: Record<string, { has_barrier: boolean; has_action: boolean; gate_status: string }>;
  derivation_chain_complete: boolean;
}

export function validateDecisionIntegrity(
  decisions: DerivedDecisions,
  gates: ForecastGate[],
  brandOutlook: number | null,
  constrainedProb: number | null,
): IntegrityReport {
  const violations: IntegrityViolation[] = [];
  const gateIds = new Set(gates.map(g => g.gate_id));
  const gateCoverage: Record<string, { has_barrier: boolean; has_action: boolean; gate_status: string }> = {};

  for (const gate of gates) {
    gateCoverage[gate.gate_id] = { has_barrier: false, has_action: false, gate_status: gate.status };
  }

  const allItems = [
    ...decisions.barriers,
    ...decisions.actions,
    ...decisions.segments,
    ...decisions.trigger_events,
    ...decisions.monitoring,
  ];

  for (const item of allItems) {
    if (!item.source_gate_id) {
      violations.push({
        rule: "MISSING_GATE_ID",
        severity: "error",
        detail: `${item.decision_type} "${item.title}" has no source_gate_id.`,
        decision_id: item.decision_id,
      });
      continue;
    }

    if (!gateIds.has(item.source_gate_id)) {
      violations.push({
        rule: "INVALID_GATE_REF",
        severity: "error",
        detail: `${item.decision_type} "${item.title}" references gate "${item.source_gate_id}" which does not exist.`,
        decision_id: item.decision_id,
        gate_id: item.source_gate_id,
      });
      continue;
    }

    if (!item.forecast_dependency) {
      violations.push({
        rule: "MISSING_FORECAST_DEP",
        severity: "error",
        detail: `${item.decision_type} "${item.title}" has no forecast_dependency.`,
        decision_id: item.decision_id,
      });
    }

    if (!item.derived_from_forecast) {
      violations.push({
        rule: "NOT_FORECAST_DERIVED",
        severity: "error",
        detail: `${item.decision_type} "${item.title}" is not marked as forecast-derived.`,
        decision_id: item.decision_id,
      });
    }
  }

  for (const barrier of decisions.barriers) {
    if (barrier.source_gate_id && gateCoverage[barrier.source_gate_id]) {
      gateCoverage[barrier.source_gate_id].has_barrier = true;
    }

    const gate = gates.find(g => g.gate_id === barrier.source_gate_id);
    if (gate && gate.status === "strong" && barrier.severity_or_priority === "High") {
      violations.push({
        rule: "STRONG_GATE_HIGH_BARRIER",
        severity: "error",
        detail: `Barrier "${barrier.title}" has High severity but its source gate "${gate.gate_label}" is strong. Strong gates cannot produce high barriers.`,
        decision_id: barrier.decision_id,
        gate_id: gate.gate_id,
      });
    }
  }

  for (const action of decisions.actions) {
    if (action.source_gate_id && gateCoverage[action.source_gate_id]) {
      gateCoverage[action.source_gate_id].has_action = true;
    }
  }

  for (const gate of gates) {
    if (gate.status === "weak" || gate.status === "unresolved") {
      const coverage = gateCoverage[gate.gate_id];
      if (!coverage.has_barrier && !coverage.has_action) {
        violations.push({
          rule: "WEAK_GATE_NO_OUTPUT",
          severity: "error",
          detail: `Gate "${gate.gate_label}" is ${gate.status} but has no barrier or action derived from it.`,
          gate_id: gate.gate_id,
        });
      }
    }
  }

  const constrainingGates = gates.filter(g =>
    g.constrains_probability_to < (constrainedProb ?? 1) + 0.05
  );
  for (const gate of constrainingGates) {
    const coverage = gateCoverage[gate.gate_id];
    if (!coverage?.has_barrier && !coverage?.has_action && gate.status !== "strong") {
      violations.push({
        rule: "CONSTRAINING_GATE_NO_COVERAGE",
        severity: "warning",
        detail: `Gate "${gate.gate_label}" constrains the forecast to ${Math.round(gate.constrains_probability_to * 100)}% but has no decision output.`,
        gate_id: gate.gate_id,
      });
    }
  }

  const brandPct = brandOutlook != null ? Math.round(brandOutlook * 100) : null;
  const finalPct = constrainedProb != null ? Math.round(constrainedProb * 100) : null;
  if (brandPct != null && finalPct != null && brandPct >= 60 && finalPct < 40) {
    const hasExecutionBarrier = decisions.barriers.some(b => {
      const gate = gates.find(g => g.gate_id === b.source_gate_id);
      return gate && gate.status !== "strong";
    });
    if (!hasExecutionBarrier) {
      violations.push({
        rule: "BRAND_STRONG_FINAL_LOW_NO_EXECUTION",
        severity: "warning",
        detail: `Brand outlook is ${brandPct}% but forecast is ${finalPct}%. Decide page should emphasize execution barriers, not evidence barriers.`,
      });
    }
  }

  const derivationChainComplete = violations.filter(v => v.severity === "error").length === 0;

  return {
    valid: derivationChainComplete,
    violations,
    gate_coverage: gateCoverage,
    derivation_chain_complete: derivationChainComplete,
  };
}
