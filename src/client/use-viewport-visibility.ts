import { useEffect, useState, type RefObject } from "react";
export function useViewportVisibility(
  ref: RefObject<Element | null>,
  threshold = 0.25,
  once = false,
) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting && entry.intersectionRatio >= threshold;
        setVisible(inView);
        if (inView && once) observer.disconnect();
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, once]);
  return visible;
}
