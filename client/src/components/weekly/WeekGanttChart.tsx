import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { t, type Language } from "@/lib/i18n";
import {
  ZoomIn, ZoomOut, MoveHorizontal, ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils";

// ─── 类型 ────────────────────────────────────────────────────────────────────

export type GanttProject = {
  id: string;
  title: string;
  color: string;
  status: string;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    createdAt: string | null;
    doneAt: string | null;
    estimatedMinutes: number | null;
  }>;
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7; // 1=Mon..7=Sun
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDayGrid(weekStart: Date): Array<{ label: string; date: Date; isWeekend: boolean }> {
  const zh = ["日", "一", "二", "三", "四", "五", "六"];
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { label: zh[d.getDay()], date: d, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
  });
}

/** 根据时间重叠分配 Y 行（同一项目内多个任务不同时占同一行）*/
function assignLanes(tasks: GanttProject["tasks"]): number[] {
  if (tasks.length <= 1) return tasks.map(() => 0);
  const sorted = tasks.map((_, i) => i).sort((a, b) => {
    const sa = slotOf(tasks[a]);
    const sb = slotOf(tasks[b]);
    return (sa.start ?? 0) - (sb.start ?? 0);
  });
  const lanes: number[] = new Array(tasks.length).fill(0);
  const active: Array<{ end: number; lane: number }> = [];
  for (const idx of sorted) {
    const s = slotOf(tasks[idx]);
    const start = s.start ?? 0;
    // 找第一个不重叠的 lane
    let lane = 0;
    const alive = active.filter((a) => a.end > start);
    // 重新计算：从 0 开始找空闲 lane
    const usedLanes = new Set(alive.map((a) => a.lane));
    while (usedLanes.has(lane)) lane++;
    lanes[idx] = lane;
    // 把旧 active 里已过期的去掉，加入新的
    const kept = active.filter((a) => a.end > start);
    kept.push({ end: s.end ?? 0, lane });
    // 重排
    kept.sort((a, b) => a.end - b.end);
    active.length = 0;
    active.push(...kept);
  }
  return lanes;
}

function slotOf(t: GanttProject["tasks"][number]) {
  const created = t.createdAt ? new Date(t.createdAt).getTime() : null;
  const done = t.doneAt ? new Date(t.doneAt).getTime() : null;
  const due = t.dueAt ? new Date(t.dueAt).getTime() : null;
  let start: number | null = created ?? (due ?? null);
  let end: number | null = done ?? due ?? (start !== null ? start + DAY_MS : null);
  if (end && end < (start ?? 0)) end = (start ?? 0) + DAY_MS;
  return { start, end };
}

// ─── 状态颜色 ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  todo: "#60a5fa",
  doing: "#f59e0b",
  done: "#34d399",
  dropped: "#94a3b8",
};

