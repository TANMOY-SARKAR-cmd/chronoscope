CREATE TABLE `ntp_health_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`authority` varchar(32) NOT NULL,
	`host` varchar(128) NOT NULL,
	`status` enum('reachable','unreachable') NOT NULL,
	`offsetMs` double,
	`delayMs` double,
	`uncertaintyMs` double,
	`sampledAtMs` double NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ntp_health_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_measurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`burstId` varchar(64) NOT NULL,
	`roomCode` varchar(5),
	`sampleIndex` int NOT NULL,
	`clientSentMs` double NOT NULL,
	`serverReceivedMs` double NOT NULL,
	`serverSentMs` double NOT NULL,
	`clientReceivedMs` double NOT NULL,
	`offsetMs` double NOT NULL,
	`delayMs` double NOT NULL,
	`jitterMs` double NOT NULL,
	`uncertaintyMs` double NOT NULL,
	`sampleCount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `time_measurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ntp_health_authority_sampled_idx` ON `ntp_health_snapshots` (`authority`,`sampledAtMs`);--> statement-breakpoint
CREATE INDEX `time_measurements_session_idx` ON `time_measurements` (`sessionId`);--> statement-breakpoint
CREATE INDEX `time_measurements_room_created_idx` ON `time_measurements` (`roomCode`,`createdAt`);