import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

interface SourceInfo {
  trialName?: string;
  journal?: string;
  year?: string | number;
  pmid?: string;
  nct?: string;
  cmsUrl?: string;
  payerSourceType?: string;
  policyName?: string;
  sourceUrl?: string;
}

function buildUrl(source: SourceInfo): string | null {
  if (source.sourceUrl && source.sourceUrl.startsWith("http")) return source.sourceUrl;
  if (source.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${source.pmid.replace(/\D/g, "")}/`;
  if (source.nct) return `https://clinicaltrials.gov/study/${source.nct}`;
  if (source.cmsUrl && source.cmsUrl.startsWith("http")) return source.cmsUrl;
  return null;
}

function formatSource(source: SourceInfo): string {
  const parts: string[] = [];
  if (source.policyName) parts.push(source.policyName);
  if (source.trialName && !source.policyName) parts.push(source.trialName);
  if (source.journal) parts.push(source.journal);
  if (source.payerSourceType && !source.journal) parts.push(source.payerSourceType);
  if (source.year) parts.push(String(source.year));
  const id = source.pmid ? `PMID ${source.pmid.replace(/\D/g, "")}`
    : source.nct ? source.nct
    : source.cmsUrl ? "CMS.gov"
    : null;
  const base = parts.join(", ");
  return id ? `${base} — ${id}` : base;
}

export default function SourceLine({ source, accentColor = "slate" }: { source?: SourceInfo | string; accentColor?: string }) {
  const [open, setOpen] = useState(false);

  if (!source) return null;

  const parsed: SourceInfo = typeof source === "string"
    ? { trialName: source }
    : source;

  const text = formatSource(parsed);
  if (!text) return null;

  const url = typeof source === "object" ? buildUrl(parsed) : null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 text-[10px] text-${accentColor}-400/60 hover:text-${accentColor}-400/90 transition cursor-pointer`}
      >
        {open ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        Source
      </button>
      {open && (
        <div className="mt-0.5 pl-3.5 flex items-start gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground/70 leading-relaxed">{text}</span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-blue-400/70 hover:text-blue-400 transition shrink-0"
            >
              View source <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
