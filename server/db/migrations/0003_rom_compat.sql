ALTER TABLE `roms` ADD COLUMN `default_core` varchar(64);
--> statement-breakpoint
ALTER TABLE `roms` ADD COLUMN `nes_four_player_mode` varchar(32);