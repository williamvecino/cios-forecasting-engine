import type { QuestionType } from "./types";

const RANKING_PATTERNS = [
  /\bwhich\b.*\b(will|would|could)\b/i,
  /\bwhat\b.*\b(area|region|segment|group|center|market|population)s?\b/i,
  /\bwho\s+will\s+adopt\b/i,
  /\brank\b/i,
  /\bfastest\b/i,
  /\b(adopt|adopt\w*)\s+first\b/i,
  /\blead\s+(in|the)\b/i,
  /\bmost\s+likely\s+to\b/i,
  /\b(adopt|gain|achieve)\b.*\bfaster\b/i,
];

const COMPARATIVE_PATTERNS = [
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /\bfaster\s+than\b/i,
  /\bmore\s+likely\s+than\b/i,
  /\bbetter\s+than\b/i,
  /\bcompared\s+(with|to)\b/i,
];

const THRESHOLD_PATTERNS = [
  /\bexceed\b/i,
  /\breach\b/i,
  /\bat\s+least\b/i,
  /\bmore\s+than\s+\d/i,
  /\d+\s*%/,
];

const TIMING_PATTERNS = [
  /\bwhen\s+will\b/i,
  /\bhow\s+soon\b/i,
  /\bhow\s+long\s+until\b/i,
  /\btime\s+to\b/i,
  /\bwhen\s+do\b/i,
  /\bwhen\s+would\b/i,
];

function matchScore(input: string, patterns: RegExp[]): number {
  return patterns.reduce((score, p) => score + (p.test(input) ? 1 : 0), 0);
}

export function classifyQuestion(rawInput: string): QuestionType {
  const input = rawInput.trim();
  if (!input) return "binary";

  const timingScore = matchScore(input, TIMING_PATTERNS);
  if (timingScore > 0 && /^(when|how\s+(soon|long))\b/i.test(input)) {
    return "timing";
  }

  const comparativeScore = matchScore(input, COMPARATIVE_PATTERNS);
  if (comparativeScore > 0) {
    return "comparative";
  }

  const thresholdScore = matchScore(input, THRESHOLD_PATTERNS);
  const rankingScore = matchScore(input, RANKING_PATTERNS);

  if (thresholdScore > 0 && rankingScore === 0) {
    return "threshold";
  }

  if (rankingScore > 0) {
    return "ranking";
  }

  if (thresholdScore > 0) {
    return "threshold";
  }

  if (timingScore > 0) {
    return "timing";
  }

  return "binary";
}
