import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Clock3, Target, Play, Pause, CheckCircle2, Star, Edit2, Sparkles, Orbit, UsersRound, ShieldCheck, Cloud, TimerReset, Stars, Plus, Check, X, Pencil, ZoomIn, ZoomOut, MoveHorizontal, ChevronLeft, ChevronRight, Trash2, Mic } from "lucide-react";
import { t, type Language } from "@/lib/i18n";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn, formatShortDate, formatTime } from "@/lib/utils";
import { GoalEditor } from "@/components/galaxy/GoalEditor";
import { ProjectEditor } from "@/components/galaxy/ProjectEditor";
import { WeekGanttChart } from "@/components/weekly/WeekGanttChart";
import { AnchorGalaxy, type GoalSelection } from "@/components/AnchorGalaxy";
import { SubSpaceView, type SubGoal, type SubProject, type SubTask } from "@/components/galaxy/SubSpaceView";
import { BoardModeSwitch } from "@/components/quadrant/BoardModeSwitch";
import { TaskListPanel } from "@/components/tasks/TaskListPanel";
import { TaskEditorDialog } from "@/components/tasks/TaskEditorDialog";
import { UniverseArchive } from "@/components/UniverseArchive";

type View = "today" | "week" | "universe" | "nebula" | "settings";

// 列顺序：重要紧急 → 重要不紧急 → 不重要但紧急 → 不重要不紧急
const quadMeta = {
  q1: { tone: "border-rose-300/50 bg-rose-500/10", dot: "bg-rose-400", label: (copy: ReturnType<typeof t>) => copy.urgent },
  q2: { tone: "border-amber-300/50 bg-amber-500/10", dot: "bg-amber-400", label: (copy: ReturnType<typeof t>) => copy.plan },
  q3: { tone: "border-sky-300/50 bg-sky-500/10", dot: "bg-sky-400", label: (copy: ReturnType<typeof t>) => copy.delegate },
  q4: { tone: "border-orange-300/40 bg-orange-500/10", dot: "bg-orange-400", label: (copy: ReturnType<typeof t>) => copy.reduce },
} as const;

function formatDuration(minutes: number) { return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; }

