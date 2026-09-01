export type Visibility = "private" | "friends" | "public";
export type TaskStatus = "todo" | "doing" | "done" | "dropped";
export type ExecutionEventType = "breached" | "completed_on_time" | "completed_late" | "dropped_after_breach";

export type SyncTask = {
  id: string;
  projectId: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  importance: "important" | "not_important";
  urgencyMode: "auto" | "manual";
  manualUrgent: boolean;
  dueAt: Date | null;
  duePrecision: "unknown" | "date" | "datetime";
  estimatedMinutes: number | null;
  doneAt: Date | null;
  droppedAt: Date | null;
  firstBreachedAt: Date | null;
  visibility: Visibility;
  createdAt: Date;
  updatedAt: Date;
};

export type VisitorNebula = {
  profile: { displayName: string | null; bio: string | null; avatarUrl: string | null };
  goals: Array<{ id: string; title: string; color: string; progress: number; projectCount: number }>;
  generatedAt: Date;
};
