import { Router } from "express";
import { db, referenceCasesTable, forecastLedgerTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const SEED_CASES = [
  {
    referenceCaseId: "REF-001",
    caseName: "Orphan Pulmonary — Strong Clinical, Slow Access",
    decisionDomain: "Rare disease / Orphan",
    questionText: "Will the orphan drug achieve target specialist adoption within 12 months given strong Phase III data but limited payer coverage?",
    comparisonGroups: JSON.stringify(["Rapid adoption", "Slow adoption"]),
    forecastHorizon: "12 months",
    initialForecast: 0.72,
    finalForecast: 0.58,
    confidenceLevel: "High",
    evidenceDiversityScore: 0.35,
    posteriorFragilityScore: 0.42,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 4,
    keyDrivers: JSON.stringify([
      { desc: "Phase III met primary endpoint with statistical significance", lr: 2.4 },
      { desc: "KOL endorsement at major pulmonary conference", lr: 1.8 },
      { desc: "Orphan drug designation provided regulatory pathway advantage", lr: 1.5 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Payer prior authorization requirements created 6-week delays", lr: 0.65 },
      { desc: "Community pulmonologists unfamiliar with nebulized delivery protocol", lr: 0.72 },
      { desc: "Specialty pharmacy distribution limited to 3 networks", lr: 0.78 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 4, echoes: 2, translations: 1 },
      { cluster: "KOL opinion", count: 2, echoes: 1, translations: 0 }
    ]),
    outcome: "Adoption reached 60% of target at 12 months",
    resolutionType: "partially_resolved",
    brierScore: 0.0196,
    calibrationLesson: "Clinical strength alone did not overcome workflow friction in community settings. Payer access barriers and unfamiliar delivery protocols created adoption ceilings that strong efficacy data could not breach within the forecast horizon.",
    biasPattern: "KOL enthusiasm inflation",
    structuralTags: JSON.stringify(["strong clinical / weak access", "workflow friction", "payer resistance", "specialty ownership mismatch"]),
    caseSummary: "Strong Phase III data and KOL enthusiasm drove initial high confidence, but payer access friction and community workflow unfamiliarity created a persistent adoption ceiling. The forecast overestimated how quickly clinical evidence would translate to practice change."
  },
  {
    referenceCaseId: "REF-002",
    caseName: "Oncology Biosimilar — Competitive Disruption Success",
    decisionDomain: "Oncology",
    questionText: "Will the biosimilar achieve formulary placement in top 20 health systems within 6 months of launch?",
    comparisonGroups: JSON.stringify(["Rapid formulary placement", "Delayed formulary placement"]),
    forecastHorizon: "6 months",
    initialForecast: 0.55,
    finalForecast: 0.82,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.6,
    posteriorFragilityScore: 0.25,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 6,
    keyDrivers: JSON.stringify([
      { desc: "30% cost advantage over reference biologic", lr: 2.1 },
      { desc: "FDA interchangeability designation removed switching barriers", lr: 1.9 },
      { desc: "Three large GPOs announced preferred status", lr: 1.7 },
      { desc: "Reference biologic manufacturer did not counter with rebates", lr: 1.4 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Oncologist preference for originator in treatment-naive patients", lr: 0.82 },
      { desc: "Limited real-world safety data at launch", lr: 0.88 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Economic/payer evidence", count: 3, echoes: 1, translations: 1 },
      { cluster: "Regulatory evidence", count: 2, echoes: 0, translations: 1 }
    ]),
    outcome: "Achieved formulary placement in 17 of top 20 systems by month 5",
    resolutionType: "resolved_true",
    brierScore: 0.0324,
    calibrationLesson: "Interchangeability designation combined with cost advantage created faster formulary uptake than initial forecasts predicted. The initial forecast underweighted the GPO channel effect and overweighted physician brand loyalty.",
    biasPattern: "Early underconfidence corrected by access signals",
    structuralTags: JSON.stringify(["competitive disruption", "strong clinical / weak access", "payer resistance"]),
    caseSummary: "Initial skepticism about biosimilar adoption in oncology was overcome by interchangeability status, GPO endorsement, and the reference manufacturer's failure to offer competitive rebates. Access signals proved more predictive than physician sentiment."
  },
  {
    referenceCaseId: "REF-003",
    caseName: "CNS Launch — False Confidence Collapse",
    decisionDomain: "CNS / Psychiatry",
    questionText: "Will the novel antipsychotic achieve 15% market share within 18 months given differentiated mechanism of action?",
    comparisonGroups: JSON.stringify(["Rapid share gain", "Slow share gain"]),
    forecastHorizon: "18 months",
    initialForecast: 0.78,
    finalForecast: 0.31,
    confidenceLevel: "High",
    evidenceDiversityScore: 0.2,
    posteriorFragilityScore: 0.68,
    concentrationPenalty: 0.36,
    independentEvidenceFamilyCount: 2,
    keyDrivers: JSON.stringify([
      { desc: "Novel mechanism differentiation from existing antipsychotics", lr: 2.2 },
      { desc: "Favorable metabolic side effect profile vs competitors", lr: 1.6 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Step therapy requirements in 70% of commercial plans", lr: 0.45 },
      { desc: "Psychiatrists required REMS certification for prescribing", lr: 0.52 },
      { desc: "Patient identification workflow incompatible with community practice", lr: 0.61 },
      { desc: "Competitor launched branded generic at 40% lower price", lr: 0.55 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 3, echoes: 2, translations: 0 },
      { cluster: "KOL opinion", count: 2, echoes: 2, translations: 0 }
    ]),
    outcome: "Achieved 4% market share at 18 months — well below target",
    resolutionType: "resolved_false",
    brierScore: 0.4761,
    calibrationLesson: "High initial confidence was driven by a narrow evidence base concentrated in clinical trial data and KOL enthusiasm. The forecast failed to weight access barriers, REMS friction, and competitive pricing. Evidence diversity was critically low — all supportive signals traced to the same clinical program.",
    biasPattern: "False diversity — multiple signals traced to single evidence source",
    structuralTags: JSON.stringify(["false diversity", "early overconfidence", "workflow friction", "payer resistance", "competitive disruption"]),
    caseSummary: "The novel mechanism generated strong clinical enthusiasm but the forecast was built on concentrated evidence from a single trial program. Access barriers, REMS requirements, and competitive pricing created insurmountable friction that clinical differentiation could not overcome."
  },
  {
    referenceCaseId: "REF-004",
    caseName: "Immunology — Guideline Acceleration",
    decisionDomain: "Immunology / Rheumatology",
    questionText: "Will updated ACR guidelines recommending the biologic as first-line accelerate adoption among community rheumatologists within 12 months?",
    comparisonGroups: JSON.stringify(["Guideline-driven acceleration", "No material change"]),
    forecastHorizon: "12 months",
    initialForecast: 0.62,
    finalForecast: 0.79,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.55,
    posteriorFragilityScore: 0.18,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 5,
    keyDrivers: JSON.stringify([
      { desc: "ACR guideline update explicitly recommended as first-line option", lr: 2.5 },
      { desc: "Real-world registry data confirmed trial efficacy in community patients", lr: 1.7 },
      { desc: "Payer coverage expanded following guideline inclusion", lr: 1.6 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Community rheumatologists slow to adopt guideline changes historically", lr: 0.78 },
      { desc: "Infusion scheduling capacity constrained at community sites", lr: 0.82 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Guideline/regulatory evidence", count: 2, echoes: 0, translations: 1 },
      { cluster: "Real-world evidence", count: 3, echoes: 1, translations: 1 }
    ]),
    outcome: "Adoption increased 35% year-over-year in community settings",
    resolutionType: "resolved_true",
    brierScore: 0.0441,
    calibrationLesson: "Guideline endorsement created a payer coverage cascade that amplified adoption beyond direct physician behavior change. The forecast initially underweighted the indirect payer effect of guideline inclusion.",
    biasPattern: "Underweighting guideline cascade effects",
    structuralTags: JSON.stringify(["guideline acceleration", "strong clinical / weak access", "operational constraint"]),
    caseSummary: "ACR guideline inclusion triggered a cascade: payer coverage expanded, removing the primary adoption barrier. The direct effect on physician prescribing was moderate, but the indirect payer pathway amplified adoption significantly."
  },
  {
    referenceCaseId: "REF-005",
    caseName: "Gene Therapy — Operational Constraint Ceiling",
    decisionDomain: "Rare disease / Gene therapy",
    questionText: "Will the gene therapy achieve 50 treated patients in year one despite manufacturing and site-readiness constraints?",
    comparisonGroups: JSON.stringify(["On-track delivery", "Delayed delivery"]),
    forecastHorizon: "12 months",
    initialForecast: 0.65,
    finalForecast: 0.38,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.3,
    posteriorFragilityScore: 0.55,
    concentrationPenalty: 0.1,
    independentEvidenceFamilyCount: 3,
    keyDrivers: JSON.stringify([
      { desc: "Breakthrough therapy designation and strong clinical efficacy", lr: 2.3 },
      { desc: "Patient advocacy groups driving urgent referral volume", lr: 1.5 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Manufacturing capacity limited to 80 doses per year globally", lr: 0.55 },
      { desc: "Only 12 certified treatment centers operational at launch", lr: 0.6 },
      { desc: "Apheresis scheduling required 8-week lead time", lr: 0.7 },
      { desc: "Insurance pre-authorization for gene therapy averaged 14 weeks", lr: 0.5 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 2, echoes: 1, translations: 0 },
      { cluster: "Manufacturing/supply evidence", count: 3, echoes: 0, translations: 2 }
    ]),
    outcome: "22 patients treated in year one — 44% of target",
    resolutionType: "partially_resolved",
    brierScore: 0.0729,
    calibrationLesson: "Operational constraints — manufacturing throughput, site certification, and insurance authorization timelines — created a hard ceiling on adoption that no amount of clinical demand could overcome. The forecast overweighted demand signals relative to supply-side constraints.",
    biasPattern: "Demand-side bias — ignoring supply constraints",
    structuralTags: JSON.stringify(["supply / manufacturing constraint", "operational constraint", "workflow friction", "payer resistance"]),
    caseSummary: "Extraordinary clinical demand existed but was throttled by manufacturing capacity, site readiness, and insurance authorization timelines. The forecast correctly identified demand but failed to model the supply-side ceiling."
  },
  {
    referenceCaseId: "REF-006",
    caseName: "Cardiovascular — Canonical Success",
    decisionDomain: "Cardiovascular",
    questionText: "Will the PCSK9 inhibitor achieve broad formulary access within 12 months following outcomes trial publication?",
    comparisonGroups: JSON.stringify(["Broad access achieved", "Access remains restricted"]),
    forecastHorizon: "12 months",
    initialForecast: 0.7,
    finalForecast: 0.75,
    confidenceLevel: "High",
    evidenceDiversityScore: 0.7,
    posteriorFragilityScore: 0.12,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 7,
    keyDrivers: JSON.stringify([
      { desc: "Cardiovascular outcomes trial showed 15% MACE reduction", lr: 2.6 },
      { desc: "Updated AHA/ACC guidelines incorporated outcomes data", lr: 2.0 },
      { desc: "Manufacturer reduced list price by 60%", lr: 1.8 },
      { desc: "PBMs removed prior authorization for high-risk patients", lr: 1.6 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Primary care physicians slow to initiate specialty medications", lr: 0.8 },
      { desc: "Patient injection burden reduced adherence in some segments", lr: 0.85 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 3, echoes: 0, translations: 1 },
      { cluster: "Economic/payer evidence", count: 3, echoes: 1, translations: 1 },
      { cluster: "Guideline/regulatory evidence", count: 2, echoes: 0, translations: 1 }
    ]),
    outcome: "Formulary access expanded from 30% to 78% of commercial lives within 10 months",
    resolutionType: "resolved_true",
    brierScore: 0.0625,
    calibrationLesson: "Convergence of outcomes data, guideline update, and price reduction created a multi-signal reinforcement pattern. When independent evidence families align across clinical, economic, and regulatory domains, forecasts should weight the convergence signal itself.",
    biasPattern: "None — well-calibrated multi-source forecast",
    structuralTags: JSON.stringify(["guideline acceleration", "strong clinical / weak access"]),
    caseSummary: "A textbook case of well-calibrated forecasting. Multiple independent evidence sources (outcomes trial, guideline update, price reduction, PBM action) converged to support broad access. High evidence diversity and low fragility produced an accurate forecast."
  },
  {
    referenceCaseId: "REF-007",
    caseName: "Rare Disease — Access-Constrained Despite Strong Evidence",
    decisionDomain: "Rare disease / Metabolic",
    questionText: "Will the enzyme replacement therapy achieve target enrollment in the first year despite $500K annual cost?",
    comparisonGroups: JSON.stringify(["Enrollment on track", "Enrollment delayed"]),
    forecastHorizon: "12 months",
    initialForecast: 0.6,
    finalForecast: 0.42,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.4,
    posteriorFragilityScore: 0.35,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 4,
    keyDrivers: JSON.stringify([
      { desc: "Only approved therapy for the condition", lr: 2.0 },
      { desc: "Patient advocacy groups actively supporting enrollment", lr: 1.5 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Annual cost of $500K triggered intensive utilization management", lr: 0.45 },
      { desc: "Insurance denials required multiple appeals averaging 4 months", lr: 0.55 },
      { desc: "Copay assistance programs capped, leaving residual patient burden", lr: 0.7 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 2, echoes: 1, translations: 0 },
      { cluster: "Economic/payer evidence", count: 3, echoes: 1, translations: 1 }
    ]),
    outcome: "Enrollment reached 65% of target at 12 months due to payer delays",
    resolutionType: "partially_resolved",
    brierScore: 0.0324,
    calibrationLesson: "Ultra-high-cost therapies face systematic payer friction regardless of clinical necessity. The insurance appeal timeline creates a structural delay that should be modeled as a hard constraint on the adoption rate, not as a signal that might or might not materialize.",
    biasPattern: "Underweighting cost-driven payer friction",
    structuralTags: JSON.stringify(["payer resistance", "strong clinical / weak access", "operational constraint"]),
    caseSummary: "Clinical evidence was strong and the therapy was the only option, but the $500K price triggered systematic payer resistance. Insurance denial and appeal timelines created a structural delay that limited enrollment regardless of clinical demand."
  },
  {
    referenceCaseId: "REF-008",
    caseName: "Specialty Oral — KOL Enthusiasm vs Community Reality",
    decisionDomain: "Gastroenterology",
    questionText: "Will the oral biologic achieve 20% switch rate from injectable competitors within 12 months?",
    comparisonGroups: JSON.stringify(["High switch rate", "Low switch rate"]),
    forecastHorizon: "12 months",
    initialForecast: 0.74,
    finalForecast: 0.45,
    confidenceLevel: "High",
    evidenceDiversityScore: 0.25,
    posteriorFragilityScore: 0.6,
    concentrationPenalty: 0.2,
    independentEvidenceFamilyCount: 3,
    keyDrivers: JSON.stringify([
      { desc: "KOLs presented compelling switch data at DDW conference", lr: 2.1 },
      { desc: "Patient preference surveys strongly favored oral route", lr: 1.7 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Community GIs concerned about efficacy loss on switch", lr: 0.6 },
      { desc: "Prior authorization required for switch — not new starts", lr: 0.65 },
      { desc: "Competitor injectable manufacturer offered loyalty rebates", lr: 0.7 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "KOL opinion", count: 3, echoes: 2, translations: 0 },
      { cluster: "Patient preference data", count: 2, echoes: 1, translations: 0 }
    ]),
    outcome: "Switch rate reached 9% at 12 months — well below target",
    resolutionType: "resolved_false",
    brierScore: 0.2025,
    calibrationLesson: "KOL enthusiasm and patient preference data created a concentrated evidence base that overestimated community physician willingness to switch stable patients. The forecast treated KOL opinion and patient preference as independent evidence families when they were structurally correlated.",
    biasPattern: "KOL enthusiasm inflation",
    structuralTags: JSON.stringify(["KOL enthusiasm inflation", "false diversity", "early overconfidence", "competitive disruption"]),
    caseSummary: "KOL enthusiasm at conferences did not translate to community practice. Community GIs were reluctant to switch stable patients, payer barriers added friction, and competitor rebates protected incumbent share. The evidence base was concentrated in correlated KOL and patient preference signals."
  },
  {
    referenceCaseId: "REF-009",
    caseName: "VESALIUS-CV — Trial Outcome in Primary Prevention",
    decisionDomain: "Cardiology",
    questionText: "Will adding evolocumab to standard therapy significantly reduce first major cardiovascular events in high-risk patients without prior MI or stroke?",
    comparisonGroups: JSON.stringify(["Primary endpoint met", "Primary endpoint not met"]),
    forecastHorizon: "36 months",
    initialForecast: 0.55,
    finalForecast: 0.67,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.65,
    posteriorFragilityScore: 0.2,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 5,
    keyDrivers: JSON.stringify([
      { desc: "FOURIER trial prior evidence supporting PCSK9 mechanism in CV prevention", lr: 2.8 },
      { desc: "Demonstrated >60% LDL-C reduction linked to CV event reduction", lr: 2.2 },
      { desc: "ACC/AHA guidelines support PCSK9i in high-risk primary prevention", lr: 1.9 },
      { desc: "High baseline MACE rate in primary prevention population", lr: 1.8 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Primary prevention population has lower absolute event rate than secondary", lr: 0.85 },
      { desc: "Injection-site reactions and neurocognitive concern in PCSK9i class", lr: 0.85 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "PCSK9 clinical trial evidence (FOURIER lineage)", count: 4, echoes: 2, translations: 1 },
      { cluster: "Biomarker/LDL-C reduction data", count: 2, echoes: 0, translations: 1 },
      { cluster: "Guideline/epidemiological evidence", count: 2, echoes: 0, translations: 0 }
    ]),
    outcome: "Met primary endpoint — ~25% reduction in major CV events, ~36% reduction in first MI",
    resolutionType: "resolved_true",
    brierScore: 0.1097,
    calibrationLesson: "Strong prior evidence from FOURIER lineage correctly predicted directional outcome, but dependency compression was critical — multiple signals traced to same PCSK9 mechanism of action. Moderate-confidence forecasts (50-70%) should weight evidence diversity and prior trial lineage carefully.",
    biasPattern: "Precedent bias risk — FOURIER lineage signals required compression",
    structuralTags: JSON.stringify(["clinical trial outcome", "dependency compression", "FOURIER lineage", "moderate confidence calibration", "primary prevention"]),
    caseSummary: "Binary clinical endpoint with clear statistical threshold. High signal density from prior PCSK9 evidence (FOURIER) required dependency compression to avoid posterior inflation. Tests evidence weighting vs precedent bias and calibration of moderate-confidence forecasts."
  },
  {
    referenceCaseId: "REF-010",
    caseName: "Donanemab FDA — Regulatory Approval with Safety Signal Conflict",
    decisionDomain: "Neurology",
    questionText: "Will the FDA approve donanemab for early symptomatic Alzheimer's disease?",
    comparisonGroups: JSON.stringify(["FDA approval", "FDA rejection or delay"]),
    forecastHorizon: "18 months",
    initialForecast: 0.50,
    finalForecast: 0.47,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.55,
    posteriorFragilityScore: 0.35,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 4,
    keyDrivers: JSON.stringify([
      { desc: "TRAILBLAZER-ALZ 2 met primary endpoint with 35% slowing of cognitive decline", lr: 2.5 },
      { desc: "FDA approved lecanemab — establishes anti-amyloid regulatory pathway", lr: 2.2 },
      { desc: "68% amyloid clearance supports biologic plausibility", lr: 2.0 },
      { desc: "Advisory committee voted in favor with stipulations", lr: 1.7 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "ARIA-E in 24% of patients, 3 treatment-related deaths — significant safety signal", lr: 0.55 },
      { desc: "FDA issued Complete Response Letter requesting additional analyses", lr: 0.75 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Anti-amyloid clinical trial evidence", count: 3, echoes: 1, translations: 1 },
      { cluster: "Regulatory precedent (lecanemab pathway)", count: 2, echoes: 0, translations: 1 },
      { cluster: "Safety/ARIA data", count: 2, echoes: 1, translations: 0 }
    ]),
    outcome: "FDA approved donanemab (Kisunla) on July 2, 2024 for early symptomatic AD with REMS",
    resolutionType: "resolved_true",
    brierScore: 0.2837,
    calibrationLesson: "Classic risk-benefit regulatory decision. Conflicting signals (strong efficacy vs safety deaths) made this a genuine 50/50 forecast. The lecanemab precedent was the decisive signal — class pathway establishment reduced regulatory uncertainty. Safety concerns resulted in REMS requirement but did not block approval. Forecasts must distinguish safety-as-blocker from safety-as-condition.",
    biasPattern: "Safety signal overweighting — deaths created false-confidence in rejection",
    structuralTags: JSON.stringify(["regulatory approval", "risk-benefit conflict", "safety signal interpretation", "precedent dependency", "false-confidence detection"]),
    caseSummary: "Conflicting signals: strong efficacy data vs treatment-related deaths. Regulatory precedent (lecanemab) proved decisive. Tests risk signal interpretation, regulatory probability calibration, and false-confidence detection when safety signals conflict with efficacy."
  },
  {
    referenceCaseId: "REF-011",
    caseName: "Donanemab EU — Geographic Regulatory Divergence",
    decisionDomain: "Neurology",
    questionText: "Will European regulators approve donanemab for Alzheimer's disease?",
    comparisonGroups: JSON.stringify(["EMA approval", "EMA rejection"]),
    forecastHorizon: "18 months",
    initialForecast: 0.45,
    finalForecast: 0.41,
    confidenceLevel: "Low",
    evidenceDiversityScore: 0.45,
    posteriorFragilityScore: 0.4,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 3,
    keyDrivers: JSON.stringify([
      { desc: "Same TRAILBLAZER-ALZ 2 efficacy data — 35% slowing of cognitive decline", lr: 2.2 },
      { desc: "Patient advocacy groups in Europe advocating for access", lr: 1.3 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "ARIA-E 24%, 3 deaths — EMA historically more conservative on safety-benefit", lr: 0.45 },
      { desc: "Lecanemab withdrawn from EMA review — no anti-amyloid precedent in EU", lr: 0.5 },
      { desc: "CHMP applies stricter clinical meaningfulness thresholds for neurodegeneration", lr: 0.55 },
      { desc: "NICE and European HTA bodies questioned clinical meaningfulness", lr: 0.6 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Anti-amyloid clinical trial evidence", count: 3, echoes: 1, translations: 1 },
      { cluster: "Regulatory environment (EMA conservatism)", count: 3, echoes: 0, translations: 2 }
    ]),
    outcome: "Rejected by CHMP — benefits did not outweigh risks (safety concerns, insufficient clinical meaningfulness)",
    resolutionType: "resolved_false",
    brierScore: 0.1665,
    calibrationLesson: "Same evidence, different outcome. The absence of a class precedent (lecanemab withdrawn from EMA) and EMA's stricter clinical meaningfulness threshold were decisive. Geographic divergence cases require modeling the regulatory environment as a first-order variable, not just the evidence base. FDA approval does not predict EMA approval.",
    biasPattern: "Overgeneralization — FDA approval falsely increased EU confidence",
    structuralTags: JSON.stringify(["geographic divergence", "actor environment sensitivity", "regulatory conservatism", "overgeneralization risk", "same evidence different outcome"]),
    caseSummary: "Same drug, same evidence, opposite regulatory outcome. Tests actor environment sensitivity, regional decision modeling, and overgeneralization risk. The absence of a class precedent in EU and stricter CHMP thresholds drove rejection despite FDA approval of the same asset."
  },
  {
    referenceCaseId: "REF-012",
    caseName: "CHAMPION-AF — Late-Breaker Composite Endpoint",
    decisionDomain: "Cardiology",
    questionText: "Will left atrial appendage closure demonstrate non-inferiority to NOAC therapy and reduce bleeding risk?",
    comparisonGroups: JSON.stringify(["Dual endpoint met", "Endpoint not met"]),
    forecastHorizon: "24 months",
    initialForecast: 0.50,
    finalForecast: 0.59,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.6,
    posteriorFragilityScore: 0.25,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 5,
    keyDrivers: JSON.stringify([
      { desc: "Prior PROTECT AF/PREVAIL trials showed LAAC feasibility in AF", lr: 1.6 },
      { desc: "Large registry data (>100K patients) shows declining complication rates", lr: 1.5 },
      { desc: "CMS expanded LAAC coverage criteria in 2023", lr: 1.6 },
      { desc: "Modern trial design uses NOAC comparator — more rigorous", lr: 1.4 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Procedural complications (pericardial effusion, embolization) in 2-4%", lr: 0.7 },
      { desc: "Prior trials against warfarin — NOAC non-inferiority is harder bar", lr: 0.8 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "LAAC clinical trial evidence (PROTECT/PREVAIL lineage)", count: 3, echoes: 1, translations: 1 },
      { cluster: "Real-world registry evidence", count: 2, echoes: 0, translations: 1 },
      { cluster: "Payer/coverage evidence", count: 2, echoes: 1, translations: 0 }
    ]),
    outcome: "Met non-inferiority for stroke AND superiority for major bleeding reduction vs NOAC",
    resolutionType: "resolved_true",
    brierScore: 0.1643,
    calibrationLesson: "Compound endpoints require separate probability assessment for each component. Non-inferiority is structurally different from superiority — the dual success was partly due to the bleeding endpoint being a lower bar. Multi-signal evidence from clinical trials, registries, and payer support converged. Adoption-relevant signal weighting matters for compound endpoints.",
    biasPattern: "Compound endpoint underconfidence — bleeding superiority was more predictable than stroke non-inferiority",
    structuralTags: JSON.stringify(["composite endpoint", "non-inferiority trial", "adoption sensitivity", "multi-signal convergence", "device adoption"]),
    caseSummary: "Compound endpoint prediction with behavioral adoption implications. Tests CIOS ability to handle composite endpoints, adoption-relevant signal weighting, and forecast revision logic. Multi-signal evidence from trials, registries, and payer actions converged to support dual success."
  },
  {
    referenceCaseId: "REF-013",
    caseName: "Part D Redesign — Structural Policy Change",
    decisionDomain: "Health Policy / Market Structure",
    questionText: "Will the 2025 Part D redesign materially increase manufacturer liability in catastrophic coverage?",
    comparisonGroups: JSON.stringify(["Material liability increase", "No material change"]),
    forecastHorizon: "36 months",
    initialForecast: 0.60,
    finalForecast: 0.57,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.7,
    posteriorFragilityScore: 0.15,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 5,
    keyDrivers: JSON.stringify([
      { desc: "IRA signed into law with bipartisan support — explicit Part D redesign provisions", lr: 3.5 },
      { desc: "CMS issued final rule implementing manufacturer discount program", lr: 3.0 },
      { desc: "CBO scored manufacturer liability at ~20% in catastrophic coverage", lr: 2.8 },
      { desc: "Bipartisan support for $2K OOP cap reduces repeal risk", lr: 1.8 },
      { desc: "PBMs and plans already restructuring formularies for 2025", lr: 2.0 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "PhRMA legal and lobbying challenges to IRA provisions", lr: 0.75 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Legislative/regulatory evidence", count: 3, echoes: 0, translations: 1 },
      { cluster: "Economic/structural evidence", count: 2, echoes: 1, translations: 0 },
      { cluster: "Market behavior evidence (PBM/plan anticipation)", count: 2, echoes: 0, translations: 1 }
    ]),
    outcome: "Manufacturers bear ~20% catastrophic liability under IRA Part D redesign, effective January 2025",
    resolutionType: "resolved_true",
    brierScore: 0.1849,
    calibrationLesson: "Structural policy changes with legislative finality and regulatory execution are highly predictable once signed into law. The forecast should have been more confident earlier. Lobbying/legal challenges created false uncertainty — once legislation is enacted and CMS issues final rules, implementation is near-certain. Economic necessity logic and long-horizon calibration require distinguishing enacted policy from proposed policy.",
    biasPattern: "False uncertainty from lobbying noise — enacted legislation has high implementation probability",
    structuralTags: JSON.stringify(["structural policy change", "legislative finality", "economic necessity", "long-horizon calibration", "market structure shift"]),
    caseSummary: "Structural policy change with high predictability once enacted into law. Tests structural vs operational signal weighting, economic necessity logic, and long-horizon forecasting calibration. Market was already pricing in the change before effective date."
  },
];

async function seedReferenceCases() {
  const existing = await db.select({ id: referenceCasesTable.referenceCaseId }).from(referenceCasesTable);
  const existingIds = new Set(existing.map(e => e.id));
  const toInsert = SEED_CASES.filter(c => !existingIds.has(c.referenceCaseId));

  if (toInsert.length === 0) return;

  for (const c of toInsert) {
    await db.insert(referenceCasesTable).values({
      id: randomUUID(),
      ...c,
    }).onConflictDoNothing();
  }
  console.log(`[reference-cases] Seeded ${toInsert.length} reference cases.`);
}

seedReferenceCases().catch(err => console.error("[reference-cases] Seed error:", err));

router.get("/reference-cases", async (_req, res) => {
  const cases = await db.select().from(referenceCasesTable).orderBy(referenceCasesTable.caseName);
  res.json(cases);
});

router.get("/reference-cases/tags/all", async (_req, res) => {
  const cases = await db.select({ structuralTags: referenceCasesTable.structuralTags }).from(referenceCasesTable);
  const tagSet = new Set<string>();
  for (const c of cases) {
    try {
      const tags: string[] = JSON.parse(c.structuralTags || "[]");
      tags.forEach(t => tagSet.add(t));
    } catch {}
  }
  res.json([...tagSet].sort());
});

router.get("/reference-cases/similar/:predictionId", async (req, res) => {
  const ledgerRows = await db.select().from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, req.params.predictionId))
    .limit(1);

  if (!ledgerRows[0]) return res.status(404).json({ error: "Ledger entry not found" });
  const entry = ledgerRows[0];

  const allRef = await db.select().from(referenceCasesTable);
  if (allRef.length === 0) return res.json([]);

  const scored = allRef.map(ref => {
    let score = 0;

    if (entry.decisionDomain && ref.decisionDomain) {
      const eDomain = entry.decisionDomain.toLowerCase();
      const rDomain = ref.decisionDomain.toLowerCase();
      if (eDomain === rDomain) score += 3;
      else if (eDomain.includes(rDomain) || rDomain.includes(eDomain)) score += 1.5;
    }

    if (entry.confidenceLevel && ref.confidenceLevel) {
      if (entry.confidenceLevel === ref.confidenceLevel) score += 1;
    }

    if (entry.evidenceDiversityScore != null && ref.evidenceDiversityScore != null) {
      const diff = Math.abs(entry.evidenceDiversityScore - ref.evidenceDiversityScore);
      if (diff <= 0.15) score += 2;
      else if (diff <= 0.3) score += 1;
    }

    if (entry.posteriorFragilityScore != null && ref.posteriorFragilityScore != null) {
      const diff = Math.abs(entry.posteriorFragilityScore - ref.posteriorFragilityScore);
      if (diff <= 0.15) score += 2;
      else if (diff <= 0.3) score += 1;
    }

    if (entry.forecastProbability != null && ref.finalForecast != null) {
      const diff = Math.abs(entry.forecastProbability - ref.finalForecast);
      if (diff <= 0.1) score += 1.5;
      else if (diff <= 0.2) score += 0.75;
    }

    if (entry.confidenceCeilingApplied != null && ref.concentrationPenalty != null && ref.concentrationPenalty > 0) {
      score += 1;
    }

    return {
      referenceCaseId: ref.referenceCaseId,
      caseName: ref.caseName,
      similarityScore: Number(score.toFixed(2)),
      matchReasons: [] as string[],
      calibrationLesson: ref.calibrationLesson,
      biasPattern: ref.biasPattern,
      structuralTags: ref.structuralTags,
      outcome: ref.outcome,
      brierScore: ref.brierScore,
      finalForecast: ref.finalForecast,
    };
  });

  const filtered = scored
    .filter(s => s.similarityScore >= 2)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 5);

  res.json(filtered);
});

interface ChallengeCaseDefinition {
  referenceCaseId: string;
  caseName: string;
  expectedProbabilityRange: { min: number; max: number };
  tolerancePp: number;
  validationCriteria: string[];
}

const CHALLENGE_CASES: ChallengeCaseDefinition[] = [
  {
    referenceCaseId: "REF-001",
    caseName: "Orphan Pulmonary — Strong Clinical, Slow Access",
    expectedProbabilityRange: { min: 0.53, max: 0.63 },
    tolerancePp: 5,
    validationCriteria: [
      "Forecast reflects payer access barriers constraining clinical strength",
      "Workflow friction identified as adoption ceiling factor",
      "Initial probability not inflated by KOL enthusiasm alone",
    ],
  },
  {
    referenceCaseId: "REF-002",
    caseName: "Oncology Biosimilar — Competitive Disruption",
    expectedProbabilityRange: { min: 0.77, max: 0.87 },
    tolerancePp: 5,
    validationCriteria: [
      "Interchangeability designation weighted appropriately",
      "GPO channel effect reflected in probability",
      "Physician brand loyalty not overweighted vs access signals",
    ],
  },
];

router.get("/reference-cases/challenge-library", async (_req, res) => {
  try {
    res.json({ challengeCases: CHALLENGE_CASES, count: CHALLENGE_CASES.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/reference-cases/:referenceCaseId", async (req, res) => {
  const rows = await db.select().from(referenceCasesTable)
    .where(eq(referenceCasesTable.referenceCaseId, req.params.referenceCaseId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Reference case not found" });
  res.json(rows[0]);
});

router.post("/reference-cases/challenge-validate", async (req, res) => {
  try {
    const { referenceCaseId, actualProbability } = req.body;
    if (!referenceCaseId || actualProbability == null) {
      res.status(400).json({ error: "referenceCaseId and actualProbability are required" });
      return;
    }

    const challenge = CHALLENGE_CASES.find(c => c.referenceCaseId === referenceCaseId);
    if (!challenge) {
      res.status(404).json({ error: `No challenge case found for ${referenceCaseId}` });
      return;
    }

    const toleranceDecimal = challenge.tolerancePp / 100;
    const effectiveMin = challenge.expectedProbabilityRange.min - toleranceDecimal;
    const effectiveMax = challenge.expectedProbabilityRange.max + toleranceDecimal;
    const withinRange = actualProbability >= effectiveMin && actualProbability <= effectiveMax;

    const deviation = actualProbability < challenge.expectedProbabilityRange.min
      ? challenge.expectedProbabilityRange.min - actualProbability
      : actualProbability > challenge.expectedProbabilityRange.max
        ? actualProbability - challenge.expectedProbabilityRange.max
        : 0;

    let grade: "pass" | "marginal" | "fail";
    if (deviation === 0) {
      grade = "pass";
    } else if (deviation <= toleranceDecimal) {
      grade = "marginal";
    } else {
      grade = "fail";
    }

    res.json({
      referenceCaseId,
      caseName: challenge.caseName,
      actualProbability,
      expectedRange: challenge.expectedProbabilityRange,
      tolerancePp: challenge.tolerancePp,
      effectiveRange: { min: effectiveMin, max: effectiveMax },
      withinRange,
      deviationPp: Math.round(deviation * 100),
      grade,
      validationCriteria: challenge.validationCriteria,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
