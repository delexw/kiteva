import vm from "node:vm";
import { gsap } from "gsap";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { validateExamplePalette, validateExampleSvg } from "../src/server/catalog/style-examples";
import {
  CASSETTE_COMPOSITION_ID,
  CASSETTE_STEPS,
  bootLog,
  cassetteColors,
  cassetteCues,
  cassetteFuturismPatch,
  cassetteFuturismPatches,
  cassetteFuturismPreviewHtml,
  cassetteFuturismPreviewSvg,
  cassetteFuturismState,
  cassetteStep,
} from "../scripts/generate-cassette-futurism-preview";

const styleOf = async (id: string) => (await loadCatalog()).styles.find((s) => s.id === id)!;
const stepTime = (step: number) => step / 12;

describe("Cassette Futurism catalog entry", () => {
  it("adds an authored style-137 with separate renderer, motion and pipeline roles", async () => {
    const catalog = await loadCatalog();
    expect(catalog.styles).toHaveLength(140);
    const style = catalog.styles.find((s) => s.id === "style-137")!;
    expect(style.name_en).toBe("Cassette Futurism");
    expect(style.provenance).toBe("authored");
    expect(style.category).toBe("Digital and 3D Aesthetics");
    expect(style.tech.style_renderer.recommended_stack_refs).toEqual([
      "HTML/CSS",
      "SVG",
      "Canvas 2D",
    ]);
    expect(style.tech.motion_engine.recommended_stack_refs).toEqual([
      "GSAP",
      "Scrambled Text Reveal",
    ]);
    const tools = style.tech.recommended_stack.map((tool) => tool.name);
    for (const ref of [
      ...style.tech.style_renderer.recommended_stack_refs,
      ...style.tech.motion_engine.recommended_stack_refs,
    ])
      expect(tools).toContain(ref);
    expect(tools).not.toContain("HyperFrames");
    expect(style.tech.render_pipeline).toContain("project's renderer setting");
    const original = catalog.originalStyles.find((s) => s.id === "style-137")!;
    const pipeline = (
      original.tech as { recommended_stack: { name: string; production_roles: string[] }[] }
    ).recommended_stack
      .filter((tool) => tool.production_roles.includes("render_pipeline"))
      .map((tool) => tool.name);
    expect(pipeline).toEqual(["HyperFrames", "Remotion"]);
    expect(style.executable_prompt_template).toContain("{{render_pipeline}}");
    expect(style.combination_guidance_provenance).toBe(
      "authored_compatibility_guidance_2026-10-18",
    );
  });

  it("names its relationship to Retrofuturism and CRT in existing fields only", async () => {
    const style = await styleOf("style-137");
    for (const text of [style.note, style.tech.implementation]) {
      expect(text).toContain("Retrofuturism (style-065)");
      expect(text).toContain("CRT / Analog Video Effects (style-066)");
    }
    expect(style.visual_cues).toContain("rather than cyberpunk, vaporwave or Y2K");
    expect(style.visual_cues).toContain("12fps stepped");
    expect(style.visual_cues).toContain("Red appears only for warnings");
    expect(style.note).toContain("claude-opus-5-5");
    expect((await styleOf("style-065")).name_en).toBe("Retrofuturism");
    expect((await styleOf("style-066")).name_en).toBe("CRT / Analog Video Effects");
  });

  it("references only existing compatible motions with style-specific guidance", async () => {
    const catalog = await loadCatalog();
    const style = catalog.styles.find((s) => s.id === "style-137")!;
    const ids = style.motion_references.candidates.map((c) => c.motion_id);
    expect(ids).toEqual(["motion-022", "motion-030", "motion-020"]);
    const names = Object.fromEntries(catalog.motions.map((m) => [m.id, m.name]));
    expect(ids.map((id) => names[id])).toEqual([
      "Terminal Typing",
      "Data Build",
      "Scroll-Driven Glitch Cut",
    ]);
    for (const candidate of style.motion_references.candidates)
      expect(candidate.usage_guidance).toMatch(/12fps|step/);
  });

  it("keeps a scene-dependent palette with warning-only red and readable phosphor pairs", async () => {
    const style = await styleOf("style-137");
    expect(style.palette.background_policy).toBe("scene_dependent");
    expect(style.palette.tokens).toEqual(cassetteColors);
    expect(style.palette.tokens.phosphor_green).toBe("#74FF9A");
    expect(style.palette.tokens.phosphor_amber).toBe("#FFB23E");
    expect(style.palette.constraints.join(" ")).toContain("Reserve #D7322B for warning");
    const pairs = (
      style.palette.contrast_checks as {
        suggested_text_pairs: { foreground_token: string; contrast_ratio: number }[];
      }
    ).suggested_text_pairs;
    for (const token of ["phosphor_green", "phosphor_amber"])
      expect(pairs.find((p) => p.foreground_token === token)!.contrast_ratio).toBeGreaterThan(4.5);
  });
});

