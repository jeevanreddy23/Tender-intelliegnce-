import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const tenderRecords = sqliteTable("tender_records", {
  opportunityId: text("opportunity_id").primaryKey(),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  title: text("title").notNull(),
  buyer: text("buyer"),
  publishedAt: text("published_at"),
  closingAt: text("closing_at"),
  contractValue: real("contract_value"),
  successfulSupplier: text("successful_supplier"),
  authoritativeHash: text("authoritative_hash").notNull(),
  authoritativeJson: text("authoritative_json").notNull(),
  prefilterScore: integer("prefilter_score").notNull(),
  prefilterTermsJson: text("prefilter_terms_json").notNull(),
  aiStatus: text("ai_status", {
    enum: ["pending", "skipped", "queued", "processing", "analyzed", "retrying"],
  }).notNull(),
  lastAiError: text("last_ai_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("tender_records_source_identity_idx").on(table.source, table.sourceId),
  index("tender_records_ai_status_idx").on(table.aiStatus, table.updatedAt),
  index("tender_records_closing_at_idx").on(table.closingAt),
]);

export const tenderAiAnalyses = sqliteTable("tender_ai_analyses", {
  analysisId: text("analysis_id").primaryKey(),
  opportunityId: text("opportunity_id").notNull(),
  authoritativeHash: text("authoritative_hash").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  geotechRelevance: integer("geotech_relevance").notNull(),
  recommendedAction: text("recommended_action", {
    enum: ["discard", "low_priority_lead", "monitor", "engineer_review", "immediate_opportunity"],
  }).notNull(),
  confidence: real("confidence").notNull(),
  analysisJson: text("analysis_json").notNull(),
  usageJson: text("usage_json"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("tender_ai_analyses_opportunity_idx").on(table.opportunityId, table.createdAt),
  index("tender_ai_analyses_model_idx").on(table.model, table.promptVersion),
]);
