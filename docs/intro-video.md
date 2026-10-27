# How the intro film was made

[English README](../README.md) · [中文 README](../README.zh-CN.md)

The film at the top of the README was made in Kiteva itself, through the normal app workflow and
its HTTP API on a local install. It isn't a hand-made animation. This page records what went in and
what came out so you can try something similar.

## Files

| File                                                            | What it is                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`kiteva-intro.mp4`](assets/kiteva-intro.mp4)                   | The finished film exactly as Kiteva delivered it (with narration)                                                                                 |
| [`kiteva-intro-poster.jpg`](assets/kiteva-intro-poster.jpg)     | A still taken at 9.0 s of that MP4: the paper room, stickers scattered on the worktable, and the line "So I built Kiteva, a small creative room." |
| [`kiteva-intro-excerpt.webp`](assets/kiteva-intro-excerpt.webp) | A silent loop cut from that same MP4 for the README: 9.85–23.85 s (from "Bring an idea." through the logo), 820 px wide, 15 fps                   |

Checked with `ffprobe` and by pulling frames out of the MP4 myself:

| File                        | Measured                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kiteva-intro.mp4`          | 28.000 s · H.264 High, 1920×1080, 30 fps, 840 frames, yuv420p · AAC-LC 48 kHz stereo, 28.000 s · 3,358,427 bytes · SHA-256 `86d41b16…8d068caa2`, byte-identical to Kiteva's `renders/full.mp4` |
| `kiteva-intro-poster.jpg`   | JPEG, 1920×1080, frame at 9.0 s                                                                                                                                                                |
| `kiteva-intro-excerpt.webp` | Animated WebP, 820×462, 197 frames, 14.07 s, loops, no audio                                                                                                                                   |

## Request

| Setting                       | Value                                                                                                                             | Where it went                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Output                        | Video, 28 s, 16:9, 1080p, 30 fps                                                                                                  | settings fields              |
| Renderer                      | [HyperFrames](https://github.com/heygen-com/hyperframes)                                                                          | `renderer`                   |
| Provider and main model       | Claude, `claude-opus-5-5`                                                                                                         | `provider`, `mainModel`      |
| Preview directions            | 2                                                                                                                                 | `candidateCount`             |
| Pinned primary Motion Graphic | Sticker-Style Explainer Animation (`style-111`)                                                                                   | `pinnedStyleId`              |
| Interpretation                | Explore creative ideas                                                                                                            | `preference: "creative"`     |
| On-screen words               | Eight provided lines (below)                                                                                                      | `subtitles.mode: "provided"` |
| Voice                         | Local [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) narration, voice "Heart" (`af_heart`), speed 1, reading the subtitles | `speech`                     |
| Logo                          | The real `public/kiteva-mark.svg`, uploaded as an image attachment                                                                | Images section (`assetIds`)  |
| Music                         | None supplied. The film agent wrote its own instrumental in code (see below)                                                      | —                            |

The idea prompt only described the story and feel: a non-designer engineer's messy collection of motion
scraps sorting itself into an idea, a brief, Motion Graphic swatches, small previews and finally the
logo, warm and a bit self-deprecating, with no claims about speed or quality and no invented product screens.

The on-screen lines, written for the film:

```text
I'm not a designer.
I'm an engineer who kept collecting motion that felt alive.
Some of it dazzling. Some of it probably wrong.
So I built Kiteva, a small creative room.
Bring an idea. It writes a brief,
mixes Motion Graphics, previews a few directions,
and makes the film.
This one was made by Kiteva.
```

## What Kiteva did

All times are UTC on 2026-10-17, read from the run's own records.

1. **Brief, 09:47–09:51.** `claude-haiku-5-5` read the request and the uploaded logo, wrote the
   brief, then checked it in a separate self-review pass. It treated the eight lines as exact copy, kept
   the logo unaltered for the close, and noted that it could only read the SVG as XML, not see it.
2. **Motion Graphic summaries, 09:51–10:27.** Before ranking, Kiteva needs a short summary of every
   Motion Graphic. Many cached summaries were out of date on this install, so `claude-haiku-5-5`
   re-extracted them in 124 calls and reused the valid ones. That's why this step took 36 minutes. It
   doesn't happen on every project.
3. **Directions, 10:27–10:29.** `claude-opus-5-5` proposed at least 12 Motion Graphic combinations
   around the pinned Sticker-Style Explainer. JEV (`jev-1.13.0`) scored them and Kiteva kept two:
   **Paper Room** (Sticker-Style Explainer + Paper Cutout Illustration + 2.5D Parallax, score 90.4) and
   **Zine Press** (Sticker-Style Explainer + Risograph Printing, 89.7).
4. **Previews, 10:29–10:34.** Opus wrote one silent 3-second preview for each, both on the line
   "Bring an idea. It writes a brief,". Kiteva rendered and checked them. Three contrast findings were
   fixed by `claude-haiku-5-5` repair passes, and both previews passed.
5. **My pick, 10:35.** I chose Paper Room. It reads "a small creative room" literally and feels the
   most handmade. I asked for the full film through `POST /api/runs/:id/full` with a short note: keep the
   look, let each line finish before the next change, keep the camera still while text is up, and close
   on a plain field with the mark and the lowercase wordmark.
6. **Full film, 10:35–10:45.** Opus continued the Paper Room session and wrote the 28-second
   [HyperFrames](https://github.com/heygen-com/hyperframes) composition: inline SVG paper layers and stickers
   animated with [GSAP](https://gsap.com), with the uploaded SVG placed unchanged. Kiteva prepared the Kokoro narration
   first (17.45 s, with a measured cue for each line) and the captions follow those cues. The agent also
   synthesized a quiet felt-piano instrumental in code (about 90 BPM), which Kiteva mixed under the voice.
   Rendering took 38 s. Lint, runtime, layout, motion and contrast checks reported no errors, only
   warnings about file structure and the oversized camera layer (`#cam`) reaching past the frame edge. A `claude-haiku-5-5` result review
   followed. It left style match, narration and music marked as not verified.
