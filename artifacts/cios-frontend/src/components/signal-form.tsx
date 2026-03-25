import { useMemo, useState } from "react";
import type { SignalRecord } from "../types/forecast";
import {
  type CoreSignalType,
  SIGNAL_TYPE_ORDER,
  getSignalTypeLabel,
  getSubtypesForType,
} from "../lib/signal-taxonomy";
import { Card, Button, Input, Select, Label } from "./ui-components";

type Props = {
  caseId: string;
  onSave: (signal: SignalRecord) => void;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function SignalForm({ caseId, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [signalType, setSignalType] = useState<CoreSignalType>("REGULATORY_CLINICAL");
  const [signalSubtype, setSignalSubtype] = useState<string>("");
  const [direction, setDirection] = useState<"positive" | "negative" | "neutral">("neutral");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [actor, setActor] = useState("");
  const [strengthScore, setStrengthScore] = useState("0.50");
  const [reliabilityScore, setReliabilityScore] = useState("0.50");
  const [independenceScore, setIndependenceScore] = useState("0.50");
  const [notes, setNotes] = useState("");

  const subtypeOptions = useMemo(() => getSubtypesForType(signalType), [signalType]);

  function resetSubtypeIfInvalid(nextType: CoreSignalType) {
    const valid = getSubtypesForType(nextType).map((x) => x.value);
    if (!valid.includes(signalSubtype as any)) {
      setSignalSubtype("");
    }
  }

  function handleTypeChange(nextType: CoreSignalType) {
    setSignalType(nextType);
    resetSubtypeIfInvalid(nextType);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();

    const signal: SignalRecord = {
      id: `sig_${uid()}`,
      caseId,
      createdAt: new Date().toISOString(),
      title: title.trim(),
      description: description.trim(),
      signalType,
      signalSubtype: signalSubtype ? (signalSubtype as any) : undefined,
      direction,
      source: source.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      actor: actor.trim() || undefined,
      strengthScore: Number(strengthScore),
      reliabilityScore: Number(reliabilityScore),
      independenceScore: Number(independenceScore),
      notes: notes.trim() || undefined,
      isCalibrationRelevant: true,
      observedOutcomeLinked: false,
    };

    onSave(signal);

    setTitle("");
    setDescription("");
    setSignalSubtype("");
    setDirection("neutral");
    setSource("");
    setSourceUrl("");
    setActor("");
    setStrengthScore("0.50");
    setReliabilityScore("0.50");
    setIndependenceScore("0.50");
    setNotes("");
  }

  return (
    <Card>
      <form onSubmit={handleSave} className="space-y-4">
        <h3 className="text-lg font-bold text-foreground">Add Signal</h3>

        <div className="space-y-1.5">
          <Label>Signal title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Brief signal title..." />
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <textarea
            className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px] resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            required
            placeholder="Describe the signal and its implications..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Signal type</Label>
            <Select
              value={signalType}
              onChange={(e) => handleTypeChange(e.target.value as CoreSignalType)}
            >
              {SIGNAL_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {getSignalTypeLabel(type)}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Subtype</Label>
            <Select
              value={signalSubtype}
              onChange={(e) => setSignalSubtype(e.target.value)}
            >
              <option value="">Select subtype</option>
              {subtypeOptions.map((sub) => (
                <option key={sub.value} value={sub.value}>
                  {sub.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <Select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "positive" | "negative" | "neutral")}
            >
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
              <option value="neutral">Neutral</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Strength (0–1)</Label>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={strengthScore}
              onChange={(e) => setStrengthScore(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Reliability (0–1)</Label>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={reliabilityScore}
              onChange={(e) => setReliabilityScore(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Independence (0–1)</Label>
          <Input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={independenceScore}
            onChange={(e) => setIndependenceScore(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Actor</Label>
            <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="e.g., KOL, Payer" />
          </div>

          <div className="space-y-1.5">
            <Label>Source</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g., NEJM 2025" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Source URL</Label>
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <textarea
            className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px] resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal notes..."
          />
        </div>

        <Button type="submit" variant="primary">
          Save signal
        </Button>
      </form>
    </Card>
  );
}
