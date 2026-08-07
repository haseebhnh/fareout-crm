"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals its children once they scroll into view.
 *
 * Two properties matter more than the effect itself:
 *
 *  1. It fails visible. If IntersectionObserver is missing, or JS never
 *     runs, `shown` is forced true so the content renders normally. A
 *     marketing page that hides its own copy when a script fails is
 *     worse than one with no animation at all.
 *
 *  2. It observes once. The observer disconnects on first intersection,
 *     so scrolling back up doesn't re-trigger and long pages don't keep
 *     dozens of observers alive.
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
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
      // Trigger slightly before the element is fully on screen so the
      // motion finishes as the reader arrives at it.
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className ?? ""}`}
      data-shown={shown ? "true" : "false"}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
