import { useEffect, useRef, useState } from 'react';

/**
 * Counts a metric up on mount and re-counts when the value changes, so the
 * dashboard visibly reacts when a batch is scanned on another screen.
 */
export function CountUp({
  value,
  decimals = 0,
  format,
  duration = 1000,
}: {
  value: number;
  decimals?: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const frameRef = useRef<number>();

  useEffect(() => {
    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Same easing curve as every motion in the app.
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(from + delta * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, duration]);

  if (format) return <>{format(display)}</>;
  return <>{display.toFixed(decimals)}</>;
}
