export function repairAndParseJson(raw: string): any[] {
  let text = raw.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {}

  if (!text.endsWith("]")) {
    const lastComplete = text.lastIndexOf("},");
    const lastObj = text.lastIndexOf("}");
    if (lastObj > lastComplete && lastObj > 0) {
      text = text.slice(0, lastObj + 1) + "]";
    } else if (lastComplete > 0) {
      text = text.slice(0, lastComplete + 1) + "]";
    }
  }

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {}

  text = text.replace(/,\s*([}\]])/g, "$1");

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {}

  const repaired = text.replace(
    /:\s*"((?:[^"\\]|\\.)*)(?=[,}\]\n])/g,
    (match, content) => {
      if (match.endsWith('"')) return match;
      return `: "${content}"`;
    }
  );

  try {
    const parsed = JSON.parse(repaired);
    return Array.isArray(parsed) ? parsed : [];
  } catch {}

  const objects: any[] = [];
  const objRegex = /\{[^{}]*\}/g;
  let m;
  while ((m = objRegex.exec(text)) !== null) {
    try {
      objects.push(JSON.parse(m[0]));
    } catch {
      try {
        const fixed = m[0]
          .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
          .replace(/:\s*'([^']*)'/g, ': "$1"');
        objects.push(JSON.parse(fixed));
      } catch {}
    }
  }

  if (objects.length > 0) return objects;

  return [];
}
