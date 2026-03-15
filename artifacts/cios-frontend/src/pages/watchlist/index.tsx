import { useListWatchlist } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { Radio, Plus } from "lucide-react";

export default function Watchlist() {
  const { data: items, isLoading } = useListWatchlist();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Signal Radar Watchlist</h1>
            <p className="text-muted-foreground mt-1">Pending events and data readouts under monitoring.</p>
          </div>
          <Button className="gap-2"><Plus className="w-4 h-4"/> Track Event</Button>
        </div>

        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">Event Name</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Expected Window</th>
                  <th className="px-6 py-4 font-semibold">Direction</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Scanning radar...</td></tr>
                ) : items?.map(item => (
                  <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{item.signalName}</td>
                    <td className="px-6 py-4"><Badge variant="default">{item.signalType}</Badge></td>
                    <td className="px-6 py-4 text-muted-foreground">{item.expectedWindow || 'TBD'}</td>
                    <td className="px-6 py-4">
                      {item.expectedDirection ? (
                        <Badge variant={item.expectedDirection === 'Positive' ? 'success' : 'danger'}>{item.expectedDirection}</Badge>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>
                        <span className="text-xs font-medium uppercase tracking-wider">{item.status || 'Monitoring'}</span>
                      </div>
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
