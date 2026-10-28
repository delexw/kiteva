import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, ConfigProvider, Select, Switch, Typography } from "antd";
import { translateUi, useUiLanguage } from "../i18n";
import { videoLanguages, deliverySpeech } from "../../shared/video-language";
import { selectLanguageTrackLanguages } from "../../shared/language-tracks";
import type { VideoRequest } from "../../shared/domains/video";
import type { LanguageTracks } from "../../shared/language-tracks";
import { SpeechSettings } from "./speech-settings";
import "./language-track-settings.css";

export function LanguageTrackSettings({
  request,
  onChange,
}: {
  request: Pick<VideoRequest, "languageTracks" | "speech" | "scriptItems" | "outputLanguage">;
  onChange: (value: LanguageTracks | undefined) => void;
}) {
  useUiLanguage();
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ languageTracksSupported?: boolean }>("/api/setup", { signal: controller.signal })
      .then((setup) => setSupported(setup.languageTracksSupported === true))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const value = request.languageTracks;
  const options = videoLanguages.map((entry) => ({
    value: entry.value,
    label: translateUi(entry.label),
  }));
  useEffect(() => {
    if (!value) {
      if (supported)
        onChange(
          selectLanguageTrackLanguages(
            request,
            request.speech?.mode === "narration" ||
              request.scriptItems?.some((item) => item.speech.mode === "narration")
              ? [request.outputLanguage || "en"]
              : [],
          ),
        );
      return;
    }
    const languages = [
      ...new Set([...value.narration.map((track) => track.language), ...value.subtitles]),
    ];
    if (
      value.narration.length !== languages.length ||
      value.subtitles.length !== (value.showSubtitles === false ? 0 : languages.length) ||
      (value.showSubtitles !== false &&
        value.narration.some((track) => !value.subtitles.includes(track.language))) ||
      (value.defaultSubtitle !== "off" &&
        value.defaultSubtitle !== (value.defaultNarration || value.narration[0]?.language))
    )
      onChange(selectLanguageTrackLanguages(request, languages));
  }, [request, value, onChange, supported]);
  return (
    <section aria-label={translateUi("Language tracks")} className="language-track-settings">
      {!supported && (
        <Typography.Text type="secondary">
          {translateUi(
            "Language tracks require the updated backend. Existing builds keep running until it can be restarted.",
          )}
        </Typography.Text>
      )}
      <ConfigProvider componentDisabled={!supported}>
        {value && (
          <>
            <Typography.Text type="secondary">
              {translateUi(
                "Share the same visuals and music. Each selected language narrates the script using its configured voice.",
              )}
            </Typography.Text>
            <label className="language-track-subtitles">
              <Switch
                aria-label={translateUi("Show subtitles on screen")}
                checked={value.showSubtitles !== false}
                onChange={(showSubtitles) =>
                  onChange(
                    selectLanguageTrackLanguages(
                      { ...request, languageTracks: { ...value, showSubtitles } },
                      value.narration.map((track) => track.language),
                    ),
                  )
                }
              />
              {translateUi("Show subtitles on screen")}
            </label>
            {value.narration.map((track) => (
              <section
                key={track.language}
                className="language-track-voice"
                aria-label={`${translateUi("Narration voice")} ${track.language}`}
              >
                <div className="language-track-voice-heading">
                  <strong>
                    {options.find((option) => option.value === track.language)?.label}
                  </strong>
                  <Button
                    aria-label={`${translateUi("Remove language")} ${track.language}`}
                    onClick={() =>
                      onChange(
                        selectLanguageTrackLanguages(
                          request,
                          value.narration
                            .filter((item) => item.language !== track.language)
                            .map((item) => item.language),
                        ),
                      )
                    }
                  >
                    {translateUi("Remove language")}
                  </Button>
                </div>
                <SpeechSettings
                  value={track.speech}
                  audioAssets={[]}
                  videoLanguage={track.language}
                  profileOnly
                  timedItem
                  sharedScript
                  onChange={(speech) => {
                    const adapted =
                      speech.mode === "narration"
                        ? deliverySpeech({
                            outputLanguage: track.language,
                            speech: { ...speech, followVideoLanguage: true },
                          })
                        : undefined;
                    if (adapted?.mode === "narration")
                      onChange({
                        ...value,
                        narration: value.narration.map((item) =>
                          item.language === track.language
                            ? {
                                ...track,
                                speech: {
                                  ...adapted,
                                  language: track.language,
                                  followVideoLanguage: false,
                                },
                              }
                            : item,
                        ),
                      });
                  }}
                />
              </section>
            ))}
            {value.narration.length < options.length && (
              <label className="language-track-add">
                {translateUi("Add language")}
                <Select<"en" | "zh">
                  aria-label={translateUi("Add language")}
                  placeholder={translateUi("Choose languages")}
                  value={undefined}
                  options={options.filter(
                    (option) => !value.narration.some((track) => track.language === option.value),
                  )}
                  onChange={(language) =>
                    onChange(
                      selectLanguageTrackLanguages(request, [
                        ...value.narration.map((track) => track.language),
                        language,
                      ]),
                    )
                  }
                />
              </label>
            )}
          </>
        )}
      </ConfigProvider>
    </section>
  );
}
