import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const opportunityFeedback = sqliteTable("opportunity_feedback", {
  feedbackId: text("feedback_id").primaryKey(),
  tenderId: text("tender_id").notNull(),
  userId: text("user_id").notNull(),
  decision: text("decision", { enum: ["Pursue", "Watch", "Pass"] }).notNull(),
  reasonCategory: text("reason_category"),
  notes: text("notes"),
  scoreAtDecision: integer("score_at_decision").notNull(),
  tierAtDecision: text("tier_at_decision", { enum: ["A", "B", "C"] }).notNull(),
  modelVersion: text("model_version").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("opportunity_feedback_tender_idx").on(table.tenderId),
  index("opportunity_feedback_user_idx").on(table.userId),
]);