export default function Home() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>("today");
  const { language, setLanguage } = useLanguage();
  const [newTask, setNewTask] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projectGoalId, setProjectGoalId] = useState("");
  const [friendId, setFriendId] = useState("");
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [universeMode, setUniverseMode] = useState<"life" | "archive">("life");
  const [editingTask, setEditingTask] = useState<any>(null);
  const [editingGoal, setEditingGoal] = useState<any>(null);
  const [editingProject, setEditingProject] = useState<any>(null);
  /* 宇宙视图：恒星操作面板 / 摧毁确认 / 摧毁动效 */
  const [goalSelection, setGoalSelection] = useState<GoalSelection | null>(null);
  const [destroyConfirm, setDestroyConfirm] = useState<{ type: "goal" | "project"; id: string; title: string } | null>(null);
  const [destroyingGoalId, setDestroyingGoalId] = useState<string | null>(null);
  const [boardMode, setBoardMode] = useState<"quadrant" | "list">("quadrant");
  const [subSpaceGoalId, setSubSpaceGoalId] = useState<string | null>(null);
  const [captureText, setCaptureText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const copy = t(language);
  const utils = trpc.useUtils();
  const profile = trpc.sync.profile.useQuery(undefined, { enabled: Boolean(user) });
  const goals = trpc.planning.goals.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 15000 });
  const projects = trpc.planning.projects.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 15000 });
  const tasks = trpc.task.list.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 15000 });
  const week = trpc.time.week.useQuery({}, { enabled: Boolean(user) });
  const activeTimer = trpc.time.active.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 30000 });
  const friendships = trpc.social.friendships.useQuery(undefined, { enabled: Boolean(user) });
  const moveTask = trpc.task.move.useMutation({ onSuccess: () => utils.task.list.invalidate() });
  const finishTask = trpc.task.finish.useMutation({ onSuccess: () => { utils.task.list.invalidate(); utils.time.week.invalidate(); } });
  const updateTask = trpc.task.update.useMutation({ onSuccess: () => { utils.task.list.invalidate(); } });
  const deleteTask = trpc.task.delete.useMutation({ onSuccess: () => utils.task.list.invalidate() });
  const createGoal = trpc.planning.createGoal.useMutation({ onSuccess: () => { setGoalTitle(""); utils.planning.goals.invalidate(); }, onError: (err) => { alert(language === "zh" ? "创建目标失败: " + err.message : "Failed to create goal: " + err.message); } });
  const updateGoal = trpc.planning.updateGoal.useMutation({ onSuccess: () => { utils.planning.goals.invalidate(); } });
  const createProject = trpc.planning.createProject.useMutation({ onSuccess: () => { setProjectTitle(""); utils.planning.projects.invalidate(); }, onError: (err) => { alert(language === "zh" ? "创建项目失败: " + err.message : "Failed to create project: " + err.message); } });
  const updateProject = trpc.planning.updateProject.useMutation({ onSuccess: () => { utils.planning.projects.invalidate(); } });
  const deleteGoalMut = trpc.planning.deleteGoal.useMutation({ onSuccess: () => { utils.planning.goals.invalidate(); utils.planning.projects.invalidate(); setSelectedGoal(null); } });
  const deleteProjectMut = trpc.planning.deleteProject.useMutation({ onSuccess: () => { utils.planning.projects.invalidate(); utils.task.list.invalidate(); } });
  const startTimer = trpc.time.start.useMutation({ onSuccess: () => activeTimer.refetch() });
  const stopTimer = trpc.time.stop.useMutation({ onSuccess: () => { activeTimer.refetch(); utils.time.week.invalidate(); } });
  const updateProfile = trpc.sync.updateProfile.useMutation({ onSuccess: () => profile.refetch() });
  const requestFriend = trpc.social.requestFriend.useMutation({ onSuccess: () => { setFriendId(""); friendships.refetch(); } });
  const setVisibility = trpc.social.setVisibility.useMutation({ onSuccess: () => { profile.refetch(); utils.planning.goals.invalidate(); } });
  const capture = trpc.ai.captureText.useMutation({ onSuccess: () => { setCaptureText(""); utils.task.list.invalidate(); } });
  const createReport = trpc.time.report.useMutation({ onSuccess: () => utils.time.week.invalidate() });

  const taskRows = tasks.data ?? [];
  const goalRows = goals.data ?? [];
  const projectRows = projects.data ?? [];
  const grouped = useMemo(() => ({
    q1: taskRows.filter((task) => task.quadrant === "q1"),
    q3: taskRows.filter((task) => task.quadrant === "q3"),
    q2: taskRows.filter((task) => task.quadrant === "q2"),
    q4: taskRows.filter((task) => task.quadrant === "q4"),
  }), [taskRows]);

  const navigation: Array<{ id: View; icon: typeof Target; label: string }> = [
    { id: "today", icon: Target, label: copy.today },
    { id: "week", icon: Clock3, label: copy.week },
    { id: "universe", icon: Orbit, label: copy.universe },
    { id: "nebula", icon: UsersRound, label: copy.nebula },
    { id: "settings", icon: ShieldCheck, label: copy.settings },
  ];

  // 快速输入走「自然语言解析」路径：自动拆解 项目 + 时间（+ 象限默认值）
  const addTask = () => {
    const v = newTask.trim();
    if (!v) return;
    capture.mutate({ text: v, language });
    setNewTask("");
  };
  const onDrop = (event: DragEvent<HTMLDivElement>, quadrant: "q1" | "q2" | "q3" | "q4") => { event.preventDefault(); const id = event.dataTransfer.getData("anchor-task"); if (id) moveTask.mutate({ id, quadrant }); };
  const handleEditTask = (task: any) => setEditingTask(task);
  const handleSaveTask = (patch: any) => updateTask.mutate(patch);
  const handleDeleteTask = (id: string) => deleteTask.mutate({ id });
  const handleToggleDone = (id: string) => finishTask.mutate({ id, status: "done" });
  const handleEditGoal = (goal: any) => setEditingGoal(goal);
  const handleSaveGoal = (patch: any) => updateGoal.mutate({ id: patch.id, patch });
  const handleEditProject = (project: any) => setEditingProject(project);
  const handleSaveProject = (patch: any) => updateProject.mutate({ id: patch.id, patch: { title: patch.title, status: patch.status, goalId: patch.goalId, color: patch.color } });

  const startRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert(language === "zh" ? "浏览器不支持语音识别，请用 Chrome。" : "Use Chrome for speech recognition."); return; }
    const rec = new SR();
    rec.lang = language === "zh" ? "zh-CN" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => { const text = e.results[0][0].transcript; capture.mutate({ text: text.trim(), language }); };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
  };
  const stopRecording = () => { if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; } setIsRecording(false); };

  /* 宇宙视图：选中恒星（含屏幕坐标，供操作面板定位） */
  const handleSelectGoalDetail = useCallback((selection: GoalSelection) => {
    setGoalSelection(selection);
  }, []);

  /* 摧毁流程：先播 1.5s 碎裂动效，动效结束（或 2.4s 兜底）再删除数据 */
  const destroyDoneRef = useRef(false);
  const handleConfirmDestroy = () => {
    if (!destroyConfirm) return;
    const { type, id } = destroyConfirm;
    setDestroyConfirm(null);
    destroyDoneRef.current = false;
    const doDelete = () => {
      if (destroyDoneRef.current) return;
      destroyDoneRef.current = true;
      if (type === "goal") deleteGoalMut.mutate({ id });
      else deleteProjectMut.mutate({ id });
      setDestroyingGoalId(null);
      setGoalSelection(null);
    };
    if (type === "goal") {
      setDestroyingGoalId(id);
      window.setTimeout(doDelete, 2400); // 兜底：动效被场景重建打断时也能删除
    } else {
      doDelete(); // 行星暂无专属动效，直接删
    }
  };
  const handleDestroyComplete = useCallback((goalId: string) => {
    if (destroyDoneRef.current) return;
    destroyDoneRef.current = true;
    deleteGoalMut.mutate({ id: goalId });
    setDestroyingGoalId(null);
    setGoalSelection(null);
  }, []);


  if (loading) return <div className="grid min-h-screen place-items-center bg-background text-muted-foreground"><Stars className="h-7 w-7 animate-pulse" /></div>;
  if (!user) return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <Card className="anchor-glow w-full max-w-md border-primary/25 bg-card/80">
        <CardHeader>
          <Badge className="w-fit bg-primary/15 text-primary">ANCHOR / 锚点</Badge>
          <CardTitle className="mt-3 text-3xl">{language === "zh" ? "将时间锚回人生主线" : "Anchor time to your life path"}</CardTitle>
          <CardDescription>{language === "zh" ? "登录后，任务、宇宙与周度成果将在你的设备之间同步。" : "Sign in to sync your tasks, universe, and weekly results across devices."}</CardDescription>
        </CardHeader>
        <CardContent><Button className="w-full" onClick={startLogin}>{language === "zh" ? "登录并开始" : "Sign in to begin"}</Button></CardContent>
      </Card>
    </main>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-[0_0_28px_rgba(224,140,80,.5)]"><Orbit className="h-5 w-5" /></div>
            <div><p className="text-sm font-semibold tracking-[.18em] text-primary">ANCHOR</p><p className="text-xs text-muted-foreground">{profile.data?.timezone ?? "Asia/Shanghai"} · {copy.sync}</p></div>
          </div>
          <div className="hidden items-center gap-1 rounded-full border border-border bg-muted/50 p-1 md:flex">
            {navigation.map((item) => (
              <button key={item.id} onClick={() => setView(item.id)} className={cn("flex items-center gap-2 rounded-full px-3 py-2 text-sm transition", view === item.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                <item.icon className="h-4 w-4" />{item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="toggle language" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/60">{language === "zh" ? "EN" : "中"}</button>
            <Badge className="hidden border-0 bg-emerald-500/15 text-emerald-700 sm:inline-flex"><Cloud className="mr-1 h-3 w-3" />{copy.sync}</Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7">
        <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
          {navigation.map((item) => (
            <Button key={item.id} size="sm" variant={view === item.id ? "default" : "outline"} onClick={() => setView(item.id)}>{item.label}</Button>
          ))}
        </div>

        {/* 宇宙模式切换 */}
        {view === "universe" && (
          <div className="mb-4 flex w-fit rounded-full border border-border bg-muted/50 p-1">
            <Button size="sm" variant={universeMode === "life" ? "default" : "ghost"} onClick={() => setUniverseMode("life")}>{copy.dynamic}</Button>
            <Button size="sm" variant={universeMode === "archive" ? "default" : "ghost"} onClick={() => setUniverseMode("archive")}>{copy.archive}</Button>
          </div>
        )}

        {/* ========== TODAY VIEW ========== */}
        {view === "today" && (
          <section className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
              {/* 左侧：四象限 */}
              <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-orange-400/15 via-card to-amber-400/15 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Badge className="border-0 bg-primary/15 text-primary"><Sparkles className="mr-1 h-3 w-3" />{copy.capture}</Badge>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight">{language === "zh" ? "先完成真正重要的事。" : "Finish what actually matters."}</h1>
                    <p className="mt-2 text-sm text-muted-foreground">{language === "zh" ? "直接输入或说出任务；默认重要，今天内到期自动进入 Q1，其余进入 Q3。" : "Type or speak a task. Important by default; today means Q1, otherwise Q3."}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card/50 px-4 py-3">
                    <p className="text-xs text-muted-foreground">{copy.completed}</p>
                    <p className="mt-1 text-2xl font-semibold">{taskRows.filter((task) => task.status === "done").length}<span className="text-sm text-muted-foreground"> / {taskRows.length}</span></p>
                  </div>
                </div>

                <div className="mt-6 grid gap-2 md:grid-cols-[1fr_auto]">
                  <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} placeholder={language === "zh" ? "例如：今天下午五点跑胶" : "e.g. Run gel at 5pm today"} className="border-border bg-card/50" />
                  <Button onClick={addTask} disabled={capture.isPending}><Plus className="mr-2 h-4 w-4" />{copy.capture}</Button>
                </div>

                <div className="mt-3 flex gap-2">
                  <button onClick={startRecording} disabled={isRecording} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition", isRecording ? "border-red-400 bg-red-500/10 text-red-500 animate-pulse" : "border-border text-muted-foreground hover:bg-muted/60")}>
                    <Mic className="h-3.5 w-3.5" />{isRecording ? (language === "zh" ? "录音中…" : "Recording…") : copy.record}
                  </button>
                  {isRecording && <button onClick={stopRecording} className="rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">{copy.stop}</button>}
                </div>

                <div className="mt-4 flex justify-end"><BoardModeSwitch mode={boardMode} onModeChange={setBoardMode} language={language} /></div>

                {/* 四象限 / 列表 */}
                {boardMode === "quadrant" ? (
                  <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                    {(Object.keys(quadMeta) as Array<keyof typeof quadMeta>).map((quadrant) => {
                      const meta = quadMeta[quadrant];
                      return (
                        <div key={quadrant} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, quadrant)} className={cn("min-h-[300px] rounded-3xl border p-4", meta.tone)}>
                          <div className="mb-4 flex items-center gap-2">
                            <span className={cn("h-2 w-2 rounded-full", meta.dot)} /><h2 className="text-sm font-semibold">{meta.label(copy)}</h2>
                            <Badge variant="secondary" className="ml-auto bg-muted/60 text-muted-foreground">{grouped[quadrant].length}</Badge>
                          </div>
                          <div className="space-y-2">
                            {grouped[quadrant].map((task) => (
                              <article key={task.id} draggable onDragStart={(e) => e.dataTransfer.setData("anchor-task", task.id)} className="group rounded-2xl border border-border bg-card/65 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 cursor-pointer" onClick={() => handleEditTask(task)}>
                                <div className="flex gap-2">
                                  <button className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-muted-foreground/30 text-transparent hover:border-emerald-500 hover:bg-emerald-500 hover:text-white" onClick={(e) => { e.stopPropagation(); handleToggleDone(task.id); }}><Check className="h-3 w-3" /></button>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium leading-5">{task.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{task.dueAt ? `${formatShortDate(task.dueAt)} ${formatTime(task.dueAt)}` : copy.noTime}</p>
                                  </div>
                                </div>
                              </article>
                            ))}
                            {grouped[quadrant].length === 0 && <p className="grid h-28 place-items-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">{language === "zh" ? "拖动任务到这里" : "Drop tasks here"}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <TaskListPanel tasks={taskRows} language={language} onToggleDone={handleToggleDone} onEditTask={handleEditTask} />
                )}
              </div>

              {/* 右侧面板 */}
              <div className="space-y-5">
                {/* 专注计时器 */}
                <Card className="border-border bg-card/55">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{activeTimer.data ? (language === "zh" ? "正在投入" : "In focus") : copy.time}</CardTitle>
                    <CardDescription>{activeTimer.data ? new Date(activeTimer.data.startedAt).toLocaleTimeString() : language === "zh" ? "将真实时间记录到项目，而不是用任务数量猜测。" : "Record actual effort by project, not task count."}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activeTimer.data ? (
                      <Button className="w-full" variant="destructive" onClick={() => stopTimer.mutate()}><Pause className="mr-2 h-4 w-4" />{copy.stop}</Button>
                    ) : (
                      <>
                        <select value="" onChange={(e) => {}} className="h-8 w-full rounded-md border border-border bg-muted/50 px-2 text-xs mb-2">
                          <option value="">{copy.focusTask}</option>
                          {taskRows.filter(t => t.status !== "done" && t.status !== "dropped").map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                        </select>
                        <select value="" onChange={(e) => {}} className="h-8 w-full rounded-md border border-border bg-muted/50 px-2 text-xs mb-2">
                          <option value="">{copy.focusProject}</option>
                          {projectRows.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        <Button className="w-full" onClick={() => startTimer.mutate({ taskId: null, projectId: null })}><Play className="mr-2 h-4 w-4" />{language === "zh" ? "开始专注" : "Start focus"}</Button>
                      </>
                    )}
                    <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                      <div className="flex justify-between"><span>{copy.goal}</span><span>{goalRows.length}</span></div>
                      <div className="flex justify-between"><span>{copy.project}</span><span>{projectRows.length}</span></div>
                      <div className="flex justify-between"><span>{copy.task}</span><span>{taskRows.length}</span></div>
                    </div>
                  </CardContent>
                </Card>

                {/* 创建目标和项目 */}
                <Card className="border-border bg-card/50">
                  <CardHeader className="pb-2"><CardTitle className="text-base">{language === "zh" ? "创建人生主线" : "Shape the path"}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder={copy.enterGoalTitle} className="border-border bg-muted/50" />
                    <Button className="w-full" variant="outline" onClick={() => createGoal.mutate({ title: goalTitle, color: "#6EA8FE" })} disabled={!goalTitle.trim() || createGoal.isPending}><Target className="mr-2 h-4 w-4" />{createGoal.isPending ? (language === "zh" ? "创建中…" : "Creating…") : language === "zh" ? "创建目标（恒星）" : "Create goal (star)"}</Button>
                    <Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder={copy.enterProjectTitle} className="border-border bg-muted/50" />
                    <select value={projectGoalId} onChange={(e) => setProjectGoalId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-muted/50 px-3 text-sm">
                      <option value="">{copy.noLinkedGoal}</option>
                      {goalRows.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                    </select>
                    <Button className="w-full" variant="outline" onClick={() => createProject.mutate({ title: projectTitle, goalId: projectGoalId || null, color: "#7FB5D6" })} disabled={!projectTitle.trim() || createProject.isPending}><Plus className="mr-2 h-4 w-4" />{createProject.isPending ? (language === "zh" ? "创建中…" : "Creating…") : language === "zh" ? "创建项目（行星）" : "Create project (planet)"}</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        )}

        {/* ========== WEEK VIEW ========== */}
        {view === "week" && (
          <section className="space-y-5">
            {/* 甘特图 */}
            <Card className="border-primary/20 bg-card/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Clock3 className="h-4 w-4" />{copy.weekProgress}</CardTitle>
                <CardDescription>{copy.weekOverview}</CardDescription>
              </CardHeader>
              <CardContent>
                <WeekGanttChart
                  projects={projectRows.map((p) => ({
                    id: p.id,
                    title: p.title,
                    color: p.color ?? "#7FB5D6",
                    status: p.entityStatus,
                    tasks: taskRows
                      .filter((t) => t.projectId === p.id)
                      .map((t) => ({ id: t.id, status: t.status, dueAt: t.dueAt, estimatedMinutes: t.estimatedMinutes, title: t.title })),
                  }))}
                  language={language}
                />
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
              {/* 左侧：已创建项目列表（创建人生主线表单已移至宇宙视图） */}
              <div className="space-y-5">
                {/* 已创建项目列表 */}
                <Card className="border-border bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{copy.project}</CardTitle>
                    <CardDescription>{language === "zh" ? "在「我的宇宙」创建目标与项目" : "Create goals & projects in My Universe"}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {projectRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">{language === "zh" ? "暂无项目，创建第一个行星吧" : "No projects yet. Create your first planet."}</p>
                    ) : (
                      projectRows.map((project) => (
                        <div key={project.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ background: project.color ?? "#7FB5D6", boxShadow: `0 0 6px 1px ${project.color ?? "#7FB5D6"}44` }}
                            />
                            <span className="text-sm font-medium truncate">{project.title}</span>
                            <span className={`text-xs ${project.entityStatus === "active" ? "text-emerald-500" : project.entityStatus === "paused" ? "text-amber-500" : project.entityStatus === "completed" ? "text-slate-400" : "text-slate-300"}`}>
                              {project.entityStatus === "active" ? copy.statusActive : project.entityStatus === "paused" ? copy.statusPaused : project.entityStatus === "completed" ? copy.statusCompleted : copy.statusArchived}
                            </span>
                          </div>
                          <button onClick={() => handleEditProject(project)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* 本周概览 */}
              <Card className="border-border bg-card/50">
                <CardHeader className="pb-2"><CardTitle className="text-base">{copy.weekOverview}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                      <p className="text-2xl font-semibold text-primary">{taskRows.filter((t) => t.status === "done").length}</p>
                      <p className="text-xs text-muted-foreground">{copy.completed}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                      <p className="text-2xl font-semibold text-amber-500">{taskRows.filter((t) => t.status === "doing").length}</p>
                      <p className="text-xs text-muted-foreground">{language === "zh" ? "进行中" : "Active"}</p>
                    </div>
                  </div>
                  {week.data?.snapshot && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">{language === "zh" ? "本周时长分布" : "Weekly time distribution"}</p>
                      <div className="space-y-1">
                        {week.data.snapshot.projectBreakdown?.slice(0, 5).map((pb: any) => (
                          <div key={pb.projectId} className="flex items-center gap-2 text-xs">
                            <span className="w-20 truncate text-muted-foreground">{projectRows.find(p => p.id === pb.projectId)?.title ?? "—"}</span>
                            <Progress value={pb.percentage} className="h-1.5 flex-1" />
                            <span className="w-12 text-right text-muted-foreground">{formatDuration(pb.minutes)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => createReport.mutate({ kind: "preview" })} disabled={!week.data}>{copy.report}</Button>
                    <Button size="sm" className="flex-1" onClick={() => createReport.mutate({ kind: "final" })} disabled={!week.data}>{copy.final}</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* ========== UNIVERSE VIEW ========== */}
        {view === "universe" && universeMode === "life" && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Badge className="border-0 bg-primary/15 text-primary"><Stars className="mr-1 h-3 w-3" />{copy.dynamic}</Badge>
                <h1 className="mt-3 text-3xl font-semibold">{language === "zh" ? "你正在建造的，不是一张任务表。" : "You are building more than a task list."}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.selectGoalHint}</p>
              </div>
            </div>

            <div className="relative">
              <AnchorGalaxy
                goals={goalRows.map((g) => ({ id: g.id, title: g.title, color: g.color }))}
                projects={projectRows.map((p) => ({ id: p.id, title: p.title, goalId: p.goalId }))}
                tasks={taskRows.map((t) => ({ id: t.id, projectId: t.projectId, status: t.status, dueAt: t.dueAt, firstBreachedAt: t.firstBreachedAt }))}
                onSelectGoal={setSelectedGoal}
                onSelectGoalDetail={handleSelectGoalDetail}
                destroyingGoalId={destroyingGoalId}
                onDestroyComplete={handleDestroyComplete}
              />
              {/* 恒星操作面板：定位在恒星投影位置附近 */}
              {goalSelection && !destroyingGoalId && (
                <div
                  className="absolute z-20 w-52 rounded-2xl border border-white/15 bg-[#101c3a]/95 p-3 shadow-2xl backdrop-blur"
                  style={{
                    left: Math.min(Math.max(goalSelection.screen.x - 104, 8), 9999),
                    top: Math.min(goalSelection.screen.y + 18, 340),
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: goalSelection.color, boxShadow: `0 0 8px 2px ${goalSelection.color}66` }} />
                    <p className="truncate text-sm font-medium text-white">{goalSelection.title}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 flex-1 border-0 bg-white/10 text-white hover:bg-white/20"
                      onClick={() => {
                        handleEditGoal(goalRows.find((g) => g.id === goalSelection.id));
                        setGoalSelection(null);
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />{language === "zh" ? "编辑" : "Edit"}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 flex-1 border-0 bg-red-500/20 text-red-300 hover:bg-red-500/40 hover:text-red-200"
                      onClick={() => {
                        setDestroyConfirm({ type: "goal", id: goalSelection.id, title: goalSelection.title });
                        setGoalSelection(null);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />{language === "zh" ? "摧毁" : "Destroy"}
                    </Button>
                  </div>
                  <button
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-gradient-to-r from-amber-400/25 to-orange-400/25 py-2 text-xs font-medium text-amber-100 transition hover:from-amber-400/40 hover:to-orange-400/40"
                    onClick={() => {
                      setSubSpaceGoalId(goalSelection.id);
                      setGoalSelection(null);
                    }}
                  >
                    <Orbit className="h-3.5 w-3.5" />{language === "zh" ? "进入子空间" : "Enter sub-space"}
                  </button>
                  <button className="mt-2 w-full text-center text-[11px] text-white/40 hover:text-white/70" onClick={() => { setSelectedGoal(goalSelection.id); setGoalSelection(null); }}>
                    {language === "zh" ? "聚焦此主线" : "Focus this path"}
                  </button>
                </div>
              )}
              {/* 点击空白处关闭面板 */}
              {goalSelection && <div className="absolute inset-0 z-10" onClick={() => setGoalSelection(null)} />}
            </div>

            {/* 创建人生主线（从周视图迁移至此） */}
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" />{language === "zh" ? "创建人生主线" : "Shape the path"}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder={copy.enterGoalTitle} className="border-border bg-muted/50" />
                <Button className="w-full" variant="outline" onClick={() => createGoal.mutate({ title: goalTitle, color: "#6EA8FE" })} disabled={!goalTitle.trim() || createGoal.isPending}><Target className="mr-2 h-4 w-4" />{createGoal.isPending ? (language === "zh" ? "创建中…" : "Creating…") : language === "zh" ? "创建目标（恒星）" : "Create goal (star)"}</Button>
                <Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder={copy.enterProjectTitle} className="border-border bg-muted/50" />
                <select value={projectGoalId} onChange={(e) => setProjectGoalId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-muted/50 px-3 text-sm">
                  <option value="">{copy.noLinkedGoal}</option>
                  {goalRows.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                </select>
                <Button className="w-full" variant="outline" onClick={() => createProject.mutate({ title: projectTitle, goalId: projectGoalId || null, color: "#7FB5D6" })} disabled={!projectTitle.trim() || createProject.isPending}><Plus className="mr-2 h-4 w-4" />{createProject.isPending ? (language === "zh" ? "创建中…" : "Creating…") : language === "zh" ? "创建项目（行星）" : "Create project (planet)"}</Button>
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-primary/20 bg-card/55">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[.18em] text-primary">{copy.goal}</p>
                  <p className="mt-2 text-2xl font-semibold">{goalRows.length}</p>
                </CardContent>
              </Card>
              <Card className="border-primary/20 bg-card/55">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[.18em] text-primary">{copy.project}</p>
                  <p className="mt-2 text-2xl font-semibold">{projectRows.length}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-300/10 bg-card/55">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[.18em] text-amber-600">{language === "zh" ? "进行中卫星" : "Active moons"}</p>
                  <p className="mt-2 text-2xl font-semibold">{taskRows.filter((task) => task.status === "doing").length}</p>
                </CardContent>
              </Card>
            </div>

            {selectedGoal && (
              <Card className="border-primary/30 bg-primary/10">
                <CardContent className="flex items-center justify-between p-4">
                  <span>{goalRows.find((goal) => goal.id === selectedGoal)?.title}</span>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedGoal(null)}><X className="mr-1 h-4 w-4" />{language === "zh" ? "返回全景" : "Full view"}</Button>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* ========== ARCHIVE VIEW ========== */}
        {view === "universe" && universeMode === "archive" && (
          <section className="mx-auto max-w-4xl space-y-4">
            <div>
              <Badge className="border-0 bg-primary/15 text-primary">{copy.archive}</Badge>
              <h1 className="mt-3 text-3xl font-semibold">{language === "zh" ? "时间是另一片宇宙。" : "Time is another universe."}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{language === "zh" ? "在这里查看服务端沉淀的违约、完成与放弃事实。" : "Review the breach, completion, and drop facts materialized by the server."}</p>
            </div>
            <UniverseArchive language={language} />
          </section>
        )}

        {/* ========== NEBULA VIEW ========== */}
        {view === "nebula" && (
          <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <Card className="border-primary/20 bg-card/60">
              <CardHeader>
                <Badge className="w-fit border-0 bg-primary/15 text-primary">{copy.nebula}</Badge>
                <CardTitle className="mt-3 text-2xl">{language === "zh" ? "每个人都是一片星云。" : "Every person is a nebula."}</CardTitle>
                <CardDescription>{language === "zh" ? "好友看到的是你主动许可的去标识化摘要，而不是任务原文、笔记或截止时间。" : "Friends see only the de-identified summary you allow—not task text, notes, or deadlines."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={friendId} onChange={(e) => setFriendId(e.target.value)} type="number" placeholder={language === "zh" ? "输入对方用户 ID 发起好友请求" : "Enter a user ID to send a friend request"} className="border-border bg-muted/50" />
                <Button className="w-full" onClick={() => requestFriend.mutate({ recipientId: Number(friendId) })} disabled={!friendId}><UsersRound className="mr-2 h-4 w-4" />{copy.invite}</Button>
                <div className="space-y-2 pt-2">
                  {friendships.data?.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                      <span>{friend.requesterId === user.id ? `→ ${friend.recipientId}` : `← ${friend.requesterId}`}</span>
                      <Badge variant="secondary" className="bg-muted/60 text-muted-foreground">{friend.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card/60">
              <CardHeader>
                <CardTitle>{language === "zh" ? "隐私由你定义" : "Privacy is yours to define"}</CardTitle>
                <CardDescription>{language === "zh" ? "默认私密。选择好友或公开时，只开放概要级的 Goal、Project 与进度，不会开放任务标题。" : "Private by default. Friends and public modes expose only Goal, Project, and progress summaries—not task titles."}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {(["private", "friends", "public"] as const).map((visibility) => (
                  <button key={visibility} onClick={() => setVisibility.mutate({ entityType: "profile", entityId: null, permission: "summary" as const })} className={cn("rounded-xl border-2 px-3 py-4 text-center transition", profile.data?.defaultVisibility === visibility ? "border-primary bg-primary/10" : "border-border hover:border-primary/40")}>
                    <p className="text-sm font-medium">{visibility}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{copy[visibility as keyof typeof copy]}</p>
                  </button>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {/* ========== SETTINGS VIEW ========== */}
        {view === "settings" && (
          <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
            <Card className="border-border bg-card/60">
              <CardHeader><CardTitle>{copy.settings}</CardTitle><CardDescription>{language === "zh" ? "资料与默认隐私存储在云端，跨设备保持一致。" : "Profile and privacy defaults live in the cloud and follow you across devices."}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Input defaultValue={profile.data?.displayName ?? user.name ?? ""} onBlur={(e) => updateProfile.mutate({ displayName: e.target.value || null })} placeholder={language === "zh" ? "显示名称" : "Display name"} className="border-border bg-muted/50" />
                <Input defaultValue={profile.data?.timezone ?? "Asia/Shanghai"} onBlur={(e) => updateProfile.mutate({ timezone: e.target.value })} placeholder="Asia/Shanghai" className="border-border bg-muted/50" />
                <p className="text-xs text-muted-foreground">{language === "zh" ? "时区用于'当天内紧急'的计算。拖动后的手动象限会覆盖默认规则；服务端记录的违约事实除外。" : "Timezone defines 'urgent today'. Manual drag overrides defaults; server-recorded breaches remain factual."}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card/60">
              <CardHeader><CardTitle>{language === "zh" ? "跨端同步与小程序" : "Sync & mini-program"}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{language === "zh" ? "所有 UI 写入均经由同一云端任务契约。小程序只需调用 sync.pull、task.create、task.move、task.finish、time.* 与 planning.* 即可获得与 Web 一致的默认规则和历史事实。" : "All UI writes pass through the same cloud task contract. The mini-program uses sync.pull, task.create, task.move, task.finish, time.*, and planning.* for the same rules and historical facts."}</p>
                <Button variant="outline" onClick={() => utils.sync.pull.invalidate()}><TimerReset className="mr-2 h-4 w-4" />{language === "zh" ? "立即刷新云端数据" : "Refresh cloud data"}</Button>
              </CardContent>
            </Card>
          </section>
        )}

        {/* 编辑对话框 */}
        {editingTask && (
          <TaskEditorDialog
            task={editingTask}
            language={language}
            projects={projectRows.map(p => ({ id: p.id, title: p.title }))}
            onClose={() => setEditingTask(null)}
            onSave={handleSaveTask}
            onDelete={handleDeleteTask}
          />
        )}
        {editingGoal && (
          <GoalEditor
            goal={editingGoal}
            language={language}
            onClose={() => setEditingGoal(null)}
            onSave={handleSaveGoal}
          />
        )}
        {editingProject && (
          <ProjectEditor
            project={editingProject}
            language={language}
            goals={goalRows}
            onClose={() => setEditingProject(null)}
            onSave={handleSaveProject}
          />
        )}
        {/* 摧毁确认弹窗 */}
        {destroyConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => setDestroyConfirm(null)}>
            <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-red-500/15"><Trash2 className="h-4 w-4 text-red-500" /></span>
                <h2 className="text-base font-semibold">{destroyConfirm.type === "goal" ? (language === "zh" ? "摧毁恒星" : "Destroy star") : (language === "zh" ? "摧毁行星" : "Destroy planet")}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {destroyConfirm.type === "goal"
                  ? language === "zh"
                    ? `确定摧毁恒星「${destroyConfirm.title}」吗？其行星将脱离主线（项目与任务数据保留），此操作不可撤销。`
                    : `Destroy the star "${destroyConfirm.title}"? Its planets will detach (projects & tasks are kept). This cannot be undone.`
                  : language === "zh"
                    ? `确定摧毁行星「${destroyConfirm.title}」吗？其卫星将脱离项目（任务数据保留），此操作不可撤销。`
                    : `Destroy the planet "${destroyConfirm.title}"? Its moons will detach (tasks are kept). This cannot be undone.`}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setDestroyConfirm(null)}>{copy.cancel}</Button>
                <Button size="sm" className="border-0 bg-red-600 text-white hover:bg-red-700" onClick={handleConfirmDestroy} disabled={deleteGoalMut.isPending || deleteProjectMut.isPending}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />{language === "zh" ? "确认摧毁" : "Destroy"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 子空间（恒星钻取视图）：点击恒星后进入，中央恒星=主线，行星=项目，卫星=任务 */}
      {subSpaceGoalId && (() => {
        const g = goalRows.find((x) => x.id === subSpaceGoalId);
        if (!g) return null;
        return (
          <SubSpaceView
            goal={{ id: g.id, title: g.title, color: g.color ?? "#6EA8FE" }}
            projects={projectRows.map((p) => ({ id: p.id, title: p.title, color: p.color, status: p.entityStatus, goalId: p.goalId }))}
            tasks={taskRows.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null,
              projectId: t.projectId,
              firstBreachedAt: t.firstBreachedAt ? new Date(t.firstBreachedAt).toISOString() : null,
            }))}
            language={language}
            onClose={() => setSubSpaceGoalId(null)}
            onEditGoal={(gg) => setEditingGoal(goalRows.find((x) => x.id === gg.id) ?? null)}
            onEditProject={(pp) => setEditingProject(projectRows.find((x) => x.id === pp.id) ?? null)}
            onEditTask={(tt) => setEditingTask(taskRows.find((x) => x.id === tt.id) ?? null)}
          />
        );
      })()}
    </div>
  );
}
