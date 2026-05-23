CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `actor_user_id` int,
  `actor_username` varchar(64),
  `action` varchar(80) NOT NULL,
  `target_type` varchar(64),
  `target_id` varchar(128),
  `ip` varchar(64),
  `user_agent` varchar(512),
  `metadata` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`),
  CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_actor` ON `audit_logs` (`actor_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_action` ON `audit_logs` (`action`);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);