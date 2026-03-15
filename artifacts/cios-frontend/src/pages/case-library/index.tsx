import { useListCaseLibrary } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { Library, Search } from "lucide-react";

export default function CaseLibrary() {
  const { data: analogs, isLoading } = useListCaseLibrary();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Historical Case Library</h1>
            <p className="text-muted-foreground mt-1">Reference database for analog retrieval matching.</p>
          </div>
          <Button className="gap-2">Add Analog Case</Button>
        </div>

        <Card noPadding>
          <div className="p-4 border-b border-border flex items-center gap-3 bg-muted/10">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search historical analogs..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">Case ID</th>
                  <th className="px-6 py-4 font-semibold">Therapy Area</th>
                  <th className="px-6 py-4 font-semibold">Product Type</th>
                  <th className="px-6 py-4 font-semibold">Outcome</th>
                  <th className="px-6 py-4 font-semibold text-right">Probability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Loading library...</td></tr>
                ) : analogs?.map(caseItem => (
                  <tr key={caseItem.id} className="hover:bg-muted/10 transition-colors cursor-pointer">
                    <td className="px-6 py-4 font-mono text-xs font-medium text-primary">{caseItem.caseId}</td>
                    <td className="px-6 py-4">{caseItem.therapyArea}</td>
                    <td className="px-6 py-4">
                      <Badge variant="default">{caseItem.productType}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground truncate block max-w-[200px]">{caseItem.finalObservedOutcome || 'Pending'}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      {caseItem.finalProbability ? `${(caseItem.finalProbability * 100).toFixed(1)}%` : '-'}
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
