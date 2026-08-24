CREATE TABLE `tender_ai_analyses` (
	`analysis_id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`authoritative_hash` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`geotech_relevance` integer NOT NULL,
	`recommended_action` text NOT NULL,
	`confidence` real NOT NULL,
	`analysis_json` text NOT NULL,
	`usage_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tender_ai_analyses_opportunity_idx` ON `tender_ai_analyses` (`opportunity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tender_ai_analyses_model_idx` ON `tender_ai_analyses` (`model`,`prompt_version`);--> statement-breakpoint
CREATE TABLE `tender_records` (
	`opportunity_id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`buyer` text,
	`published_at` text,
	`closing_at` text,
	`contract_value` real,
	`successful_supplier` text,
	`authoritative_hash` text NOT NULL,
	`authoritative_json` text NOT NULL,
	`prefilter_score` integer NOT NULL,
	`prefilter_terms_json` text NOT NULL,
	`ai_status` text NOT NULL,
	`last_ai_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tender_records_source_identity_idx` ON `tender_records` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `tender_records_ai_status_idx` ON `tender_records` (`ai_status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `tender_records_closing_at_idx` ON `tender_records` (`closing_at`);