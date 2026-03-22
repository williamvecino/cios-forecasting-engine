import { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { useListSignals, useCreateSignal, useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Card, Badge, Button, Input, Select, Label } from "@/components/ui-components";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Info,
  Trash2,
  Pencil,
} from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  SIGNAL_TYPES,
  SCOPE_VALUES,
  TIMING_VALUES,
  computeLR,
  lrToStrengthLabel,
  type Scope,
  type Timing,
  type SignalType,
} from "@/lib/lr-config";

// ─── Auto-classification ───────────────────────────────────────────────────
const CLASSIFY_KEYWORDS: Record<SignalType, string[]> = {
  "Phase III clinical": [
    "phase 3", "phase iii", "rct", "randomized", "pivotal", "clinical trial",
    "trial data", "study results", "endpoint", "efficacy data", "head-to-head",
    "head to head", "statistically significant", "p-value", "hazard ratio",
  ],
  "Guideline inclusion": [
    "guideline", "guidance", "society", "recommendation", "treatment algorithm",
    "standard of care", "soc", "panel", "consensus", "endorsed by", "preferred",
    "first-line", "second-line", "updated label",
  ],
  "KOL endorsement": [
    "kol", "opinion leader", "key opinion", "lecture", "presentation", "congress",
    "symposium", "peer endorsement", "champion", "thought leader", "speaker",
    "medical affairs", "advisory board",
  ],
  "Field intelligence": [
    "field", "rep", "territory", "conversation", "account", "physician said",
    "doctor said", "hcp said", "heard from", "anecdote", "insight",
    "office visit", "in-person", "rx intent", "prescribing intent", "account level",
  ],
  "Operational friction": [
    "access issue", "reimbursement", "formulary", "prior auth", "step edit",
    "pa requirement", "denied", "rejected", "friction", "barrier", "delay",
    "appeals", "restriction", "exception", "non-formulary",
  ],
  "Competitor counteraction": [
    "competitor", "competition", "competing", "alternative", "market share",
    "detailing", "counter", "rival", "generic", "biosimilar", "switch",
    "displacement", "market defense",
  ],
  "Access / commercial": [
    "coverage", "payer", "coverage expansion", "approval", "commercial", "launch",
    "formulary addition", "tier", "reimbursed", "managed care", "contract",
    "access win", "coverage decision",
  ],
  "Regulatory / clinical": [
    "fda", "ema", "regulatory", "approval", "label", "indication", "safety",
    "adverse event", "black box", "warning", "post-market", "rems", "Dear HCP",
    "dear healthcare", "pharmacovigilance",
  ],
};

function classifyDescription(description: string): SignalType | null {
  if (!description || description.length < 8) return null;
  const lower = description.toLowerCase();
  let bestType: SignalType | null = null;
  let bestCount = 0;
  for (const [type, keywords] of Object.entries(CLASSIFY_KEYWORDS) as [SignalType, string[]][]) {
    const count = keywords.filter((kw) => lower.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      bestType = type;
    }
  }
  return bestType;
}

// ─── Friendly label maps ───────────────────────────────────────────────────
const IMPACT_LABELS: Record<number, string> = {
  1: "Minimal",
  2: "Low",
  3: "Moderate",
  4: "Strong",
  5: "Decisive",
};

const RELIABILITY_LABELS: Record<number, string> = {
  1: "Unverified",
  2: "Single source",
  3: "Field-confirmed",
  4: "Published",
  5: "Validated study",
};

const SCOPE_LABELS: Record<string, string> = {
  local: "Account-level",
  regional: "Regional",
  national: "National",
  global: "Global",
};

const TIMING_LABELS: Record<string, string> = {
  early: "Emerging",
  current: "Active now",
  late: "Winding down",
};

const DIRECTION_OPTIONS = [
  { value: "Positive", label: "Accelerates prescribing", icon: TrendingUp, color: "text-success" },
  { value: "Negative", label: "Constrains prescribing", icon: TrendingDown, color: "text-destructive" },
];

