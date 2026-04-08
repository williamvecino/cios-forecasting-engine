import { randomUUID } from "crypto";
import type { Scope, Timing } from "@workspace/db";
import { classifyEvidence } from "./evidence-classifier.js";
import { lookupPrecedentLr } from "./precedent-lookup.js";

interface CaseSpec {
  caseId: string;
  assetName: string;
  assetType: string;
  therapeuticArea: string;
  diseaseState: string;
  specialty: string;
  geography: string;
  strategicQuestion: string;
  outcomeDefinition: string;
  timeHorizon: string;
  priorProbability: number;
  primarySpecialtyProfile: string;
  payerEnvironment: string;
  guidelineLeverage: string;
  competitorProfile: string;
  accessFrictionIndex: number;
  adoptionPhase: string;
  forecastHorizonMonths: number;
}

interface SignalSpec {
  signalDescription: string;
  signalType: string;
  direction: "Positive" | "Negative" | "Neutral";
  strengthScore: number;
  reliabilityScore: number;
  scope: Scope;
  timing: Timing;
  brand?: string;
  sourceLabel?: string;
  evidenceSnippet?: string;
}

export interface ValidationCase {
  case: CaseSpec;
  signals: SignalSpec[];
}

function lr(signalType: string, _strength: number, _reliability: number, _scope: Scope, _timing: Timing, direction: "Positive" | "Negative" | "Neutral"): number {
  if (direction === "Neutral") return 1.0;
  const result = lookupPrecedentLr(signalType, direction);
  if (!result.matched) {
    throw new Error(`Signal type "${signalType}" not found in precedent library`);
  }
  return result.assignedLr;
}

