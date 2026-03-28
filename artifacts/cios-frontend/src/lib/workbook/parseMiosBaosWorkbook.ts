import * as XLSX from "xlsx";

export interface RawSignalRow {
  programId: string;
  signalLabel: string;
  direction: string;
  strength: string;
  confidence: string;
  whyItMatters: string;
}

export interface ParseResult {
  success: boolean;
  fileName: string;
  signals: RawSignalRow[];
  warnings: string[];
  errors: string[];
}

function extractHeaderedSheet(sheet: XLSX.WorkSheet): Record<string, string>[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (raw.length < 2) return [];

  const headerRow = raw[1];
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

export function parseMiosBaosWorkbook(data: ArrayBuffer, fileName: string): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array" });
  } catch (e: any) {
    return {
      success: false,
      fileName,
      signals: [],
      warnings: [],
      errors: [`Failed to read workbook: ${e?.message || "Unknown error"}`],
    };
  }

  if (!workbook.SheetNames.includes("CIOS_Signal_Export")) {
    return {
      success: false,
      fileName,
      signals: [],
      warnings: [],
      errors: ["Workbook is missing required sheet: CIOS_Signal_Export"],
    };
  }

  const rows = extractHeaderedSheet(workbook.Sheets["CIOS_Signal_Export"]);
  const signals: RawSignalRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 3;

    if ((r["ActiveFlag"] || "").toLowerCase() !== "yes") {
      continue;
    }

    const missing: string[] = [];
    if (!r["SignalLabel"]) missing.push("SignalLabel");
    if (!r["Direction"]) missing.push("Direction");
    if (!r["Strength"]) missing.push("Strength");
    if (!r["Confidence"]) missing.push("Confidence");
    if (missing.length > 0) {
      warnings.push(`Row ${rowNum}: Skipped — missing ${missing.join(", ")}.`);
      continue;
    }

    signals.push({
      programId: r["ProgramID"] || "",
      signalLabel: r["SignalLabel"],
      direction: r["Direction"],
      strength: r["Strength"],
      confidence: r["Confidence"],
      whyItMatters: r["WhyItMatters"] || "",
    });
  }

  if (signals.length === 0) {
    errors.push("No active signals found in CIOS_Signal_Export.");
  }

  return {
    success: errors.length === 0,
    fileName,
    signals,
    warnings,
    errors,
  };
}
