import { DecisionQuestion } from "./types";
import { classifyQuestion } from "./classifier";

export function parseQuestion(rawInput: string): Partial<DecisionQuestion> {
  const text = rawInput.toLowerCase();

  const questionType = classifyQuestion(text);

  const timeMatch = text.match(/(\d+\s*(months?|years?|weeks?))/);
  const percentMatch = text.match(/(\d+\s*%)/);

  let entities: string[] = [];

  if (text.includes("northeast")) entities.push("Northeast");
  if (text.includes("south")) entities.push("South");
  if (text.includes("midwest")) entities.push("Midwest");
  if (text.includes("west")) entities.push("West");

  if (entities.length === 0 && text.includes("region")) {
    entities = ["geographic regions"];
  }

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

function extractSubject(text: string): string | undefined {
  if (text.includes("arikayce")) return "ARIKAYCE";
  if (text.includes("drug")) return "drug";
  return undefined;
}

function extractOutcome(text: string): string | undefined {
  if (text.includes("adopt") || text.includes("adoption")) return "adoption";
  if (text.includes("approve")) return "approval";
  if (text.includes("restrict")) return "restriction";
  return undefined;
}

function extractComparator(text: string): string | undefined {
  if (text.includes("faster than")) return "faster than";
  if (text.includes("vs") || text.includes("versus")) return "vs";
  return undefined;
}
