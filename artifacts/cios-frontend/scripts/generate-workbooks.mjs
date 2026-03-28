import XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../public/workbooks");
mkdirSync(outDir, { recursive: true });

function createWorkbook(signals, fileName) {
  const aoa = [
    ["CIOS Signal Export", "Generated Workbook", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["ProgramID", "SignalLabel", "Direction", "Strength", "Confidence", "WhyItMatters", "ActiveFlag"],
    ...signals.map(s => [s.programId, s.signalLabel, s.direction, s.strength, s.confidence, s.whyItMatters, "Yes"]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "CIOS_Signal_Export");
  const outPath = resolve(outDir, fileName);
  writeFileSync(outPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log(`Created: ${outPath} (${signals.length} signals)`);
}

const miosBaosSignals = [
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Mortality and hospitalization reduction established strong outcome credibility", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Demonstrated survival benefit shifted heart failure treatment from symptomatic control to outcome modification" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "LDL reduction was dramatic but early outcome evidence lag created adoption hesitation", direction: "Slows adoption", strength: "Moderate", confidence: "High", whyItMatters: "Strong biomarker effect alone was insufficient until cardiovascular outcomes data matured" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Consistent efficacy across multiple inflammatory endpoints strengthened platform credibility", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Multi-indication success created perception of a dependable mechanism rather than a niche therapy" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Durable survival benefit established trust in immunotherapy mechanism", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Durable response shifted oncology practice patterns toward checkpoint inhibitors" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Slowing disease progression without symptom reversal required reframing clinical expectations", direction: "Slows adoption", strength: "Moderate", confidence: "High", whyItMatters: "Benefit was meaningful but not immediately perceptible to patients" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Transformational efficacy in rare disease justified rapid adoption despite high cost", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Magnitude of benefit outweighed economic barriers" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Broad genotype coverage dramatically expanded eligible patient population", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Expanded eligibility accelerated market penetration" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Weight loss magnitude exceeded historical expectations for pharmacologic therapy", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Effect size reset clinician expectations for obesity treatment" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Cardiovascular mortality reduction expanded positioning beyond glycemic control", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Outcome benefit redefined therapeutic value proposition" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Safety signal emergence constrained long-term adoption trajectory", direction: "Slows adoption", strength: "High", confidence: "High", whyItMatters: "Risk perception can override efficacy in chronic disease settings" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Physician inertia slowed switching from ACE inhibitors despite superior outcomes", direction: "Slows adoption", strength: "High", confidence: "High", whyItMatters: "Clinical superiority does not automatically overcome established prescribing routines" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Prior authorization complexity reduced prescribing enthusiasm", direction: "Slows adoption", strength: "High", confidence: "High", whyItMatters: "Administrative burden can suppress uptake regardless of clinical value" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Visible patient improvement reinforced clinician confidence and accelerated adoption", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Observable benefit strengthens prescribing momentum" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Strong KOL advocacy normalized checkpoint inhibitor use", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Expert endorsement accelerates guideline acceptance" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Patient perception of limited symptom improvement reduced adherence motivation", direction: "Slows adoption", strength: "Moderate", confidence: "High", whyItMatters: "Lack of felt benefit can weaken persistence" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Parent advocacy created strong demand pressure for early treatment", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Advocacy groups can accelerate therapy uptake" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Rapid visible improvement created strong word-of-mouth momentum among patients", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Peer experience strongly influences treatment demand" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "High patient demand exceeded supply capacity, constraining adoption speed", direction: "Slows adoption", strength: "High", confidence: "High", whyItMatters: "Supply limitations can cap early uptake" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Cardiologist adoption expanded use beyond endocrinology", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "New prescriber segments increase growth velocity" },
  { programId: "MIOS-BAOS-CAL-01", signalLabel: "Safety warnings increased clinician caution in long-term prescribing", direction: "Slows adoption", strength: "High", confidence: "High", whyItMatters: "Risk perception can quickly change prescribing behavior" },
];

const arikayceSignals = [
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Slowing disease progression without immediate symptom relief required expectation reframing", direction: "Slows early adoption", strength: "High", confidence: "High", whyItMatters: "Physicians initially hesitated because patients did not feel dramatically better, even though disease progression slowed" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Durable physiologic improvement drove rapid adoption despite variability in symptom response", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Durable improvement in lung function created strong confidence even when individual symptoms varied" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Modest symptom benefit but clear disease-modifying effect required education to drive uptake", direction: "Slows early adoption", strength: "Moderate", confidence: "High", whyItMatters: "Physicians needed reassurance that slowing decline was clinically meaningful even without dramatic symptom relief" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Strong biomarker improvement preceded widespread confidence in clinical outcomes", direction: "Slows early adoption", strength: "High", confidence: "High", whyItMatters: "Clinicians waited for outcome confirmation before changing prescribing behavior" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Consistent improvement across multiple endpoints built rapid confidence in treatment value", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Alignment between symptom improvement and objective measures reinforced trust" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Mortality benefit did not immediately overcome physician inertia", direction: "Slows adoption", strength: "High", confidence: "High", whyItMatters: "Even strong outcome data required time for clinicians to change established practice patterns" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Transformational efficacy outweighed concerns about administration burden", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Clear clinical benefit justified logistical complexity" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Safety signal emergence reduced clinician confidence despite strong efficacy", direction: "Slows adoption", strength: "High", confidence: "High", whyItMatters: "Risk perception can outweigh positive efficacy signals" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "Targeted efficacy in a defined population accelerated physician confidence", direction: "Supports adoption", strength: "High", confidence: "High", whyItMatters: "Clear patient selection criteria reduced uncertainty in prescribing decisions" },
  { programId: "ARIKAYCE-ANALOG-01", signalLabel: "High perceived clinical value overcame initial payer hesitation", direction: "Supports adoption", strength: "Moderate", confidence: "Moderate", whyItMatters: "Strong perceived benefit can drive system-level alignment" },
];

createWorkbook(miosBaosSignals, "MIOS_BAOS_Calibration_20_Signals.xlsx");
createWorkbook(arikayceSignals, "ARIKAYCE_Analog_10_Signals.xlsx");
console.log("Done.");
