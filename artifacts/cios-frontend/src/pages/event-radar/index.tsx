import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { Radar, Plus } from "lucide-react";
import WorkflowIndicator from "@/components/workflow-indicator";
import DataFlowBox from "@/components/data-flow-box";
import { moduleMeta } from "@/lib/module-meta";

const events = [
  {
    name: "Society guideline update",
    type: "Regulatory / clinical",
    window: "Next major society congress",
    direction: "Positive",
    status: "Pending",
  },
  {
    name: "Payer coverage expansion",
    type: "Commercial / access",
    window: "Next 6 months",
    direction: "Positive",
    status: "Pending",
  },
  {
    name: "Confirmatory trial data readout",
    type: "Clinical evidence",
    window: "Q4 current year",
    direction: "Positive",
    status: "Pending",
  },
  {
    name: "Competitor label expansion",
    type: "Competitive",
    window: "6–12 months",
    direction: "Negative",
    status: "Pending",
  },
];

export default function EventRadarPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
              <Radar className="w-6 h-6 text-primary" />
              Event Radar
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track upcoming events that could generate future signals and affect adoption forecasts.
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Track Event
          </Button>
        </div>

        <WorkflowIndicator current={moduleMeta["event-radar"].workflowStep} />
        <DataFlowBox
          purpose={moduleMeta["event-radar"].purpose}
          input={moduleMeta["event-radar"].input}
          output={moduleMeta["event-radar"].output}
        />

        <Card noPadding>
          <div className="overflow-hidden rounded-2xl">
            <table className="min-w-full text-left">
              <thead className="bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-4 font-semibold">Event</th>
                  <th className="px-5 py-4 font-semibold">Type</th>
                  <th className="px-5 py-4 font-semibold">Expected Window</th>
                  <th className="px-5 py-4 font-semibold">Direction</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <tr key={event.name} className="hover:bg-muted/10 transition-colors">
                    <td className="px-5 py-4 text-sm text-foreground font-medium">{event.name}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{event.type}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{event.window}</td>
                    <td className="px-5 py-4 text-sm">
                      <Badge variant={event.direction === "Positive" ? "success" : "danger"}>
                        {event.direction}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-sm">
                      <Badge variant="warning">{event.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
