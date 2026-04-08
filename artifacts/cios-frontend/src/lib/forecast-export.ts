import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";

interface ExportableSignal {
  text: string;
  direction: string;
  impact: string;
  reliability: string;
  category: string;
  source_url?: string | null;
  identifierType?: string | null;
  identifierValue?: string | null;
  verificationStatus?: string | null;
  likelihoodRatio?: number | null;
  effectiveLikelihoodRatio?: number | null;
  signalType?: string | null;
  countTowardPosterior?: boolean;
}

interface ExportableGate {
  gate_label: string;
  status: string;
  constrains_probability_to: number;
  reasoning: string;
}

interface ExportableDecisionItem {
  title: string;
  rationale: string;
  severity_or_priority: string;
  source_gate_label: string;
  forecast_dependency: string;
}

interface JudgmentExport {
  mostLikelyOutcome: string;
  probability: string;
  confidence: string;
  decisionPosture: string;
  keyDrivers: string[];
  uncertaintyType: string;
  reversalTriggers: string[];
  monitorList: string[];
}

interface CalculationStep {
  label: string;
  value?: number;
  odds?: number;
  source?: string;
  [key: string]: any;
}

export interface ForecastExportData {
  questionText: string;
  subject: string;
  timeHorizon: string;
  therapeuticArea: string;
  timestamp: string;
  caseId: string;
  runId: string;
  signals: ExportableSignal[];
  gates: ExportableGate[];
  brandOutlook: number | null;
  constrainedProbability: number | null;
  priorProbability: number | null;
  posteriorProbability: number | null;
  rawPosteriorProbability: number | null;
  judgment: JudgmentExport | null;
  barriers: ExportableDecisionItem[];
  actions: ExportableDecisionItem[];
  segments: ExportableDecisionItem[];
  triggerEvents: ExportableDecisionItem[];
  calculationTrace: Record<string, CalculationStep> | null;
  comparatorJustification: string | null;
}

