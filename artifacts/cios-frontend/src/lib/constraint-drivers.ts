export interface ConstraintDriver {
  name: string;
  defaultSeverity: number;
  defaultProbability: number;
  defaultReach: number;
}

export interface RankedDriver {
  name: string;
  severity: number;
  probability: number;
  reach: number;
  impactScore: number;
  rank: "High" | "Moderate" | "Low";
}

export interface ConstraintDecomposition {
  gateId: string;
  gateLabel: string;
  gateStatus: string;
  isAbstract: boolean;
  drivers: RankedDriver[];
}

const CONSTRAINT_DRIVER_MAP: Record<string, ConstraintDriver[]> = {
  "operational readiness": [
    { name: "Site workflow integration", defaultSeverity: 8, defaultProbability: 7, defaultReach: 8 },
    { name: "Staff training and familiarity", defaultSeverity: 7, defaultProbability: 8, defaultReach: 7 },
    { name: "Patient onboarding logistics", defaultSeverity: 6, defaultProbability: 6, defaultReach: 7 },
    { name: "Equipment or protocol availability", defaultSeverity: 8, defaultProbability: 5, defaultReach: 6 },
    { name: "Administrative burden", defaultSeverity: 5, defaultProbability: 7, defaultReach: 8 },
  ],
  "access readiness": [
    { name: "Coverage criteria clarity", defaultSeverity: 9, defaultProbability: 7, defaultReach: 9 },
    { name: "Prior authorization predictability", defaultSeverity: 8, defaultProbability: 8, defaultReach: 8 },
    { name: "Patient cost exposure", defaultSeverity: 7, defaultProbability: 6, defaultReach: 8 },
    { name: "Appeals process reliability", defaultSeverity: 6, defaultProbability: 5, defaultReach: 5 },
    { name: "Network availability", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
  ],
  "payer access": [
    { name: "Coverage criteria clarity", defaultSeverity: 9, defaultProbability: 7, defaultReach: 9 },
    { name: "Prior authorization predictability", defaultSeverity: 8, defaultProbability: 8, defaultReach: 8 },
    { name: "Patient cost exposure", defaultSeverity: 7, defaultProbability: 6, defaultReach: 8 },
    { name: "Appeals process reliability", defaultSeverity: 6, defaultProbability: 5, defaultReach: 5 },
    { name: "Network availability", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
  ],
  "reimbursement readiness": [
    { name: "Coverage criteria clarity", defaultSeverity: 9, defaultProbability: 7, defaultReach: 9 },
    { name: "Prior authorization predictability", defaultSeverity: 8, defaultProbability: 8, defaultReach: 8 },
    { name: "Patient cost exposure", defaultSeverity: 7, defaultProbability: 6, defaultReach: 8 },
    { name: "Appeals process reliability", defaultSeverity: 6, defaultProbability: 5, defaultReach: 5 },
    { name: "Coding and billing readiness", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
  ],
  "behavioral readiness": [
    { name: "Physician familiarity", defaultSeverity: 8, defaultProbability: 8, defaultReach: 8 },
    { name: "Perceived benefit vs risk", defaultSeverity: 9, defaultProbability: 6, defaultReach: 9 },
    { name: "Peer adoption visibility", defaultSeverity: 6, defaultProbability: 7, defaultReach: 7 },
    { name: "Habit inertia", defaultSeverity: 7, defaultProbability: 8, defaultReach: 8 },
    { name: "Switching complexity", defaultSeverity: 6, defaultProbability: 5, defaultReach: 6 },
  ],
  "clinical confidence": [
    { name: "Strength of evidence", defaultSeverity: 9, defaultProbability: 7, defaultReach: 9 },
    { name: "Consistency of outcomes", defaultSeverity: 8, defaultProbability: 6, defaultReach: 8 },
    { name: "Safety profile clarity", defaultSeverity: 8, defaultProbability: 7, defaultReach: 9 },
    { name: "Guideline alignment", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
    { name: "Real-world experience", defaultSeverity: 6, defaultProbability: 5, defaultReach: 6 },
  ],
  "clinical evidence": [
    { name: "Strength of evidence", defaultSeverity: 9, defaultProbability: 7, defaultReach: 9 },
    { name: "Consistency of outcomes", defaultSeverity: 8, defaultProbability: 6, defaultReach: 8 },
    { name: "Safety profile clarity", defaultSeverity: 8, defaultProbability: 7, defaultReach: 9 },
    { name: "Guideline alignment", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
    { name: "Real-world experience", defaultSeverity: 6, defaultProbability: 5, defaultReach: 6 },
  ],
  "workflow integration": [
    { name: "Clinic scheduling compatibility", defaultSeverity: 7, defaultProbability: 7, defaultReach: 8 },
    { name: "EMR documentation requirements", defaultSeverity: 6, defaultProbability: 8, defaultReach: 7 },
    { name: "Nursing or staff protocol changes", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
    { name: "Patient flow disruption", defaultSeverity: 6, defaultProbability: 5, defaultReach: 6 },
    { name: "Monitoring and follow-up coordination", defaultSeverity: 5, defaultProbability: 6, defaultReach: 6 },
  ],
  "market readiness": [
    { name: "Competitive landscape clarity", defaultSeverity: 7, defaultProbability: 6, defaultReach: 8 },
    { name: "Field force deployment", defaultSeverity: 8, defaultProbability: 7, defaultReach: 7 },
    { name: "Distribution channel availability", defaultSeverity: 7, defaultProbability: 5, defaultReach: 8 },
    { name: "Patient awareness and demand", defaultSeverity: 6, defaultProbability: 6, defaultReach: 7 },
    { name: "KOL engagement and advocacy", defaultSeverity: 7, defaultProbability: 7, defaultReach: 6 },
  ],
  "adoption readiness": [
    { name: "Provider familiarity with product", defaultSeverity: 8, defaultProbability: 8, defaultReach: 8 },
    { name: "Patient identification pathway", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
    { name: "Prescribing confidence", defaultSeverity: 8, defaultProbability: 7, defaultReach: 8 },
    { name: "Support program availability", defaultSeverity: 6, defaultProbability: 6, defaultReach: 7 },
    { name: "Switching cost from current standard", defaultSeverity: 7, defaultProbability: 7, defaultReach: 7 },
  ],
  "infrastructure readiness": [
    { name: "Facility or equipment requirements", defaultSeverity: 8, defaultProbability: 6, defaultReach: 7 },
    { name: "Supply chain reliability", defaultSeverity: 7, defaultProbability: 5, defaultReach: 8 },
    { name: "IT and data system compatibility", defaultSeverity: 6, defaultProbability: 6, defaultReach: 6 },
    { name: "Cold chain or storage requirements", defaultSeverity: 7, defaultProbability: 4, defaultReach: 5 },
    { name: "Geographic distribution coverage", defaultSeverity: 6, defaultProbability: 5, defaultReach: 7 },
  ],
  "execution risk": [
    { name: "Launch timeline feasibility", defaultSeverity: 8, defaultProbability: 7, defaultReach: 8 },
    { name: "Cross-functional coordination", defaultSeverity: 7, defaultProbability: 7, defaultReach: 7 },
    { name: "Budget and resource allocation", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
    { name: "Regulatory compliance burden", defaultSeverity: 8, defaultProbability: 5, defaultReach: 8 },
    { name: "Field execution capability", defaultSeverity: 6, defaultProbability: 6, defaultReach: 6 },
  ],
  "implementation complexity": [
    { name: "Training requirements", defaultSeverity: 7, defaultProbability: 8, defaultReach: 7 },
    { name: "Process redesign needed", defaultSeverity: 8, defaultProbability: 6, defaultReach: 7 },
    { name: "Multi-stakeholder coordination", defaultSeverity: 7, defaultProbability: 7, defaultReach: 6 },
    { name: "Technology integration complexity", defaultSeverity: 6, defaultProbability: 5, defaultReach: 6 },
    { name: "Change management burden", defaultSeverity: 6, defaultProbability: 7, defaultReach: 7 },
  ],
  "stakeholder alignment": [
    { name: "Physician buy-in", defaultSeverity: 9, defaultProbability: 7, defaultReach: 8 },
    { name: "Payer cooperation", defaultSeverity: 8, defaultProbability: 6, defaultReach: 8 },
    { name: "Internal leadership alignment", defaultSeverity: 7, defaultProbability: 7, defaultReach: 7 },
    { name: "Patient advocacy engagement", defaultSeverity: 5, defaultProbability: 5, defaultReach: 6 },
    { name: "Health system procurement", defaultSeverity: 7, defaultProbability: 5, defaultReach: 6 },
  ],
  "system capacity": [
    { name: "Staff capacity", defaultSeverity: 7, defaultProbability: 7, defaultReach: 8 },
    { name: "Appointment availability", defaultSeverity: 6, defaultProbability: 7, defaultReach: 7 },
    { name: "Lab or diagnostic throughput", defaultSeverity: 7, defaultProbability: 5, defaultReach: 6 },
    { name: "Referral pathway bandwidth", defaultSeverity: 6, defaultProbability: 6, defaultReach: 7 },
    { name: "Operational bandwidth", defaultSeverity: 5, defaultProbability: 7, defaultReach: 7 },
  ],
  "resource availability": [
    { name: "Staff capacity", defaultSeverity: 7, defaultProbability: 7, defaultReach: 8 },
    { name: "Time availability", defaultSeverity: 6, defaultProbability: 8, defaultReach: 7 },
    { name: "Budget allocation", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
    { name: "Equipment access", defaultSeverity: 6, defaultProbability: 5, defaultReach: 6 },
    { name: "Operational bandwidth", defaultSeverity: 5, defaultProbability: 7, defaultReach: 7 },
  ],
  "training readiness": [
    { name: "Clinical staff knowledge gaps", defaultSeverity: 8, defaultProbability: 8, defaultReach: 7 },
    { name: "Administrative staff preparation", defaultSeverity: 6, defaultProbability: 7, defaultReach: 6 },
    { name: "Training program availability", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
    { name: "Competency assessment process", defaultSeverity: 5, defaultProbability: 5, defaultReach: 5 },
    { name: "Ongoing education needs", defaultSeverity: 5, defaultProbability: 6, defaultReach: 6 },
  ],
  "regulatory readiness": [
    { name: "Label clarity and completeness", defaultSeverity: 8, defaultProbability: 6, defaultReach: 9 },
    { name: "Post-marketing requirement burden", defaultSeverity: 7, defaultProbability: 6, defaultReach: 7 },
    { name: "REMS or safety program requirements", defaultSeverity: 8, defaultProbability: 5, defaultReach: 8 },
    { name: "International regulatory alignment", defaultSeverity: 6, defaultProbability: 5, defaultReach: 6 },
    { name: "Compliance monitoring obligations", defaultSeverity: 5, defaultProbability: 6, defaultReach: 6 },
  ],
  "guideline endorsement": [
    { name: "Current guideline positioning", defaultSeverity: 8, defaultProbability: 6, defaultReach: 9 },
    { name: "Guideline committee receptivity", defaultSeverity: 7, defaultProbability: 5, defaultReach: 7 },
    { name: "Evidence threshold for inclusion", defaultSeverity: 8, defaultProbability: 7, defaultReach: 8 },
    { name: "Competing therapy positioning", defaultSeverity: 6, defaultProbability: 6, defaultReach: 7 },
    { name: "Timeline to next guideline update", defaultSeverity: 5, defaultProbability: 7, defaultReach: 6 },
  ],
};

const ABSTRACT_PATTERNS = [
  /readiness$/i,
  /^(operational|access|behavioral|clinical|market|adoption|infrastructure|training|regulatory|reimbursement)\b/i,
  /\b(risk|complexity|alignment|capacity|availability|integration|confidence|endorsement)\b/i,
];

function isAbstractConstraint(label: string): boolean {
  return ABSTRACT_PATTERNS.some(p => p.test(label.trim()));
}

function findDrivers(label: string): ConstraintDriver[] | null {
  const normalized = label.toLowerCase().trim();

  if (CONSTRAINT_DRIVER_MAP[normalized]) {
    return CONSTRAINT_DRIVER_MAP[normalized];
  }

  for (const [key, drivers] of Object.entries(CONSTRAINT_DRIVER_MAP)) {
    const keyWords = key.split(/\s+/);
    const labelWords = normalized.split(/\s+/);
    const overlap = keyWords.filter(w => labelWords.includes(w));
    if (overlap.length >= 1 && overlap.length >= keyWords.length * 0.5) {
      return drivers;
    }
  }

  return null;
}

const STATUS_MULTIPLIER: Record<string, number> = {
  weak: 1.0,
  unresolved: 0.9,
  moderate: 0.6,
  strong: 0.2,
};

function scoreDriver(driver: ConstraintDriver, gateStatus: string): RankedDriver {
  const multiplier = STATUS_MULTIPLIER[gateStatus] ?? 0.5;
  const severity = Math.round(driver.defaultSeverity * multiplier * 10) / 10;
  const probability = Math.round(driver.defaultProbability * multiplier * 10) / 10;
  const reach = Math.round(driver.defaultReach * multiplier * 10) / 10;
  const impactScore = Math.round(severity * probability * reach * 10) / 10;

  let rank: "High" | "Moderate" | "Low";
  if (impactScore >= 300) rank = "High";
  else if (impactScore >= 150) rank = "Moderate";
  else rank = "Low";

  return { name: driver.name, severity, probability, reach, impactScore, rank };
}

export interface GateInput {
  gate_id: string;
  gate_label: string;
  status: string;
}

export function decomposeConstraints(gates: GateInput[]): ConstraintDecomposition[] {
  return gates.map(gate => {
    const abstract = isAbstractConstraint(gate.gate_label);
    const driverDefs = findDrivers(gate.gate_label);

    if (!driverDefs || driverDefs.length === 0) {
      return {
        gateId: gate.gate_id,
        gateLabel: gate.gate_label,
        gateStatus: gate.status,
        isAbstract: abstract,
        drivers: [],
      };
    }

    const scored = driverDefs
      .map(d => scoreDriver(d, gate.status))
      .sort((a, b) => b.impactScore - a.impactScore);

    return {
      gateId: gate.gate_id,
      gateLabel: gate.gate_label,
      gateStatus: gate.status,
      isAbstract: abstract,
      drivers: scored,
    };
  });
}

export function enforceDecomposition(decompositions: ConstraintDecomposition[]): void {
  for (const d of decompositions) {
    if (d.isAbstract && d.drivers.length === 0) {
      throw new Error(
        `Abstract constraint "${d.gateLabel}" has no decomposed drivers. ` +
        `Add a driver mapping for this constraint category.`
      );
    }
  }
}

export function getDriverMap(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, drivers] of Object.entries(CONSTRAINT_DRIVER_MAP)) {
    result[key] = drivers.map(d => d.name);
  }
  return result;
}
