import { useState, useEffect } from "react";
import { useListCases, useCreateCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, Input, Select, Label } from "@/components/ui-components";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useSearch } from "wouter";
import { Plus, FlaskConical, ArrowRight, ChevronRight, Layers } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const THERAPEUTIC_AREAS = [
  "Oncology", "Cardiology", "Neurology", "Immunology / Rheumatology",
  "Rare disease / Orphan", "Respiratory / Pulmonology", "Infectious Disease",
  "Dermatology", "Endocrinology / Metabolic", "Ophthalmology",
  "Psychiatry / CNS", "Gastroenterology", "Nephrology / Urology",
  "Hematology", "Musculoskeletal", "Pain", "Women's Health", "Other",
];

const GEOGRAPHIES = [
  "US", "US + EU5", "EU5", "EU", "Global", "Japan", "APAC", "Other",
];

const caseSchema = z.object({
  assetName: z.string().min(1, "Asset name is required"),
  assetType: z.string(),
  therapeuticArea: z.string().min(1, "Therapeutic area is required"),
  diseaseState: z.string().optional(),
  specialty: z.string().optional(),
  geography: z.string(),
  strategicQuestion: z.string().min(5, "Strategic question must be descriptive"),
  outcomeDefinition: z.string().optional(),
  priorProbability: z.coerce.number().min(0.01).max(0.99),
  timeHorizon: z.string(),
  primarySpecialtyProfile: z.string(),
  payerEnvironment: z.string(),
  guidelineLeverage: z.string(),
  competitorProfile: z.string(),
});

type CaseFormValues = z.infer<typeof caseSchema>;

const CONFIDENCE_COLOR: Record<string, string> = {
  High: "success",
  Moderate: "warning",
  Developing: "default",
  Low: "default",
};

