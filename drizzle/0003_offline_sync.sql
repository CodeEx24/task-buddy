CREATE TABLE `sync_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `lists` ADD `synced_updated_at` integer;--> statement-breakpoint
CREATE INDEX `lists_dirty_idx` ON `lists` (`id`) WHERE "lists"."synced_updated_at" IS NULL OR "lists"."synced_updated_at" <> "lists"."updated_at";--> statement-breakpoint
ALTER TABLE `subtasks` ADD `synced_updated_at` integer;--> statement-breakpoint
CREATE INDEX `subtasks_dirty_idx` ON `subtasks` (`id`) WHERE "subtasks"."synced_updated_at" IS NULL OR "subtasks"."synced_updated_at" <> "subtasks"."updated_at";--> statement-breakpoint
ALTER TABLE `tasks` ADD `synced_updated_at` integer;--> statement-breakpoint
CREATE INDEX `tasks_dirty_idx` ON `tasks` (`id`) WHERE "tasks"."synced_updated_at" IS NULL OR "tasks"."synced_updated_at" <> "tasks"."updated_at";