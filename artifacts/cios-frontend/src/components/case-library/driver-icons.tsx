import {
  FlaskConical,
  Shield,
  Swords,
  BookOpen,
  Clock,
  Users,
} from "lucide-react";

export type DriverType =
  | "evidence"
  | "access"
  | "competition"
  | "guideline"
  | "timing"
  | "adoption";

const DRIVER_CONFIG: Record<
  DriverType,
  { icon: React.ElementType; label: string; color: string }
> = {
  evidence: { icon: FlaskConical, label: "Evidence", color: "text-emerald-400" },
  access: { icon: Shield, label: "Access", color: "text-blue-400" },
  competition: { icon: Swords, label: "Competition", color: "text-red-400" },
  guideline: { icon: BookOpen, label: "Guideline", color: "text-violet-400" },
  timing: { icon: Clock, label: "Timing", color: "text-amber-400" },
  adoption: { icon: Users, label: "Adoption", color: "text-cyan-400" },
};

interface Props {
  drivers: DriverType[];
}

export default function DriverIcons({ drivers }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {drivers.map((d) => {
        const cfg = DRIVER_CONFIG[d];
        const Icon = cfg.icon;
        return (
          <div
            key={d}
            title={cfg.label}
            className={`rounded-md bg-muted/20 p-1 ${cfg.color}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
        );
      })}
    </div>
  );
}

export { DRIVER_CONFIG };
