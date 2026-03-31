import { useQuery } from "@tanstack/react-query";
import TopNav from "@/components/top-nav";
import { ArrowRight, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface AgentContract {
  name: string;
  purpose: string;
  input: string[];
  output: string[];
  boundary: string[];
  implementationFiles: string[];
  downstreamConsumer: string;
}

interface ChainStep {
  step: number;
  name: string;
  purpose: string;
  inputSummary: string;
  outputSummary: string;
  next: string;
}

const STEP_COLORS = [
  "border-blue-500/30 bg-blue-500/[0.06]",
  "border-cyan-500/30 bg-cyan-500/[0.06]",
  "border-emerald-500/30 bg-emerald-500/[0.06]",
  "border-amber-500/30 bg-amber-500/[0.06]",
  "border-violet-500/30 bg-violet-500/[0.06]",
  "border-rose-500/30 bg-rose-500/[0.06]",
  "border-orange-500/30 bg-orange-500/[0.06]",
];

const STEP_ACCENT = [
  "text-blue-400",
  "text-cyan-400",
  "text-emerald-400",
  "text-amber-400",
  "text-violet-400",
  "text-rose-400",
  "text-orange-400",
];

function AgentCard({ agentKey, agent, step, expanded, onToggle }: {
  agentKey: string;
  agent: AgentContract;
  step: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const colorClass = STEP_COLORS[(step - 1) % STEP_COLORS.length];
  const accentClass = STEP_ACCENT[(step - 1) % STEP_ACCENT.length];

  return (
    <div className={`rounded-2xl border ${colorClass} overflow-hidden transition-all`}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/[0.02] transition"
      >
        <div className={`w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-sm font-bold ${accentClass}`}>
          {step}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">{agent.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{agent.purpose}</div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Input</div>
              {agent.input.map((item, i) => (
                <div key={i} className="text-xs text-slate-300 flex items-start gap-2 mb-1">
                  <span className="text-slate-600 mt-0.5">→</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Output</div>
              {agent.output.map((item, i) => (
                <div key={i} className="text-xs text-slate-300 flex items-start gap-2 mb-1">
                  <span className={`mt-0.5 ${accentClass}`}>←</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> Boundary
            </div>
            <div className="flex flex-wrap gap-2">
              {agent.boundary.map((rule, i) => (
                <span key={i} className="inline-flex rounded-full border border-red-500/20 bg-red-500/5 px-2.5 py-0.5 text-[10px] text-red-300 font-medium">
                  {rule}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Implementation</div>
            <div className="flex flex-wrap gap-1.5">
              {agent.implementationFiles.map((file, i) => (
                <span key={i} className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-400 font-mono">
                  {file}
                </span>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-slate-500">
            Downstream: <span className="text-slate-300 font-medium">{agent.downstreamConsumer === "terminal" ? "End of chain" : agent.downstreamConsumer}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentRegistryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/agent-registry"],
    queryFn: async () => {
      const res = await fetch("/api/agent-registry");
      if (!res.ok) throw new Error(`Agent registry fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleAgent = (key: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    if (data?.registry) {
      setExpandedAgents(new Set(Object.keys(data.registry)));
    }
  };

  const collapseAll = () => setExpandedAgents(new Set());

  const chain: ChainStep[] = data?.chain ?? [];
  const registry: Record<string, AgentContract> = data?.registry ?? {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">System Infrastructure</div>
          <h1 className="mt-2 text-2xl font-bold text-white">Agent Registry</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Every agent in the CIOS chain has a single responsibility, explicit input, explicit output, and explicit boundary.
            Agents pass structured artifacts forward and never perform work outside their assigned stage.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-5">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4">Critical Path — Agent Chain</div>
              <div className="flex flex-wrap items-center gap-2">
                {chain.map((step, i) => (
                  <div key={step.step} className="flex items-center gap-2">
                    <div className={`rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 ${STEP_ACCENT[i % STEP_ACCENT.length]}`}>
                      <div className="text-[10px] font-bold uppercase tracking-wider">{step.step}. {step.name.replace(" Agent", "")}</div>
                    </div>
                    {i < chain.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Agent Contracts ({Object.keys(registry).length})</div>
              <div className="flex items-center gap-2">
                <button onClick={expandAll} className="text-[10px] text-blue-400 hover:text-blue-300 transition">Expand All</button>
                <span className="text-slate-700">|</span>
                <button onClick={collapseAll} className="text-[10px] text-blue-400 hover:text-blue-300 transition">Collapse All</button>
              </div>
            </div>

            <div className="space-y-3">
              {Object.entries(registry).map(([key, agent], idx) => (
                <AgentCard
                  key={key}
                  agentKey={key}
                  agent={agent}
                  step={idx + 1}
                  expanded={expandedAgents.has(key)}
                  onToggle={() => toggleAgent(key)}
                />
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-5 space-y-3">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Enforcement Rules</div>
              <div className="space-y-2">
                {[
                  "No agent may recompute another agent's output",
                  "No agent may override another agent's decision",
                  "No agent may generate data outside its role",
                  "Agents must pass structured artifacts forward",
                  "Agents must stop after producing their output",
                ].map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                    <Shield className="w-3 h-3 text-red-400 shrink-0" />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
