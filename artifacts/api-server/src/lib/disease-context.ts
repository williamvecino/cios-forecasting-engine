export async function loadDiseaseContext(_caseId: string): Promise<string> {
  return "";
}

export function buildDiseaseContextBlock(diseaseContext: string): string {
  if (!diseaseContext || !diseaseContext.trim()) return "";
  return `Strategic context for this case: ${diseaseContext.trim()}`;
}
