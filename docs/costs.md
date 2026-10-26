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

The report reads SDK-reported costs from saved usage events whenever it is requested. Claude costs come directly from the SDK. Codex, whose SDK reports tokens but no amount,
uses the current standard short-context API rates without inferring a cost range.

| Basis label                                   | Meaning                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SDK estimate · session increments`           | Reported cumulative cost, differenced between results in the same session so resumed spend is counted once. |
| `SDK reported cost`                           | A reported amount for a non-cumulative invocation.                                                          |
| `Standard API estimate · short-context rates` | Codex usage increments at standard input, cached-read, cache-write and output rates.                        |
| `Not reported`                                | No SDK amount or supported Codex estimate is available. Unknown cost is not zero.                           |

Claude's per-model `costUSD` is used directly. For older records without per-model cost,
its reported `total_cost_usd` is used through the saved `cost` field. Counter resets start a
new baseline. Duplicate invocation results add no new spend. Raw SDK usage and costs remain
unchanged in the logs; cache-duration counters are shown when available but do not determine
cost. Savings estimated by the Caveman proxy are never subtracted.

Codex usage is typed against the installed SDK `Usage` contract. Cumulative counters are
differenced by thread before pricing, including across preview/full builds and model changes.
Cached reads and writes are subsets of input, and reasoning is already included in output;
neither is charged twice. Codex rates are verified against the
[official pricing page](https://developers.openai.com/api/docs/pricing) on 2026-10-26.
The estimate uses short-context standard rates and 30-minute cache writes; aggregate counters
do not establish request lengths, write retention or service tiers, so no premiums are inferred.
It is an API-equivalent estimate, not a billed amount. Unknown models or missing input/output
and cached-read counters remain unpriced. JEV token-only records remain unpriced.
Totals combine SDK-reported costs and known Codex estimates. SDK estimates are not invoices or subscription-allowance meters, and
may reflect the SDK's own pricing assumptions. The historical examples below describe their
recorded snapshot, including its then-published JEV-rate calculation; that calculation is no
longer used by the current report.

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
