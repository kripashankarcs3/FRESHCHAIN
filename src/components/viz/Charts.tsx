import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { seedTelemetry, seedTrend } from '@/data/seed';

/**
 * Recharts is by far the heaviest dependency in the bundle, and only the
 * dashboard uses it. Isolating both charts here lets the dashboard lazy-load
 * them, so the metric row — the first thing anyone looks at — paints without
 * waiting on a 150 kB chart library.
 */

const AXIS = {
  tick: { fill: 'var(--text-3)', fontSize: 10, fontFamily: 'JetBrains Mono' },
  tickLine: false,
} as const;

interface TooltipPayload {
  name?: string;
  value?: number | string;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit = '',
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-surface-2 px-2.5 py-2 shadow-pop">
      <p className="label-micro mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="readout ml-auto pl-3 text-ink">
            {p.value}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Tonnes diverted vs. tonnes lost, trailing 14 days. */
export function DiversionChart() {
  return (
    <div className="h-[196px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={seedTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gFresh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--fresh)" stopOpacity={0.26} />
              <stop offset="100%" stopColor="var(--fresh)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="date" {...AXIS} axisLine={{ stroke: 'var(--line)' }} interval={2} />
          <YAxis {...AXIS} axisLine={false} width={38} tickFormatter={(v: number) => `${v}t`} />
          <Tooltip content={<ChartTooltip unit=" t" />} cursor={{ stroke: 'var(--line-strong)' }} />
          <Area
            type="monotone"
            dataKey="tonnes"
            name="Diverted"
            stroke="var(--fresh)"
            strokeWidth={1.75}
            fill="url(#gFresh)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="spoiled"
            name="Spoiled"
            stroke="var(--critical)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            fill="none"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cold storage temperature by block, last 12 hours. Block C carries the spike. */
export function ColdChainChart() {
  return (
    <div className="h-[132px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={seedTelemetry} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: 'var(--text-3)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--line)' }}
            interval={7}
          />
          <YAxis
            tick={{ fill: 'var(--text-3)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={false}
            width={34}
            domain={[0, 26]}
            ticks={[0, 8, 16, 24]}
            tickFormatter={(v: number) => `${v}°`}
          />
          <Tooltip content={<ChartTooltip unit=" °C" />} cursor={{ stroke: 'var(--line-strong)' }} />
          <Line type="monotone" dataKey="blockA" name="Block A" stroke="var(--info)" strokeWidth={1.4} dot={false} />
          <Line type="monotone" dataKey="blockB" name="Block B" stroke="var(--urgent)" strokeWidth={1.4} dot={false} />
          <Line type="monotone" dataKey="blockC" name="Block C" stroke="var(--critical)" strokeWidth={1.6} dot={false} />
          <Line type="monotone" dataKey="blockD" name="Block D" stroke="var(--fresh)" strokeWidth={1.4} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
