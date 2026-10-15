// Shared browser-only lifecycle for generated interactive pages.
(() => {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const records = new Map();
  const update = (record) => {
    const active = record.visible && !document.hidden && !preference.matches;
    record.element.dataset.motionActive = String(active);
    record.element.dataset.motionReduced = String(preference.matches);
    if (active !== record.active) {
      record.active = active;
      record.onActive?.(active);
    }
    if (record.reduced !== preference.matches) {
      record.reduced = preference.matches;
      record.onReducedMotion?.(preference.matches);
    }
    if (record.mode === "ambient" || record.mode === "entrance") {
      for (const animation of record.element.getAnimations({ subtree: true })) {
        if (animation.playState === "finished") continue;
        if (active && animation.playState !== "running") animation.play();
        else if (!active && animation.playState !== "paused") animation.pause();
      }
    }
    if (record.mode === "entrance" && active && !record.entered) {
      record.entered = true;
      record.onEnter?.();
    }
    if (record.mode === "scroll" && active) {
      const bounds = record.element.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(1, (innerHeight - bounds.top) / (innerHeight + bounds.height)),
      );
      record.onProgress?.(progress);
      record.element.dataset.motionProgress = String(progress);
    }
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const record = records.get(entry.target);
      if (record) {
        record.visible = entry.isIntersecting;
        update(record);
      }
    }
  });
  const refresh = () => {
    for (const record of records.values()) update(record);
  };
  addEventListener("scroll", refresh, { passive: true });
  addEventListener("resize", refresh);
  document.addEventListener("visibilitychange", refresh);
  preference.addEventListener("change", refresh);
  window.KitevaMotion = {
    register(element, options = {}) {
      if (!(element instanceof Element)) throw Error("Motion target must be an element");
      if (records.has(element)) throw Error("Motion target is already registered");
      const { mode = "ambient", ...callbacks } = options;
      if (!["ambient", "entrance", "scroll", "interaction"].includes(mode))
        throw Error("Unknown motion mode");
      const record = {
        element,
        mode,
        visible: false,
        active: undefined,
        reduced: undefined,
        entered: false,
        ...callbacks,
      };
      records.set(element, record);
      element.dataset.motionMode = mode;
      update(record);
      observer.observe(element);
      return () => {
        observer.unobserve(element);
        records.delete(element);
        record.onActive?.(false);
      };
    },
    refresh,
  };
  document.documentElement.dataset.kitevaMotionRuntime = "ready";
})();
