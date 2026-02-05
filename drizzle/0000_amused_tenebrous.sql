CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`identifier` text NOT NULL,
	`display_name` text,
	`posting_frequency` text DEFAULT 'daily' NOT NULL,
	`posting_time` text DEFAULT '12:00' NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`image_url` text NOT NULL,
	`caption` text NOT NULL,
	`type` text DEFAULT 'queued' NOT NULL,
	`scheduled_at` integer,
	`queue_order` integer,
	`published_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`platform_post_id` text,
	`error` text,
	`created_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
