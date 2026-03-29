import { Router } from "express";
import { db, signalsTable, casesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import multer from "multer";
import * as XLSX from "xlsx";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx and .xls files are accepted"));
    }
  },
});

interface WorkbookSignalRow {
  ProgramID: string;
  SignalLabel: string;
  Direction: string;
  Strength: string | number;
  Confidence: string | number;
  WhyItMatters: string;
  ActiveFlag: string;
}

function normalizeDirection(raw: string): string {
  const d = (raw || "").trim().toLowerCase();
  if (d === "positive" || d === "up" || d === "bullish" || d === "+") return "Positive";
  if (d === "negative" || d === "down" || d === "bearish" || d === "-") return "Negative";
  return "Neutral";
}

function normalizeStrength(raw: string | number): number {
  if (typeof raw === "number") return Math.max(0, Math.min(1, raw));
  const parsed = parseFloat(raw);
  if (!isNaN(parsed)) return Math.max(0, Math.min(1, parsed));
  const s = (raw || "").trim().toLowerCase();
  if (s === "high" || s === "strong") return 0.85;
  if (s === "medium" || s === "moderate") return 0.6;
  if (s === "low" || s === "weak") return 0.35;
  return 0.5;
}

function normalizeConfidence(raw: string | number): number {
  if (typeof raw === "number") return Math.max(0, Math.min(1, raw));
  const parsed = parseFloat(raw);
  if (!isNaN(parsed)) return Math.max(0, Math.min(1, parsed));
  const c = (raw || "").trim().toLowerCase();
  if (c === "high") return 0.85;
  if (c === "medium" || c === "moderate") return 0.6;
  if (c === "low") return 0.35;
  return 0.5;
}

function strengthToLikelihoodRatio(strength: number, direction: string): number {
  if (direction === "Positive") return 1 + strength * 2;
  if (direction === "Negative") return 1 / (1 + strength * 2);
  return 1.0;
}

router.post(
  "/cases/:caseId/workbook-import",
  upload.single("workbook"),
  async (req, res) => {
    try {
      const { caseId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No workbook file uploaded" });
      }

      const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
      if (!caseRows[0]) {
        return res.status(404).json({ error: "Case not found" });
      }

      const workbook = XLSX.read(file.buffer, { type: "buffer" });

      const sheetName = "CIOS_Signal_Export";
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        const available = workbook.SheetNames.join(", ");
        return res.status(400).json({
          error: `Sheet "${sheetName}" not found in workbook`,
          availableSheets: available,
        });
      }

      const rawRows = XLSX.utils.sheet_to_json<WorkbookSignalRow>(sheet);

      if (rawRows.length === 0) {
        return res.status(400).json({ error: `Sheet "${sheetName}" is empty` });
      }

      const requiredColumns = ["ProgramID", "SignalLabel", "Direction", "Strength", "Confidence", "WhyItMatters", "ActiveFlag"];
      const firstRow = rawRows[0];
      const missingColumns = requiredColumns.filter(col => !(col in firstRow));
      if (missingColumns.length > 0) {
        return res.status(400).json({
          error: `Missing required columns: ${missingColumns.join(", ")}`,
          foundColumns: Object.keys(firstRow),
        });
      }

      const activeRows = rawRows.filter(row => {
        const flag = (row.ActiveFlag || "").toString().trim().toLowerCase();
        return flag === "yes" || flag === "true" || flag === "1" || flag === "y";
      });

      if (activeRows.length === 0) {
        return res.status(400).json({
          error: "No rows with ActiveFlag = Yes found",
          totalRows: rawRows.length,
        });
      }

      const importedSignals: any[] = [];

      for (const row of activeRows) {
        const direction = normalizeDirection(row.Direction);
        const strength = normalizeStrength(row.Strength);
        const confidence = normalizeConfidence(row.Confidence);
        const lr = strengthToLikelihoodRatio(strength, direction);

        const signal = {
          id: randomUUID(),
          signalId: `WBI-${caseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${randomUUID().slice(0, 6)}`,
          caseId,
          brand: caseRows[0].subject || "",
          signalDescription: row.WhyItMatters || row.SignalLabel,
          signalType: row.SignalLabel,
          direction,
          strengthScore: strength,
          reliabilityScore: confidence,
          likelihoodRatio: Number(lr.toFixed(4)),
          status: "active",
          createdByType: "system",
          createdById: `workbook-import:${row.ProgramID}`,
          sourceLabel: `MIOS/BAOS Workbook Import (${row.ProgramID})`,
          notes: `Imported from CIOS_Signal_Export sheet. Program: ${row.ProgramID}. Original label: ${row.SignalLabel}.`,
          strength: strength >= 0.7 ? "High" : strength >= 0.4 ? "Medium" : "Low",
          reliability: confidence >= 0.7 ? "High" : confidence >= 0.4 ? "Medium" : "Low",
        };

        importedSignals.push(signal);
      }

      await db.transaction(async (tx) => {
        await tx.delete(signalsTable).where(
          and(
            eq(signalsTable.caseId, caseId),
            eq(signalsTable.createdByType, "system"),
          )
        );
        await tx.insert(signalsTable).values(importedSignals);
      });

      res.status(201).json({
        imported: importedSignals.length,
        skipped: rawRows.length - activeRows.length,
        totalInSheet: rawRows.length,
        signals: importedSignals.map(s => ({
          signalId: s.signalId,
          description: s.signalDescription,
          type: s.signalType,
          direction: s.direction,
          strength: s.strengthScore,
          confidence: s.reliabilityScore,
          likelihoodRatio: s.likelihoodRatio,
        })),
      });
    } catch (err: any) {
      console.error("[workbook-import] Error:", err?.message || err);
      if (err.message?.includes("Only .xlsx")) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: "Failed to import workbook signals" });
    }
  },
);

router.get("/workbook-import/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const templateData = [
    {
      ProgramID: "PROG-001",
      SignalLabel: "Phase III Clinical",
      Direction: "Positive",
      Strength: 0.8,
      Confidence: 0.75,
      WhyItMatters: "Primary endpoint met with statistical significance in Phase III trial",
      ActiveFlag: "Yes",
    },
    {
      ProgramID: "PROG-001",
      SignalLabel: "Safety Signal",
      Direction: "Negative",
      Strength: 0.6,
      Confidence: 0.7,
      WhyItMatters: "Grade 3 adverse events observed at higher rate than comparator",
      ActiveFlag: "Yes",
    },
    {
      ProgramID: "PROG-001",
      SignalLabel: "Payer Coverage",
      Direction: "Positive",
      Strength: 0.5,
      Confidence: 0.5,
      WhyItMatters: "Early payer discussions suggest favorable coverage positioning",
      ActiveFlag: "No",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  XLSX.utils.book_append_sheet(wb, ws, "CIOS_Signal_Export");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=CIOS_Signal_Export_Template.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

export default router;
