import { DecisionQuestion } from "./types";
import { classifyQuestion } from "./classifier";

export function parseQuestion(rawInput: string): Partial<DecisionQuestion> {
  const text = rawInput.toLowerCase();

  const questionType = classifyQuestion(text);

  const timeMatch = text.match(/(\d+\s*(months?|years?|weeks?))/);
  const percentMatch = text.match(/(\d+\s*%)/);

  let entities: string[] = extractEntities(rawInput, questionType);

  return {
    rawInput,
    questionType,
    subject: extractSubject(text),
    outcome: extractOutcome(text),
    populationOrEntities: entities.length ? entities : undefined,
    comparator: extractComparator(text),
    timeHorizon: timeMatch ? timeMatch[0] : undefined,
    successMetric: percentMatch ? percentMatch[0] : undefined,
    createdAt: new Date().toISOString(),
  };
}

function extractEntities(rawInput: string, questionType: string): string[] {
  const text = rawInput.toLowerCase();
  let entities: string[] = [];

  const vsMatch = rawInput.match(/\b(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:\s+(?:differ|in|for|within|over|during|will|achieve|gain)\b|[?.]|$)/i);
  if (vsMatch) {
    const a = vsMatch[1].replace(/^(?:will|do|does|can|how|which)\s+/i, "").trim();
    const b = vsMatch[2].trim();
    if (a && b) {
      return [titleCase(a), titleCase(b)];
    }
  }

  const comparedToMatch = rawInput.match(/\b(.+?)\s+compared\s+to\s+(.+?)(?:\s+(?:in|for|within|over|during|will|achieve|gain)\b)/i);
  if (comparedToMatch) {
    const a = comparedToMatch[1].replace(/^(?:will|do|does|can|how|which)\s+/i, "").trim();
    const b = comparedToMatch[2].trim();
    if (a && b) {
      return [titleCase(a), titleCase(b)];
    }
  }

  const fasterMatch = rawInput.match(/\b(.+?)\s+(?:faster|slower|more|less|better|worse)\s+than\s+(.+?)(?:\s+(?:in|for|within|over|during|will|achieve|gain)\b|\?|$)/i);
  if (fasterMatch) {
    const a = fasterMatch[1].replace(/^(?:will|do|does|can|how|which)\s+/i, "").trim();
    const b = fasterMatch[2].replace(/\?$/, "").trim();
    if (a && b) {
      return [titleCase(a), titleCase(b)];
    }
  }

  if (text.includes("northeast")) entities.push("Northeast");
  if (text.includes("south")) entities.push("South");
  if (text.includes("midwest")) entities.push("Midwest");
  if (text.includes("west") && !text.includes("midwest")) entities.push("West");
  if (text.includes("east") && !text.includes("northeast")) entities.push("East");

  if (entities.length === 0 && text.includes("region")) {
    entities = ["geographic regions"];
  }

  const inMatch = rawInput.match(/\bin\s+([A-Z][a-z]+(?:\s+[a-z]+)*)/);
  if (entities.length === 0 && inMatch) {
    const candidate = inMatch[1].trim();
    if (!["the", "a", "an"].includes(candidate.toLowerCase()) && candidate.length > 2) {
      entities.push(candidate);
    }
  }

  return entities;
}

function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractSubject(text: string): string | undefined {
  const brandMatch = text.match(/(?:for|of)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (text.includes("arikayce")) return "ARIKAYCE";
  if (text.includes("mallia")) return "Mallia";
  if (brandMatch) {
    const candidate = brandMatch[1].trim();
    const skipWords = ["the", "a", "an", "adoption", "market", "share", "first", "access", "approval"];
    if (!skipWords.includes(candidate.toLowerCase()) && candidate.length > 2) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }
  if (text.includes("drug")) return "drug";
  return undefined;
}

function extractOutcome(text: string): string | undefined {
  if (text.includes("adopt") || text.includes("adoption")) return "adoption";
  if (text.includes("approve") || text.includes("approval")) return "approval";
  if (text.includes("restrict") || text.includes("restriction")) return "restriction";
  if (text.includes("market share") || text.includes("share")) return "market share";
  if (text.includes("prescri")) return "prescribing";
  return undefined;
}

function extractComparator(text: string): string | undefined {
  if (text.includes("faster than")) return "faster than";
  if (text.includes("vs") || text.includes("versus")) return "vs";
  if (text.includes("compared to")) return "compared to";
  return undefined;
}
