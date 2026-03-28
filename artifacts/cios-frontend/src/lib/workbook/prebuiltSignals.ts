import type { NormalizedSignal } from "./normalizeCiosSignals";

interface MiosSignal {
  text: string;
  direction: "positive" | "negative";
  strength: "High" | "Medium" | "Low";
  confidence: "Confirmed" | "Probable" | "Speculative";
  whyItMatters: string;
  trialOrSource: string;
}

interface BaosSignal {
  text: string;
  direction: "positive" | "negative";
  strength: "High" | "Medium" | "Low";
  confidence: "Confirmed" | "Probable" | "Speculative";
  whyItMatters: string;
  cognitiveLens: string;
}

interface BrandSignalSet {
  brand: string;
  company: string;
  mios: MiosSignal[];
  baos: BaosSignal[];
}

const BRAND_SIGNALS: BrandSignalSet[] = [
  {
    brand: "Entresto",
    company: "Novartis",
    mios: [
      { text: "PARADIGM-HF: 20% reduction in cardiovascular death or HF hospitalization vs enalapril (HR 0.80, p<0.001, n=8442)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "First RAAS inhibitor to show mortality benefit over ACEi in HFrEF", trialOrSource: "McMurray JJ et al. NEJM 2014;371:993-1004" },
      { text: "FDA approved for HFrEF (NYHA Class II-IV) to reduce cardiovascular death and hospitalization (Jul 2015)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Regulatory milestone opened market access", trialOrSource: "FDA NDA 207620 Approval" },
      { text: "Symptomatic hypotension reported in 18% of Entresto vs 12% enalapril in PARADIGM-HF", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Safety signal created dosing concerns for prescribers", trialOrSource: "PARADIGM-HF safety data" },
    ],
    baos: [
      { text: "Status quo bias: cardiologists continued ACEi/ARB despite superior outcomes — 'my patients are stable, why switch?'", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Cognitive inertia anchored prescribers to familiar therapy even when evidence favored change", cognitiveLens: "Status Quo Bias" },
      { text: "Hypotension fear amplification: 18% hypotension rate was perceived as higher risk than clinical data supported", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Availability heuristic made adverse event feel more common than actual incidence", cognitiveLens: "Availability Heuristic" },
      { text: "Guideline authority effect: AHA/ACC guideline upgrade to Class I recommendation triggered switching behavior", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Guideline endorsement provided external validation that reduced perceived risk of change", cognitiveLens: "Authority Bias" },
    ],
  },
  {
    brand: "Repatha",
    company: "Amgen",
    mios: [
      { text: "FOURIER trial: evolocumab reduced LDL-C by 59% and cardiovascular events by 15% vs placebo (HR 0.85, n=27,564)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Established PCSK9 inhibitor class efficacy for CV event reduction", trialOrSource: "Sabatine MS et al. NEJM 2017;376:1713-22" },
      { text: "FDA approved for established ASCVD to reduce MI, stroke, coronary revascularization (Dec 2017)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "CV indication expanded beyond lipid-lowering label", trialOrSource: "FDA sBLA Approval Dec 2017" },
      { text: "Launch price $14,100/year created immediate payer pushback with prior authorization requirements", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Cost barrier directly limited patient access despite clinical benefit", trialOrSource: "ICER 2017 review; PBM formulary restrictions" },
    ],
    baos: [
      { text: "Anchoring to LDL targets: physicians anchored to statin-era LDL goals and questioned whether further reduction was clinically necessary", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Existing mental model of 'good enough' LDL prevented urgency to add PCSK9i", cognitiveLens: "Anchoring Bias" },
      { text: "Administrative friction aversion: prior authorization burden made prescribers avoid initiating Repatha even for eligible patients", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Effort cost of PA process outweighed perceived benefit of prescribing for many physicians", cognitiveLens: "Effort Heuristic / Friction Aversion" },
    ],
  },
  {
    brand: "Dupixent",
    company: "Sanofi / Regeneron",
    mios: [
      { text: "LIBERTY AD SOLO 1&2: dupilumab achieved EASI-75 in 44-51% of moderate-to-severe AD patients vs 12-15% placebo at wk 16", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "First biologic with robust efficacy in atopic dermatitis", trialOrSource: "Simpson EL et al. NEJM 2016;375:2335-48" },
      { text: "FDA approved across 6+ indications (AD, asthma, CRSwNP, EoE, prurigo nodularis, COPD) through 2024", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Multi-indication expansion validated IL-4/IL-13 pathway across Type 2 inflammation", trialOrSource: "FDA approval history 2017-2024" },
      { text: "Conjunctivitis observed in 8-10% of AD patients in pivotal trials — not seen with other biologics", direction: "negative", strength: "Low", confidence: "Confirmed", whyItMatters: "Class-unique AE required monitoring but did not materially impact prescribing", trialOrSource: "LIBERTY AD integrated safety analysis" },
    ],
    baos: [
      { text: "Visible skin improvement created rapid positive reinforcement loop for both patient and prescriber", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Observable outcome reduced uncertainty and strengthened prescribing confidence", cognitiveLens: "Confirmation Bias (positive feedback)" },
      { text: "Multi-indication success created 'platform credibility' — clinicians generalized efficacy expectation across Type 2 conditions", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Halo effect from one indication lowered prescribing hesitation in adjacent conditions", cognitiveLens: "Halo Effect" },
    ],
  },
  {
    brand: "Keytruda",
    company: "Merck & Co.",
    mios: [
      { text: "KEYNOTE-024: pembrolizumab improved PFS vs chemo in PD-L1≥50% NSCLC (HR 0.50, p<0.001, n=305)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Established pembrolizumab as first-line monotherapy standard in high-PD-L1 NSCLC", trialOrSource: "Reck M et al. NEJM 2016;375:1823-33" },
      { text: "FDA approved in 30+ tumor types/indications, broadest I-O label globally", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Pan-tumor approval scope created dominant I-O franchise", trialOrSource: "FDA approval history 2014-2024" },
      { text: "Immune-related AEs (irAEs) in 15-20% of patients including pneumonitis, colitis, hepatitis", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "irAE management requires specialized monitoring infrastructure", trialOrSource: "KEYNOTE integrated safety data" },
    ],
    baos: [
      { text: "KOL bandwagon effect: high-volume oncologists adopted early, creating social proof cascade at community level", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Expert adoption created normative pressure for community oncologists to follow", cognitiveLens: "Bandwagon Effect / Social Proof" },
      { text: "Biomarker (PD-L1) testing requirement created cognitive gating — no test, no prescribing trigger", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Added decisional step acted as friction point in clinical workflow", cognitiveLens: "Choice Architecture / Friction" },
    ],
  },
  {
    brand: "Ofev",
    company: "Boehringer Ingelheim",
    mios: [
      { text: "INPULSIS-1&2: nintedanib reduced annual FVC decline by ~125 mL/yr vs placebo in IPF (p<0.001, n=1066)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Demonstrated meaningful disease-modifying effect in progressive fibrosis", trialOrSource: "Richeldi L et al. NEJM 2014;370:2071-82" },
      { text: "GI adverse events (diarrhea) in 62% of nintedanib patients vs 18% placebo", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Tolerability signal directly impacted adherence and prescribing confidence", trialOrSource: "INPULSIS integrated safety" },
    ],
    baos: [
      { text: "Absence of symptomatic improvement undermined patient motivation: 'I don't feel better so why continue?'", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Lack of perceived benefit weakened adherence — disease modification is invisible to patient", cognitiveLens: "Outcome Salience Bias" },
      { text: "Physicians struggled to communicate 'slowing decline' as a positive outcome — narrative framing failed", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Disease-modifying benefit without felt improvement is harder to convey than symptomatic relief", cognitiveLens: "Framing Effect" },
    ],
  },
  {
    brand: "Spinraza",
    company: "Biogen",
    mios: [
      { text: "ENDEAR: nusinersen improved motor function in SMA Type 1 — 51% achieved motor milestones vs 0% sham (n=122)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Transformational efficacy in uniformly fatal disease changed treatment paradigm", trialOrSource: "Finkel RS et al. NEJM 2017;377:1723-32" },
      { text: "Requires intrathecal administration every 4 months — specialized procedure with anesthesia", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Route of administration creates logistical burden and limits to specialized centers", trialOrSource: "Spinraza PI, administration requirements" },
    ],
    baos: [
      { text: "Desperation-driven adoption: families of SMA children drove immediate demand regardless of logistical burden", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "In fatal diseases, severity of unmet need overrides normal adoption friction", cognitiveLens: "Urgency / Loss Aversion" },
      { text: "Center-of-excellence gatekeeping: only specialized centers could administer, creating access bottleneck", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Geographic concentration of expertise limited diffusion to broader patient population", cognitiveLens: "Access Friction / System Constraint" },
    ],
  },
  {
    brand: "Trikafta",
    company: "Vertex Pharmaceuticals",
    mios: [
      { text: "Phase 3: elexacaftor/tezacaftor/ivacaftor improved ppFEV1 by 14 percentage points and reduced pulmonary exacerbations by 63% (n=403)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Unprecedented lung function improvement in F508del CF patients", trialOrSource: "Middleton PG et al. NEJM 2019;381:1809-19" },
      { text: "Eligible for ~90% of CF patients (F508del mutation) vs prior CFTR modulators covering 4-50%", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Genotype coverage expansion dramatically enlarged addressable population", trialOrSource: "FDA label, mutation eligibility" },
    ],
    baos: [
      { text: "Rapid visible improvement (weight gain, reduced cough) created peer-to-peer advocacy and word-of-mouth demand", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Patient community amplified success stories, accelerating remaining adoption", cognitiveLens: "Social Proof / Peer Influence" },
      { text: "Identity disruption: some patients reported psychological adjustment difficulty — 'CF defined me, who am I now?'", direction: "negative", strength: "Low", confidence: "Probable", whyItMatters: "Unexpected behavioral barrier in ultra-successful therapy — does not impact adoption volume", cognitiveLens: "Identity Disruption" },
    ],
  },
  {
    brand: "Zepbound",
    company: "Eli Lilly",
    mios: [
      { text: "SURMOUNT-1: tirzepatide 15mg achieved 22.5% mean weight loss vs 3.1% placebo at 72 weeks (n=2539)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Weight loss magnitude exceeded all prior pharmacologic obesity therapies", trialOrSource: "Jastreboff AM et al. NEJM 2022;387:205-16" },
      { text: "FDA approved for chronic weight management in BMI≥30 or ≥27 with comorbidity (Nov 2023)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Regulatory approval in obesity opened distinct commercial pathway from Mounjaro (T2D)", trialOrSource: "FDA NDA Approval Nov 2023" },
      { text: "Manufacturing capacity constraints limiting supply through 2024-2025", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Supply ceiling directly caps near-term adoption regardless of demand", trialOrSource: "Lilly earnings calls 2024, FDA shortage list" },
    ],
    baos: [
      { text: "Consumer demand outpacing clinical gatekeeping: patients self-referring and requesting by name", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Direct-to-consumer awareness bypassed traditional physician-initiated prescribing model", cognitiveLens: "Demand Pull / Consumer Agency" },
      { text: "Weight regain concern: 'what happens when I stop?' created prescriber hesitation about long-term commitment framing", direction: "negative", strength: "Medium", confidence: "Probable", whyItMatters: "Uncertainty about treatment duration raised questions about lifetime therapy burden", cognitiveLens: "Ambiguity Aversion" },
    ],
  },
  {
    brand: "Jardiance",
    company: "Boehringer Ingelheim",
    mios: [
      { text: "EMPA-REG OUTCOME: empagliflozin reduced CV death by 38% in T2D with established CVD (HR 0.62, p<0.001, n=7020)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "First diabetes drug to demonstrate CV mortality reduction, shifting T2D treatment paradigm", trialOrSource: "Zinman B et al. NEJM 2015;373:2117-28" },
      { text: "EMPEROR-Reduced: empagliflozin reduced HF hospitalization in HFrEF regardless of diabetes status (HR 0.75, n=3730)", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Heart failure indication expanded prescriber base beyond endocrinology", trialOrSource: "Packer M et al. NEJM 2020;383:1413-24" },
    ],
    baos: [
      { text: "Cross-specialty adoption friction: cardiologists initially deferred to endocrinologists — 'that's a diabetes drug, not mine'", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Specialty identity created cognitive boundary that delayed cross-specialty prescribing", cognitiveLens: "Professional Identity / Scope Anchoring" },
      { text: "CV mortality data triggered guideline cascade: ADA+ACC+ESC all updated, creating multi-authority endorsement", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Convergent guideline signals overcame individual prescriber inertia through institutional pressure", cognitiveLens: "Authority Convergence" },
    ],
  },
  {
    brand: "Xeljanz",
    company: "Pfizer",
    mios: [
      { text: "ORAL Surveillance: tofacitinib showed increased MACE and malignancy risk vs TNF inhibitors in RA (HR 1.33 MACE, HR 1.48 malignancy, n=4362)", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Post-marketing safety study triggered FDA black box warning and restricted label", trialOrSource: "Ytterberg SR et al. NEJM 2022;386:316-26" },
      { text: "FDA added black box warning for serious heart-related events, cancer, blood clots, and death (Sep 2021)", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Regulatory safety action materially restricted commercial trajectory", trialOrSource: "FDA Safety Communication Sep 2021" },
    ],
    baos: [
      { text: "Loss aversion override: physicians rapidly de-prescribed despite years of positive experience — safety signal weighted more than efficacy experience", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Negative safety signal outweighed accumulated positive clinical experience in prescribing decisions", cognitiveLens: "Loss Aversion / Negativity Bias" },
      { text: "Class generalization fear: safety concern spread to all JAK inhibitors regardless of molecular differences", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Representative heuristic caused physicians to treat class risk as equivalent to individual drug risk", cognitiveLens: "Representativeness Heuristic" },
    ],
  },
];

function buildMiosSignal(
  id: string,
  signal: MiosSignal,
  brand: string,
  company: string,
): NormalizedSignal {
  return {
    id,
    text: signal.text,
    caveat: signal.whyItMatters,
    direction: signal.direction,
    strength: signal.strength,
    reliability: signal.confidence,
    impact: signal.strength,
    category: "evidence",
    source: "system",
    accepted: true,
    signal_class: "observed",
    signal_family: "brand_clinical_regulatory",
    source_type: "MIOS",
    priority_source: "observed_verified",
    is_locked: true,
    workbook_meta: {
      sourceWorkbook: `MIOS — ${brand} (${company})`,
      programId: `MIOS-${brand.toUpperCase()}`,
      whyItMatters: signal.whyItMatters,
      trialOrSource: signal.trialOrSource,
    },
  };
}

function buildBaosSignal(
  id: string,
  signal: BaosSignal,
  brand: string,
  company: string,
): NormalizedSignal {
  return {
    id,
    text: signal.text,
    caveat: signal.whyItMatters,
    direction: signal.direction,
    strength: signal.strength,
    reliability: signal.confidence,
    impact: signal.strength,
    category: "evidence",
    source: "system",
    accepted: true,
    signal_class: "observed",
    signal_family: "provider_behavioral",
    source_type: "BAOS",
    priority_source: "observed_verified",
    is_locked: true,
    workbook_meta: {
      sourceWorkbook: `BAOS — ${brand} (${company})`,
      programId: `BAOS-${brand.toUpperCase()}`,
      whyItMatters: signal.whyItMatters,
      cognitiveLens: signal.cognitiveLens,
    },
  };
}

export function getSignalsForBrand(brandName: string): NormalizedSignal[] {
  const signals: NormalizedSignal[] = [];
  const lowerBrand = brandName.toLowerCase().trim();

  for (const brand of BRAND_SIGNALS) {
    const bLower = brand.brand.toLowerCase();
    if (lowerBrand.includes(bLower) || bLower.includes(lowerBrand)) {
      brand.mios.forEach((m, i) => {
        signals.push(buildMiosSignal(`mios_${bLower}_${i}`, m, brand.brand, brand.company));
      });
      brand.baos.forEach((b, i) => {
        signals.push(buildBaosSignal(`baos_${bLower}_${i}`, b, brand.brand, brand.company));
      });
      return signals;
    }
  }

  return signals;
}

export function getAnalogSignalsForBrand(_brandName: string): NormalizedSignal[] {
  return [];
}

export function getAllPrebuiltSignals(): NormalizedSignal[] {
  return [];
}

export function getBrandList(): string[] {
  return BRAND_SIGNALS.map(b => b.brand);
}
