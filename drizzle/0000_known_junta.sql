CREATE TABLE `opportunity_feedback` (
	`feedback_id` text PRIMARY KEY NOT NULL,
	`tender_id` text NOT NULL,
	`user_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason_category` text,
	`notes` text,
	`score_at_decision` integer NOT NULL,
	`tier_at_decision` text NOT NULL,
	`model_version` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opportunity_feedback_tender_idx` ON `opportunity_feedback` (`tender_id`);--> statement-breakpoint
CREATE INDEX `opportunity_feedback_user_idx` ON `opportunity_feedback` (`user_id`);