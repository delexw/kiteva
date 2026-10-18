import { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import english from "antd/locale/en_US";
import chinese from "antd/locale/zh_CN";
import zhCN from "./zh-CN.json";
import catalogUrl from "./catalog.zh-CN.json?url";
import governanceChinese from "./governance.zh-CN.json";

import en from "./en.json";
import xEnglish from "@ant-design/x/locale/en_US";
import xChinese from "@ant-design/x/locale/zh_CN";

export const uiLanguages = {
  en: { label: "EN", name: "English", antd: english, x: xEnglish },
  "zh-CN": { label: "中文", name: "简体中文", antd: chinese, x: xChinese },
} as const;
export type UiLanguage = keyof typeof uiLanguages;
export const uiLanguageStorageKey = "kiteva.ui-language";
export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === "string" && Object.hasOwn(uiLanguages, value);
}

/** Owns UI resources and language changes. Project content and output language are separate. */
export class UiLanguageService {
  readonly engine: i18n;
  private catalogLoading?: Promise<void>;
  private languageChange = 0;
  constructor() {
    this.engine = createInstance();
    void this.engine.use(initReactI18next).init({
      lng: "en",
      fallbackLng: "en",
      supportedLngs: Object.keys(uiLanguages),
      initAsync: false,
      keySeparator: false,
      nsSeparator: false,
      resources: {
        en: {
          translation: {
            ...en,
          },
        },
        "zh-CN": { translation: { ...governanceChinese, ...zhCN } },
      },
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  get language(): UiLanguage {
    const value = this.engine.resolvedLanguage || this.engine.language;
    return isUiLanguage(value) ? value : "en";
  }
  date(value: string | number | Date) {
    return new Intl.DateTimeFormat(this.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
  number(value: number) {
    return new Intl.NumberFormat(this.language).format(value);
  }
  matches(query: string, ...values: string[]) {
    const searchable = values
      .flatMap((value) => [value, this.translate(value)])
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(query.trim().toLocaleLowerCase());
  }
  async change(language: UiLanguage) {
    const change = ++this.languageChange;
    if (language === "zh-CN") {
      this.catalogLoading ??= this.loadCatalog()
        .then((catalog) => {
          this.engine.addResourceBundle("zh-CN", "translation", catalog, true, false);
        })
        .catch((error: unknown) => {
          this.catalogLoading = undefined;
          throw error;
        });
      await this.catalogLoading;
    }
    // A slower resource load must not undo a more recent language selection.
    if (change === this.languageChange) await this.engine.changeLanguage(language);
  }
  private async loadCatalog(): Promise<Record<string, string>> {
    // Keep Node rendering/tests local; the browser downloads data instead of evaluating a large JS module.
    if (import.meta.env.SSR) return (await import("./catalog.zh-CN.json")).default;
    const response = await fetch(catalogUrl);
    if (!response.ok) throw Error(`Unable to load UI catalog: ${response.status}`);
    return response.json();
  }
  translate(key: string, values: Record<string, unknown> = {}) {
    return String(this.engine.t(key, { ...values, defaultValue: key }));
  }
}
export const uiLanguage = new UiLanguageService();
export const translateUi = (key: string, values?: Record<string, unknown>) =>
  uiLanguage.translate(key, values);
