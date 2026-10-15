ALTER TABLE `roms` ADD COLUMN `play_count` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `rom_plays` (
	`user_id` int NOT NULL,
	`rom_id` int NOT NULL,
	`play_count` int NOT NULL DEFAULT 0,
	`last_played_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `rom_plays_user_id_rom_id_pk` PRIMARY KEY (`user_id`,`rom_id`),
	CONSTRAINT `rom_plays_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `rom_plays_rom_id_roms_id_fk` FOREIGN KEY (`rom_id`) REFERENCES `roms`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_rom_plays_user` ON `rom_plays` (`user_id`,`last_played_at`);
--> statement-breakpoint
CREATE INDEX `idx_rom_plays_rom` ON `rom_plays` (`rom_id`);
