import { DeploymentPanel } from "@/components/DeploymentPanel";
import { MobilePairingPanel } from "@/components/MobilePairingPanel";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { language, phrase } = useLanguage();
  return <section className="mx-auto max-w-4xl space-y-5 py-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[.2em] text-primary">ANCHOR / DELIVERY</p><h1 className="mt-2 text-3xl font-semibold">{phrase("deliveryTitle")}</h1><p className="mt-2 text-sm text-muted-foreground">{phrase("deliveryDescription")}</p></div><Button variant="outline" onClick={() => setLocation("/")}>{phrase("backWorkspace")}</Button></div><MobilePairingPanel language={language} /><DeploymentPanel language={language} /></section>;
}
