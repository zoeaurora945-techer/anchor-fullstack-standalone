import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { History, ShieldAlert } from "lucide-react";
import { formatShortDate, formatTime } from "@/lib/utils";

export function UniverseArchive({ language }: { language: "zh" | "en" }) {
  const archive = trpc.time.archive.useQuery({ limit: 60 });
  const labels = { breached: language === "zh" ? "违约" : "Breached", completed_on_time: language === "zh" ? "准时完成" : "On time", completed_late: language === "zh" ? "迟到完成" : "Completed late", dropped_after_breach: language === "zh" ? "违约后放弃" : "Dropped after breach" } as const;
  return <Card className="border-border bg-card"><CardHeader className="flex flex-row items-center justify-between"><div><Badge className="border-0 bg-primary/15 text-primary"><History className="mr-1 h-3 w-3" />{language === "zh" ? "时间档案" : "Time archive"}</Badge><CardTitle className="mt-2 text-lg">{language === "zh" ? "事实，不会被界面重写。" : "Facts are never rewritten by the UI."}</CardTitle></div><Button size="sm" variant="outline" onClick={() => archive.refetch()}>{language === "zh" ? "刷新" : "Refresh"}</Button></CardHeader><CardContent><div className="space-y-2">{archive.data?.map((event) => <div key={event.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3"><ShieldAlert className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{event.taskTitle}</p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</p></div><Badge variant="secondary" className="bg-muted/60 text-muted-foreground">{labels[event.type]}</Badge></div>)}{!archive.data?.length && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{language === "zh" ? "完成、迟到或违约后，时间事实会在这里沉淀。" : "Completion, lateness, and breaches will become facts here."}</p>}</div></CardContent></Card>;
}
