import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import DecisionRoadmapCard from "@/components/decision-roadmap-card";

export default function DecidePage() {
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
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Step 4
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            What action should we take?
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            This step will hold the commercial decision panels. The primary view
            should stay action-oriented, not module-oriented.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DecisionRoadmapCard
              title="Adoption Segmentation"
              body="Who is likely to move first and when."
              status="planned"
              inputs={["Posterior probability", "Signal evidence", "Actor profiles"]}
              output="Ranked adopter segments with timing estimates."
            />
            <DecisionRoadmapCard
              title="Barrier Diagnosis"
              body="What is blocking adoption or behavior change."
              status="planned"
              inputs={["Negative signals", "Market context", "Competitive landscape"]}
              output="Prioritized list of adoption barriers with severity."
            />
            <DecisionRoadmapCard
              title="Readiness Timeline"
              body="When the market can realistically shift."
              status="planned"
              inputs={["Forecast trajectory", "Event calendar", "Regulatory signals"]}
              output="Month-by-month readiness assessment with milestones."
            />
            <DecisionRoadmapCard
              title="Competitive Risk"
              body="What competitors are likely to do next."
              status="planned"
              inputs={["Competitor signals", "Market share data", "Pipeline intelligence"]}
              output="Competitive threat matrix with response options."
            />
            <DecisionRoadmapCard
              title="Growth Feasibility"
              body="Whether expansion can translate into revenue."
              status="planned"
              inputs={["Adoption forecast", "Market sizing", "Resource constraints"]}
              output="Go/no-go recommendation with confidence interval."
            />
            <DecisionRoadmapCard
              title="Actors / Segments"
              body="Advanced layer for market-research simulation and later reaction testing."
              status="advanced"
              advanced
              inputs={["Actor network graph", "Influence mapping", "Simulation engine"]}
              output="Agent-based scenario outcomes."
            />
          </div>
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}
