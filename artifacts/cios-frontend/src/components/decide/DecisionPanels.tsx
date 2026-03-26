import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import DecisionRoadmapCard from "@/components/decision-roadmap-card";
import type { Subsegment } from "@/components/decision-roadmap-card";
import { useActiveQuestion } from "@/hooks/use-active-question";

type PanelDef = {
  title: string;
  purpose: string;
  output: string;
  subsegments: Subsegment[];
};

const panels: PanelDef[] = [
  {
    title: "Adoption Segmentation",
    purpose: "Identify who will move first and how segments behave.",
    output: "Who moves first, second, and later",
    subsegments: [
      { name: "Early Adopters", description: "Segments most likely to move first.", status: "Coming Next" },
      { name: "Persuadables", description: "Segments likely to adopt with targeted intervention.", status: "Coming Next" },
      { name: "Late Movers", description: "Segments that adopt after proof accumulates.", status: "Coming Next" },
      { name: "Resistant Segments", description: "Segments unlikely to move without structural change.", status: "Coming Next" },
    ],
  },
  {
    title: "Barrier Diagnosis",
    purpose: "Identify what is blocking adoption.",
    output: "What is blocking movement now",
    subsegments: [
      { name: "Evidence Barrier", description: "Clinical confidence or data sufficiency concerns.", status: "Coming Next" },
      { name: "Access Barrier", description: "Coverage, reimbursement, or pathway restrictions.", status: "Coming Next" },
      { name: "Workflow Barrier", description: "Operational or implementation friction.", status: "Coming Next" },
      { name: "Competitive Barrier", description: "Entrenched alternatives or defensive positioning.", status: "Coming Next" },
    ],
  },
  {
    title: "Readiness Timeline",
    purpose: "Determine when the market can realistically shift.",
    output: "When change is realistically achievable",
    subsegments: [
      { name: "Near-Term Readiness", description: "Likelihood of change in the immediate horizon.", status: "Coming Next" },
      { name: "Trigger Events", description: "Events that could accelerate adoption.", status: "Coming Next" },
      { name: "Dependencies", description: "Conditions required before adoption occurs.", status: "Coming Next" },
      { name: "Timing Risks", description: "Factors that could delay adoption.", status: "Coming Next" },
    ],
  },
  {
    title: "Competitive Risk",
    purpose: "Assess how competitors are likely to respond.",
    output: "What competitive responses should be expected",
    subsegments: [
      { name: "Incumbent Defense", description: "Actions to protect existing share.", status: "Coming Next" },
      { name: "Fast Follower Risk", description: "Speed of competitive replication.", status: "Coming Next" },
      { name: "Access Response", description: "Competitive payer or contracting actions.", status: "Coming Next" },
      { name: "Evidence Response", description: "Publication or data counter-messaging.", status: "Coming Next" },
    ],
  },
  {
    title: "Growth Feasibility",
    purpose: "Evaluate whether expansion can translate into revenue.",
    output: "Whether growth can translate into revenue",
    subsegments: [
      { name: "Segment Size", description: "Total reachable population.", status: "Coming Next" },
      { name: "Access Expansion", description: "Coverage or channel growth potential.", status: "Coming Next" },
      { name: "Operational Scalability", description: "Ability to deliver at scale.", status: "Coming Next" },
      { name: "Revenue Translation", description: "Likelihood that adoption converts into revenue.", status: "Coming Next" },
    ],
  },
];

export default function DecisionPanels() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();

  return (
    <WorkflowLayout
      currentStep="decide"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate
        activeQuestion={activeQuestion}
        title="An active question is required"
        body="Decision tools should only activate once a question and forecast context exist."
      >
        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Step 4
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              What action should we take?
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              This step holds the commercial decision layer. Keep it action-oriented.
              Show what the system will help decide, without exposing unfinished internal modules as if they were live.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Primary decision panels
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Visible roadmap for the next major commercial layers.
                </div>
              </div>

              <span className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                Structural placeholders only
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {panels.map((panel) => (
                <DecisionRoadmapCard
                  key={panel.title}
                  title={panel.title}
                  body={panel.purpose}
                  status="coming_next"
                  output={panel.output}
                  subsegments={panel.subsegments}
                />
              ))}

              <DecisionRoadmapCard
                title="Actors / Segments"
                body="Advanced layer for defined market-research actors, segment reaction scoring, and later simulation workflows."
                status="advanced"
                advanced
                output="How defined actors may react under different scenarios"
                subsegments={[
                  { name: "Segment Definitions", description: "Named actor groups with behavior rules.", status: "Planned" },
                  { name: "Reaction Logic", description: "How segments respond to campaigns and signals.", status: "Planned" },
                  { name: "Scenario Simulation", description: "Run what-if models across actor networks.", status: "Planned" },
                ]}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-semibold text-foreground">Current rule</div>
            <div className="mt-2 text-sm text-muted-foreground">
              These panels are intentionally visible now so the workflow feels complete,
              but they are not presented as active analytical outputs until each layer is built.
            </div>
          </div>
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}
