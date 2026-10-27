import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ConfigProvider, Select, Switch, Typography } from "antd";
import { translateUi, useUiLanguage } from "../i18n";
import { videoLanguages, deliverySpeech } from "../../shared/video-language";
import { SpeechSettingsSchema } from "../../shared/speech";
import type { VideoRequest } from "../../shared/domains/video";
import type { LanguageTracks } from "../../shared/language-tracks";
import { SpeechSettings } from "./speech-settings";
import "./language-track-settings.css";

export function LanguageTrackSettings({
  request,
  onChange,
}: {
  request: VideoRequest;
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
  const defaultProfile = (language: "en" | "zh") => {
    const existing =
      request.scriptItems?.find((item) => item.speech.mode === "narration")?.speech ||
      request.speech;
    const speech = deliverySpeech({
      outputLanguage: language,
      speech: {
        ...SpeechSettingsSchema.options[1].parse(
          existing?.mode === "narration" ? existing : { mode: "narration" },
        ),
        followVideoLanguage: true,
      },
    });
    if (speech?.mode !== "narration") throw Error("No narration profile");
    return { language, speech: { ...speech, language, followVideoLanguage: false } };
  };
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
        <label className="language-track-settings-toggle">
          <Switch
            aria-label={translateUi("Multiple language tracks")}
            checked={Boolean(value)}
            onChange={(enabled) =>
              onChange(
                enabled ? { narration: [], subtitles: [], defaultSubtitle: "off" } : undefined,
              )
            }
          />{" "}
          {translateUi("Multiple language tracks")}
        </label>
        {value && (
          <>
            <Typography.Text type="secondary">
              {translateUi(
                "Share the same visuals and music. Choose narration and subtitle languages independently; spoken script items use these voices.",
              )}
            </Typography.Text>
            <div className="language-track-settings-fields">
              <label>
                {translateUi("Narration languages")}
                <Select
                  mode="multiple"
                  placeholder={translateUi("Choose languages")}
                  aria-label={translateUi("Narration languages")}
                  options={options}
                  value={value.narration.map((track) => track.language)}
                  onChange={(languages: ("en" | "zh")[]) =>
                    onChange({
                      ...value,
                      narration: languages.map(
                        (language) =>
                          value.narration.find((track) => track.language === language) ||
                          defaultProfile(language),
                      ),
                      defaultNarration: languages.includes(value.defaultNarration!)
                        ? value.defaultNarration
                        : languages[0],
                    })
                  }
                />
              </label>
              <label>
                {translateUi("Subtitle languages")}
                <Select
                  mode="multiple"
                  placeholder={translateUi("Choose languages")}
                  aria-label={translateUi("Subtitle languages")}
                  options={options}
                  value={value.subtitles}
                  onChange={(languages: ("en" | "zh")[]) =>
                    onChange({
                      ...value,
                      subtitles: languages,
                      defaultSubtitle:
                        value.defaultSubtitle !== "off" && languages.includes(value.defaultSubtitle)
                          ? value.defaultSubtitle
                          : "off",
                    })
                  }
                />
              </label>
              <label>
                {translateUi("Subtitles when playback starts")}
                <Select
                  aria-label={translateUi("Subtitles when playback starts")}
                  options={[
                    { value: "off", label: translateUi("Off") },
                    ...options.filter((option) => value.subtitles.includes(option.value)),
                  ]}
                  value={value.defaultSubtitle}
                  onChange={(defaultSubtitle) => onChange({ ...value, defaultSubtitle })}
                />
              </label>
            </div>
            <Typography.Text type="secondary">
              {translateUi(
                "Each script item's Show subtitle setting controls which captions are included. This selects the player's initial subtitle language; Off starts playback with captions hidden.",
              )}
            </Typography.Text>
            {value.narration.length > 0 && (
              <label className="language-track-settings-primary">
                {translateUi("Default narration")}
                <Select
                  aria-label={translateUi("Default narration")}
                  options={options.filter((option) =>
                    value.narration.some((track) => track.language === option.value),
                  )}
                  value={value.defaultNarration || value.narration[0].language}
                  onChange={(defaultNarration) => onChange({ ...value, defaultNarration })}
                />
              </label>
            )}
            {value.narration.map((track) => (
              <section
                key={track.language}
                aria-label={`${translateUi("Narration voice")} ${track.language}`}
              >
                <strong>{options.find((option) => option.value === track.language)?.label}</strong>
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
          </>
        )}
      </ConfigProvider>
    </section>
  );
}
