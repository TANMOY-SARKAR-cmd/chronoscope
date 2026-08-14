CREATE TABLE `room_relay_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originId` varchar(64) NOT NULL,
	`roomCode` varchar(5) NOT NULL,
	`eventType` enum('upsert','remove') NOT NULL,
	`peerId` varchar(16) NOT NULL,
	`payloadJson` text,
	`expiresAtMs` double NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `room_relay_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_chrono_preferences` (
	`userId` int NOT NULL,
	`alertEnabled` boolean NOT NULL DEFAULT true,
	`alertThresholdMs` double NOT NULL DEFAULT 25,
	`hardwareTemplateOptIn` boolean NOT NULL DEFAULT false,
	`hardwareTagsJson` text NOT NULL,
	`hardwareDescription` varchar(160),
	`worldZonesJson` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_chrono_preferences_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE INDEX `room_relay_room_id_idx` ON `room_relay_events` (`roomCode`,`id`);--> statement-breakpoint
CREATE INDEX `room_relay_expiry_idx` ON `room_relay_events` (`expiresAtMs`);