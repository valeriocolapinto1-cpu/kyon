ALTER TABLE `activity_event` ADD `task_id` text;--> statement-breakpoint
CREATE INDEX `activity_task_idx` ON `activity_event` (`task_id`,`created_at`);