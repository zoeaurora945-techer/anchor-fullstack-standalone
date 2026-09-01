import { describe, expect, it } from "vitest";
import { i18n } from "../shared/i18nContract";
import { fallbackTaskExtraction } from "./aiTaskService";
import { cronByKind } from "./routers/automation";
import { mondayUtc } from "./weeklyService";

describe("cross-feature contracts", () => {
  it("keeps Chinese and English shared i18n keys in lockstep", () => {
    expect(Object.keys(i18n.zh).sort()).toEqual(Object.keys(i18n.en).sort());
  });

  it("uses a low-friction AI fallback that never fabricates a deadline", () => {
    const result = fallbackTaskExtraction("下周整理宇宙交互");
    expect(result.tasks[0]?.title).toBe("下周整理宇宙交互");
    expect(result.tasks[0]?.dueAt).toBeNull();
    expect(result.tasks[0]?.duePrecision).toBe("unknown");
  });

  it("anchors weekly reports to Monday and exposes deployable schedules", () => {
    expect(mondayUtc(new Date("2026-08-23T10:00:00.000Z")).toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(cronByKind.time_facts).toBe("0 */5 * * * *");
    expect(cronByKind.weekly_preview).toBeTruthy();
    expect(cronByKind.weekly_final).toBeTruthy();
  });
});
