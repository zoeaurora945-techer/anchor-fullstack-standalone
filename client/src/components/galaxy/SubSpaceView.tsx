import { useState, useEffect, useMemo } from "react";
import { X, Star, Pencil } from "lucide-react";
import { t, type Language } from "@/lib/i18n";
import { taskVisualState, ENTITY_STATUS_LABEL, TASK_STATUS_LABEL, type TaskVisual } from "@shared/taskStatusVisual";

export type SubGoal = { id: string; title: string; color: string };
export type SubProject = { id: string; title: string; color: string | null; status: string; goalId: string | null };
export type SubTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  projectId: string | null;
  firstBreachedAt: string | null;
};

/** CSS 版本：返回 dot/ring/pulse 三元组，供 SubSpaceView 内联样式使用。 */
function taskDotStyle(task: SubTask, now: Date): { dot: string; ring: string | null; pulse: boolean } {
  const vs = taskVisualState(task, now);
  return {
    dot: vs.dotColor,
    ring: vs.ringColor ?? null,
    pulse: vs.pulse,
  };
}

const keyframes = `
@keyframes subspace-spin { to { transform: rotate(360deg); } }
@keyframes subspace-spin-rev { to { transform: rotate(-360deg); } }
`;

export function SubSpaceView({
  goal,
  projects,
  tasks,
  language,
  onClose,
  onEditGoal,
  onEditProject,
  onEditTask,
}: {
  goal: SubGoal;
  projects: SubProject[];
  tasks: SubTask[];
  language: Language;
  onClose: () => void;
  onEditGoal: (goal: SubGoal) => void;
  onEditProject: (project: SubProject) => void;
  onEditTask: (task: SubTask) => void;
}) {
  const copy = t(language);
  const [now, setNow] = useState(new Date());
  // 每秒更新 now，使卫星颜色/计数实时刷新
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const projList = useMemo(() => projects.filter((p) => p.goalId === goal.id), [projects, goal.id]);
  const tasksByProject = useMemo(() => {
    const map: Record<string, SubTask[]> = {};
    for (const tk of tasks) {
      if (tk.projectId) (map[tk.projectId] ??= []).push(tk);
    }
    return map;
  }, [tasks]);

  const golden = Math.PI * (3 - Math.sqrt(5));

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#070d20]">
      <style>{keyframes}</style>

      {/* 顶栏 */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0a1430]/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/15"
          >
            <X className="h-4 w-4" />{copy.backToUniverse}
          </button>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: goal.color, boxShadow: `0 0 10px 2px ${goal.color}` }} />
            <span className="text-sm font-semibold text-white">{goal.title}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">{copy.subSpace}</span>
          </div>
        </div>
        <button
          onClick={() => onEditGoal(goal)}
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/15"
        >
          <Pencil className="h-3.5 w-3.5" />{language === "zh" ? "编辑主线" : "Edit path"}
        </button>
      </header>

      {/* 子空间主体 */}
      <div className="relative flex-1 overflow-hidden">
        {/* 背景星尘 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: "radial-gradient(circle at 50% 50%, rgba(40,70,140,0.25), transparent 60%), radial-gradient(circle at 20% 80%, rgba(120,90,200,0.12), transparent 40%)" }}
        />
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-center text-[11px] text-white/40">
          {copy.subSpaceHint}
        </p>

        {projList.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-center text-sm text-white/60">
              {copy.noPlanets}
            </div>
          </div>
        ) : (
          <div className="absolute left-1/2 top-1/2 h-0 w-0">
            {/* 中央恒星（主线） */}
            <button
              onClick={() => onEditGoal(goal)}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ width: 0, height: 0 }}
              aria-label={goal.title}
            >
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition group-hover:scale-110"
                style={{
                  width: 84,
                  height: 84,
                  background: `radial-gradient(circle at 35% 35%, #fff, ${goal.color} 55%, ${goal.color}99 100%)`,
                  boxShadow: `0 0 50px 10px ${goal.color}aa, 0 0 110px 30px ${goal.color}55`,
                }}
              />
              <span className="absolute left-1/2 top-[58px] w-28 -translate-x-1/2 text-center text-xs font-medium text-white/90">
                {goal.title.length > 8 ? goal.title.slice(0, 8) + "…" : goal.title}
              </span>
            </button>

            {/* 行星（项目） + 卫星（任务） */}
            {projList.map((proj, i) => {
              const radius = 150 + i * 70;
              const duration = 46 + i * 9;
              const satList = tasksByProject[proj.id] ?? [];
              const projColor = proj.color ?? "#7FB5D6";
              const projStatus = ENTITY_STATUS_LABEL[proj.status]?.[language] ?? proj.status;
              return (
                <div
                  key={proj.id}
                  className="absolute left-0 top-0"
                  style={{ animation: `subspace-spin ${duration}s linear infinite`, transformOrigin: "0 0" }}
                >
                  {/* 行星定位锚点（随轨道公转，自身不旋转） */}
                  <div className="absolute" style={{ left: radius, top: 0 }}>
                    {/* 反向旋转层：抵消公转自转，使内容保持正向；卫星的环绕由内圈动画叠加 */}
                    <div
                      className="absolute left-0 top-0"
                      style={{ transformOrigin: "0 0", animation: `subspace-spin-rev ${duration}s linear infinite` }}
                    >
                      {/* 行星（项目） */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditProject(proj); }}
                        className="group absolute left-0 top-0 block -translate-x-1/2 -translate-y-1/2"
                        aria-label={proj.title}
                      >
                        <span
                          className="block rounded-full transition group-hover:scale-110"
                          style={{
                            width: 46,
                            height: 46,
                            background: `radial-gradient(circle at 35% 30%, #ffffffcc, ${projColor} 60%, ${projColor}aa 100%)`,
                            boxShadow: `0 0 22px 4px ${projColor}88`,
                          }}
                        />
                        <span className="absolute left-1/2 top-[30px] w-28 -translate-x-1/2 text-center text-[11px] font-medium text-white/85">
                          {proj.title.length > 7 ? proj.title.slice(0, 7) + "…" : proj.title}
                          <span className="block text-[9px] text-white/45">{projStatus}</span>
                        </span>
                      </button>

                      {/* 卫星（任务）环绕行星 */}
                      {satList.slice(0, 10).map((tk, j) => {
                        const satR = 60 + (j % 3) * 16;
                        const satDur = 13 + j * 2.5;
                        const c = taskDotStyle(tk, now);
                        return (
                          <div
                            key={tk.id}
                            className="absolute left-0 top-0"
                            style={{ transformOrigin: "0 0", animation: `subspace-spin ${satDur}s linear infinite`, animationDelay: `-${j * 1.7}s` }}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); onEditTask(tk); }}
                              className="absolute left-0 top-0 block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition hover:scale-150"
                              style={{ left: satR, top: 0, background: c.dot, boxShadow: c.ring ? `0 0 8px 1px ${c.ring}` : undefined }}
                              title={tk.title}
                              aria-label={tk.title}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
