import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActiveQuestion } from "../lib/workflow";
import {
  clearStoredActiveQuestion,
  clearCaseState,
  createQuestionId,
  getStoredActiveQuestion,
  storeActiveQuestion,
} from "../lib/workflow";

export interface CreateQuestionInput {
  text: string;
  rawInput?: string;
  caseId?: string;
  timeHorizon?: string;
  questionType?: string;
  entities?: string[];
  comparisonGroups?: string[];
  subject?: string;
  outcome?: string;
  threshold?: string;
  outcomeDimensions?: import("../lib/workflow").OutcomeDimension[];
  compositeScenarios?: import("../lib/workflow").CompositeScenario[];
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
    const prev = getStoredActiveQuestion();
    if (prev) {
      const oldCaseId = prev.caseId || prev.id;
      clearCaseState(oldCaseId);
      clearCaseState("unknown");
    }

    const next: ActiveQuestion = {
      id: createQuestionId(),
      text: input.text.trim(),
      rawInput: input.rawInput?.trim() || undefined,
      createdAt: new Date().toISOString(),
      caseId: input.caseId?.trim() || undefined,
      timeHorizon: input.timeHorizon?.trim() || undefined,
      questionType: input.questionType || undefined,
      entities: input.entities || undefined,
      comparisonGroups: input.comparisonGroups || undefined,
      subject: input.subject || undefined,
      outcome: input.outcome || undefined,
      threshold: input.threshold || undefined,
      outcomeDimensions: input.outcomeDimensions || undefined,
      compositeScenarios: input.compositeScenarios || undefined,
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
      rawInput: input.rawInput?.trim() || prev?.rawInput || undefined,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      caseId: input.caseId?.trim() || undefined,
      timeHorizon: input.timeHorizon?.trim() || undefined,
      questionType: input.questionType || undefined,
      entities: input.entities || undefined,
      comparisonGroups: input.comparisonGroups || prev?.comparisonGroups || undefined,
      subject: input.subject || undefined,
      outcome: input.outcome || undefined,
      threshold: input.threshold || prev?.threshold || undefined,
      outcomeDimensions: input.outcomeDimensions || prev?.outcomeDimensions || undefined,
      compositeScenarios: input.compositeScenarios || prev?.compositeScenarios || undefined,
    };
    storeActiveQuestion(updated);
    setActiveQuestion(updated);
  }, []);

  const clearQuestion = useCallback(() => {
    const prev = getStoredActiveQuestion();
    if (prev?.caseId) {
      clearCaseState(prev.caseId);
    }
    clearCaseState("unknown");
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
