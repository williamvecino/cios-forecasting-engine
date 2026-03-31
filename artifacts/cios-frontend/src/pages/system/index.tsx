import { Link } from "wouter";
import TopNav from "@/components/top-nav";
import {
  BarChart3,
  BookOpen,
  FlaskConical,
  Map,
  Settings,
  Activity,
  Shield,
  Search,
  Radio,
  Eye,
  Users,
  Layers,
  GitBranch,
} from "lucide-react";

const SYSTEM_MODULES = [
  {
    section: "Performance",
    items: [
      { label: "Forecast Ledger", path: "/forecast-ledger", icon: BookOpen, description: "Formal prediction history and resolution tracking." },
      { label: "Calibration", path: "/calibration", icon: BarChart3, description: "System health, error, and performance monitoring." },
      { label: "Stability Tests", path: "/stability-tests", icon: FlaskConical, description: "Verification harness for deterministic behavior." },
    ],
  },
  {
    section: "Infrastructure",
    items: [
      { label: "Agent Registry", path: "/agent-registry", icon: GitBranch, description: "Canonical agent chain with explicit contracts, boundaries, and enforcement rules." },
      { label: "Strategic Dashboard", path: "/dashboard", icon: Activity, description: "Full case overview with probabilities and active questions." },
      { label: "System Map", path: "/system-map", icon: Map, description: "Architecture view and internal relationships." },
      { label: "Workbench", path: "/workbench", icon: Settings, description: "Detailed operational testing and manual forecasting." },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { label: "Signal Review", path: "/review", icon: Eye, description: "Global signal review queue across all cases." },
      { label: "Signal Detection", path: "/signal-detection", icon: Search, description: "CIOS-powered signal extraction from source text." },
      { label: "Adopter Discovery", path: "/discovery", icon: Users, description: "Discover adoption candidates by geography and specialty." },
      { label: "Event Radar", path: "/event-radar", icon: Radio, description: "Track upcoming events likely to generate signals." },
      { label: "Field Intelligence", path: "/field-intelligence", icon: Layers, description: "Structured field intelligence capture." },
      { label: "Watchlist", path: "/watchlist", icon: Shield, description: "Track upcoming events and external triggers." },
    ],
  },
];

export default function SystemPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Advanced infrastructure, validation tools, and intelligence modules.
          </p>
        </div>

        {SYSTEM_MODULES.map((section) => (
          <section key={section.section}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
              {section.section}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className="rounded-xl border border-border bg-card p-5 hover:border-border/80 hover:bg-muted/10 transition space-y-2 group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition" />
                      <span className="text-sm font-semibold text-foreground">{item.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