export const VALIDATION_CASES: ValidationCase[] = [
  {
    case: {
      caseId: "VP-REGULATORY-001",
      assetName: "Xarelto (rivaroxaban)",
      assetType: "Medication",
      therapeuticArea: "Cardiology",
      diseaseState: "Venous Thromboembolism / AF",
      specialty: "Cardiology",
      geography: "US",
      strategicQuestion: "Will the FDA add a boxed warning to Xarelto for GI bleeding risk within 18 months, and if so, what is the probability this triggers a measurable decline in new prescriptions?",
      outcomeDefinition: "FDA issues boxed warning for GI bleeding AND new Rx decline >10% within 6 months of label change",
      timeHorizon: "18 months",
      priorProbability: 0.30,
      primarySpecialtyProfile: "Specialist-led",
      payerEnvironment: "Balanced",
      guidelineLeverage: "High",
      competitorProfile: "Established alternatives (apixaban, warfarin)",
      accessFrictionIndex: 0.3,
      adoptionPhase: "mature_market",
      forecastHorizonMonths: 18,
    },
    signals: [
      { signalDescription: "FDA safety review initiated for rivaroxaban GI bleeding signal based on FAERS data accumulation", signalType: "Regulatory / clinical", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "FDA Safety Communication", evidenceSnippet: "FDA reviewing post-marketing GI bleeding reports for rivaroxaban" },
      { signalDescription: "Published meta-analysis shows rivaroxaban GI bleeding rate 1.5x higher than apixaban across 12 RCTs", signalType: "Phase III clinical", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "global", timing: "current", sourceLabel: "Lancet 2024 meta-analysis" },
      { signalDescription: "Active DOJ litigation cluster citing GI hemorrhage complications; 3 settlements >$10M each", signalType: "Regulatory / clinical", direction: "Positive", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "DOJ litigation records" },
      { signalDescription: "Real-world evidence from VA database shows higher major bleeding rates in elderly rivaroxaban patients vs apixaban", signalType: "Phase III clinical", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "VA Health System RWE" },
      { signalDescription: "Bayer/J&J REMS infrastructure already in place, suggesting regulatory readiness for label modification", signalType: "Operational friction", direction: "Positive", strengthScore: 2, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "Bayer/J&J REMS documentation" },
      { signalDescription: "ACC/AHA guidelines currently maintain rivaroxaban as first-line option; no pending guideline revision", signalType: "Guideline inclusion", direction: "Negative", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "ACC/AHA 2023 Guidelines" },
      { signalDescription: "Historical precedent: FDA boxed warnings on anticoagulants (e.g., warfarin) did not eliminate prescribing but shifted market share", signalType: "Regulatory / clinical", direction: "Neutral", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "FDA historical precedent analysis" },
      { signalDescription: "Cardiologist survey: 62% would maintain rivaroxaban in stable patients even with boxed warning, citing convenience and efficacy", signalType: "KOL endorsement", direction: "Negative", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "Cardiologist prescriber survey 2024" },
      { signalDescription: "Apixaban (Eliquis) market share already exceeds rivaroxaban; competitive switching pathway well-established", signalType: "Competitor counteraction", direction: "Positive", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "IQVIA TRx market share data" },
      { signalDescription: "Pending outcomes of ongoing FDA-mandated post-marketing study could resolve safety signal ambiguity", signalType: "Regulatory / clinical", direction: "Neutral", strengthScore: 4, reliabilityScore: 3, scope: "national", timing: "late", sourceLabel: "FDA post-marketing study tracker" },
    ],
  },
  {
    case: {
      caseId: "VP-LAUNCH-002",
      assetName: "Generic Abilify Maintena (aripiprazole LAI)",
      assetType: "Biologic / Large molecule",
      therapeuticArea: "Psychiatry / CNS",
      diseaseState: "Schizophrenia maintenance",
      specialty: "Psychiatry",
      geography: "US",
      strategicQuestion: "Will a generic long-acting injectable aripiprazole achieve >15% market share within 12 months of launch, displacing branded Abilify Maintena?",
      outcomeDefinition: "Generic LAI aripiprazole captures >15% of the LAI aripiprazole market by TRx within 12 months",
      timeHorizon: "12 months",
      priorProbability: 0.40,
      primarySpecialtyProfile: "Specialist-led",
      payerEnvironment: "Restrictive",
      guidelineLeverage: "Medium",
      competitorProfile: "Branded incumbent (Abilify Maintena)",
      accessFrictionIndex: 0.6,
      adoptionPhase: "early_adoption",
      forecastHorizonMonths: 12,
    },
    signals: [
      { signalDescription: "FDA tentative approval pathway for complex generic LAI formulation progressing; ANDA submission accepted for review", signalType: "Regulatory / clinical", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "FDA ANDA status" },
      { signalDescription: "Payer advisory boards signaling strong preference for generic LAI to reduce PMPM costs in behavioral health", signalType: "Payer / coverage", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Payer advisory board proceedings" },
      { signalDescription: "Manufacturing complexity of LAI formulation limits number of generic entrants to 1-2 within first year", signalType: "Capacity / infrastructure", direction: "Negative", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "FDA complex generics guidance" },
      { signalDescription: "Community mental health centers (CMHCs) report strong willingness to switch to generic LAI if cost savings >30%", signalType: "Market adoption / utilization", direction: "Positive", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "CMHC administrator survey" },
      { signalDescription: "Branded Abilify Maintena manufacturer expected to launch authorized generic to protect market share", signalType: "Competitor countermove", direction: "Negative", strengthScore: 4, reliabilityScore: 3, scope: "national", timing: "early", sourceLabel: "Otsuka/Lundbeck press releases" },
      { signalDescription: "Prior authorization requirements for LAI products create switching friction; many plans require 72-hour pre-authorization", signalType: "Access friction", direction: "Negative", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "PBM formulary analysis" },
      { signalDescription: "Psychiatrist survey: 45% concerned about bioequivalence of complex injectable generics; want clinical evidence before switching", signalType: "KOL endorsement", direction: "Negative", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "Psychiatrist prescriber survey 2024" },
      { signalDescription: "Medicaid programs in 12 states have announced mandatory generic substitution policies for LAI antipsychotics", signalType: "Payer / coverage", direction: "Positive", strengthScore: 5, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "State Medicaid policy tracker" },
      { signalDescription: "Supply chain readiness uncertain; cold-chain distribution network for LAI generics not yet fully established", signalType: "Capacity / infrastructure", direction: "Negative", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "early", sourceLabel: "Generic manufacturer supply chain disclosures" },
      { signalDescription: "APA treatment guidelines do not differentiate between branded and generic LAI formulations", signalType: "Guideline inclusion", direction: "Positive", strengthScore: 3, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "APA Practice Guidelines 2023" },
      { signalDescription: "Patient advocacy groups expressing concern about generic switching in stable psychiatric patients", signalType: "Field intelligence", direction: "Negative", strengthScore: 2, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "NAMI patient advocacy communications" },
    ],
  },
  {
    case: {
      caseId: "VP-ADOPTION-003",
      assetName: "Kisqali (ribociclib)",
      assetType: "Medication",
      therapeuticArea: "Oncology",
      diseaseState: "HR+/HER2- metastatic breast cancer",
      specialty: "Medical Oncology",
      geography: "US",
      strategicQuestion: "Will community oncologists adopt Kisqali as first-line CDK4/6 inhibitor over Ibrance within 12 months, achieving >25% first-line CDK4/6 share?",
      outcomeDefinition: "Kisqali achieves >25% of first-line CDK4/6 inhibitor new starts in community oncology settings within 12 months",
      timeHorizon: "12 months",
      priorProbability: 0.25,
      primarySpecialtyProfile: "Specialist-led",
      payerEnvironment: "Balanced",
      guidelineLeverage: "High",
      competitorProfile: "Dominant incumbent (Ibrance/palbociclib)",
      accessFrictionIndex: 0.4,
      adoptionPhase: "early_adoption",
      forecastHorizonMonths: 12,
    },
    signals: [
      { signalDescription: "NATALEE trial shows ribociclib significantly reduces recurrence risk in early-stage HR+/HER2- breast cancer (iDFS HR 0.75)", signalType: "Phase III clinical", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "global", timing: "current", sourceLabel: "NATALEE Phase III (NEJM 2023)", evidenceSnippet: "Ribociclib plus endocrine therapy reduced invasive disease-free survival events vs endocrine therapy alone" },
      { signalDescription: "NCCN Guidelines updated to include ribociclib with Category 1 recommendation for first-line metastatic HR+/HER2-", signalType: "Guideline inclusion", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "NCCN Breast Cancer v4.2024" },
      { signalDescription: "Ibrance (palbociclib) holds >55% first-line CDK4/6 market share with deep prescriber familiarity and established workflows", signalType: "Competitor counteraction", direction: "Negative", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "IQVIA CDK4/6 market share data" },
      { signalDescription: "Community oncologists report inertia: 68% say they would need 'strong reason' to switch from current CDK4/6 regimen", signalType: "Field intelligence", direction: "Negative", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Community oncologist practice survey" },
      { signalDescription: "Kisqali shows OS advantage over Ibrance in indirect comparison analyses; no head-to-head trial exists", signalType: "Phase III clinical", direction: "Positive", strengthScore: 4, reliabilityScore: 3, scope: "global", timing: "current", sourceLabel: "Indirect comparison meta-analysis" },
      { signalDescription: "Payer coverage for CDK4/6 inhibitors is broad; no formulary-level differentiation between Kisqali and Ibrance in top 10 plans", signalType: "Payer / coverage", direction: "Neutral", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Top 10 US health plan formulary review" },
      { signalDescription: "Academic KOLs increasingly presenting ribociclib OS data at ASCO and SABCS, shifting peer perception", signalType: "KOL endorsement", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "global", timing: "current", sourceLabel: "ASCO/SABCS conference proceedings" },
      { signalDescription: "Novartis field force expansion targeting community oncology practices with ribociclib clinical differentiators", signalType: "Field intelligence", direction: "Positive", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "Novartis commercial strategy reports" },
      { signalDescription: "Verzenio (abemaciclib) also gaining share with monarchE adjuvant data, fragmenting CDK4/6 market further", signalType: "Competitor countermove", direction: "Negative", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "monarchE trial results / Lilly market data" },
      { signalDescription: "Community practice pharmacy & therapeutics committees slow to update preferred CDK4/6 agent; review cycles 6-12 months", signalType: "Operational friction", direction: "Negative", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Community oncology P&T committee survey" },
      { signalDescription: "Patient advocacy organizations (LBBC, Susan G. Komen) amplifying awareness of OS benefit data for ribociclib", signalType: "Field intelligence", direction: "Positive", strengthScore: 2, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "LBBC and Susan G. Komen communications" },
      { signalDescription: "Ribociclib requires QTc monitoring in first cycle, adding workflow step not required for palbociclib", signalType: "Operational friction", direction: "Negative", strengthScore: 2, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "Kisqali prescribing information" },
    ],
  },
  {
    case: {
      caseId: "VP-COMPETITIVE-004",
      assetName: "Humira Biosimilars",
      assetType: "Biologic / Large molecule",
      therapeuticArea: "Immunology / Rheumatology",
      diseaseState: "Rheumatoid Arthritis / IBD / Psoriasis",
      specialty: "Rheumatology",
      geography: "US",
      strategicQuestion: "Will biosimilar adalimumab products collectively capture >40% of the US adalimumab market within 18 months of multi-source launch within 36 months of US biosimilar launch?",
      outcomeDefinition: "Biosimilar adalimumab products achieve >40% combined market share by volume within 18 months of first biosimilar launch",
      timeHorizon: "18 months",
      priorProbability: 0.45,
      primarySpecialtyProfile: "Multi-specialty",
      payerEnvironment: "Favorable (biosimilar incentive)",
      guidelineLeverage: "Medium",
      competitorProfile: "Branded incumbent (Humira) with patient loyalty programs",
      accessFrictionIndex: 0.5,
      adoptionPhase: "early_adoption",
      forecastHorizonMonths: 18,
    },
    signals: [
      { signalDescription: "8 biosimilar adalimumab products now FDA-approved and launched; multi-source competition driving price erosion of 50-80%", signalType: "Competitor countermove", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "FDA Biosimilar Product List" },
      { signalDescription: "Major PBMs (CVS Caremark, Express Scripts, OptumRx) implementing biosimilar-preferred formulary positions with mandatory substitution", signalType: "Payer / coverage", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "PBM formulary announcements 2024" },
      { signalDescription: "AbbVie Humira patient co-pay assistance program ($5 co-pay card) creating powerful switching barrier for commercially insured patients", signalType: "Competitor counteraction", direction: "Negative", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "AbbVie patient support program data" },
      { signalDescription: "Rheumatologist survey: 55% express willingness to switch stable patients to biosimilar if payer mandates, but only 20% would proactively switch", signalType: "Field intelligence", direction: "Negative", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Rheumatologist prescriber survey 2024" },
      { signalDescription: "European biosimilar adalimumab experience shows 60-70% market capture within 2 years; US market dynamics differ but trajectory informative", signalType: "Market adoption / utilization", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "global", timing: "current", sourceLabel: "IQVIA European biosimilar market report" },
      { signalDescription: "Patient advocacy groups (Arthritis Foundation, Crohn's & Colitis Foundation) issuing guidance supporting biosimilar use with physician oversight", signalType: "Field intelligence", direction: "Positive", strengthScore: 2, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Arthritis Foundation/CCFA position statements" },
      { signalDescription: "ACR and AGA guidelines support biosimilar substitution for treatment-naive patients; no position on switching stable patients", signalType: "Guideline inclusion", direction: "Positive", strengthScore: 3, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "ACR/AGA clinical guidelines 2024" },
      { signalDescription: "Hospital and health system pharmacy committees moving biosimilars to preferred status; 340B institutions leading adoption", signalType: "Market adoption / utilization", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "ASHP health system formulary tracker" },
      { signalDescription: "Citrate-free formulation differences across biosimilar products creating confusion about interchangeability and patient experience", signalType: "Operational friction", direction: "Negative", strengthScore: 2, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "Biosimilar product labeling comparison" },
      { signalDescription: "Medicare Part D redesign reducing out-of-pocket costs may diminish commercial co-pay card advantage for Humira", signalType: "Payer / coverage", direction: "Positive", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "late", sourceLabel: "CMS IRA implementation guidance" },
      { signalDescription: "Nocebo effect concerns: patients switched from Humira reporting subjective symptom worsening despite objective disease control", signalType: "Field intelligence", direction: "Negative", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "NOR-SWITCH and biosimilar switching studies" },
      { signalDescription: "Interchangeability designation granted for multiple biosimilar adalimumab products, enabling pharmacy-level substitution", signalType: "Regulatory / clinical", direction: "Positive", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "FDA interchangeability designations" },
    ],
  },
  {
    case: {
      caseId: "VP-BARRIER-005",
      assetName: "Leqembi (lecanemab)",
      assetType: "Biologic / Large molecule",
      therapeuticArea: "Neurology",
      diseaseState: "Early Alzheimer's Disease",
      specialty: "Neurology",
      geography: "US",
      strategicQuestion: "Will payer restrictions and infusion infrastructure barriers delay Leqembi uptake by >6 months beyond the expected trajectory for a breakthrough therapy?",
      outcomeDefinition: "Leqembi achieves <5,000 patients on therapy at 12 months post-approval due to access and infrastructure barriers",
      timeHorizon: "12 months",
      priorProbability: 0.55,
      primarySpecialtyProfile: "Specialist-led",
      payerEnvironment: "Restrictive",
      guidelineLeverage: "Low",
      competitorProfile: "No established competitors (first-in-class)",
      accessFrictionIndex: 0.8,
      adoptionPhase: "pre_launch",
      forecastHorizonMonths: 12,
    },
    signals: [
      { signalDescription: "CMS national coverage determination requires Coverage with Evidence Development (CED); limits Medicare coverage to registry-enrolled patients", signalType: "Payer / coverage", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "CMS NCD for anti-amyloid antibodies", evidenceSnippet: "Medicare coverage limited to patients enrolled in qualifying CED registries" },
      { signalDescription: "Infusion center capacity in neurology is severely limited; most neurology practices lack IV infusion infrastructure", signalType: "Capacity / infrastructure", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "AAN practice infrastructure survey" },
      { signalDescription: "ARIA (amyloid-related imaging abnormalities) monitoring requires serial MRI every 3-4 months; radiology capacity strained", signalType: "Operational friction", direction: "Positive", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "Leqembi prescribing information / ARIA monitoring protocol" },
      { signalDescription: "Annual cost ~$26,500 plus infusion/monitoring costs exceeding $50,000 total annual cost per patient", signalType: "Access friction", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "Eisai pricing announcements and ICER cost analysis" },
      { signalDescription: "Major commercial payers (UnitedHealthcare, Aetna) imposing prior authorization, specialist confirmation, and amyloid PET/CSF biomarker requirements", signalType: "Payer / coverage", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "Commercial payer coverage policy tracker" },
      { signalDescription: "AAN practice guidelines cautiously support lecanemab use in appropriate patients but emphasize shared decision-making and risk discussion", signalType: "Guideline inclusion", direction: "Negative", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "AAN practice guideline update 2024" },
      { signalDescription: "Alzheimer's Association advocacy driving strong patient/caregiver demand; 'right to try' framing creating political pressure for access", signalType: "Field intelligence", direction: "Negative", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Alzheimer's Association advocacy campaign" },
      { signalDescription: "Only ~35% of eligible early AD patients have access to amyloid PET or CSF biomarker testing required for diagnosis confirmation", signalType: "Capacity / infrastructure", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Amyloid imaging access analysis (IDEAS study)" },
      { signalDescription: "Eisai establishing 600+ infusion sites and partnering with independent infusion networks; capacity expected to double within 12 months", signalType: "Experience infrastructure", direction: "Negative", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "early", sourceLabel: "Eisai investor presentations" },
      { signalDescription: "Subcutaneous formulation in development could eliminate infusion infrastructure barrier; expected approval 18-24 months", signalType: "Regulatory / clinical", direction: "Neutral", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "late", sourceLabel: "Eisai SC formulation development pipeline" },
      { signalDescription: "Community neurologists report insufficient training and support for ARIA monitoring; hesitant to prescribe without specialist backup", signalType: "Field intelligence", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Community neurologist readiness survey" },
      { signalDescription: "Competing anti-amyloid (donanemab) approval could fragment limited infusion capacity further", signalType: "Competitor countermove", direction: "Positive", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "early", sourceLabel: "Lilly donanemab FDA filing tracker" },
    ],
  },
  // ── CASE 6: Keytruda NSCLC (~55%) ──
  {
    case: {
      caseId: "VP-LAUNCH-006",
      assetName: "Keytruda (pembrolizumab)",
      assetType: "Biologic / Large molecule",
      therapeuticArea: "Oncology",
      diseaseState: "Non-Small Cell Lung Cancer (NSCLC)",
      specialty: "Medical Oncology",
      geography: "US",
      strategicQuestion: "Will Keytruda maintain >50% first-line NSCLC market share over the next 12 months despite emerging checkpoint inhibitor competition and biosimilar threats?",
      outcomeDefinition: "Keytruda maintains >50% first-line NSCLC TRx share at 12 months",
      timeHorizon: "12 months",
      priorProbability: 0.50,
      primarySpecialtyProfile: "Specialist-led",
      payerEnvironment: "Balanced",
      guidelineLeverage: "High",
      competitorProfile: "Emerging competitors (Opdivo+Yervoy, Imfinzi, Tecentriq) plus biosimilar horizon",
      accessFrictionIndex: 0.3,
      adoptionPhase: "mature_market",
      forecastHorizonMonths: 12,
    },
    signals: [
      { signalDescription: "KEYNOTE-024/189/042 long-term OS data reinforces pembrolizumab as standard-of-care first-line NSCLC monotherapy and combination", signalType: "Phase III clinical", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "global", timing: "current", sourceLabel: "KEYNOTE program 5-year OS updates (NEJM/JCO)" },
      { signalDescription: "NCCN Category 1 recommendation for pembrolizumab monotherapy (PD-L1 ≥50%) and combination (PD-L1 <50%) in first-line NSCLC", signalType: "Guideline inclusion", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "NCCN NSCLC Guidelines v5.2025" },
      { signalDescription: "Community oncologist survey: 78% name Keytruda as default first-line IO; prescribing behavior deeply habitual in NSCLC", signalType: "KOL endorsement", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Community oncologist IO prescribing survey 2025" },
      { signalDescription: "Keytruda patent cliff approaching 2028; biosimilar development programs from multiple manufacturers in Phase I/III", signalType: "Competitor countermove", direction: "Negative", strengthScore: 3, reliabilityScore: 4, scope: "global", timing: "late", sourceLabel: "Biosimilar pipeline tracker (EvaluatePharma)" },
      { signalDescription: "BMS Opdivo + Yervoy (CheckMate-9LA) gaining traction in PD-L1 <1% segment with dual-IO positioning", signalType: "Competitor counteraction", direction: "Negative", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "CheckMate-9LA trial data and BMS market share reports" },
      { signalDescription: "Broad commercial and Medicare coverage for pembrolizumab with minimal prior authorization burden in NSCLC", signalType: "Payer / coverage", direction: "Positive", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "Top 20 US payer formulary review" },
      { signalDescription: "AstraZeneca PACIFIC-2/ADRIATIC data expanding durvalumab into earlier NSCLC stages, potentially fragmenting IO market", signalType: "Competitor countermove", direction: "Negative", strengthScore: 3, reliabilityScore: 3, scope: "global", timing: "early", sourceLabel: "ADRIATIC/PACIFIC program results (ASCO 2025)" },
      { signalDescription: "Merck expanding Keytruda into perioperative NSCLC (KEYNOTE-671) creating new treatment sequences that reinforce franchise", signalType: "Phase III clinical", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "global", timing: "current", sourceLabel: "KEYNOTE-671 (NEJM 2024)" },
      { signalDescription: "Subcutaneous pembrolizumab formulation in development could reduce infusion burden and defend against biosimilar IV competition", signalType: "Regulatory / clinical", direction: "Positive", strengthScore: 3, reliabilityScore: 3, scope: "global", timing: "early", sourceLabel: "Merck SC pembrolizumab development program" },
      { signalDescription: "Bispecific antibodies and ADCs emerging as potential next-line challengers but not yet displacing first-line IO", signalType: "Field intelligence", direction: "Neutral", strengthScore: 2, reliabilityScore: 3, scope: "global", timing: "late", sourceLabel: "Oncology pipeline landscape analysis 2025" },
    ],
  },
  // ── CASE 7: Hemlibra Hemophilia A (~55%) ──
  {
    case: {
      caseId: "VP-ADOPTION-007",
      assetName: "Hemlibra (emicizumab)",
      assetType: "Biologic / Large molecule",
      therapeuticArea: "Hematology",
      diseaseState: "Hemophilia A",
      specialty: "Hematology",
      geography: "US",
      strategicQuestion: "Will Hemlibra achieve >55% of hemophilia A prophylaxis patient share within 12 months, displacing factor VIII prophylaxis as default standard of care?",
      outcomeDefinition: "Hemlibra achieves >55% of hemophilia A prophylaxis patients on therapy within 12 months",
      timeHorizon: "12 months",
      priorProbability: 0.50,
      primarySpecialtyProfile: "Specialist-led",
      payerEnvironment: "Balanced",
      guidelineLeverage: "High",
      competitorProfile: "Factor VIII products (established, declining) + gene therapy (emerging)",
      accessFrictionIndex: 0.3,
      adoptionPhase: "growth",
      forecastHorizonMonths: 12,
    },
    signals: [
      { signalDescription: "HAVEN 1-4 trials demonstrate emicizumab superiority over factor VIII prophylaxis with subcutaneous dosing every 1-4 weeks vs IV 3x/week", signalType: "Phase III clinical", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "global", timing: "current", sourceLabel: "HAVEN program (NEJM 2017-2021)" },
      { signalDescription: "WFH and ISTH guidelines now recommend emicizumab as first-line prophylaxis option for hemophilia A with and without inhibitors", signalType: "Guideline inclusion", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "global", timing: "current", sourceLabel: "WFH Guidelines 2024 / ISTH Recommendations" },
      { signalDescription: "Subcutaneous administration eliminates need for IV access and port placement, dramatically reducing treatment burden for pediatric patients", signalType: "Operational friction", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "Hemlibra prescribing information / route of administration" },
      { signalDescription: "Hemophilia treatment center (HTC) physician survey: 85% now preferentially recommend emicizumab for newly diagnosed severe hemophilia A", signalType: "KOL endorsement", direction: "Positive", strengthScore: 5, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "HTC prescriber preference survey 2025" },
      { signalDescription: "Gene therapy (valoctocogene roxaparvovec / Roctavian) approved but limited uptake due to durability concerns and $3.5M price", signalType: "Competitor countermove", direction: "Negative", strengthScore: 2, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "BioMarin Roctavian launch data / ICER review" },
      { signalDescription: "Factor VIII manufacturers launching extended half-life products (Esperoct, Jivi) to retain prophylaxis patients", signalType: "Competitor counteraction", direction: "Negative", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Novo Nordisk/Bayer EHL product launches" },
      { signalDescription: "Specialty pharmacy networks fully established for Hemlibra distribution with strong patient support programs", signalType: "Market adoption / utilization", direction: "Positive", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "Genentech/Roche patient services data" },
      { signalDescription: "Some patients and families express loyalty to factor VIII due to decades of experience and comfort with known safety profile", signalType: "Field intelligence", direction: "Negative", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "NHF patient community surveys" },
      { signalDescription: "fitusiran (Alhemo) approved as alternative non-factor prophylaxis but positioned as second-line; not displacing emicizumab", signalType: "Competitor countermove", direction: "Negative", strengthScore: 2, reliabilityScore: 3, scope: "national", timing: "current", sourceLabel: "Sanofi Alhemo launch data" },
      { signalDescription: "Payer coverage broad for emicizumab; many plans prefer it over factor VIII due to lower annual cost in severe patients", signalType: "Payer / coverage", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Specialty pharmacy cost-effectiveness analysis" },
    ],
  },
  // ── CASE 8: Mavyret vs Epclusa (~40%) ──
  {
    case: {
      caseId: "VP-COMPETITIVE-008",
      assetName: "Mavyret (glecaprevir/pibrentasvir)",
      assetType: "Medication",
      therapeuticArea: "Hepatology / Infectious Disease",
      diseaseState: "Hepatitis C (HCV)",
      specialty: "Hepatology / Gastroenterology",
      geography: "US",
      strategicQuestion: "Will Mavyret maintain >40% of new HCV treatment starts over the next 12 months as the market contracts and payer dynamics shift?",
      outcomeDefinition: "Mavyret maintains >40% of new HCV treatment starts by TRx within 12 months",
      timeHorizon: "12 months",
      priorProbability: 0.40,
      primarySpecialtyProfile: "Multi-specialty",
      payerEnvironment: "Restrictive",
      guidelineLeverage: "High",
      competitorProfile: "Epclusa (sofosbuvir/velpatasvir) as primary competitor",
      accessFrictionIndex: 0.5,
      adoptionPhase: "mature_market",
      forecastHorizonMonths: 12,
    },
    signals: [
      { signalDescription: "8-week pan-genotypic regimen with high SVR12 rates (>97%) across all genotypes in treatment-naive non-cirrhotic patients", signalType: "Phase III clinical", direction: "Positive", strengthScore: 5, reliabilityScore: 5, scope: "global", timing: "current", sourceLabel: "ENDURANCE/EXPEDITION clinical program" },
      { signalDescription: "AASLD/IDSA HCV guidance recommends both Mavyret and Epclusa as preferred pan-genotypic regimens without strong preference", signalType: "Guideline inclusion", direction: "Neutral", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "AASLD/IDSA HCV Guidance 2024" },
      { signalDescription: "State Medicaid programs increasingly removing fibrosis restrictions; broader treatment access expanding total addressable market", signalType: "Payer / coverage", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "State Medicaid HCV restriction tracker" },
      { signalDescription: "HCV treatment market contracting 8-12% annually as prevalent pool is treated; new patient starts declining", signalType: "Market adoption / utilization", direction: "Negative", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "IQVIA HCV market volume trends" },
      { signalDescription: "Epclusa maintains strong position in decompensated cirrhosis where Mavyret is contraindicated, securing a protected segment", signalType: "Competitor counteraction", direction: "Negative", strengthScore: 4, reliabilityScore: 5, scope: "national", timing: "current", sourceLabel: "Epclusa prescribing information / cirrhosis segment data" },
      { signalDescription: "AbbVie contracting strategies offering Mavyret at significant discounts to state DOC systems and FQHCs driving volume", signalType: "Payer / coverage", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "AbbVie state contract pricing data" },
      { signalDescription: "Shorter treatment duration (8 weeks vs 12 weeks for Epclusa) is meaningful advantage for hard-to-reach populations (PWID, incarcerated)", signalType: "Operational friction", direction: "Positive", strengthScore: 4, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Treatment completion rate analyses" },
      { signalDescription: "Generic sofosbuvir/velpatasvir authorized generics entering market, potentially undercutting both branded products", signalType: "Competitor countermove", direction: "Negative", strengthScore: 3, reliabilityScore: 3, scope: "national", timing: "early", sourceLabel: "Generic DAA pipeline tracker" },
      { signalDescription: "HCV micro-elimination programs in correctional and FQHC settings preferring whichever DAA offers best contract pricing", signalType: "Field intelligence", direction: "Neutral", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "NASEM HCV elimination program reports" },
      { signalDescription: "Hepatologist KOLs increasingly view Mavyret and Epclusa as interchangeable; prescriber choice driven by payer access rather than clinical preference", signalType: "KOL endorsement", direction: "Neutral", strengthScore: 3, reliabilityScore: 4, scope: "national", timing: "current", sourceLabel: "Hepatology KOL interview program" },
    ],
  },
];

export function buildCaseInsert(c: CaseSpec) {
  return {
    id: randomUUID(),
    caseId: c.caseId,
    assetName: c.assetName,
    assetType: c.assetType,
    therapeuticArea: c.therapeuticArea,
    diseaseState: c.diseaseState,
    specialty: c.specialty,
    geography: c.geography,
    strategicQuestion: c.strategicQuestion,
    outcomeDefinition: c.outcomeDefinition,
    timeHorizon: c.timeHorizon,
    priorProbability: c.priorProbability,
    primaryBrand: c.assetName,
    primarySpecialtyProfile: c.primarySpecialtyProfile,
    payerEnvironment: c.payerEnvironment,
    guidelineLeverage: c.guidelineLeverage,
    competitorProfile: c.competitorProfile,
    targetType: "market" as const,
    outcomeThreshold: 0.5,
    accessFrictionIndex: c.accessFrictionIndex,
    adoptionPhase: c.adoptionPhase,
    forecastHorizonMonths: c.forecastHorizonMonths,
    isDemo: "validation_pack",
  };
}

export function buildSignalInserts(caseId: string, signals: SignalSpec[]) {
  return signals.map((s, i) => {
    const computedLR = lr(s.signalType, s.strengthScore, s.reliabilityScore, s.scope, s.timing, s.direction);
    const signalId = `SIG-vp-${caseId}-${String(i + 1).padStart(2, "0")}`;
    return {
      id: randomUUID(),
      signalId,
      caseId,
      candidateId: signalId,
      brand: s.brand || null,
      signalDescription: s.signalDescription,
      signalType: s.signalType,
      direction: s.direction,
      strengthScore: s.strengthScore,
      reliabilityScore: s.reliabilityScore,
      likelihoodRatio: computedLR,
      scope: s.scope,
      timing: s.timing,
      weightedSignalScore: s.strengthScore * s.reliabilityScore,
      activeLikelihoodRatio: computedLR,
      status: "active" as const,
      createdByType: "system" as const,
      strength: s.strengthScore >= 4 ? "high" : s.strengthScore >= 3 ? "medium" : "low",
      reliability: s.reliabilityScore >= 4 ? "high" : s.reliabilityScore >= 3 ? "medium" : "low",
      sourceLabel: s.sourceLabel || null,
      evidenceSnippet: s.evidenceSnippet || null,
      signalScope: "market" as const,
      dependencyRole: "Independent parallel evidence",
      rootEvidenceId: randomUUID(),
      novelInformationFlag: "Yes",
      observedAt: new Date(),
      ...classifyEvidence({
        signalDescription: s.signalDescription,
        sourceLabel: s.sourceLabel || null,
        signalType: s.signalType,
        direction: s.direction,
      }),
      countTowardPosterior: true,
    };
  });
}
