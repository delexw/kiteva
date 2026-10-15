import type { z } from "zod";
import type { StackEntrySchema } from "./contracts";

export type TechnologyDefinition = z.infer<typeof StackEntrySchema>;

// Shared recommended technologies; original assignments are preserved.
// Style-specific differences are retained as overrides on each catalog reference.
export const technologyPool = {
  hyperframes: {
    name: "HyperFrames",
    kind: "npm_cli_framework",
    package: "hyperframes",
    runtime: "HTML composition in browser; CLI orchestration in Node.js",
    purpose:
      "Primary pipeline for scene assembly, seekable composition timing, media and audio synchronization, validation, and final export. Visual construction and motion design remain owned by the selected style renderer and motion engine.",
    suggested_apis: [
      "data-composition-id",
      "data-width / data-height",
      "data-start / data-duration",
      'class="clip"',
      "window.__timelines[compositionId]",
      "npx hyperframes check",
      "npx hyperframes snapshot --at <seconds>",
      "npx hyperframes render --output <video.mp4>",
    ],
    optional: false,
    docs_url: "https://hyperframes.heygen.com/developers",
    suggested_libraries: [
      {
        name: "GSAP",
        package: "gsap",
        purpose:
          "Build a paused, seekable timeline and register it with HyperFrames after construction is complete.",
        suggested_apis: ["gsap.timeline({ paused: true })", "fromTo", "to", "set", "addLabel"],
        runtime: "browser",
        docs_url: "https://gsap.com/docs/v3/",
      },
    ],
    style_application:
      "Compose the output of the selected visual and motion layers. Supply seekable time or integrate baked assets; do not replace the style-specific rendering or motion method with framework defaults.",
    selection_guidance:
      "Use HyperFrames by default. Fall back to Remotion only when the documented fallback condition is met, and record the reason. Do not mix framework APIs.",
    priority: "primary",
    production_roles: ["render_pipeline"],
    role: "composition_and_export_pipeline",
  },
  multiplane: {
    name: "Multiplane",
    kind: "npm_cli_framework",
    package: "multiplane",
    runtime:
      "HTML shot in headless Chromium through Playwright; CLI orchestration in Node.js 24+; FFmpeg encoding",
    purpose:
      "Experimental trial render pipeline: renders a shot.html whose image depends only on render(t), with supersampling, motion blur and film grain, then encodes MP4, WebM or MOV.",
    suggested_apis: [
      "Shot.define({ duration, fps, render(t) })",
      "#stage fixed CSS width/height",
      "Shot.ease.prog / lerp / clamp",
      "multiplane lint <shot.html> --json",
      "multiplane inspect <shot.html> --json",
      "multiplane verify <shot.html> --json",
      "multiplane render <shot.html> --json --format webm|mp4 --quality fast|standard --fps <n>",
    ],
    optional: true,
    docs_url: "https://github.com/LBEILC/Multiplane",
    style_application:
      "Draw the selected style's visual and motion layers inside #stage from time t alone; the renderer adds sampling and encoding only.",
    selection_guidance:
      "Use only when the project's renderer setting is the Multiplane trial. Pinned to multiplane 0.3.6 in the app package, sharing the app's Three.js. Do not mix with HyperFrames or Remotion APIs, CSS animations, timers or media playback. One local audio file at most, passed by the app.",
    priority: "trial",
    production_roles: ["render_pipeline"],
    role: "composition_and_export_pipeline",
  },
  openscreen: {
    name: "OpenScreen",
    kind: "desktop_cli_tool",
    package: null,
    runtime:
      "External desktop app/CLI; requires a display server and a real desktop session for recording",
    purpose:
      "Prepare real screen recordings with cursor-following zooms, click effects and annotations; export MP4/GIF footage for the video composition.",
    suggested_apis: [
      "openscreen help",
      "openscreen record --duration 30 --project demo.openscreen --json",
      "openscreen export demo.openscreen -o demo.mp4 --auto-zoom --json",
      "openscreen info demo.openscreen --json",
      "openscreen pack demo.openscreen --out bundle/",
    ],
    optional: true,
    docs_url: "https://getopenscreen.com/docs/cli/",
    style_application:
      "Prepare source footage when a real product interaction is needed; import the exported footage into the selected composition pipeline.",
    selection_guidance:
      "Use as an external installed desktop/CLI supporting tool, not a browser library or bundled renderer. Verify the installed CLI version and help before use; CLI and editable .openscreen project JSON may change between releases. Headless CLI operation still requires a display server. Recording requires OS screen-recording permission; click telemetry may require accessibility permission. Capture only the authorized app or window. Auto-zoom relies on recorded click telemetry. --json emits NDJSON. Keep media alongside editable projects or use pack. Preserve HyperFrames for composition/export and HTML/CSS plus GSAP for the manga storyboard; OpenScreen does not replace them.",
    production_roles: ["supporting_tool"],
  },
  matter_js: {
    name: "Matter.js",
    kind: "npm_library",
    package: "matter-js",
    runtime: "browser or Node.js for simulation baking",
    purpose:
      "Simulate 2D rigid bodies with gravity, collisions, restitution, friction and constraints; render their poses with the chosen visual layer.",
    suggested_apis: [
      "Engine.create",
      "Engine.update",
      "Bodies.rectangle",
      "Bodies.circle",
      "Bodies.fromVertices",
      "Body.setVelocity",
      "Body.applyForce",
      "Composite.add",
      "Constraint.create",
      "Events.on",
    ],
    optional: true,
    docs_url: "https://brm.io/matter-js/docs/",
    style_application:
      "Use when 2D physical contact, bounce, stacking or constrained movement contributes to the story. Keep the style renderer responsible for appearance.",
    selection_guidance:
      "For video, precompute poses with seeded initial conditions and fixed Engine.update steps, then sample cached states by composition time for direct and backward seeking. Do not drive exports with Runner.run or a wall-clock loop. For interactive pages, a live runner is appropriate. This is 2D rigid-body physics, not 3D, fluid or true soft-body simulation; authored deformation remains a separate layer. Bodies.fromVertices may need poly-decomp for concave shapes. Keep critical text and imagery readable.",
    production_roles: ["motion_engine"],
  },
  html_css: {
    name: "HTML/CSS",
    kind: "browser_native",
    package: null,
    runtime: "browser",
    purpose:
      "Lay out real text, typography, and interface elements with accessible, measurable browser primitives.",
    suggested_apis: ["CSS Grid", "Flexbox", "transform", "clip-path", "backdrop-filter"],
    optional: false,
    docs_url: "https://developer.mozilla.org/en-US/docs/Web/CSS",
    style_application:
      "Apply this tool to International Typographic Style (Swiss Style) according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  svg: {
    name: "SVG",
    kind: "browser_native",
    package: null,
    runtime: "browser",
    purpose: "Draw scalable shapes, icons, strokes, clipping paths, and masks.",
    suggested_apis: [
      "path",
      "viewBox",
      "mask",
      "clipPath",
      "stroke-dasharray",
      "stroke-dashoffset",
    ],
    optional: false,
    docs_url: "https://developer.mozilla.org/en-US/docs/Web/SVG",
    style_application:
      "Apply this tool to International Typographic Style (Swiss Style) according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  gsap: {
    name: "GSAP",
    kind: "npm_library",
    package: "gsap",
    runtime: "browser",
    purpose:
      "Coordinate tweens, staggered actions, and a paused, seekable timeline driven by deterministic video time.",
    suggested_apis: ["gsap.timeline", "gsap.to", "stagger", "timeline.seek"],
    optional: false,
    docs_url: "https://gsap.com/docs/v3/",
    style_application:
      "Apply this tool to International Typographic Style (Swiss Style) according to visual_cues and tech.implementation.",
    production_roles: ["motion_engine"],
  },
  remotion: {
    name: "Remotion",
    kind: "npm_library",
    package: "remotion",
    runtime: "React in browser; rendering orchestrated by Node.js",
    purpose:
      "Conditional fallback pipeline for scene assembly, seekable composition timing, media and audio synchronization, validation, and final export. Visual construction and motion design remain owned by the selected style renderer and motion engine.",
    suggested_apis: [
      "Composition",
      "Sequence",
      "useCurrentFrame",
      "useVideoConfig",
      "interpolate",
      "spring",
    ],
    optional: true,
    docs_url: "https://www.remotion.dev/docs/",
    style_application:
      "Compose the output of the selected visual and motion layers. Supply seekable time or integrate baked assets; do not replace the style-specific rendering or motion method with framework defaults.",
    priority: "fallback",
    selection_guidance:
      "Use Remotion only when HyperFrames is unavailable in the current environment or a verified limitation prevents a required capability or output. Record the specific reason. An existing React project alone is not a fallback reason.",
    production_roles: ["render_pipeline"],
    role: "composition_and_export_pipeline",
  },
  motion: {
    name: "Motion",
    package: "motion",
    runtime: "browser; motion/react for mounted React components",
    role: "animation_library",
    purpose:
      "Optional animation of DOM or SVG layers for International Typographic Style (Swiss Style). Preserve the style-specific timing and visual cues; verify deterministic video seeking before use.",
    suggested_apis: ["animate", "stagger", "animation.pause()"],
    integration_guidance:
      "Use the JavaScript entry point for HTML compositions. Motion is an optional layer, not a drop-in replacement for the HyperFrames GSAP timeline contract. Explicitly synchronize and verify seeking; use GSAP when that integration is not established. Use motion/react only within a React component runtime.",
    optional: true,
    docs_url: "https://motion.dev/docs/animate",
    kind: "npm_library",
    production_roles: ["motion_engine"],
  },
  chroma_js: {
    name: "chroma.js",
    kind: "npm_library",
    package: "chroma-js",
    runtime: "browser and Node.js",
    role: "color_processing",
    purpose:
      "Optionally validate colors, derive controlled palette variants, interpolate colors, and check foreground/background contrast.",
    suggested_apis: [
      "chroma.valid",
      "chroma.scale",
      "scale.mode('lab')",
      "scale.colors",
      "chroma.mix",
      "chroma.contrast",
      "chroma(color).hex()",
      "chroma(color).css()",
    ],
    integration_guidance:
      "Start with task-provided colors and the style visual_cues. Keep a shared, deterministic palette and named color tokens. Generate gradients or interpolate colors only when the style permits them; keep limited-palette, monochrome, pixel, and print treatments discrete where required. Evaluate animated color from shared composition time. Check contrast against the actual composited background; a two-color ratio alone does not verify text over transparency, gradients, textures, or video. Pass output through the selected renderer's color API and preserve its color-space handling. Native CSS/SVG colors remain sufficient when no color processing is needed.",
    optional: true,
    docs_url: "https://gka.github.io/chroma.js/",
    style_application:
      "Read palette.tokens, palette.constraints and palette.agent_instruction for International Typographic Style (Swiss Style). Validate approved colors and assess readable existing token pairs with chroma-js. Use palette.gradient only when enabled and appropriate. Preserve task/reference colors exactly; optional suggested tokens are fallback inputs, not permission to recolor assets.",
    production_roles: ["supporting_tool"],
  },
  chartist: {
    name: "Chartist",
    kind: "npm_library",
    package: "chartist",
    runtime: "browser DOM and SVG",
    role: "chart_rendering",
    purpose:
      "Optionally build SVG bar, line, and pie charts when the scene communicates real data or clearly labeled illustrative data.",
    suggested_apis: [
      "BarChart",
      "LineChart",
      "PieChart",
      "chart.on('created', handler)",
      "chart.on('draw', handler)",
      "chart.update",
      "chart.detach",
    ],
    integration_guidance:
      "Bundle Chartist and its required chart CSS locally. Initialize at fixed composition dimensions after fonts and layout are ready, then wait for the created event before capture. Style the generated SVG using the selected palette, typography, stroke weights, and contrast rules. Cache chart geometry and animate SVG transforms, masks, opacity, or stroke reveals from the shared paused, seekable composition timeline. Do not use autonomous SMIL animation, timers, or live resize-driven changes during export. update reconstructs the SVG DOM, so update only at deliberate data changes and rebind animation targets afterward; do not call it every frame. Keep axes, units, and labels truthful and legible; do not invent product metrics. Use native SVG when a chart library is unnecessary.",
    optional: true,
    docs_url: "https://chartist.dev/",
    style_application:
      "Place charts on the typographic grid with aligned axes, restrained accents, and clear data hierarchy.",
    production_roles: ["supporting_tool"],
  },
  remotion_shapes: {
    name: "@remotion/shapes",
    kind: "npm_library",
    package: "@remotion/shapes",
    runtime: "browser / Remotion",
    purpose: "Generate standard SVG geometric shapes such as circles, rectangles, and stars.",
    suggested_apis: ["makeCircle", "makeRect", "makeStar"],
    optional: true,
    docs_url: "https://www.remotion.dev/docs/shapes/",
    production_roles: ["supporting_tool"],
  },
  p5_js: {
    name: "p5.js",
    kind: "npm_library",
    package: "p5",
    runtime: "browser",
    role: "creative_coding_renderer",
    optional: true,
    purpose:
      "Optionally create procedural drawings, generative patterns and animated Canvas or WebGL visual layers.",
    suggested_apis: [
      "instance mode",
      "createCanvas",
      "createGraphics",
      "noLoop",
      "redraw",
      "randomSeed",
      "noiseSeed",
      "noise",
      "beginShape / vertex / endShape",
      "createShader",
      "pixelDensity",
      "remove",
    ],
    integration_guidance:
      "Use browser-mounted instance mode to isolate sketches and avoid global callbacks. Pin a compatible p5 version and check its asset-loading and redraw completion APIs. Disable autonomous playback with noLoop(). Set an explicit requested composition time before each redraw and wait for drawing and asset readiness before capture. Derive state from that time, not millis(), deltaTime, frameCount or draw-call count. Seed noise and random generation, precompute stable per-object parameters, and reset or replay stateful simulations deterministically. Seeding once alone does not guarantee out-of-order frame equivalence. Clear and rebuild frames or use verified caches for accumulated trails. Set pixel density and backing resolution deliberately. Remove the instance and release owned resources on teardown.",
    constraints:
      "p5.js supplies a visual layer, not the video framework, automatic physics, genuine hand-drawn poses or guaranteed export synchronization. Retain HyperFrames as primary and Remotion as conditional fallback. Keep existing palette tokens, approved colors, motion guidance and exposure cadence. Prefer existing suitable Canvas, SVG, PixiJS or Three.js code over an unnecessary additional renderer. Sound-reactive work needs a separate verified audio-analysis route and cached time-indexed analysis; do not assume sound APIs belong to core p5.",
    verification:
      "Compare repeated, backward and out-of-order redraws with sequential frames. Inspect decoded video for aliasing, temporal flicker, output resolution, palette fidelity and media synchronization.",
    docs_url: "https://p5js.org/reference/",
    style_application:
      "Construct grid-aligned circles, rectangles and triangles with beat-aligned transformations; preserve Bauhaus colors and disciplined spacing.",
    production_roles: ["style_renderer"],
  },
  anime_js: {
    name: "Anime.js",
    kind: "npm_library",
    package: "animejs",
    runtime:
      "browser for DOM/SVG; numeric object animation where supported by the selected runtime",
    role: "animation_library",
    optional: true,
    purpose:
      "Optionally animate CSS, DOM attributes, SVG geometry and numeric objects with timelines, easing, staggered sequences, line drawing and motion paths.",
    suggested_apis: [
      "animate",
      "createTimeline({ autoplay: false })",
      "timeline.add",
      "timeline.label",
      "timeline.seek",
      "stagger",
      "svg.createDrawable",
      "svg.createMotionPath",
      "svg.morphTo",
    ],
    integration_guidance:
      "Use documented Anime.js v4 imports and verify the installed version; do not mix legacy anime()/anime.timeline() examples with v4 APIs. Build paused animations with explicit fixed initial and target values. Map shared composition time to the configured Anime.js time unit, which is milliseconds by default. Seek the optional child animation from the framework-controlled time adapter and verify updates reach the renderer before capture. Preserve the registered HyperFrames GSAP master timeline; an Anime.js timeline is not a drop-in substitute for that contract. Prefer GSAP when a verified adapter is unavailable. Use one animation owner per property; do not have GSAP, Motion and Anime.js write the same transform. Load fonts and geometry before constructing animations, precompute random parameters, and perform lifecycle cleanup using the documented API for the installed version.",
    constraints:
      "Anime.js does not generate illustration assets, solve physical simulations or render video itself. SVG morphing, motion paths and line drawing apply to their documented supported geometry; do not treat them as general 3D topology operations. Springs and overshoot are optional authored choices, not automatic smoothness improvements. Live scroll or dragging belongs to interactive delivery; author equivalent time-driven actions for video. Avoid callback-dependent state changes that fail direct or backward seeking. Preserve palette tokens, shared_motion_guidance and intentional stepped cadence. HyperFrames remains primary and Remotion conditional fallback.",
    verification:
      "Verify fixed initial states, exact final copy, geometry integrity, property ownership and time-unit conversion. Compare repeated, backward and out-of-order seeking with sequential playback, then inspect the decoded video for smoothness, readability, palette fidelity and loop continuity.",
    docs_url: "https://animejs.com/documentation/",
    style_application:
      "Sequence grid-aligned geometric elements with staggered timing and disciplined easing.",
    production_roles: ["motion_engine"],
  },
  gsap_drawsvgplugin: {
    name: "GSAP DrawSVGPlugin",
    kind: "npm_plugin",
    package: "gsap",
    runtime: "browser",
    purpose:
      "Control visible stroke length. Import from gsap/DrawSVGPlugin and register the plugin before use.",
    suggested_apis: ["gsap.registerPlugin(DrawSVGPlugin)", "drawSVG", "DrawSVGPlugin.getLength"],
    optional: false,
    docs_url: "https://gsap.com/docs/v3/Plugins/DrawSVGPlugin/",
    style_application:
      "Apply this tool to Art Nouveau according to visual_cues and tech.implementation.",
    production_roles: ["motion_engine"],
  },
  remotion_paths: {
    name: "@remotion/paths",
    kind: "npm_library",
    package: "@remotion/paths",
    runtime: "browser / Remotion",
    purpose:
      "Measure SVG path lengths and points and calculate partial paths for animated stroke reveals.",
    suggested_apis: ["getLength", "getPointAtLength", "evolvePath"],
    optional: true,
    docs_url: "https://www.remotion.dev/docs/paths/",
    production_roles: ["supporting_tool"],
  },
  remotion_renderer: {
    name: "@remotion/renderer",
    kind: "npm_library",
    package: "@remotion/renderer",
    runtime: "Node.js only",
    purpose:
      "Render compositions from Node.js only when the Remotion fallback route is selected. Do not use it as a HyperFrames renderer or browser-side encoder.",
    suggested_apis: ["selectComposition", "renderMedia", "renderStill"],
    optional: true,
    docs_url: "https://www.remotion.dev/docs/renderer",
    priority: "fallback_dependency",
    production_roles: ["render_pipeline"],
  },
  canvas_2d: {
    name: "Canvas 2D",
    kind: "browser_native",
    package: null,
    runtime: "browser",
    purpose: "Draw brushes, textures, bitmaps, and pixel art at deterministic frame times.",
    suggested_apis: [
      "CanvasRenderingContext2D",
      "Path2D",
      "drawImage",
      "getImageData",
      "putImageData",
    ],
    optional: false,
    docs_url: "https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D",
    style_application:
      "Apply this tool to Mid-Century Modern according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  mo_js: {
    name: "mo.js",
    kind: "npm_library",
    package: "@mojs/core",
    runtime: "browser DOM and SVG; initialize after target elements are mounted",
    role: "2d_motion_effects",
    purpose:
      "Optionally generate and animate geometric shapes, radial bursts, swirl accents and existing HTML elements for expressive 2D motion graphics.",
    suggested_apis: [
      "mojs.Shape",
      "mojs.ShapeSwirl",
      "mojs.Burst",
      "mojs.Html",
      "mojs.Timeline",
      "timeline.add(...)",
      "pause()",
      "setProgress(progress)",
      "then(options)",
      "tune(options)",
    ],
    import_guidance:
      "Import mojs from '@mojs/core' using a compatible bundler or the documented browser build. Verify exports and signatures against the installed version. Keep DOM-dependent construction out of server-side rendering.",
    integration_guidance:
      "Use mo.js as an optional effects layer, not a video renderer or replacement for the HyperFrames timeline registration contract. Build effects once, pause independent playback, and evaluate normalized setProgress values from shared seekable composition time. Account explicitly for local start, delay, duration, repeats, yoyo and end visibility using the installed API. Preserve the registered GSAP timeline as the HyperFrames clock and synchronize mo.js through the selected framework update mechanism; verify updates on direct seeks rather than relying only on playback callbacks. For Remotion, use its mounted browser lifecycle and frame-derived time. Assign each animated property one owner; use nested wrappers if GSAP controls scene placement while mo.js controls an inner effect.",
    determinism_guidance:
      "Resolve random particle properties into explicit reproducible values before building the effect. Do not regenerate random values with generate() during export or depend on live click triggers. Keep effect state derivable from requested time. Verify initial visibility, direct, repeated, backward and out-of-order seeks against sequential playback, including delays and end holds. If the chosen mo.js effect cannot be reliably evaluated this way, recreate it with the existing GSAP/SVG route rather than introducing a separate playback clock.",
    color_guidance:
      "Use the resolved palette tokens directly for stroke and fill. Keep limited and monochrome palettes discrete. Animate color interpolation only when the style and palette permit it; do not adopt example-code colors or add arbitrary particle hues. Preserve typography, approved assets and material treatment.",
    selection_guidance:
      "Choose mo.js when its shape, burst or swirl modules simplify a meaningful effect. Existing GSAP or native SVG can remain sufficient. Supported shape-property animation does not establish arbitrary path morphing, fluid physics, handwriting, character rigging, frame-by-frame drawing or automatic music analysis.",
    optional: true,
    docs_url: "https://mojs.github.io/api/",
    package_docs_url: "https://github.com/mojs/mojs",
    burst_docs_url: "https://mojs.github.io/api/modules/burst/",
    style_application:
      "Optional geometric bursts, shape sequences and playful accents that follow the Memphis pattern system. Limit simultaneous effects and preserve headline legibility.",
    production_roles: ["motion_engine"],
  },
  luminance_based_halftone_shading: {
    name: "Luminance-Based Halftone Shading",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: ["ShaderMaterial", "smoothstep", "fwidth", "EffectComposer", "ShaderPass"],
    purpose: "Map darker tonal regions to larger dots on an angled print grid.",
    integration_guidance:
      "Compute luminance in a defined color space, rotate the sampling grid, and derive dot radius from tonal darkness. Antialias dot boundaries and use masks to protect text or emissive screens. Stabilize the grid in an explicitly chosen screen or object coordinate space.",
    constraints:
      "This is a custom shader recipe, not a built-in named Three.js shader. Preserve approved ink and background colors; test aliasing and flicker at delivery resolution. Avoid double gamma correction and verify tone-mapping order.",
    docs_url: "https://threejs.org/docs/pages/ShaderMaterial.html",
    technique_id: "luminance_halftone_shader",
    production_roles: ["style_renderer"],
  },
  webgl: {
    name: "WebGL",
    kind: "browser_native",
    package: null,
    runtime: "browser",
    purpose:
      "Render procedural imagery and postprocessing on the GPU, directly or through Three.js.",
    suggested_apis: ["WebGL2RenderingContext", "framebuffer", "texture", "uniform"],
    optional: false,
    docs_url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API",
    style_application:
      "Apply this tool to Psychedelic Art according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  glsl: {
    name: "GLSL",
    kind: "shader_language",
    package: null,
    runtime: "GPU shader, hosted by browser renderer",
    purpose:
      "Write vertex and fragment shaders with uniforms for time, resolution, color, and textures.",
    suggested_apis: ["smoothstep", "mix", "texture", "vertex shader", "fragment shader"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/ShaderMaterial.html",
    style_application:
      "Apply this tool to Psychedelic Art according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer", "motion_engine"],
  },
  three_js: {
    name: "Three.js",
    kind: "npm_library",
    package: "three",
    runtime: "browser; Node.js only for tooling",
    purpose:
      "Build scenes, cameras, geometry, materials, and lighting. Drive animation from a shared, seekable time source.",
    suggested_apis: ["Scene", "WebGLRenderer", "ShaderMaterial", "Mesh", "PerspectiveCamera"],
    optional: false,
    docs_url: "https://threejs.org/docs/",
    style_application:
      "Apply this tool to Psychedelic Art according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  blender: {
    name: "Blender",
    kind: "desktop_cli_tool",
    package: null,
    runtime: "Blender application / background CLI",
    purpose:
      "Create models, materials, lighting, animation, and offline renders. Script execution can use blender --background --python scene.py.",
    suggested_apis: ["scene", "materials", "animation", "background render"],
    optional: false,
    docs_url: "https://docs.blender.org/manual/en/latest/",
    style_application:
      "Apply this tool to Surrealism according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer", "motion_engine"],
  },
  python_bpy: {
    name: "Python bpy",
    kind: "bundled_module",
    package: null,
    runtime: "Blender bundled Python only",
    purpose:
      "Use Blender's bundled Python API for procedural scene generation and rendering. Run scripts through Blender; a separate pip installation of bpy is not required for this route.",
    suggested_apis: ["bpy.data", "bpy.ops", "bpy.context.scene", "keyframe_insert"],
    optional: false,
    docs_url: "https://docs.blender.org/api/current/",
    style_application:
      "Apply this tool to Surrealism according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer", "motion_engine"],
  },
  cycles: {
    name: "Cycles",
    kind: "bundled_render_engine",
    package: null,
    runtime: "Blender",
    purpose:
      "Select Cycles for path-traced rendering or EEVEE for faster real-time-style rendering. Confirm the engine identifier supported by the installed Blender version.",
    suggested_apis: ["scene.render.engine", "render samples", "transparent film"],
    optional: false,
    docs_url: "https://docs.blender.org/manual/en/latest/render/",
    style_application:
      "Apply this tool to Surrealism according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  python: {
    name: "Python",
    kind: "language_runtime",
    package: null,
    runtime: "Python process, not browser",
    purpose:
      "Preprocess assets, calculate data, and manage frame sequences in a Python process, separate from browser code.",
    suggested_apis: ["pathlib.Path", "json", "subprocess.run"],
    optional: false,
    docs_url: "https://docs.python.org/3/",
    style_application:
      "Apply this tool to Punk Graphics according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  pillow: {
    name: "Pillow",
    kind: "python_library",
    package: "Pillow",
    runtime: "Python process",
    purpose:
      "Crop, resize, composite transparent images, create masks, and generate pixel textures.",
    suggested_apis: [
      "PIL.Image",
      "PIL.ImageDraw",
      "Image.alpha_composite",
      "Image.resize",
      "ImageFilter",
    ],
    optional: false,
    docs_url: "https://pillow.readthedocs.io/en/stable/",
    style_application:
      "Apply this tool to Punk Graphics according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  rough_js: {
    name: "Rough.js",
    kind: "npm_library",
    package: "roughjs",
    runtime: "browser Canvas or SVG; generator geometry can also be prepared in Node.js",
    role: "sketch_rendering",
    purpose:
      "Optionally generate hand-drawn-like geometric contours and patterned or solid fills for styles that explicitly support sketch-like artwork.",
    suggested_apis: [
      "rough.canvas(canvasElement)",
      "rough.svg(svgRoot)",
      "rough.generator()",
      "line",
      "rectangle",
      "circle",
      "ellipse",
      "polygon",
      "curve",
      "path",
      "generator.toPaths(drawable)",
      "roughness",
      "bowing",
      "stroke",
      "strokeWidth",
      "fill",
      "fillStyle",
      "hachureAngle",
      "hachureGap",
      "fillWeight",
      "seed",
    ],
    import_guidance:
      "Use roughjs/bundled/rough.esm.js for browser ESM, roughjs/bundled/rough.cjs.js for Node.js CommonJS, or roughjs/bundled/rough.js for a browser script. Keep DOM, SVG and Canvas operations in the browser; Node.js may prepare generator drawables or path data without DOM access.",
    integration_guidance:
      "Assign each object a stable nonzero integer seed in the documented range and cache generated paths or drawables. Drive transforms, masks, reveals and pose selection from shared seekable composition time using the selected animation owner. Fixed geometry should not be randomly regenerated each frame. For deliberate line boil, prepare and inspect a small set of fixed-seed contour variants and select them deterministically by exposure time. Use approved palette tokens directly for stroke and fill. Rough.js does not provide animation, handwriting, pressure-sensitive brush simulation, paper texture or character poses. Hachure and pattern fills do not establish authentic pencil, ink-wash, halftone or print materials. Animate stroke and fill reveals separately when necessary; generated path order is not an authored drawing sequence.",
    optional: true,
    docs_url: "https://github.com/rough-stuff/rough/wiki",
    selection_guidance:
      "Use only where the style and brief call for sketch-like contours, hachure or doodles. Do not apply roughness to precise grids, clean vectors, product UI, pixel clusters, photorealistic materials or existing assets unless that specific treatment is authorized.",
    style_application:
      "Optional sketch marks, arrows and rough frames within the torn-paper composition; retain actual photocopy and paper textures.",
    production_roles: ["style_renderer"],
  },
  photoswipe: {
    name: "PhotoSwipe",
    kind: "npm_library",
    package: "photoswipe",
    runtime: "browser; initialize only after the gallery DOM is mounted",
    role: "interactive_image_lightbox",
    purpose:
      "Optional image-gallery dialog with swipe navigation, zoom, pan and thumbnail opening or closing transitions for interactive web delivery.",
    suggested_apis: [
      "PhotoSwipeLightbox",
      "gallery",
      "children",
      "pswpModule",
      "lightbox.init()",
      "lightbox.loadAndOpen(index)",
      "lightbox.destroy()",
      "lightbox.pswp.goTo(index)",
      "lightbox.pswp.zoomTo(...)",
      "data-pswp-width",
      "data-pswp-height",
      "data-pswp-srcset",
    ],
    import_guidance:
      "Use PhotoSwipeLightbox from 'photoswipe/lightbox', load 'photoswipe/style.css', and set pswpModule to () => import('photoswipe'). Check exports and API signatures against the installed version.",
    integration_guidance:
      "Use for interactive image viewing only when the task includes a web gallery or lightbox. Define accurate intrinsic image dimensions and responsive sources. Retain direct image links as a fallback, meaningful image alternatives, usable keyboard navigation, focus return and reduced-motion behavior. Initialize after mounting and destroy on cleanup; access the core instance only after opening. Preserve original image colors and established palette tokens when styling controls. PhotoSwipe owns its dialog gestures and transitions; do not attach another animation owner to those properties. Captions require a deliberate custom UI or suitable plugin rather than assuming a built-in caption feature.",
    video_guidance:
      "PhotoSwipe is not a video renderer or a composition-time animation engine. For rendered video, recreate the chosen thumbnail expansion, swipe, zoom, pan and reading holds as authored DOM/SVG/Canvas transforms driven by GSAP and the selected framework clock. Do not depend on live touch input, dynamic dialog state or asynchronous lightbox transitions for exported frames. Preserve HyperFrames as primary and Remotion as the existing conditional fallback.",
    selection_guidance:
      "Designed primarily as an image lightbox dialog, not a general inline carousel. Use native scroll snapping or a suitable carousel library for inline cards, mixed interactive card content or persistent neighboring cards. PhotoSwipe does not generate the artwork or determine its visual style.",
    optional: true,
    docs_url: "https://photoswipe.com/getting-started/",
    methods_docs_url: "https://photoswipe.com/methods/",
    style_application:
      "Open editorial photographs or illustrations from their thumbnails in an optional interactive gallery. Preserve the page reading hierarchy and original image colors.",
    production_roles: ["supporting_tool"],
  },
  cropper_js: {
    name: "Cropper.js",
    kind: "npm_library",
    package: "cropperjs",
    runtime: "browser; initialize after the image and editing container are mounted",
    role: "image_crop_authoring",
    purpose:
      "Optionally author image crop regions and export prepared raster assets for layouts or video compositions. This is an asset-preparation or interactive editing tool, not a style generator or video animation engine.",
    api_version_guidance:
      "The documented 2.x API uses Cropper custom elements and CropperSelection.$toCanvas(). Verify the installed version before implementation; do not mix it with 1.x methods such as getCroppedCanvas().",
    suggested_apis: [
      "new Cropper(imageElement, options)",
      "container",
      "template",
      "cropper.getCropperImage()",
      "cropper.getCropperSelection()",
      "selection.aspectRatio",
      "selection.x",
      "selection.y",
      "selection.width",
      "selection.height",
      "selection.$toCanvas(options)",
    ],
    import_guidance:
      "Import Cropper from 'cropperjs' and follow the installed 2.x documentation for its custom elements. Keep DOM, image loading, selection controls and Canvas export in the browser; initialize client-side rather than during server rendering.",
    integration_guidance:
      "Await image readiness, select the intended aspect ratio and framing, and export the selection through the documented asynchronous Canvas API at appropriate output dimensions. Preserve the original asset and store the crop recipe separately: source identity, intrinsic dimensions, selection rectangle, image transform, editor coordinate system, output dimensions and any required overscan. Selection coordinates are in the editor layout, not automatically original-image pixel coordinates; account for transforms and coordinate mapping before reproducing a crop elsewhere. Confirm image permissions and cross-origin Canvas export availability before relying on export. Avoid unnecessary upscaling, repeated lossy encoding and destructive replacement of the source.",
    color_guidance:
      "Crop and frame only. Preserve the approved palette and original image treatment; do not apply filters, tinting, grading or automatic palette changes. Resampling, Canvas color conversion and encoding can affect pixel values, so do not promise byte-identical colors after export. Inspect representative output colors and prefer non-destructive source-plus-crop rendering when exact source preservation is required.",
    video_guidance:
      "Finish crop authoring before rendering. Load the exported asset or a reproducible source-plus-crop recipe into the composition, then animate framing, masks and pan or zoom with GSAP or the selected framework timeline. Do not drive exported frames from live crop handles or mutable editor state. Keep HyperFrames primary and Remotion under its existing fallback condition.",
    selection_guidance:
      "Use when interactive crop authoring is useful. Native CSS object-fit/object-position, SVG clipping or Canvas source rectangles are sufficient for simple predetermined framing. Cropping does not remove backgrounds, create subject cutouts, separate parallax layers or fill missing artwork. Keep important faces, labels, product features and motion margins inside the intended frame.",
    optional: true,
    docs_url: "https://fengyuanchen.github.io/cropperjs/api/",
    selection_docs_url: "https://fengyuanchen.github.io/cropperjs/api/cropper-selection.html",
    style_application:
      "Prepare photographs and raster illustrations for editorial grid proportions, preserving subject placement, attribution and essential context.",
    production_roles: ["supporting_tool"],
  },
  transparent_png_sequence: {
    name: "Transparent PNG Sequence",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Hand-drawn Illustration according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  remotion_noise: {
    name: "@remotion/noise",
    kind: "npm_library",
    package: "@remotion/noise",
    runtime: "browser / Remotion",
    purpose:
      "Generate reproducible spatial and temporal noise for subtle line variation, grain, and particles.",
    suggested_apis: ["noise2D", "noise3D"],
    optional: true,
    docs_url: "https://www.remotion.dev/docs/noise/",
    production_roles: ["supporting_tool"],
  },
  pixijs: {
    name: "PixiJS",
    package: "pixi.js",
    runtime: "browser",
    role: "2d_rendering",
    purpose:
      "Optional 2D scene renderer for Hand-drawn Illustration using layered artwork, sprites, masks, and explicit frame-time transforms. Preserve original texture, linework, and cadence.",
    suggested_apis: ["Application", "Container", "Sprite", "Graphics", "Assets"],
    integration_guidance:
      "Initialize the renderer and preload assets. Disable autonomous ticker playback for export; derive transforms and effects from composition time before rendering.",
    optional: true,
    docs_url: "https://pixijs.com/8.x/guides/getting-started/quick-start",
    kind: "npm_library",
    production_roles: ["style_renderer"],
  },
  paper_js: {
    name: "Paper.js",
    kind: "npm_library",
    package: "paper",
    runtime:
      "browser Canvas; Node.js geometry or asset preparation only with verified compatible DOM/Canvas dependencies for the required operation",
    role: "vector_geometry_and_canvas_rendering",
    optional: true,
    purpose:
      "Construct and manipulate vector paths, Bezier curves, groups, clipping geometry and boolean shapes; render on Canvas or prepare SVG assets.",
    suggested_apis: [
      "PaperScope",
      "scope.setup(canvas)",
      "Path",
      "Segment",
      "Point",
      "Group",
      "CompoundPath",
      "path.smooth",
      "path.simplify",
      "path.getPointAt",
      "path.getTangentAt",
      "path.getIntersections",
      "path.unite / intersect / subtract / exclude",
      "path.interpolate",
      "project.importSVG",
      "project.exportSVG",
      "view.autoUpdate",
      "view.update",
      "view.pause",
      "project.remove",
    ],
    suggested_methods: [
      {
        name: "Bezier path construction and sampling",
        application:
          "Prepare curved contours and sample positions or tangents along path length for reveals and movement.",
      },
      {
        name: "Path boolean operations",
        application:
          "Combine or cut closed shapes; inspect geometry, holes and edge cases before rendering.",
      },
      {
        name: "Compatible path interpolation",
        application:
          "Morph prepared contours with matching geometry structure; correspondence remains an authoring responsibility.",
      },
      {
        name: "Optional path smoothing and simplification",
        application:
          "Apply only when appropriate; compare against the original contour because these operations alter geometry.",
      },
    ],
    integration_guidance:
      "Prefer ordinary JavaScript with an isolated PaperScope rather than installing constructors onto window or relying on PaperScript compilation. Initialize the scope on an owned Canvas after browser mount. Keep immutable rest geometry and evaluate transforms, segments and handles at requested composition time; do not repeatedly mutate the previous frame. Disable automatic view updates and autonomous onFrame playback for export, then call view.update() after applying each time state. Preload fonts and imported assets, verify SVG import completion and supported features, cache expensive boolean results, and remove temporary items and owned projects on teardown. Use existing GSAP or another verified adapter for shared time without competing property ownership. Set logical Canvas size and output pixel density explicitly.",
    constraints:
      "Paper.js is a 2D vector geometry and rendering library, not a paper material generator, physical fluid solver, 3D engine or video framework. Path interpolation requires compatible segment structures; matching counts alone does not ensure meaningful correspondence. Boolean operations may create compound paths or change topology. SVG import/export requires fidelity checks for unsupported source features, font handling and raster content. Preserve approved palette tokens, source geometry, shared_motion_guidance and intentional exposure cadence; optional smoothing must not erase sketch character. HyperFrames remains primary and Remotion conditional fallback. Prefer existing native SVG, Canvas or another suitable dependency when Paper.js adds no needed geometry capability.",
    verification:
      "Check contour fidelity, winding, holes, intersections, morph intermediate states, SVG round-trip appearance and output scale. Compare repeated, backward and out-of-order frame requests with sequential playback and inspect decoded video for palette fidelity, flicker and line quality.",
    docs_url: "https://paperjs.org/reference/",
    style_application:
      "Construct editable curved strokes and custom brush outlines from authored or cached points; preserve drawing character rather than automatically smoothing every stroke.",
    production_roles: ["style_renderer"],
  },
  tldraw: {
    name: "tldraw",
    package: "tldraw",
    runtime: "mounted React editor in browser; exported assets for video composition",
    role: "diagram_authoring",
    purpose:
      "Optional authoring of diagrams, annotations, and editable graphic assets for Handwritten Annotations. Match the specified visual cues rather than assuming default editor styling; export layers for video animation.",
    suggested_apis: ["Tldraw", "editor"],
    integration_guidance:
      "Use the editor to prepare assets or scene data, then animate exported layers in the selected video framework. It is not a video renderer, 3D engine, or automatic timeline adapter. Verify export APIs against the installed SDK version.",
    optional: true,
    docs_url: "https://tldraw.dev/quick-start",
    kind: "npm_library",
    production_roles: ["style_renderer"],
  },
  cytoscape_js: {
    name: "Cytoscape.js",
    kind: "npm_library",
    package: "cytoscape",
    runtime: "browser for interactive rendering; Node.js or browser for headless graph analysis",
    role: "graph_visualization_and_analysis",
    optional: true,
    purpose:
      "Model node-edge relationships, compute graph layouts and analysis, and optionally render interactive networks or supply diagram geometry to another renderer.",
    suggested_apis: [
      "cytoscape({ container, elements, style, layout })",
      "cytoscape({ headless: true, elements })",
      "cy.layout(options).run()",
      'layout.promiseOn("layoutstop")',
      "cy.nodes().positions()",
      "cy.elements().bfs()",
      "cy.elements().dfs()",
      "cy.elements().dijkstra()",
      "cy.elements().degreeCentrality()",
      "cy.elements().betweennessCentrality()",
      "cy.batch()",
      "cy.on()",
      "cy.png()",
      "cy.destroy()",
    ],
    suggested_layouts: [
      {
        name: "preset",
        application: "Reuse cached or explicitly authored node positions; preferred export route.",
      },
      {
        name: "breadthfirst",
        application:
          "Show appropriate hierarchical or traversal structure; configure roots and direction explicitly.",
      },
      {
        name: "grid / circle / concentric",
        application: "Use orderly schematic arrangements when they support the explanation.",
      },
      {
        name: "cose",
        application:
          "Optionally prepare a force-directed arrangement; await completion and cache positions, not a live export simulation.",
      },
    ],
    suggested_algorithms: [
      {
        name: "Breadth-first or depth-first traversal",
        application: "Explain reachability and visit order with explicit roots and directedness.",
      },
      {
        name: "Dijkstra shortest paths",
        application:
          "Explain routes or dependencies only with meaningful positive edge costs and verified connectivity; handle unreachable nodes explicitly.",
      },
      {
        name: "Degree or betweenness centrality",
        application:
          "Explain connection counts or bridging roles using documented metric options; centrality does not by itself establish importance or causation.",
      },
    ],
    integration_guidance:
      "Observe and validate graph input before processing: stable unique node/edge IDs, existing source/target IDs, directedness, weights and optional compound parents. Choose analysis and layout to fit the question. Register completion handling before running asynchronous layouts; a layoutstop event can also indicate cancellation, so confirm the intended layout completed. Cache validated node positions and use preset with explicit viewport settings for export. Precompute paths and metrics. Evaluate positions, visibility, emphasis, pan and zoom from shared composition time; do not rerun stochastic layouts or autonomous Cytoscape animations for each frame. Either use the browser renderer with verified frame readiness or pass graph data and cached geometry to SVG/Canvas/PixiJS for custom style treatment. Load fonts and assets first, initialize browser containers after mount, and dispose graph instances and listeners on teardown.",
    constraints:
      "Cytoscape.js is a graph library, not a general chart library, knowledge extractor, 3D engine or video framework. Core PNG/JPG export requires a rendered instance, not a headless one; do not assume SVG export is built in. Extensions such as additional layouts require separate installation and compatibility checks. Headless layouts may need explicit bounds or styling for dimension-sensitive placement. Preserve approved palette tokens and label semantics rather than applying default graph colors. Keep HyperFrames primary and Remotion conditional fallback; shared_motion_guidance governs animated diagram changes. Provide keyboard-accessible controls and a text/table representation where interactive graph meaning would otherwise be inaccessible.",
    verification:
      "Check topology, source/target direction, weights, computed paths and metric interpretation against known input examples. Inspect label overlap, arrows, reading size, graph bounds and palette fidelity. Compare repeated and out-of-order frame requests with sequential video playback; verify renderer readiness and decoded export.",
    docs_url: "https://js.cytoscape.org/",
    style_application:
      "Compute relationship diagram structure and positions, then render authored SVG or Canvas strokes in explanatory drawing order; retain whiteboard typography and stroke treatment.",
    production_roles: ["style_renderer"],
  },
  geometry_outlines_and_crease_edges: {
    name: "Geometry Outlines and Crease Edges",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: ["OutlineEffect", "EdgesGeometry", "LineSegments2", "LineMaterial"],
    purpose:
      "Combine silhouette outlines and geometry crease lines for illustrated 3D or line-art treatments.",
    integration_guidance:
      "Choose silhouette outlining, crease edges, or both according to the visual direction. Set edge thresholds and output-relative line widths. Keep LineMaterial resolution synchronized with the render viewport and verify occlusion.",
    constraints:
      "EdgesGeometry alone does not produce all view-dependent silhouettes. These geometry methods are separate from screen-space edge detection; do not label them as a Sobel filter. Do not replace authored 2D strokes unnecessarily.",
    docs_url: "https://threejs.org/docs/pages/EdgesGeometry.html",
    technique_id: "geometry_outline_rendering",
    production_roles: ["style_renderer"],
  },
  tonal_hatching_and_crosshatching: {
    name: "Tonal Hatching and Crosshatching",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: ["ShaderMaterial", "smoothstep", "EffectComposer", "ShaderPass"],
    purpose:
      "Reveal diagonal hatching and additional crossing strokes in progressively darker regions.",
    integration_guidance:
      "Use controlled luminance thresholds to blend paper, ink and hatch layers. Anchor hatch coordinates consistently, antialias fine strokes, and combine with geometry outlines only where useful.",
    constraints:
      "Hatching is not automatic edge detection or hand-drawn line boil. Retain existing ink/paper palette tokens and protect text and screen content with explicit masks. Verify line density at output size.",
    docs_url: "https://threejs.org/docs/pages/ShaderMaterial.html",
    technique_id: "tonal_crosshatching_shader",
    production_roles: ["style_renderer"],
  },
  delaunator: {
    name: "Delaunator",
    kind: "npm_library",
    package: "delaunator",
    runtime: "JavaScript in browser or Node.js; DOM-independent geometry computation",
    role: "2d_delaunay_triangulation",
    purpose:
      "Optionally compute Delaunay triangle connectivity, neighboring half-edges and the convex hull of 2D points for mesh-based artwork or spatial visualization. Rendering and motion are supplied separately.",
    suggested_apis: [
      "new Delaunator(coords)",
      "Delaunator.from(points)",
      "delaunay.triangles",
      "delaunay.halfedges",
      "delaunay.hull",
      "delaunay.coords",
      "delaunay.update()",
    ],
    import_guidance:
      "Import Delaunator from 'delaunator' as an ES module. Supply flat coordinates [x0, y0, x1, y1, ...] to the constructor, preferably a suitable typed array, or point pairs to Delaunator.from(). Verify the installed version and data structures before implementation.",
    integration_guidance:
      "Read triangle vertex indices in groups of three and use the original point coordinates to build SVG polygons, Canvas paths, PixiJS geometry or an appropriate Three.js BufferGeometry. Keep DOM and renderer operations in the browser; Node.js can prepare or cache geometry. Assign palette colors through stable point or face identities, not transient triangle-array positions when retriangulating. Preserve the selected renderer coordinate system, winding, normals and material handling.",
    animation_guidance:
      "Derive point positions from shared seekable composition time, with deterministic initial coordinates and no unseeded randomness. For stable deformation, triangulate once and keep indices fixed, while checking for inverted or degenerate faces. For deliberate dynamic triangulation, update coordinates and recompute at the evaluated time, accepting that edges and face identities may switch. Design or cache those changes; do not assume update() preserves connectivity. Verify repeated, backward and out-of-order seeks, boundaries, color continuity and triangle quality. Keep HyperFrames primary and Remotion under its existing fallback condition.",
    input_guidance:
      "Use finite 2D coordinates and inspect duplicate, collinear or nearly coincident inputs. Delaunator.from() skips duplicate points; retain an explicit mapping when input identity matters. Do not assume every input creates a useful triangle. Geographic inputs need a suitable projection or a spherical triangulation tool rather than treating longitude and latitude as a universally valid planar distance system.",
    limitations:
      "This is unconstrained 2D point triangulation, not arbitrary 3D surface meshing, polygon-with-holes triangulation, subject segmentation, a renderer or a physics solver. The triangulation covers the convex hull and may bridge concave boundaries or holes. Use an appropriate boundary-aware triangulator, clipping strategy or separate domains when needed. For Voronoi cells, search or higher-level traversal, consider the documented d3-delaunay wrapper. Scientific interpolation and semantic network interpretation are separate tasks.",
    color_guidance:
      "Use the approved palette and stable color-role mappings. Triangulation does not authorize recoloring source images, adding random face colors or interpolating discrete scientific categories. Preserve material appearance and limited-color constraints.",
    optional: true,
    docs_url: "https://github.com/mapbox/delaunator",
    data_structure_docs_url: "https://mapbox.github.io/delaunator/",
    style_application:
      "Optionally triangulate designed 2D point layouts into coherent triangular illustration fields. Keep the shared angles, proportions and palette; mask or separately triangulate boundaries when the subject requires an exact outline.",
    production_roles: ["supporting_tool"],
  },
  layered_illustration_png_assets: {
    name: "Layered Illustration PNG Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Storybook Illustration according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  layered_png_assets: {
    name: "Layered PNG Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Comic Book Art according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  krita: {
    name: "Krita",
    kind: "desktop_tool",
    package: null,
    runtime: "Krita application",
    purpose: "Draw animation frames and export numbered PNG sequences for composition.",
    suggested_apis: ["animation timeline", "onion skin", "PNG sequence export"],
    optional: false,
    docs_url: "https://docs.krita.org/en/user_manual/animation.html",
    style_application: "Apply this tool to Anime according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  transparent_png_frame_sequence: {
    name: "Transparent PNG Frame Sequence",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application: "Apply this tool to Anime according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  eevee_cycles: {
    name: "EEVEE/Cycles",
    kind: "bundled_render_engine",
    package: null,
    runtime: "Blender",
    purpose:
      "Select Cycles for path-traced rendering or EEVEE for faster real-time-style rendering. Confirm the engine identifier supported by the installed Blender version.",
    suggested_apis: ["scene.render.engine", "render samples", "transparent film"],
    optional: false,
    docs_url: "https://docs.blender.org/manual/en/latest/render/",
    style_application:
      "Apply this tool to Painterly 3D according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  layered_painting_assets: {
    name: "Layered Painting Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Post-Impressionist Painting according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  calligraphy_assets: {
    name: "Calligraphy Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Chinese Calligraphy according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  sharp: {
    name: "Sharp",
    kind: "npm_library",
    package: "sharp",
    runtime: "Node.js only, never browser",
    purpose:
      "Preprocess high-resolution collage assets, crop, resize, and composite masks in Node.js. This is a Node.js alternative to Pillow, not a browser library.",
    suggested_apis: ["sharp(input).resize()", "extract", "composite", "png"],
    optional: true,
    docs_url: "https://sharp.pixelplumbing.com/",
    production_roles: ["supporting_tool"],
  },
  transparent_hand_drawn_assets: {
    name: "Transparent Hand-Drawn Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Hand-drawn Collage according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  procedural_paper_curl_and_fold_deformation: {
    name: "Procedural Paper Curl and Fold Deformation",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: [
      "PlaneGeometry",
      "BufferGeometry.attributes.position",
      "BufferAttribute.needsUpdate",
      "BufferGeometry.computeVertexNormals",
      "CanvasTexture",
    ],
    purpose:
      "Create curling corners and flexible paper-like surfaces by deforming a subdivided plane.",
    integration_guidance:
      "Preserve immutable rest vertices and derive each deformed position from rest coordinates and authored bend progress at composition time. Recompute normals after CPU deformation. Use seeded or cached Canvas textures for restrained paper grain.",
    constraints:
      "A procedural bend is an artistic deformation, not a physical paper solver or XPBD. Use a 3D renderer only if depth or curling is required; keep flat SVG/Canvas cutouts for flat scenes. Preserve deliberate stepped timing and paper colors.",
    docs_url: "https://threejs.org/docs/pages/BufferGeometry.html",
    technique_id: "procedural_paper_curl",
    production_roles: ["motion_engine"],
  },
  extended_position_based_dynamics_xpbd: {
    name: "Extended Position-Based Dynamics (XPBD)",
    kind: "simulation_algorithm",
    package: null,
    runtime:
      "Depends on the selected solver implementation: JavaScript, WebAssembly, native offline code or a supported GPU backend",
    role: "constraint_based_physics_simulation",
    purpose:
      "Optionally simulate compliant constrained motion for cloth, elastic deformable bodies and suitable physical interactions. XPBD is an algorithm, not a visual style, renderer, animation framework or package name.",
    suggested_apis: [],
    implementation_selection:
      "Prefer an existing maintained solver that explicitly supports XPBD and the required constraint and collision models. Verify its actual API, licensing, runtime and determinism before use. Do not assume that a generic physics package implements XPBD, or invent a universal XPBD API. The reference examples are educational starting points, not a production dependency recommendation.",
    constraint_options: [
      "Distance or stretch constraints for connections and cloth structure",
      "Bending constraints for cloth or deliberately modeled paper folds",
      "Volume or constitutive strain constraints for the chosen elastic-body model",
      "Attachment or prescribed-position constraints for anchors and authored controls",
      "Contact and self-collision handling appropriate to the model and solver",
    ],
    parameter_guidance:
      "Specify units, masses, rest geometry, compliance, damping formulation, fixed simulation step, substep count, solver iterations and collision parameters. XPBD uses compliance scaled by the square of the solve time step and accumulated constraint multipliers within the solve. Follow the selected implementation for multiplier initialization and damping. Improved stiffness control does not remove finite-iteration error or guarantee accuracy, stability, collision robustness or cross-backend reproducibility.",
    integration_guidance:
      "Keep simulation and rendering separate. Advance from a known initial state with fixed simulation steps and a defined deterministic constraint order where supported. For video, bake geometry or positions and any needed normals, or use checkpoints with deterministic replay. Resolve each composition timestamp from the cache or replay; never advance mutable physics once per render callback or use wall-clock delta. Test repeated, out-of-order and backward frame requests for identical states. Let Three.js render the evaluated state, and GSAP or the selected timeline control authored scene events without competing with solver-owned positions. Use HyperFrames as primary composition framework and Remotion only under its existing fallback condition. Preserve approved materials and palette tokens.",
    limitations:
      "Basic elastic-body XPBD does not automatically provide fluid merging, splitting, viscosity, plasticity, tearing, rigid-body contact or origami crease behavior. Such effects require appropriate additional formulations, topology handling and validation. Use authored motion instead when physical simulation adds no value.",
    optional: true,
    docs_url: "https://mmacklin.com/xpbd.pdf",
    reference_examples_url: "https://matthias-research.github.io/pages/tenMinutePhysics/",
    style_application:
      "Conditional use for physically constrained paper folding: define crease targets, near-inextensible stretch, bending, thickness-aware collision and self-collision as required. Author the fold sequence and validate sheet continuity. A generic soft-body mesh or freely bending cloth is not an origami model.",
    production_roles: ["motion_engine"],
  },
  aseprite: {
    name: "Aseprite",
    kind: "desktop_cli_tool",
    package: null,
    runtime: "Aseprite application / CLI",
    purpose:
      "Create pixel-art sprites, palettes, and frame animation; export sprite sheets or numbered PNGs.",
    suggested_apis: ["--batch", "--sheet", "--data", "palette", "tags"],
    optional: false,
    docs_url: "https://www.aseprite.org/docs/",
    style_application:
      "Apply this tool to Pixel Art according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  instancedmesh: {
    name: "InstancedMesh",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose: "Render many repeated cubes or objects efficiently.",
    suggested_apis: ["three.InstancedMesh"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/InstancedMesh.html",
    style_application:
      "Apply this tool to Voxel Art according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  eevee: {
    name: "EEVEE",
    kind: "bundled_render_engine",
    package: null,
    runtime: "Blender",
    purpose:
      "Select Cycles for path-traced rendering or EEVEE for faster real-time-style rendering. Confirm the engine identifier supported by the installed Blender version.",
    suggested_apis: ["scene.render.engine", "render samples", "transparent film"],
    optional: false,
    docs_url: "https://docs.blender.org/manual/en/latest/render/",
    style_application:
      "Apply this tool to Low-Poly 3D according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  meshtoonmaterial: {
    name: "MeshToonMaterial",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose: "Use gradientMap to create discrete cartoon shading bands.",
    suggested_apis: ["three.MeshToonMaterial"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/MeshToonMaterial.html",
    style_application:
      "Apply this tool to Cel-Shaded 3D according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  gltf_scene_assembly_and_part_animation: {
    name: "glTF Scene Assembly and Part Animation",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: [
      "GLTFLoader.loadAsync",
      "Object3D.traverse",
      "Object3D.position / quaternion / scale",
      "GLTFLoader.setMeshoptDecoder",
    ],
    purpose:
      "Assemble a miniature scene from reusable glTF assets and animate separately addressable model parts.",
    integration_guidance:
      "Inspect node names, materials, dimensions, pivots and embedded animations after loading. Store original transforms and evaluate part motion from fixed key states at requested composition time. Preload every asset and dispose owned GPU resources after use.",
    constraints:
      "Use authorized assets; an exporter string does not establish authorship or license. Do not assume animation clips exist from a filename. Add a compatible Meshopt decoder only when the asset requires it; loader support is not proof an asset is compressed.",
    docs_url: "https://threejs.org/docs/pages/GLTFLoader.html",
    technique_id: "gltf_scene_assembly",
    production_roles: ["motion_engine"],
  },
  quantized_toon_shading: {
    name: "Quantized Toon Shading",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: [
      "MeshToonMaterial",
      "DataTexture",
      "gradientMap",
      "NearestFilter",
      "NoColorSpace",
    ],
    purpose: "Use a discrete lighting ramp to create crisp cel-shaded volume.",
    integration_guidance:
      "Build a small non-color lighting ramp and assign it as gradientMap with nearest minification and magnification filtering. Tune lighting bands and silhouettes against the approved material colors.",
    constraints:
      "Lighting ramp samples are shading data, not replacement palette colors. Do not copy example ramp values or recolor source textures automatically.",
    docs_url: "https://threejs.org/docs/pages/MeshToonMaterial.html",
    technique_id: "toon_ramp_shading",
    production_roles: ["style_renderer"],
  },
  raycast_object_interaction_and_camera_navigation: {
    name: "Raycast Object Interaction and Camera Navigation",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: [
      "Raycaster.setFromCamera",
      "Raycaster.intersectObjects",
      "OrbitControls",
      "enableDamping",
    ],
    purpose:
      "Select scene objects with pointer raycasting and navigate an interactive miniature scene.",
    integration_guidance:
      "Normalize pointer coordinates against the actual canvas bounds. Use explicit interactive hit targets and appropriate camera limits. For video, replace live pointer input with authored interaction cues and a deterministic camera path following shared_motion_guidance.",
    constraints:
      "Hover and OrbitControls damping belong to interactive delivery unless baked or replayed deterministically. Disable autonomous control updates during export; do not require a viewer to interact with a rendered video.",
    docs_url: "https://threejs.org/docs/pages/Raycaster.html",
    technique_id: "raycast_object_interaction",
    production_roles: ["motion_engine"],
  },
  buffergeometry: {
    name: "BufferGeometry",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose: "Define point, line, and mesh vertex attributes in buffers.",
    suggested_apis: ["three.BufferGeometry"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/BufferGeometry.html",
    style_application:
      "Apply this tool to Particle Art according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  points: {
    name: "Points",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose: "Render a particle cloud with PointsMaterial or ShaderMaterial.",
    suggested_apis: ["three.Points"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/Points.html",
    style_application:
      "Apply this tool to Particle Art according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  web_audio_api: {
    name: "Web Audio API",
    kind: "browser_native",
    package: null,
    runtime: "browser",
    purpose:
      "Inspect waveforms and spectra in browser previews. Prefer precomputed audio data for deterministic offline renders.",
    suggested_apis: ["AudioContext", "AnalyserNode", "decodeAudioData"],
    optional: false,
    docs_url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API",
    style_application:
      "Apply this tool to Oscilloscope Graphics according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  video_textured_screens_and_crt_overlays: {
    name: "Video-Textured Screens and CRT Overlays",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: [
      "VideoTexture",
      "CanvasTexture",
      "HTMLVideoElement.currentTime",
      "SRGBColorSpace",
    ],
    purpose:
      "Place video on a model screen and add restrained scanlines or analog display texture.",
    integration_guidance:
      "Align video texture UVs to the screen, preload media and synchronize it with composition time. For direct video seeking, wait until the requested frame is decoded before rendering, or use a verified framework media adapter or predecoded frame sequence. Keep overlays on the screen surface and evaluate noise deterministically.",
    constraints:
      "VideoTexture alone does not guarantee exact export synchronization. Do not add analog distortion to modern screens unless requested. Preserve readability, authorized footage and approved colors; avoid random-per-frame grain and autoplay-dependent capture.",
    docs_url: "https://threejs.org/docs/pages/VideoTexture.html",
    technique_id: "crt_video_surface",
    production_roles: ["style_renderer"],
  },
  scrambled_text_reveal: {
    name: "Scrambled Text Reveal",
    kind: "rendering_technique",
    package: "gsap",
    runtime: "browser",
    optional: true,
    suggested_apis: [
      "gsap.registerPlugin",
      "ScrambleTextPlugin",
      "gsap.timeline({ paused: true })",
      "scrambleText",
    ],
    purpose: "Reveal short titles through a controlled scrambled-character transition.",
    integration_guidance:
      "Register ScrambleTextPlugin explicitly and animate short text in a paused timeline. Preserve the exact final copy, allow a readable final hold, and test the plugin at repeated, backward and out-of-order times. If results are unstable, cache a seeded character sequence evaluated from composition time.",
    constraints:
      "This is GSAP ScrambleTextPlugin, not Motion.dev. Use only when the topic and typography support it; keep essential information readable and preserve accessible final text. Never rely on an independent running timeline during export.",
    docs_url: "https://gsap.com/docs/v3/Plugins/ScrambleTextPlugin/",
    technique_id: "scrambled_text_reveal",
    production_roles: ["motion_engine"],
  },
  meshphysicalmaterial: {
    name: "MeshPhysicalMaterial",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose:
      "Use transmission, ior, roughness, and related parameters for glass and physical surface reflections.",
    suggested_apis: ["three.MeshPhysicalMaterial"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/MeshPhysicalMaterial.html",
    style_application:
      "Apply this tool to Liquid Glass according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  offscreen_rendering: {
    name: "Offscreen Rendering",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose:
      "Render the background into a texture for material or shader sampling. Avoid sampling the active render target in a feedback loop.",
    suggested_apis: ["WebGLRenderTarget", "renderer.setRenderTarget"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/WebGLRenderTarget.html",
    style_application:
      "Apply this tool to Liquid Glass according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  pbr_materials: {
    name: "PBR Materials",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose: "Use physical materials and environment maps for metal, plastic, or glass.",
    suggested_apis: ["MeshStandardMaterial", "MeshPhysicalMaterial", "PMREMGenerator"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/MeshStandardMaterial.html",
    style_application:
      "Apply this tool to Cyberpunk according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  postprocessing: {
    name: "Postprocessing",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose: "Chain Three.js addon passes for bloom, tone mapping, and custom postprocessing.",
    suggested_apis: [
      "three/addons/postprocessing/EffectComposer.js",
      "RenderPass",
      "ShaderPass",
      "OutputPass",
    ],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/EffectComposer.html",
    style_application:
      "Apply this tool to Cyberpunk according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  layered_image_assets: {
    name: "Layered Image Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Vaporwave according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  orthographiccamera: {
    name: "OrthographicCamera",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose:
      "Use parallel projection at an isometric orientation so object size does not decrease with distance.",
    suggested_apis: ["three.OrthographicCamera"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/OrthographicCamera.html",
    style_application:
      "Apply this tool to Isometric Illustration according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
  soft_surface_lighting_and_material_detail: {
    name: "Soft Surface Lighting and Material Detail",
    kind: "rendering_technique",
    package: "three",
    runtime: "browser",
    optional: true,
    suggested_apis: [
      "MeshStandardMaterial",
      "MeshPhysicalMaterial",
      "normalMap",
      "roughnessMap",
      "PCFSoftShadowMap",
      "ACESFilmicToneMapping",
    ],
    purpose:
      "Create tactile miniature objects using restrained roughness, normal detail and soft lighting.",
    integration_guidance:
      "Use consistent scene scale, approved base colors, soft key/fill lighting and contact shadows. Apply subtle normal or roughness detail and configure renderer output color space and tone mapping explicitly.",
    constraints:
      "Normal and roughness maps are non-color data. Tone mapping changes displayed values, so compare rendered appearance with approved palette targets; do not rewrite palette tokens. Soft shadows alone do not establish photorealism.",
    docs_url: "https://threejs.org/docs/pages/MeshStandardMaterial.html",
    technique_id: "soft_surface_lighting",
    production_roles: ["style_renderer"],
  },
  drawn_frame_sequence: {
    name: "Drawn Frame Sequence",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Frame-by-Frame Animation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  layered_drawn_frame_sequence: {
    name: "Layered Drawn Frame Sequence",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Traditional Cel Animation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  drawing_asset_sequence: {
    name: "Drawing Asset Sequence",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Hand-Drawn Stop-Motion Style according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  photographed_stop_motion_frames: {
    name: "Photographed Stop-Motion Frames",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Stop-Motion Animation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  ffmpeg: {
    name: "FFmpeg",
    kind: "cli_tool",
    package: null,
    runtime: "native CLI process",
    purpose:
      "Encode image sequences, combine audio, and produce delivery files at the intended frame rate. This is a separate native CLI tool.",
    suggested_apis: ["-framerate", "-i", "-c:v libx264", "-pix_fmt yuv420p", "-filter_complex"],
    optional: false,
    docs_url: "https://ffmpeg.org/documentation.html",
    style_application:
      "Apply this tool to Stop-Motion Animation according to visual_cues and tech.implementation.",
    production_roles: ["render_pipeline"],
  },
  photographed_clay_animation_frames: {
    name: "Photographed Clay Animation Frames",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Claymation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  photographed_puppet_animation_frames: {
    name: "Photographed Puppet Animation Frames",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Puppet Animation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  photographed_object_animation_frames: {
    name: "Photographed Object Animation Frames",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Object Animation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  photographed_pixilation_frames: {
    name: "Photographed Pixilation Frames",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Pixilation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  live_action_reference: {
    name: "Live-Action Reference",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Rotoscoping according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  transparent_drawn_frame_sequence: {
    name: "Transparent Drawn Frame Sequence",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Rotoscoping according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  layered_character_assets: {
    name: "Layered Character Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to 2D Rigged Animation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  react: {
    name: "React",
    kind: "npm_library",
    package: "react",
    runtime: "browser; SSR requires avoiding browser-only APIs during render",
    purpose:
      "Organize interface elements, SVG artwork, captions, and charts as components. In the Remotion fallback route, drive animation from Remotion frame time.",
    suggested_apis: ["components", "props", "useMemo", "useEffect"],
    optional: false,
    docs_url: "https://react.dev/reference/react",
    style_application:
      "Apply this tool to UI Animation / Product Motion Design according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  dragula: {
    name: "Dragula",
    kind: "npm_library",
    package: "dragula",
    runtime: "browser; initialize after DOM mount",
    role: "drag_and_drop_interaction",
    optional: true,
    purpose:
      "Reorder DOM items or move/copy them between configured containers in interactive delivery or an accompanying editor.",
    suggested_apis: [
      "dragula(containers, options)",
      "moves",
      "accepts",
      "copy",
      "direction",
      "revertOnSpill",
      'drake.on("drag", handler)',
      'drake.on("drop", handler)',
      'drake.on("cancel", handler)',
      "drake.destroy()",
    ],
    integration_guidance:
      "Include the required Dragula CSS. Use explicit containers, drag handles and acceptance rules. Persist stable item IDs and final ordering in application state on drop, and reconcile DOM mutations with the framework without competing ownership. Initialize after mount and destroy on teardown. Provide keyboard or button-based alternatives and meaningful status announcements; pointer/touch support alone does not establish keyboard accessibility. Use an existing suitable animation dependency for optional settling, with one owner per property.",
    constraints:
      "Dragula manages DOM drag/drop interaction and drop feedback, not general animation, physics, 3D picking or freeform canvas positioning. Verify package/version compatibility and maintenance suitability before installation. For video, author cursor paths, lifted cards, placeholders, reordering and settling from seekable composition time instead of running live Dragula input. Preserve HyperFrames as primary, Remotion as conditional fallback, approved palettes and shared_motion_guidance.",
    verification:
      "For interactive delivery, verify reorder, container transfer, allowed/rejected drops, cancellation, touch, state persistence, keyboard alternatives and cleanup. For video, compare repeated and out-of-order seeking and inspect decoded motion.",
    docs_url: "https://github.com/bevacqua/dragula#readme",
    style_application:
      "Interactive card, list or Kanban reordering and transfer between containers.",
    production_roles: ["supporting_tool"],
  },
  leaflet: {
    name: "Leaflet",
    kind: "npm_library",
    package: "leaflet",
    runtime: "browser; initialize after DOM mount in a container with explicit dimensions",
    role: "geographic_mapping",
    optional: true,
    purpose:
      "Build interactive 2D geographic maps with tile layers, markers, geographic vector overlays and GeoJSON, or supply a verified map layer for a video scene.",
    suggested_apis: [
      "Map / map construction for installed version",
      "TileLayer / tileLayer construction for installed version",
      "GeoJSON / geoJSON construction for installed version",
      "Marker and DivIcon",
      "Polyline and Polygon",
      "map.setView",
      "map.fitBounds",
      "map.project / unproject",
      "map.latLngToContainerPoint",
      "map.invalidateSize",
      "layer load / tileerror events",
      "map.remove",
    ],
    integration_guidance:
      "Pin the installed Leaflet version and consult its matching documentation; do not mix namespace-based 1.x examples with 2.x module imports. Include required Leaflet CSS and marker assets, initialize after mount, size the container explicitly and invalidateSize after layout changes. Validate real geographic coordinates and projections: Leaflet LatLng uses latitude/longitude while GeoJSON coordinate arrays use longitude/latitude. Use approved tile or geographic data providers with appropriate attribution and authorized export usage. Select basemap artwork compatible with the existing palette rather than applying color filters to approved imagery. For video, preload or locally prepare authorized map assets, disable autonomous map animations, and evaluate viewport, marker positions, path progress and highlights from composition time. Wait for required layers and tiles to finish loading and handle errors before capture; prefer fixed map images or custom SVG/Canvas geography if arbitrary-time map seeking cannot be verified. Dispose the map and owned listeners after use.",
    constraints:
      "Leaflet is a 2D map library, not a tile-data provider, geocoder, routing engine, GIS analysis suite, 3D globe or video renderer. Marker clustering, vector-tile handling and other advanced features may require separate verified plugins. A drawn path is not proof of a computed real-world route. Leaflet core does not provide a universal map-to-image/video export API; renderer choice, external images, CORS and provider terms affect capture. Do not bulk prefetch public tiles without provider authorization. Preserve attribution, approved palette tokens and exact geographic meaning. A live flyTo transition is not inherently seekable for video. Retain HyperFrames primary, Remotion conditional fallback and shared_motion_guidance; provide accessible text or tabular location context for interactive delivery.",
    verification:
      "Check coordinates, projection, bounds, route semantics, legends and required attribution. Verify loaded tiles and images, missing-asset handling, marker alignment, labels and output dimensions. Compare repeated and out-of-order time requests with sequential playback and inspect the decoded video for stable map rendering and readable geographic context.",
    docs_url: "https://leafletjs.com/reference-versions.html",
    style_application:
      "Use for an actual map-based product interface, preserving its documented locations, controls and interactions.",
    production_roles: ["style_renderer"],
  },
  manim: {
    name: "Manim",
    kind: "python_library",
    package: "manim",
    runtime: "Python process; system requirements depend on scene",
    purpose:
      "Animate mathematical objects, labels, and cameras for scientific explanations. Check the official installation requirements for scene-specific dependencies such as LaTeX.",
    suggested_apis: ["Scene", "Create", "Transform", "MathTex", "Axes"],
    optional: false,
    docs_url: "https://docs.manim.community/en/stable/",
    style_application:
      "Apply this tool to Scientific Visualization / Data Storytelling according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer", "motion_engine"],
  },
  numpy: {
    name: "NumPy",
    kind: "python_library",
    package: "numpy",
    runtime: "Python process",
    purpose: "Calculate geometry, colors, particles, and audio-analysis arrays.",
    suggested_apis: ["numpy.asarray", "numpy.linspace", "numpy.clip", "numpy.random.default_rng"],
    optional: false,
    docs_url: "https://numpy.org/doc/stable/",
    style_application:
      "Apply this tool to Scientific Visualization / Data Storytelling according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  d3: {
    name: "D3",
    kind: "npm_library",
    package: "d3",
    runtime: "browser; data computation also possible in Node.js",
    purpose:
      "Calculate data scales, layouts, and SVG paths. Drive animation with the selected framework's shared time source.",
    suggested_apis: ["scaleLinear", "scaleBand", "line", "arc", "pie"],
    optional: true,
    docs_url: "https://d3js.org/",
    production_roles: ["style_renderer"],
  },
  layered_high_resolution_assets: {
    name: "Layered High-Resolution Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to Infinite Zoom according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  gsap_morphsvgplugin: {
    name: "GSAP MorphSVGPlugin",
    kind: "npm_plugin",
    package: "gsap",
    runtime: "browser",
    purpose:
      "Interpolate SVG paths. Import from gsap/MorphSVGPlugin and register the plugin before use.",
    suggested_apis: [
      "gsap.registerPlugin(MorphSVGPlugin)",
      "morphSVG",
      "MorphSVGPlugin.convertToPath",
    ],
    optional: false,
    docs_url: "https://gsap.com/docs/v3/Plugins/MorphSVGPlugin/",
    style_application:
      "Apply this tool to Shape Morphing according to visual_cues and tech.implementation.",
    production_roles: ["motion_engine"],
  },
  layered_png_svg_assets: {
    name: "Layered PNG/SVG Assets",
    kind: "input_asset",
    package: null,
    runtime: "asset preparation / composition",
    purpose:
      "Supply prepared layers or numbered frames. Preserve transparency, consistent dimensions, and clear naming; inspect assets before composition.",
    suggested_apis: ["alpha channel", "numbered frame sequence", "layer manifest"],
    optional: false,
    docs_url: null,
    style_application:
      "Apply this tool to 2.5D Parallax Animation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  librosa: {
    name: "librosa",
    kind: "python_library",
    package: "librosa",
    runtime: "Python process",
    purpose:
      "Precompute beats, onsets, and energy. Save timestamps as JSON for the animation timeline.",
    suggested_apis: [
      "librosa.load",
      "librosa.beat.beat_track",
      "librosa.onset.onset_detect",
      "librosa.feature.rms",
    ],
    optional: false,
    docs_url: "https://librosa.org/doc/latest/",
    style_application:
      "Apply this tool to Music-Synchronized Animation according to visual_cues and tech.implementation.",
    production_roles: ["supporting_tool"],
  },
  unrealbloompass: {
    name: "UnrealBloomPass",
    kind: "bundled_library_component",
    package: "three",
    runtime: "browser via Three.js",
    purpose: "Add selective bloom to highlights using EffectComposer and RenderPass.",
    suggested_apis: ["three/addons/postprocessing/UnrealBloomPass.js"],
    optional: false,
    docs_url: "https://threejs.org/docs/pages/UnrealBloomPass.html",
    style_application:
      "Apply this tool to Futuristic UI (FUI) / HUD Design according to visual_cues and tech.implementation.",
    production_roles: ["style_renderer"],
  },
} satisfies Record<string, TechnologyDefinition>;

export type TechnologyKey = keyof typeof technologyPool;
export const technologyPoolSize = Object.keys(technologyPool).length;
