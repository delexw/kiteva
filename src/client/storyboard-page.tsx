import { translateUi, useUiLanguage } from "./i18n";
import { Button } from "antd";
import { PageTemplate } from "./components/page-template";
import { StoryboardMovie } from "./storyboard-movie-player";
import { storyboardTime, type MangaStoryboard } from "./storyboard-model";
import { useStoryboard } from "./use-storyboard";

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
  embedded = false,
}: {
  projectId: string;
  jobId: string;
  onBack: () => void;
  embedded?: boolean;
}) {
  useUiLanguage();
  const { storyboard, error, base } = useStoryboard(projectId, jobId);
  const title = storyboard?.title || translateUi("The director’s notebook.");
  const description = storyboard
    ? translateUi("{{value0}} scenes · {{value1}}", {
        value0: storyboard.scenes.length,
        value1: storyboardTime(storyboard.durationSeconds),
      })
    : translateUi("Your film, told panel by panel.");
  const content = error ? (
    <p role="alert">
      {translateUi(
        "We couldn’t load this storyboard. Check that the video has a saved storyboard.",
      )}
    </p>
  ) : storyboard ? (
    <StoryboardComic storyboard={storyboard} base={base} />
  ) : (
    <p role="status">{translateUi("Opening the storyboard…")}</p>
  );
  if (embedded)
    return (
      <section className="storyboard-page storyboard-page-embedded">
        <header className="storyboard-dialog-heading">
          <h2>{title}</h2>
          <p>{description}</p>
        </header>
        <div className="storyboard-dialog-animation">{content}</div>
      </section>
    );
  return (
    <PageTemplate
      className="storyboard-page"
      eyebrow="Workspace / Storyboard"
      title={title}
      description={<p>{description}</p>}
      actions={<Button onClick={onBack}>{translateUi("Back to project")}</Button>}
    >
      {content}
    </PageTemplate>
  );
}
