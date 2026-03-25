export default function DataFlowBox({
  purpose,
  input,
  output,
}: {
  purpose: string;
  input: string;
  output: string;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Purpose
          </div>
          <div className="text-sm text-slate-200">{purpose}</div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Input
          </div>
          <div className="text-sm text-slate-200">{input}</div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Output
          </div>
          <div className="text-sm text-slate-200">{output}</div>
        </div>
      </div>
    </div>
  );
}
