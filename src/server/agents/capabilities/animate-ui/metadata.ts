import { z } from "zod";
import type { ComponentRegistry } from "../shared/types";
import type { AuthoringResource } from "../../../../shared/agents/authoring-resources";

export const animateUiRegistry: ComponentRegistry = {
  id: "animate-ui",
  displayName: "Animate UI",
  url: "https://animate-ui.com/r/",
  licenseUrl: "https://raw.githubusercontent.com/imskyleen/animate-ui/main/LICENSE.md",
  itemName: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
};
// Source: https://animate-ui.com/r/registry.json
// Source: https://github.com/imskyleen/animate-ui
// Source: Installed node_modules/@animate-ui/react/package.json
// Source: animate-ui/tools.ts and shared/component-registry-tools.ts
export const animateUiAuthoring: AuthoringResource = {
  id: "animate_ui",
  name: "Animate UI",
  kind: "capability",
  guidance: `Animate UI

What it provides: Two distinct paths: official registry source via MCP, and the separately installed @animate-ui/react package. The reviewed registry is icon-heavy and also exposes backgrounds, hover buttons, a typed code block and router-specific page transitions. Inspect current source before use.

Advantages / best fit:
- Consistent animated iconography or compact control micro-interactions
- Specific registry backgrounds and code-block typing
- Interactive page transitions when the required router and browser APIs exist

Disadvantages / poor fit:
- Custom material/3D scenes, technical mechanism geometry or a complete film narrative
- A generic expectation of every animated form primitive being available in the public registry
- Router/view-transition effects in a renderer with no compatible app router

Implementation costs and constraints:
- Registry items are React source; inspect full imports, npm peers and registry dependencies
- @animate-ui/react installation alone does not prove all its peer dependencies are present
- MCP saves source only; it does not install packages or recursively resolve registry dependencies

Video adaptation:
- Replace hover, pointer, router events and autonomous motion with composition-time-driven state
- Preserve semantic/focus/reduced-motion behavior for interactive pages instead of forcing video adaptation there

Does not provide:
- A video renderer, app recorder, complete UI/product implementation or soundtrack generator
- Automatic compatibility with HTML/Canvas or synchronous Multiplane shots

Choose when: Choose when a concrete current Animate UI icon, background, button or component meaningfully supplies the requested UI motion. It saves work on coherent UI details, whereas React Bits emphasizes more expressive standalone effects and Anatomy supplies detailed mechanism geometry; do not infer the whole website's component library is exposed through this MCP registry.`,
};
