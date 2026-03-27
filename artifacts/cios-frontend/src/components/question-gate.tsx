import type { ReactNode } from "react";
import { Link } from "wouter";
import type { ActiveQuestion } from "../lib/workflow";

interface Props {
  activeQuestion: ActiveQuestion | null;
  children: ReactNode;
}

export default function QuestionGate({ activeQuestion, children }: Props) {
  if (!activeQuestion) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <span className="text-sm text-blue-200/70">
          No active question yet.
        </span>
        <Link
          href="/question"
          className="ml-auto text-xs font-medium text-blue-400 hover:text-blue-300 transition"
        >
          Define Question
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
