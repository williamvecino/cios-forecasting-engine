import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "";

interface CompRisk {
  id: string;
  competitiveRiskId: string;
  caseId: string;
  segmentId: string | null;
  segmentName: string | null;
  riskName: string;
  riskCategory: string;
  riskStrength: number;
  riskConfidence: string;
  riskScope: string | null;
  primarySignals: string;
  counterSignals: string;
  threatMechanism: string | null;
  whyItMatters: string | null;
  structuralVsEmerging: string;
  estimatedForecastImpact: number | null;
  priorityRank: number | null;
  priorityClass: string | null;
  rationaleSummary: string | null;
  signalCount: number | null;
  counterSignalCount: number | null;
  derivedFrom: string | null;
}

interface CaseOption {
  caseId: string;
  question: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high_impact_structural: "#ef4444",
  high_impact_emerging: "#f97316",
  segment_specific: "#eab308",
  watch_list: "#6b7280",
  downstream_echo: "#4b5563",
};

const PRIORITY_LABELS: Record<string, string> = {
  high_impact_structural: "High-Impact Structural",
  high_impact_emerging: "High-Impact Emerging",
  segment_specific: "Segment-Specific",
  watch_list: "Watch List",
  downstream_echo: "Downstream Echo",
};

const SE_LABELS: Record<string, string> = {
  structural: "Structural",
  emerging: "Emerging",
  watch_list: "Watch List",
};

const SE_COLORS: Record<string, string> = {
  structural: "#ef4444",
  emerging: "#f97316",
  watch_list: "#6b7280",
};

const CATEGORY_SHORT: Record<string, string> = {
  incumbent_entrenchment: "Incumbency",
  superior_differentiation: "Differentiation",
  guideline_lockout: "Guideline Lock",
  access_disadvantage: "Access Gap",
  field_force_disadvantage: "Field Force",
  kol_advocacy_capture: "KOL Capture",
  workflow_preference: "Workflow Pref",
  category_crowding: "Crowding",
  evidence_acceleration: "Evidence Accel",
  pricing_contracting: "Pricing",
  channel_account_control: "Channel Ctrl",
  switching_inertia: "Switching Inertia",
};

