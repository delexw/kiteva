import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoPlayer } from "../src/client/components/video-player";
import { playbackTime } from "../src/client/lib/video-playback";

it("renders a compact accessible playback toolbar and preserves media options", () => {
  const html = renderToStaticMarkup(
    <VideoPlayer
      src="/sample.webm"
      aria-label="Example film"
      muted
      loop
      playsInline
      preload="metadata"
      poster="/poster.png"
    />,
  );
  expect(html).toContain('aria-label="Example film player"');
  expect(html).toContain('aria-label="Video playback controls"');
  for (const label of ["Play video", "Seek video", "Unmute video", "Enter fullscreen"])
    expect(html).toContain(`aria-label="${label}"`);
  expect(html).toContain('src="/sample.webm"');
  expect(html).toContain('poster="/poster.png"');
  expect(html).toContain('muted=""');
  expect(html).toContain('loop=""');
  expect(html).toContain('playsInline=""');
  expect(html).toContain("00:00");
  expect(html).not.toMatch(/<video[^>]*controls/);
});
it("formats stable whole-second video times including invalid metadata", () => {
  expect(playbackTime(90.9)).toBe("01:30");
  expect(playbackTime(0)).toBe("00:00");
  expect(playbackTime(Infinity)).toBe("00:00");
  expect(playbackTime(-4)).toBe("00:00");
});
