import { useState, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { t, type Language } from "@/lib/i18n";
import { ZoomIn, ZoomOut, MoveHorizontal, ChevronLeft, ChevronRight, Edit2, GripVertical, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils";

export type GanttTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;       // ISO string or null
  createdAt: string | null;   // ISO string or null
  doneAt: string | null;      // ISO string or null
  estimatedMinutes: number | null;
};

export type GanttProject = {
  id: string;
  title: string;
  color: string;
  status: string;
  tasks: GanttTask[];
  onTaskClick?: (task: GanttTask) => void;
};

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

const DAY_MS = 24 * 60 * 60 * 1000;

/** 获取指定日期所在周的周一（0=周日）*/
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 生成 N 天网格 */
function buildDayGrid(weekStart: Date, count: number): Array<{ label: string; date: Date; isWeekend: boolean }> {
  const zh = ["日", "一", "二", "三", "四", "五", "六"];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { label: zh[d.getDay()], date: d, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
  });
}

/** 解析 ISO 日期字符串为 Date（失败返回 null）*/
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function WeekGanttChart({
  projects,
  language,
}: {
  projects: GanttProject[];
  language: Language;
}) {
  const copy = t(language);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);

  /** 日期偏移（以周为单位，0=本周，-1=上周，-2=上上周，1=下周） */
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => {
    const s = getWeekStart(today);
    s.setDate(s.getDate() + weekOffset * 7);
    return s;
  }, [today, weekOffset]);

  // 扩展窗口：±3 天，覆盖跨周任务
  const windowDays = 21;
  const days = useMemo(() => buildDayGrid(weekStart, windowDays), [weekStart]);
  const dayWidth = 48 * zoom;
  const totalWidth = days.length * dayWidth;
  const windowStart = weekStart.getTime();
  const windowEnd = weekStart.getTime() + windowDays * DAY_MS;
  const windowMs = windowEnd - windowStart;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart(e.clientX - scrollX);
  }, [scrollX]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setScrollX(Math.max(0, e.clientX - dragStart));
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const todayIdx = useMemo(() => {
    return days.findIndex((d) => d.date.toDateString() === today.toDateString());
  }, [days, today]);

  const scrollToToday = useCallback(() => {
    const targetX = Math.max(0, todayIdx * dayWidth - 200);
    setScrollX(targetX);
  }, [todayIdx, dayWidth]);

  /** 给同一项目内的任务计算 Y 偏移（错开显示，避免重叠） */
  const taskRows = useMemo(() => {
    const result: Array<{ project: GanttProject; task: GanttTask; y: number }> = [];
    for (const proj of projects) {
      const tasksInRow = proj.tasks.filter((t) => {
        const created = parseDate(t.createdAt);
        const done = parseDate(t.doneAt);
        const due = parseDate(t.dueAt);
        let start = created ?? (due ? new Date(due.getTime() - DAY_MS) : new Date());
        let end = done ?? due ?? new Date(start.getTime() + DAY_MS);
        if (end.getTime() < start.getTime()) end = new Date(start.getTime() + DAY_MS);
        // 任务与 21 天窗口有交集才显示
        return !(end.getTime() < windowStart || start.getTime() > windowEnd);
      });
      tasksInRow.forEach((task, i) => {
        result.push({ project: proj, task, y: i });
      });
    }
    return result;
  }, [projects, windowStart, windowEnd]);

  /** 按 project.id → task 在行内的 Y 索引映射 */
  const taskYMap = useMemo(() => {
    const map = new Map<string, number>();
    taskRows.forEach((r) => map.set(r.project.id + "|" + r.task.id, r.y));
    return map;
  }, [taskRows]);

  // ─── 拖拽改期（Drag to reschedule）───
  const dragTaskRef = useRef<{ taskId: string; projectTitle: string; startX: number; origDueStr: string | null } | null>(null);

  const handleBarDragStart = useCallback((e: React.MouseEvent, task: GanttTask, projectTitle: string) => {
    e.stopPropagation();
    dragTaskRef.current = {
      taskId: task.id,
      projectTitle,
      startX: e.clientX,
      origDueStr: task.dueAt,
    };
    setDragging(true);
  }, []);

  const handleBarDragMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragTaskRef.current) return;
    const dx = e.clientX - dragTaskRef.current.startX;
    const dayDelta = Math.round(dx / dayWidth);
    const origDue = parseDate(dragTaskRef.current.origDueStr);
    if (!origDue) return;
    const newDue = new Date(origDue.getTime() + dayDelta * DAY_MS);
    // TODO: 调用 trpc.task.update 或回调
    // for now just log
    console.log(`[Gantt] drag reschedule ${dragTaskRef.current.taskId} → ${newDue.toISOString()} (${dayDelta} days)`);
  }, [dragging, dayWidth]);

  const handleBarDragEnd = useCallback(() => {
    setDragging(false);
    dragTaskRef.current = null;
  }, []);

  const groupByStatus = (tasks: GanttTask[]) => {
    const groups: Record<string, { count: number; totalMinutes: number }> = {};
    tasks.forEach((t) => {
      const s = t.status ?? "todo";
      if (!groups[s]) groups[s] = { count: 0, totalMinutes: 0 };
      groups[s].count++;
      groups[s].totalMinutes += t.estimatedMinutes ?? 0;
    });
    return groups;
  };

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
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

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ChevronLeft
            className="h-4 w-4 cursor-pointer hover:text-foreground transition"
            onClick={() => setScrollX((x) => Math.max(0, x - dayWidth))}
          />
          <span>{formatShortDate(days[0].date)} ~ {formatShortDate(days[days.length - 1].date)}</span>
          <ChevronRight
            className="h-4 w-4 cursor-pointer hover:text-foreground transition"
            onClick={() => setScrollX((x) => x + dayWidth)}
          />

          {/* 日期选择器：右上角切换周 */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setWeekDropdownOpen((v) => !v)}
            >
              <Clock3 className="h-3 w-3" />
              {weekOffset === 0
                ? (language === "zh" ? "本周" : "This week")
                : weekOffset === -1
                ? (language === "zh" ? "上周" : "Last week")
                : weekOffset === -2
                ? (language === "zh" ? "上上周" : "2 weeks ago")
                : weekOffset === 1
                ? (language === "zh" ? "下周" : "Next week")
                : `${weekOffset > 0 ? "+" : ""}${weekOffset}w`}
              <ChevronLeft className={cn("h-3 w-3 transition", weekDropdownOpen && "rotate-90")} />
            </Button>
            {weekDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setWeekDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-xl border border-border bg-card p-1 shadow-lg">
                  {([
                    { v: -2, zh: "上上周", en: "2 weeks ago" },
                    { v: -1, zh: "上周", en: "Last week" },
                    { v: 0,  zh: "本周", en: "This week" },
                    { v: 1,  zh: "下周", en: "Next week" },
                    { v: 2,  zh: "下下周", en: "2 weeks ahead" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.v}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
                        weekOffset === opt.v
                          ? "bg-primary/15 font-medium text-primary"
                          : "hover:bg-muted",
                      )}
                      onClick={() => { setWeekOffset(opt.v); setWeekDropdownOpen(false); }}
                    >
                      {language === "zh" ? opt.zh : opt.en}
                      {opt.v === 0 && <span className="ml-auto text-[9px] text-muted-foreground">←</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 甘特图主体 */}
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-card"
        style={{ height: Math.max(projects.length * 44 + 48, 120) }}
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
            {projects.map((project) => {
              const group = groupByStatus(project.tasks);
              const totalMinutes = project.tasks.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0) || 1;
              const completedMinutes = project.tasks.filter((t) => t.status === "done").reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);
              const progress = Math.round((completedMinutes / totalMinutes) * 100);

              return (
                <div
                  key={project.id}
                  className="relative border-b border-border/30"
                  style={{ height: 44 }}
                >
                  {/* 任务条形图 */}
                  <div className="absolute inset-0">
                    {project.tasks.map((task) => {
                      const created = parseDate(task.createdAt);
                      const done = parseDate(task.doneAt);
                      const due = parseDate(task.dueAt);
                      const noDue = !due && task.status !== "done";

                      let start = created ?? (due ? new Date(due.getTime() - DAY_MS) : new Date());
                      let end = done ?? due ?? null;
                      if (!end) end = new Date(start.getTime() + 2 * DAY_MS);
                      if (end.getTime() < start.getTime()) end = new Date(start.getTime() + DAY_MS);

                      // 与 21 天窗口有交集才渲染（不截断，超出边界也画一部分）
                      if (end.getTime() < windowStart && start.getTime() > windowEnd) return null;

                      const clampedStart = Math.max(start.getTime(), windowStart);
                      const clampedEnd = Math.min(end.getTime(), windowEnd);
                      const leftPct = ((clampedStart - windowStart) / windowMs) * 100;
                      const widthPct = Math.max(((clampedEnd - clampedStart) / windowMs) * 100, 1.5);

                      const isDone = task.status === "done";
                      const startStr = formatShortDate(new Date(clampedStart));
                      const endStr = formatShortDate(new Date(clampedEnd));
                      const tip = `${task.title} · ${STATUS_LABEL[task.status] ?? task.status} · ${startStr} → ${endStr}${noDue ? "（无截止）" : ""}`;

                      // Y 轴偏移：同项目内多任务错开
                      const yIdx = taskYMap.get(project.id + "|" + task.id) ?? 0;
                      const rowHeight = 44;
                      const maxPerRow = 3;
                      const yOff = Math.min(yIdx, maxPerRow - 1) * 12;
                      const barTop = 8 + yOff;
                      const barHeight = Math.min(28, rowHeight - yOff - 8);

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "absolute top-0 rounded text-[9px] font-medium text-white flex items-center overflow-hidden cursor-pointer transition hover:brightness-110",
                            isDone ? STATUS_BG.done : noDue ? "border-dashed border-2 bg-transparent" : cn("border", STATUS_BG[task.status] ?? STATUS_BG.todo),
                          )}
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            top: `${barTop}px`,
                            height: `${barHeight}px`,
                            ...(isDone ? {} : {
                              backgroundColor: STATUS_COLOR[task.status] ?? STATUS_COLOR.todo,
                              opacity: noDue ? 0.5 : 0.85,
                            }),
                          }}
                          title={tip}
                          onClick={() => project.onTaskClick?.(task)}
                          onMouseDown={(e) => handleBarDragStart(e, task, project.title)}
                        >
                          {/* 拖拽手柄（右侧小条） */}
                          {!isDone && (
                            <span className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-white/20 hover:bg-white/40 rounded-r transition" />
                          )}
                          <span className="truncate px-1">{task.title}</span>
                          {isDone && <span className="ml-0.5 shrink-0">✓</span>}
                          {noDue && <span className="ml-0.5 shrink-0 text-[8px] opacity-70">∞</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* 项目名称 + 进度（z-10 覆盖层） */}
                  <div
                    className="absolute left-0 top-0 bottom-0 z-10 flex items-center gap-1.5 px-2 group"
                    style={{ width: 140 * zoom, background: "linear-gradient(90deg, var(--card) 72%, transparent)" }}
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

      {/* 底部说明 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />{copy.todo}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />{language === "zh" ? "进行中" : "Doing"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />{copy.statusCompleted === "Completed" ? "Done" : "已完成"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />{language === "zh" ? "已放弃" : "Dropped"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-slate-400/60 bg-transparent" />{language === "zh" ? "无截止" : "No due"}</span>
          <span className="text-[10px]">{language === "zh" ? "拖拽右侧可改截止日期" : "Drag right edge to reschedule"}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px]">{copy.ganttZoomIn}</span>
          <span className="font-mono text-xs">{Math.round(zoom * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
