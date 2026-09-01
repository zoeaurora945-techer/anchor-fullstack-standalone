import { NebulaPreview } from "@/components/NebulaPreview";
import { VisibilityManager } from "@/components/VisibilityManager";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Nebula() {
  const [, setLocation] = useLocation();
  const { language, phrase } = useLanguage();
  return <section className="mx-auto max-w-4xl space-y-5 py-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.2em] text-primary">ANCHOR / NEBULA</p><h1 className="mt-2 text-3xl font-semibold">{phrase("nebulaTitle")}</h1><p className="mt-2 text-sm text-muted-foreground">{phrase("nebulaDescription")}</p></div><Button variant="outline" onClick={() => setLocation("/")}>{phrase("backWorkspace")}</Button></div><NebulaPreview language={language} /><VisibilityManager language={language} /></section>;
}
