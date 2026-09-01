import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Eye, LockKeyhole, RotateCcw, UserCheck, UsersRound } from "lucide-react";
import { useState } from "react";

type NebulaData = { profile: { displayName: string | null; bio: string | null; avatarUrl: string | null }; goals: Array<{ id: string; title: string; color: string; progress: number; projectCount: number }>; projects: Array<{ id: string; goalId: string | null; title: string; progress: number }> } | undefined;

function Summary({ data, language, title }: { data: NebulaData; language: "zh" | "en"; title: string }) {
  return <div className="rounded-2xl border border-border bg-muted/40 p-4"><p className="text-xs font-semibold tracking-[.14em] text-primary">{title}</p><p className="mt-2 text-sm font-medium">{data?.profile.displayName ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{language === "zh" ? "仅展示获准的目标、项目与进度摘要。" : "Only permitted Goal, Project, and progress summaries are exposed."}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{data?.goals.map((goal) => <div key={goal.id} className="rounded-xl border border-border p-3"><span className="mb-2 block h-2 w-2 rounded-full" style={{ backgroundColor: goal.color }} /><p className="truncate text-sm">{goal.title}</p><p className="mt-1 text-xs text-muted-foreground">{goal.projectCount} {language === "zh" ? "个项目" : "projects"} · {goal.progress}%</p></div>)}</div><div className="mt-3 space-y-1">{data?.projects.map((project) => <div key={project.id} className="flex justify-between rounded-lg border border-border px-3 py-2 text-xs"><span className="truncate">{project.title}</span><span className="text-muted-foreground">{project.progress}%</span></div>)}</div></div>;
}

export function NebulaPreview({ language }: { language: "zh" | "en" }) {
  const { user } = useAuth();
  const [visitorId, setVisitorId] = useState<number | null>(null);
  const [remoteOwnerId, setRemoteOwnerId] = useState<number | null>(null);
  const ownNebula = trpc.social.nebula.useQuery({ ownerId: user?.id ?? 0 }, { enabled: Boolean(user) });
  const friendships = trpc.social.friendships.useQuery(undefined, { enabled: Boolean(user) });
  const previewAs = trpc.social.previewAsFriend.useQuery({ friendId: visitorId ?? 0 }, { enabled: Boolean(visitorId) });
  const remoteNebula = trpc.social.nebula.useQuery({ ownerId: remoteOwnerId ?? 0 }, { enabled: Boolean(remoteOwnerId) });
  const revoke = trpc.social.revokeAllForViewer.useMutation({ onSuccess: () => friendships.refetch() });
  const respond = trpc.social.respondFriend.useMutation({ onSuccess: () => friendships.refetch() });
  const accepted = friendships.data?.filter((friend) => friend.status === "accepted") ?? [];
  const pending = friendships.data?.filter((friend) => friend.status === "pending" && friend.recipientId === user?.id) ?? [];
  return <Card className="border-primary/20 bg-card"><CardHeader><div className="flex items-center justify-between"><div><Badge className="border-0 bg-primary/15 text-primary"><Eye className="mr-1 h-3 w-3" />{language === "zh" ? "访客预览" : "Visitor preview"}</Badge><CardTitle className="mt-2 text-lg">{language === "zh" ? "以好友身份确认你的摘要星云。" : "Inspect your summary nebula as a friend."}</CardTitle></div><LockKeyhole className="h-5 w-5 text-primary" /></div></CardHeader><CardContent className="space-y-4"><Summary data={visitorId ? previewAs.data : ownNebula.data} language={language} title={visitorId ? (language === "zh" ? `好友 ${visitorId} 看到的内容` : `What friend ${visitorId} sees`) : (language === "zh" ? "自己的完整星云摘要" : "Your summary nebula")} />
    {remoteOwnerId && <Summary data={remoteNebula.data} language={language} title={language === "zh" ? `好友 ${remoteOwnerId} 的星云` : `Friend ${remoteOwnerId}'s nebula`} />}
    {pending.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">{language === "zh" ? "待处理好友请求" : "Pending friend requests"}</p>{pending.map((friend) => <div key={friend.id} className="flex items-center justify-between rounded-xl border border-amber-300/40 bg-amber-500/10 p-3"><span className="text-sm">{language === "zh" ? `来自用户 ${friend.requesterId}` : `From user ${friend.requesterId}`}</span><span className="flex gap-2"><Button size="sm" onClick={() => respond.mutate({ id: friend.id, accept: true })}><UserCheck className="mr-1 h-3.5 w-3.5" />{language === "zh" ? "接受" : "Accept"}</Button><Button size="sm" variant="ghost" onClick={() => respond.mutate({ id: friend.id, accept: false })}>{language === "zh" ? "拒绝" : "Decline"}</Button></span></div>)}</div>}
    <div className="space-y-2">{accepted.map((friend) => { const friendId = friend.requesterId === user?.id ? friend.recipientId : friend.requesterId; return <div key={friend.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"><span className="flex items-center gap-2 text-sm"><UsersRound className="h-4 w-4 text-primary" />{language === "zh" ? `好友 ${friendId}` : `Friend ${friendId}`}</span><span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setRemoteOwnerId(friendId)}>{language === "zh" ? "查看星云" : "View"}</Button><Button size="sm" variant="ghost" onClick={() => setVisitorId(friendId)}>{language === "zh" ? "以此预览" : "Preview as"}</Button><Button size="sm" variant="ghost" onClick={() => revoke.mutate({ viewerId: friendId })}><RotateCcw className="mr-1 h-3.5 w-3.5" />{language === "zh" ? "撤回" : "Revoke"}</Button></span></div>; })}</div></CardContent></Card>;
}
