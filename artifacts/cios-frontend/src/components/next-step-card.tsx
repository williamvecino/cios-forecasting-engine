export default function NextStepCard({ text }: { text: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Next Step
      </div>
      <div className="text-sm text-slate-200">{text}</div>
    </div>
  );
}
