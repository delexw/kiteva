import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { useViewportVisibility } from "./use-viewport-visibility";
import { heroGeometry } from "./hero-geometry";

export default function CreativeHero() {
  const host = useRef<HTMLDivElement>(null);
  const visible = useViewportVisibility(host);
  const reduced = useReducedMotion();
  const running = useRef(false);
  running.current = visible && !reduced;
  const [variant, setVariant] = useState(0);
  const [failed, setFailed] = useState(false);
  const pointerX = useSpring(0, { stiffness: 90, damping: 20 });
  const pointerY = useSpring(0, { stiffness: 90, damping: 20 });
  const shape = useSpring(0, { stiffness: 45, damping: 16 });
  useEffect(() => {
    if (reduced) shape.jump(variant);
    else shape.set(variant);
  }, [variant, shape, reduced]);
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let destroy: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    void (async () => {
      const { Application, Graphics } = await import("pixi.js");
      if (disposed || !host.current) return;
      const app = new Application();
      await app.init({
        width: host.current.clientWidth,
        height: host.current.clientHeight,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        sharedTicker: false,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });
      destroy = () => app.destroy(true, { children: true });
      if (disposed || !host.current) {
        destroy();
        return;
      }
      host.current.appendChild(app.canvas);
      resizeObserver = new ResizeObserver(([entry]) => {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          app.renderer.resize(entry.contentRect.width, entry.contentRect.height);
        }
      });
      resizeObserver.observe(host.current);
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      const graphics = new Graphics();
      app.stage.addChild(graphics);
      let elapsed = 0;
      let last = 0;
      let previousState = "";
      const draw = (now: number) => {
        if (running.current && last) elapsed += Math.min((now - last) / 1000, 0.05);
        last = now;
        const state = [
          app.screen.width,
          app.screen.height,
          elapsed,
          reduced ? 0 : pointerX.get(),
          reduced ? 0 : pointerY.get(),
          shape.get(),
        ]
          .map((value) => value.toFixed(3))
          .join(",");
        if (state === previousState) {
          frame = requestAnimationFrame(draw);
          return;
        }
        previousState = state;
        const geometry = heroGeometry(
          elapsed,
          reduced ? 0 : pointerX.get(),
          reduced ? 0 : pointerY.get(),
          shape.get(),
          app.screen.width,
          app.screen.height,
        );
        graphics.clear();
        for (const ribbon of geometry.ribbons) {
          graphics.moveTo(ribbon[0][0], ribbon[0][1]);
          ribbon.slice(1).forEach(([x, y]) => graphics.lineTo(x, y));
          graphics.stroke({ color: 0x3455db, width: 1.2, alpha: 0.32 });
        }
        for (const circle of geometry.circles) {
          graphics.circle(circle.x, circle.y, circle.radius).fill(circle.color);
        }
        app.render();
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    })().catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      destroy?.();
    };
  }, [pointerX, pointerY, shape, reduced]);
  return (
    <motion.div className="creative-hero" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div
        ref={host}
        className="creative-hero-canvas"
        role="img"
        aria-label="Interactive flowing lines and orbiting geometric shapes"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          pointerX.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1);
          pointerY.set(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
        }}
        onPointerLeave={() => {
          pointerX.set(0);
          pointerY.set(0);
        }}
      >
        {failed && (
          <div className="hero-art">
            <div className="art-circle" />
            <div className="art-square" />
          </div>
        )}
      </div>
      <div className="creative-hero-caption">
        <span>IDEAS IN MOTION / {String(variant + 1).padStart(2, "0")}</span>
        <motion.button
          type="button"
          whileHover={reduced ? undefined : { scale: 1.04 }}
          whileTap={reduced ? undefined : { scale: 0.96 }}
          onClick={() => setVariant((current) => (current + 1) % 3)}
        >
          Reshape ↗
        </motion.button>
      </div>
    </motion.div>
  );
}
