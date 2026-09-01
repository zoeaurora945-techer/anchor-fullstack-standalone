CREATE TABLE `execution_events` (
	`id` varchar(36) NOT NULL,
	`taskId` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`execution_event_type` enum('breached','completed_on_time','completed_late','dropped_after_breach') NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`dueAtSnapshot` timestamp,
	`idempotencyKey` varchar(150) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `execution_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_events_idempotency_key` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` varchar(36) NOT NULL,
	`requesterId` int NOT NULL,
	`recipientId` int NOT NULL,
	`friendship_status` enum('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `friendships_id` PRIMARY KEY(`id`),
	CONSTRAINT `friendships_pair_unique` UNIQUE(`requesterId`,`recipientId`)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`color` varchar(16) NOT NULL DEFAULT '#6EA8FE',
	`entity_status` enum('active','paused','completed','archived') NOT NULL DEFAULT 'active',
	`visibility` enum('private','friends','public') NOT NULL DEFAULT 'private',
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`goalId` varchar(36),
	`title` varchar(200) NOT NULL,
	`description` text,
	`entity_status` enum('active','paused','completed','archived') NOT NULL DEFAULT 'active',
	`visibility` enum('private','friends','public') NOT NULL DEFAULT 'private',
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `relationship_edges` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`edge_from_type` enum('goal','project','task') NOT NULL,
	`fromId` varchar(36) NOT NULL,
	`edge_to_type` enum('goal','project','task') NOT NULL,
	`toId` varchar(36) NOT NULL,
	`relation` varchar(48) NOT NULL DEFAULT 'supports',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relationship_edges_id` PRIMARY KEY(`id`),
	CONSTRAINT `edges_unique_link` UNIQUE(`ownerId`,`edge_from_type`,`fromId`,`edge_to_type`,`toId`,`relation`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`scheduled_job_kind` enum('time_facts','weekly_preview','weekly_final') NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_jobs_owner_kind` UNIQUE(`ownerId`,`scheduled_job_kind`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`projectId` varchar(36),
	`title` varchar(240) NOT NULL,
	`notes` text,
	`task_status` enum('todo','doing','done','dropped') NOT NULL DEFAULT 'todo',
	`task_importance` enum('important','not_important') NOT NULL DEFAULT 'important',
	`task_urgency_mode` enum('auto','manual') NOT NULL DEFAULT 'auto',
	`manualUrgent` boolean NOT NULL DEFAULT false,
	`dueAt` timestamp,
	`due_precision` enum('unknown','date','datetime') NOT NULL DEFAULT 'unknown',
	`estimatedMinutes` int,
	`doneAt` timestamp,
	`droppedAt` timestamp,
	`firstBreachedAt` timestamp,
	`visibility` enum('private','friends','public') NOT NULL DEFAULT 'private',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`taskId` varchar(36),
	`projectId` varchar(36),
	`startedAt` timestamp NOT NULL,
	`endedAt` timestamp NOT NULL,
	`durationMinutes` int NOT NULL,
	`note` text,
	`time_entry_source` enum('timer','manual') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `time_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`userId` int NOT NULL,
	`displayName` varchar(100),
	`bio` text,
	`avatarUrl` text,
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
	`visibility` enum('private','friends','public') NOT NULL DEFAULT 'private',
	`discoverable` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `visibility_grants` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`viewerId` int NOT NULL,
	`grant_entity_type` enum('profile','goal','project','task') NOT NULL,
	`entityId` varchar(36),
	`grant_permission` enum('summary','details') NOT NULL DEFAULT 'summary',
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `visibility_grants_id` PRIMARY KEY(`id`),
	CONSTRAINT `visibility_grant_unique` UNIQUE(`ownerId`,`viewerId`,`grant_entity_type`,`entityId`)
);
--> statement-breakpoint
CREATE TABLE `weekly_reports` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`weekStartAt` timestamp NOT NULL,
	`weekly_report_kind` enum('preview','final') NOT NULL,
	`snapshot` json NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weekly_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `weekly_reports_owner_week_kind` UNIQUE(`ownerId`,`weekStartAt`,`weekly_report_kind`)
);
--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` varchar(36) NOT NULL,
	`ownerId` int NOT NULL,
	`weekStartAt` timestamp NOT NULL,
	`reflection` text,
	`wins` json,
	`blockers` json,
	`nextActions` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `weekly_reviews_owner_week` UNIQUE(`ownerId`,`weekStartAt`)
);
--> statement-breakpoint
CREATE INDEX `execution_events_task_idx` ON `execution_events` (`taskId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `friendships_recipient_idx` ON `friendships` (`recipientId`,`friendship_status`);--> statement-breakpoint
CREATE INDEX `goals_owner_updated_idx` ON `goals` (`ownerId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `projects_owner_updated_idx` ON `projects` (`ownerId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `projects_goal_idx` ON `projects` (`goalId`);--> statement-breakpoint
CREATE INDEX `edges_owner_idx` ON `relationship_edges` (`ownerId`);--> statement-breakpoint
CREATE INDEX `scheduled_jobs_task_uid_idx` ON `scheduled_jobs` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `tasks_owner_updated_idx` ON `tasks` (`ownerId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `tasks_owner_due_idx` ON `tasks` (`ownerId`,`dueAt`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`projectId`);--> statement-breakpoint
CREATE INDEX `time_entries_owner_started_idx` ON `time_entries` (`ownerId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `time_entries_project_idx` ON `time_entries` (`projectId`);--> statement-breakpoint
CREATE INDEX `visibility_grants_owner_viewer_idx` ON `visibility_grants` (`ownerId`,`viewerId`);