CREATE TABLE `fusion_observability_rollups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`granularity` enum('hour','day') NOT NULL,
	`bucketStartMs` double NOT NULL,
	`bucketEndMs` double NOT NULL,
	`bucketDurationMs` double NOT NULL,
	`sampleCount` int NOT NULL,
	`reachableCount` int NOT NULL,
	`measuredCount` int NOT NULL,
	`medianDelayMs` double,
	`medianUncertaintyMs` double,
	`medianAbsoluteOffsetMs` double,
	`observedSourceCount` int NOT NULL,
	`coverageVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fusion_observability_rollups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `fusion_observability_rollups_window_idx` ON `fusion_observability_rollups` (`bucketStartMs`,`bucketEndMs`);