describe("Cassette Futurism preview artwork", () => {
  it("draws a safe, code-only console with tape mechanism, physical controls and a bounded CRT", async () => {
    const svg = cassetteFuturismPreviewSvg();
    expect(() => validateExampleSvg(svg)).not.toThrow();
    await expect(validateExamplePalette(svg, await styleOf("style-137"))).resolves.toBeUndefined();
    for (const forbidden of ["<image", "<img", "data:", "http", "@font-face", "@import", "<script"])
      expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toContain(forbidden);
    for (const part of [
      "cf-reel-supply",
      "cf-reel-takeup",
      "cf-tape",
      "cf-key-play",
      "cf-knob",
      "cf-toggle-nav",
      "cf-toggle-pwr",
      "cf-toggle-sys",
      "cf-caution-lamp",
      "cf-screen-clip",
      "cf-scan",
      "cf-vignette",
      "cf-glow",
      "cf-noise",
    ])
      expect(svg).toContain(`id="${part}"`);
    for (const label of ["NAV", "PWR", "SYS", "TAPE TRANSPORT", "CAUTION"])
      expect(svg).toContain(label);
    // Scanlines, vignette, noise and static are inside the screen clip.
    const clipped = svg.slice(svg.indexOf('clip-path="url(#cf-screen-clip)"'));
    for (const layer of ["url(#cf-scan)", "url(#cf-vignette)", 'id="cf-noise"', 'id="cf-static"'])
      expect(clipped).toContain(layer);
    expect(new Set(svg.match(/font-family="[^"]+"/g))).toEqual(
      new Set(['font-family="monospace"']),
    );
  });

  it("uses only palette colors and never pink, purple or extra hues", () => {
    const allowed = new Set(Object.values(cassetteColors).map((c) => c.toUpperCase()));
    for (let step = 0; step < CASSETTE_STEPS; step++)
      for (const color of cassetteFuturismPreviewSvg(stepTime(step)).match(/#[0-9A-Fa-f]{6}\b/g)!)
        expect(allowed, color).toContain(color.toUpperCase());
  });

  it("uses warning red only on the warning lamp and only after the warning cue", () => {
    const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true });
    const redOwners = (svg: string) => {
      const owners: string[] = [];
      const visit = (nodes: unknown[]) => {
        for (const node of nodes as Record<string, unknown>[]) {
          const attrs = (node[":@"] || {}) as Record<string, string>;
          if (
            Object.values(attrs).some((value) =>
              String(value).toUpperCase().includes(cassetteColors.warning_red),
            )
          )
            owners.push(attrs["@_data-role"] || attrs["@_id"] || "unlabelled");
          for (const [key, value] of Object.entries(node))
            if (key !== ":@" && Array.isArray(value)) visit(value);
        }
      };
      visit(parser.parse(svg));
      return owners;
    };
    for (let step = 0; step < CASSETTE_STEPS; step++) {
      const owners = redOwners(cassetteFuturismPreviewSvg(stepTime(step)));
      expect(owners).toEqual(step >= cassetteCues.warning ? ["warning"] : []);
    }
    for (const [step, patch] of cassetteFuturismPatches().entries())
      for (const [id, values] of Object.entries(patch))
        if (Object.values(values).includes(cassetteColors.warning_red)) {
          expect(id).toBe("cf-caution-lamp");
          expect(step).toBeGreaterThanOrEqual(cassetteCues.warning);
        }
  });
});

describe("Cassette Futurism time state", () => {
  it("quantizes to 12 steps per second and clamps out-of-range times", () => {
    expect(cassetteStep(-1)).toBe(0);
    expect(cassetteStep(Number.NaN)).toBe(0);
    expect(cassetteStep(99)).toBe(CASSETTE_STEPS - 1);
    for (let frame = 0; frame <= 90; frame++) {
      const time = frame / 30;
      expect(cassetteFuturismState(time)).toEqual(
        cassetteFuturismState(stepTime(cassetteStep(time))),
      );
    }
    expect(cassetteFuturismState(0.5)).toEqual(cassetteFuturismState(0.5));
  });

  it("keeps boot flicker and channel static brief instead of strobing", () => {
    const states = Array.from({ length: CASSETTE_STEPS }, (_, s) =>
      cassetteFuturismState(stepTime(s)),
    );
    const brightnessChanges = states.filter(
      (s, i) => i && s.brightness !== states[i - 1].brightness,
    );
    expect(brightnessChanges.length).toBeLessThanOrEqual(3);
    expect(
      states.filter((s) => s.brightness < 1).every((s) => s.step < cassetteCues.bootDone),
    ).toBe(true);
    expect(states.filter((s) => s.staticBand).map((s) => s.step)).toEqual([19, 20, 21]);
  });

  it("types the log in order, then holds readable pages before and after the cut", () => {
    const states = Array.from({ length: CASSETTE_STEPS }, (_, s) =>
      cassetteFuturismState(stepTime(s)),
    );
    const typed = states.map((s) => s.lines.join("").length);
    expect(typed.every((count, i) => !i || count >= typed[i - 1])).toBe(true);
    const complete = states.filter(
      (s) => s.lines.every((line, i) => line === bootLog[i]) && s.page === 1,
    );
    expect(complete.length).toBeGreaterThanOrEqual(6);
    const text = (s: (typeof states)[number]) =>
      JSON.stringify([s.page, s.readouts, s.bars, s.warning]);
    const finalHold = states.slice(cassetteCues.warning);
    expect(new Set(finalHold.map(text)).size).toBe(1);
    expect(finalHold.length / 12).toBeGreaterThanOrEqual(0.75);
    const reels = states.map((s) => s.reels.supply);
    expect(reels.every((angle, i) => !i || angle >= reels[i - 1])).toBe(true);
  });
});

function runComposition(html: string) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const elements = new Map<string, Record<string, string>>();
  const document = {
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, {});
      const attrs = elements.get(id)!;
      return {
        setAttribute: (key: string, value: string) => (attrs[key] = value),
        set textContent(value: string) {
          attrs["#text"] = value;
        },
      };
    },
  };
  const window: { __timelines?: Record<string, gsap.core.Timeline> } = {};
  vm.runInNewContext(script, { gsap, document, window, Math });
  const timeline = window.__timelines![CASSETTE_COMPOSITION_ID];
  return {
    timeline,
    snapshot: (time: number) => {
      timeline.seek(time, false);
      return JSON.stringify([...elements.entries()].sort());
    },
  };
}

