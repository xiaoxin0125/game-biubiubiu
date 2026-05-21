CREATE TABLE IF NOT EXISTS `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(32) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` varchar(32) NOT NULL DEFAULT 'user',
	`status` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `settings` (
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `roms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`title` varchar(128) NOT NULL,
	`platform` varchar(32) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_path` varchar(1024) NOT NULL,
	`file_size` int NOT NULL,
	`is_public` boolean NOT NULL DEFAULT false,
	`parent_rom_id` int,
	`version_label` varchar(64),
	`status` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roms_id` PRIMARY KEY(`id`),
	CONSTRAINT `roms_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `idx_roms_parent` ON `roms` (`parent_rom_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`host_user_id` int NOT NULL,
	`rom_id` int NOT NULL,
	`name` varchar(60) NOT NULL,
	`is_public` boolean NOT NULL DEFAULT true,
	`allow_play` boolean NOT NULL DEFAULT true,
	`password_hash` varchar(255),
	`status` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`closed_at` timestamp,
	CONSTRAINT `rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `rooms_code_unique` UNIQUE(`code`),
	CONSTRAINT `rooms_host_user_id_users_id_fk` FOREIGN KEY (`host_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `rooms_rom_id_roms_id_fk` FOREIGN KEY (`rom_id`) REFERENCES `roms`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`ip` varchar(64),
	`user_agent` varchar(512),
	`expires_at` timestamp NOT NULL,
	`last_activity_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_unique` UNIQUE(`token`),
	CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `favorites` (
	`user_id` int NOT NULL,
	`rom_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `favorites_user_id_rom_id_pk` PRIMARY KEY(`user_id`,`rom_id`),
	CONSTRAINT `favorites_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `favorites_rom_id_roms_id_fk` FOREIGN KEY (`rom_id`) REFERENCES `roms`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `idx_favorites_user` ON `favorites` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_favorites_rom` ON `favorites` (`rom_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `save_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`rom_id` int NOT NULL,
	`slot` int NOT NULL DEFAULT 0,
	`file_path` varchar(1024) NOT NULL,
	`file_size` int NOT NULL,
	`status` int NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `save_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_save_states_unique_slot` UNIQUE(`user_id`,`rom_id`,`slot`),
	CONSTRAINT `save_states_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `save_states_rom_id_roms_id_fk` FOREIGN KEY (`rom_id`) REFERENCES `roms`(`id`) ON DELETE cascade ON UPDATE no action
);