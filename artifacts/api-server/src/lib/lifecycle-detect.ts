import type { DrugStage } from "./drug-lifecycle.js";

interface LifecycleDetection {
  stage: DrugStage;
  rationale: string;
  fdaApprovalDate: string | null;
  searchedName: string;
}

function extractGenericName(drugName: string): string {
  const parenMatch = drugName.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inside = parenMatch[1];
    const firstWord = inside.split(/\s+/)[0].toLowerCase();
    if (firstWord.length > 3 && !["oral", "for", "with", "and", "the"].includes(firstWord)) {
      return firstWord;
    }
  }
  return drugName.split(/[\s(,]+/)[0].toLowerCase();
}

export async function detectLifecycleStageFromFDA(
  drugName: string,
): Promise<LifecycleDetection | null> {
  if (!drugName || drugName.trim().length < 2) return null;

  const searchName = extractGenericName(drugName);
  console.log(`[lifecycle-detect] Searching openFDA for: "${searchName}" (from "${drugName}")`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://api.fda.gov/drug/drugsfda.json?search=openfda.brand_name:"${encodeURIComponent(searchName)}"+openfda.generic_name:"${encodeURIComponent(searchName)}"&limit=5`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CIOS Research Tool cios-research@example.com" },
    });

    if (!resp.ok) {
      if (resp.status === 404) {
        console.log(`[lifecycle-detect] No FDA record for "${searchName}" — classifying as INVESTIGATIONAL`);
        return {
          stage: "INVESTIGATIONAL",
          rationale: `No FDA approval record found for "${searchName}". Classified as investigational.`,
          fdaApprovalDate: null,
          searchedName: searchName,
        };
      }
      console.error(`[lifecycle-detect] openFDA returned ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const results = data.results || [];

    let earliestApproval: Date | null = null;
    let approvalDateStr: string | null = null;

    for (const result of results) {
      const submissions = result.submissions || [];
      for (const sub of submissions) {
        if (sub.submission_type === "ORIG" || sub.submission_type === "SUPPL") {
          const dateStr = sub.submission_status_date;
          if (dateStr && sub.submission_status === "AP") {
            const parsed = parseOpenFDADate(dateStr);
            if (parsed && (!earliestApproval || parsed < earliestApproval)) {
              earliestApproval = parsed;
              approvalDateStr = dateStr;
            }
          }
        }
      }
    }

    if (!earliestApproval) {
      console.log(`[lifecycle-detect] FDA records found but no approval date for "${searchName}" — INVESTIGATIONAL`);
      return {
        stage: "INVESTIGATIONAL",
        rationale: `FDA records exist for "${searchName}" but no original approval date found. Classified as investigational.`,
        fdaApprovalDate: null,
        searchedName: searchName,
      };
    }

    const now = new Date();
    const yearsSinceApproval = (now.getTime() - earliestApproval.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const formattedDate = earliestApproval.toISOString().split("T")[0];

    let stage: DrugStage;
    let rationale: string;

    if (yearsSinceApproval < 3) {
      stage = "RECENTLY_APPROVED";
      rationale = `FDA approval date: ${formattedDate} (${yearsSinceApproval.toFixed(1)} years ago). Recently approved.`;
    } else {
      stage = "ESTABLISHED";
      rationale = `FDA approval date: ${formattedDate} (${yearsSinceApproval.toFixed(1)} years ago). Established product.`;
    }

    console.log(`[lifecycle-detect] "${searchName}" → ${stage} (approved ${formattedDate}, ${yearsSinceApproval.toFixed(1)} years ago)`);

    return {
      stage,
      rationale,
      fdaApprovalDate: formattedDate,
      searchedName: searchName,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error(`[lifecycle-detect] openFDA request timed out for "${searchName}"`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseOpenFDADate(dateStr: string): Date | null {
  if (!dateStr || dateStr.length < 8) return null;
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}
