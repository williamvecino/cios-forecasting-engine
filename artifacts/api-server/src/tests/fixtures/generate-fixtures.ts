import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

const dir = path.dirname(new URL(import.meta.url).pathname);

const fixtures: Record<string, () => void> = {
  "clean-text.txt": () => {
    fs.writeFileSync(path.join(dir, "clean-text.txt"), `ARIKAYCE Market Access Strategy

Objective: Evaluate whether ARIKAYCE (amikacin liposome inhalation suspension) can achieve target formulary placement across top-20 health plans within 12 months.

Key Findings:
1. Current coverage: 8 of 20 target plans have ARIKAYCE on formulary with prior authorization
2. Three plans have denied coverage citing insufficient long-term safety data
3. Competitor landscape: No direct competitors in NTM lung disease; closest alternative is IV amikacin
4. KOL sentiment: 85% of surveyed pulmonologists view ARIKAYCE favorably
5. Patient access: Co-pay programs reach approximately 60% of eligible patients
6. Real-world evidence: 18-month post-launch data shows 73% culture conversion rate
7. Regulatory: FDA granted breakthrough therapy designation; supplemental NDA for expanded indication pending

Barriers:
- Prior authorization requirements extend time-to-therapy by average 14 days
- Specialty pharmacy network limited to 3 distributors
- Annual cost per patient: $198,000

Timeline: Q4 2024 target for 15/20 plan coverage`);
  },

  "messy-email.txt": () => {
    fs.writeFileSync(path.join(dir, "messy-email.txt"), `From: Sarah Chen <sarah.chen@pharmapartner.com>
To: Team Launch <team-launch@company.com>
Subject: RE: RE: FW: PDL1 update - URGENT
Date: Mon, 15 Jan 2024 09:23:41 -0500

Hey all —

Just got off the call w/ the advisory board. Couple things:

1) Dr. Martinez is now saying he WON'T present at ASCO if we don't have the updated OS data by March. He was pretty firm about it. Not sure what happened there bc he was on board last month??
2) Keytruda combo data is looking stronger than expected in the 2L setting — Merck is going to announce at the investor day next week. This could seriously impact our positioning.
3) The Germany launch is delayed AGAIN. Something about the G-BA dossier not being ready. Hans said "maybe Q3" but honestly who knows at this point.
4) GOOD NEWS: The community oncology pilot in the southeast is working. 3 sites, 47 pts enrolled, adherence at 89%. Jennifer wants to expand to 10 sites.
5) Payer meeting w/ Aetna pushed to Feb. UHC still hasn't responded. Anthem said they need the HEOR model updated.

Also — can someone figure out what's going on with the patient support hub? I'm hearing complaints from the field about wait times. Mike from market access said it's a "known issue" but didn't give a timeline.

This is getting messy. We need a war room meeting this week.

-S

PS the slides from the advisory board are attached but they're in draft form, don't share outside.`);
  },

  "scientific-abstract.txt": () => {
    fs.writeFileSync(path.join(dir, "scientific-abstract.txt"), `Abstract #4521 — ASCO Annual Meeting 2024

TITLE: Phase III Randomized Trial of Novel Anti-PD-L1 Agent XYZ-2847 vs Standard Chemotherapy in Previously Treated Advanced Non-Small Cell Lung Cancer: Primary Analysis of the HORIZON-3 Study

BACKGROUND: XYZ-2847 is a next-generation anti-PD-L1 antibody with enhanced Fc-mediated ADCC activity. HORIZON-3 evaluated XYZ-2847 monotherapy vs docetaxel in patients with advanced NSCLC who progressed on platinum-based chemotherapy.

METHODS: 892 patients were randomized 2:1 to XYZ-2847 (1200mg IV Q3W) or docetaxel (75mg/m2 IV Q3W). Primary endpoint: overall survival (OS). Key secondary endpoints: progression-free survival (PFS), objective response rate (ORR), duration of response (DOR).

RESULTS: At median follow-up of 24.1 months:
- Median OS: 15.7 months (XYZ-2847) vs 10.3 months (docetaxel); HR 0.71 (95% CI: 0.59-0.85; p<0.001)
- Median PFS: 5.4 months vs 3.1 months; HR 0.68 (95% CI: 0.57-0.81)
- ORR: 28.3% vs 13.1%
- Median DOR: 18.2 months vs 5.6 months
- Grade ≥3 treatment-related AEs: 18.7% vs 43.2%
- Immune-related AEs of any grade: 31.4% (pneumonitis 4.2%, hepatitis 3.1%, colitis 2.8%)

PD-L1 subgroup analysis:
- PD-L1 ≥50% (n=312): HR for OS 0.52 (0.39-0.70)
- PD-L1 1-49% (n=341): HR for OS 0.78 (0.62-0.98)
- PD-L1 <1% (n=239): HR for OS 0.94 (0.72-1.22)

CONCLUSIONS: XYZ-2847 demonstrated statistically significant and clinically meaningful improvement in OS compared to docetaxel in previously treated advanced NSCLC, with a favorable safety profile. Benefit was most pronounced in PD-L1 ≥50% patients. These results support regulatory filing for this indication.`);
  },

  "market-research.txt": () => {
    fs.writeFileSync(path.join(dir, "market-research.txt"), `MARKET LANDSCAPE REPORT: Cardiovascular Device Market — Q1 2024

EXECUTIVE SUMMARY
The transcatheter aortic valve replacement (TAVR) market is undergoing significant structural shifts driven by trial readouts and competitive dynamics.

MARKET SIZE & GROWTH
- Global TAVR market: $6.2B (2023), projected $9.1B by 2027 (CAGR 10.1%)
- US accounts for 58% of global procedures
- Approximately 185,000 TAVR procedures performed in the US in 2023

COMPETITIVE LANDSCAPE
Edwards Lifesciences (SAPIEN 3 Ultra RESILIA): 62% US market share
Medtronic (Evolut PRO+/FX): 31% US market share
Abbott (Navitor): 5% US market share, growing
Boston Scientific (ACURATE neo2): EU only, US IDE trial ongoing

KEY DEVELOPMENTS
1. Edwards EARLY TAVR trial showed benefit in asymptomatic severe AS (NEJM Jan 2024)
2. Medtronic Evolut FX received expanded indication for low-risk patients
3. Abbott Navitor 2-year data presented at TVT showed non-inferiority vs SAPIEN 3
4. Boston Scientific US IDE trial enrollment at 78% (estimated completion Q3 2024)

PAYER DYNAMICS
- CMS national coverage determination (NCD) expanded in 2023 to include low-risk patients
- Average reimbursement: $52,000 per procedure (hospital setting)
- Prior authorization rates declining: 23% in 2023 vs 41% in 2021

BARRIERS TO ADOPTION
- Operator training requirements: minimum 50 procedures for certification
- Heart team mandate adds administrative burden
- Rural access: 73% of TAVR centers are in urban areas
- Patient awareness remains low outside cardiology referral networks

FORECAST IMPLICATIONS
The market is moving toward expansion into moderate and low-risk populations. First-mover advantage in the asymptomatic indication could shift 5-8% market share within 18 months.`);
  },

  "old-rfp.txt": () => {
    fs.writeFileSync(path.join(dir, "old-rfp.txt"), `REQUEST FOR PROPOSAL
Agency Services for Anti-PD-L1 Antibody Program
Issued: January 2015

1. INTRODUCTION
Genentech invites qualified agencies to submit proposals for the US commercial launch of MPDL3280A, an engineered anti-PDL1 antibody designed to harness the immune system to fight cancer.

2. BACKGROUND
MPDL3280A is designed to prevent PD-L1 from binding to PD-1 and B7.1. US launch planned for:
- Urothelial Bladder Cancer (UBC): Q4 2016
- Non-Small Cell Lung Cancer (NSCLC): Q4 2016

3. SCOPE OF WORK
- Develop branded and unbranded disease awareness campaigns
- Create HCP educational materials on PD-L1 pathway and mechanism of action
- Patient campaign development (branded and unbranded)
- Digital strategy and execution
- Congress support materials

4. REQUIREMENTS
- Experience in oncology/immuno-oncology launches
- Demonstrated patient engagement capabilities
- Compliance with PhRMA guidelines
- Risk management and business continuity planning

5. EVALUATION CRITERIA
- Strategic thinking and creative approach
- Oncology experience and team composition
- Cost structure and staffing model
- Cultural fit with Genentech

6. TIMELINE
- RFP Response Due: February 15, 2015
- Agency Presentations: March 2-6, 2015
- Agency Selection: March 20, 2015
- Engagement Start: April 1, 2015`);
  },

  "spreadsheet-data.xlsx": () => {
    const wb = XLSX.utils.book_new();

    const data1 = [
      ["Region", "Drug", "Prescriptions Q1", "Prescriptions Q2", "Growth %", "Market Share %"],
      ["Northeast", "DrugA", 12500, 14200, 13.6, 34.2],
      ["Southeast", "DrugA", 8900, 10100, 13.5, 28.7],
      ["Midwest", "DrugA", 7200, 7800, 8.3, 31.1],
      ["West", "DrugA", 11000, 12500, 13.6, 29.8],
      ["Northeast", "DrugB (competitor)", 9800, 10500, 7.1, 25.3],
      ["Southeast", "DrugB (competitor)", 11200, 11800, 5.4, 33.6],
      ["Midwest", "DrugB (competitor)", 6500, 6900, 6.2, 27.5],
      ["West", "DrugB (competitor)", 10200, 10800, 5.9, 25.7],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(data1);
    XLSX.utils.book_append_sheet(wb, ws1, "Prescriptions");

    const data2 = [
      ["Payer", "Coverage Status", "Prior Auth Required", "Step Therapy", "Copay Tier", "Notes"],
      ["UnitedHealthcare", "Covered", "Yes", "No", "Specialty", "Updated Jan 2024"],
      ["Anthem", "Pending Review", "TBD", "TBD", "TBD", "Dossier submitted Dec 2023"],
      ["Aetna", "Covered", "Yes", "Yes - must fail generic first", "Specialty", "Restrictive"],
      ["Cigna", "Not Covered", "N/A", "N/A", "N/A", "Appeal in progress"],
      ["Humana", "Covered", "No", "No", "Preferred Specialty", "Most favorable"],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(data2);
    XLSX.utils.book_append_sheet(wb, ws2, "Payer Coverage");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Metric", "Target", "Actual", "Status"],
      ["Formulary Coverage", "80%", "62%", "Behind"],
      ["New Patient Starts", "500/month", "340/month", "Behind"],
      ["HCP Awareness", "75%", "71%", "On Track"],
      ["Patient Adherence 6mo", "65%", "58%", "At Risk"],
    ]), "KPIs");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(path.join(dir, "spreadsheet-data.xlsx"), buf);
  },

  "csv-data.csv": () => {
    fs.writeFileSync(path.join(dir, "csv-data.csv"), `site_id,investigator,enrollment_target,enrolled,screen_failures,dropout_rate,last_updated
SITE-001,Dr. Williams,45,42,8,0.12,2024-01-15
SITE-002,Dr. Patel,60,55,12,0.09,2024-01-14
SITE-003,Dr. Kim,30,18,6,0.22,2024-01-15
SITE-004,Dr. Garcia,50,49,3,0.06,2024-01-13
SITE-005,Dr. Johnson,40,22,15,0.18,2024-01-15
SITE-006,Dr. Lee,55,51,7,0.08,2024-01-14
SITE-007,Dr. Brown,35,10,4,0.30,2024-01-15
SITE-008,Dr. Martinez,45,44,5,0.07,2024-01-14`);
  },

  "minimal-content.txt": () => {
    fs.writeFileSync(path.join(dir, "minimal-content.txt"), `Drug launch Q3`);
  },

  "gibberish.txt": () => {
    fs.writeFileSync(path.join(dir, "gibberish.txt"), `asdfghjkl zxcvbnm qwerty 12345 !@#$%`);
  },

  "empty.txt": () => {
    fs.writeFileSync(path.join(dir, "empty.txt"), ``);
  },
};

for (const [name, gen] of Object.entries(fixtures)) {
  gen();
  console.log(`Generated: ${name}`);
}

console.log(`\nAll ${Object.keys(fixtures).length} fixtures generated.`);
