import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createScene } from './scene.js';
// Expose the reviewed stack for runtime inspection (Three.js + PBR + Postprocessing).
window.THREE = THREE;
window.StainedGlass = { createScene, stack: { renderer: 'Three.js', materials: 'MeshStandardMaterial', post: [EffectComposer.name, 'RenderPass', UnrealBloomPass.name, OutputPass.name] } };
