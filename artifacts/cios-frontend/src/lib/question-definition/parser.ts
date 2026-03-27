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
    subject: extractSubject(rawInput),
    outcome: extractOutcome(text),
    populationOrEntities: entities.length ? entities : undefined,
    comparator: extractComparator(text),
    timeHorizon: timeMatch ? timeMatch[0] : inferTimeHorizon(text),
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

  const colonListMatch = rawInput.match(/(?:first|adopt|compare|between)[:\s]+(.+?)(?:\?|$)/i);
  if (colonListMatch) {
    const listPart = colonListMatch[1];
    const items = listPart.split(/,\s*(?:or\s+)?|\s+or\s+/).map((s) => s.trim()).filter(Boolean);
    if (items.length >= 2) {
      return items.map((s) => titleCase(s.replace(/\?$/, "")));
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

  const amongMatch = rawInput.match(/\bamong\s+([A-Za-z][a-z]+(?:\s+[a-z]+)*)/i);
  if (entities.length === 0 && amongMatch) {
    const candidate = amongMatch[1].trim();
    if (candidate.length > 2) {
      entities.push(titleCase(candidate));
    }
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

function extractSubject(rawInput: string): string | undefined {
  const text = rawInput.toLowerCase();

  if (text.includes("arikayce")) return "ARIKAYCE";
  if (text.includes("mallia")) return "Mallia";

  const brandMatch = text.match(/(?:for|of)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (brandMatch) {
    const candidate = brandMatch[1].trim();
    const skipWords = ["the", "a", "an", "adoption", "market", "share", "first", "access", "approval", "launch"];
    if (!skipWords.includes(candidate.toLowerCase()) && candidate.length > 2) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  const contextualSubjects: [RegExp, string][] = [
    [/\b(phase\s*(?:1|2|3|i+|iii?|iv)\s+\w+\s+data)\b/i, ""],
    [/\b(competing\s+therap\w*)\b/i, ""],
    [/\b(prior\s+auth\w*\s+requirement\w*)\b/i, ""],
    [/\b(monitoring\s+requirement\w*)\b/i, ""],
    [/\b(safety\s+data)\b/i, ""],
    [/\b(payer\s+\w+\s+auth\w*)\b/i, ""],
    [/\b(commercial\s+payer\w*)\b/i, ""],
    [/\b(first[- ]line\s+adoption)\b/i, ""],
    [/\b(market\s+access)\b/i, ""],
  ];

  for (const [pattern] of contextualSubjects) {
    const m = rawInput.match(pattern);
    if (m) {
      return titleCase(m[1]);
    }
  }

  const willSubjectMatch = rawInput.match(/^will\s+(.+?)\s+(?:adopt|reduce|increase|delay|limit|exceed|restrict|gain|achieve|improve|impact|affect|change|shift|grow|approve|launch|enter|dominate|capture|lose|displace|outperform|erode|block|prevent|enable|accelerate|slow|halt|trigger|cause|face|experience|require|need|demand|receive|obtain|get|maintain|sustain|demonstrate|show|meet|reach|hit|surpass|fail|succeed|compete|emerge|expand|contract|decline|rise|fall|lead|drive|support|undermine|threaten|benefit|suffer|generate|produce|create|develop|introduce|initiate|begin|start|continue|remain|stay|become|offer|provide|deliver|establish|secure|attract|retain|convert|switch|transition|prescribe|recommend|endorse|cover|reimburse|pay|fund|finance|authorize|deny|reject|withdraw|recall|suspend|discontinue|modify|update|revise|amend)\b/i);
  if (willSubjectMatch) {
    let candidate = willSubjectMatch[1].trim();
    candidate = candidate.replace(/^(a|an|the)\s+/i, "").trim();
    if (candidate.length > 2 && candidate.split(/\s+/).length <= 5) {
      return titleCase(candidate);
    }
  }

  const whenSubjectMatch = rawInput.match(/^when\s+will\s+(.+?)\s+(?:begin|start|achieve|reach|adopt|restrict|approve|launch|enter|gain|exceed|decline|emerge|expand)\b/i);
  if (whenSubjectMatch) {
    let candidate = whenSubjectMatch[1].trim();
    candidate = candidate.replace(/^(a|an|the)\s+/i, "").trim();
    if (candidate.length > 2 && candidate.split(/\s+/).length <= 5) {
      return titleCase(candidate);
    }
  }

  const whichSubjectMatch = rawInput.match(/^which\s+(\w+(?:\s+\w+)?)\s+will/i);
  if (whichSubjectMatch) {
    return titleCase(whichSubjectMatch[1]);
  }

  const howSubjectMatch = rawInput.match(/^how\s+(?:will|quickly\s+will|fast\s+will|likely\s+will|much\s+will)\s+(.+?)\s+(?:adopt|grow|change|shift|decline|improve|increase|reduce|expand|emerge|gain|lose|affect|impact)\b/i);
  if (howSubjectMatch) {
    let candidate = howSubjectMatch[1].trim();
    candidate = candidate.replace(/^(a|an|the)\s+/i, "").trim();
    if (candidate.length > 2 && candidate.split(/\s+/).length <= 5) {
      return titleCase(candidate);
    }
  }

  const doSubjectMatch = rawInput.match(/^(?:do|does|can|could|should|would)\s+(.+?)\s+(?:need|have|require|face|show|demonstrate|offer|provide|expect|anticipate|risk)\b/i);
  if (doSubjectMatch) {
    let candidate = doSubjectMatch[1].trim();
    candidate = candidate.replace(/^(a|an|the)\s+/i, "").trim();
    if (candidate.length > 2 && candidate.split(/\s+/).length <= 5) {
      return titleCase(candidate);
    }
  }

  const fallbackMatch = rawInput.match(/^(?:will|when|how|can|could|should|would|do|does)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\s+(?:within|in|over|during|by|before|after|from)\s+\d|\?|$)/i);
  if (fallbackMatch) {
    let candidate = fallbackMatch[1].trim().replace(/\?$/, "");
    const words = candidate.split(/\s+/);
    if (words.length <= 3 && words.length >= 1) {
      return titleCase(candidate);
    }
    if (words.length > 3) {
      return titleCase(words.slice(0, 3).join(" "));
    }
  }

  if (text.includes("drug")) return "drug";

  return undefined;
}

function extractOutcome(text: string): string | undefined {
  if (text.includes("adopt") || text.includes("adoption")) return "adoption";
  if (text.includes("approve") || text.includes("approval")) return "approval";
  if (text.includes("restrict") || text.includes("restriction")) return "restriction";
  if (text.includes("coverage")) return "coverage";
  if (text.includes("prescri")) return "prescribing";
  if (text.includes("market share") || text.includes("share")) return "market share";
  if (text.includes("delay")) return "adoption delay";
  if (text.includes("reduce") || text.includes("reduction")) return "reduction";
  if (text.includes("limit")) return "limitation";
  if (text.includes("increase") || text.includes("increas")) return "increase";
  if (text.includes("exceed")) return "threshold exceedance";
  if (text.includes("launch")) return "launch";
  if (text.includes("switch")) return "switching";
  if (text.includes("reimburse") || text.includes("reimbursement")) return "reimbursement";
  if (text.includes("displace") || text.includes("displacement")) return "displacement";
  if (text.includes("compet")) return "competitive impact";
  if (text.includes("erode") || text.includes("erosion")) return "erosion";
  if (text.includes("penetrat")) return "market penetration";
  if (text.includes("uptake")) return "uptake";
  if (text.includes("decline")) return "decline";
  if (text.includes("grow") || text.includes("growth")) return "growth";
  if (text.includes("entry") || text.includes("enter")) return "market entry";
  if (text.includes("convert") || text.includes("conversion")) return "conversion";
  if (text.includes("retain") || text.includes("retention")) return "retention";
  if (text.includes("formulary")) return "formulary access";
  if (text.includes("safety")) return "safety profile";
  if (text.includes("efficacy")) return "efficacy";
  if (text.includes("compliance") || text.includes("adherence")) return "compliance";
  if (text.includes("awareness")) return "awareness";
  if (text.includes("access")) return "access";
  if (text.includes("demand")) return "demand";
  if (text.includes("revenue")) return "revenue";
  if (text.includes("profit")) return "profitability";
  return undefined;
}

function extractComparator(text: string): string | undefined {
  if (text.includes("faster than")) return "faster than";
  if (text.includes("vs") || text.includes("versus")) return "vs";
  if (text.includes("compared to")) return "compared to";
  return undefined;
}

function inferTimeHorizon(text: string): string | undefined {
  if (text.includes("launch")) return "12 months";
  if (text.includes("phase 3") || text.includes("phase iii")) return "12 months";
  if (text.includes("begin") || text.includes("start")) return "12 months";

  const hasAdoptionContext =
    text.includes("adopt") || text.includes("prescri") ||
    text.includes("restrict") || text.includes("coverage") ||
    text.includes("delay") || text.includes("reduce") ||
    text.includes("limit") || text.includes("increase") ||
    text.includes("exceed");
  if (hasAdoptionContext) return "12 months";

  return undefined;
}
