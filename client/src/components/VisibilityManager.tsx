import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { EyeOff, Globe2, UsersRound } from "lucide-react";

type EntityType = "goal" | "project" | "task";
type Visibility = "private" | "friends" | "public";

function visibilityLabel(value: Visibility, language: "zh" | "en") { return value === "private" ? (language === "zh" ? "私密" : "Private") : value === "friends" ? (language === "zh" ? "好友" : "Friends") : (language === "zh" ? "公开摘要" : "Public summary"); }

export function VisibilityManager({ language }: { language: "zh" | "en" }) {
  const goals = trpc.planning.goals.useQuery();
  const projects = trpc.planning.projects.useQuery();
  const tasks = trpc.task.list.useQuery();
  const utils = trpc.useUtils();
  const setVisibility = trpc.social.setVisibility.useMutation({ onSuccess: () => { utils.planning.goals.invalidate(); utils.planning.projects.invalidate(); utils.task.list.invalidate(); } });
  const rows: Array<{ type: EntityType; id: string; title: string; visibility: Visibility }> = [
    ...(goals.data ?? []).map((entity) => ({ type: "goal" as const, id: entity.id, title: entity.title, visibility: entity.visibility })),
    ...(projects.data ?? []).map((entity) => ({ type: "project" as const, id: entity.id, title: entity.title, visibility: entity.visibility })),
    ...(tasks.data ?? []).slice(0, 24).map((entity) => ({ type: "task" as const, id: entity.id, title: entity.title, visibility: entity.visibility })),
  ];
  const icon = (value: Visibility) => value === "private" ? <EyeOff className="h-3.5 w-3.5" /> : value === "friends" ? <UsersRound className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />;
  return <Card className="border-border bg-card"><CardHeader><Badge className="w-fit border-0 bg-primary/15 text-primary">{language === "zh" ? "分层可见度" : "Layered visibility"}</Badge><CardTitle className="mt-2 text-lg">{language === "zh" ? "每一个实体都由你决定是否分享。" : "You decide whether each entity is shared."}</CardTitle><CardDescription>{language === "zh" ? "默认私密。访客星云只会返回获准 Goal、Project 与进度摘要；任务正文和时间事实始终不外发。" : "Private by default. Visitor nebulae receive allowed Goal, Project, and progress summaries only; task text and time facts never leave."}</CardDescription></CardHeader><CardContent className="max-h-[420px] space-y-2 overflow-auto pr-1">{rows.map((row) => <div key={`${row.type}-${row.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3"><Badge variant="secondary" className="bg-muted/60 text-muted-foreground">{row.type}</Badge><p className="min-w-0 flex-1 truncate text-sm">{row.title}</p><label className="flex items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground">{icon(row.visibility)}<select value={row.visibility} onChange={(event) => setVisibility.mutate({ entityType: row.type, entityId: row.id, visibility: event.target.value as Visibility })} className="h-7 bg-transparent outline-none"><option value="private">{visibilityLabel("private", language)}</option><option value="friends">{visibilityLabel("friends", language)}</option><option value="public">{visibilityLabel("public", language)}</option></select></label></div>)}{rows.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{language === "zh" ? "先创建目标、项目或任务，再设置它们的可见范围。" : "Create goals, projects, or tasks first, then set their visibility."}</p>}</CardContent></Card>;
}
