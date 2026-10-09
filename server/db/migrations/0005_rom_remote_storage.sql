ALTER TABLE `roms` ADD COLUMN `storage` varchar(16) NOT NULL DEFAULT 'local';
--> statement-breakpoint
ALTER TABLE `roms` ADD COLUMN `remote_file_id` varchar(128);
