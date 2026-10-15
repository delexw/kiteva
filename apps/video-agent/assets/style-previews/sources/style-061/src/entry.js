import * as THREE from 'three';
import { createScene, PAL } from './scene.js';
// Reviewed stack exposed for runtime inspection: Three.js + PBR Materials (MeshPhysicalMaterial) + Postprocessing (EffectComposer, RenderPass, BokehPass, OutputPass).
window.THREE = THREE;
window.PhotorealStillLife = { createScene, PAL, stack: { renderer: 'Three.js', materials: 'MeshPhysicalMaterial', post: ['EffectComposer', 'RenderPass', 'BokehPass', 'OutputPass'] } };
