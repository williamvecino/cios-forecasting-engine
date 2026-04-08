import { useState, useEffect, useMemo, useRef } from "react";
import { Lightbulb, Plus, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface SignalCompletenessSignal {
  id: string;
  text: string;
}

interface SuggestedSignal {
  text: string;
  rationale: string;
  category: string;
}

export default function SignalCompletenessPanel({
  signals,
  questionText,
  questionType,
  subject,
  onAddSignal,
  missingFamilies,
  indication,
}: {
  signals: SignalCompletenessSignal[];
  questionText: string;
  questionType: string;
  subject: string;
  onAddSignal: (text: string) => void;
  missingFamilies?: string[];
  indication?: string;
}) {
  const [suggestions, setSuggestions] = useState<SuggestedSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [addedTexts, setAddedTexts] = useState<Set<string>>(new Set());

  const signalFingerprint = useMemo(() => {
    return signals.map(s => s.text).sort().join("|").slice(0, 200);
  }, [signals]);

  useEffect(() => {
    setHasGenerated(false);
    setSuggestions([]);
    setAddedTexts(new Set());
  }, [questionText, subject]);

  const generatedFingerprint = useRef("");
  useEffect(() => {
    if (hasGenerated && signalFingerprint !== generatedFingerprint.current) {
      setHasGenerated(false);
    }
  }, [signalFingerprint, hasGenerated]);

  const generateSuggestions = async () => {
    if (signals.length < 2 || !questionText || !subject) return;
    setLoading(true);
    try {
      const API = import.meta.env.VITE_API_URL || "";
      const resp = await fetch(`${API}/api/ai-signals/completeness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          questionType,
          subject,
          existingSignals: signals.map(s => s.text),
          ...(missingFamilies && missingFamilies.length > 0 ? { missingFamilies } : {}),
          ...(indication ? { indication } : {}),
        }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      if (data.suggestions && Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions);
      }
      generatedFingerprint.current = signalFingerprint;
      setHasGenerated(true);
    } catch {
      setSuggestions([]);
      setHasGenerated(true);
    } finally {
      setLoading(false);
    }
  };

  if (signals.length < 2) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-bold text-foreground">Signal Completeness</h2>
          <span className="text-xs text-muted-foreground">Suggested missing signals</span>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <>
          {!hasGenerated && !loading && (
            <button
              type="button"
              onClick={generateSuggestions}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3 text-sm text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/50 transition"
            >
              <Lightbulb className="w-4 h-4" />
              Analyze for Missing Signals
            </button>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground px-2 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              Analyzing signal coverage based on decision type and patterns…
            </div>
          )}

          {hasGenerated && suggestions.length === 0 && !loading && (
            <div className="text-sm text-emerald-400 px-2 py-2">
              Signal coverage appears adequate for this decision type.
            </div>
          )}

          {suggestions.length > 0 && !loading && (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className={`rounded-xl border border-border bg-muted/10 p-3 space-y-1.5 ${addedTexts.has(s.text) ? "opacity-40" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground">{s.text}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{s.rationale}</div>
                    </div>
                    {!addedTexts.has(s.text) && (
                      <button
                        type="button"
                        onClick={() => {
                          onAddSignal(s.text);
                          setAddedTexts(prev => new Set(prev).add(s.text));
                        }}
                        className="shrink-0 flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    )}
                    {addedTexts.has(s.text) && (
                      <span className="text-[10px] text-emerald-400 font-medium shrink-0">Added</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[9px] text-muted-foreground uppercase tracking-wider">
                      {s.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