describe("Cassette Futurism composition", () => {
  it("follows the HyperFrames contract with one paused timeline and no runtime clocks", () => {
    const html = cassetteFuturismPreviewHtml();
    expect(html).toContain(`data-composition-id="${CASSETTE_COMPOSITION_ID}"`);
    expect(html).toContain('data-duration="3"');
    expect(html).toContain('<script src="gsap.min.js"></script>');
    expect(html.match(/gsap\.timeline\(/g)).toHaveLength(1);
    expect(html).toContain("paused:true");
    expect(html).toContain(`window.__timelines={'${CASSETTE_COMPOSITION_ID}':tl}`);
    expect(html).toContain(cassetteFuturismPreviewSvg(0));
    for (const banned of [
      "Math.random",
      "Date.now",
      "performance.now",
      "requestAnimationFrame",
      "setInterval",
      "setTimeout",
      "http",
    ])
      expect(html.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toContain(banned);
  });

  it("reproduces identical attribute states for forward, backward and fresh direct seeks", () => {
    const html = cassetteFuturismPreviewHtml();
    const frames = Array.from({ length: 91 }, (_, frame) => frame / 30);
    const live = runComposition(html);
    const forward = frames.map(live.snapshot);
    const backward = [...frames].reverse().map(live.snapshot).reverse();
    expect(backward).toEqual(forward);
    for (const index of [0, 7, 30, 52, 57, 61, 66, 78, 90]) {
      const fresh = runComposition(html);
      expect(fresh.snapshot(frames[index]), `t=${frames[index]}`).toBe(forward[index]);
      const expected = cassetteFuturismPatch(cassetteFuturismState(frames[index]));
      const state = new Map(JSON.parse(forward[index]) as [string, Record<string, string>][]);
      for (const [id, values] of Object.entries(expected)) expect(state.get(id)).toEqual(values);
    }
    expect(new Set(forward).size).toBeGreaterThan(20);
  });
});
