import { motion, useMotionValue, useTransform, animate as animateValue } from 'framer-motion';
import { useEffect, useState } from 'react';
import { conditionOf } from '@/lib/algorithms';

/**
 * The freshness score reveal — the single most-watched moment in the demo.
 *
 * A 270° arc, not a full ring: the gap at the bottom reads as an instrument
 * gauge rather than a progress circle, and it gives the numeral room to breathe.
 * The number counts up in step with the arc so the two feel like one object.
 */
export function FreshnessDial({ score, size = 200 }: { score: number; size?: number }) {
  const [display, setDisplay] = useState(0);
  const progress = useMotionValue(0);

  const stroke = size * 0.055;
  const radius = (size - stroke) / 2;
  const sweep = 0.75; // 270°
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * sweep;

  const dashOffset = useTransform(progress, (p) => arcLength - (arcLength * p) / 100);

  const colour = score > 70 ? 'var(--fresh)' : score > 40 ? 'var(--urgent)' : 'var(--critical)';

  useEffect(() => {
    const controls = animateValue(progress, score, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [score, progress]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[225deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="readout text-4xl font-semibold leading-none" style={{ color: colour }}>
          {display}
        </span>
        <span className="label-micro mt-1.5">Freshness</span>
        <span className="mt-2 text-xs font-medium text-ink-2">{conditionOf(score)}</span>
      </div>
    </div>
  );
}
