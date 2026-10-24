# Motion preview source

Each motion owns one drawing module. `registry.ts` connects the catalog ID to that module; `../motion-drawing.ts` supplies the canvas and absolute playback time. `drawing.ts` owns the shared palette, easing and drawing primitives.

Modules draw a 640 × 360 frame from a time between 0 and 6 seconds. They must support arbitrary forward and backward seeks without clocks, timers, network requests or retained animation state. The React preview owns playback and accessibility controls. The studies illustrate the catalog motions; they are not copies of the linked reference footage.

Motion descriptions and Motion Graphic links belong to the catalog and are independent of these implementations.

Claude Opus 5.5 rewrote the 43 studies and reviewed their rendered six-timestamp contact sheets. Repairs were rendered and reviewed again. The [review record](../../../assets/catalog/reviews/motion-preview-rewrite.json) lists each motion's source hash, changes, observations, limitations and model session. These reviews do not claim fidelity to original reference footage that was not inspected.

| Catalog ID | Motion                                         | Source                           |
| ---------- | ---------------------------------------------- | -------------------------------- |
| motion-001 | Hover-Triggered Door Bloom Interaction         | [motion-001.ts](./motion-001.ts) |
| motion-002 | Scroll-Driven Vortex Transit                   | [motion-002.ts](./motion-002.ts) |
| motion-003 | Immersive Float                                | [motion-003.ts](./motion-003.ts) |
| motion-004 | Scroll-Driven Helix Flow                       | [motion-004.ts](./motion-004.ts) |
| motion-005 | Cursor-Driven Luminous Flow                    | [motion-005.ts](./motion-005.ts) |
| motion-006 | Cursor-Driven Gaze Tracking                    | [motion-006.ts](./motion-006.ts) |
| motion-007 | Scroll-Driven Pinned Hero Recomposition        | [motion-007.ts](./motion-007.ts) |
| motion-008 | Scroll-Driven Section Reveal and Card Stacking | [motion-008.ts](./motion-008.ts) |
| motion-009 | Cursor-Driven Miniature Scene Parallax         | [motion-009.ts](./motion-009.ts) |
| motion-010 | Scroll-Driven Character Orbit Rotation         | [motion-010.ts](./motion-010.ts) |
| motion-011 | Hover-Driven 3D Voice Card Spatial Interaction | [motion-011.ts](./motion-011.ts) |
| motion-012 | Scroll-Driven Chaptered Scene Transition       | [motion-012.ts](./motion-012.ts) |
| motion-013 | Swipe Card Carousel                            | [motion-013.ts](./motion-013.ts) |
| motion-014 | Fluid Morphing Energy Orb                      | [motion-014.ts](./motion-014.ts) |
| motion-015 | Scroll-Driven Storytelling                     | [motion-015.ts](./motion-015.ts) |
| motion-016 | Cinematic Manga Opening Sequence               | [motion-016.ts](./motion-016.ts) |
| motion-017 | Cursor-Driven Hotspot Exploded Reveal          | [motion-017.ts](./motion-017.ts) |
| motion-018 | Swipe Gallery Carousel                         | [motion-018.ts](./motion-018.ts) |
| motion-019 | Scroll-Driven Camera Dolly                     | [motion-019.ts](./motion-019.ts) |
| motion-020 | Scroll-Driven Glitch Cut                       | [motion-020.ts](./motion-020.ts) |
| motion-021 | Cursor-Driven Camera Orbit                     | [motion-021.ts](./motion-021.ts) |
| motion-022 | Terminal Typing                                | [motion-022.ts](./motion-022.ts) |
| motion-023 | Cursor Wipe                                    | [motion-023.ts](./motion-023.ts) |
| motion-024 | Focus Reveal                                   | [motion-024.ts](./motion-024.ts) |
| motion-025 | Gallery Focus                                  | [motion-025.ts](./motion-025.ts) |
| motion-026 | UI Recompose                                   | [motion-026.ts](./motion-026.ts) |
| motion-027 | Elastic Arrival                                | [motion-027.ts](./motion-027.ts) |
| motion-028 | Travel Loop                                    | [motion-028.ts](./motion-028.ts) |
| motion-029 | Stroke Reveal                                  | [motion-029.ts](./motion-029.ts) |
| motion-030 | Data Build                                     | [motion-030.ts](./motion-030.ts) |
| motion-031 | Medium Swap                                    | [motion-031.ts](./motion-031.ts) |
| motion-032 | Flock Flow                                     | [motion-032.ts](./motion-032.ts) |
| motion-033 | Build Assembly                                 | [motion-033.ts](./motion-033.ts) |
| motion-034 | Cloth Response                                 | [motion-034.ts](./motion-034.ts) |
| motion-035 | Orbit Choreography                             | [motion-035.ts](./motion-035.ts) |
| motion-036 | Glitch Type Build                              | [motion-036.ts](./motion-036.ts) |
| motion-037 | Phrase Scatter & Step-In                       | [motion-037.ts](./motion-037.ts) |
| motion-038 | Punctuation Zoom                               | [motion-038.ts](./motion-038.ts) |
| motion-039 | Radial Logo Burst                              | [motion-039.ts](./motion-039.ts) |
| motion-040 | Word Smash Cuts                                | [motion-040.ts](./motion-040.ts) |
| motion-041 | Ranked Bar Race                                | [motion-041.ts](./motion-041.ts) |
| motion-042 | Lighting State Progression                     | [motion-042.ts](./motion-042.ts) |
| motion-043 | 360° Camera Orbit                              | [motion-043.ts](./motion-043.ts) |
| motion-044 | Glyph Ink-Flood Container Handoff              | [motion-044.ts](./motion-044.ts) |
| motion-045 | Annotation-Mark Portal Transition              | [motion-045.ts](./motion-045.ts) |
| motion-046 | Cumulative Device-Feed Pipeline                | [motion-046.ts](./motion-046.ts) |
| motion-047 | Rotating Sonar-Sweep Reveal                    | [motion-047.ts](./motion-047.ts) |
| motion-048 | Pixel-Tile Materialize & Targeted Delete       | [motion-048.ts](./motion-048.ts) |
| motion-049 | Step-Tick Slot Refill                          | [motion-049.ts](./motion-049.ts) |

