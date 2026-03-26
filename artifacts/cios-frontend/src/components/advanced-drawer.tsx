import { Link } from "wouter";

interface Props {
  open: boolean;
  onClose: () => void;
}

const systemLinks = [
  {
    label: "Forecast Ledger",
    path: "/forecast-ledger",
    description: "Formal prediction history and resolution tracking.",
  },
  {
    label: "Calibration",
    path: "/calibration",
    description: "System health, error, and performance monitoring.",
  },
  {
    label: "System Map",
    path: "/system-map",
    description: "Architecture view and internal relationships.",
  },
  {
    label: "Workbench",
    path: "/workbench",
    description: "Detailed operational testing and manual forecasting workflow.",
  },
  {
    label: "Stability Tests",
    path: "/stability-tests",
    description: "Verification harness for deterministic behavior.",
  },
];

export default function AdvancedDrawer({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="h-full w-full max-w-[440px] border-l border-border bg-background p-6 shadow-2xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Advanced / System
            </div>
            <div className="mt-2 text-sm text-muted-foreground/70">
              Secondary modules stay accessible without crowding the primary workflow.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {systemLinks.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              onClick={onClose}
              className="block rounded-xl border border-border bg-card p-4 hover:border-border/80 hover:bg-muted/20"
            >
              <div className="text-sm font-semibold text-foreground">{item.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
