import { useState } from "react";
import { useListCases, useCreateCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, Input, Select, Label } from "@/components/ui-components";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { Plus, Folder, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const caseSchema = z.object({
  strategicQuestion: z.string().min(5, "Question must be descriptive"),
  primaryBrand: z.string().min(2, "Brand is required"),
  priorProbability: z.coerce.number().min(0).max(1),
  timeHorizon: z.string(),
  primarySpecialtyProfile: z.string(),
  payerEnvironment: z.string(),
  guidelineLeverage: z.string(),
  competitorProfile: z.string(),
});

export default function CasesList() {
  const [isCreating, setIsCreating] = useState(false);
  const { data: cases, isLoading } = useListCases();
  const { mutate: createCase, isPending } = useCreateCase();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof caseSchema>>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      priorProbability: 0.5,
      timeHorizon: "12 months",
      primarySpecialtyProfile: "General",
      payerEnvironment: "Balanced",
      guidelineLeverage: "Medium",
      competitorProfile: "Entrenched standard of care"
    }
  });

  const onSubmit = (data: z.infer<typeof caseSchema>) => {
    createCase({ data }, {
      onSuccess: () => {
        setIsCreating(false);
        queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
        form.reset();
      }
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Forecast Cases</h1>
            <p className="text-muted-foreground mt-1">Manage active strategic questions and prior probabilities.</p>
          </div>
          <Button onClick={() => setIsCreating(!isCreating)} className="gap-2">
            <Plus className="w-4 h-4" /> New Case
          </Button>
        </div>

        {isCreating && (
          <Card className="animate-in slide-in-from-top-4 fade-in duration-300 border-primary/50">
            <h3 className="text-lg font-semibold mb-4">Initialize New Forecast Case</h3>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Strategic Question</Label>
                  <Input {...form.register("strategicQuestion")} placeholder="e.g. Will the monitored brand move closer to target adoption?" />
                </div>
                
                <div>
                  <Label>Primary Brand</Label>
                  <Input {...form.register("primaryBrand")} placeholder="e.g. ARIKAYCE" />
                </div>
                
                <div>
                  <Label>Prior Probability (0-1) - {form.watch("priorProbability")}</Label>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    className="w-full mt-2 accent-primary" 
                    {...form.register("priorProbability")} 
                  />
                </div>

                <div>
                  <Label>Specialty Profile</Label>
                  <Select {...form.register("primarySpecialtyProfile")}>
                    <option value="General">General</option>
                    <option value="Pulmonology / rare disease">Pulmonology / rare disease</option>
                    <option value="Cardiology / mixed specialist">Cardiology / mixed specialist</option>
                    <option value="Oncology / academic-led">Oncology / academic-led</option>
                    <option value="Infectious disease / guideline-led">Infectious disease / guideline-led</option>
                  </Select>
                </div>

                <div>
                  <Label>Payer Environment</Label>
                  <Select {...form.register("payerEnvironment")}>
                    <option value="Balanced">Balanced</option>
                    <option value="Commercial-heavy">Commercial-heavy</option>
                    <option value="Medicare-heavy">Medicare-heavy</option>
                  </Select>
                </div>
                
                <div>
                  <Label>Guideline Leverage</Label>
                  <Select {...form.register("guidelineLeverage")}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </Select>
                </div>
                
                <div>
                  <Label>Competitor Profile</Label>
                  <Select {...form.register("competitorProfile")}>
                    <option value="Whitespace / limited direct competition">Whitespace</option>
                    <option value="Entrenched standard of care">Entrenched standard of care</option>
                    <option value="Aggressive branded competitor">Aggressive branded competitor</option>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Creating..." : "Initialize Case"}</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4">
          {isLoading ? (
            <div className="text-center p-12 text-muted-foreground">Loading cases...</div>
          ) : cases?.map(c => (
            <Card key={c.id} className="group hover:border-primary/30 transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Folder className="w-5 h-5 text-primary" />
                    <span className="font-mono text-xs text-muted-foreground">{c.caseId}</span>
                    <Badge variant="primary">{c.primaryBrand}</Badge>
                    <Badge variant="default">{c.primarySpecialtyProfile}</Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{c.strategicQuestion}</h3>
                  <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                    <div>Prior: <span className="text-foreground font-medium">{(c.priorProbability * 100).toFixed(0)}%</span></div>
                    {c.currentProbability !== undefined && (
                      <>
                        <ArrowRight className="w-4 h-4 opacity-50" />
                        <div>Current: <span className="text-primary font-bold">{(c.currentProbability * 100).toFixed(1)}%</span></div>
                        <Badge variant={c.confidenceLevel === 'High' ? 'success' : 'warning'} className="ml-2">{c.confidenceLevel}</Badge>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 min-w-[140px]">
                  <Link href={`/cases/${c.caseId}/forecast`}>
                    <Button className="w-full">Forecast Engine</Button>
                  </Link>
                  <Link href={`/cases/${c.caseId}/signals`}>
                    <Button variant="secondary" className="w-full">Signals ({c.signalCount || 0})</Button>
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
