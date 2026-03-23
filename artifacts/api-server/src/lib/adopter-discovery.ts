interface ParsedQuestion {
  therapyArea: string | null;
  geography: string;
  targetType: "physician" | "institution" | "both";
  specialty: string | null;
  subspecialty: string | null;
  timeHorizon: string | null;
  adoptionOutcome: string | null;
}

export function parseDiscoveryQuestion(inputs: {
  questionText: string;
  geography?: string | null;
  therapyArea?: string | null;
  targetType?: string | null;
  specialty?: string | null;
  subspecialty?: string | null;
  timeHorizon?: string | null;
}): ParsedQuestion {
  const q = inputs.questionText.toLowerCase();

  let therapyArea = inputs.therapyArea || null;
  if (!therapyArea) {
    const taPatterns: [string, RegExp][] = [
      ["Respiratory / Pulmonology", /\b(pulmon|respiratory|lung|mac |arikayce|inhaled anti|copd|asthma|bronch)\b/],
      ["Cardiology", /\b(cardio|heart|cardiac|stent|valve|coronary|structural heart|tavr|watchman)\b/],
      ["Oncology", /\b(oncol|cancer|tumor|chemo|immuno-onc|pd-1|checkpoint|car-t)\b/],
      ["Neurology", /\b(neuro|brain|alzheimer|parkinson|epilep|migraine|multiple sclerosis)\b/],
      ["Infectious Disease", /\b(infectious|antibiotic|antifungal|hiv|hepatitis|antimicrobial)\b/],
      ["Rheumatology", /\b(rheumat|autoimmune|lupus|arthritis|biologics)\b/],
      ["Endocrinology", /\b(endocrin|diabet|insulin|thyroid|obesity|glp-1|semaglutide)\b/],
      ["Gastroenterology", /\b(gastro|gi |ibd|crohn|colitis|liver|hepat)\b/],
      ["Dermatology", /\b(dermat|skin|psoriasis|eczema|atopic)\b/],
      ["Hematology", /\b(hematol|blood|anemia|sickle cell|hemophilia)\b/],
      ["Psychiatry", /\b(psych|schizophren|depression|bipolar|mdd|antipsychotic|antidepressant)\b/],
    ];
    for (const [area, pattern] of taPatterns) {
      if (pattern.test(q)) { therapyArea = area; break; }
    }
  }

  let targetType: "physician" | "institution" | "both" = "both";
  if (inputs.targetType === "physician" || inputs.targetType === "institution") {
    targetType = inputs.targetType;
  } else if (/\b(doctor|physician|prescriber|hcp|npi)\b/.test(q)) {
    targetType = "physician";
  } else if (/\b(hospital|institution|center|clinic|health system|account)\b/.test(q)) {
    targetType = "institution";
  }

  let specialty = inputs.specialty || null;
  if (!specialty) {
    const specPatterns: [string, RegExp][] = [
      ["Pulmonology", /\b(pulmon|lung specialist)\b/],
      ["Cardiology", /\b(cardiolog)\b/],
      ["Interventional Cardiology", /\b(interventional cardio|cath lab)\b/],
      ["Electrophysiology", /\b(electrophysiol|ep lab|ablation)\b/],
      ["Oncology", /\b(oncolog)\b/],
      ["Infectious Disease", /\b(infectious disease|id specialist)\b/],
      ["Psychiatry", /\b(psychiatr)\b/],
      ["Dermatology", /\b(dermatolog)\b/],
      ["Rheumatology", /\b(rheumatolog)\b/],
      ["Hematology", /\b(hematolog)\b/],
    ];
    for (const [spec, pattern] of specPatterns) {
      if (pattern.test(q)) { specialty = spec; break; }
    }
  }

  let geography = inputs.geography || "USA";
  if (geography === "USA") {
    const statePatterns: [string, RegExp][] = [
      ["Florida", /\b(florida|fl\b)/], ["California", /\b(california|ca\b)/],
      ["Texas", /\b(texas|tx\b)/], ["New York", /\b(new york|ny\b)/],
      ["Massachusetts", /\b(massachusetts|ma\b)/], ["Pennsylvania", /\b(pennsylvania|pa\b)/],
      ["Ohio", /\b(ohio|oh\b)/], ["Illinois", /\b(illinois|il\b)/],
      ["North Carolina", /\b(north carolina|nc\b)/], ["Maryland", /\b(maryland|md\b)/],
      ["Minnesota", /\b(minnesota|mn\b)/], ["Michigan", /\b(michigan|mi\b)/],
      ["Georgia", /\b(georgia|ga\b)/], ["Tennessee", /\b(tennessee|tn\b)/],
      ["Colorado", /\b(colorado|co\b)/], ["Washington", /\b(washington state|wa\b)/],
      ["Oregon", /\b(oregon|or\b)/], ["Arizona", /\b(arizona|az\b)/],
      ["Missouri", /\b(missouri|mo\b)/], ["Connecticut", /\b(connecticut|ct\b)/],
      ["New Jersey", /\b(new jersey|nj\b)/], ["Virginia", /\b(virginia|va\b)/],
      ["Indiana", /\b(indiana|in\b)/], ["Wisconsin", /\b(wisconsin|wi\b)/],
      ["Alabama", /\b(alabama|al\b)/], ["Louisiana", /\b(louisiana|la\b)/],
      ["South Carolina", /\b(south carolina|sc\b)/], ["Kentucky", /\b(kentucky|ky\b)/],
      ["Iowa", /\b(iowa|ia\b)/], ["Utah", /\b(utah|ut\b)/],
    ];
    for (const [state, pattern] of statePatterns) {
      if (pattern.test(q)) { geography = state; break; }
    }
  }

  let timeHorizon = inputs.timeHorizon || null;
  if (!timeHorizon) {
    const thMatch = q.match(/(\d+)\s*(month|year|week)/);
    if (thMatch) {
      timeHorizon = `${thMatch[1]} ${thMatch[2]}${parseInt(thMatch[1]) > 1 ? "s" : ""}`;
    }
  }

  let adoptionOutcome: string | null = null;
  if (/\b(prescrib|adopt|use|switch|initiat|start)\b/.test(q)) {
    adoptionOutcome = "adoption";
  } else if (/\b(trial|investigat|enroll)\b/.test(q)) {
    adoptionOutcome = "trial participation";
  } else if (/\b(formulary|p&t|committee|access)\b/.test(q)) {
    adoptionOutcome = "formulary access";
  }

  return {
    therapyArea,
    geography,
    targetType,
    specialty,
    subspecialty: inputs.subspecialty || null,
    timeHorizon,
    adoptionOutcome,
  };
}

