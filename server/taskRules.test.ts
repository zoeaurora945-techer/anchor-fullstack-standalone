import { describe, expect, it } from "vitest";
import { resolveQuadrant } from "../shared/taskRules";

const now = new Date("2026-08-25T04:00:00.000Z");
const base = { status: "todo" as const, importance: "important" as const, urgencyMode: "auto" as const, manualUrgent: false, firstBreachedAt: null };

describe("任务象限契约", () => {
  it("让无时间任务默认进入重要不紧急 Q3", () => {
    expect(resolveQuadrant({ ...base, dueAt: null }, now, "Asia/Shanghai")).toBe("q3");
  });
  it("让当天内任务默认进入 Q1", () => {
    expect(resolveQuadrant({ ...base, dueAt: new Date("2026-08-25T12:00:00.000Z") }, now, "Asia/Shanghai")).toBe("q1");
  });
  it("让手动拖动覆盖自动紧急性，但违约事实始终优先", () => {
    expect(resolveQuadrant({ ...base, urgencyMode: "manual", manualUrgent: false, dueAt: new Date("2026-08-25T12:00:00.000Z") }, now, "Asia/Shanghai")).toBe("q3");
    expect(resolveQuadrant({ ...base, urgencyMode: "manual", manualUrgent: false, dueAt: null, firstBreachedAt: new Date("2026-08-24T10:00:00.000Z") }, now, "Asia/Shanghai")).toBe("q1");
  });
});
