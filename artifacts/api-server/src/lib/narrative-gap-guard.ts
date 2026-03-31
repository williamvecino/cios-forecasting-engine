const BANNED_GAP_PHRASES = [
  "deserves",
  "ready to deliver",
  "market readiness",
  "opportunity gap",
  "performance gap",
  "what the product deserves",
  "what the market is ready to deliver",
  "what the data would suggest",
  "unlocking the full potential",
  "true potential",
  "unrealized potential",
  "latent demand",
  "inherent value",
];

const BANNED_PATTERNS = BANNED_GAP_PHRASES.map(
  (phrase) => new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
);

const NUMERIC_PATTERN = /\d+(\.\d+)?(%|[- ]?point|pp| pts?|[- ]?gap|\.\d)/i;
const OBSERVED_PATTERN = /\b(current(ly)?|observed|actual|measured|today|now|existing|present)\b.*?\d/i;
const EXPECTED_PATTERN = /\b(target|expected|benchmark|threshold|ceiling|needed|required|goal)\b.*?\d/i;
const DIFFERENCE_PATTERN = /\b(\d+[- ]?point|\d+pp|\d+%?\s*(gap|delta|difference|shortfall|below|above|vs\.?))\b/i;
const DRIVER_PATTERN = /\b(driven by|constrained by|caused by|due to|because of|limited by|attributable to|resulting from)\b/i;

function extractSentence(text: string, position: number): string {
  const before = text.lastIndexOf(".", position - 1);
  const after = text.indexOf(".", position);
  const start = before >= 0 ? before + 1 : 0;
  const end = after >= 0 ? after + 1 : text.length;
  return text.slice(start, end).trim();
}

function hasNumericContext(sentence: string): boolean {
  const hasNumeric = NUMERIC_PATTERN.test(sentence);
  const hasObserved = OBSERVED_PATTERN.test(sentence);
  const hasExpected = EXPECTED_PATTERN.test(sentence);
  const hasDifference = DIFFERENCE_PATTERN.test(sentence);
  const hasDriver = DRIVER_PATTERN.test(sentence);

  if (hasNumeric && hasDifference && hasDriver) return true;
  if (hasObserved && hasExpected && hasDifference) return true;
  if (hasNumeric && hasDriver && (hasObserved || hasExpected)) return true;

  return false;
}

export interface GapViolation {
  phrase: string;
  position: number;
  context: string;
  sentence: string;
  requiredStructure: {
    observedValue: string | null;
    expectedValue: string | null;
    difference: string | null;
    drivers: string | null;
  };
}

export interface GapScanResult {
  clean: boolean;
  violations: GapViolation[];
  violationCount: number;
}

export function scanForGapViolations(text: string): GapScanResult {
  if (!text || typeof text !== "string") {
    return { clean: true, violations: [], violationCount: 0 };
  }

  const violations: GapViolation[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < BANNED_PATTERNS.length; i++) {
    const pattern = BANNED_PATTERNS[i];
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (seen.has(match.index)) continue;

      const sentence = extractSentence(text, match.index);

      if (hasNumericContext(sentence)) continue;

      seen.add(match.index);

      const start = Math.max(0, match.index - 60);
      const end = Math.min(text.length, match.index + match[0].length + 60);
      const context = text.slice(start, end).replace(/\n/g, " ");

      const observedMatch = sentence.match(OBSERVED_PATTERN);
      const expectedMatch = sentence.match(EXPECTED_PATTERN);
      const differenceMatch = sentence.match(DIFFERENCE_PATTERN);
      const driverMatch = sentence.match(DRIVER_PATTERN);

      violations.push({
        phrase: match[0],
        position: match.index,
        context: `...${context}...`,
        sentence,
        requiredStructure: {
          observedValue: observedMatch ? observedMatch[0] : null,
          expectedValue: expectedMatch ? expectedMatch[0] : null,
          difference: differenceMatch ? differenceMatch[0] : null,
          drivers: driverMatch ? driverMatch[0] : null,
        },
      });
    }
  }

  return {
    clean: violations.length === 0,
    violations,
    violationCount: violations.length,
  };
}

export function scanObjectForGapViolations(obj: unknown, path = ""): GapViolation[] {
  const violations: GapViolation[] = [];

  if (typeof obj === "string") {
    const result = scanForGapViolations(obj);
    for (const v of result.violations) {
      violations.push({ ...v, context: `[${path}] ${v.context}` });
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      violations.push(...scanObjectForGapViolations(obj[i], `${path}[${i}]`));
    }
  } else if (obj && typeof obj === "object") {
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith("_")) continue;
      violations.push(...scanObjectForGapViolations(val, path ? `${path}.${key}` : key));
    }
  }

  return violations;
}

export function replaceGapPhrases(text: string): string {
  if (!text || typeof text !== "string") return text;

  let result = text;

  for (const pattern of BANNED_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match, offset) => {
      const sentence = extractSentence(text, offset);
      if (hasNumericContext(sentence)) return match;
      return `[BLOCKED: "${match}" — requires observed value, expected value, numeric difference, and drivers]`;
    });
  }

  return result;
}

export function buildGapGuardPromptBlock(): string {
  return `
═══ NARRATIVE GAP GUARD (MANDATORY) ═══
You MUST NOT use vague gap language without numeric definitions.
The following phrases are BANNED unless accompanied by all four structured variables:
  1. Observed value (current measured metric)
  2. Expected value (target or benchmark)
  3. Difference (numeric delta)
  4. Drivers (specific factors causing the gap)

BANNED PHRASES (will be rejected if used without numeric backing):
${BANNED_GAP_PHRASES.map((p) => `  - "${p}"`).join("\n")}

WRONG: "There is a gap between what the product deserves and what the market is ready to deliver."
RIGHT: "Unaided awareness is 28% vs. the 55% threshold needed for formulary pull-through (27-point gap), driven by limited field force reach in community oncology."

WRONG: "The opportunity gap remains significant."
RIGHT: "Current market share is 12% against an addressable ceiling of 34% (22-point gap), constrained by step therapy requirements in 3 of 5 major PBMs."

Every gap statement must include a number. If you cannot quantify the gap, do not describe it as a gap.
═══ END NARRATIVE GAP GUARD ═══`;
}
