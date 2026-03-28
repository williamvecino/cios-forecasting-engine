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

export interface ForecastExportData {
  questionText: string;
  subject: string;
  timeHorizon: string;
  therapeuticArea: string;
  timestamp: string;
  signals: ExportableSignal[];
  gates: ExportableGate[];
  brandOutlook: number | null;
  constrainedProbability: number | null;
  judgment: JudgmentExport | null;
  barriers: ExportableDecisionItem[];
  actions: ExportableDecisionItem[];
  segments: ExportableDecisionItem[];
  triggerEvents: ExportableDecisionItem[];
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

function gatherExportData(): ForecastExportData {
  const activeQ = safeParse<any>("cios.activeQuestion", {});
  const caseId = activeQ.caseId || "unknown";
  const signals = safeParse<any[]>(`cios.signals:${caseId}`, []);
  const decomp = safeParse<any>(`cios.eventDecomposition:${caseId}`, {});
  const ta = localStorage.getItem("cios.therapeuticArea") || "general";
  const decideData = safeParse<any>(`cios.decideResult:${caseId}`, null);
  const judgmentData = safeParse<any>(`cios.judgmentResult:${caseId}`, null);

  const exportSignals: ExportableSignal[] = signals
    .filter((s: any) => s.accepted)
    .map((s: any) => ({
      text: s.text,
      direction: s.direction === "positive" ? "Supports" : s.direction === "negative" ? "Slows" : "Neutral",
      impact: s.impact || "Medium",
      reliability: s.reliability === "Confirmed" ? "Strong" : s.reliability === "Speculative" ? "Weak" : "Moderate",
      category: s.category || "evidence",
    }));

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

  return {
    questionText: activeQ.rawInput || activeQ.text || "",
    subject: activeQ.subject || "",
    timeHorizon: activeQ.timeHorizon || "",
    therapeuticArea: ta,
    timestamp: new Date().toISOString(),
    signals: exportSignals,
    gates: exportGates,
    brandOutlook: decomp.brand_outlook_probability ?? null,
    constrainedProbability: decomp.constrained_probability ?? null,
    judgment,
    barriers: mapDecisionItems(dd?.barriers),
    actions: mapDecisionItems(dd?.actions),
    segments: mapDecisionItems(dd?.segments),
    triggerEvents: mapDecisionItems(dd?.trigger_events),
  };
}

export function exportToJSON() {
  const data = gatherExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveAs(blob, `cios-forecast-${Date.now()}.json`);
}

export function exportToExcel() {
  const data = gatherExportData();
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ["CIOS Forecast Export"],
    [],
    ["Question", data.questionText],
    ["Subject", data.subject],
    ["Time Horizon", data.timeHorizon],
    ["Therapeutic Area", data.therapeuticArea],
    ["Export Date", data.timestamp],
    [],
    ["Forecast Probability", data.constrainedProbability != null ? `${Math.round(data.constrainedProbability * 100)}%` : "N/A"],
    ["Brand Outlook", data.brandOutlook != null ? `${Math.round(data.brandOutlook * 100)}%` : "N/A"],
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
  summarySheet["!cols"] = [{ wch: 20 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  if (data.signals.length > 0) {
    const signalHeader = ["Signal", "Direction", "Importance", "Confidence", "Category"];
    const signalRows = data.signals.map((s) => [s.text, s.direction, s.impact, s.reliability, s.category]);
    const signalSheet = XLSX.utils.aoa_to_sheet([signalHeader, ...signalRows]);
    signalSheet["!cols"] = [{ wch: 60 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, signalSheet, "Signals");
  }

  if (data.gates.length > 0) {
    const gateHeader = ["Gate", "Status", "Constrains To", "Reasoning"];
    const gateRows = data.gates.map((g) => [
      g.gate_label,
      g.status,
      `${Math.round(g.constrains_probability_to * 100)}%`,
      g.reasoning,
    ]);
    const gateSheet = XLSX.utils.aoa_to_sheet([gateHeader, ...gateRows]);
    gateSheet["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, gateSheet, "Gates");
  }

  const allDecisionRows = [
    ...data.barriers.map((b) => ["Barrier", b.title, b.severity_or_priority, b.source_gate_label, b.rationale]),
    ...data.actions.map((a) => ["Action", a.title, a.severity_or_priority, a.source_gate_label, a.rationale]),
    ...data.segments.map((s) => ["Segment", s.title, s.severity_or_priority, s.source_gate_label, s.rationale]),
    ...data.triggerEvents.map((t) => ["Trigger", t.title, t.severity_or_priority, t.source_gate_label, t.rationale]),
  ];
  if (allDecisionRows.length > 0) {
    const decisionHeader = ["Type", "Title", "Priority", "Source Gate", "Rationale"];
    const decisionSheet = XLSX.utils.aoa_to_sheet([decisionHeader, ...allDecisionRows]);
    decisionSheet["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, decisionSheet, "Decisions");
  }

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `cios-forecast-${Date.now()}.xlsx`);
}

export function exportToPDF() {
  const data = gatherExportData();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text("CIOS Forecast Summary", 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Export: ${new Date().toLocaleDateString()}`, 14, 28);

  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  let y = 38;

  doc.setFont("helvetica", "bold");
  doc.text("Question", 14, y);
  doc.setFont("helvetica", "normal");
  const qLines = doc.splitTextToSize(data.questionText || "N/A", 170);
  doc.text(qLines, 14, y + 6);
  y += 6 + qLines.length * 5;

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Subject:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.subject || "N/A", 50, y);
  y += 6;

  doc.text(`Time Horizon: ${data.timeHorizon || "N/A"}`, 14, y);
  y += 6;

  if (data.constrainedProbability != null) {
    doc.setFont("helvetica", "bold");
    doc.text("Forecast Probability:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${Math.round(data.constrainedProbability * 100)}%`, 60, y);
    y += 8;
  }

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

  if (data.signals.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Signals", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Signal", "Direction", "Importance", "Confidence"]],
      body: data.signals.map((s) => [s.text, s.direction, s.impact, s.reliability]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;
  }

  if (data.gates.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

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
        `${Math.round(g.constrains_probability_to * 100)}%`,
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
  }

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `CIOS Forecast Export — ${data.subject} — Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  doc.save(`cios-forecast-${Date.now()}.pdf`);
}
