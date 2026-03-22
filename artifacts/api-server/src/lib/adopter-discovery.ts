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
    ];
    for (const [spec, pattern] of specPatterns) {
      if (pattern.test(q)) { specialty = spec; break; }
    }
  }

  const geography = inputs.geography || "USA";

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

const US_REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West Coast", "Mid-Atlantic"];

function generateCandidates(parsed: ParsedQuestion, questionText: string): CandidateTemplate[] {
  const candidates: CandidateTemplate[] = [];
  const area = parsed.therapyArea || "General Medicine";
  const spec = parsed.specialty || area;
  const subSpec = parsed.subspecialty || null;
  const geo = parsed.geography;

  const physicianPool = [
    { name: "Dr. Sarah Chen", inst: "Massachusetts General Hospital", region: "Northeast", state: "MA" },
    { name: "Dr. James Rodriguez", inst: "Mayo Clinic", region: "Midwest", state: "MN" },
    { name: "Dr. Priya Patel", inst: "Cleveland Clinic", region: "Midwest", state: "OH" },
    { name: "Dr. Michael Thompson", inst: "Johns Hopkins Hospital", region: "Mid-Atlantic", state: "MD" },
    { name: "Dr. Emily Nakamura", inst: "Stanford Health Care", region: "West Coast", state: "CA" },
    { name: "Dr. Robert Washington", inst: "Duke University Medical Center", region: "Southeast", state: "NC" },
    { name: "Dr. Lisa Bergström", inst: "Mount Sinai Hospital", region: "Northeast", state: "NY" },
    { name: "Dr. David Kim", inst: "UCLA Medical Center", region: "West Coast", state: "CA" },
    { name: "Dr. Jennifer Okafor", inst: "MD Anderson Cancer Center", region: "Southwest", state: "TX" },
    { name: "Dr. William Hayes", inst: "University of Pennsylvania", region: "Mid-Atlantic", state: "PA" },
    { name: "Dr. Amanda Foster", inst: "UCSF Medical Center", region: "West Coast", state: "CA" },
    { name: "Dr. Carlos Mendez", inst: "Cedars-Sinai Medical Center", region: "West Coast", state: "CA" },
  ];

  const institutionPool = [
    { name: "Massachusetts General Hospital", region: "Northeast", state: "MA" },
    { name: "Mayo Clinic", region: "Midwest", state: "MN" },
    { name: "Cleveland Clinic", region: "Midwest", state: "OH" },
    { name: "Johns Hopkins Hospital", region: "Mid-Atlantic", state: "MD" },
    { name: "Stanford Health Care", region: "West Coast", state: "CA" },
    { name: "Duke University Medical Center", region: "Southeast", state: "NC" },
    { name: "Mount Sinai Hospital", region: "Northeast", state: "NY" },
    { name: "MD Anderson Cancer Center", region: "Southwest", state: "TX" },
    { name: "UCSF Medical Center", region: "West Coast", state: "CA" },
    { name: "University of Pennsylvania Health System", region: "Mid-Atlantic", state: "PA" },
  ];

  const signalTemplates = [
    { type: "Specialty match", scope: "physician", snippetFn: (c: string) => `${c} practices in ${spec}${subSpec ? ` with subspecialty focus in ${subSpec}` : ""}`, reliability: "high" as const },
    { type: "Trial participation", scope: "physician", snippetFn: (c: string) => `${c} listed as principal investigator in recent ${area} clinical trials`, reliability: "high" as const },
    { type: "Publication activity", scope: "physician", snippetFn: (c: string) => `${c} has published peer-reviewed research in ${area} within the last 24 months`, reliability: "medium" as const },
    { type: "Conference faculty", scope: "physician", snippetFn: (c: string) => `${c} served as faculty at major ${area} medical conference`, reliability: "medium" as const },
    { type: "Institutional readiness", scope: "institution", snippetFn: (c: string) => `${c} has established ${spec} service line with dedicated clinical infrastructure`, reliability: "high" as const },
    { type: "Formulary openness", scope: "institution", snippetFn: (c: string) => `${c} P&T committee has approved similar therapeutic agents in ${area}`, reliability: "medium" as const },
    { type: "Innovation adoption history", scope: "institution", snippetFn: (c: string) => `${c} has early adoption track record for novel therapies`, reliability: "medium" as const },
    { type: "Referral network", scope: "physician", snippetFn: (c: string) => `${c} maintains active referral network with community ${spec} providers`, reliability: "low" as const },
    { type: "Procedural capability", scope: "institution", snippetFn: (c: string) => `${c} has required procedural infrastructure for ${area} therapies`, reliability: "high" as const },
    { type: "Patient volume indicator", scope: "institution", snippetFn: (c: string) => `${c} treats high volume of ${area} patients based on public reporting data`, reliability: "medium" as const },
  ];

  const seededRandom = (seed: number) => {
    let s = seed;
    return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  };

  if (parsed.targetType !== "institution") {
    const seed = questionText.length * 31 + (parsed.therapyArea?.length ?? 7);
    const rng = seededRandom(seed);
    for (const p of physicianPool) {
      const numSignals = 2 + Math.floor(rng() * 4);
      const signals: CandidateTemplate["signals"] = [];
      const available = signalTemplates.filter(s => s.scope === "physician" || rng() > 0.5);
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
          evidenceSnippet: t.snippetFn(p.name),
        });
      }
      candidates.push({
        candidateType: "physician",
        candidateName: p.name,
        specialty: spec,
        subspecialty: subSpec,
        institutionName: p.inst,
        geography: `${p.state}, ${geo}`,
        signals,
      });
    }
  }

  if (parsed.targetType !== "physician") {
    const seed = questionText.length * 17 + (parsed.therapyArea?.length ?? 3);
    const rng = seededRandom(seed);
    for (const inst of institutionPool) {
      const numSignals = 2 + Math.floor(rng() * 4);
      const signals: CandidateTemplate["signals"] = [];
      const available = signalTemplates.filter(s => s.scope === "institution" || rng() > 0.6);
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
          evidenceSnippet: t.snippetFn(inst.name),
        });
      }
      candidates.push({
        candidateType: "institution",
        candidateName: inst.name,
        specialty: spec,
        subspecialty: subSpec,
        institutionName: inst.name,
        geography: `${inst.state}, ${geo}`,
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
