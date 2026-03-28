import * as XLSX from "xlsx";

export interface ProgramHeader {
  programId: string;
  brand: string;
  company: string;
  molecule: string;
  indication: string;
  audience: string;
  currentBelief: string;
  desiredBelief: string;
  strategicQuestion: string;
  forecastHorizonMonths: number;
  programType: string;
  owner: string;
  asOfDate: string;
  activeFlag: boolean;
}

export interface RawSignalRow {
  programId: string;
  brand: string;
  strategicQuestion: string;
  signalId: string;
  signalLabel: string;
  signalCategory: string;
  direction: string;
  strength: string;
  confidence: string;
  sourceLayer: string;
  sourceReference: string;
  whyItMatters: string;
  forecastDomain: string;
  rank: number | null;
  activeFlag: boolean;
}

export interface ReadinessCheck {
  rule: string;
  passed: boolean;
  logic: string;
}

export interface TraceRow {
  programId: string;
  bridgeId: string;
  statementId: string;
  evidenceId: string;
  baosId: string;
  signalId: string;
  traceStatus: string;
  lastReviewed: string;
  owner: string;
  notes: string;
}

export interface WorkbookParseResult {
  success: boolean;
  fileName: string;
  programs: ProgramHeader[];
  activeProgram: ProgramHeader | null;
  signals: RawSignalRow[];
  readinessChecks: ReadinessCheck[];
  traceRows: TraceRow[];
  warnings: string[];
  errors: string[];
}

function extractHeaderedSheet(sheet: XLSX.WorkSheet): Record<string, string>[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (raw.length < 2) return [];

  const headerRow = raw[1];
  const firstKey = Object.keys(headerRow)[0];
  const columnKeys = Object.keys(headerRow);

  const headers: string[] = columnKeys.map((k) => String(headerRow[k]).trim());

  const result: Record<string, string>[] = [];
  for (let i = 2; i < raw.length; i++) {
    const row = raw[i];
    const obj: Record<string, string> = {};
    let hasAnyValue = false;
    for (let c = 0; c < columnKeys.length; c++) {
      const val = String(row[columnKeys[c]] ?? "").trim();
      const header = headers[c];
      if (header) {
        obj[header] = val;
        if (val) hasAnyValue = true;
      }
    }
    if (hasAnyValue) result.push(obj);
  }
  return result;
}

