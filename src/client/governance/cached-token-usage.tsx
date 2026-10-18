import { translateUi, useUiLanguage } from "../i18n";
export function CachedTokenUsage({ input }: { input: number | null }) {
  useUiLanguage();
  return (
    <>
      <td>{input === null ? translateUi("Not recorded") : input.toLocaleString()}</td>
      <td>{translateUi("Not reported")}</td>
    </>
  );
}
