CREATE INDEX `subtasks_task_id_idx` ON `subtasks` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_tags_tag_id_idx` ON `task_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `tasks_live_status_due_sort_idx` ON `tasks` (`deleted_at`,`status`,`due_at`,`sort_order`);--> statement-breakpoint
CREATE INDEX `tasks_list_id_idx` ON `tasks` (`list_id`);