7. **My checks.** Because that review left those items open, I checked them myself. I pulled frames at
   every caption: all eight lines appear in order and word for word. At full size the logo close is sharp
   and matches the uploaded mark. Audio sits around −20 dBFS RMS while the narration runs (0–17 s), drops
   to around −25 dBFS with music only, then fades out under the logo. I didn't listen to the
   audio, so voice quality and the mix balance are only inferred from those levels.

## Attempts

This was the third request with the same story and settings.

1. The first passed the logo as a localhost URL in the Websites field. Kiteva's reference browser
   expects an HTML page and couldn't read a bare SVG file, so the brief raised an optional question about
   the logo. That run never reached previews and isn't used here.
2. The second uploaded the logo as an image attachment instead. Its brief step failed: the small
   model's structured output was missing required fields (`suggestedDuration`, `durationReason`, a
   `constraints` array) five times in a row, and Kiteva stopped the run with that error. The run later
   stopped appearing in the API. I don't know why.
3. The third request is the one shown here. It's identical to the second. Nothing was edited by hand in
   between, and the app's source wasn't changed.

The only change from the first request was moving the logo from the URL field to the Images field.

## Reproduce

1. Run Kiteva locally (see the README quick start) with Claude access (an API key or a signed-in
   subscription) and a Typesafe key for JEV, then run `npm run speech:setup` for [Kokoro](https://github.com/thewh1teagle/kokoro-onnx).
2. In the room, start a **New idea**: write the story, attach `public/kiteva-mark.svg` under Images,
   turn on subtitles and paste the lines above, choose Narration with Kokoro "Heart", then set 28 s, 16:9,
   1080p, 30 fps, HyperFrames, two directions and the pinned Motion Graphic.
3. Wait for the previews, pick one, and build the full film.

Your film will be different. Proposals, JEV's choice and the generated code all vary from run to run.

**What this run cost (estimate):** about **$5.73** in model usage, from Kiteva's governance report
at 10:50 UTC (pricing table dated 2026-10-13). That breaks down as Opus 5.5 $4.27 (proposals $0.67,
previews $1.43, full film $2.16), Haiku 5.5 $1.46 (of which the one-off summary rebuild was $1.38), and
JEV $0.002. These are API-equivalent estimates from the Claude Agent SDK and JEV's published rate, not a
bill. With a subscription account they aren't a usage meter, and subscription usage reporting hasn't
been tested. The two earlier failed attempts and local rendering and narration time aren't included.
See [costs](costs.md).
