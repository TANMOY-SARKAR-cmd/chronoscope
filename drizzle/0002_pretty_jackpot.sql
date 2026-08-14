CREATE TABLE `time_sources` (
	`id` varchar(64) NOT NULL,
	`displayName` varchar(80) NOT NULL,
	`host` varchar(253) NOT NULL,
	`sourceTier` enum('authority','regional_pool') NOT NULL,
	`region` varchar(48),
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `time_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ntp_health_snapshots` MODIFY COLUMN `authority` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `ntp_health_snapshots` MODIFY COLUMN `host` varchar(253) NOT NULL;--> statement-breakpoint
ALTER TABLE `ntp_health_snapshots` ADD `sourceTier` enum('authority','regional_pool') DEFAULT 'authority' NOT NULL;--> statement-breakpoint
ALTER TABLE `ntp_health_snapshots` ADD `region` varchar(48);--> statement-breakpoint
ALTER TABLE `ntp_health_snapshots` ADD `detail` varchar(255);--> statement-breakpoint
CREATE INDEX `ntp_health_tier_sampled_idx` ON `ntp_health_snapshots` (`sourceTier`,`sampledAtMs`);