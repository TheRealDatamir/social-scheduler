-- Migration: Add NextAuth tables and refactor accounts
-- Since this is a feature branch and the database will be reset,
-- we can safely drop and recreate tables

-- Drop existing tables (dev only - data will be lost)
DROP TABLE IF EXISTS `posts`;
DROP TABLE IF EXISTS `accounts`;

-- Create users table (NextAuth)
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text,
  `email` text UNIQUE,
  `email_verified` integer,
  `image` text,
  `created_at` integer
);

-- Create accounts table (NextAuth OAuth)
CREATE TABLE `accounts` (
  `user_id` text NOT NULL,
  `type` text NOT NULL,
  `provider` text NOT NULL,
  `provider_account_id` text NOT NULL,
  `refresh_token` text,
  `access_token` text,
  `expires_at` integer,
  `token_type` text,
  `scope` text,
  `id_token` text,
  `session_state` text,
  PRIMARY KEY (`provider`, `provider_account_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Create sessions table (NextAuth)
CREATE TABLE `sessions` (
  `session_token` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `expires` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Create verification_tokens table (NextAuth)
CREATE TABLE `verification_tokens` (
  `identifier` text NOT NULL,
  `token` text NOT NULL,
  `expires` integer NOT NULL,
  PRIMARY KEY (`identifier`, `token`)
);

-- Create social_accounts table (our app's Instagram accounts)
CREATE TABLE `social_accounts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `platform` text NOT NULL,
  `platform_account_id` text,
  `identifier` text NOT NULL,
  `display_name` text,
  `access_token` text,
  `token_expires_at` integer,
  `posting_frequency` text DEFAULT 'daily' NOT NULL,
  `posting_time` text DEFAULT '12:00' NOT NULL,
  `created_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Recreate posts table with reference to social_accounts
CREATE TABLE `posts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `account_id` integer,
  `image_url` text NOT NULL,
  `caption` text NOT NULL,
  `type` text DEFAULT 'queued' NOT NULL,
  `is_extra` integer DEFAULT false NOT NULL,
  `scheduled_at` integer,
  `queue_order` integer,
  `published_at` integer,
  `status` text DEFAULT 'pending' NOT NULL,
  `platform_post_id` text,
  `error` text,
  `created_at` integer,
  FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
);
