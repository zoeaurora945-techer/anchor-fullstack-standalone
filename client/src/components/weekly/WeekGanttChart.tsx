import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { t, type Language } from "@/lib/i18n";
import { ZoomIn, ZoomOut, MoveHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type GanttProject = {
  id: string;
  title: string;
  color: string;
  status: string;
  tasks: Array<{ id: string; status: string; dueAt: Date | null; estimatedMinutes: number | null }>;
};

const STATUS_COLOR: Record<string, string> = {
  todo: "#60a5fa",
  doing: "#f59e0b",
  done: "#34d399",
  dropped: "#94a3b8",
};

const STATUS_BG: Record<string, string> = {
  todo: "bg-blue-400/20 border-blue-400/40",
  doing: "bg-amber-400/20 border-amber-400/40",
  done: "bg-emerald-400/20 border-emerald-400/40",
  dropped: "bg-slate-400/20 border-slate-400/40",
};

/** 获取指定日期所在周的周一（0=周日）*/
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7; // 1=Mon..7=Sun
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 生成 14 天网格 */
function buildDayGrid(weekStart: Date): Array<{ label: string; date: Date; isWeekend: boolean }> {
  const days = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"];
  const zh = ["日", "一", "二", "三", "四", "五", "六"];
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { label: zh[d.getDay()], date: d, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
  });
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

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => getWeekStart(today), [today]);
  const days = useMemo(() => buildDayGrid(weekStart), [weekStart]);

  const dayWidth = 48 * zoom;
  const totalWidth = days.length * dayWidth;

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

  const groupByStatus = (tasks: GanttProject["projects"][number]["tasks"]) => {
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
      <div className="flex items-center justify-between gap-2">
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
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ChevronLeft className="h-4 w-4 cursor-pointer hover:text-foreground" onClick={() => setScrollX((x) => Math.max(0, x - dayWidth))} />
          <span>{days[0].date.toLocaleDateString()} ~ {days[days.length - 1].date.toLocaleDateString()}</span>
          <ChevronRight className="h-4 w-4 cursor-pointer hover:text-foreground" onClick={() => setScrollX((x) => x + dayWidth)} />
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
                {/* 日期标签 */}
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
              const doneTasks = project.tasks.filter((t) => t.status === "done");
              const progress = project.tasks.length > 0 ? Math.round((doneTasks.length / project.tasks.length) * 100) : 0;

              return (
                <div
                  key={project.id}
                  className="relative flex items-center border-b border-border/30 px-2"
                  style={{ height: 44, paddingLeft: 8 }}
                >
                  {/* 项目名称 + 进度 */}
                  <div className="shrink-0 pr-2" style={{ width: 140 * zoom }}>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: project.color || "#60a5fa" }}
                      />
                      <span className="truncate text-xs font-medium">{project.title}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${progress}%`, backgroundColor: project.color || "#60a5fa" }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{progress}%</span>
                    </div>
                  </div>

                  {/* 状态图例 */}
                  <div className="absolute right-2 top-0 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {Object.entries(group).map(([status, data]) => (
                      <span key={status} className="flex items-center gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
                        {data.count}
                      </span>
                    ))}
                  </div>

                  {/* 任务条形图 */}
                  <div className="relative flex-1" style={{ marginLeft: 140 * zoom }}>
                    {project.tasks.map((task, ti) => {
                      const dueDate = task.dueAt ? new Date(task.dueAt) : null;
                      if (!dueDate) return null;

                      const taskStart = Math.max(0, dueDate.getTime() - (weekStart.getTime()) );
                      const duration = 2 * 24 * 60 * 60 * 1000; // 2天宽度
                      const leftPct = (taskStart / (days.length * 24 * 60 * 60 * 1000)) * 100;
                      const widthPct = (duration / (days.length * 24 * 60 * 60 * 1000)) * 100;

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "absolute top-1/2 h-5 -translate-y-1/2 rounded text-[9px] font-medium text-white flex items-center px-1 overflow-hidden",
                            STATUS_BG[task.status] ?? STATUS_BG.todo,
                          )}
                          style={{
                            left: `${leftPct}%`,
                            width: `${Math.max(widthPct, 2)}%`,
                          }}
                          title={`${task.title} · ${task.status}`}
                        >
                          <span className="truncate">{task.title}</span>
                        </div>
                      );
                    })}
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
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />{copy.todo}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />{copy.statusActive === "Active" ? "Doing" : "进行中"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />{copy.statusCompleted === "Completed" ? "Done" : "已完成"}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px]">{copy.ganttZoomIn}</span>
          <span className="font-mono text-xs">{Math.round(zoom * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
