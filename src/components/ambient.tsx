import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "@/lib/settingsContext";

/**
 * Ambient layer (brief §12, §13, §41, §47).
 *
 * Three deliberately quiet effects:
 *  - `AtmosphereFX` — procedural grain, a faint coordinate grid and one slow
 *    glow behind the board. No images, all CSS, never above 4% opacity.
 *  - `CursorLayer` — desktop contextual cursor. It replaces the OS pointer
 *    only after it has successfully attached (so a JS failure can never leave
 *    the user without a cursor) and keeps `text` cursors on form fields.
 *  - `Reveal` — scroll-triggered entrance used by the narrative sections.
 *
 * All three honour the reduced-motion flag and the user's settings.
 */

export function AtmosphereFX(): ReactNode {
  const { settings } = useSettings();
  if (!settings.atmosphere) return null;
  return (
    <div className="atmo" aria-hidden="true">
      <div className="glow" />
      <div className="grid-lines" />
      <div className="grain" />
    </div>
  );
}

/* ------------------------------------------------------------------ cursor */

export function CursorLayer(): ReactNode {
  const { settings } = useSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  const wantsCursor =
    settings.customCursor &&
    !settings.reduceMotion &&
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  useEffect(() => {
    if (!wantsCursor) {
      document.documentElement.removeAttribute("data-cursor");
      setEnabled(false);
      return;
    }
    const root = rootRef.current;
    const label = root?.querySelector<HTMLElement>(".label");
    const dot = root?.querySelector<HTMLElement>(".dot");
    if (!root || !label || !dot) return;

    let frame = 0;
    let x = -100;
    let y = -100;

    const paint = () => {
      frame = 0;
      root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);

      const target = event.target as HTMLElement | null;
      const square = target?.closest?.("[data-square]") as HTMLElement | null;
      const board = target?.closest?.("[data-cursor-surface]") as HTMLElement | null;
      const inspect = target?.closest?.("[data-cursor-inspect]") as HTMLElement | null;

      let mode = "default";
      let text = "";
      if (square) {
        mode = "board";
        text = square.dataset.square ?? "";
      } else if (board) {
        mode = "board";
      }
      if (inspect && !square) {
        mode = "inspect";
        text = inspect.dataset.cursorInspect ?? "";
      }
      root.dataset.mode = mode;
      label.textContent = text;
      if (text) root.dataset.label = "1";
      else delete root.dataset.label;
    };

    const onDown = () => {
      root.dataset.mode = "press";
    };
    const onUp = (event: PointerEvent) => {
      onMove(event);
    };
    const onLeave = () => {
      root.style.opacity = "0";
    };
    const onEnter = () => {
      root.style.opacity = "1";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    document.documentElement.setAttribute("data-cursor", "1");
    setEnabled(true);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      document.documentElement.removeAttribute("data-cursor");
      if (frame) cancelAnimationFrame(frame);
    };
  }, [wantsCursor]);

  return (
    <div
      ref={rootRef}
      className="cursor"
      aria-hidden="true"
      style={{ opacity: enabled ? 1 : 0 }}
    >
      <div className="dot" />
      <span className="label" />
    </div>
  );
}

/* ------------------------------------------------------------------ reveal */

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: 0 | 1 | 2 | 3;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}): ReactNode {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cls = ["reveal", shown ? "in" : "", delay > 0 ? `d${delay}` : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag ref={ref as never} className={cls}>
      {children}
    </Tag>
  );
}

/**
 * Tilt the hero board with the pointer (desktop) — the one 3D gesture in the
 * product (brief §7). Respects reduced motion and coarse pointers.
 */
export function useHeroTilt(): {
  ref: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
} {
  const ref = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const enabled =
    !settings.reduceMotion &&
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const tick = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      node.style.setProperty("--tilt-x", `${currentX.toFixed(2)}deg`);
      node.style.setProperty("--tilt-y", `${currentY.toFixed(2)}deg`);
      if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
      }
    };

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      targetY = ((event.clientX - cx) / rect.width) * 7;
      targetX = -((event.clientY - cy) / rect.height) * 5;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return { ref, enabled };
}

/** Count up to `value` once, for completion microinteractions (brief §41). */
export function useCountUp(value: number, durationMs = 520): number {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const ratio = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (ratio < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return display;
}
