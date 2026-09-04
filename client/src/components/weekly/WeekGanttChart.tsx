import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { t, type Language } from "@/lib/i18n";
import {
  ZoomIn, ZoomOut, MoveHorizontal, ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils";

// ─── 类型 ────────────────────────────────────────────────────────────────────

/** 扁平任务（替代原来的 GanttProject 嵌套结构） */
export type FlatTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  createdAt: string | null;
  doneAt: string | null;
  estimatedMinutes: number | null;
  projectId: string | null;
  /** 项目颜色（用于任务条着色） */
  projectColor?: string;
  /** 项目标题（用于 tooltip） */
  projectTitle?: string;
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
  tasks,
  language,
  onEditTask,
  onUpdateDue,
}: {
  tasks: FlatTask[];
  language: Language;
  onEditTask?: (task: FlatTask) => void;
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

  // 拖拽改截止时间
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
    if (newDue >= weekStart && newDue <= weekStart + 14 * DAY_MS) {
      onUpdateDue(resizingTask.id, newDue.toISOString());
    }
    setResizingTask(null);
  }, [resizingTask, dayWidth, weekStart, onUpdateDue]);

  // 全局监听 mousemove + mouseup 来结束调整大小
  useEffect(() => {
    const onDocMouseMove = (e: MouseEvent) => {
      lastMouseX.current = e.clientX;
    };
    const onDocMouseUp = () => {
      if (resizingTask) handleResizeEnd();
    };
    if (resizingTask) {
      document.addEventListener("mousemove", onDocMouseMove);
    }
    document.addEventListener("mouseup", onDocMouseUp);
    return () => {
      document.removeEventListener("mousemove", onDocMouseMove);
      document.removeEventListener("mouseup", onDocMouseUp);
    };
  }, [resizingTask, handleResizeEnd]);

  const todayIdx = useMemo(() => {
    return days.findIndex((d) => d.date.toDateString() === today.toDateString());
  }, [days, today]);

  const scrollToToday = useCallback(() => setScrollX(Math.max(0, todayIdx * dayWidth - 200)), [todayIdx, dayWidth]);

  // 任务按创建时间排序
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });
  }, [tasks]);

  const rowHeight = 36;
  const rowGap = 2;

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

      {/* ── 甘特图主体（扁平任务列表）── */}
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-card"
        style={{ height: Math.max(sortedTasks.length * (rowHeight + rowGap) + 40, 120) }}
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

            {/* 扁平任务行 */}
            {sortedTasks.map((task, ti) => {
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
              const topOffset = ti * (rowHeight + rowGap);

              const startStr = formatShortDate(new Date(clampedStart));
              const endStr = formatShortDate(new Date(clampedEnd));
              const tip = `${task.title}${task.projectTitle ? ` · ${task.projectTitle}` : ""} · ${STATUS_LABEL[task.status] ?? task.status} · ${startStr} → ${endStr}${noDue ? "（无截止）" : ""}`;

              const taskColor = task.projectColor || STATUS_COLOR[task.status] || STATUS_COLOR.todo;

              return (
                <div
                  key={task.id}
                  className="relative border-b border-border/20"
                  style={{ height: rowHeight }}
                >
                  {/* 任务条形图 */}
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 h-5 rounded text-[9px] font-medium text-white flex items-center px-1 overflow-hidden cursor-pointer transition-opacity hover:opacity-90",
                      STATUS_BG[task.status] ?? STATUS_BG.todo,
                      noDue && "border-dashed opacity-75",
                    )}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: isDone ? undefined : taskColor,
                      borderRight: noDue ? "3px dashed var(--ring)" : undefined,
                    }}
                    title={tip}
                    onClick={() => onEditTask?.(task)}
                  >
                    <span className="truncate pr-2">{task.title.length > 16 ? task.title.slice(0, 16) + "…" : task.title}</span>
                    {isDone && <span className="ml-0.5 shrink-0">✓</span>}

                    {/* 拖拽手柄（右端） */}
                    {!noDue && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/40 rounded-r transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (!task.dueAt) return;
                          handleResizeStart(e, task.id, task.dueAt);
                        }}
                        title={language === "zh" ? "拖拽调整截止时间" : "Drag to adjust due date"}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 空状态 */}
        {sortedTasks.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {language === "zh" ? "创建任务后，甘特图将在此显示进度" : "Create tasks to see progress here"}
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
