CREATE TABLE `github_connection` (
	`user_id` text PRIMARY KEY NOT NULL,
	`github_user_id` integer NOT NULL,
	`login` text NOT NULL,
	`avatar_url` text,
	`access_token` text NOT NULL,
	`access_token_expires_at` integer,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`last_sync_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_repo` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`github_repo_id` integer NOT NULL,
	`installation_id` integer,
	`full_name` text NOT NULL,
	`owner_login` text NOT NULL,
	`name` text NOT NULL,
	`private` integer DEFAULT true NOT NULL,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`html_url` text NOT NULL,
	`exposure` text DEFAULT 'hidden' NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_repo_user_repo_idx` ON `github_repo` (`user_id`,`github_repo_id`);--> statement-breakpoint
CREATE INDEX `github_repo_repo_idx` ON `github_repo` (`github_repo_id`);--> statement-breakpoint
CREATE TABLE `github_repo_share` (
	`repo_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `github_repo`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_repo_share_idx` ON `github_repo_share` (`repo_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repo_id` text NOT NULL,
	`github_repo_id` integer NOT NULL,
	`commit_mode` text DEFAULT 'direct' NOT NULL,
	`work_branch` text,
	`viewers_can_comment` integer DEFAULT false NOT NULL,
	`plan_headings` text,
	`ignore_globs` text,
	`show_archive` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `github_repo`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_github_repo_idx` ON `project` (`github_repo_id`);--> statement-breakpoint
CREATE TABLE `project_member` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_member_idx` ON `project_member` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_member_user_idx` ON `project_member` (`user_id`);