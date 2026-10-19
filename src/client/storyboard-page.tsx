import { translateUi, useUiLanguage } from "./i18n";
import { useEffect, useState } from "react";
import { Button } from "antd";
import { PageTemplate } from "./components/page-template";
import { StoryboardMovie } from "./storyboard-movie-player";
import { api } from "./lib/api";
import { storyboardPageSchema, storyboardTime, type MangaStoryboard } from "./storyboard-model";

export function StoryboardComic({
  storyboard,
  base,
}: {
  storyboard: MangaStoryboard;
  base: string;
}) {
  useUiLanguage();
  return (
    <div className="manga-storyboard">
      <StoryboardMovie storyboard={storyboard} base={base} />
    </div>
  );
}

export function StoryboardPage({
  projectId,
  jobId,
  onBack,
}: {
  projectId: string;
  jobId: string;
  onBack: () => void;
}) {
  useUiLanguage();
  const [storyboard, setStoryboard] = useState<MangaStoryboard>();
  const [error, setError] = useState(false);
  const base = `/api/artifacts/${encodeURIComponent(projectId)}/${encodeURIComponent(jobId)}`;
  useEffect(() => {
    let active = true;
    setStoryboard(undefined);
    setError(false);
    void api<unknown>(`${base}/STORYBOARD.json`)
      .then((value) => {
        const parsed = storyboardPageSchema.parse(value);
        if (active) setStoryboard(parsed);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [base]);
  return (
    <PageTemplate
      className="storyboard-page"
      eyebrow="Workspace / Storyboard"
      title={storyboard?.title || translateUi("The director’s notebook.")}
      description={
        <p>
          {storyboard
            ? translateUi("{{value0}} scenes · {{value1}}", {
                value0: storyboard.scenes.length,
                value1: storyboardTime(storyboard.durationSeconds),
              })
            : translateUi("Your film, told panel by panel.")}
        </p>
      }
      actions={<Button onClick={onBack}>{translateUi("Back to project")}</Button>}
    >
      {error ? (
        <p role="alert">
          {translateUi(
            "We couldn’t load this storyboard. Check that the video has a saved storyboard.",
          )}
        </p>
      ) : storyboard ? (
        <StoryboardComic storyboard={storyboard} base={base} />
      ) : (
        <p role="status">{translateUi("Opening the storyboard…")}</p>
      )}
    </PageTemplate>
  );
}
