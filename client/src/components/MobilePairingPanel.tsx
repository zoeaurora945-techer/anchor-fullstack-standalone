import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { formatShortDate } from "@/lib/utils";

export function MobilePairingPanel({ language }: { language: "zh" | "en" }) {
  const [deviceName, setDeviceName] = useState(language === "zh" ? "我的 Taro 小程序" : "My Taro mini-program");
  const issue = trpc.mobile.issuePairingSession.useMutation();
  const copyToken = async () => { if (issue.data?.token) await navigator.clipboard.writeText(issue.data.token); };
  return <Card className="border-border bg-card"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" />{language === "zh" ? "配对原始小程序" : "Pair the legacy mini-program"}</CardTitle><CardDescription>{language === "zh" ? "主动生成一次性显示的 30 天会话令牌；仅粘贴到你自己的开发者工具或受保护设备。" : "Generate a token displayed once and valid for 30 days; paste it only into your own protected device or developer tool."}</CardDescription></CardHeader><CardContent className="space-y-2"><Input value={deviceName} maxLength={60} onChange={(event) => setDeviceName(event.target.value)} className="border-border bg-muted/50" /><Button className="w-full" variant="outline" onClick={() => issue.mutate({ deviceName })} disabled={issue.isPending}>{language === "zh" ? "生成配对令牌" : "Generate pairing token"}</Button>{issue.data && <><Input readOnly value={issue.data.token} className="font-mono text-xs" /><Button className="w-full" size="sm" onClick={copyToken}><Copy className="mr-2 h-3.5 w-3.5" />{language === "zh" ? `复制令牌（至 ${formatShortDate(issue.data.expiresAt)}）` : `Copy token (until ${formatShortDate(issue.data.expiresAt)})`}</Button></>}</CardContent></Card>;
}
