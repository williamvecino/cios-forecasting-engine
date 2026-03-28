import type { NormalizedSignal } from "./normalizeCiosSignals";

interface BrandSignalSet {
  brand: string;
  company: string;
  mios: { text: string; direction: "positive" | "negative"; strength: "High" | "Medium" | "Low"; confidence: "Confirmed" | "Probable" | "Speculative"; whyItMatters: string }[];
  baos: { text: string; direction: "positive" | "negative"; strength: "High" | "Medium" | "Low"; confidence: "Confirmed" | "Probable" | "Speculative"; whyItMatters: string }[];
}

const BRAND_SIGNALS: BrandSignalSet[] = [
  {
    brand: "Entresto",
    company: "Novartis",
    mios: [
      { text: "Mortality and hospitalization reduction established strong outcome credibility", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Demonstrated survival benefit shifted heart failure treatment from symptomatic control to outcome modification" },
    ],
    baos: [
      { text: "Physician inertia slowed switching from ACE inhibitors despite superior outcomes", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Clinical superiority does not automatically overcome established prescribing routines" },
    ],
  },
  {
    brand: "Repatha",
    company: "Amgen",
    mios: [
      { text: "LDL reduction was dramatic but early outcome evidence lag created adoption hesitation", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Strong biomarker effect alone was insufficient until cardiovascular outcomes data matured" },
    ],
    baos: [
      { text: "Prior authorization complexity reduced prescribing enthusiasm", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Administrative burden can suppress uptake regardless of clinical value" },
    ],
  },
  {
    brand: "Dupixent",
    company: "Sanofi / Regeneron",
    mios: [
      { text: "Consistent efficacy across multiple inflammatory endpoints strengthened platform credibility", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Multi-indication success created perception of a dependable mechanism rather than a niche therapy" },
    ],
    baos: [
      { text: "Visible patient improvement reinforced clinician confidence and accelerated adoption", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Observable benefit strengthens prescribing momentum" },
    ],
  },
  {
    brand: "Keytruda",
    company: "Merck & Co.",
    mios: [
      { text: "Durable survival benefit established trust in immunotherapy mechanism", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Durable response shifted oncology practice patterns toward checkpoint inhibitors" },
    ],
    baos: [
      { text: "Strong KOL advocacy normalized checkpoint inhibitor use", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Expert endorsement accelerates guideline acceptance" },
    ],
  },
  {
    brand: "Ofev",
    company: "Boehringer Ingelheim",
    mios: [
      { text: "Slowing disease progression without symptom reversal required reframing clinical expectations", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Benefit was meaningful but not immediately perceptible to patients" },
    ],
    baos: [
      { text: "Patient perception of limited symptom improvement reduced adherence motivation", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Lack of felt benefit can weaken persistence" },
    ],
  },
  {
    brand: "Spinraza",
    company: "Biogen",
    mios: [
      { text: "Transformational efficacy in rare disease justified rapid adoption despite high cost", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Magnitude of benefit outweighed economic barriers" },
    ],
    baos: [
      { text: "Parent advocacy created strong demand pressure for early treatment", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Advocacy groups can accelerate therapy uptake" },
    ],
  },
  {
    brand: "Trikafta",
    company: "Vertex Pharmaceuticals",
    mios: [
      { text: "Broad genotype coverage dramatically expanded eligible patient population", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Expanded eligibility accelerated market penetration" },
    ],
    baos: [
      { text: "Rapid visible improvement created strong word-of-mouth momentum among patients", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Peer experience strongly influences treatment demand" },
    ],
  },
  {
    brand: "Zepbound",
    company: "Eli Lilly",
    mios: [
      { text: "Weight loss magnitude exceeded historical expectations for pharmacologic therapy", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Effect size reset clinician expectations for obesity treatment" },
    ],
    baos: [
      { text: "High patient demand exceeded supply capacity, constraining adoption speed", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Supply limitations can cap early uptake" },
    ],
  },
  {
    brand: "Jardiance",
    company: "Boehringer Ingelheim",
    mios: [
      { text: "Cardiovascular mortality reduction expanded positioning beyond glycemic control", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Outcome benefit redefined therapeutic value proposition" },
    ],
    baos: [
      { text: "Cardiologist adoption expanded use beyond endocrinology", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "New prescriber segments increase growth velocity" },
    ],
  },
  {
    brand: "Xeljanz",
    company: "Pfizer",
    mios: [
      { text: "Safety signal emergence constrained long-term adoption trajectory", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Risk perception can override efficacy in chronic disease settings" },
    ],
    baos: [
      { text: "Safety warnings increased clinician caution in long-term prescribing", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Risk perception can quickly change prescribing behavior" },
    ],
  },
];

const ARIKAYCE_ANALOGS: { text: string; direction: "positive" | "negative"; strength: "High" | "Medium"; confidence: "Confirmed" | "Probable"; whyItMatters: string; analogBrand: string }[] = [
  { text: "Slowing disease progression without immediate symptom relief required expectation reframing", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Physicians initially hesitated because patients did not feel dramatically better, even though disease progression slowed", analogBrand: "Ofev" },
  { text: "Durable physiologic improvement drove rapid adoption despite variability in symptom response", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Durable improvement in lung function created strong confidence even when individual symptoms varied", analogBrand: "Trikafta" },
  { text: "Modest symptom benefit but clear disease-modifying effect required education to drive uptake", direction: "negative", strength: "Medium", confidence: "Confirmed", whyItMatters: "Physicians needed reassurance that slowing decline was clinically meaningful even without dramatic symptom relief", analogBrand: "Esbriet" },
  { text: "Strong biomarker improvement preceded widespread confidence in clinical outcomes", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Clinicians waited for outcome confirmation before changing prescribing behavior", analogBrand: "Repatha" },
  { text: "Consistent improvement across multiple endpoints built rapid confidence in treatment value", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Alignment between symptom improvement and objective measures reinforced trust", analogBrand: "Dupixent" },
  { text: "Mortality benefit did not immediately overcome physician inertia", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Even strong outcome data required time for clinicians to change established practice patterns", analogBrand: "Entresto" },
  { text: "Transformational efficacy outweighed concerns about administration burden", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Clear clinical benefit justified logistical complexity", analogBrand: "Spinraza" },
  { text: "Safety signal emergence reduced clinician confidence despite strong efficacy", direction: "negative", strength: "High", confidence: "Confirmed", whyItMatters: "Risk perception can outweigh positive efficacy signals", analogBrand: "Xeljanz" },
  { text: "Targeted efficacy in a defined population accelerated physician confidence", direction: "positive", strength: "High", confidence: "Confirmed", whyItMatters: "Clear patient selection criteria reduced uncertainty in prescribing decisions", analogBrand: "Kalydeco" },
  { text: "High perceived clinical value overcame initial payer hesitation", direction: "positive", strength: "Medium", confidence: "Probable", whyItMatters: "Strong perceived benefit can drive system-level alignment", analogBrand: "Zolgensma" },
];

function buildSignal(
  id: string,
  text: string,
  direction: "positive" | "negative" | "neutral",
  strength: "High" | "Medium" | "Low",
  confidence: "Confirmed" | "Probable" | "Speculative",
  whyItMatters: string,
  sourceType: string,
  programId: string,
  sourceWorkbook: string,
): NormalizedSignal {
  return {
    id,
    text,
    caveat: whyItMatters,
    direction,
    strength,
    reliability: confidence,
    impact: strength,
    category: "evidence",
    source: "system",
    accepted: true,
    signal_class: "observed",
    signal_family: "brand_clinical_regulatory",
    source_type: sourceType,
    priority_source: "observed_verified",
    is_locked: true,
    workbook_meta: {
      sourceWorkbook,
      programId,
      whyItMatters,
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
        signals.push(buildSignal(
          `mios_${bLower}_${i}`, m.text, m.direction, m.strength, m.confidence,
          m.whyItMatters, "MIOS", `MIOS-${brand.brand.toUpperCase()}`, `MIOS — ${brand.brand} (${brand.company})`
        ));
      });
      brand.baos.forEach((b, i) => {
        signals.push(buildSignal(
          `baos_${bLower}_${i}`, b.text, b.direction, b.strength, b.confidence,
          b.whyItMatters, "BAOS", `BAOS-${brand.brand.toUpperCase()}`, `BAOS — ${brand.brand} (${brand.company})`
        ));
      });
      return signals;
    }
  }

  return signals;
}

export function getAnalogSignalsForBrand(brandName: string): NormalizedSignal[] {
  const lowerBrand = brandName.toLowerCase().trim();
  if (!lowerBrand.includes("arikayce")) return [];

  return ARIKAYCE_ANALOGS.map((a, i) =>
    buildSignal(
      `analog_${i}`, a.text, a.direction, a.strength, a.confidence,
      a.whyItMatters, "Analog", `ANALOG-ARIKAYCE`, `Analog — ${a.analogBrand}`
    )
  );
}

export function getAllPrebuiltSignals(): NormalizedSignal[] {
  const all: NormalizedSignal[] = [];
  for (const brand of BRAND_SIGNALS) {
    brand.mios.forEach((m, i) => {
      all.push(buildSignal(
        `mios_${brand.brand.toLowerCase()}_${i}`, m.text, m.direction, m.strength, m.confidence,
        m.whyItMatters, "MIOS", `MIOS-${brand.brand.toUpperCase()}`, `MIOS — ${brand.brand} (${brand.company})`
      ));
    });
    brand.baos.forEach((b, i) => {
      all.push(buildSignal(
        `baos_${brand.brand.toLowerCase()}_${i}`, b.text, b.direction, b.strength, b.confidence,
        b.whyItMatters, "BAOS", `BAOS-${brand.brand.toUpperCase()}`, `BAOS — ${brand.brand} (${brand.company})`
      ));
    });
  }

  ARIKAYCE_ANALOGS.forEach((a, i) => {
    all.push(buildSignal(
      `analog_${i}`, a.text, a.direction, a.strength, a.confidence,
      a.whyItMatters, "Analog", `ANALOG-ARIKAYCE`, `Analog — ${a.analogBrand}`
    ));
  });

  return all;
}

export function getBrandList(): string[] {
  return BRAND_SIGNALS.map(b => b.brand);
}
