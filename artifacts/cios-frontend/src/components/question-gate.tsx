import type { ReactNode } from "react";
import { Link } from "wouter";
import type { ActiveQuestion } from "../lib/workflow";

interface Props {
  activeQuestion: ActiveQuestion | null;
  title: string;
  body: string;
  children: ReactNode;
}

export default function QuestionGate({
  activeQuestion,
  title,
  body,
  children,
}: Props) {
  if (!activeQuestion) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
        <div className="text-sm font-semibold text-amber-300">{title}</div>
        <div className="mt-2 text-sm text-amber-100/80">{body}</div>
        <Link
          href="/question"
          className="mt-5 inline-flex rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          Go to Ask a Question
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
