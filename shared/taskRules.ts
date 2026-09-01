export type TaskRuleInput = {
  status: "todo" | "doing" | "done" | "dropped";
  importance: "important" | "not_important";
  urgencyMode: "auto" | "manual";
  manualUrgent: boolean;
  dueAt: Date | null;
  firstBreachedAt: Date | null;
};

export type Quadrant = "q1" | "q2" | "q3" | "q4";

function localDay(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isDueToday(dueAt: Date | null, now: Date, timezone: string): boolean {
  return Boolean(dueAt && localDay(dueAt, timezone) === localDay(now, timezone));
}

export function isBreached(task: TaskRuleInput, now: Date): boolean {
  return Boolean(task.firstBreachedAt || (task.dueAt && task.dueAt.getTime() < now.getTime() && task.status !== "done" && task.status !== "dropped"));
}

/**
 * The user may manually drag a task to any quadrant. A genuine breach remains Q1
 * until resolved because it represents a server-recorded historical fact.
 */
export function resolveQuadrant(task: TaskRuleInput, now: Date, timezone: string): Quadrant | null {
  if (task.status === "done" || task.status === "dropped") return null;
  if (isBreached(task, now)) return "q1";
  const urgent = task.urgencyMode === "manual" ? task.manualUrgent : isDueToday(task.dueAt, now, timezone);
  if (task.importance === "important") return urgent ? "q1" : "q3";
  return urgent ? "q2" : "q4";
}

export function defaultTaskRule(now: Date, dueAt: Date | null, timezone: string) {
  return {
    importance: "important" as const,
    urgencyMode: "auto" as const,
    manualUrgent: isDueToday(dueAt, now, timezone),
  };
}