interface CandidateTemplate {
  candidateType: "physician" | "institution";
  candidateName: string;
  specialty: string;
  subspecialty: string | null;
  institutionName: string;
  geography: string;
  signals: {
    signalType: string;
    direction: "positive" | "negative" | "neutral";
    strength: "low" | "medium" | "high";
    reliability: "low" | "medium" | "high";
    signalScope: string;
    sourceLabel: string;
    sourceUrl: string;
    evidenceSnippet: string;
    eventFamilyId?: string;
  }[];
}

interface PhysicianEntry {
  name: string;
  inst: string;
  state: string;
  region: string;
}

interface InstitutionEntry {
  name: string;
  state: string;
  region: string;
}

const PHYSICIAN_POOL: PhysicianEntry[] = [
  { name: "Dr. Sarah Chen", inst: "Massachusetts General Hospital", state: "MA", region: "Northeast" },
  { name: "Dr. James Rodriguez", inst: "Mayo Clinic", state: "MN", region: "Midwest" },
  { name: "Dr. Priya Patel", inst: "Cleveland Clinic", state: "OH", region: "Midwest" },
  { name: "Dr. Michael Thompson", inst: "Johns Hopkins Hospital", state: "MD", region: "Mid-Atlantic" },
  { name: "Dr. Emily Nakamura", inst: "Stanford Health Care", state: "CA", region: "West Coast" },
  { name: "Dr. Robert Washington", inst: "Duke University Medical Center", state: "NC", region: "Southeast" },
  { name: "Dr. Lisa Bergström", inst: "Mount Sinai Hospital", state: "NY", region: "Northeast" },
  { name: "Dr. David Kim", inst: "UCLA Medical Center", state: "CA", region: "West Coast" },
  { name: "Dr. Jennifer Okafor", inst: "MD Anderson Cancer Center", state: "TX", region: "Southwest" },
  { name: "Dr. William Hayes", inst: "University of Pennsylvania", state: "PA", region: "Mid-Atlantic" },
  { name: "Dr. Amanda Foster", inst: "UCSF Medical Center", state: "CA", region: "West Coast" },
  { name: "Dr. Carlos Mendez", inst: "Cedars-Sinai Medical Center", state: "CA", region: "West Coast" },
  { name: "Dr. Maria Santos", inst: "University of Miami Health System", state: "FL", region: "Southeast" },
  { name: "Dr. Richard Alvarez", inst: "Moffitt Cancer Center", state: "FL", region: "Southeast" },
  { name: "Dr. Christine Lee", inst: "Mayo Clinic Jacksonville", state: "FL", region: "Southeast" },
  { name: "Dr. Thomas Wright", inst: "UF Health Shands Hospital", state: "FL", region: "Southeast" },
  { name: "Dr. Patricia Nguyen", inst: "AdventHealth Orlando", state: "FL", region: "Southeast" },
  { name: "Dr. Daniel Garcia", inst: "Baptist Health South Florida", state: "FL", region: "Southeast" },
  { name: "Dr. Angela Brooks", inst: "Tampa General Hospital", state: "FL", region: "Southeast" },
  { name: "Dr. Steven Park", inst: "Memorial Healthcare System", state: "FL", region: "Southeast" },
  { name: "Dr. Margaret O'Brien", inst: "Northwestern Memorial Hospital", state: "IL", region: "Midwest" },
  { name: "Dr. Kevin Jackson", inst: "University of Chicago Medical Center", state: "IL", region: "Midwest" },
  { name: "Dr. Rachel Goldstein", inst: "Houston Methodist Hospital", state: "TX", region: "Southwest" },
  { name: "Dr. Brian Murphy", inst: "UT Southwestern Medical Center", state: "TX", region: "Southwest" },
  { name: "Dr. Stephanie Liu", inst: "Baylor St. Luke's Medical Center", state: "TX", region: "Southwest" },
  { name: "Dr. Andrew Mitchell", inst: "Emory University Hospital", state: "GA", region: "Southeast" },
  { name: "Dr. Nicole Rivera", inst: "Grady Memorial Hospital", state: "GA", region: "Southeast" },
  { name: "Dr. Christopher Brown", inst: "Vanderbilt University Medical Center", state: "TN", region: "Southeast" },
  { name: "Dr. Laura Martinez", inst: "NYU Langone Health", state: "NY", region: "Northeast" },
  { name: "Dr. Jason Williams", inst: "Columbia University Irving Medical Center", state: "NY", region: "Northeast" },
  { name: "Dr. Samantha Taylor", inst: "Brigham and Women's Hospital", state: "MA", region: "Northeast" },
  { name: "Dr. Matthew Davis", inst: "University of Michigan Health", state: "MI", region: "Midwest" },
  { name: "Dr. Hannah Wilson", inst: "University of Colorado Hospital", state: "CO", region: "Southwest" },
  { name: "Dr. Robert Lin", inst: "Oregon Health & Science University", state: "OR", region: "West Coast" },
  { name: "Dr. Catherine Evans", inst: "University of Washington Medical Center", state: "WA", region: "West Coast" },
  { name: "Dr. Mark Johnson", inst: "Penn Medicine Princeton Medical Center", state: "NJ", region: "Mid-Atlantic" },
  { name: "Dr. Susan Clark", inst: "Yale New Haven Hospital", state: "CT", region: "Northeast" },
  { name: "Dr. David Hernandez", inst: "UVA Health", state: "VA", region: "Mid-Atlantic" },
  { name: "Dr. Amy Zhao", inst: "Scripps Health", state: "CA", region: "West Coast" },
  { name: "Dr. Paul Anderson", inst: "Rush University Medical Center", state: "IL", region: "Midwest" },
];

