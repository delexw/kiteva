import type { AuthoringResource } from "../../../shared/agents/authoring-resources";
import { anatomySkill } from "./anatomy";

// Source: https://github.com/wheresryan22/anatomy.git
// Source: .agents/skills/anatomy/SKILL.md
// Source: bundled-skills/anatomy-prompt.ts
export const anatomyAuthoring: AuthoringResource = {
  id: anatomySkill.id,
  name: anatomySkill.name,
  kind: "bundled_skill",
  guidance: `Anatomy

What it provides: Framework-free SVG/HTML geometry kit, optional React adapters, perspective-aligned WebGL shaders and optional 3D mode. Includes worked mechanisms and geometry/depth/collision audits.

Advantages / best fit:
- Systems explained as physical mechanisms, instruments, cutaways and exploded assemblies
- Detailed isometric solids, pipes, gauges and model-driven readouts
- Consistent depth, shading and verifiable geometry rather than an off-the-shelf effect

Disadvantages / poor fit:
- Generic UI controls, text entrances or a ready-made particle background
- Human figure illustration inferred solely from the name Anatomy
- Scenes whose visual language should not resemble a crafted technical object

Implementation costs and constraints:
- Read the installed SKILL.md and closest example; use its kit and audit tools
- Core works without React; optional shaders require WebGL and verification uses Chrome/Chromium
- Installed revision and integrity are checked separately from semantic fit

Video adaptation:
- Replace idle tours, pointer input and incremental spring loops with deterministic composition-time state
- Preserve geometry audits and direct/backward seek correctness; optional 3D requires synchronous controller updates

Does not provide:
- A full film renderer, application recording, soundtrack or automatic scene narrative
- A reason to override selected Motion Graphics or their act assignments

Choose when: A technical isometric illustration kit and authoring methodology: explain a system through a detailed physical instrument or mechanism. This is not a human-anatomy library. Choose for explanatory object geometry, not generic UI animation or decorative effects.`,
};
