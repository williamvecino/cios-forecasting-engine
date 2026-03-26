import { useState } from "react";
import { Link } from "wouter";
import { Pencil, Check, X } from "lucide-react";
import MiniCurve from "./mini-curve";
import type { TrendState } from "./mini-curve";
import DriverIcons from "./driver-icons";
import type { DriverType } from "./driver-icons";
import type { CaseCardData } from "@/lib/case-library";

interface Props {
  data: CaseCardData;
  onUpdate: (caseId: string, updates: Partial<CaseCardData>) => void;
}

export default function CaseCard({ data, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [editProb, setEditProb] = useState(
    (data.probability * 100).toFixed(0)
  );
  const [editBase, setEditBase] = useState(
    (data.baseScenario * 100).toFixed(0)
  );
  const [editUpside, setEditUpside] = useState(
    (data.upsideScenario * 100).toFixed(0)
  );
  const [editDownside, setEditDownside] = useState(
    (data.downsideScenario * 100).toFixed(0)
  );
  const [editSuggestion, setEditSuggestion] = useState(data.suggestion);
  const [editStatus, setEditStatus] = useState(data.status);

  function handleSave() {
    onUpdate(data.caseId, {
      probability: parseFloat(editProb) / 100,
      baseScenario: parseFloat(editBase) / 100,
      upsideScenario: parseFloat(editUpside) / 100,
      downsideScenario: parseFloat(editDownside) / 100,
      suggestion: editSuggestion,
      status: editStatus,
    });
    setEditing(false);
  }

  function handleCancel() {
    setEditProb((data.probability * 100).toFixed(0));
    setEditBase((data.baseScenario * 100).toFixed(0));
    setEditUpside((data.upsideScenario * 100).toFixed(0));
    setEditDownside((data.downsideScenario * 100).toFixed(0));
    setEditSuggestion(data.suggestion);
    setEditStatus(data.status);
    setEditing(false);
  }

  const statusColor =
    data.status === "Active"
      ? "bg-emerald-500/15 text-emerald-300"
      : data.status === "Escalated"
      ? "bg-red-500/15 text-red-300"
      : data.status === "Watch"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-muted/30 text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 group relative">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary">{data.caseId}</span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor}`}
            >
              {editing ? (
                <input
                  type="text"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-20 bg-transparent border-none outline-none text-inherit"
                />
              ) : (
                data.status
              )}
            </span>
          </div>
          <div className="mt-1.5 text-sm font-medium text-foreground line-clamp-2 leading-snug">
            {data.strategicQuestion}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <MiniCurve trend={data.trend} className="w-16 h-7" />
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/20 hover:text-foreground transition opacity-0 group-hover:opacity-100"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg border border-emerald-500/30 p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition"
                title="Save"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/20 transition"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ScenarioCell
          label="Base"
          value={data.baseScenario}
          editing={editing}
          editValue={editBase}
          onEditChange={setEditBase}
          color="text-primary"
        />
        <ScenarioCell
          label="Upside"
          value={data.upsideScenario}
          editing={editing}
          editValue={editUpside}
          onEditChange={setEditUpside}
          color="text-emerald-400"
        />
        <ScenarioCell
          label="Downside"
          value={data.downsideScenario}
          editing={editing}
          editValue={editDownside}
          onEditChange={setEditDownside}
          color="text-red-400"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <DriverIcons drivers={data.drivers} />
        <div className="text-[11px] text-muted-foreground">
          {new Date(data.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>

      <div className="rounded-lg bg-muted/10 border border-border/50 px-3 py-2">
        {editing ? (
          <input
            type="text"
            value={editSuggestion}
            onChange={(e) => setEditSuggestion(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-xs text-foreground/80 placeholder:text-muted-foreground"
            placeholder="System suggestion..."
          />
        ) : (
          <div className="text-xs text-muted-foreground italic">
            {data.suggestion}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        {editing ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Probability:</span>
            <input
              type="number"
              min="0"
              max="100"
              value={editProb}
              onChange={(e) => setEditProb(e.target.value)}
              className="w-14 rounded-md border border-border bg-muted/10 px-2 py-1 text-xs text-foreground outline-none"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        ) : (
          <div className="text-lg font-bold text-primary font-mono">
            {(data.probability * 100).toFixed(1)}%
          </div>
        )}
        <Link
          href={`/case/${data.caseId}/question`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted/20 transition"
        >
          Open
        </Link>
      </div>
    </div>
  );
}

function ScenarioCell({
  label,
  value,
  editing,
  editValue,
  onEditChange,
  color,
}: {
  label: string;
  value: number;
  editing: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-muted/10 border border-border/50 px-3 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      {editing ? (
        <div className="mt-1 flex items-center justify-center gap-0.5">
          <input
            type="number"
            min="0"
            max="100"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            className="w-10 bg-transparent border-none outline-none text-center text-sm font-semibold text-foreground"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      ) : (
        <div className={`mt-1 text-sm font-semibold ${color}`}>
          {(value * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}
