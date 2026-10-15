import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  storyboardPageSchema,
  storyboardTime,
  storyboardAssetPath,
} from "../src/client/storyboard-model";
import { StoryboardComic } from "../src/client/storyboard-page";
const input = {
  title: "A simple film",
  durationSeconds: 120,
  scenes: [
    {
      id: "opening",
      title: "Opening",
      startSeconds: 0,
      endSeconds: 8,
      purpose: "Introduce the idea",
      visuals: ["A paper card"],
      assets: ["assets/example.jpg (hero reference)"],
      beats: [
        {
          startSeconds: 0,
          endSeconds: 2,
          development: "The card opens",
          captions: ["Every idea starts here"],
          audio: { music: "Bass groove", effects: "Paper sound", lyrics: [] },
          readingHoldSeconds: 1,
        },
        {
          startSeconds: 2,
          endSeconds: 8,
          development: "Hold the title",
          captions: [],
          audio: { music: "Continue the groove", effects: [], lyrics: [] },
        },
      ],
    },
  ],
};
it("parses saved scene data and accepts both string and array audio cues", () => {
  const storyboard = storyboardPageSchema.parse(input);
  expect(storyboard.scenes[0].beats[0].audio.effects).toEqual(["Paper sound"]);
  expect(storyboard.scenes[0].beats[1].audio.effects).toEqual([]);
  expect(storyboardPageSchema.safeParse({ ...input, durationSeconds: -1 }).success).toBe(false);
});
it("formats timestamps and distinguishes absent times from zero", () => {
  expect(storyboardTime(0)).toBe("0:00");
  expect(storyboardTime(75.5)).toBe("1:15.5");
  expect(storyboardTime(120)).toBe("2:00");
  expect(storyboardTime()).toBe("Time not specified");
});
it("uses only local raster asset references from storyboard descriptions", () => {
  expect(storyboardAssetPath("assets/example.jpg (hero reference)")).toBe("assets/example.jpg");
  expect(storyboardAssetPath("https://example.com/photo.jpg")).toBeUndefined();
  expect(storyboardAssetPath("assets/../../private.png")).toBeUndefined();
  expect(storyboardAssetPath("assets/untrusted.svg")).toBeUndefined();
});
it("renders the director comic with exact recorded cues, safe text and no invented camera move", () => {
  const storyboard = storyboardPageSchema.parse(input);
  storyboard.scenes[0].purpose = '<script>alert("example")</script>';
  const html = renderToStaticMarkup(
    <StoryboardComic storyboard={storyboard} base="/api/artifacts/project/job" />,
  );
  expect(html).not.toContain("<svg");
  expect(html).not.toContain("<canvas");
  expect(html).toContain("manga-clapper");
  expect(html).toContain("manga-reaction");
  expect(html).not.toContain("manga-shin");
  expect(html).not.toContain("manga-forearm");
  expect(html).not.toContain("manga-eyes");
  expect(html).not.toContain("manga-smile");
  expect(html).toContain("Stick-figure director");
  expect(html.match(/aria-label="Stick-figure director with a clapperboard"/g)).toHaveLength(1);
  expect(html.match(/aria-label="Stick-figure stagehand carrying a prop"/g)).toHaveLength(1);
  expect(html).toContain("movie-crew-layer");
  // The scenery moves beneath a single persistent crew and dialogue layer.
  const movingScene = html
    .split('class="movie-scene-pane movie-current-pane"')[1]
    ?.split('class="movie-crew-layer"')[0];
  expect(movingScene).toContain("movie-prop");
  expect(movingScene).not.toContain("movie-director");
  expect(movingScene).not.toContain("movie-speech");
  expect(html).not.toContain("--movie-director-left");
  expect(html).toContain("The card opens");
  expect(html).toContain('data-copy-length="short"');
  expect(html).toContain("movie-speech");
  expect(html).toContain('data-speaking="true"');
  expect(html).toContain("linear-gradient(to right, var(--manga-accent) 0%, #d5d5d5 0%)");
  expect(html).toContain("Every idea starts here");
  expect(html).not.toContain("SOUND CUES");
  expect(html).not.toContain("movie-sound");
  expect(html).not.toContain("Paper sound");
  expect(html).not.toContain("Open the scene notebook");
  expect(html).not.toContain("Download JSON");
  expect(html).not.toContain("full shot list");
  expect(html).toContain("/api/artifacts/project/job/assets/example.jpg");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("Camera moves in");
  expect(html).not.toContain("Animated rehearsal from your storyboard");
});
it("hides structured notes and never makes up timed scenes", () => {
  const storyboard = storyboardPageSchema.parse({
    durationSeconds: 30,
    sections: [
      {
        heading: "Original scene",
        blocks: [{ type: "paragraph", children: [{ type: "text", value: "A scene note" }] }],
      },
    ],
  });
  const html = renderToStaticMarkup(
    <StoryboardComic storyboard={storyboard} base="/api/artifacts/project/job" />,
  );
  expect(html).not.toContain("Original scene");
  expect(html).not.toContain("A scene note");
  expect(html).toContain("No timed beats");
});