const INSTITUTION_POOL: InstitutionEntry[] = [
  { name: "Massachusetts General Hospital", state: "MA", region: "Northeast" },
  { name: "Mayo Clinic", state: "MN", region: "Midwest" },
  { name: "Cleveland Clinic", state: "OH", region: "Midwest" },
  { name: "Johns Hopkins Hospital", state: "MD", region: "Mid-Atlantic" },
  { name: "Stanford Health Care", state: "CA", region: "West Coast" },
  { name: "Duke University Medical Center", state: "NC", region: "Southeast" },
  { name: "Mount Sinai Hospital", state: "NY", region: "Northeast" },
  { name: "MD Anderson Cancer Center", state: "TX", region: "Southwest" },
  { name: "UCSF Medical Center", state: "CA", region: "West Coast" },
  { name: "University of Pennsylvania Health System", state: "PA", region: "Mid-Atlantic" },
  { name: "University of Miami Health System", state: "FL", region: "Southeast" },
  { name: "Moffitt Cancer Center", state: "FL", region: "Southeast" },
  { name: "Mayo Clinic Jacksonville", state: "FL", region: "Southeast" },
  { name: "UF Health Shands Hospital", state: "FL", region: "Southeast" },
  { name: "AdventHealth Orlando", state: "FL", region: "Southeast" },
  { name: "Baptist Health South Florida", state: "FL", region: "Southeast" },
  { name: "Tampa General Hospital", state: "FL", region: "Southeast" },
  { name: "Memorial Healthcare System", state: "FL", region: "Southeast" },
  { name: "Northwestern Memorial Hospital", state: "IL", region: "Midwest" },
  { name: "Houston Methodist Hospital", state: "TX", region: "Southwest" },
  { name: "UT Southwestern Medical Center", state: "TX", region: "Southwest" },
  { name: "Emory University Hospital", state: "GA", region: "Southeast" },
  { name: "Vanderbilt University Medical Center", state: "TN", region: "Southeast" },
  { name: "NYU Langone Health", state: "NY", region: "Northeast" },
  { name: "Brigham and Women's Hospital", state: "MA", region: "Northeast" },
  { name: "University of Michigan Health", state: "MI", region: "Midwest" },
  { name: "University of Colorado Hospital", state: "CO", region: "Southwest" },
  { name: "Oregon Health & Science University", state: "OR", region: "West Coast" },
  { name: "University of Washington Medical Center", state: "WA", region: "West Coast" },
  { name: "Yale New Haven Hospital", state: "CT", region: "Northeast" },
];

