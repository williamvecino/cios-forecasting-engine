export interface CategoryCheck {
  category: string;
  tier: 1 | 2 | 3;
  present: boolean;
  message: string;
  matchingSignalIds: string[];
}

export interface CompletenessResult {
  pass: boolean;
  hardBlocked: boolean;
  tier1: CategoryCheck[];
  tier2: CategoryCheck[];
  tier3: CategoryCheck[];
  allChecks: CategoryCheck[];
}

interface SignalInput {
  signal_id?: string;
  signalId?: string;
  signal_type?: string;
  signalType?: string;
  signal_family?: string;
  signalFamily?: string;
  evidence_class?: string;
  evidenceClass?: string;
  signal_description?: string;
  description?: string;
  count_toward_posterior?: boolean;
  countTowardPosterior?: boolean;
}

function getType(s: SignalInput): string {
  return (s.signal_type || s.signalType || "").toLowerCase();
}

function getFamily(s: SignalInput): string {
  return (s.signal_family || s.signalFamily || "").toLowerCase();
}

function getEvidenceClass(s: SignalInput): string {
  return (s.evidence_class || s.evidenceClass || "").toLowerCase();
}

function getDescription(s: SignalInput): string {
  return (s.signal_description || s.description || "").toLowerCase();
}

function getId(s: SignalInput): string {
  return s.signal_id || s.signalId || "";
}

function isActive(s: SignalInput): boolean {
  if (s.count_toward_posterior !== undefined) return s.count_toward_posterior === true;
  if (s.countTowardPosterior !== undefined) return s.countTowardPosterior === true;
  return false;
}

function matchesClinical(s: SignalInput): boolean {
  const t = getType(s);
  const f = getFamily(s);
  const ec = getEvidenceClass(s);
  return (
    t.includes("phase") ||
    t.includes("clinical") && !t.includes("hold") ||
    t.includes("real-world") ||
    t.includes("rwe") ||
    t.includes("h2h") ||
    t.includes("head-to-head") ||
    t.includes("pivotal") ||
    t.includes("randomized") ||
    f.includes("clinical evidence") ||
    ec === "pivotal_trial"
  );
}

function matchesPayer(s: SignalInput): boolean {
  const t = getType(s);
  const f = getFamily(s);
  return (
    t.includes("payer") ||
    t.includes("coverage") ||
    t.includes("formulary") ||
    t.includes("cms") ||
    t.includes("value-based") ||
    t.includes("reimbursement") ||
    t.includes("access") && (t.includes("commercial") || f.includes("access") || f.includes("reimbursement")) ||
    f.includes("access") ||
    f.includes("reimbursement") ||
    f.includes("payer")
  );
}

function matchesSafety(s: SignalInput): boolean {
  const t = getType(s);
  const f = getFamily(s);
  return (
    t.includes("safety") ||
    t.includes("tolerability") ||
    t.includes("black box") ||
    t.includes("rems") ||
    t.includes("post-marketing") ||
    t.includes("faers") ||
    t.includes("clinical hold") ||
    t === "regulatory / clinical" ||
    f.includes("safety") ||
    f.includes("pharmacovigilance")
  );
}

function matchesGuidelines(s: SignalInput): boolean {
  const t = getType(s);
  const f = getFamily(s);
  const desc = getDescription(s);
  return (
    t.includes("guideline") ||
    t.includes("society") ||
    t.includes("endorsement") ||
    f.includes("guideline") ||
    (t.includes("field intelligence") && (
      desc.includes("guideline") ||
      desc.includes("ats") ||
      desc.includes("idsa") ||
      desc.includes("nccn") ||
      desc.includes("asco") ||
      desc.includes("society") ||
      desc.includes("recommendation")
    ))
  );
}

function matchesOperational(s: SignalInput): boolean {
  const t = getType(s);
  const f = getFamily(s);
  return (
    t.includes("infusion") ||
    t.includes("administration") ||
    t.includes("diagnostic pathway") ||
    t.includes("sq replacing") ||
    t.includes("subcutaneous") ||
    t.includes("dosing") ||
    t.includes("operational") ||
    t.includes("capacity") ||
    t.includes("infrastructure") ||
    f.includes("operational") ||
    f.includes("delivery")
  );
}

function matchesCompetitive(s: SignalInput): boolean {
  const t = getType(s);
  const f = getFamily(s);
  return (
    t.includes("field intelligence") ||
    t.includes("market") ||
    t.includes("biosimilar") ||
    t.includes("competitor") ||
    t.includes("launch") ||
    t.includes("kol") ||
    t.includes("stigma") ||
    f.includes("field intelligence") ||
    f.includes("competitive") ||
    f.includes("market")
  );
}

export function runCompletenessCheck(signals: SignalInput[]): CompletenessResult {
  const active = signals.filter(isActive);

  const categories: { name: string; tier: 1 | 2 | 3; matcher: (s: SignalInput) => boolean; missingMessage: string }[] = [
    {
      name: "Clinical Evidence",
      tier: 1,
      matcher: matchesClinical,
      missingMessage: "No clinical evidence signal. Every forecast requires at least one trial result or RWE signal. Add the pivotal trial before running.",
    },
    {
      name: "Payer / Access",
      tier: 2,
      matcher: matchesPayer,
      missingMessage: "No payer assessment — forecast may underestimate access barriers.",
    },
    {
      name: "Safety",
      tier: 2,
      matcher: matchesSafety,
      missingMessage: "No safety assessment — confirm no material safety concern before client use.",
    },
    {
      name: "Operational / Administration",
      tier: 2,
      matcher: matchesOperational,
      missingMessage: "No operational assessment — confirm administration burden has been considered.",
    },
    {
      name: "Guidelines / Expert Support",
      tier: 3,
      matcher: matchesGuidelines,
      missingMessage: "Guideline status not assessed.",
    },
    {
      name: "Competitive / Market",
      tier: 3,
      matcher: matchesCompetitive,
      missingMessage: "Competitive landscape not assessed.",
    },
  ];

  const checks: CategoryCheck[] = categories.map(cat => {
    const matching = active.filter(cat.matcher);
    return {
      category: cat.name,
      tier: cat.tier,
      present: matching.length > 0,
      message: matching.length > 0 ? "" : cat.missingMessage,
      matchingSignalIds: matching.map(getId),
    };
  });

  const hardBlocked = checks.some(c => c.tier === 1 && !c.present);

  return {
    pass: checks.every(c => c.present),
    hardBlocked,
    tier1: checks.filter(c => c.tier === 1),
    tier2: checks.filter(c => c.tier === 2),
    tier3: checks.filter(c => c.tier === 3),
    allChecks: checks,
  };
}
