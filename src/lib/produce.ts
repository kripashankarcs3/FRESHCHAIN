/**
 * Produce catalogue.
 *
 * `baseLifeDays` and the mandi prices are the reference table the shelf-life
 * and pricing algorithms read from. `hue` / `sat` describe the colour signature
 * of *healthy* produce of that type — the vision pipeline scores an uploaded
 * photo against these envelopes, which is why a green banana and a green chilli
 * are graded differently.
 */

export type ProduceType =
  | 'tomato'
  | 'mango'
  | 'banana'
  | 'apple'
  | 'potato'
  | 'onion'
  | 'leafy_greens'
  | 'citrus';

export interface ProduceSpec {
  id: ProduceType;
  label: string;
  /** Days of shelf life at ideal storage, from harvest. */
  baseLifeDays: number;
  /** Typical Azadpur/Ghaziabad mandi rate, ₹ per kg. */
  mandiPricePerKg: number;
  /** Healthy hue window in degrees (0–360). Wraps if `from` > `to`. */
  hue: { from: number; to: number };
  /** Minimum saturation a healthy specimen holds (0–1). Fading = ageing. */
  minSaturation: number;
  /**
   * Brightness a healthy specimen holds (0–1). Decaying tissue darkens, and
   * this is the signal that separates brown from red — the two are almost
   * indistinguishable by hue alone.
   */
  minValue: number;
  /** How fast this crop loses shelf life per °C above the ideal band. */
  tempSensitivity: number;
  emoji: string;
}

export const PRODUCE: Record<ProduceType, ProduceSpec> = {
  tomato: {
    id: 'tomato',
    label: 'Tomato',
    baseLifeDays: 7,
    mandiPricePerKg: 28,
    hue: { from: 345, to: 25 },
    minSaturation: 0.42,
    minValue: 0.55,
    tempSensitivity: 1.15,
    emoji: '🍅',
  },
  mango: {
    id: 'mango',
    label: 'Mango',
    baseLifeDays: 5,
    mandiPricePerKg: 72,
    hue: { from: 28, to: 62 },
    minSaturation: 0.38,
    minValue: 0.6,
    tempSensitivity: 1.3,
    emoji: '🥭',
  },
  banana: {
    id: 'banana',
    label: 'Banana',
    baseLifeDays: 4,
    mandiPricePerKg: 42,
    hue: { from: 38, to: 68 },
    minSaturation: 0.34,
    minValue: 0.62,
    tempSensitivity: 1.25,
    emoji: '🍌',
  },
  apple: {
    id: 'apple',
    label: 'Apple',
    baseLifeDays: 14,
    mandiPricePerKg: 118,
    hue: { from: 340, to: 30 },
    minSaturation: 0.3,
    minValue: 0.5,
    tempSensitivity: 0.6,
    emoji: '🍎',
  },
  potato: {
    id: 'potato',
    label: 'Potato',
    baseLifeDays: 30,
    mandiPricePerKg: 18,
    hue: { from: 25, to: 55 },
    minSaturation: 0.18,
    minValue: 0.42,
    tempSensitivity: 0.4,
    emoji: '🥔',
  },
  onion: {
    id: 'onion',
    label: 'Onion',
    baseLifeDays: 60,
    mandiPricePerKg: 32,
    hue: { from: 15, to: 45 },
    minSaturation: 0.2,
    minValue: 0.48,
    tempSensitivity: 0.3,
    emoji: '🧅',
  },
  leafy_greens: {
    id: 'leafy_greens',
    label: 'Leafy Greens',
    baseLifeDays: 5,
    mandiPricePerKg: 26,
    hue: { from: 70, to: 150 },
    minSaturation: 0.3,
    minValue: 0.36,
    tempSensitivity: 1.6,
    emoji: '🥬',
  },
  citrus: {
    id: 'citrus',
    label: 'Citrus',
    baseLifeDays: 14,
    mandiPricePerKg: 58,
    hue: { from: 30, to: 60 },
    minSaturation: 0.44,
    minValue: 0.62,
    tempSensitivity: 0.7,
    emoji: '🍊',
  },
};

export const PRODUCE_LIST = Object.values(PRODUCE);

/** Facilities produce can be routed to. Real geography around the Ghaziabad pilot. */
export const FACILITIES = {
  NGO_RESCUE: [
    'Robin Hood Army — Ghaziabad Chapter',
    'Feeding India Kitchen, Vaishali',
    'Anna Kshetra Community Kitchen, Loni',
  ],
  QUICK_COMMERCE: [
    'Dark Store — Indirapuram Hub',
    'Dark Store — Vasundhara Sector 9',
    'Dark Store — Noida Sector 62',
  ],
  RETAIL_EXPORT: [
    'Retail DC — Azadpur Mandi',
    'Retail DC — Ghaziabad Wholesale',
    'Export Consolidation — IGI Cargo',
  ],
} as const;

export const COLD_STORAGE_BLOCKS = ['Block A', 'Block B', 'Block C', 'Block D'] as const;