const STATE_ABBREVIATIONS: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
  "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
  "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
  "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
  "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
  "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
  "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
};

const ABBREVIATION_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBREVIATIONS).map(([state, abbr]) => [abbr, state])
);

function resolveGeographyFilter(geography: string): { filterState: string | null; displayGeo: string } {
  const geo = geography.trim();
  if (geo === "USA" || geo.toLowerCase() === "usa" || geo.toLowerCase() === "united states") {
    return { filterState: null, displayGeo: "USA" };
  }
  if (ABBREVIATION_TO_STATE[geo.toUpperCase()]) {
    const fullName = ABBREVIATION_TO_STATE[geo.toUpperCase()];
    return { filterState: geo.toUpperCase(), displayGeo: fullName };
  }
  const abbr = STATE_ABBREVIATIONS[geo];
  if (abbr) {
    return { filterState: abbr, displayGeo: geo };
  }
  return { filterState: null, displayGeo: geo };
}

const SIGNAL_TEMPLATES = [
  { type: "Specialty match", scope: "physician", snippetFn: (c: string, spec: string, subSpec: string | null) => `${c} practices in ${spec}${subSpec ? ` with subspecialty focus in ${subSpec}` : ""}`, reliability: "high" as const },
  { type: "Trial participation", scope: "physician", snippetFn: (c: string, spec: string) => `${c} listed as principal investigator in recent ${spec} clinical trials`, reliability: "high" as const },
  { type: "Publication activity", scope: "physician", snippetFn: (c: string, spec: string) => `${c} has published peer-reviewed research in ${spec} within the last 24 months`, reliability: "medium" as const },
  { type: "Conference faculty", scope: "physician", snippetFn: (c: string, spec: string) => `${c} served as faculty at major ${spec} medical conference`, reliability: "medium" as const },
  { type: "Institutional readiness", scope: "institution", snippetFn: (c: string, spec: string) => `${c} has established ${spec} service line with dedicated clinical infrastructure`, reliability: "high" as const },
  { type: "Formulary openness", scope: "institution", snippetFn: (c: string, spec: string) => `${c} P&T committee has approved similar therapeutic agents in ${spec}`, reliability: "medium" as const },
  { type: "Innovation adoption history", scope: "institution", snippetFn: (c: string) => `${c} has early adoption track record for novel therapies`, reliability: "medium" as const },
  { type: "Referral network", scope: "physician", snippetFn: (c: string, spec: string) => `${c} maintains active referral network with community ${spec} providers`, reliability: "low" as const },
  { type: "Procedural capability", scope: "institution", snippetFn: (c: string, spec: string) => `${c} has required procedural infrastructure for ${spec} therapies`, reliability: "high" as const },
  { type: "Patient volume indicator", scope: "institution", snippetFn: (c: string, spec: string) => `${c} treats high volume of ${spec} patients based on public reporting data`, reliability: "medium" as const },
];

