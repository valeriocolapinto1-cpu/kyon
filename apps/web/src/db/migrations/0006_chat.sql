CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`message_id` text,
	`uploader_id` text,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`alt` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `attachment_message_idx` ON `attachment` (`message_id`);--> statement-breakpoint
CREATE TABLE `chat_member` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_seq` integer DEFAULT 0 NOT NULL,
	`muted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_member_idx` ON `chat_member` (`room_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`seq` integer NOT NULL,
	`client_id` text NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`reply_to_id` text,
	`mentions` text DEFAULT '[]' NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_message_seq_idx` ON `chat_message` (`room_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_message_client_idx` ON `chat_message` (`room_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `chat_pin` (
	`room_id` text NOT NULL,
	`message_id` text NOT NULL,
	`pinned_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pinned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_pin_idx` ON `chat_pin` (`room_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `chat_reaction` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `chat_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_reaction_idx` ON `chat_reaction` (`message_id`,`user_id`,`emoji`);--> statement-breakpoint
CREATE TABLE `chat_room` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`title` text,
	`created_by` text,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `task_meta`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_room_project_idx` ON `chat_room` (`project_id`,`last_message_at`);