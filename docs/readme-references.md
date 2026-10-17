# README references

Before rewriting Kiteva's README I read 24 READMEs from public projects in the
AI and media space I follow, plus five of their language companions. This page
records what I took from them and what I chose to leave out. None of their
text, images or claims are reused. Being listed here doesn't mean a project is
integrated with Kiteva. The ones Kiteva actually uses appear in the
[technology inventory](technology-pool.md).

Read on 2026-10-17 from each repository's default branch.

## What I adopted

| Lesson                                                                                                                       | Where I saw it done well                                                                                                                                                                                                                                      | How Kiteva uses it                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Put a short animated excerpt at the top and link it to the full MP4, because GitHub won't reliably play a relative `<video>` | [huashu-design](https://github.com/alchaincyf/huashu-design), [lottie](https://github.com/diffusionstudio/lottie)                                                                                                                                             | A silent excerpt of the Kiteva-made intro film links to the tracked MP4                                   |
| Caption every screenshot and give it real alt text                                                                           | [OpenMontage](https://github.com/calesthio/OpenMontage), [Anatomy](https://github.com/wheresryan22/anatomy), [OpenScreen](https://github.com/getopenscreen/openscreen)                                                                                        | Desktop room, Storyboard and gallery shots each say what they show                                        |
| Keep a first-person origin story                                                                                             | [huashu-design](https://github.com/alchaincyf/huashu-design)                                                                                                                                                                                                  | The author note opens the README in both languages                                                        |
| Name the limits plainly                                                                                                      | [Multiplane](https://github.com/LBEILC/Multiplane) (a determinism-and-limits section), [Anatomy](https://github.com/wheresryan22/anatomy) (a Limits section and beta note), [OpenScreen](https://github.com/getopenscreen/openscreen) (a project-status note) | A "Known limits" section, plus renderer limits in the architecture doc                                    |
| Label collected heuristics as rules of thumb and credit their sources                                                        | [ClipSkills](https://github.com/appergb/ClipSkills)                                                                                                                                                                                                           | The catalog is described as a personal collection that may contain mistakes                               |
| Flag non-standard license terms at the very top                                                                              | [Palmier Pro](https://github.com/palmier-io/palmier-pro), [Remotion](https://github.com/remotion-dev/remotion), [React Bits](https://github.com/DavidHDev/react-bits)                                                                                         | A note right under the media says the license is non-commercial and is not OSI open source                |
| Keep code licenses, model-weight licenses and third-party notices separate                                                   | [Supertonic](https://github.com/supertone-oss-archive/supertonic), [Video2X](https://github.com/k4yt3x/video2x), [InvokeAI](https://github.com/invoke-ai/InvokeAI)                                                                                            | The inventory separates original code, the vendored skill, npm packages, external tools and model weights |
| Give the pipeline as one short chain before going into detail                                                                | [video-use](https://github.com/browser-use/video-use), [Pixelle-Video](https://github.com/ATH-MaaS/Pixelle-Video)                                                                                                                                             | "Idea → brief → combinations → previews → film → review" sits above the feature tour                      |
| Use tables with a status column instead of adjectives                                                                        | [HyperFrames](https://github.com/heygen-com/hyperframes), [Voicebox](https://github.com/jamiepine/voicebox), [React Bits](https://github.com/DavidHDev/react-bits)                                                                                            | Compact README tables, with the full lists in linked docs                                                 |
| Count catalogs from the files they live in                                                                                   | [Open Generative AI](https://github.com/Anil-matcha/Open-Generative-AI) (counts checked against its model file)                                                                                                                                               | Counts come from `assets/catalog/*.json` and `src/shared/technology-pool.ts`                              |
| Date cost numbers and show the calculation; put a cost next to a concrete example                                            | [voice-pro](https://github.com/abus-aikorea/voice-pro) (dated pricing with calculation steps), [hypit](https://github.com/hypit-ai/hypit) (a total cost under each example)                                                                                   | The cost section states the snapshot and pricing dates and links the method                               |
| Say clearly how skills are loaded for each agent                                                                             | [Anatomy](https://github.com/wheresryan22/anatomy), [Garden Skills](https://github.com/ConardLi/garden-skills)                                                                                                                                                | Separate notes for Claude (local plugin plus `Skill` tool) and Codex (workspace files)                    |
| Write bug-report guidance that asks for reproduction steps                                                                   | [OpenReel](https://github.com/Augani/openreel-video), [hypit](https://github.com/hypit-ai/hypit)                                                                                                                                                              | `CONTRIBUTING.md` and the PR template                                                                     |
| Write both languages in full, rather than translating half                                                                   | [ClipSkills](https://github.com/appergb/ClipSkills), [Multiplane](https://github.com/LBEILC/Multiplane), [Pixelle-Video](https://github.com/ATH-MaaS/Pixelle-Video)                                                                                           | `README.md` and `README.zh-CN.md` cover the same facts and the same license terms                         |
| Hide long reference material in collapsible sections or linked docs                                                          | [ViMax](https://github.com/HKUDS/ViMax), [OpenReel](https://github.com/Augani/openreel-video)                                                                                                                                                                 | Architecture, inventory and costs each live in their own doc                                              |

## What I left out on purpose

- Star-history charts, trending badges, download counters and view-count promises.
- Superlatives such as "first", "best", "production-grade" or "studio quality".
  Kiteva is a personal project and the README describes what the code does.
- Sponsor tiers, affiliate partner tables, white-label sales and upsells.
- Price comparisons with other products, and per-video cost headlines. Kiteva
  reports measured costs from a few development projects and says how uncertain they are.
- Hosted demos and waitlists. Kiteva runs locally and nothing is hosted.
- Positioning like "no content filters" or "alternative to X".

## Projects read

Code renderers: [HyperFrames](https://github.com/heygen-com/hyperframes) ·
[Remotion](https://github.com/remotion-dev/remotion) ·
[Multiplane](https://github.com/LBEILC/Multiplane) ·
[Text-to-Lottie](https://github.com/diffusionstudio/lottie)

Agentic media apps: [Pixelle-Video](https://github.com/ATH-MaaS/Pixelle-Video) ·
[video-use](https://github.com/browser-use/video-use) ·
[ViMax](https://github.com/HKUDS/ViMax) ·
[hypit](https://github.com/hypit-ai/hypit) ·
[OpenMontage](https://github.com/calesthio/OpenMontage) ·
[Open Generative AI](https://github.com/Anil-matcha/Open-Generative-AI)

Creative desktop editors and capture: [OpenCut](https://github.com/OpenCut-app/OpenCut) ·
[OpenReel Video](https://github.com/Augani/openreel-video) ·
[Palmier Pro](https://github.com/palmier-io/palmier-pro) ·
[OpenScreen](https://github.com/getopenscreen/openscreen) ·
[InvokeAI](https://github.com/invoke-ai/InvokeAI) ·
[Video2X](https://github.com/k4yt3x/video2x)

Audio: [Voicebox](https://github.com/jamiepine/voicebox) ·
[voice-pro](https://github.com/abus-aikorea/voice-pro) ·
[Supertonic](https://github.com/supertone-oss-archive/supertonic)

Skills and UI motion: [Anatomy](https://github.com/wheresryan22/anatomy) ·
[huashu-design](https://github.com/alchaincyf/huashu-design) ·
[Garden Skills](https://github.com/ConardLi/garden-skills) ·
[ClipSkills](https://github.com/appergb/ClipSkills) ·
[React Bits](https://github.com/DavidHDev/react-bits)

A note on OpenScreen: its desktop recorder is a separate app. Kiteva's website
capture is its own headless browser tool (`capture_video`) and does not use OpenScreen.
