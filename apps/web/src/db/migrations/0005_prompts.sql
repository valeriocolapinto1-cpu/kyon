CREATE TABLE `prompt` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `task_meta`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prompt_project_idx` ON `prompt` (`project_id`);--> statement-breakpoint
CREATE INDEX `prompt_task_idx` ON `prompt` (`task_id`);--> statement-breakpoint
CREATE TABLE `prompt_run` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`task_stable_id` text NOT NULL,
	`task_text` text NOT NULL,
	`prompt_id` text,
	`prompt_version_id` text,
	`rendered_text` text NOT NULL,
	`launched_by` text,
	`copied_at` integer NOT NULL,
	`state` text DEFAULT 'copied' NOT NULL,
	`branch` text NOT NULL,
	`pr_number` integer,
	`pr_url` text,
	`pr_title` text,
	`pr_head_sha` text,
	`link_source` text,
	`merged_at` integer,
	`result_notes` text,
	`task_closed_by_run` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `task_meta`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompt`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`prompt_version_id`) REFERENCES `prompt_version`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`launched_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prompt_run_project_idx` ON `prompt_run` (`project_id`,`copied_at`);--> statement-breakpoint
CREATE INDEX `prompt_run_task_idx` ON `prompt_run` (`task_id`);--> statement-breakpoint
CREATE INDEX `prompt_run_pr_idx` ON `prompt_run` (`project_id`,`pr_number`);--> statement-breakpoint
CREATE INDEX `prompt_run_sha_idx` ON `prompt_run` (`pr_head_sha`);--> statement-breakpoint
CREATE TABLE `prompt_template` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`owner_id` text,
	`project_id` text,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prompt_template_owner_idx` ON `prompt_template` (`owner_id`);--> statement-breakpoint
CREATE INDEX `prompt_template_project_idx` ON `prompt_template` (`project_id`);--> statement-breakpoint
CREATE TABLE `prompt_version` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`number` integer NOT NULL,
	`body` text NOT NULL,
	`author_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompt`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_version_number_idx` ON `prompt_version` (`prompt_id`,`number`);