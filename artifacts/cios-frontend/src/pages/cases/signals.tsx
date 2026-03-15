import { useState } from "react";
import { useRoute } from "wouter";
import { useListSignals, useCreateSignal, useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Card, Badge, Button, Input, Select, Label } from "@/components/ui-components";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  SIGNAL_TYPES,
  SCOPE_VALUES,
  TIMING_VALUES,
  computeLR,
  type Scope,
  type Timing,
} from "@/lib/lr-config";

const signalSchema = z.object({
  signalDescription: z.string().min(5),
  signalType: z.string(),
  direction: z.enum(["Positive", "Negative"]),
  strengthScore: z.coerce.number().min(1).max(5),
  reliabilityScore: z.coerce.number().min(1).max(5),
  scope: z.enum(["local", "regional", "national", "global"]),
  timing: z.enum(["early", "current", "late"]),
  likelihoodRatio: z.coerce.number().min(0.1).max(5),
  targetPopulation: z.string().default("General"),
  route: z.string().default("CIOS→MIOS"),
  miosFlag: z.string().default("Yes"),
  ohosFlag: z.string().default("No")
});

export default function SignalsRegister() {
  const [, params] = useRoute("/cases/:caseId/signals");
  const caseId = params?.caseId || "";
  
  const [isCreating, setIsCreating] = useState(false);
  const { data: caseData } = useGetCase(caseId);
  const { data: signals, isLoading } = useListSignals(caseId);
  const { mutate: createSignal, isPending } = useCreateSignal();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof signalSchema>>({
    resolver: zodResolver(signalSchema),
    defaultValues: {
      direction: "Positive",
      signalType: "Phase III clinical",
      strengthScore: 3,
      reliabilityScore: 3,
      scope: "national",
      timing: "current",
      likelihoodRatio: computeLR("Phase III clinical", 3, 3, "national", "current")
    }
  });

  const updateLR = () => {
    const values = form.getValues();
    const lr = computeLR(
      values.signalType,
      values.strengthScore,
      values.reliabilityScore,
      values.scope as Scope,
      values.timing as Timing
    );
    form.setValue("likelihoodRatio", lr);
  };

  const onSubmit = (data: z.infer<typeof signalSchema>) => {
    createSignal({ caseId, data }, {
      onSuccess: () => {
        setIsCreating(false);
        queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/signals`] });
        queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/forecast`] });
        form.reset();
      }
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="primary">{caseId}</Badge>
              <span className="text-sm font-medium text-muted-foreground">{caseData?.primaryBrand}</span>
            </div>
            <h1 className="text-3xl font-bold">Signal Register</h1>
            <p className="text-muted-foreground mt-1">Validated evidence and intelligence feeding the forecast.</p>
          </div>
          <Button onClick={() => setIsCreating(!isCreating)} className="gap-2">
            <Plus className="w-4 h-4" /> Inject Signal
          </Button>
        </div>

        {isCreating && (
          <Card className="animate-in slide-in-from-top-4 fade-in duration-300 border-accent/50 bg-accent/5">
            <h3 className="text-lg font-semibold mb-4 text-accent-foreground">New Signal Entry</h3>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-3">
                  <Label>Signal Description</Label>
                  <Input {...form.register("signalDescription")} placeholder="e.g. New publication emphasizes outcomes linkage" />
                </div>
                
                <div>
                  <Label>Type</Label>
                  <Select
                    {...form.register("signalType")}
                    onChange={(e) => {
                      form.register("signalType").onChange(e);
                      form.setValue("signalType", e.target.value);
                      setTimeout(updateLR, 0);
                    }}
                  >
                    {SIGNAL_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                
                <div>
                  <Label>Direction</Label>
                  <Select 
                    {...form.register("direction")} 
                    onChange={(e) => {
                      form.register("direction").onChange(e);
                    }}
                  >
                    <option value="Positive">Positive (Supports Adoption)</option>
                    <option value="Negative">Negative (Constrains Adoption)</option>
                  </Select>
                </div>

                <div>
                  <Label>Likelihood Ratio (Bayesian LR)</Label>
                  <Input type="number" step="0.01" {...form.register("likelihoodRatio")} />
                </div>

                <div>
                  <Label>Strength (1-5)</Label>
                  <Select 
                    {...form.register("strengthScore")}
                    onChange={(e) => {
                      form.register("strengthScore").onChange(e);
                      form.setValue("strengthScore", Number(e.target.value));
                      setTimeout(updateLR, 0);
                    }}
                  >
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </div>

                <div>
                  <Label>Credibility (1-5)</Label>
                  <Select
                    {...form.register("reliabilityScore")}
                    onChange={(e) => {
                      form.register("reliabilityScore").onChange(e);
                      form.setValue("reliabilityScore", Number(e.target.value));
                      setTimeout(updateLR, 0);
                    }}
                  >
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </div>

                <div>
                  <Label>Scope</Label>
                  <Select
                    {...form.register("scope")}
                    onChange={(e) => {
                      form.register("scope").onChange(e);
                      form.setValue("scope", e.target.value as Scope);
                      setTimeout(updateLR, 0);
                    }}
                  >
                    {SCOPE_VALUES.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label>Timing</Label>
                  <Select
                    {...form.register("timing")}
                    onChange={(e) => {
                      form.register("timing").onChange(e);
                      form.setValue("timing", e.target.value as Timing);
                      setTimeout(updateLR, 0);
                    }}
                  >
                    {TIMING_VALUES.map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)} cycle</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label>Target Population Keyword</Label>
                  <Input {...form.register("targetPopulation")} placeholder="e.g. Specialist, Community, Academic" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Injecting..." : "Inject into Engine"}</Button>
              </div>
            </form>
          </Card>
        )}

        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">ID</th>
                  <th className="px-6 py-4 font-semibold">Description</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold text-center">Str/Cred</th>
                  <th className="px-6 py-4 font-semibold text-right">LR</th>
                  <th className="px-6 py-4 font-semibold text-right">Actor Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading signals...</td></tr>
                ) : signals?.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No signals registered for this case.</td></tr>
                ) : signals?.map(sig => (
                  <tr key={sig.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs">{sig.signalId}</td>
                    <td className="px-6 py-4 font-medium text-foreground max-w-md truncate" title={sig.signalDescription}>
                      {sig.signalDescription}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="default">{sig.signalType}</Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-mono">{sig.strengthScore}/{sig.reliabilityScore}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn("font-bold font-mono", sig.direction === 'Positive' ? "text-success" : "text-destructive")}>
                        {sig.direction === 'Positive' ? <TrendingUp className="inline w-3 h-3 mr-1"/> : <TrendingDown className="inline w-3 h-3 mr-1"/>}
                        {sig.likelihoodRatio.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Badge variant={sig.actorAdjustedImpact && sig.actorAdjustedImpact > 0 ? 'success' : 'danger'}>
                        {sig.actorAdjustedImpact?.toFixed(3) || 'Calc pending'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
