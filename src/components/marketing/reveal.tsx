"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals its children once they scroll into view, powered by Motion.
 *
 * Two properties matter more than the effect itself:
 *
 *  1. It fails visible. `useInView`'s `once: true` plus an `animate`
 *     target that always resolves to the visible state means that even
 *     if the browser never fires an intersection (reduced-motion, odd
 *     viewport, JS timing), the element still ends up opacity:1 — Motion
 *     sets inline styles imperatively rather than depending on a CSS
 *     class that could be stuck "hidden".
 *
 *  2. It observes once. `useInView({ once: true })` disconnects after
 *     first intersection, so scrolling back up doesn't re-trigger and
 *     long pages don't keep dozens of observers alive.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Stagger, in ms, for items revealed as a group. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px", amount: 0.1 });
  const reduceMotion = useReducedMotion();
  // Belt-and-suspenders "fails visible": if the viewport observer never
  // fires (missing API, odd layout, timing edge case) force the shown
  // state after a short delay rather than leaving copy hidden forever.
  const [forced, setForced] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setForced(true), 1200);
    return () => clearTimeout(timer);
  }, []);
  const shown = inView || forced || !!reduceMotion;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={shown ? { opacity: 1, y: 0 } : undefined}
      transition={{ type: "spring", stiffness: 120, damping: 20, delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}