function generateCandidates(parsed: ParsedQuestion, questionText: string): CandidateTemplate[] {
  const candidates: CandidateTemplate[] = [];
  const area = parsed.therapyArea || "General Medicine";
  const spec = parsed.specialty || area;
  const subSpec = parsed.subspecialty || null;
  const { filterState, displayGeo } = resolveGeographyFilter(parsed.geography);

  const seededRandom = (seed: number) => {
    let s = seed;
    return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  };

  if (parsed.targetType !== "institution") {
    const filteredPhysicians = filterState
      ? PHYSICIAN_POOL.filter(p => p.state === filterState)
      : PHYSICIAN_POOL;

    const seed = questionText.length * 31 + (parsed.therapyArea?.length ?? 7);
    const rng = seededRandom(seed);
    for (const p of filteredPhysicians) {
      const numSignals = 2 + Math.floor(rng() * 4);
      const signals: CandidateTemplate["signals"] = [];
      const available = SIGNAL_TEMPLATES.filter(s => s.scope === "physician" || rng() > 0.5);
      for (let i = 0; i < Math.min(numSignals, available.length); i++) {
        const t = available[i];
        signals.push({
          signalType: t.type,
          direction: rng() > 0.15 ? "positive" : rng() > 0.5 ? "neutral" : "negative",
          strength: rng() > 0.6 ? "high" : rng() > 0.3 ? "medium" : "low",
          reliability: t.reliability,
          signalScope: "physician",
          sourceLabel: `${t.type} — ${p.inst}`,
          sourceUrl: `https://example.com/source/${encodeURIComponent(p.name.replace(/\s/g, "-").toLowerCase())}/${t.type.replace(/\s/g, "-").toLowerCase()}`,
          evidenceSnippet: t.snippetFn(p.name, spec, subSpec),
        });
      }
      candidates.push({
        candidateType: "physician",
        candidateName: p.name,
        specialty: spec,
        subspecialty: subSpec,
        institutionName: p.inst,
        geography: `${p.state}, USA`,
        signals,
      });
    }
  }

  if (parsed.targetType !== "physician") {
    const filteredInstitutions = filterState
      ? INSTITUTION_POOL.filter(inst => inst.state === filterState)
      : INSTITUTION_POOL;

    const seed = questionText.length * 17 + (parsed.therapyArea?.length ?? 3);
    const rng = seededRandom(seed);
    for (const inst of filteredInstitutions) {
      const numSignals = 2 + Math.floor(rng() * 4);
      const signals: CandidateTemplate["signals"] = [];
      const available = SIGNAL_TEMPLATES.filter(s => s.scope === "institution" || rng() > 0.6);
      for (let i = 0; i < Math.min(numSignals, available.length); i++) {
        const t = available[i];
        signals.push({
          signalType: t.type,
          direction: rng() > 0.15 ? "positive" : rng() > 0.5 ? "neutral" : "negative",
          strength: rng() > 0.6 ? "high" : rng() > 0.3 ? "medium" : "low",
          reliability: t.reliability,
          signalScope: "institution",
          sourceLabel: `${t.type} — ${inst.name}`,
          sourceUrl: `https://example.com/source/${encodeURIComponent(inst.name.replace(/\s/g, "-").toLowerCase())}/${t.type.replace(/\s/g, "-").toLowerCase()}`,
          evidenceSnippet: t.snippetFn(inst.name, spec, subSpec),
        });
      }
      candidates.push({
        candidateType: "institution",
        candidateName: inst.name,
        specialty: spec,
        subspecialty: subSpec,
        institutionName: inst.name,
        geography: `${inst.state}, USA`,
        signals,
      });
    }
  }

  return candidates;
}

