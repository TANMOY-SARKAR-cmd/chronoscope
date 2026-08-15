CREATE TABLE `global_source_probe_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` varchar(64) NOT NULL,
	`status` enum('reachable','unreachable','blocked','quarantined') NOT NULL,
	`detail` varchar(255),
	`offsetMs` double,
	`delayMs` double,
	`uncertaintyMs` double,
	`stratum` int,
	`sampledAtMs` double NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `global_source_probe_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `global_source_quality_summaries` (
	`sourceId` varchar(64) NOT NULL,
	`reachableSamples` int NOT NULL DEFAULT 0,
	`totalSamples` int NOT NULL DEFAULT 0,
	`medianOffsetMs` double,
	`medianUncertaintyMs` double,
	`medianDelayMs` double,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `global_source_quality_summaries_sourceId` PRIMARY KEY(`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `global_time_sources` (
	`id` varchar(64) NOT NULL,
	`ownerUserId` int,
	`displayName` varchar(80) NOT NULL,
	`host` varchar(253) NOT NULL,
	`sourceClass` enum('authority','regional_pool','official','community') NOT NULL,
	`state` enum('pending','active','paused','quarantined','withdrawn') NOT NULL DEFAULT 'pending',
	`provenance` enum('curated','verified_operator','operator_declared') NOT NULL DEFAULT 'operator_declared',
	`verificationMethod` enum('none','dns_txt','https_token') NOT NULL DEFAULT 'none',
	`verificationToken` varchar(96),
	`verifiedAt` timestamp,
	`publicMetadataOptIn` boolean NOT NULL DEFAULT false,
	`publicLabel` varchar(48),
	`region` varchar(48),
	`groupKey` varchar(96) NOT NULL,
	`consecutiveFailures` int NOT NULL DEFAULT 0,
	`nextEligibleAtMs` double,
	`lastProbeAtMs` double,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `global_time_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `global_time_sources_host_unique` UNIQUE(`host`)
);
--> statement-breakpoint
CREATE INDEX `global_probe_source_sampled_idx` ON `global_source_probe_snapshots` (`sourceId`,`sampledAtMs`);--> statement-breakpoint
CREATE INDEX `global_time_sources_state_idx` ON `global_time_sources` (`state`,`nextEligibleAtMs`);--> statement-breakpoint
CREATE INDEX `global_time_sources_owner_idx` ON `global_time_sources` (`ownerUserId`);--> statement-breakpoint
CREATE INDEX `global_time_sources_class_idx` ON `global_time_sources` (`sourceClass`);