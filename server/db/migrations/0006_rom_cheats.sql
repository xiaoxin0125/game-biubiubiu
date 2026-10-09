CREATE TABLE `rom_cheats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rom_id` int NOT NULL,
	`label` varchar(64) NOT NULL DEFAULT '',
	`code` varchar(128) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rom_cheats_id` PRIMARY KEY (`id`),
	CONSTRAINT `rom_cheats_rom_id_roms_id_fk` FOREIGN KEY (`rom_id`) REFERENCES `roms`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_rom_cheats_rom` ON `rom_cheats` (`rom_id`);