export default function CasesList() {
  const searchString = useSearch();
  const [isCreating, setIsCreating] = useState(false);
  const { data: cases, isLoading } = useListCases();
  const { mutate: createCase, isPending } = useCreateCase();
  const queryClient = useQueryClient();

  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      assetType: "Medication",
      therapeuticArea: "",
      geography: "US",
      priorProbability: 0.45,
      timeHorizon: "12 months",
      primarySpecialtyProfile: "General",
      payerEnvironment: "Balanced",
      guidelineLeverage: "Medium",
      competitorProfile: "Entrenched standard of care",
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const q = params.get("q");
    if (q) {
      form.setValue("strategicQuestion", q);
      setIsCreating(true);
    }
  }, []);

  const priorVal = form.watch("priorProbability");

  const onSubmit = (data: CaseFormValues) => {
    createCase(
      {
        data: {
          strategicQuestion: data.strategicQuestion,
          primaryBrand: data.assetName,
          priorProbability: data.priorProbability,
          // Extra fields passed through — backend accepts them
          ...data,
        } as Parameters<typeof createCase>[0]["data"],
      },
      {
        onSuccess: () => {
          setIsCreating(false);
          queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
          form.reset();
        },
      }
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Forecast Workspace</span>
            </div>
            <h1 className="text-3xl font-bold">Forecast Cases</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Each case defines a strategic question and context for the CIOS engine. Works for any asset, specialty, or geography.
            </p>
          </div>
          <Button onClick={() => setIsCreating(!isCreating)} className="gap-2">
            <Plus className="w-4 h-4" /> New Case
          </Button>
        </div>

        {/* Creation Form */}
        {isCreating && (
          <Card className="animate-in slide-in-from-top-4 fade-in duration-300 border-primary/40">
            <div className="flex items-center gap-2 mb-6">
              <FlaskConical className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">New Forecast Case</h3>
              <span className="text-xs text-muted-foreground ml-2">— works for any asset, therapy area, and specialty</span>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Section: Asset Identity */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border/50">
                  Asset Identity
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <Label>Asset / Brand Name</Label>
                    <Input
                      {...form.register("assetName")}
                      placeholder="e.g. Product A, any asset name"
                    />
                    {form.formState.errors.assetName && (
                      <p className="text-xs text-destructive mt-1">{form.formState.errors.assetName.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Asset Type</Label>
                    <Select {...form.register("assetType")}>
                      <option value="Medication">Medication (small molecule)</option>
                      <option value="Biologic / Large molecule">Biologic / Large molecule</option>
                      <option value="Device">Device / Hardware</option>
                      <option value="Diagnostic">Diagnostic / Companion diagnostic</option>
                      <option value="Digital therapeutic">Digital therapeutic / SaMD</option>
                      <option value="Combination product">Combination product</option>
                      <option value="Other">Other</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Geography</Label>
                    <Select {...form.register("geography")}>
                      {GEOGRAPHIES.map(g => <option key={g} value={g}>{g}</option>)}
                    </Select>
                  </div>
                </div>
              </div>

              {/* Section: Clinical Context */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border/50">
                  Clinical Context
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Therapeutic Area</Label>
                    <Select {...form.register("therapeuticArea")}>
                      <option value="">Select…</option>
                      {THERAPEUTIC_AREAS.map(ta => <option key={ta} value={ta}>{ta}</option>)}
                    </Select>
                    {form.formState.errors.therapeuticArea && (
                      <p className="text-xs text-destructive mt-1">{form.formState.errors.therapeuticArea.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Disease State / Indication</Label>
                    <Input
                      {...form.register("diseaseState")}
                      placeholder="e.g. NSCLC, RA, HFrEF, T2DM"
                    />
                  </div>
                  <div>
                    <Label>Primary Specialty</Label>
                    <Input
                      {...form.register("specialty")}
                      placeholder="e.g. Oncology, Cardiology"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Strategic Question */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border/50">
                  Strategic Question &amp; Forecast Parameters
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label>Strategic Question</Label>
                    <Input
                      {...form.register("strategicQuestion")}
                      placeholder="e.g. Will [asset] achieve target HCP adoption within [timeframe] given current signals?"
                    />
                    {form.formState.errors.strategicQuestion && (
                      <p className="text-xs text-destructive mt-1">{form.formState.errors.strategicQuestion.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Outcome Definition <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                      {...form.register("outcomeDefinition")}
                      placeholder="e.g. Target prescriber reaches ≥2 Rx/month within 12 months"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Bayesian Prior */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border/50">
                  Bayesian Prior &amp; Forecast Horizon
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>
                      Prior Probability —{" "}
                      <span className="text-primary font-bold">{(Number(priorVal) * 100).toFixed(0)}%</span>
                      <span className="text-muted-foreground font-normal ml-2 text-xs">
                        (your baseline belief before signals)
                      </span>
                    </Label>
                    <input
                      type="range"
                      min="0.01"
                      max="0.99"
                      step="0.01"
                      className="w-full mt-3 accent-primary"
                      {...form.register("priorProbability")}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>1% (Very unlikely)</span>
                      <span>50% (Uncertain)</span>
                      <span>99% (Near certain)</span>
                    </div>
                  </div>
                  <div>
                    <Label>Forecast Horizon</Label>
                    <Select {...form.register("timeHorizon")}>
                      <option value="3 months">3 months</option>
                      <option value="6 months">6 months</option>
                      <option value="12 months">12 months</option>
                      <option value="18 months">18 months</option>
                      <option value="24 months">24 months</option>
                      <option value="36 months">36 months</option>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Section: Actor Environment */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border/50">
                  Actor Environment
                  <span className="normal-case font-normal ml-2 text-muted-foreground">— configures the behavioral weighting model</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Specialty Actor Profile</Label>
                    <Select {...form.register("primarySpecialtyProfile")}>
                      <option value="General">General (default)</option>
                      <option value="Oncology / academic-led">Oncology / academic-led</option>
                      <option value="Cardiology / mixed specialist">Cardiology / mixed specialist</option>
                      <option value="Pulmonology / rare disease">Pulmonology / rare disease</option>
                      <option value="Dermatology / community-led">Dermatology / community-led</option>
                      <option value="Psychiatry / access-sensitive">Psychiatry / access-sensitive</option>
                      <option value="Infectious disease / guideline-led">Infectious disease / guideline-led</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Payer Environment</Label>
                    <Select {...form.register("payerEnvironment")}>
                      <option value="Balanced">Balanced</option>
                      <option value="Commercial-heavy">Commercial-heavy</option>
                      <option value="Medicare-heavy">Medicare-heavy</option>
                      <option value="Medicaid-heavy">Medicaid-heavy</option>
                      <option value="Integrated delivery / IDN">Integrated delivery / IDN</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Guideline Leverage</Label>
                    <Select {...form.register("guidelineLeverage")}>
                      <option value="Low">Low — guidelines not established or not followed</option>
                      <option value="Medium">Medium — guidelines exist, moderate adherence</option>
                      <option value="High">High — guideline-driven prescribing</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Competitive Landscape</Label>
                    <Select {...form.register("competitorProfile")}>
                      <option value="Whitespace / limited direct competition">Whitespace — no significant competition</option>
                      <option value="Entrenched standard of care">Entrenched standard of care</option>
                      <option value="Aggressive branded competitor">Aggressive branded competitor</option>
                      <option value="Generic erosion risk">Generic / biosimilar pressure</option>
                      <option value="Crowded class / multiple competitors">Crowded class — multiple competitors</option>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-2">
                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Initializing…" : "Initialize Forecast Case"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Case List */}
        <div className="grid grid-cols-1 gap-4">
          {isLoading ? (
            <div className="text-center p-12 text-muted-foreground animate-pulse">Loading cases…</div>
          ) : cases?.length === 0 ? (
            <Card className="text-center py-16">
              <FlaskConical className="w-10 h-10 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">No forecast cases yet. Create the first one above.</p>
            </Card>
          ) : cases?.map(c => (
            <Card key={c.id} className="group hover:border-primary/30 transition-all">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Top row: IDs and badges */}
                  <div className="flex items-center flex-wrap gap-2 mb-2">
                    <span className="font-mono text-xs text-muted-foreground">{c.caseId}</span>
                    {(c as any).isDemo === "true" && (
                      <Badge variant="default">Demo</Badge>
                    )}
                    <Badge variant="primary">{(c as any).assetName || c.primaryBrand}</Badge>
                    {(c as any).assetType && (
                      <Badge variant="default">{(c as any).assetType}</Badge>
                    )}
                    {(c as any).therapeuticArea && (
                      <Badge variant="default">{(c as any).therapeuticArea}</Badge>
                    )}
                    {(c as any).geography && (
                      <span className="text-xs text-muted-foreground">· {(c as any).geography}</span>
                    )}
                  </div>

                  {/* Disease state + specialty */}
                  {((c as any).diseaseState || (c as any).specialty) && (
                    <div className="text-xs text-muted-foreground mb-2">
                      {[(c as any).diseaseState, (c as any).specialty].filter(Boolean).join(" · ")}
                    </div>
                  )}

                  {/* Strategic question */}
                  <Link href={`/cases/${c.caseId}`}>
                    <h3 className="text-base font-semibold text-foreground leading-snug hover:text-primary transition-colors cursor-pointer">{c.strategicQuestion}</h3>
                  </Link>

                  {/* Probability row */}
                  <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
                    <div>Prior: <span className="text-foreground font-medium">{(c.priorProbability * 100).toFixed(0)}%</span></div>
                    {c.currentProbability != null && (
                      <>
                        <ArrowRight className="w-4 h-4 opacity-40 shrink-0" />
                        <div>Posterior: <span className="text-primary font-bold">{(c.currentProbability * 100).toFixed(1)}%</span></div>
                        {c.confidenceLevel && (
                          <Badge variant={(CONFIDENCE_COLOR[c.confidenceLevel] || "default") as "success" | "warning" | "default"}>
                            {c.confidenceLevel} confidence
                          </Badge>
                        )}
                      </>
                    )}
                    {c.currentProbability == null && (
                      <span className="text-xs text-muted-foreground italic">— not yet forecast</span>
                    )}
                    {c.timeHorizon && (
                      <span className="text-xs text-muted-foreground">· {c.timeHorizon}</span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 min-w-[160px] shrink-0">
                  <Link href={`/cases/${c.caseId}`}>
                    <Button className="w-full gap-1">
                      View Detail <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href={`/cases/${c.caseId}/signals`}>
                    <Button variant="secondary" className="w-full">
                      Signals ({c.signalCount || 0})
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
