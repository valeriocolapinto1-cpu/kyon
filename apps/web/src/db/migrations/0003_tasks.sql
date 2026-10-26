CREATE TABLE `activity_event` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`actor_id` text,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_project_idx` ON `activity_event` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `kanban_column` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`is_done` integer DEFAULT false NOT NULL,
	`is_in_progress` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `kanban_column_project_idx` ON `kanban_column` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_sync` (
	`project_id` text PRIMARY KEY NOT NULL,
	`branch` text,
	`tree_sha` text,
	`tree_etag` text,
	`pending` text,
	`last_sync_at` integer,
	`last_error` text,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_file` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`blob_sha` text NOT NULL,
	`kind` text DEFAULT 'tasks' NOT NULL,
	`parsed` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_file_idx` ON `task_file` (`project_id`,`path`);--> statement-breakpoint
CREATE TABLE `task_label` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_label_name_idx` ON `task_label` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `task_label_link` (
	`task_id` text NOT NULL,
	`label_id` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task_meta`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `task_label`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_label_link_idx` ON `task_label_link` (`task_id`,`label_id`);--> statement-breakpoint
CREATE TABLE `task_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`stable_id` text NOT NULL,
	`path` text NOT NULL,
	`heading_path` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`assignee_id` text,
	`priority` text DEFAULT 'none' NOT NULL,
	`due_date` text,
	`column_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`orphaned_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`column_id`) REFERENCES `kanban_column`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_meta_stable_idx` ON `task_meta` (`project_id`,`stable_id`);--> statement-breakpoint
CREATE INDEX `task_meta_assignee_idx` ON `task_meta` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `task_meta_due_idx` ON `task_meta` (`due_date`);