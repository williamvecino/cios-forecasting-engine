export type RoadmapStatus = "planned" | "in_build" | "advanced" | "coming_next";

export type Subsegment = {
  name: string;
  description: string;
  status: "Planned" | "In Build" | "Coming Next";
};

interface Props {
  title: string;
  body: string;
  status?: RoadmapStatus;
  inputs?: string[];
  output?: string;
  advanced?: boolean;
  subsegments?: Subsegment[];
}

function getStatusLabel(status: RoadmapStatus) {
  switch (status) {
    case "in_build":
      return "In Build";
    case "advanced":
      return "Advanced";
    case "coming_next":
      return "Coming Next";
    case "planned":
    default:
      return "Planned";
  }
}

function getStatusClasses(status: RoadmapStatus) {
  switch (status) {
    case "in_build":
      return "bg-blue-500/15 text-blue-300 border-blue-500/20";
    case "advanced":
      return "bg-muted/30 text-muted-foreground border-border";
    case "coming_next":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
    case "planned":
    default:
      return "bg-amber-500/15 text-amber-300 border-amber-500/20";
  }
}

function getSubStatusClasses(status: Subsegment["status"]) {
  switch (status) {
    case "In Build":
      return "text-blue-400";
    case "Coming Next":
      return "text-emerald-400";
    case "Planned":
    default:
      return "text-amber-400";
  }
}

export default function DecisionRoadmapCard({
  title,
  body,
  status = "planned",
  inputs = [],
  output,
  advanced = false,
  subsegments = [],
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>

        <div className="flex flex-wrap items-center gap-2">
          {advanced && (
            <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Advanced
            </span>
          )}

          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getStatusClasses(
              status
            )}`}
          >
            {getStatusLabel(status)}
          </span>
        </div>
      </div>

      <div className="mt-2 text-sm text-muted-foreground">{body}</div>

      {subsegments.length > 0 && (
        <div className="mt-4 space-y-2">
          {subsegments.map((sub) => (
            <div
              key={sub.name}
              className="rounded-lg border border-border/50 bg-muted/5 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold text-foreground/90">{sub.name}</div>
                <span className={`text-[10px] font-semibold ${getSubStatusClasses(sub.status)}`}>
                  {sub.status}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{sub.description}</div>
            </div>
          ))}
        </div>
      )}

      {(inputs.length > 0 || output) && (
        <div className="mt-4 space-y-3">
          {inputs.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                Inputs
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {inputs.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-muted/20 px-3 py-1 text-xs text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {output && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                Decision Answer
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{output}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