export default function CompetitiveRiskPage() {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [caseId, setCaseId] = useState("");
  const [risks, setRisks] = useState<CompRisk[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overall" | "segment">("overall");

  useEffect(() => {
    fetch(`${API}/api/cases`)
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d) ? d : d.cases || [];
        setCases(arr.map((c: any) => ({ caseId: c.caseId, question: c.question })));
        if (arr.length > 0) setCaseId(arr[0].caseId);
      })
      .catch(() => {});
  }, []);

  const fetchExisting = useCallback(async (id: string) => {
    const r = await fetch(`${API}/api/cases/${id}/competitive-risk`);
    const d = await r.json();
    if (Array.isArray(d) && d.length > 0) {
      setRisks(d);
      setGenerated(true);
    } else {
      setRisks([]);
      setGenerated(false);
    }
  }, []);

  useEffect(() => {
    if (caseId) fetchExisting(caseId);
  }, [caseId, fetchExisting]);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/cases/${caseId}/competitive-risk/generate`, { method: "POST" });
      if (!r.ok) {
        const e = await r.json();
        alert(e.error || "Generation failed");
        return;
      }
      await fetchExisting(caseId);
    } catch {
      alert("Error generating competitive risk analysis");
    } finally {
      setLoading(false);
    }
  };

  const overallRisks = risks.filter(r => !r.segmentId);
  const segmentRisks = risks.filter(r => r.segmentId);
  const segments = [...new Set(segmentRisks.map(r => r.segmentName).filter(Boolean))] as string[];

  const structuralCount = overallRisks.filter(r => r.structuralVsEmerging === "structural").length;
  const emergingCount = overallRisks.filter(r => r.structuralVsEmerging === "emerging").length;
  const watchCount = overallRisks.filter(r => r.structuralVsEmerging === "watch_list").length;

  const topRisk = overallRisks[0];

  const avgStrength = overallRisks.length > 0
    ? overallRisks.reduce((s, r) => s + r.riskStrength, 0) / overallRisks.length
    : 0;

  const catData = Object.entries(
    overallRisks.reduce<Record<string, number>>((acc, r) => {
      const k = CATEGORY_SHORT[r.riskCategory] || r.riskCategory;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const strengthData = overallRisks
    .slice(0, 8)
    .map(r => ({
      name: (CATEGORY_SHORT[r.riskCategory] || r.riskCategory).slice(0, 15),
      strength: Number((r.riskStrength * 100).toFixed(1)),
      fill: PRIORITY_COLORS[r.priorityClass || "watch_list"] || "#6b7280",
    }));

  const parseSignals = (json: string | null) => {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  };

  return (
    <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto", color: "#e0e0e0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Link href="/" style={{ color: "#999", textDecoration: "none", fontSize: 18 }}>←</Link>
        <span style={{ fontSize: 24 }}>⚔️</span>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Competitive Risk</h1>
      </div>
      <p style={{ color: "#999", margin: "0 0 20px", fontSize: 14 }}>
        Where competitive forces could prevent, delay, compress, or reverse adoption.
        Derived from forecast, segments, barriers, readiness, and dependency-controlled signals.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Case</label>
          <select
            value={caseId}
            onChange={e => setCaseId(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", background: "#1e293b", color: "#e0e0e0",
              border: "1px solid #334155", borderRadius: 6, fontSize: 14,
            }}
          >
            {cases.map(c => (
              <option key={c.caseId} value={c.caseId}>
                {c.caseId}: {c.question?.slice(0, 80)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={generate}
          disabled={loading || !caseId}
          style={{
            padding: "10px 20px", background: "#0891b2", color: "#fff", border: "none",
            borderRadius: 6, cursor: loading ? "wait" : "pointer", fontWeight: 600,
            fontSize: 14, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {loading ? "⏳ Generating…" : "🔄 Generate Risk Analysis"}
        </button>
      </div>

      {!generated && (
        <div style={{
          padding: 48, textAlign: "center", border: "1px dashed #334155",
          borderRadius: 8, color: "#666",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
          <div style={{ fontWeight: 600 }}>No competitive risk analysis generated yet.</div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
            Generate adoption segments, barriers, and readiness timeline first, then generate competitive risk.
          </div>
        </div>
      )}

      {generated && (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12, marginBottom: 20,
          }}>
            <SummaryCard label="Total Risks" value={overallRisks.length} />
            <SummaryCard label="Structural" value={structuralCount} color="#ef4444" />
            <SummaryCard label="Emerging" value={emergingCount} color="#f97316" />
            <SummaryCard label="Watch List" value={watchCount} color="#6b7280" />
            <SummaryCard label="Avg Intensity" value={`${(avgStrength * 100).toFixed(0)}%`} />
          </div>

          {topRisk && (
            <div style={{
              padding: 16, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8, marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, color: "#f87171", fontWeight: 600, marginBottom: 4 }}>
                TOP COMPETITIVE RISK
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                {CATEGORY_SHORT[topRisk.riskCategory] || topRisk.riskCategory}
              </div>
              <div style={{ fontSize: 13, color: "#ccc", marginBottom: 6 }}>
                {topRisk.threatMechanism?.slice(0, 200)}
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#999" }}>
                <span>Strength: <strong style={{ color: "#f87171" }}>{(topRisk.riskStrength * 100).toFixed(0)}%</strong></span>
                <span>Impact: <strong>{((topRisk.estimatedForecastImpact ?? 0) * 100).toFixed(1)}pp</strong></span>
                <span>Confidence: <strong>{topRisk.riskConfidence}</strong></span>
                <span style={{ color: SE_COLORS[topRisk.structuralVsEmerging] }}>
                  {SE_LABELS[topRisk.structuralVsEmerging] || topRisk.structuralVsEmerging}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{
              background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#94a3b8" }}>
                Risk Intensity by Category
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={strengthData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#666" }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "#999" }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 4, fontSize: 12, color: "#e0e0e0" }}
                    formatter={(v: number) => [`${v}%`, "Intensity"]}
                  />
                  <Bar dataKey="strength" radius={[0, 4, 4, 0]}>
                    {strengthData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{
              background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#94a3b8" }}>
                Category Distribution
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={catData} margin={{ left: 0, right: 10 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#999" }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: "#666" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 4, fontSize: 12, color: "#e0e0e0" }}
                  />
                  <Bar dataKey="count" fill="#0891b2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <TabButton active={viewMode === "overall"} onClick={() => setViewMode("overall")}>
              Overall Risks ({overallRisks.length})
            </TabButton>
            <TabButton active={viewMode === "segment"} onClick={() => setViewMode("segment")}>
              By Segment ({segments.length})
            </TabButton>
          </div>

          {viewMode === "overall" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {overallRisks.map(risk => (
                <RiskCard
                  key={risk.id}
                  risk={risk}
                  expanded={expanded === risk.id}
                  onToggle={() => setExpanded(expanded === risk.id ? null : risk.id)}
                  parseSignals={parseSignals}
                />
              ))}
            </div>
          )}

          {viewMode === "segment" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {segments.map(seg => {
                const segRs = segmentRisks
                  .filter(r => r.segmentName === seg)
                  .sort((a, b) => (a.priorityRank ?? 99) - (b.priorityRank ?? 99));
                return (
                  <div key={seg}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px", color: "#94a3b8" }}>
                      {seg}
                      <span style={{ fontWeight: 400, fontSize: 12, color: "#666", marginLeft: 8 }}>
                        {segRs.length} risk{segRs.length !== 1 ? "s" : ""}
                      </span>
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 12 }}>
                      {segRs.map(risk => (
                        <RiskCard
                          key={risk.id}
                          risk={risk}
                          expanded={expanded === risk.id}
                          onToggle={() => setExpanded(expanded === risk.id ? null : risk.id)}
                          parseSignals={parseSignals}
                        />
                      ))}
                      {segRs.length === 0 && (
                        <div style={{ color: "#555", fontSize: 13, fontStyle: "italic" }}>
                          No competitive risks detected for this segment.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 24 }}>
            <Link href="/" style={{ color: "#0891b2", textDecoration: "none", fontSize: 14 }}>
              ← Back to Forecast
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#e0e0e0" }}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px", fontSize: 13, fontWeight: active ? 600 : 400,
        background: active ? "#1e293b" : "transparent",
        color: active ? "#e0e0e0" : "#64748b",
        border: active ? "1px solid #334155" : "1px solid transparent",
        borderRadius: 6, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function RiskCard({
  risk, expanded, onToggle, parseSignals,
}: {
  risk: CompRisk; expanded: boolean; onToggle: () => void;
  parseSignals: (j: string | null) => any[];
}) {
  const pColor = PRIORITY_COLORS[risk.priorityClass || "watch_list"] || "#6b7280";
  const primary = parseSignals(risk.primarySignals);
  const counter = parseSignals(risk.counterSignals);

  return (
    <div
      style={{
        background: "#0f172a", border: `1px solid ${expanded ? pColor + "55" : "#1e293b"}`,
        borderRadius: 8, overflow: "hidden",
      }}
    >
      <div
        onClick={onToggle}
        style={{
          padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{
          width: 4, height: 36, borderRadius: 2, background: pColor, flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {CATEGORY_SHORT[risk.riskCategory] || risk.riskCategory}
            </span>
            <span style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 4,
              background: SE_COLORS[risk.structuralVsEmerging] + "22",
              color: SE_COLORS[risk.structuralVsEmerging] || "#999",
              fontWeight: 600,
            }}>
              {SE_LABELS[risk.structuralVsEmerging] || risk.structuralVsEmerging}
            </span>
            <span style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 4,
              background: pColor + "22", color: pColor, fontWeight: 600,
            }}>
              {PRIORITY_LABELS[risk.priorityClass || ""] || risk.priorityClass}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {risk.threatMechanism?.slice(0, 100)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, flexShrink: 0, fontSize: 12, color: "#999" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>Intensity</div>
            <div style={{ fontWeight: 700, color: pColor }}>{(risk.riskStrength * 100).toFixed(0)}%</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>Impact</div>
            <div style={{ fontWeight: 700 }}>{((risk.estimatedForecastImpact ?? 0) * 100).toFixed(1)}pp</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>Conf</div>
            <div style={{ fontWeight: 600 }}>{risk.riskConfidence}</div>
          </div>
        </div>
        <span style={{ color: "#555", fontSize: 14 }}>{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #1e293b" }}>
          <div style={{ padding: "12px 0" }}>
            <Section title="Threat Mechanism">
              {risk.threatMechanism}
            </Section>

            <Section title="Why It Matters">
              {risk.whyItMatters}
            </Section>

            <Section title="Rationale">
              {risk.rationaleSummary}
            </Section>

            {primary.length > 0 && (
              <Section title={`Supporting Signals (${primary.length})`}>
                {primary.map((s: any, i: number) => (
                  <div key={i} style={{
                    fontSize: 12, padding: "6px 0",
                    borderBottom: i < primary.length - 1 ? "1px solid #1e293b" : "none",
                  }}>
                    <span style={{ color: "#ef4444" }}>▼</span>{" "}
                    <span style={{ color: "#ccc" }}>{s.description}</span>
                    <span style={{ color: "#666", marginLeft: 8 }}>
                      LR: {s.likelihoodRatio?.toFixed(2)} · {s.type} · {s.direction}
                    </span>
                  </div>
                ))}
              </Section>
            )}

            {counter.length > 0 && (
              <Section title={`Counter-Signals (${counter.length})`}>
                {counter.map((s: any, i: number) => (
                  <div key={i} style={{
                    fontSize: 12, padding: "6px 0",
                    borderBottom: i < counter.length - 1 ? "1px solid #1e293b" : "none",
                  }}>
                    <span style={{ color: "#22c55e" }}>▲</span>{" "}
                    <span style={{ color: "#ccc" }}>{s.description}</span>
                    <span style={{ color: "#666", marginLeft: 8 }}>
                      LR: {s.likelihoodRatio?.toFixed(2)} · {s.type} · {s.direction}
                    </span>
                  </div>
                ))}
              </Section>
            )}

            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#64748b" }}>
              <span>Scope: {risk.riskScope}</span>
              <span>Signals: {risk.signalCount}</span>
              <span>Counter: {risk.counterSignalCount}</span>
              {risk.segmentName && <span>Segment: {risk.segmentName}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}
