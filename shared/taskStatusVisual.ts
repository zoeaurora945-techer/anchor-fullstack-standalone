/**
 * 统一的卫星（任务）视觉状态，供 AnchorGalaxy（Three.js）和 SubSpaceView（CSS）共用。
 *
 * 颜色方案（金色阶梯，对齐 2026-09-01 设计）：
 *   todo        → 淡灰 #cbd5e1 + 淡金虚线环
 *   doing       → 亮金 #fbbf24
 *   done/dropped→ 暗金 #b45309 + 金光环
 *   overdue(<24h)→ 红色 #ef4444 + 脉冲
 *   breach(>=24h)→ 纯暗灰 #4b5563 无环
 */
export const BREACH_GRACE_MS = 24 * 60 * 60 * 1000;

export type TaskVisual = {
  visual: "todo" | "in_progress" | "completed" | "overdue" | "breach";
  dotColor: string;
  ringColor: string | null;
  ringDashed: boolean;
  pulse: boolean;
  emissiveIntensity: number;
};

export function taskVisualState(task: {
  status: string;
  dueAt: string | Date | null;
  firstBreachedAt: string | Date | null;
}, now: Date): TaskVisual {
  const dueDate = task.dueAt instanceof Date ? task.dueAt : task.dueAt ? new Date(task.dueAt) : null;
  const breachedDate = task.firstBreachedAt instanceof Date ? task.firstBreachedAt : task.firstBreachedAt ? new Date(task.firstBreachedAt) : null;

  if (task.status === "done" || task.status === "dropped") {
    return {
      visual: "completed",
      dotColor: "#b45309",
      ringColor: "#fbbf24",
      ringDashed: false,
      pulse: false,
      emissiveIntensity: 0.5,
    };
  }
  if (breachedDate) {
    return {
      visual: "breach",
      dotColor: "#4b5563",
      ringColor: null,
      ringDashed: false,
      pulse: false,
      emissiveIntensity: 0.5,
    };
  }
  if (task.status === "doing") {
    return {
      visual: "in_progress",
      dotColor: "#fbbf24",
      ringColor: null,
      ringDashed: false,
      pulse: false,
      emissiveIntensity: 1.8,
    };
  }
  // todo：检查是否逾期
  if (dueDate) {
    const overdueMs = now.getTime() - dueDate.getTime();
    if (overdueMs > 0) {
      if (overdueMs > BREACH_GRACE_MS) {
        return {
          visual: "breach",
          dotColor: "#4b5563",
          ringColor: null,
          ringDashed: false,
          pulse: false,
          emissiveIntensity: 0.5,
        };
      }
      return {
        visual: "overdue",
        dotColor: "#ef4444",
        ringColor: null,
        ringDashed: false,
        pulse: true,
        emissiveIntensity: 1.2,
      };
    }
  }
  return {
    visual: "todo",
    dotColor: "#cbd5e1",
    ringColor: "#fbbf24",
    ringDashed: true,
    pulse: false,
    emissiveIntensity: 0.5,
  };
}

/**
 * 项目状态标签（多语言）。
 * entityStatus: active / paused / completed / archived
 */
export const ENTITY_STATUS_LABEL: Record<string, { zh: string; en: string }> = {
  active: { zh: "进行中", en: "Active" },
  paused: { zh: "已暂停", en: "Paused" },
  completed: { zh: "已完成", en: "Completed" },
  archived: { zh: "已归档", en: "Archived" },
};

/**
 * 任务状态标签（多语言）。
 * task.status: todo / doing / done / dropped
 */
export const TASK_STATUS_LABEL: Record<string, { zh: string; en: string }> = {
  todo: { zh: "待办", en: "Todo" },
  doing: { zh: "进行中", en: "Doing" },
  done: { zh: "已完成", en: "Done" },
  dropped: { zh: "已放弃", en: "Dropped" },
};