`motion-043.ts` uses `../motion-orbit-preview.ts` for its projected 3D geometry.

Claude Opus 5.5 authored motion-044 to motion-046 from a frame analysis of a user-supplied recording. The same analysis added optional source-observed mechanisms to seven existing studies, and each one is visible in the preview window listed in the motion's catalog `variants` entry:

- motion-008: one card fans into a deck.
- motion-025: burst hub with a selected-card zoom-through.
- motion-026: a morphing connector becomes framing brackets.
- motion-029: annotation lifecycle.
- motion-036: ghost-smear glyph build.
- motion-038: keyword-glyph portal.
- motion-040: burst-masked swap and squash-to-band flip.

Claude Opus 5.5 authored motion-047 and motion-048 on 2026-10-18 from a frame analysis of a user-supplied anime-style music video. motion-047 rotates one sector beam clockwise around a fixed pivot over an original underwater scene: clear inside, dark dot matrix outside, with no accumulated history. motion-048 slices one original astronaut illustration into 48 real crops that assemble from seeded scatter, then a red selection box deletes fixed cells, which stay empty. Both modules export pure timing and state helpers. The [review record](../../../assets/catalog/reviews/terminal-lyric-anime.json) lists the evidence, links and limitations.

Claude Opus 5.5 authored motion-049 on 2026-10-24 from a frame analysis of a user-supplied pixel-art technical explainer. Four fixed slot lanes advance on one STEP clock: every active lane gains one token per tick; on its finishing tick a lane clears to a muted completion fill while its request icon exits right out of frame, and on the next tick a new request takes that same lane with one token while the other lanes keep their progress. No waiting queue is drawn: the source shows none, and the order of new requests is authored data. The schedule is replayed from step 0 for every query through exported pure helpers. The [review record](../../../assets/catalog/reviews/pixel-quest-explainer.json) lists the evidence, rejected candidates and limitations.

All drawings are original code; no source imagery is reused. The [frame-findings record](../../../assets/catalog/reviews/mg-frame-findings.json) maps each recommendation to its implementation and evidence frames. Its visual review stays pending until the rendered previews have been inspected.

Verification:

- `tests/motion-drawing.test.ts`: catalog coverage, motion semantics, finite drawing coordinates and repeatable seeks.
- `tests/motion-orbit-preview.test.ts`: camera path and front/back occlusion.
- `tests/terminal-lyric-anime.test.ts`: motion-047 rotation and mask semantics, motion-048 crops, assembly, fixed-cell deletion and seek stability, plus real canvas frames when the optional native canvas package is installed.
- `tests/pixel-quest-explainer.test.ts`: motion-049 tick, finish, exit and next-step replacement semantics, authored request order, no drawn queue, explicit lane-label colour and contrast, English-only copy and seek stability.
- `tests/mg-frame-findings.test.tsx`: the three frame-finding motions, the seven improved studies, variant contracts, catalog links and seek stability.
- `scripts/verify-motion-explorer.ts`: every catalog card and detail preview in the running app, pause/resume, pixel changes, repeatable seeking, offscreen pause and reduced motion. Run with `node --import tsx scripts/verify-motion-explorer.ts`.
