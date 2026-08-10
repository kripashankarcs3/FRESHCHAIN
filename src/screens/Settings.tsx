import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Laptop, Moon, RotateCcw, Sun, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '@/theme/useTheme';
import type { ThemeChoice } from '@/theme/context';
import { useStore } from '@/store/useStore';
import { useProfile } from '@/store/useProfile';
import { Button, Panel, PanelHeader, Readout, Switch } from '@/components/ui/primitives';
import { COLD_STORAGE_BLOCKS } from '@/lib/produce';

const THEME_OPTIONS: { id: ThemeChoice; label: string; icon: typeof Sun; blurb: string }[] = [
  { id: 'light', label: 'Light', icon: Sun, blurb: 'Bright canvas, crisp white cards' },
  { id: 'dark', label: 'Dark', icon: Moon, blurb: 'The original control-room look' },
  { id: 'system', label: 'System', icon: Laptop, blurb: 'Follows your OS setting' },
];

interface NotificationPrefs {
  criticalAlerts: boolean;
  routingConfirmations: boolean;
  marketplaceClaims: boolean;
  dailyDigest: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  criticalAlerts: true,
  routingConfirmations: true,
  marketplaceClaims: false,
  dailyDigest: false,
};

export function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const resetDemo = useStore((s) => s.resetDemo);
  const batches = useStore((s) => s.batches);
  const profile = useProfile((s) => s.profile);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const setPref = (key: keyof NotificationPrefs) => (value: boolean) => setPrefs((p) => ({ ...p, [key]: value }));

  return (
    <div className="max-w-3xl space-y-4">
      {/* Appearance ---------------------------------------------------------- */}
      <Panel>
        <PanelHeader title="Appearance" hint="Applies instantly, everywhere in the app, and persists on this device" />
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                className={clsx(
                  'relative rounded-lg border p-3.5 text-left transition-colors',
                  active ? 'border-fresh/50 bg-fresh/[0.06]' : 'border-line bg-surface-2 hover:border-line-strong',
                )}
              >
                {active && (
                  <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-fresh text-on-fresh">
                    <Check size={10} strokeWidth={3} />
                  </span>
                )}
                <opt.icon size={17} className={active ? 'text-fresh' : 'text-ink-3'} strokeWidth={1.8} />
                <p className={clsx('mt-2.5 text-sm font-medium', active ? 'text-ink' : 'text-ink-2')}>{opt.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-ink-3">{opt.blurb}</p>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Notifications --------------------------------------------------------- */}
      <Panel>
        <PanelHeader title="Notifications" hint="Local to this device — no backend required to change these" />
        <div className="mt-3 divide-y divide-line">
          <PrefRow
            label="Critical alerts"
            hint="Temperature excursions and batches crossing the rescue threshold"
            checked={prefs.criticalAlerts}
            onChange={setPref('criticalAlerts')}
          />
          <PrefRow
            label="Routing confirmations"
            hint="When a buyer confirms a batch you routed"
            checked={prefs.routingConfirmations}
            onChange={setPref('routingConfirmations')}
          />
          <PrefRow
            label="Marketplace claims"
            hint="When an NGO or dark store claims a rescue listing"
            checked={prefs.marketplaceClaims}
            onChange={setPref('marketplaceClaims')}
          />
          <PrefRow
            label="Daily digest"
            hint="A single morning summary instead of live pings"
            checked={prefs.dailyDigest}
            onChange={setPref('dailyDigest')}
          />
        </div>
      </Panel>

      {/* Node ------------------------------------------------------------------ */}
      <Panel>
        <PanelHeader title="Node" hint="Read-only — set at deployment" />
        <div className="mt-3">
          <Readout label="Node" value={profile.node} mono={false} />
          <Readout label="Cold storage blocks" value={COLD_STORAGE_BLOCKS.join(', ')} mono={false} />
          <Readout label="Active batches" value={batches.filter((b) => b.status !== 'delivered').length} />
          <Readout label="Operator" value={`${profile.name} · ${profile.bay}`} mono={false} />
        </div>
        <Button size="sm" variant="ghost" className="mt-2 px-1.5 text-ink-3" onClick={() => navigate('/profile')}>
          Edit in profile →
        </Button>
      </Panel>

      {/* Data -------------------------------------------------------------- */}
      <Panel>
        <PanelHeader title="Demo data" hint="Restores the seeded batches, alerts and rescue board" />
        <div className="mt-3.5">
          {confirmingReset ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-urgent/30 bg-urgent/[0.06] px-3 py-2.5">
              <TriangleAlert size={14} className="shrink-0 text-urgent" />
              <p className="flex-1 text-xs text-ink-2">
                This discards everything scanned or claimed this session and restores the original demo state.
              </p>
              <Button size="sm" variant="secondary" onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  resetDemo();
                  setConfirmingReset(false);
                }}
              >
                Reset
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} onClick={() => setConfirmingReset(true)}>
              Reset demo data
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

function PrefRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{label}</p>
        <p className="mt-0.5 text-xs leading-snug text-ink-3">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
