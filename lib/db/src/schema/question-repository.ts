import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const questionRepositoryTable = pgTable("question_repository", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  questionId: text("question_id").notNull().unique(),
  parentQuestionId: text("parent_question_id"),
  questionText: text("question_text").notNull(),
  questionRole: text("question_role").notNull().default("secondary"),
  questionType: text("question_type").notNull().default("strategic"),
  outcomeStructure: text("outcome_structure"),
  timeHorizon: text("time_horizon"),
  priorityRank: integer("priority_rank").default(0),
  status: text("status").notNull().default("saved"),
  source: text("source").default("system"),
  linkedSignals: text("linked_signals"),
  linkedForecastId: text("linked_forecast_id"),
  dependencies: text("dependencies"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
