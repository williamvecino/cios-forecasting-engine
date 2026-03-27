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
  questionType?: string;
  entities?: string[];
  subject?: string;
  outcome?: string;
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
      questionType: input.questionType || undefined,
      entities: input.entities || undefined,
      subject: input.subject || undefined,
      outcome: input.outcome || undefined,
    };

    storeActiveQuestion(next);
    setActiveQuestion(next);
    return next;
  }, []);

  const updateQuestion = useCallback((input: CreateQuestionInput) => {
    const prev = getStoredActiveQuestion();
    const updated: ActiveQuestion = {
      id: prev?.id ?? createQuestionId(),
      text: input.text.trim(),
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      caseId: input.caseId?.trim() || undefined,
      timeHorizon: input.timeHorizon?.trim() || undefined,
      questionType: input.questionType || undefined,
      entities: input.entities || undefined,
      subject: input.subject || undefined,
      outcome: input.outcome || undefined,
    };
    storeActiveQuestion(updated);
    setActiveQuestion(updated);
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
      updateQuestion,
      clearQuestion,
      setActiveQuestion,
    }),
    [activeQuestion, hasActiveQuestion, createQuestion, updateQuestion, clearQuestion]
  );
}
