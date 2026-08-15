CREATE TABLE `public_stability_entries` (
	`userId` int NOT NULL,
	`setupLabel` varchar(48) NOT NULL,
	`hardwareTagsJson` text NOT NULL,
	`stabilityScore` double NOT NULL,
	`offsetMs` double NOT NULL,
	`jitterMs` double NOT NULL,
	`uncertaintyMs` double NOT NULL,
	`sampleCount` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `public_stability_entries_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `user_chrono_preferences` ADD `publicLeaderboardOptIn` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_chrono_preferences` ADD `publicSetupLabel` varchar(48);--> statement-breakpoint
ALTER TABLE `user_chrono_preferences` ADD `highContrastMode` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `public_stability_score_idx` ON `public_stability_entries` (`stabilityScore`,`updatedAt`);