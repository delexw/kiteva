import { expect, it } from "vitest";
import {
  rendererMetadataFor,
  rendererDecisionMetadataFor,
} from "../src/server/rendering/renderer-metadata";
import { multiplaneAudioGuidance } from "../src/server/domains/video/route-prompts/multiplane-audio";
import { renderContract } from "../src/server/domains/video/prompts";
import { multiplaneRenderArgs } from "../src/server/rendering/multiplane";

it.each(["hyperframes", "multiplane", "remotion"] as const)(
  "defines serializable %s authoring and audio facts without claiming generation readiness",
  (renderer) => {
    const metadata = rendererMetadataFor(renderer);
    expect(metadata.id).toBe(renderer);
    expect(metadata.audio.generatesMusic).toBe(false);
    expect(metadata.visuals.frameContract).toBeTruthy();
    expect(metadata.audio.preparationOrder.length).toBeGreaterThan(1);
    expect(metadata.audio.narrationHandling).toContain("after rendering");
    expect(JSON.parse(JSON.stringify(metadata))).toEqual(metadata);
  },
);
it("uses Multiplane's own audio metadata for JEV, guidance and the actual render argument", () => {
  const metadata = rendererMetadataFor("multiplane");
  expect(multiplaneAudioGuidance).toBe(metadata.audio.guidance);
  expect(metadata.audio.integration).toBe("single_premixed_file");
  expect(metadata.audio.manifestField).toBe("audioFile");
  const args = multiplaneRenderArgs({
    shot: "shot.html",
    output: "renders/test.mp4",
    fps: 30,
    kind: "full",
    audioFile: "audio/music.wav",
  });
  expect(args.slice(-2)).toEqual([metadata.audio.cliArgument, "audio/music.wav"]);
});
it("uses the HyperFrames and fallback Remotion audio contracts without enabling a renderer switch", () => {
  const contract = renderContract("hyperframes", {
    width: 1920,
    height: 1080,
    duration: 20,
    fps: 30,
    kind: "full",
  });
  expect(contract).toContain(rendererMetadataFor("hyperframes").audio.guidance);
  expect(contract).toContain(rendererMetadataFor("remotion").audio.guidance);
  expect(rendererMetadataFor("remotion").selectionPolicy).toContain("verified");
  expect(rendererMetadataFor("hyperframes").audio.manifestField).toBeNull();
});

it.each(["hyperframes", "multiplane", "remotion"] as const)(
  "keeps %s decision capabilities while omitting production instructions",
  (renderer) => {
    const full = rendererMetadataFor(renderer);
    const decision = rendererDecisionMetadataFor(renderer);
    expect(decision.visuals).toEqual(full.visuals);
    expect(decision.limitations).toEqual(full.limitations);
    expect(decision.selectionPolicy).toBe(full.selectionPolicy);
    expect(decision.audio.generatesMusic).toBe(false);
    expect(decision.audio.previewPolicy).toBe(full.audio.previewPolicy);
    expect(decision).not.toHaveProperty("execution");
    expect(decision.audio).not.toHaveProperty("guidance");
    expect(JSON.stringify(decision).length).toBeLessThan(JSON.stringify(full).length);
  },
);
