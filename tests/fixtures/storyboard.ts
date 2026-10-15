export function validStoryboard(durationSeconds = 3) {
  return {
    version: 3 as const,
    title: "An idea unfolds",
    durationSeconds,
    scenes: [
      {
        id: "scene-1",
        title: "Opening",
        startSeconds: 0,
        endSeconds: durationSeconds,
        purpose: "Introduce the idea",
        visuals: [],
        assets: [],
        beats: [
          {
            startSeconds: 0,
            endSeconds: durationSeconds,
            development: "A shape unfolds",
            captions: [],
            audio: { music: "", effects: [], lyrics: [] },
            readingHoldSeconds: 0,
          },
        ],
      },
    ],
    pacingAudit: { findings: [], justifiedHolds: [] },
    notes: [],
  };
}
