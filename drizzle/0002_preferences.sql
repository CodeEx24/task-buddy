CREATE TABLE `preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`key` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_key_live_unique` ON `preferences` (`key`) WHERE "preferences"."deleted_at" IS NULL;