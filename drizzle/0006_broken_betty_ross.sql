CREATE TABLE `operator_agent_installations` (
	`id` varchar(64) NOT NULL,
	`ownerUserId` int NOT NULL,
	`publicKey` varchar(96) NOT NULL,
	`keyFingerprint` varchar(64) NOT NULL,
	`platform` enum('linux','windows','ios') NOT NULL,
	`agentVersion` varchar(32) NOT NULL,
	`coarseRegion` varchar(48),
	`lastSeenAtMs` double,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operator_agent_installations_id` PRIMARY KEY(`id`),
	CONSTRAINT `operator_agent_installations_keyFingerprint_unique` UNIQUE(`keyFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `operator_attestation_challenges` (
	`id` varchar(64) NOT NULL,
	`installationId` varchar(64) NOT NULL,
	`sourceId` varchar(64) NOT NULL,
	`nonceHash` varchar(64) NOT NULL,
	`expiresAtMs` double NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operator_attestation_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_health_attestations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` varchar(64) NOT NULL,
	`installationId` varchar(64) NOT NULL,
	`envelopeHash` varchar(64) NOT NULL,
	`qualityBand` enum('healthy','watch','degraded') NOT NULL,
	`status` enum('accepted','rejected') NOT NULL,
	`reasonCode` varchar(96),
	`sampledAtMs` double NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operator_health_attestations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `source_network_metadata` (
	`sourceId` varchar(64) NOT NULL,
	`asn` varchar(24),
	`countryCode` varchar(8),
	`regionCode` varchar(24),
	`lookupSource` varchar(48) NOT NULL,
	`confidence` enum('unknown','low','medium','high') NOT NULL DEFAULT 'unknown',
	`observedAtMs` double NOT NULL,
	`expiresAtMs` double NOT NULL,
	CONSTRAINT `source_network_metadata_sourceId` PRIMARY KEY(`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `source_review_applications` (
	`sourceId` varchar(64) NOT NULL,
	`applicantUserId` int NOT NULL,
	`status` enum('pending','needs_attestation','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending',
	`capabilitiesJson` text NOT NULL,
	`publicQueueOptIn` boolean NOT NULL DEFAULT false,
	`requestedPublicLabel` varchar(48),
	`publicRationale` varchar(280),
	`submittedAtMs` double NOT NULL,
	`updatedAtMs` double NOT NULL,
	CONSTRAINT `source_review_applications_sourceId` PRIMARY KEY(`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `source_review_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` varchar(64) NOT NULL,
	`reviewerUserId` int NOT NULL,
	`priorState` varchar(24) NOT NULL,
	`nextState` varchar(24) NOT NULL,
	`decision` enum('approve','request_attestation','quarantine','reject','withdraw') NOT NULL,
	`reasonCode` varchar(96) NOT NULL,
	`privateNote` varchar(500),
	`publicRationale` varchar(280),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `source_review_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `agent_installation_owner_idx` ON `operator_agent_installations` (`ownerUserId`,`revokedAt`);--> statement-breakpoint
CREATE INDEX `attestation_challenge_installation_idx` ON `operator_attestation_challenges` (`installationId`,`expiresAtMs`);--> statement-breakpoint
CREATE INDEX `attestation_challenge_source_idx` ON `operator_attestation_challenges` (`sourceId`,`expiresAtMs`);--> statement-breakpoint
CREATE INDEX `health_attestation_source_sampled_idx` ON `operator_health_attestations` (`sourceId`,`sampledAtMs`);--> statement-breakpoint
CREATE INDEX `health_attestation_installation_idx` ON `operator_health_attestations` (`installationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `network_metadata_expiry_idx` ON `source_network_metadata` (`expiresAtMs`);--> statement-breakpoint
CREATE INDEX `review_application_status_idx` ON `source_review_applications` (`status`,`updatedAtMs`);--> statement-breakpoint
CREATE INDEX `review_application_applicant_idx` ON `source_review_applications` (`applicantUserId`,`updatedAtMs`);--> statement-breakpoint
CREATE INDEX `review_event_source_created_idx` ON `source_review_events` (`sourceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `review_event_reviewer_created_idx` ON `source_review_events` (`reviewerUserId`,`createdAt`);