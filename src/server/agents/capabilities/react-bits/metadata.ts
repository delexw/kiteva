import { z } from "zod";
import type { ComponentRegistry } from "../shared/types";
import type { AuthoringResource } from "../../../../shared/agents/authoring-resources";

export const reactBitsRegistry: ComponentRegistry = {
  id: "react-bits",
  displayName: "React Bits",
  url: "https://reactbits.dev/r/",
  licenseUrl: "https://raw.githubusercontent.com/DavidHDev/react-bits/main/LICENSE.md",
  itemName: z.string().regex(/^[A-Za-z0-9]+-(JS|TS)(?:-(CSS|TW))?$/),
};
// Source: https://reactbits.dev/r/registry.json
// Source: https://github.com/DavidHDev/react-bits
// Source: react-bits/tools.ts and shared/component-registry-tools.ts
export const reactBitsAuthoring: AuthoringResource = {
  id: "react_bits",
  name: "React Bits",
  kind: "capability",
  guidance: `React Bits

What it provides: A source catalog of individual animated effects/components rather than a unified product UI or scene engine. Visual components commonly have JS/TS and CSS/Tailwind variants; newer utility/sound entries may have only JS/TS variants. Count families separately from variants.

Advantages / best fit:
- Distinctive text entrances and transformations such as split text
- Expressive backgrounds, gradients, particles and shader/image effects
- Interactive galleries, cards, navigation and hover/cursor effects with matching live source

Disadvantages / poor fit:
- An exact bespoke mechanical/technical illustration or handcrafted material scene absent from the catalog
- Choosing decorative effects that compete with recorded application footage or readable content
- Assuming every component uses the same animation/GPU library or is directly seekable

Implementation costs and constraints:
- Dependencies differ by component: read actual source declarations; examples can require GSAP/React integration, gesture libraries or GPU runtimes
- The MCP adapter discovers, reads and saves source, not npm dependencies; items declaring registry dependencies are not recursively installed
- The free registry does not imply access to Pro templates, agent kits or separate browser creative tools

Video adaptation:
- Convert scroll/hover/drag/input triggers, random state and requestAnimationFrame/physics loops into absolute-time-driven values
- Budget WebGL/GPU effects and inspect direct/backward seeks in the selected renderer
- A sound utility in this catalog is not evidence of a generated musical soundtrack or part of the visual choice

Does not provide:
- A renderer, website recorder, fully designed app or guaranteed deterministic video effect
- A reason to replace the selected Motion Graphic or change the selected renderer

Choose when: Choose when a specific current React Bits visual effect materially serves the selected Motion Graphics: expressive text, galleries, image treatments, particles, shaders or interface details. It saves work on expressive effects compared with hand-authoring them; Animate UI is more oriented toward UI details, and Anatomy toward model-driven technical objects. Check exact variants and dependencies; visual novelty alone is not a reason to choose it.`,
};
