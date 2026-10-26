ALTER TABLE `user` ADD `last_location` text;--> statement-breakpoint
ALTER TABLE `user` ADD `tour_done_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `ics_token_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_ics_token_hash_unique` ON `user` (`ics_token_hash`);