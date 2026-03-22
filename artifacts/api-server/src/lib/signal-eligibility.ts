const TARGET_HIERARCHY: Record<string, string[]> = {
  market: ["market"],
  specialty: ["market", "specialty"],
  subspecialty: ["market", "specialty", "subspecialty"],
  institution: ["market", "specialty", "subspecialty", "institution"],
  physician: ["market", "specialty", "subspecialty", "institution", "physician"],
};

export interface SignalWithScope {
  signalId: string;
  signalScope: string | null;
  appliesToTargetId: string | null;
  appliesToSpecialty: string | null;
  appliesToSubspecialty: string | null;
  appliesToInstitutionId: string | null;
  appliesToGeography: string | null;
  eventFamilyId: string | null;
  likelihoodRatio: number | null;
  [key: string]: any;
}

export interface CaseTargetContext {
  targetType: string;
  targetId: string | null;
  specialty: string | null;
  subspecialty: string | null;
  institutionName: string | null;
  geography: string | null;
}

export function filterEligibleSignals<T extends SignalWithScope>(
  signals: T[],
  caseContext: CaseTargetContext,
): T[] {
  const allowedScopes = TARGET_HIERARCHY[caseContext.targetType] ?? ["market"];

  return signals.filter((s) => {
    const scope = s.signalScope ?? "market";
    if (!allowedScopes.includes(scope)) return false;

    if (scope === "specialty" && s.appliesToSpecialty && caseContext.specialty) {
      if (s.appliesToSpecialty.toLowerCase() !== caseContext.specialty.toLowerCase()) return false;
    }
    if (scope === "subspecialty" && s.appliesToSubspecialty && caseContext.subspecialty) {
      if (s.appliesToSubspecialty.toLowerCase() !== caseContext.subspecialty.toLowerCase()) return false;
    }
    if (scope === "institution" && s.appliesToInstitutionId && caseContext.institutionName) {
      if (s.appliesToInstitutionId.toLowerCase() !== caseContext.institutionName.toLowerCase()) return false;
    }
    if (scope === "physician" && s.appliesToTargetId && caseContext.targetId) {
      if (s.appliesToTargetId !== caseContext.targetId) return false;
    }

    return true;
  });
}

export function applyEventFamilyGuardrail<T extends SignalWithScope>(signals: T[]): T[] {
  const familyGroups = new Map<string, T[]>();
  const ungrouped: T[] = [];

  for (const s of signals) {
    if (s.eventFamilyId) {
      const group = familyGroups.get(s.eventFamilyId) ?? [];
      group.push(s);
      familyGroups.set(s.eventFamilyId, group);
    } else {
      ungrouped.push(s);
    }
  }

  const result = [...ungrouped];

  for (const [, group] of familyGroups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    group.sort((a, b) => Math.abs(Math.log(b.likelihoodRatio ?? 1)) - Math.abs(Math.log(a.likelihoodRatio ?? 1)));
    const strongest = group[0];
    result.push(strongest);
    for (let i = 1; i < group.length; i++) {
      const lr = group[i].likelihoodRatio ?? 1;
      const logLr = Math.log(lr);
      const cappedLogLr = logLr / (i + 1);
      result.push({ ...group[i], likelihoodRatio: Number(Math.exp(cappedLogLr).toFixed(4)) });
    }
  }

  return result;
}
