CREATE TABLE `active_timers` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`taskId` varchar(36),
	`projectId` varchar(36),
	`startedAt` timestamp NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `active_timers_id` PRIMARY KEY(`id`),
	CONSTRAINT `active_timers_ownerId_unique` UNIQUE(`ownerId`)
);
