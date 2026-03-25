import type { UseFormReturn } from "react-hook-form";
import { Label } from "@/components/ui-components";

type SpecialtyActorProfile =
  | "general"
  | "early_adopter_specialty"
  | "conservative_specialty"
  | "cost_sensitive_specialty"
  | "procedural_specialty";

type PayerEnvironment = "favorable" | "balanced" | "restrictive";
type GuidelineLeverage = "low" | "medium" | "high";
type CompetitiveLandscape = "open_market" | "moderate_competition" | "entrenched_standard_of_care";
type AdoptionPhase = "pre_launch" | "early_adoption" | "growth" | "plateau" | "decline";
type ForecastHorizonMonths = 6 | 12 | 24 | 36;

const specialtyOptions: { value: SpecialtyActorProfile; label: string }[] = [
  { value: "general", label: "General (default)" },
  { value: "early_adopter_specialty", label: "Early adopter specialty" },
  { value: "conservative_specialty", label: "Conservative specialty" },
  { value: "cost_sensitive_specialty", label: "Cost-sensitive specialty" },
  { value: "procedural_specialty", label: "Procedural specialty" },
];

const payerOptions: { value: PayerEnvironment; label: string }[] = [
  { value: "favorable", label: "Favorable" },
  { value: "balanced", label: "Balanced" },
  { value: "restrictive", label: "Restrictive" },
];

const guidelineOptions: { value: GuidelineLeverage; label: string }[] = [
  { value: "low", label: "Low — limited guideline force" },
  { value: "medium", label: "Medium — guidelines exist, moderate adherence" },
  { value: "high", label: "High — strong guideline influence" },
];

const competitionOptions: { value: CompetitiveLandscape; label: string }[] = [
  { value: "open_market", label: "Open market" },
  { value: "moderate_competition", label: "Moderate competition" },
  { value: "entrenched_standard_of_care", label: "Entrenched standard of care" },
];

const adoptionPhaseOptions: { value: AdoptionPhase; label: string }[] = [
  { value: "pre_launch", label: "Pre-launch" },
  { value: "early_adoption", label: "Early adoption" },
  { value: "growth", label: "Growth" },
  { value: "plateau", label: "Plateau" },
  { value: "decline", label: "Decline" },
];

const horizonOptions: { value: ForecastHorizonMonths; label: string }[] = [
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
  { value: 24, label: "24 months" },
  { value: 36, label: "36 months" },
];

function EnvSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) =>
          onChange(
            (typeof value === "number"
              ? Number(e.target.value)
              : e.target.value) as T
          )
        }
        className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ActorEnvironmentSection({ form }: { form: UseFormReturn<any> }) {
  const accessFriction = form.watch("accessFrictionIndex") ?? 0.5;

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border/50">
        Actor Environment
        <span className="normal-case font-normal ml-2 text-muted-foreground">
          — configures baseline behavioral weighting and forecast context
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EnvSelect
          label="Specialty Actor Profile"
          value={form.watch("primarySpecialtyProfile") || "general"}
          options={specialtyOptions}
          onChange={(v) => form.setValue("primarySpecialtyProfile", v)}
        />

        <EnvSelect
          label="Payer Environment"
          value={form.watch("payerEnvironment") || "balanced"}
          options={payerOptions}
          onChange={(v) => form.setValue("payerEnvironment", v)}
        />

        <EnvSelect
          label="Guideline Leverage"
          value={form.watch("guidelineLeverage") || "medium"}
          options={guidelineOptions}
          onChange={(v) => form.setValue("guidelineLeverage", v)}
        />

        <EnvSelect
          label="Competitive Landscape"
          value={form.watch("competitorProfile") || "entrenched_standard_of_care"}
          options={competitionOptions}
          onChange={(v) => form.setValue("competitorProfile", v)}
        />

        <div className="space-y-1.5">
          <Label>Access Friction Index</Label>
          <div className="rounded-xl border border-border bg-input px-3 py-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={accessFriction}
              onChange={(e) =>
                form.setValue("accessFrictionIndex", Number(e.target.value))
              }
              className="w-full accent-primary"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Low friction</span>
              <span className="font-semibold text-foreground">
                {Number(accessFriction).toFixed(2)}
              </span>
              <span>High friction</span>
            </div>
          </div>
        </div>

        <EnvSelect
          label="Adoption Phase"
          value={form.watch("adoptionPhase") || "early_adoption"}
          options={adoptionPhaseOptions}
          onChange={(v) => form.setValue("adoptionPhase", v)}
        />

        <EnvSelect
          label="Forecast Horizon"
          value={form.watch("forecastHorizonMonths") ?? 12}
          options={horizonOptions}
          onChange={(v) => form.setValue("forecastHorizonMonths", v)}
        />
      </div>

      <div className="mt-4 rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
        Defaults are intentionally centered so existing cases remain stable.
        New fields refine context but do not alter the core engine.
      </div>
    </div>
  );
}
