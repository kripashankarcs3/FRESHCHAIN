import type { Urgency } from './algorithms';

/**
 * The single place urgency turns into colour.
 *
 * Every red, amber and green in the product resolves through this map, so a
 * batch cannot be red on one screen and amber on another.
 */
export const URGENCY_STYLE: Record<Urgency, { text: string; bg: string; border: string; dot: string; label: string }> = {
  CRITICAL: {
    text: 'text-critical',
    bg: 'bg-critical/10',
    border: 'border-critical/30',
    dot: 'bg-critical',
    label: 'Critical',
  },
  HIGH: { text: 'text-urgent', bg: 'bg-urgent/10', border: 'border-urgent/30', dot: 'bg-urgent', label: 'Urgent' },
  NORMAL: { text: 'text-fresh', bg: 'bg-fresh/10', border: 'border-fresh/25', dot: 'bg-fresh', label: 'Fresh' },
};
