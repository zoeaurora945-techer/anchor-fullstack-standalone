export { i18n } from "../../../shared/i18nContract";
export type { Language } from "../../../shared/i18nContract";
import { i18n, type Language } from "../../../shared/i18nContract";

export const t = (language: Language) => i18n[language];
