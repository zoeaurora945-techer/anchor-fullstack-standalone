import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CloudCog, DatabaseBackup, PlayCircle } from "lucide-react";
import { useEffect, useState } from "react";

export function DeploymentPanel({ language }: { language: "zh" | "en" }) {
  const [payload, setPayload] = useState("");
  const utils = trpc.useUtils();
  const jobs = trpc.automation.list.useQuery();
  const importLegacy = trpc.sync.importLegacy.useMutation({ onSuccess: () => { setPayload(""); utils.sync.pull.invalidate(); utils.planning.goals.invalidate(); utils.planning.projects.invalidate(); utils.task.list.invalidate(); } });
  const configure = trpc.automation.configure.useMutation({ onSuccess: () => jobs.refetch() });
  const ensureDefaults = trpc.automation.ensureDefaults.useMutation({ onSuccess: () => jobs.refetch() });
  useEffect(() => { ensureDefaults.mutate(); }, []);
  const runImport = () => { try { const data = JSON.parse(payload); importLegacy.mutate({ goals: data.goals ?? [], projects: data.projects ?? [], tasks: data.tasks ?? [], edges: data.graphEdges ?? data.edges ?? [] }); } catch { window.alert(language === "zh" ? "请输入有效的旧项目 JSON。" : "Please provide valid legacy JSON."); } };
  const jobsToShow = ["time_facts", "weekly_preview", "weekly_final"] as const;
  const copy = { time_facts: language === "zh" ? "5 分钟违约核对" : "5-minute fact check", weekly_preview: language === "zh" ? "周度预览" : "Weekly preview", weekly_final: language === "zh" ? "最终报告" : "Final report" };
  return <div className="space-y-5"><Card className="border-border bg-card"><CardHeader><Badge className="w-fit border-0 bg-primary/15 text-primary"><DatabaseBackup className="mr-1 h-3 w-3" />{language === "zh" ? "原项目迁移" : "Legacy migration"}</Badge><CardTitle className="mt-2 text-lg">{language === "zh" ? "在你确认后导入本地 JSON。" : "Import local JSON only after your confirmation."}</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea value={payload} onChange={(event) => setPayload(event.target.value)} placeholder='{"goals": [], "projects": [], "tasks": [], "graphEdges": []}' className="min-h-28 border-border bg-muted/50 font-mono text-xs" /><Button variant="outline" onClick={runImport} disabled={!payload.trim() || importLegacy.isPending}>{language === "zh" ? "安全导入并保持私密" : "Safely import as private"}</Button></CardContent></Card><Card className="border-border bg-card"><CardHeader><Badge className="w-fit border-0 bg-amber-400/15 text-amber-100"><CloudCog className="mr-1 h-3 w-3" />{language === "zh" ? "发布后定时任务" : "Post-publish jobs"}</Badge><CardTitle className="mt-2 text-lg">{language === "zh" ? "站点发布后再启用。" : "Enable only after the site is published."}</CardTitle></CardHeader><CardContent className="space-y-2">{jobsToShow.map((kind) => { const job = jobs.data?.find((item) => item.kind === kind); return <div key={kind} className="flex items-center justify-between rounded-xl border border-border p-3"><div><p className="text-sm font-medium">{copy[kind]}</p><p className="mt-1 text-xs text-muted-foreground">{job?.enabled ? (language === "zh" ? "已启用" : "Enabled") : (language === "zh" ? "未启用" : "Disabled")}</p></div><Button size="sm" variant={job?.enabled ? "outline" : "default"} onClick={() => configure.mutate({ kind, enabled: !job?.enabled })}><PlayCircle className="mr-1 h-3.5 w-3.5" />{job?.enabled ? (language === "zh" ? "暂停" : "Pause") : (language === "zh" ? "启用" : "Enable")}</Button></div>; })}</CardContent></Card></div>;
}
