export const INDICATION_SOCIETY_MAP: Record<string, string[]> = {
  "mac": ["ats.org", "idsa.org"],
  "ntm": ["ats.org", "idsa.org"],
  "mycobacterium": ["ats.org", "idsa.org"],
  "pulmonary": ["ats.org"],
  "lung": ["ats.org"],
  "cystic fibrosis": ["cff.org", "ats.org"],
  "cf": ["cff.org"],
  "parkinson": ["movementdisorders.org", "aan.org"],
  "alzheimer": ["alz.org", "aan.org"],
  "multiple sclerosis": ["aan.org"],
  "epilepsy": ["aan.org"],
  "neurology": ["aan.org"],
  "breast cancer": ["nccn.org", "asco.org"],
  "nsclc": ["nccn.org", "asco.org"],
  "lung cancer": ["nccn.org", "asco.org"],
  "lymphoma": ["nccn.org", "hematology.org"],
  "leukemia": ["nccn.org", "hematology.org"],
  "melanoma": ["nccn.org", "asco.org"],
  "oncology": ["nccn.org", "asco.org"],
  "cancer": ["nccn.org", "asco.org"],
  "atopic dermatitis": ["aad.org"],
  "psoriasis": ["aad.org"],
  "dermatitis": ["aad.org"],
  "dermatology": ["aad.org"],
  "rheumatoid arthritis": ["rheumatology.org"],
  "lupus": ["rheumatology.org"],
  "rheumatology": ["rheumatology.org"],
  "hemophilia": ["hematology.org"],
  "hematology": ["hematology.org"],
  "oud": ["asam.org"],
  "opioid": ["asam.org"],
  "addiction": ["asam.org"],
  "schizophrenia": ["psychiatry.org"],
  "bipolar": ["psychiatry.org"],
  "depression": ["psychiatry.org"],
  "psychiatry": ["psychiatry.org"],
  "diabetes": ["diabetes.org"],
  "cardiovascular": ["acc.org", "heart.org"],
  "heart failure": ["acc.org", "heart.org"],
  "hypertension": ["acc.org", "heart.org"],
  "cardiology": ["acc.org"],
  "infectious disease": ["idsa.org"],
  "hiv": ["idsa.org"],
  "hepatitis": ["idsa.org", "aasld.org"],
  "liver": ["aasld.org"],
  "kidney": ["kidney.org"],
  "renal": ["kidney.org"],
  "pku": ["acmg.net", "simd.org"],
  "phenylketonuria": ["acmg.net", "simd.org"],
  "metabolic": ["acmg.net"],
  "gastroenterology": ["gastro.org"],
  "ibd": ["gastro.org"],
  "crohn": ["gastro.org"],
  "ophthalmology": ["aao.org"],
  "macular": ["aao.org"],
  "retinal": ["aao.org"],
  "thyroid eye disease": ["aao.org", "thyroid.org"],
  "ted": ["aao.org", "thyroid.org"],
  "graves": ["thyroid.org"],
};

export const SPONSOR_LOOKUP: Record<string, { company: string; irUrl: string; ticker: string }> = {
  "arikayce": { company: "Insmed", irUrl: "ir.insmed.com", ticker: "INSM" },
  "amikacin liposome": { company: "Insmed", irUrl: "ir.insmed.com", ticker: "INSM" },
  "trikafta": { company: "Vertex Pharmaceuticals", irUrl: "ir.vrtx.com", ticker: "VRTX" },
  "elexacaftor": { company: "Vertex Pharmaceuticals", irUrl: "ir.vrtx.com", ticker: "VRTX" },
  "veligrotug": { company: "Viridian Therapeutics", irUrl: "ir.viridiantx.com", ticker: "VRDN" },
  "vrdn-001": { company: "Viridian Therapeutics", irUrl: "ir.viridiantx.com", ticker: "VRDN" },
  "leqembi": { company: "Eisai", irUrl: "ir.eisai.com", ticker: "ESALY" },
  "lecanemab": { company: "Eisai", irUrl: "ir.eisai.com", ticker: "ESALY" },
  "sublocade": { company: "Indivior", irUrl: "ir.indivior.com", ticker: "INDV" },
  "beovu": { company: "Novartis", irUrl: "ir.novartis.com", ticker: "NVS" },
  "brolucizumab": { company: "Novartis", irUrl: "ir.novartis.com", ticker: "NVS" },
  "humira": { company: "AbbVie", irUrl: "ir.abbvie.com", ticker: "ABBV" },
  "adalimumab": { company: "AbbVie", irUrl: "ir.abbvie.com", ticker: "ABBV" },
  "kisqali": { company: "Novartis", irUrl: "ir.novartis.com", ticker: "NVS" },
  "ribociclib": { company: "Novartis", irUrl: "ir.novartis.com", ticker: "NVS" },
  "xarelto": { company: "Janssen/Bayer", irUrl: "ir.bayer.com", ticker: "BAYRY" },
  "rivaroxaban": { company: "Janssen/Bayer", irUrl: "ir.bayer.com", ticker: "BAYRY" },
  "palynziq": { company: "BioMarin", irUrl: "ir.biomarin.com", ticker: "BMRN" },
  "pegvaliase": { company: "BioMarin", irUrl: "ir.biomarin.com", ticker: "BMRN" },
};

