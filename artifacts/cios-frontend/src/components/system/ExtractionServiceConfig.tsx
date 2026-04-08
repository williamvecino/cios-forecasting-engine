import { useState, useEffect } from "react";
import { Loader2, Check, X, Globe, Plug, Unplug } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface ServiceStatus {
  configured: boolean;
  url: string | null;
  status: "connected" | "unreachable" | "not_configured";
  service?: string;
  message?: string;
}

export default function ExtractionServiceConfig() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputUrl, setInputUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/extraction-service/status`);
      if (resp.ok) {
        const data: ServiceStatus = await resp.json();
        setStatus(data);
        if (data.url) setInputUrl(data.url);
      }
    } catch {
      setStatus({ configured: false, url: null, status: "not_configured" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { checkStatus(); }, []);

  const saveUrl = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const resp = await fetch(`${API}/api/extraction-service/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl.trim() }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setMessage(data.message || "Saved.");
        await checkStatus();
      } else {
        setMessage(data.error || "Failed to save.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const clearUrl = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/extraction-service/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "" }),
      });
      setInputUrl("");
      setMessage("Extraction service disconnected.");
      await checkStatus();
    } catch {} finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking extraction service...
        </div>
      </div>
    );
  }

  const isConnected = status?.status === "connected";
  const isConfigured = status?.configured;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            Document Extraction Service
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            External service for PDF, SEC EDGAR, and complex HTML extraction. Run the Colab notebook to start the service.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
              <Plug className="w-3 h-3" />
              Connected
            </span>
          ) : isConfigured ? (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Unplug className="w-3 h-3" />
              Unreachable
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-500/15 text-gray-400 border border-gray-500/30">
              <Unplug className="w-3 h-3" />
              Not configured
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="https://your-ngrok-url.ngrok.io"
          className="flex-1 px-3 py-2 rounded-lg bg-background border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
        <button
          onClick={saveUrl}
          disabled={saving || !inputUrl.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Connect"}
        </button>
        {isConfigured && (
          <button
            onClick={clearUrl}
            disabled={saving}
            className="px-3 py-2 rounded-lg border border-border/50 text-sm hover:bg-accent/50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {message && (
        <p className={`text-xs ${isConnected ? "text-green-400" : "text-amber-400"}`}>
          {message}
        </p>
      )}

      <div className="text-xs text-muted-foreground/70 space-y-1 border-t border-border/20 pt-3">
        <p>Without this service, CIOS uses built-in PubMed and ClinicalTrials.gov APIs directly.</p>
        <p>With this service, CIOS can also extract text from PDFs, SEC filings, conference abstracts, and other complex sources.</p>
      </div>
    </div>
  );
}
