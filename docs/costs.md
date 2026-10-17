# What a Kiteva film costs (so far)

[English README](../README.md) · [中文 README](../README.zh-CN.md) · [Architecture](architecture.md)

Short answer: the only numbers I have come from three of my own development projects. Each one cost
roughly **$16 to $37** in model usage, as estimated by the Claude Agent SDK. That's a small, messy
sample, and it isn't a price list or a benchmark. Please read it that way.

## Where the numbers come from

- **Source**: Kiteva's own governance report, `GET /api/admin/governance`, which is also shown on the
  Governance page. Code: `src/server/governance/report.ts`.
- **Snapshot taken**: 2026-10-17 09:37 UTC.
- **Pricing date in the app**: 2026-10-13. The app links these pricing sources:
  [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing),
  [OpenAI pricing](https://developers.openai.com/api/docs/pricing),
  [Typesafe JEV models](https://docs.typesafe.ai/models).
- **Projects included**: the three finished projects that existed on this machine before the README
  demo. All three are Claude projects that made video. The README demo projects themselves are left out.
  Names, prompts, files and IDs are removed. Only settings and usage are kept.

## How the report computes cost

The report rebuilds costs from raw SDK usage events every time it's read. It never stores a running total.

| Basis label in the report                              | Meaning                                                                                                                                                         | Used for                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `SDK estimate · session increments`                    | The Claude Agent SDK's own `costUSD` per model, differenced between turns of the same session so resumed sessions aren't counted twice                          | All Claude rows below                         |
| `Standard API equivalent · short/long-context range`   | Tokens multiplied by the list prices in `report.ts`, shown as a low/high range because a turn's summed input doesn't reveal any single request's context length | Codex/OpenAI models (none in these examples)  |
| `Published Jev API rate`                               | Input tokens at $0.042 per million (only matched for `jev-1.13.*`)                                                                                              | JEV                                           |
| `Not reported` / `Usage unavailable or unpriced model` | No usable usage data. This means unknown, not zero                                                                                                              | Cache hits and anything the SDK didn't report |

Cached tokens are shown separately. For Claude the SDK's estimate already prices cache reads and writes,
so the report doesn't adjust it further. Savings estimated by the Caveman proxy are never subtracted.

**These are API-equivalent estimates, not your bill.** Kiteva can reach a provider with an API key or
with an existing signed-in subscription account:

- **Claude**: the Claude Agent SDK uses `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, or your local
  Claude Code sign-in under `~/.claude`.
- **Codex**: the Codex SDK uses `CODEX_API_KEY` / `OPENAI_API_KEY`, or the Codex CLI sign-in in
  `~/.codex/auth.json` (an API-key login or a ChatGPT sign-in). Kiteva's Caveman route sends ChatGPT
  sign-ins and API keys to different upstream paths.

Kiteva doesn't assume the two providers' subscriptions report usage the same way, and **reporting of
subscription usage or remaining percentage has not been tested**. When you're signed in with a subscription, the governance
numbers are still token counts priced at API rates. They are not a meter of your plan's allowance, they
don't tell you what's left, and they aren't what you'll be charged. JEV is configured separately: whenever Kiteva
generates directions it needs `TYPESAFE_API_KEY` (or `JEV_API_KEY`), and that usage falls under Typesafe's
own terms. Picking Motion Graphics yourself skips JEV.

## The three examples

|                               | Example A          | Example B                      | Example C             |
| ----------------------------- | ------------------ | ------------------------------ | --------------------- |
| Requested length              | 90 s               | 90 s                           | 120 s                 |
| Renderer                      | Multiplane (trial) | Multiplane (trial)             | HyperFrames (default) |
| Preview directions requested  | 5                  | 5                              | 5                     |
| Combination-proposal calls    | 1                  | 2 (directions generated twice) | 1                     |
| Preview builds recorded       | 5                  | 10                             | 5                     |
| Full-build invocations        | 3                  | 4                              | 3                     |
| Main-model repair invocations | 0                  | 9                              | 2                     |
| Input tokens (incl. cached)   | 12.0 M             | 29.4 M                         | 19.2 M                |
| of which cache reads          | 11.0 M (92 %)      | 27.1 M (92 %)                  | 17.9 M (93 %)         |
| Output tokens                 | 0.45 M             | 0.88 M                         | 0.47 M                |
| **Total estimate**            | **$16.46**         | **$37.42**                     | **$18.73**            |
| Incomplete history flag       | no                 | no                             | no                    |

Split by job (USD, SDK estimate):

| Job                                | Model              |     A |     B |     C |
| ---------------------------------- | ------------------ | ----: | ----: | ----: |
| Brief, review, lyrics, small fixes | `claude-haiku-5-5` |  0.04 |  0.04 |  0.09 |
| Combination proposals              | `claude-opus-5-5`  |  0.91 |  1.94 |  2.12 |
| Choosing directions                | `jev-1.13.0`       | 0.004 | 0.007 | 0.005 |
| Previews                           | `claude-opus-5-5`  |  4.25 | 10.74 |  3.90 |
| Full film builds                   | `claude-opus-5-5`  | 11.26 | 17.25 | 11.85 |
| Main-model repairs                 | `claude-opus-5-5`  |     — |  7.44 |  0.76 |

"Full-build invocations" counts SDK calls in full-film jobs, including retries and refinements. It
isn't a count of finished films. Motion Graphic summaries were served from cache in all three (135–136
cache hits each), so they show as "Not reported" and add no new calls.

## What this does and doesn't tell you

- Almost all the cost is the main model writing previews and the full film. The small model (brief,
  reviews, simple repairs) cost $0.04–$0.09 per project. JEV ranking cost $0.004–$0.007 per project,
  so under a cent each time, even for Example B, which ranked directions twice.
- Retries and regenerated directions add a lot. Example B generated directions twice and needed
  nine main-model repair calls, and it cost about twice as much as the others.
- Local compute isn't priced. Kiteva does record generation and render durations for each job, but
  this page doesn't turn CPU/GPU time, electricity or your waiting time into money. None of it is in the totals.
- Three projects, one person, one machine, still under development. Don't divide by minutes and call
  it a rate. Length, Motion Graphics, number of previews, repairs and model choice all change the result.
- History with missing usage is marked "incomplete" in the report and shouldn't be read as free.
  All three examples happened to have complete history.
- I didn't have a Codex/GPT-6.1 Sol project in this snapshot, so there's no example for that provider.
  For those models the report shows a short/long-context range based on the prices in `report.ts`.

## Check your own

Open **Explore → Governance** in the room, or request `GET /api/admin/governance` locally. Each project
lists every model, job, call count, token counts, cached tokens, cost basis and a recorded prompt link.
That last one stays on your machine, so don't paste it anywhere public.