// ─── Schema ────────────────────────────────────────────────────────────────
const SIGNAL_SCOPE_OPTIONS = [
  { value: "market", label: "Market-wide" },
  { value: "specialty", label: "Specialty" },
  { value: "subspecialty", label: "Subspecialty" },
  { value: "institution", label: "Institution" },
  { value: "physician", label: "Physician" },
];

const signalSchema = z.object({
  signalDescription: z.string().min(8, "Describe the intelligence in at least 8 characters"),
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
  ohosFlag: z.string().default("No"),
  signalScope: z.string().default("market"),
  appliesToSpecialty: z.string().optional(),
  appliesToSubspecialty: z.string().optional(),
  appliesToInstitutionId: z.string().optional(),
  appliesToTargetId: z.string().optional(),
  appliesToGeography: z.string().optional(),
  eventFamilyId: z.string().optional(),
});

type FormValues = z.infer<typeof signalSchema>;

// ─── PillSelector ──────────────────────────────────────────────────────────
function PillSelector({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (v: number) => void;
  options: { value: number; label: string }[];
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
            value === opt.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function SignalsRegister() {
  const [, params] = useRoute("/cases/:caseId/signals");
  const caseId = params?.caseId || "";

  const [isCreating, setIsCreating] = useState(false);
  const [suggestedType, setSuggestedType] = useState<SignalType | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingSignal, setEditingSignal] = useState<any | null>(null);

  const { data: caseData } = useGetCase(caseId);
  const { data: signals, isLoading } = useListSignals(caseId);
  const { mutate: createSignal, isPending } = useCreateSignal();
  const queryClient = useQueryClient();

  const { mutate: deleteSignal, isPending: isDeleting } = useMutation({
    mutationFn: async (signalId: string) => {
      const res = await fetch(`/api/signals/${signalId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete signal");
    },
    onSuccess: () => {
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/signals`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/forecast`] });
    },
  });

  const { mutate: updateSignal, isPending: isUpdating } = useMutation({
    mutationFn: async ({ signalId, data }: { signalId: string; data: FormValues }) => {
      const lr = computeLR(
        data.signalType, data.strengthScore, data.reliabilityScore,
        data.scope as Scope, data.timing as Timing, data.direction as "Positive" | "Negative"
      );
      const res = await fetch(`/api/signals/${signalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, likelihoodRatio: lr }),
      });
      if (!res.ok) throw new Error("Failed to update signal");
      return res.json();
    },
    onSuccess: () => {
      setEditingSignal(null);
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/signals`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/forecast`] });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(signalSchema),
    defaultValues: {
      direction: "Positive",
      signalType: "Field intelligence",
      strengthScore: 3,
      reliabilityScore: 3,
      scope: "national",
      timing: "current",
      likelihoodRatio: computeLR("Field intelligence", 3, 3, "national", "current", "Positive"),
      targetPopulation: "General",
      route: "CIOS→MIOS",
      miosFlag: "Yes",
      ohosFlag: "No",
      signalScope: "market",
    },
  });

  const watchedValues = form.watch();

  const recomputeLR = useCallback(() => {
    const v = form.getValues();
    const lr = computeLR(
      v.signalType,
      v.strengthScore,
      v.reliabilityScore,
      v.scope as Scope,
      v.timing as Timing,
      v.direction as "Positive" | "Negative"
    );
    form.setValue("likelihoodRatio", lr, { shouldValidate: false });
  }, [form]);

  useEffect(() => {
    recomputeLR();
  }, [
    watchedValues.direction,
    watchedValues.signalType,
    watchedValues.strengthScore,
    watchedValues.reliabilityScore,
    watchedValues.scope,
    watchedValues.timing,
    recomputeLR,
  ]);

  const handleDescriptionChange = useCallback(
    (text: string) => {
      const detected = classifyDescription(text);
      setSuggestedType(detected);
      if (detected) {
        form.setValue("signalType", detected);
      }
    },
    [form]
  );

  // ── Edit form ─────────────────────────────────────────────────────────────
  const editForm = useForm<FormValues>({
    resolver: zodResolver(signalSchema),
    defaultValues: {
      direction: "Positive", signalType: "Field intelligence",
      strengthScore: 3, reliabilityScore: 3,
      scope: "national", timing: "current",
      likelihoodRatio: 1.0, targetPopulation: "General",
      route: "CIOS→MIOS", miosFlag: "Yes", ohosFlag: "No",
    },
  });
  const editWatched = editForm.watch();

  const recomputeEditLR = useCallback(() => {
    const v = editForm.getValues();
    const lr = computeLR(
      v.signalType, v.strengthScore, v.reliabilityScore,
      v.scope as Scope, v.timing as Timing, v.direction as "Positive" | "Negative"
    );
    editForm.setValue("likelihoodRatio", lr, { shouldValidate: false });
  }, [editForm]);

  useEffect(() => {
    recomputeEditLR();
  }, [
    editWatched.direction, editWatched.signalType,
    editWatched.strengthScore, editWatched.reliabilityScore,
    editWatched.scope, editWatched.timing, recomputeEditLR,
  ]);

  const startEdit = (sig: any) => {
    setIsCreating(false);
    setEditingSignal(sig);
    editForm.reset({
      signalDescription: sig.signalDescription,
      signalType: sig.signalType,
      direction: sig.direction,
      strengthScore: sig.strengthScore,
      reliabilityScore: sig.reliabilityScore,
      scope: sig.scope || "national",
      timing: sig.timing || "current",
      likelihoodRatio: sig.likelihoodRatio,
      targetPopulation: sig.targetPopulation || "General",
      route: sig.route || "CIOS→MIOS",
      miosFlag: sig.miosFlag || "Yes",
      ohosFlag: sig.ohosFlag || "No",
    });
  };

  const onEditSubmit = (data: FormValues) => {
    if (!editingSignal) return;
    updateSignal({ signalId: editingSignal.signalId, data });
  };

  const editStrengthLabel = lrToStrengthLabel(editWatched.likelihoodRatio, editWatched.direction);

  const onSubmit = (data: FormValues) => {
    const lr = computeLR(
      data.signalType,
      data.strengthScore,
      data.reliabilityScore,
      data.scope as Scope,
      data.timing as Timing,
      data.direction as "Positive" | "Negative"
    );
    createSignal(
      { caseId, data: { ...data, likelihoodRatio: lr } },
      {
        onSuccess: () => {
          setIsCreating(false);
          setSuggestedType(null);
          queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/signals`] });
          queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/forecast`] });
          form.reset();
        },
      }
    );
  };

  const currentLR = watchedValues.likelihoodRatio;
  const currentDirection = watchedValues.direction;
  const strengthLabel = lrToStrengthLabel(currentLR, currentDirection);

  const impactOptions = [1, 2, 3, 4, 5].map((n) => ({
    value: n,
    label: IMPACT_LABELS[n],
  }));
  const reliabilityOptions = [1, 2, 3, 4, 5].map((n) => ({
    value: n,
    label: RELIABILITY_LABELS[n],
  }));

  const cd = caseData as any;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="primary">{caseId}</Badge>
              <span className="text-sm font-medium text-muted-foreground">
                {cd?.assetName || caseData?.primaryBrand}
              </span>
            </div>
            <h1 className="text-3xl font-bold">Evidence Register</h1>
            <p className="text-muted-foreground mt-1">
              Log strategic intelligence about this asset. The engine derives its
              assessment weight automatically.
            </p>
          </div>
          <Button onClick={() => setIsCreating(!isCreating)} className="gap-2">
            <Plus className="w-4 h-4" /> Log Intelligence
          </Button>
        </div>

        {/* Entry form */}
        {isCreating && (
          <Card className="animate-in slide-in-from-top-4 fade-in duration-300 border-primary/20 bg-primary/3">
            <h3 className="text-base font-semibold mb-1">New Strategic Intelligence Entry</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Describe what you've observed or received. The system will classify it and
              calculate its assessment weight automatically.
            </p>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Description + auto-classification */}
              <div>
                <Label>What intelligence was received?</Label>
                <Input
                  {...form.register("signalDescription")}
                  onChange={(e) => {
                    form.register("signalDescription").onChange(e);
                    handleDescriptionChange(e.target.value);
                  }}
                  placeholder="e.g. KOL at national congress publicly cited outcomes data; payer confirms coverage expansion in Q3; rep reports high intent scores in academic accounts..."
                  className="mt-1"
                />
                {form.formState.errors.signalDescription && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.signalDescription.message}
                  </p>
                )}

                {/* Classification row */}
                <div className="flex items-center gap-2 mt-2">
                  {suggestedType ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span className="text-xs text-muted-foreground">Suggested type:</span>
                      <span className="text-xs font-semibold text-primary">{suggestedType}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">Classification:</span>
                  )}
                  <Controller
                    control={form.control}
                    name="signalType"
                    render={({ field }) => (
                      <Select
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          form.setValue("signalType", e.target.value);
                        }}
                        className="flex-1 max-w-xs text-xs"
                      >
                        {SIGNAL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                </div>
              </div>

              {/* Effect + Scope */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label>Effect on prescribing behavior</Label>
                  <div className="flex gap-2 mt-1.5">
                    {DIRECTION_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const selected = watchedValues.direction === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => form.setValue("direction", opt.value as "Positive" | "Negative")}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all",
                            selected
                              ? opt.value === "Positive"
                                ? "bg-success/10 border-success/40 text-success"
                                : "bg-destructive/10 border-destructive/40 text-destructive"
                              : "bg-background border-border text-muted-foreground hover:border-border/80"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label>Geographic reach of this signal</Label>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {SCOPE_VALUES.map((s) => {
                      const selected = watchedValues.scope === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => form.setValue("scope", s)}
                          className={cn(
                            "px-3 py-2 rounded-lg text-xs font-medium border flex-1 transition-all",
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border text-muted-foreground hover:border-primary/40"
                          )}
                        >
                          {SCOPE_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Signal Scope + Target Linkage */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Signal scope</Label>
                  <Select {...form.register("signalScope")}>
                    {SIGNAL_SCOPE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </div>
                {(watchedValues as any).signalScope && (watchedValues as any).signalScope !== "market" && (
                  <div>
                    <Label>Applies to</Label>
                    <Input
                      {...form.register(
                        (watchedValues as any).signalScope === "specialty" ? "appliesToSpecialty" :
                        (watchedValues as any).signalScope === "subspecialty" ? "appliesToSubspecialty" :
                        (watchedValues as any).signalScope === "institution" ? "appliesToInstitutionId" :
                        "appliesToTargetId"
                      )}
                      placeholder={
                        (watchedValues as any).signalScope === "specialty" ? "e.g. Pulmonology" :
                        (watchedValues as any).signalScope === "subspecialty" ? "e.g. Interventional Cardiology" :
                        (watchedValues as any).signalScope === "institution" ? "e.g. MGH" :
                        "e.g. NPI or physician ID"
                      }
                    />
                  </div>
                )}
                <div>
                  <Label>Event family ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    {...form.register("eventFamilyId")}
                    placeholder="e.g. FDA-2026-APPROVAL"
                  />
                </div>
              </div>

              {/* Impact + Reliability */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label>
                    Impact on adoption
                    <span className="ml-1 text-muted-foreground font-normal">
                      — how much will this shift HCP behavior?
                    </span>
                  </Label>
                  <div className="mt-2">
                    <Controller
                      control={form.control}
                      name="strengthScore"
                      render={({ field }) => (
                        <PillSelector
                          value={field.value}
                          onChange={(v) => field.onChange(v)}
                          options={impactOptions}
                        />
                      )}
                    />
                  </div>
                </div>

                <div>
                  <Label>
                    Reliability of the information
                    <span className="ml-1 text-muted-foreground font-normal">
                      — how trustworthy is the source?
                    </span>
                  </Label>
                  <div className="mt-2">
                    <Controller
                      control={form.control}
                      name="reliabilityScore"
                      render={({ field }) => (
                        <PillSelector
                          value={field.value}
                          onChange={(v) => field.onChange(v)}
                          options={reliabilityOptions}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Timing */}
              <div className="max-w-sm">
                <Label>When is this signal most active?</Label>
                <div className="flex gap-1.5 mt-1.5">
                  {TIMING_VALUES.map((t) => {
                    const selected = watchedValues.timing === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => form.setValue("timing", t)}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border text-muted-foreground hover:border-primary/40"
                        )}
                      >
                        {TIMING_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live forecast weight preview */}
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border border-border rounded-xl">
                <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <span className="text-xs text-muted-foreground">Estimated assessment contribution: </span>
                  <span className={cn("text-xs font-semibold", strengthLabel.color)}>
                    {strengthLabel.label}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">
                  [{watchedValues.signalType}]
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsCreating(false);
                    setSuggestedType(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Signal"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Edit form */}
        {editingSignal && (
          <Card className="animate-in slide-in-from-top-4 fade-in duration-300 border-amber-500/20 bg-amber-500/3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold">Edit Signal — {editingSignal.signalId}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Update the details below. The evidence weight will recalculate automatically.
            </p>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-5">
              <div>
                <Label>What intelligence was received?</Label>
                <Input
                  {...editForm.register("signalDescription")}
                  className="mt-1"
                />
                {editForm.formState.errors.signalDescription && (
                  <p className="text-xs text-destructive mt-1">
                    {editForm.formState.errors.signalDescription.message}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground shrink-0">Classification:</span>
                  <Controller
                    control={editForm.control}
                    name="signalType"
                    render={({ field }) => (
                      <Select {...field} onChange={(e) => { field.onChange(e); editForm.setValue("signalType", e.target.value); }} className="flex-1 max-w-xs text-xs">
                        {SIGNAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label>Effect on prescribing behavior</Label>
                  <div className="flex gap-2 mt-1.5">
                    {DIRECTION_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const selected = editWatched.direction === opt.value;
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => editForm.setValue("direction", opt.value as "Positive" | "Negative")}
                          className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all",
                            selected ? opt.value === "Positive" ? "bg-success/10 border-success/40 text-success" : "bg-destructive/10 border-destructive/40 text-destructive"
                              : "bg-background border-border text-muted-foreground hover:border-border/80"
                          )}>
                          <Icon className="w-4 h-4" />{opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>Geographic reach of this signal</Label>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {SCOPE_VALUES.map((s) => {
                      const selected = editWatched.scope === s;
                      return (
                        <button key={s} type="button" onClick={() => editForm.setValue("scope", s)}
                          className={cn("px-3 py-2 rounded-lg text-xs font-medium border flex-1 transition-all",
                            selected ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                          )}>
                          {SCOPE_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label>Impact on adoption</Label>
                  <div className="mt-2">
                    <Controller control={editForm.control} name="strengthScore"
                      render={({ field }) => <PillSelector value={field.value} onChange={(v) => field.onChange(v)} options={impactOptions} />}
                    />
                  </div>
                </div>
                <div>
                  <Label>Reliability of the information</Label>
                  <div className="mt-2">
                    <Controller control={editForm.control} name="reliabilityScore"
                      render={({ field }) => <PillSelector value={field.value} onChange={(v) => field.onChange(v)} options={reliabilityOptions} />}
                    />
                  </div>
                </div>
              </div>
              <div className="max-w-sm">
                <Label>When is this signal most active?</Label>
                <div className="flex gap-1.5 mt-1.5">
                  {TIMING_VALUES.map((t) => {
                    const selected = editWatched.timing === t;
                    return (
                      <button key={t} type="button" onClick={() => editForm.setValue("timing", t)}
                        className={cn("flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                          selected ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                        )}>
                        {TIMING_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border border-border rounded-xl">
                <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <span className="text-xs text-muted-foreground">Estimated assessment contribution: </span>
                  <span className={cn("text-xs font-semibold", editStrengthLabel.color)}>{editStrengthLabel.label}</span>
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">[{editWatched.signalType}]</div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <Button type="button" variant="ghost" onClick={() => setEditingSignal(null)}>Cancel</Button>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? "Saving..." : "Update Signal"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Signal list */}
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
                <tr>
                  <th className="px-5 py-4 font-semibold">ID</th>
                  <th className="px-5 py-4 font-semibold">Intelligence</th>
                  <th className="px-5 py-4 font-semibold">Classification</th>
                  <th className="px-5 py-4 font-semibold text-center">Effect</th>
                  <th className="px-5 py-4 font-semibold text-center">Impact&thinsp;/&thinsp;Reliability</th>
                  <th className="px-5 py-4 font-semibold text-right">Evidence weight</th>
                  <th className="px-5 py-4 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                      Loading signals…
                    </td>
                  </tr>
                ) : signals?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Sparkles className="w-8 h-8 text-muted-foreground/30" />
                        <span className="text-muted-foreground">
                          No intelligence logged yet.
                        </span>
                        <span className="text-xs text-muted-foreground/60">
                          Log a signal above to start building your assessment.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  signals?.map((sig) => {
                    const isPositive = sig.direction === "Positive";
                    return (
                      <tr
                        key={sig.id}
                        className="group hover:bg-muted/10 transition-colors"
                      >
                        <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                          {sig.signalId}
                        </td>
                        <td className="px-5 py-4 max-w-xs">
                          <div
                            className="font-medium text-foreground leading-snug line-clamp-2"
                            title={sig.signalDescription}
                          >
                            {sig.signalDescription}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant="default" className="text-[11px]">
                            {sig.signalType}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-xs font-medium",
                              isPositive ? "text-success" : "text-destructive"
                            )}
                          >
                            {isPositive ? (
                              <TrendingUp className="w-3.5 h-3.5" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5" />
                            )}
                            {isPositive ? "Accelerates" : "Constrains"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="text-xs font-semibold text-foreground">
                              {IMPACT_LABELS[sig.strengthScore ?? 3]}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {RELIABILITY_LABELS[sig.reliabilityScore ?? 3]}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span
                              className={cn(
                                "text-xs font-bold font-mono",
                                isPositive ? "text-success" : "text-destructive"
                              )}
                            >
                              LR {sig.likelihoodRatio.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {lrToStrengthLabel(sig.likelihoodRatio, sig.direction ?? "Positive").label.split(" — ")[0]}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-right">
                          {confirmDeleteId === sig.signalId ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[10px] text-destructive font-medium whitespace-nowrap">Remove?</span>
                              <button
                                onClick={() => deleteSignal(sig.signalId)}
                                disabled={isDeleting}
                                className="text-[10px] font-semibold text-destructive hover:underline disabled:opacity-50"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-[10px] text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEdit(sig)}
                                className={cn(
                                  "p-1.5 rounded-lg transition-all",
                                  editingSignal?.signalId === sig.signalId
                                    ? "text-amber-400 bg-amber-400/10 opacity-100"
                                    : "opacity-20 group-hover:opacity-100 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10"
                                )}
                                title="Edit signal"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(sig.signalId)}
                                className="opacity-20 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                title="Remove signal"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