function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function fetchForecastData(caseId: string): Promise<any> {
  if (!caseId || caseId === "unknown") return null;
  try {
    const API = (import.meta as any).env?.VITE_API_URL || "";
    const res = await fetch(`${API}/api/forecast/${caseId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchCaseData(caseId: string): Promise<any> {
  if (!caseId || caseId === "unknown") return null;
  try {
    const API = (import.meta as any).env?.VITE_API_URL || "";
    const res = await fetch(`${API}/api/cases${caseId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchCaseSignals(caseId: string): Promise<any[]> {
  if (!caseId || caseId === "unknown") return [];
  try {
    const API = (import.meta as any).env?.VITE_API_URL || "";
    const res = await fetch(`${API}/api/cases/${caseId}/signals`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function gatherExportData(): Promise<ForecastExportData> {
  const activeQ = safeParse<any>("cios.activeQuestion", {});
  const caseId = activeQ.caseId || "unknown";
  const localSignals = safeParse<any[]>(`cios.signals:${caseId}`, []);
  const decomp = safeParse<any>(`cios.eventDecomposition:${caseId}`, {});
  const ta = localStorage.getItem("cios.therapeuticArea") || "general";
  const decideData = safeParse<any>(`cios.decideResult:${caseId}`, null);
  const judgmentData = safeParse<any>(`cios.judgmentResult:${caseId}`, null);

  // Fetch authoritative data from API
  const [forecastData, caseData, dbSignals] = await Promise.all([
    fetchForecastData(caseId),
    fetchCaseData(caseId),
    fetchCaseSignals(caseId),
  ]);

  const signalDetails: any[] = forecastData?.signalDetails || [];
  const signalDetailMap = new Map(signalDetails.map((s: any) => [s.signalId, s]));

  // Merge local signals with DB signals and forecast details
  const signalSource = dbSignals.length > 0 ? dbSignals : localSignals;
  const exportSignals: ExportableSignal[] = signalSource
    .filter((s: any) => s.status === "active" || s.accepted)
    .map((s: any) => {
      const detail = signalDetailMap.get(s.signalId);
      return {
        text: s.signalDescription || s.text || "",
        direction: s.direction === "Positive" || s.direction === "positive" ? "Supports"
          : s.direction === "Negative" || s.direction === "negative" ? "Opposes" : "Neutral",
        impact: s.strengthScore || s.impact || "Medium",
        reliability: s.reliabilityScore || s.reliability || "Moderate",
        category: s.signalType || s.category || "evidence",
        source_url: s.sourceUrl || s.source_url || null,
        identifierType: s.identifierType || null,
        identifierValue: s.identifierValue || s.identifierValue || null,
        verificationStatus: s.verificationStatus || null,
        likelihoodRatio: detail?.likelihoodRatio ?? s.likelihoodRatio ?? null,
        effectiveLikelihoodRatio: detail?.effectiveLikelihoodRatio ?? null,
        signalType: s.signalType || null,
        countTowardPosterior: s.countTowardPosterior ?? detail != null,
      };
    });

  const exportGates: ExportableGate[] = (decomp.event_gates || []).map((g: any) => ({
    gate_label: g.gate_label,
    status: g.status,
    constrains_probability_to: g.constrains_probability_to,
    reasoning: g.reasoning,
  }));

  let judgment: JudgmentExport | null = null;
  if (judgmentData) {
    judgment = {
      mostLikelyOutcome: judgmentData.mostLikelyOutcome || judgmentData.most_likely_outcome || "",
      probability: judgmentData.probability || "",
      confidence: judgmentData.confidence || "",
      decisionPosture: judgmentData.decisionPosture || judgmentData.decision_posture || "",
      keyDrivers: judgmentData.keyDrivers || judgmentData.key_drivers || [],
      uncertaintyType: judgmentData.uncertaintyType || judgmentData.uncertainty_type || "",
      reversalTriggers: judgmentData.reversalTriggers || judgmentData.reversal_triggers || [],
      monitorList: judgmentData.monitorList || judgmentData.monitor_list || [],
    };
  }

  const mapDecisionItems = (items: any[]): ExportableDecisionItem[] =>
    (items || []).map((d: any) => ({
      title: d.title || "",
      rationale: d.rationale || "",
      severity_or_priority: d.severity_or_priority || "",
      source_gate_label: d.source_gate_label || "",
      forecast_dependency: d.forecast_dependency || "",
    }));

  const dd = decideData?.derived_decisions;
  const runId = `CIOS-${caseId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  return {
    questionText: activeQ.rawInput || activeQ.text || "",
    subject: activeQ.subject || caseData?.primaryBrand || "",
    timeHorizon: activeQ.timeHorizon || "",
    therapeuticArea: ta,
    timestamp: new Date().toISOString(),
    caseId,
    runId,
    signals: exportSignals,
    gates: exportGates,
    brandOutlook: forecastData?.brandOutlookProbability ?? decomp.brand_outlook_probability ?? null,
    constrainedProbability: forecastData?.currentProbability ?? decomp.constrained_probability ?? null,
    priorProbability: forecastData?.priorProbability ?? caseData?.priorProbability ?? null,
    posteriorProbability: forecastData?.posteriorProbability ?? null,
    rawPosteriorProbability: forecastData?.rawProbability ?? null,
    judgment,
    barriers: mapDecisionItems(dd?.barriers),
    actions: mapDecisionItems(dd?.actions),
    segments: mapDecisionItems(dd?.segments),
    triggerEvents: mapDecisionItems(dd?.trigger_events),
    calculationTrace: forecastData?.calculationTrace ?? null,
    comparatorJustification: caseData?.comparatorJustification || caseData?.secondaryEvidence || null,
  };
}

export async function exportToJSON() {
  const data = await gatherExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveAs(blob, `cios-run-receipt-${data.runId}.json`);
}

export async function exportToExcel() {
  const data = await gatherExportData();
  const wb = XLSX.utils.book_new();

  const pct = (v: number | null) => v != null ? `${Math.round(v * 100)}%` : "N/A";

  const summaryData = [
    ["CIOS Forecast Run Receipt"],
    [],
    ["Run ID", data.runId],
    ["Case ID", data.caseId],
    ["Export Date", data.timestamp],
    [],
    ["Question", data.questionText],
    ["Subject", data.subject],
    ["Time Horizon", data.timeHorizon],
    ["Therapeutic Area", data.therapeuticArea],
    [],
    ["Prior Probability", pct(data.priorProbability)],
    ["Comparator Justification", data.comparatorJustification || "N/A"],
    ["Raw Bayesian Posterior", pct(data.rawPosteriorProbability)],
    ["Signal Strength (Pre-Gate)", pct(data.brandOutlook)],
    ["Final Forecast Probability", pct(data.constrainedProbability)],
  ];
  if (data.judgment) {
    summaryData.push(
      [],
      ["Executive Judgment"],
      ["Most Likely Outcome", data.judgment.mostLikelyOutcome],
      ["Probability", data.judgment.probability],
      ["Confidence", data.judgment.confidence],
      ["Decision Posture", data.judgment.decisionPosture],
      ["Uncertainty Type", data.judgment.uncertaintyType],
      ["Key Drivers", data.judgment.keyDrivers.join("; ")],
      ["Reversal Triggers", data.judgment.reversalTriggers.join("; ")],
      ["Monitor List", data.judgment.monitorList.join("; ")],
    );
  }
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  if (data.signals.length > 0) {
    const signalHeader = ["Signal", "Type", "Direction", "LR", "Effective LR", "PMID/DOI", "Verified", "Counts"];
    const signalRows = data.signals.map((s) => [
      s.text,
      s.signalType || "",
      s.direction,
      s.likelihoodRatio != null ? s.likelihoodRatio.toFixed(3) : "",
      s.effectiveLikelihoodRatio != null ? s.effectiveLikelihoodRatio.toFixed(3) : "",
      s.identifierValue || "",
      s.verificationStatus || "unverified",
      s.countTowardPosterior ? "Yes" : "No",
    ]);
    const signalSheet = XLSX.utils.aoa_to_sheet([signalHeader, ...signalRows]);
    signalSheet["!cols"] = [{ wch: 60 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, signalSheet, "Signals");
  }

  if (data.gates.length > 0) {
    const gateHeader = ["Gate", "Status", "Constrains To", "Reasoning"];
    const gateRows = data.gates.map((g) => [
      g.gate_label,
      g.status,
      pct(g.constrains_probability_to),
      g.reasoning,
    ]);
    const gateSheet = XLSX.utils.aoa_to_sheet([gateHeader, ...gateRows]);
    gateSheet["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, gateSheet, "Gates");
  }

  if (data.calculationTrace) {
    const traceData: string[][] = [["Computation Step", "Detail", "Value"]];
    const trace = data.calculationTrace;
    for (const [key, step] of Object.entries(trace)) {
      if (step && typeof step === "object" && step.label) {
        traceData.push([step.label, step.source || "", step.value != null ? String(step.value) : ""]);
      }
    }
    const traceSheet = XLSX.utils.aoa_to_sheet(traceData);
    traceSheet["!cols"] = [{ wch: 30 }, { wch: 60 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, traceSheet, "Calculation Trace");
  }

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `cios-run-receipt-${data.runId}.xlsx`);
}

export async function exportToPDF() {
  const data = await gatherExportData();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pct = (v: number | null) => v != null ? `${Math.round(v * 100)}%` : "N/A";
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text("CIOS Forecast Run Receipt", 14, 20);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Run ID: ${data.runId}`, 14, 27);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);
  doc.text(`Case: ${data.caseId}`, pageWidth - 14 - doc.getTextWidth(`Case: ${data.caseId}`), 27);

  // ── Question & Subject ──
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  let y = 42;

  doc.setFont("helvetica", "bold");
  doc.text("Strategic Question", 14, y);
  doc.setFont("helvetica", "normal");
  const qLines = doc.splitTextToSize(data.questionText || "N/A", 170);
  doc.text(qLines, 14, y + 6);
  y += 6 + qLines.length * 5 + 2;

  doc.setFont("helvetica", "bold");
  doc.text("Subject:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.subject || "N/A"}   |   Time Horizon: ${data.timeHorizon || "N/A"}   |   TA: ${data.therapeuticArea}`, 38, y);
  y += 8;

  // ── Probability Summary Box ──
  doc.setDrawColor(30, 41, 59);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pageWidth - 28, 28, 2, 2, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  const col1 = 20; const col2 = 60; const col3 = 100; const col4 = 145;
  doc.text("Prior", col1, y + 8);
  doc.text("Raw Posterior", col2, y + 8);
  doc.text("Signal Strength", col3, y + 8);
  doc.text("Final Forecast", col4, y + 8);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(pct(data.priorProbability), col1, y + 18);
  doc.text(pct(data.rawPosteriorProbability), col2, y + 18);
  doc.text(pct(data.brandOutlook), col3, y + 18);
  doc.setTextColor(15, 118, 110);
  doc.text(pct(data.constrainedProbability), col4, y + 18);
  doc.setTextColor(30, 41, 59);

  y += 34;

  // ── Prior Justification ──
  if (data.comparatorJustification) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Prior Justification:", 14, y);
    doc.setFont("helvetica", "normal");
    const justLines = doc.splitTextToSize(data.comparatorJustification, 170);
    doc.text(justLines, 14, y + 5);
    y += 5 + justLines.length * 4 + 4;
  }

  // ── Executive Judgment ──
  if (data.judgment) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Executive Judgment", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const jItems = [
      ["Most Likely Outcome", data.judgment.mostLikelyOutcome],
      ["Decision Posture", data.judgment.decisionPosture],
      ["Confidence", data.judgment.confidence],
      ["Uncertainty", data.judgment.uncertaintyType],
    ];
    for (const [label, val] of jItems) {
      if (val) {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, 14, y);
        doc.setFont("helvetica", "normal");
        const valLines = doc.splitTextToSize(val, 130);
        doc.text(valLines, 60, y);
        y += valLines.length * 5 + 2;
      }
    }
    if (data.judgment.keyDrivers.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("Key Drivers:", 14, y);
      doc.setFont("helvetica", "normal");
      y += 5;
      for (const d of data.judgment.keyDrivers) {
        const dLines = doc.splitTextToSize(`• ${d}`, 160);
        doc.text(dLines, 18, y);
        y += dLines.length * 5;
      }
    }
    y += 6;
  }

  // ── Signals Table (with LR, PMID, Direction) ──
  if (data.signals.length > 0) {
    if (y > 210) { doc.addPage(); y = 20; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Signal Evidence Register", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Signal", "Type", "Dir", "LR", "Eff. LR", "PMID/DOI", "Verified", "Counts"]],
      body: data.signals.map((s) => [
        s.text.slice(0, 80) + (s.text.length > 80 ? "…" : ""),
        s.signalType || "",
        s.direction,
        s.likelihoodRatio != null ? s.likelihoodRatio.toFixed(2) : "-",
        s.effectiveLikelihoodRatio != null ? s.effectiveLikelihoodRatio.toFixed(2) : "-",
        s.identifierValue || "-",
        s.verificationStatus || "-",
        s.countTowardPosterior ? "Yes" : "No",
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 22 },
        2: { cellWidth: 12 },
        3: { cellWidth: 12 },
        4: { cellWidth: 14 },
        5: { cellWidth: 22 },
        6: { cellWidth: 16 },
        7: { cellWidth: 12 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;
  }

  // ── Forecast Gates ──
  if (data.gates.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text("Forecast Gates", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Gate", "Status", "Cap", "Reasoning"]],
      body: data.gates.map((g) => [
        g.gate_label,
        g.status,
        pct(g.constrains_probability_to),
        g.reasoning,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 18 },
        2: { cellWidth: 15 },
        3: { cellWidth: 97 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;
  }

  // ── Bayesian Computation Trace ──
  if (data.calculationTrace) {
    if (y > 220) { doc.addPage(); y = 20; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text("Bayesian Computation Trace", 14, y);
    y += 4;

    const traceRows: string[][] = [];
    const trace = data.calculationTrace;

    if (trace.step1_prior) {
      traceRows.push(["1. Prior Probability", String(trace.step1_prior.value ?? ""), `Odds: ${trace.step1_prior.odds ?? ""}`]);
    }
    if (trace.step2_bayesianUpdate) {
      const s2 = trace.step2_bayesianUpdate;
      traceRows.push([
        "2. Bayesian Update",
        s2.rawPosteriorProbability != null ? String(s2.rawPosteriorProbability) : "",
        `Signals: ${s2.signalCount ?? 0}, LR Product: ${s2.likelihoodRatioProduct ?? ""}, Actor Factor: ${s2.actorAdjustmentFactor ?? ""}`,
      ]);
    }
    if (trace.step3_calibration) {
      const s3 = trace.step3_calibration;
      traceRows.push([
        "3. Calibration",
        s3.calibratedProbability != null ? String(s3.calibratedProbability) : "",
        s3.correctionApplied ? `Correction: ${s3.correctionPp} pp` : "No correction",
      ]);
    }
    if (trace.step4_environmentAdjustment) {
      const s4 = trace.step4_environmentAdjustment;
      traceRows.push([
        "4. Environment Adjustment",
        s4.value != null ? String(s4.value) : "",
        `Prior mult: ${s4.priorMultiplier ?? ""}, Post mult: ${s4.posteriorMultiplier ?? ""}`,
      ]);
    }
    if (trace.step5_distributionSimulation && trace.step5_distributionSimulation.thresholdProbability != null) {
      traceRows.push([
        "5. Distribution Simulation",
        String(trace.step5_distributionSimulation.thresholdProbability),
        `Ceiling: ${trace.step5_distributionSimulation.achievableCeiling ?? ""}`,
      ]);
    }

    if (traceRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Step", "Probability", "Details"]],
        body: traceRows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 25 },
          2: { cellWidth: 100 },
        },
        margin: { left: 14, right: 14 },
      });
    }
  }

  // ── Footer on all pages ──
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footY = doc.internal.pageSize.getHeight() - 10;
    doc.text(
      `CIOS Run Receipt — ${data.subject} — Run ${data.runId} — Page ${i} of ${pageCount}`,
      14, footY,
    );
    doc.text(
      `Generated ${new Date().toLocaleString()} — Confidential`,
      pageWidth - 14 - doc.getTextWidth(`Generated ${new Date().toLocaleString()} — Confidential`),
      footY,
    );
  }

  doc.save(`cios-run-receipt-${data.runId}.pdf`);
}
