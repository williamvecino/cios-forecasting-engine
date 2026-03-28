import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ImportedRow {
  text: string;
  direction?: "positive" | "negative" | "neutral";
  strength?: "High" | "Medium" | "Low";
  reliability?: "Confirmed" | "Probable" | "Speculative";
  category?: string;
  source_url?: string;
  signal_source?: "internal" | "external" | "missing";
}

export interface ImportPreview {
  rows: ImportedRow[];
  totalRows: number;
  detectedColumns: string[];
  mappedFields: Record<string, string>;
  warnings: string[];
}

const FIELD_ALIASES: Record<string, string[]> = {
  text: ["signal", "signal_text", "description", "finding", "insight", "observation", "text", "title", "name", "detail", "summary", "note", "message"],
  direction: ["direction", "polarity", "sentiment", "impact_direction", "trend", "effect", "supports", "support"],
  strength: ["strength", "importance", "impact", "weight", "magnitude", "priority", "level"],
  reliability: ["reliability", "confidence", "certainty", "quality", "evidence_quality", "source_quality"],
  category: ["category", "type", "signal_type", "domain", "area", "family", "class", "bucket", "group"],
  source_url: ["source_url", "url", "source", "link", "reference", "ref"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function detectFieldMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalizedHeaders.findIndex((h) => h === alias || h.includes(alias));
      if (idx !== -1 && !Object.values(mapping).includes(headers[idx])) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }

  if (!mapping.text && headers.length > 0) {
    const longestCol = headers.reduce((best, h) => (h.length > best.length ? h : best), "");
    mapping.text = longestCol;
  }

  return mapping;
}

function parseDirection(val: string | undefined): "positive" | "negative" | "neutral" {
  if (!val) return "neutral";
  const v = val.toLowerCase().trim();
  if (["positive", "supports", "yes", "up", "for", "favorable", "bullish", "1", "true"].includes(v)) return "positive";
  if (["negative", "slows", "against", "down", "unfavorable", "bearish", "-1", "false", "no"].includes(v)) return "negative";
  return "neutral";
}

function parseStrength(val: string | undefined): "High" | "Medium" | "Low" {
  if (!val) return "Medium";
  const v = val.toLowerCase().trim();
  if (["high", "strong", "critical", "major", "3", "large"].includes(v)) return "High";
  if (["low", "weak", "minor", "1", "small"].includes(v)) return "Low";
  return "Medium";
}

function parseReliability(val: string | undefined): "Confirmed" | "Probable" | "Speculative" {
  if (!val) return "Probable";
  const v = val.toLowerCase().trim();
  if (["confirmed", "strong", "high", "verified", "certain", "3"].includes(v)) return "Confirmed";
  if (["speculative", "weak", "low", "uncertain", "preliminary", "1"].includes(v)) return "Speculative";
  return "Probable";
}

function rowToImportedRow(row: Record<string, string>, mapping: Record<string, string>): ImportedRow | null {
  const textCol = mapping.text;
  if (!textCol || !row[textCol]?.trim()) return null;

  return {
    text: row[textCol].trim(),
    direction: parseDirection(mapping.direction ? row[mapping.direction] : undefined),
    strength: parseStrength(mapping.strength ? row[mapping.strength] : undefined),
    reliability: parseReliability(mapping.reliability ? row[mapping.reliability] : undefined),
    category: mapping.category ? row[mapping.category]?.trim() : undefined,
    source_url: mapping.source_url ? row[mapping.source_url]?.trim() : undefined,
  };
}

export function parseCSV(content: string): ImportPreview {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields || [];
  const mapping = detectFieldMapping(headers);
  const warnings: string[] = [];

  if (!mapping.text) {
    warnings.push("No signal text column detected. Using the first column.");
    if (headers.length > 0) mapping.text = headers[0];
  }

  const rows: ImportedRow[] = [];
  for (const row of result.data) {
    const parsed = rowToImportedRow(row, mapping);
    if (parsed) rows.push(parsed);
  }

  if (result.errors.length > 0) {
    warnings.push(`${result.errors.length} row(s) had parsing issues.`);
  }

  return {
    rows,
    totalRows: result.data.length,
    detectedColumns: headers,
    mappedFields: mapping,
    warnings,
  };
}

export function parseExcel(buffer: ArrayBuffer): ImportPreview {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

  if (data.length === 0) {
    return { rows: [], totalRows: 0, detectedColumns: [], mappedFields: {}, warnings: ["Empty spreadsheet."] };
  }

  const headers = Object.keys(data[0]);
  const mapping = detectFieldMapping(headers);
  const warnings: string[] = [];

  if (!mapping.text) {
    warnings.push("No signal text column detected. Using the first column.");
    if (headers.length > 0) mapping.text = headers[0];
  }

  const rows: ImportedRow[] = [];
  for (const row of data) {
    const stringRow: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      stringRow[k] = String(v);
    }
    const parsed = rowToImportedRow(stringRow, mapping);
    if (parsed) rows.push(parsed);
  }

  return {
    rows,
    totalRows: data.length,
    detectedColumns: headers,
    mappedFields: mapping,
    warnings,
  };
}

export function parseJSON(content: string): ImportPreview {
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return { rows: [], totalRows: 0, detectedColumns: [], mappedFields: {}, warnings: ["Invalid JSON file."] };
  }

  let records: Record<string, string>[] = [];

  if (Array.isArray(parsed)) {
    records = parsed.map((item) => {
      const row: Record<string, string> = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        row[k] = String(v ?? "");
      }
      return row;
    });
  } else if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (arrayKey) {
      records = (obj[arrayKey] as Record<string, unknown>[]).map((item) => {
        const row: Record<string, string> = {};
        for (const [k, v] of Object.entries(item)) {
          row[k] = String(v ?? "");
        }
        return row;
      });
    } else {
      warnings.push("JSON structure not recognized. Expected an array of objects.");
      return { rows: [], totalRows: 0, detectedColumns: [], mappedFields: {}, warnings };
    }
  }

  if (records.length === 0) {
    return { rows: [], totalRows: 0, detectedColumns: [], mappedFields: {}, warnings: ["No records found in JSON."] };
  }

  const headers = Object.keys(records[0]);
  const mapping = detectFieldMapping(headers);

  if (!mapping.text) {
    warnings.push("No signal text column detected. Using the first column.");
    if (headers.length > 0) mapping.text = headers[0];
  }

  const rows: ImportedRow[] = [];
  for (const row of records) {
    const p = rowToImportedRow(row, mapping);
    if (p) rows.push(p);
  }

  return {
    rows,
    totalRows: records.length,
    detectedColumns: headers,
    mappedFields: mapping,
    warnings,
  };
}

export function parseFile(file: File): Promise<ImportPreview> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv" || ext === "tsv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(parseCSV(e.target?.result as string));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(parseExcel(e.target?.result as ArrayBuffer));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    } else if (ext === "json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(parseJSON(e.target?.result as string));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    } else {
      reject(new Error(`Unsupported file type: .${ext}. Use CSV, Excel (.xlsx), or JSON.`));
    }
  });
}
