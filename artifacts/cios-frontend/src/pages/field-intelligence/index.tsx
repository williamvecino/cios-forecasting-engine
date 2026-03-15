import { useState } from "react";
import { useListFieldIntelligence, useCreateFieldIntelligence } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button, Input, Select, Label } from "@/components/ui-components";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Eye, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const fieldSchema = z.object({
  brand: z.string().min(1),
  sourceRole: z.string(),
  rawFieldFeedback: z.string().min(10),
  urgencyScore: z.coerce.number().min(1).max(5),
  credibilityScore: z.coerce.number().min(1).max(5),
  ciosSignalDirection: z.enum(["Positive", "Negative"])
});

export default function FieldIntelligence() {
  const [isCreating, setIsCreating] = useState(false);
  const { data: intelligence, isLoading } = useListFieldIntelligence();
  const { mutate: createIntelligence, isPending } = useCreateFieldIntelligence();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof fieldSchema>>({
    resolver: zodResolver(fieldSchema),
    defaultValues: { urgencyScore: 3, credibilityScore: 3, ciosSignalDirection: "Negative" }
  });

  const onSubmit = (data: z.infer<typeof fieldSchema>) => {
    createIntelligence({ data }, {
      onSuccess: () => {
        setIsCreating(false);
        queryClient.invalidateQueries({ queryKey: ["/api/field-intelligence"] });
        form.reset();
      }
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Field Intelligence Inbox</h1>
            <p className="text-muted-foreground mt-1">Raw unstructured signals from field teams.</p>
          </div>
          <Button onClick={() => setIsCreating(!isCreating)} className="gap-2">
            <Plus className="w-4 h-4" /> Log Feedback
          </Button>
        </div>

        {isCreating && (
          <Card className="animate-in slide-in-from-top-4 fade-in duration-300">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Raw Field Feedback</Label>
                  <textarea 
                    className="w-full bg-input border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 h-24"
                    {...form.register("rawFieldFeedback")}
                    placeholder="Exact quote or summary from the field interaction..."
                  />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input {...form.register("brand")} placeholder="e.g. Product A, Brand X" />
                </div>
                <div>
                  <Label>Source Role</Label>
                  <Input {...form.register("sourceRole")} placeholder="e.g. MSL, Rep" />
                </div>
                <div>
                  <Label>Urgency (1-5)</Label>
                  <Select {...form.register("urgencyScore")}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Interpreted Direction</Label>
                  <Select {...form.register("ciosSignalDirection")}>
                    <option value="Positive">Positive</option>
                    <option value="Negative">Negative</option>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save Entry"}</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4">
          {isLoading ? (
            <div className="text-center p-12 text-muted-foreground">Loading inbox...</div>
          ) : intelligence?.map(item => (
            <Card key={item.id} className="relative pl-12">
              <div className="absolute top-6 left-4 text-muted-foreground">
                <Eye className="w-5 h-5" />
              </div>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{item.feedbackId}</Badge>
                  <span className="text-sm font-medium">{item.brand}</span>
                  <span className="text-xs text-muted-foreground">• {item.sourceRole}</span>
                </div>
                <Badge variant={item.ciosSignalDirection === 'Positive' ? 'success' : 'danger'}>
                  {item.ciosSignalDirection}
                </Badge>
              </div>
              <p className="text-foreground text-sm italic mb-4 border-l-2 border-primary/30 pl-4 py-1">"{item.rawFieldFeedback}"</p>
              <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                <div>Urgency: {item.urgencyScore}/5</div>
                <div>Credibility: {item.credibilityScore}/5</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