const STATUS_BG: Record<string, string> = {
  todo: "bg-blue-400/25 border-blue-400/50",
  doing: "bg-amber-400/25 border-amber-400/50",
  done: "bg-emerald-400/30 border-emerald-400/60",
  dropped: "bg-slate-400/20 border-slate-400/40",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  dropped: "已放弃",
};

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export function WeekGanttChart({
  projects,
  language,
  onEditTask,
  onUpdateDue,
}: {
  projects: GanttProject[];
  language: Language;
  onEditTask?: (task: GanttProject["tasks"][number]) => void;
  onUpdateDue?: (taskId: string, newDueAt: string) => void;
}) {
  const copy = t(language);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  // 拖拽改截止时间
  const [resizingTask, setResizingTask] = useState<{ id: string; startClientX: number; originalDue: string } | null>(null);

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(
    () => getWeekStart(new Date(today.getTime() + weekOffset * 7 * DAY_MS)),
    [today, weekOffset],
  );
  const days = useMemo(() => buildDayGrid(weekStart), [weekStart]);

  const dayWidth = 48 * zoom;
  const totalWidth = days.length * dayWidth;
  const windowStart = weekStart.getTime();
  const windowEnd = weekStart.getTime() + days.length * DAY_MS;
  const windowMs = windowEnd - windowStart;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart(e.clientX - scrollX);
  }, [scrollX]);

  const lastMouseX = useRef(0);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    lastMouseX.current = e.clientX;
    if (!dragging) return;
    setScrollX(Math.max(0, e.clientX - dragStart));
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  // 拖拽改截止时间 - 全局监听 mouseup
  const handleResizeStart = useCallback((e: React.MouseEvent, taskId: string, originalDue: string) => {
    e.stopPropagation();
    setResizingTask({ id: taskId, startClientX: e.clientX, originalDue });
  }, []);

  const handleResizeEnd = useCallback(() => {
    if (!resizingTask || !onUpdateDue) return;
    const dx = lastMouseX.current - resizingTask.startClientX;
    const daysShift = Math.round(dx / dayWidth);
    const originalDue = new Date(resizingTask.originalDue);
    const newDue = new Date(originalDue.getTime() + daysShift * DAY_MS);
    // 只在工作日范围内调整（不超过窗口）
    if (newDue >= weekStart && newDue <= weekStart + 14 * DAY_MS) {
      onUpdateDue(resizingTask.id, newDue.toISOString());
    }
    setResizingTask(null);
  }, [resizingTask, dayWidth, weekStart, onUpdateDue]);

  // 全局监听 mouseup 来结束调整大小
  useEffect(() => {
    const onDocMouseUp = () => {
      if (resizingTask) handleResizeEnd();
    };
    document.addEventListener("mouseup", onDocMouseUp);
    return () => document.removeEventListener("mouseup", onDocMouseUp);
  }, [resizingTask, handleResizeEnd]);

  const todayIdx = useMemo(() => {
    return days.findIndex((d) => d.date.toDateString() === today.toDateString());
  }, [days, today]);

  const scrollToToday = useCallback(() => setScrollX(Math.max(0, todayIdx * dayWidth - 200)), [todayIdx, dayWidth]);

  const groupByStatus = (tasks: GanttProject["tasks"]) => {
    const groups: Record<string, { count: number; totalMinutes: number }> = {};
    tasks.forEach((t) => {
      const s = t.status ?? "todo";
      if (!groups[s]) groups[s] = { count: 0, totalMinutes: 0 };
      groups[s].count++;
      groups[s].totalMinutes += t.estimatedMinutes ?? 0;
    });
    return groups;
  };

  // 每个项目内任务分配 Y 行
  const laneMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const proj of projects) {
      map[proj.id] = assignLanes(proj.tasks);
    }
    return map;
  }, [projects]);

  const maxLanesPerProject = useMemo(() => {
    let max = 1;
    for (const ids of Object.values(laneMap)) max = Math.max(max, ...ids.map((l) => l + 1));
    return max;
  }, [laneMap]);

  const rowHeight = 44;
  const rowGap = 4;

  return (
    <div className="space-y-3">
      {/* ── 工具栏：左=缩放/重置，右=周导航+日期范围 ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.25))} title={copy.ganttZoomIn}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} title={copy.ganttZoomOut}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={scrollToToday} title={copy.ganttReset}>
            <MoveHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 周导航 */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setWeekOffset((o) => o - 1)}
            title={language === "zh" ? "上一周" : "Previous week"}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={weekOffset === 0 ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setWeekOffset(0)}
          >
            <CalendarDays className="h-3 w-3" />
            {weekOffset === 0
              ? (language === "zh" ? "今天" : "Today")
              : `${formatShortDate(days[0].date)} ~ ${formatShortDate(days[days.length - 1].date)}`}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setWeekOffset((o) => o + 1)}
            title={language === "zh" ? "下一周" : "Next week"}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="ml-1 text-xs text-muted-foreground hidden sm:inline">
            {formatShortDate(days[0].date)} ~ {formatShortDate(days[days.length - 1].date)}
          </span>
        </div>
      </div>

      {/* ── 甘特图主体 ── */}
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-card"
        style={{ height: Math.max(projects.length * (rowHeight + rowGap) + 48, 120) }}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `translateX(${-scrollX}px)` }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div style={{ width: totalWidth, height: "100%" }} className="relative">
            {/* 列分隔线 */}
            {days.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "absolute top-0 bottom-0 border-r border-border/40",
                  day.isWeekend && "bg-muted/30",
                  i === todayIdx && "bg-primary/5",
                )}
                style={{ left: i * dayWidth, width: dayWidth }}
              >
                <div className={cn(
                  "sticky top-0 flex h-8 items-center justify-center text-[10px] font-medium border-b border-border/40",
                  day.isWeekend ? "text-muted-foreground" : "text-foreground",
                  i === todayIdx && "text-primary font-bold",
                )}>
                  {copy[(`day${day.label}` as any)] ?? day.label}
                  <span className="ml-0.5 text-[9px] opacity-60">{day.date.getDate()}</span>
                </div>
              </div>
            ))}

            {/* 今日竖线 */}
            {todayIdx >= 0 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/60"
                style={{ left: todayIdx * dayWidth + dayWidth / 2 }}
              />
            )}

            {/* 项目行 */}
            {projects.map((project, pi) => {
              const group = groupByStatus(project.tasks);
              const totalMinutes = project.tasks.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0) || 1;
              const completedMinutes = project.tasks.filter((t) => t.status === "done").reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);
              const progress = Math.round((completedMinutes / totalMinutes) * 100);
              const lanes = laneMap[project.id] ?? [];
              const maxLane = Math.max(...lanes, 0);
              const projectHeight = rowHeight + maxLane * 22 + rowGap;

              return (
                <div
                  key={project.id}
                  className="relative border-b border-border/30"
                  style={{ height: projectHeight }}
                >
                  {/* 任务条形图区域 */}
                  <div className="absolute inset-0">
                    {project.tasks.map((task, ti) => {
                      const created = task.createdAt ? new Date(task.createdAt) : null;
                      const done = task.doneAt ? new Date(task.doneAt) : null;
                      const due = task.dueAt ? new Date(task.dueAt) : null;

                      let start: number | null = created ?? (due ?? null);
                      let end: number | null = done ?? due ?? null;
                      if (!end) end = start !== null ? start + 2 * DAY_MS : Date.now();
                      if (end < (start ?? 0)) end = (start ?? 0) + DAY_MS;

                      // 不在窗口内则跳过
                      if (end < windowStart || start! > windowEnd) return null;

                      const clampedStart = Math.max(start!, windowStart);
                      const clampedEnd = Math.min(end, windowEnd);
                      const leftPct = ((clampedStart - windowStart) / windowMs) * 100;
                      const widthPct = Math.max(((clampedEnd - clampedStart) / windowMs) * 100, 1.5);

                      const isDone = task.status === "done";
                      const noDue = !task.dueAt && task.status !== "done";
                      const lane = lanes[ti] ?? 0;
                      const topOffset = lane * 22;

                      const startStr = formatShortDate(new Date(clampedStart));
                      const endStr = formatShortDate(new Date(clampedEnd));
                      const tip = `${task.title} · ${STATUS_LABEL[task.status] ?? task.status} · ${startStr} → ${endStr}${noDue ? "（无截止）" : ""}`;

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "absolute top-0 h-5 rounded text-[9px] font-medium text-white flex items-center px-1 overflow-hidden cursor-pointer transition-opacity hover:opacity-90",
                            STATUS_BG[task.status] ?? STATUS_BG.todo,
                            noDue && "border-dashed opacity-75",
                          )}
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            top: `${topOffset + 2}px`,
                            backgroundColor: isDone ? undefined : STATUS_COLOR[task.status] ?? STATUS_COLOR.todo,
                            borderRight: noDue ? "3px dashed var(--ring)" : undefined,
                          }}
                          title={tip}
                          onClick={() => onEditTask?.(task)}
                          draggable={!noDue}
                        >
                          {/* 拖拽改截止时间手柄（右端） */}
                          {!noDue && (
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-white/25 hover:bg-white/50 rounded-r transition-colors"
                              onMouseDown={(e) => handleResizeStart(e, task.id, task.dueAt!)}
                              title={language === "zh" ? "拖拽调整截止时间" : "Drag to adjust due date"}
                            />
                          )}
                          <span className="truncate pr-2">{task.title}</span>
                          {isDone && <span className="ml-0.5 shrink-0">✓</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* 项目名称 + 进度覆盖层 */}
                  <div
                    className="absolute left-0 top-0 z-10 flex items-center gap-1.5 px-2"
                    style={{ width: 140 * zoom, height: projectHeight, background: "linear-gradient(90deg, var(--card) 72%, transparent)" }}
                    title={project.title}
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: project.color || "#60a5fa" }}
                    />
                    <span className="truncate text-xs font-medium">{project.title}</span>
                  </div>
                  <div className="absolute left-2 bottom-0.5 z-10 flex items-center gap-1.5" style={{ width: 140 * zoom }}>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${progress}%`, backgroundColor: project.color || "#60a5fa" }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{progress}%</span>
                  </div>

                  {/* 状态图例（含 dropped） */}
                  <div className="absolute right-2 top-0 z-10 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {Object.entries(group).map(([status, data]) => (
                      <span key={status} className="flex items-center gap-0.5" title={`${STATUS_LABEL[status] ?? status}: ${data.count}`}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
                        {data.count}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 空状态 */}
        {projects.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {language === "zh" ? "创建项目后，甘特图将在此显示进度" : "Create projects to see progress here"}
          </div>
        )}
      </div>

      {/* ── 底部图例 ── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />{copy.todo}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />{language === "zh" ? "进行中" : "Doing"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />{copy.statusCompleted === "Completed" ? "Done" : "已完成"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />{language === "zh" ? "已放弃" : "Dropped"}</span>
          <span className="text-[10px] opacity-70">
            {language === "zh"
              ? "条=创建→完成；虚线框=无截止时间；拖右端调截止"
              : "Bar = creation→completion; dashed = no due date; drag right edge to adjust"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px]">{copy.ganttZoomIn}</span>
          <span className="font-mono text-xs">{Math.round(zoom * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