export function parseMiosBaosWorkbook(data: ArrayBuffer, fileName: string): WorkbookParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array" });
  } catch (e: any) {
    return {
      success: false,
      fileName,
      programs: [],
      activeProgram: null,
      signals: [],
      readinessChecks: [],
      traceRows: [],
      warnings: [],
      errors: [`Failed to read workbook: ${e?.message || "Unknown error"}`],
    };
  }

  const requiredSheets = ["Program_Header", "CIOS_Signal_Export"];
  for (const s of requiredSheets) {
    if (!workbook.SheetNames.includes(s)) {
      errors.push(`Workbook is missing required sheet: ${s}.`);
    }
  }
  if (errors.length > 0) {
    return { success: false, fileName, programs: [], activeProgram: null, signals: [], readinessChecks: [], traceRows: [], warnings, errors };
  }

  const programRows = extractHeaderedSheet(workbook.Sheets["Program_Header"]);
  const programs: ProgramHeader[] = programRows.map((r) => ({
    programId: r["ProgramID"] || "",
    brand: r["Brand"] || "",
    company: r["Company"] || "",
    molecule: r["Molecule"] || "",
    indication: r["Indication"] || "",
    audience: r["Audience"] || "",
    currentBelief: r["CurrentBelief"] || "",
    desiredBelief: r["DesiredBelief"] || "",
    strategicQuestion: r["StrategicQuestion"] || "",
    forecastHorizonMonths: parseInt(r["ForecastHorizonMonths"] || "12", 10) || 12,
    programType: r["ProgramType"] || "",
    owner: r["Owner"] || "",
    asOfDate: r["AsOfDate"] || "",
    activeFlag: (r["ActiveFlag"] || "").toLowerCase() === "yes",
  })).filter((p) => p.programId);

  const activePrograms = programs.filter((p) => p.activeFlag);
  let activeProgram: ProgramHeader | null = null;
  if (activePrograms.length === 0) {
    errors.push("No active program found in Program_Header.");
  } else if (activePrograms.length > 1) {
    errors.push("Multiple active programs found. Set only one ActiveFlag = Yes.");
  } else {
    activeProgram = activePrograms[0];
  }

  if (!activeProgram) {
    return { success: false, fileName, programs, activeProgram: null, signals: [], readinessChecks: [], traceRows: [], warnings, errors };
  }

  const signalRows = extractHeaderedSheet(workbook.Sheets["CIOS_Signal_Export"]);
  const signals: RawSignalRow[] = [];
  for (let i = 0; i < signalRows.length; i++) {
    const r = signalRows[i];
    const rowNum = i + 3;

    if (r["ProgramID"] !== activeProgram.programId) {
      if (r["ProgramID"]) warnings.push(`Row ${rowNum}: ProgramID "${r["ProgramID"]}" does not match active program "${activeProgram.programId}". Skipped.`);
      continue;
    }
    if ((r["ActiveFlag"] || "").toLowerCase() !== "yes") {
      warnings.push(`Row ${rowNum}: Signal "${r["SignalID"] || "unknown"}" is not active. Skipped.`);
      continue;
    }
    const missing: string[] = [];
    if (!r["SignalLabel"]) missing.push("SignalLabel");
    if (!r["Direction"]) missing.push("Direction");
    if (!r["Strength"]) missing.push("Strength");
    if (!r["Confidence"]) missing.push("Confidence");
    if (missing.length > 0) {
      warnings.push(`Row ${rowNum}: Skipped due to missing: ${missing.join(", ")}.`);
      continue;
    }

    signals.push({
      programId: r["ProgramID"],
      brand: r["Brand"] || "",
      strategicQuestion: r["StrategicQuestion"] || "",
      signalId: r["SignalID"] || `IMPORT_${i}`,
      signalLabel: r["SignalLabel"],
      signalCategory: r["SignalCategory"] || "",
      direction: r["Direction"],
      strength: r["Strength"],
      confidence: r["Confidence"],
      sourceLayer: r["SourceLayer"] || "",
      sourceReference: r["SourceReference"] || "",
      whyItMatters: r["WhyItMatters"] || "",
      forecastDomain: r["ForecastDomain"] || "",
      rank: r["Rank"] ? parseInt(r["Rank"], 10) || null : null,
      activeFlag: true,
    });
  }

  if (signals.length === 0) {
    errors.push("No valid CIOS signals found for the active program.");
  }

  let readinessChecks: ReadinessCheck[] = [];
  if (workbook.SheetNames.includes("CIOS_Readiness")) {
    const readinessRaw = extractHeaderedSheet(workbook.Sheets["CIOS_Readiness"]);
    const readinessData = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["CIOS_Readiness"], { defval: "" });

    for (const row of readinessData) {
      const vals = Object.values(row).map((v) => String(v).trim());
      const ruleIdx = vals.findIndex((v) => /belief bridge|statements|evidence|signals/i.test(v));
      if (ruleIdx >= 0) {
        const passIdx = vals.findIndex((v) => v === "Yes" || v === "No");
        const logicIdx = vals.findIndex((v, idx) => idx > passIdx && v.length > 10);
        if (passIdx >= 0) {
          readinessChecks.push({
            rule: vals[ruleIdx],
            passed: vals[passIdx] === "Yes",
            logic: logicIdx >= 0 ? vals[logicIdx] : "",
          });
        }
      }
    }
  } else {
    warnings.push("Readiness sheet not found.");
  }

  let traceRows: TraceRow[] = [];
  if (workbook.SheetNames.includes("Traceability_Map")) {
    const traceRaw = extractHeaderedSheet(workbook.Sheets["Traceability_Map"]);
    traceRows = traceRaw.map((r) => ({
      programId: r["ProgramID"] || "",
      bridgeId: r["BridgeID"] || "",
      statementId: r["StatementID"] || "",
      evidenceId: r["EvidenceID"] || "",
      baosId: r["BAOSID"] || "",
      signalId: r["SignalID"] || "",
      traceStatus: r["TraceStatus"] || "",
      lastReviewed: r["LastReviewed"] || "",
      owner: r["Owner"] || "",
      notes: r["Notes"] || "",
    })).filter((t) => t.signalId);
  }

  return {
    success: errors.length === 0,
    fileName,
    programs,
    activeProgram,
    signals,
    readinessChecks,
    traceRows,
    warnings,
    errors,
  };
}
