# Implementation verification

Verified locally on macOS on 10 October 2026. Application: `http://127.0.0.1:4317`.

## Passed

- 27 automated tests; TypeScript build, lint and formatting checks.
- Catalog schema: 115 styles and 15 motion references. Original catalog files were not edited. Illustrative thumbnail coverage: 115/115, with separate catalog-hash example records.
- Real native SDK streaming with the exact requested models: GPT-6.1 Sol medium and Claude Opus 5.5. Both produced silent 3-second, 1280×720, 30 fps H.264 previews. Both sessions continued into 6-second, 1920×1080, 30 fps H.264 full videos.
- Full videos retained palette and renderer/motion choices; decoded contact sheets were inspected. Claude's full video includes a real AAC track from code-generated instrumental/effect audio. Codex's full video intentionally remains silent.
- Both native SDK sessions opened and then rejected correctly on cancellation.
- Real browser checks: 115 gallery cards, search, metadata, style pinning, desktop/mobile layouts, no horizontal overflow or page errors. Delivery checks: decoded playback advances, source ZIP excludes SDK state/dependencies, comparison restart, duration selection, Escape closes dialog, reduced-motion setting, and actual SSE reconnection after a cursor.
- SQLite ordered event persistence and restart recovery retain finished artifacts. Retry of completed generation reuses the production manifest rather than repeating the provider turn. Independent workspaces and bounded worker queues are exercised.
- Generated-code rendering uses macOS sandbox-exec: local network only, restricted writes, separate render home, no provider environment credentials, and denied credential/config paths. A read of an existing authentication file was denied with EPERM. A real Three.js/GSAP/HyperFrames export passed within this sandbox.

## Measured latency

These are observations from the first live fixtures, not performance guarantees. Preview playback length is three seconds; generation latency is separate.

| Model              | Output               | SDK generation | Validation/export |
| ------------------ | -------------------- | -------------: | ----------------: |
| GPT-6.1 Sol medium | Preview              |        391.5 s |            16.8 s |
| Claude Opus 5.5    | Preview              |        386.5 s |            19.2 s |
| GPT-6.1 Sol medium | Full, 6 s            |        241.3 s |            15.1 s |
| Claude Opus 5.5    | Full, 6 s with audio |        464.1 s |            23.2 s |

Future jobs record generation and validation/export timings separately and display elapsed time. The preview prompt has been narrowed to reduce unnecessary agent-side investigations; no faster benchmark is claimed.

## Remaining setup and verification limits

- Neither TYPESAFE_API_KEY nor JEV_API_KEY is configured. Live Jev ranking cannot run yet. Official SDK request/response behavior, scoring modes, combinations, missing assets, explicit conflicts, uncertainty, limits and API failures are covered by tests with mocked HTTP responses. Those tests do not prove a live Jev response.
- Exact provider availability is checked on the first brief turn; local SDK verification established access to both configured models in this environment. There is no silent model substitution.
- The Remotion fallback is implemented but was not exercised by these live exports; all used HyperFrames.
- Thumbnails are labeled illustrative palette/composition sketches. They are not full demonstrations of every style.
- Blender is not installed/configured. Required unavailable capabilities or photographic/voice assets must be disclosed by the agent. No external image, music, or voice service is called.
- This V1 renderer targets macOS. Hosted and multi-tenant execution are outside scope. The optional, dynamically loaded Three.js demonstration produces a build size advisory; the gallery itself remains static.

## Repeat checks

See README.md for startup and setup. Browser verification uses Playwright or VIDEO_BROWSER_PATH. Live provider verification consumes provider usage:

```sh
npm run test
npm run lint
npm run build
npm run format:check
npm run verify:browser
node --import tsx scripts/verify-delivery.ts
node --import tsx scripts/verify-cancellation.ts
node --import tsx scripts/verify-generation.ts codex
node --import tsx scripts/verify-generation.ts claude
node --import tsx scripts/verify-continuation.ts codex
node --import tsx scripts/verify-continuation.ts claude
```
