import { uiLanguage, translateUi, useUiLanguage } from "./i18n";
import { PageTemplate } from "./components/page-template";
import { Button, Input, Tag, Alert, Collapse } from "antd";
import { StudioSelect, StudioSelectOption } from "./components/studio-select";
import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { MotionPattern } from "../shared/contracts";
import { loadMotionCatalog } from "./motion-catalog";
import { Dialog } from "./dialog";
import { MotionCard } from "./motion-card";
import { MotionPreview } from "./motion-preview";
import { RecommendedStack } from "./recommended-stack";
import { MotionVariantList } from "./catalog-variants";
export function MotionExplorer() {
  useUiLanguage();
  const [motions, setMotions] = useState<MotionPattern[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All motions");
  const [playing, setPlaying] = useState(true);
  const [selected, setSelected] = useState<MotionPattern>();
  useEffect(() => {
    const controller = new AbortController();
    void loadMotionCatalog(controller.signal)
      .then(setMotions)
      .catch((error) => {
        if (!controller.signal.aborted) setError((error as Error).message);
      });
    return () => controller.abort();
  }, []);
  const filtered = motions.filter(
    (motion) =>
      (category === "All motions" || motion.category === category) &&
      uiLanguage.matches(search, motion.name, motion.description, motion.category),
  );
  return (
    <>
      <PageTemplate
        eyebrow="Library / Motion explorer"
        title={translateUi("A motion for every moment.")}
        description={<p>{translateUi("Explore reusable actions and transitions.")}</p>}
        actions={
          <Tag>
            {motions.length}
            {" " + translateUi("motions")}
          </Tag>
        }
        controls={
          <div className="library-controls">
            <div className="search-field">
              <Search size={18} />
              <Input
                aria-label={translateUi("Search motions")}
                placeholder={translateUi("Search actions, transitions, or subjects…")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <label className="category-select">
              <SlidersHorizontal size={16} />
              <StudioSelect
                aria-label={translateUi("Motion category")}
                value={category}
                onValueChange={(value) => setCategory(value)}
              >
                {["All motions", ...new Set(motions.map((m) => m.category))].map((value) => (
                  <StudioSelectOption key={value} value={value}>
                    {translateUi(value)}
                  </StudioSelectOption>
                ))}
              </StudioSelect>
            </label>
            <Button
              htmlType="button"
              aria-pressed={playing}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? translateUi("Pause previews") : translateUi("Play previews")}
            </Button>
            <span>
              {filtered.length}
              {" " + translateUi("results")}
            </span>
          </div>
        }
      >
        {error && <Alert type="error" showIcon title={error} />}
        <p className="example-disclaimer">
          {translateUi("Code-authored illustrative studies · silent previews")}
        </p>
        <div className="style-grid motion-grid">
          {filtered.map((motion) => (
            <MotionCard
              key={motion.id}
              motion={motion}
              playbackEnabled={playing && !selected}
              onSelect={() => setSelected(motion)}
            />
          ))}
        </div>
        {motions.length > 0 && filtered.length === 0 && (
          <p>{translateUi("No motions match these filters.")}</p>
        )}
        {selected && (
          <Dialog title={translateUi(selected.name)} onClose={() => setSelected(undefined)} wide>
            <div className="style-detail">
              <div>
                <MotionPreview
                  key={selected.id}
                  motionId={selected.id}
                  name={translateUi(selected.name)}
                  controls
                />
                <p className="example-disclaimer">
                  {translateUi(
                    "Illustrative motion study, not original reference footage. Interactive triggers are scheduled for preview.",
                  )}
                </p>
                <p>{translateUi(selected.description)}</p>
                <h3>{translateUi("Motion sequence")}</h3>
                <ol>
                  {selected.motion_sequence.map((step) => (
                    <li key={step}>{translateUi(step)}</li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="eyebrow">{translateUi(selected.category)}</div>
                <h3>{translateUi("Suitable contexts")}</h3>
                <ul>
                  {selected.compatibility.good_fit.map((context) => (
                    <li key={context}>{translateUi(context)}</li>
                  ))}
                </ul>
                <h3>{translateUi("Adapt or omit")}</h3>
                <ul>
                  {selected.compatibility.adapt_or_omit_when.map((context) => (
                    <li key={context}>{translateUi(context)}</li>
                  ))}
                </ul>
                <h3>{translateUi("Video adaptation")}</h3>
                <p>{translateUi(selected.video_adaptation)}</p>
                <MotionVariantList variants={selected.variants} />
                <Collapse
                  size="small"
                  items={[
                    {
                      key: "Recommended stack",
                      label: translateUi("Recommended stack"),
                      forceRender: true,
                      children: (
                        <>
                          <RecommendedStack
                            libraries={selected.tech.suggested_libraries}
                            implementation={selected.tech.implementation}
                            selectionGuidance={selected.tech.library_selection}
                          />
                        </>
                      ),
                    },
                  ]}
                />
                <Collapse
                  size="small"
                  items={[
                    {
                      key: "Executable prompt",
                      label: translateUi("Original executable prompt"),
                      forceRender: true,
                      children: (
                        <>
                          <pre>{selected.executable_prompt_template}</pre>
                        </>
                      ),
                    },
                  ]}
                />
                <Collapse
                  size="small"
                  items={[
                    {
                      key: "Complete metadata",
                      label: translateUi("Complete original metadata"),
                      forceRender: true,
                      children: (
                        <>
                          <pre>{JSON.stringify(selected, null, 2)}</pre>
                        </>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          </Dialog>
        )}
      </PageTemplate>
    </>
  );
}
