import { useEffect, type ReactNode } from "react";
import { useTranslation, I18nextProvider } from "react-i18next";
import { ConfigProvider, Segmented } from "antd";
import { studioTheme } from "../theme";
import {
  isUiLanguage,
  uiLanguage,
  uiLanguages,
  uiLanguageStorageKey,
  translateUi,
} from "./service";
export { uiLanguage, uiLanguages, uiLanguageStorageKey, translateUi } from "./service";
export type { UiLanguage } from "./service";

export function useUiLanguage() {
  useTranslation(undefined, { i18n: uiLanguage.engine });
  return {
    language: uiLanguage.language,
    changeLanguage: (language: keyof typeof uiLanguages) => uiLanguage.change(language),
  };
}
export function UiLanguageProvider({ children }: { children: ReactNode }) {
  const { language } = useUiLanguage();
  useEffect(() => {
    // Browser storage is read only after mounting, so server-rendered components are safe.
    const persist = () => {
      document.documentElement.lang = uiLanguage.language;
      try {
        localStorage.setItem(uiLanguageStorageKey, uiLanguage.language);
      } catch {
        /* In-memory preference remains available. */
      }
    };
    const storage = (event: StorageEvent) => {
      if (event.key === uiLanguageStorageKey && isUiLanguage(event.newValue))
        void uiLanguage.change(event.newValue);
    };
    uiLanguage.engine.on("languageChanged", persist);
    try {
      const saved = localStorage.getItem(uiLanguageStorageKey);
      if (isUiLanguage(saved)) void uiLanguage.change(saved);
      else persist();
    } catch {
      /* The switch still works when browser storage is unavailable. */
      persist();
    }
    window.addEventListener("storage", storage);
    return () => {
      uiLanguage.engine.off("languageChanged", persist);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return (
    <I18nextProvider i18n={uiLanguage.engine}>
      <ConfigProvider theme={studioTheme} locale={uiLanguages[language].antd}>
        {children}
      </ConfigProvider>
    </I18nextProvider>
  );
}
export function UiLanguageSwitch() {
  const { language, changeLanguage } = useUiLanguage();
  return (
    <Segmented
      className="room-language-switch"
      size="small"
      aria-label={translateUi("Interface language")}
      value={language}
      options={Object.entries(uiLanguages).map(([value, entry]) => ({
        value,
        label: entry.label,
        title: entry.name,
      }))}
      onChange={(value) => {
        if (isUiLanguage(value)) void changeLanguage(value);
      }}
    />
  );
}