export interface SponsorProfile {
  company: string;
  irUrl: string;
  ticker: string;
}

export function lookupSponsor(drugName: string): SponsorProfile | null {
  const lower = drugName.toLowerCase();
  for (const [key, profile] of Object.entries(SPONSOR_LOOKUP)) {
    if (lower.includes(key)) return profile;
  }
  return null;
}

export const TIER0_DOMAINS = new Set([
  "clinicaltrials.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "fda.gov",
  "accessdata.fda.gov",
  "cms.gov",
  "medicaid.gov",
  "ema.europa.eu",
  "nejm.org",
  "thelancet.com",
  "nature.com",
  "bmj.com",
  "jamanetwork.com",
  "cochranelibrary.com",
  "ats.org",
  "atsjournals.org",
  "idsa.org",
  "nccn.org",
  "asco.org",
  "aan.org",
  "aad.org",
  "rheumatology.org",
  "hematology.org",
  "cff.org",
  "asam.org",
  "psychiatry.org",
  "diabetes.org",
  "acc.org",
  "heart.org",
  "aasld.org",
  "kidney.org",
  "acmg.net",
  "simd.org",
  "gastro.org",
  "aao.org",
  "movementdisorders.org",
  "alz.org",
  "sec.gov",
]);

export const TIER2_CORPORATE_DOMAINS = new Set([
  "prnewswire.com",
  "businesswire.com",
  "globenewswire.com",
  "reuters.com",
  "bloomberg.com",
  "fiercepharma.com",
  "biopharmadive.com",
  "statnews.com",
  "endpoints.news",
]);

export function classifyUrlTier(
  url: string | null | undefined,
  sponsorProfile?: SponsorProfile | null,
): 0 | "1S" | 2 | 3 {
  if (!url || typeof url !== "string") return 3;
  const lower = url.toLowerCase();

  if (lower.includes("sec.gov")) return 0;

  for (const domain of TIER0_DOMAINS) {
    if (lower.includes(domain)) return 0;
  }
  if (lower.includes(".gov") || lower.includes(".edu")) return 0;

  if (sponsorProfile) {
    const irDomain = sponsorProfile.irUrl.toLowerCase();
    const companySlug = sponsorProfile.company.toLowerCase().replace(/\s+/g, "");
    if (lower.includes(irDomain)) return "1S";
    if (lower.includes(companySlug + ".com")) return "1S";
    const irRoot = irDomain.replace(/^ir\./, "");
    if (lower.includes(irRoot)) return "1S";
  }

  for (const domain of TIER2_CORPORATE_DOMAINS) {
    if (lower.includes(domain)) return 2;
  }
  if (lower.includes("news.google.com")) return 2;
  return 2;
}

export function lookupSocietyDomains(indication: string): string[] {
  const lower = indication.toLowerCase();
  const matched = new Set<string>();
  for (const [key, domains] of Object.entries(INDICATION_SOCIETY_MAP)) {
    if (lower.includes(key)) {
      for (const d of domains) matched.add(d);
    }
  }
  return [...matched];
}

export function getTimeFilterDate(monthsBack: number = 12): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

export const SPONSOR_CATEGORY_KEYWORDS: Record<string, string> = {
  "clinical_auth": "trial results phase FDA",
  "regulatory_auth": "FDA approval label REMS",
  "payer_auth": "coverage reimbursement access formulary",
  "safety_auth": "safety adverse events pharmacovigilance",
  "guidelines_auth": "guideline recommendation society",
  "competitive_auth": "market launch adoption sales",
};

export interface AuthoritativeCategory {
  id: string;
  label: string;
  authoritativeQueries: string[];
  generalQueries: string[];
  sponsorQueries: string[];
}

