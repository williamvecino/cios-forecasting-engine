import type { ReactNode } from "react";
import { Link } from "wouter";
import type { ActiveQuestion } from "../lib/workflow";

interface Props {
  activeQuestion: ActiveQuestion | null;
  children: ReactNode;
}

export default function QuestionGate({ activeQuestion, children }: Props) {
  return (
    <>
      {!activeQuestion && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300">
            Preview Mode
          </span>
          <span className="text-sm text-blue-200/70">
            Exploring workflow without an active question.
          </span>
          <Link
            href="/question"
            className="ml-auto text-xs font-medium text-blue-400 hover:text-blue-300 transition"
          >
            Ask a Question
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