function computePrepScore(signals: CandidateTemplate["signals"], specialty: string | null, subspecialty: string | null): { score: number; completeness: number; action: string } {
  let score = 0;
  let totalPossible = 6;
  let evidenceCount = 0;

  const hasSpecMatch = signals.some(s => s.signalType === "Specialty match");
  if (hasSpecMatch) { score += 1.5; evidenceCount++; }

  const hasTrial = signals.some(s => s.signalType === "Trial participation");
  if (hasTrial) { score += 1.5; evidenceCount++; }

  const hasInstitutional = signals.some(s => s.signalType === "Institutional readiness" || s.signalType === "Procedural capability");
  if (hasInstitutional) { score += 1.0; evidenceCount++; }

  const hasPub = signals.some(s => s.signalType === "Publication activity" || s.signalType === "Conference faculty");
  if (hasPub) { score += 1.0; evidenceCount++; }

  const hasFormulary = signals.some(s => s.signalType === "Formulary openness");
  if (hasFormulary) { score += 0.5; evidenceCount++; }

  const hasVolume = signals.some(s => s.signalType === "Patient volume indicator" || s.signalType === "Innovation adoption history");
  if (hasVolume) { score += 0.5; evidenceCount++; }

  const positiveCount = signals.filter(s => s.direction === "positive").length;
  const negativeCount = signals.filter(s => s.direction === "negative").length;
  score += positiveCount * 0.2;
  score -= negativeCount * 0.3;

  const highStrength = signals.filter(s => s.strength === "high").length;
  score += highStrength * 0.15;

  const completeness = Math.min(1, evidenceCount / totalPossible);

  if (completeness < 0.3) score -= 0.5;

  let action: string;
  if (score >= 4.0 && completeness >= 0.5) action = "send to CIOS scoring";
  else if (score >= 2.0) action = "needs review";
  else action = "insufficient evidence";

  return { score: Math.max(0, Math.round(score * 100) / 100), completeness: Math.round(completeness * 100) / 100, action };
}

export function runDiscovery(inputs: {
  questionText: string;
  geography?: string | null;
  therapyArea?: string | null;
  targetType?: string | null;
  specialty?: string | null;
  subspecialty?: string | null;
  timeHorizon?: string | null;
}) {
  const parsed = parseDiscoveryQuestion(inputs);
  const rawCandidates = generateCandidates(parsed, inputs.questionText);

  const candidates = rawCandidates.map(c => {
    const { score, completeness, action } = computePrepScore(c.signals, c.specialty, c.subspecialty);
    const positiveSignals = c.signals.filter(s => s.direction === "positive").length;
    const negativeSignals = c.signals.filter(s => s.direction === "negative").length;
    const neutralSignals = c.signals.filter(s => s.direction === "neutral").length;
    return { ...c, prepScore: score, evidenceCompleteness: completeness, suggestedAction: action, positiveSignals, negativeSignals, neutralSignals };
  });

  candidates.sort((a, b) => b.prepScore - a.prepScore);

  return {
    parsedQuestion: parsed,
    candidates,
    totalCandidates: candidates.length,
    totalSignals: candidates.reduce((sum, c) => sum + c.signals.length, 0),
  };
}