export function buildAuthoritativeQueries(
  drugName: string,
  indication: string,
  sponsor?: SponsorProfile | null,
  timeFilterMonths: number = 12,
): AuthoritativeCategory[] {
  const societyDomains = lookupSocietyDomains(indication);
  const year = new Date().getFullYear().toString();
  const afterDate = getTimeFilterDate(timeFilterMonths);

  const guidelineSiteQueries = societyDomains.map(
    (d) => `site:${d} ${drugName} ${indication}`,
  );

  function buildSponsorQueries(categoryId: string): string[] {
    if (!sponsor) return [];
    const keywords = SPONSOR_CATEGORY_KEYWORDS[categoryId] || "";
    return [
      `${drugName} ${keywords} site:${sponsor.irUrl}`,
      `"${drugName}" ${keywords} "${sponsor.company}" after:${afterDate}`,
    ];
  }

  function buildSecEdgarQueries(): string[] {
    if (!sponsor || !sponsor.ticker) return [];
    return [
      `site:sec.gov ${sponsor.company} 8-K "${drugName}"`,
      `site:sec.gov/cgi-bin/browse-edgar ${sponsor.company} 8-K ${drugName}`,
    ];
  }

  return [
    {
      id: "clinical_auth",
      label: "Clinical Evidence",
      authoritativeQueries: [
        `site:clinicaltrials.gov "${drugName}" "${indication}"`,
        `site:pubmed.ncbi.nlm.nih.gov ${drugName} ${indication}`,
        `${drugName} ${indication} phase 3 results pubmed after:${afterDate}`,
      ],
      generalQueries: [
        `${drugName} phase 3 trial ${indication} after:${afterDate}`,
        `${drugName} pivotal trial results ${indication}`,
        `${drugName} first line ${indication} phase 3`,
      ],
      sponsorQueries: buildSponsorQueries("clinical_auth"),
    },
    {
      id: "regulatory_auth",
      label: "Regulatory / Label",
      authoritativeQueries: [
        `site:fda.gov ${drugName} approval ${indication}`,
        `site:accessdata.fda.gov ${drugName} label`,
        `site:fda.gov ${drugName} REMS ${indication}`,
        `${drugName} FDA approval letter ${indication} after:${afterDate}`,
      ],
      generalQueries: [
        `${drugName} prescribing information label`,
      ],
      sponsorQueries: buildSponsorQueries("regulatory_auth"),
    },
    {
      id: "payer_auth",
      label: "Payer / Access",
      authoritativeQueries: [
        `site:cms.gov ${drugName} coverage ${indication}`,
        `site:cms.gov/medicare-coverage-database ${drugName}`,
        `${drugName} Medicare coverage decision NCD LCD after:${afterDate}`,
        `${drugName} prior authorization Medicaid ${indication}`,
      ],
      generalQueries: [
        `${drugName} formulary coverage ${indication} after:${afterDate}`,
        `${drugName} prior authorization commercial`,
      ],
      sponsorQueries: buildSponsorQueries("payer_auth"),
    },
    {
      id: "safety_auth",
      label: "Safety",
      authoritativeQueries: [
        `site:fda.gov/safety ${drugName}`,
        `site:fda.gov ${drugName} black box warning`,
        `site:fda.gov ${drugName} REMS ${indication}`,
        `${drugName} FDA safety communication ${year}`,
        `${drugName} FAERS adverse events ${indication}`,
      ],
      generalQueries: [
        `${drugName} post-marketing safety after:${afterDate}`,
      ],
      sponsorQueries: buildSponsorQueries("safety_auth"),
    },
    {
      id: "guidelines_auth",
      label: "Guidelines",
      authoritativeQueries: [
        ...guidelineSiteQueries,
        `${indication} treatment guidelines ${year} ${drugName}`,
      ],
      generalQueries: [
        `${drugName} guideline recommendation ${indication} after:${afterDate}`,
        `${indication} society recommendations`,
      ],
      sponsorQueries: buildSponsorQueries("guidelines_auth"),
    },
    {
      id: "competitive_auth",
      label: "Competitive / Market",
      authoritativeQueries: [
        `site:fda.gov ${indication} approved drugs`,
        `site:sec.gov ${drugName} sales ${year}`,
        ...buildSecEdgarQueries(),
      ],
      generalQueries: [
        `${drugName} competitors ${indication} after:${afterDate}`,
        `${indication} competing treatments`,
      ],
      sponsorQueries: buildSponsorQueries("competitive_auth"),
    },
  ];
}
