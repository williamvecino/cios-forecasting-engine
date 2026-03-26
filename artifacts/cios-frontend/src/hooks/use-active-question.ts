import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActiveQuestion } from "../lib/workflow";
import {
  clearStoredActiveQuestion,
  createQuestionId,
  getStoredActiveQuestion,
  storeActiveQuestion,
} from "../lib/workflow";

export interface CreateQuestionInput {
  text: string;
  caseId?: string;
  timeHorizon?: string;
}

export function useActiveQuestion() {
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null);

  useEffect(() => {
    const stored = getStoredActiveQuestion();
    if (stored) {
      setActiveQuestion(stored);
    }
  }, []);

  const createQuestion = useCallback((input: CreateQuestionInput) => {
    const next: ActiveQuestion = {
      id: createQuestionId(),
      text: input.text.trim(),
      createdAt: new Date().toISOString(),
      caseId: input.caseId?.trim() || undefined,
      timeHorizon: input.timeHorizon?.trim() || undefined,
    };

    storeActiveQuestion(next);
    setActiveQuestion(next);
    return next;
  }, []);

  const clearQuestion = useCallback(() => {
    clearStoredActiveQuestion();
    setActiveQuestion(null);
  }, []);

  const hasActiveQuestion = !!activeQuestion;

  return useMemo(
    () => ({
      activeQuestion,
      hasActiveQuestion,
      createQuestion,
      clearQuestion,
      setActiveQuestion,
    }),
    [activeQuestion, hasActiveQuestion, createQuestion, clearQuestion]
  );
}
