import type { AuthoringResource } from "../../shared/agents/authoring-resources";

// Source: package.json
// Source: node_modules/*/package.json
// Source: rendering/renderer-metadata.ts
export const localAuthoring: AuthoringResource = {
  id: "local_code",
  name: "Existing local code and libraries",
  kind: "local_code",
  guidance: `Existing local code and libraries

What it provides: Direct control of layout, typography, geometry and composition-time animation using the existing local dependencies and selected renderer contract.

Advantages / best fit:
- Exact brand/layout/typography or custom diagrams not represented by retrieved components
- Compositing existing recordings with titles and selected Motion Graphics
- Simple scenes or synchronous frame rendering where adapting an interactive component costs more than building the effect

Disadvantages / poor fit:
- Rebuilding a matching complex component or audited mechanism with no benefit
- Assuming a library name supplies a finished design or authored scene

Implementation costs and constraints:
- Verify installed dependencies before use; package availability does not imply compatibility with every renderer
- Use the selected renderer's supported APIs; dependencies and browser/GPU requirements still apply

Video adaptation:
- Own deterministic timing, random seeds, media synchronization and forward/backward seeks directly

Does not provide:
- Pre-authored component effects, Anatomy geometry/audits or automatic design decisions
- An automatic recorder, renderer switch or soundtrack generator

Choose when: Author the exact requested scene with existing HTML/CSS, SVG, Canvas, geometry and installed libraries when a specialized kit or component contributes no useful fidelity or imposes incompatible runtime behavior. This is a positive choice for bespoke work, not just a failure fallback.`,
};
