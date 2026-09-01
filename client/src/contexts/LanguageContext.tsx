import { i18n, type I18nKey, type Language } from "../../../shared/i18nContract";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type LanguageState = { language: Language; setLanguage: (language: Language) => void; phrase: (key: I18nKey) => string };
const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("anchor-language") as Language) || "zh");
  useEffect(() => { localStorage.setItem("anchor-language", language); }, [language]);
  const value = useMemo(() => ({ language, setLanguage, phrase: (key: I18nKey) => i18n[language][key] }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const state = useContext(LanguageContext);
  if (!state) throw new Error("useLanguage must be used inside LanguageProvider");
  return state;
}
