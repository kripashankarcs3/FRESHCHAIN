import { useMemo, useState } from 'react';
import { Check, Pencil, RotateCcw, X } from 'lucide-react';
import clsx from 'clsx';
import { useProfile, initialsOf, DEFAULT_PROFILE, type Profile as ProfileData } from '@/store/useProfile';
import { useStore } from '@/store/useStore';
import { Badge, Button, Field, Input, Panel, PanelHeader, Readout } from '@/components/ui/primitives';
import { ShelfLifeBar } from '@/components/viz/ShelfLifeBar';
import { PRODUCE } from '@/lib/produce';
import { formatDays, formatINR, formatWeight, relativeTime } from '@/lib/format';
import { useBackendStatus } from '@/hooks/useBackendStatus';

export function Profile() {
  const { profile, updateProfile, resetProfile } = useProfile();
  const batches = useStore((s) => s.batches);
  const activity = useStore((s) => s.activity);
  const backend = useBackendStatus();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileData>(profile);

  // Everything here is derived from the live store, so a batch scanned a
  // minute ago moves these numbers immediately.
  const stats = useMemo(() => {
    const scanned = batches.length;
    const routed = batches.filter((b) => b.status !== 'pending').length;
    const rescued = batches.filter((b) => b.destination === 'NGO_RESCUE').length;
    const weight = batches.reduce((s, b) => s + b.weightKg, 0);
    const value = batches.reduce((s, b) => s + b.valueRecovered, 0);
    const avgFreshness = scanned ? Math.round(batches.reduce((s, b) => s + b.freshnessScore, 0) / scanned) : 0;
    const gradeA = batches.filter((b) => b.grade === 'A').length;
    const daysOnShift = Math.max(
      1,
      Math.round((Date.now() - new Date(profile.joinedAt).getTime()) / 86_400_000),
    );
    return { scanned, routed, rescued, weight, value, avgFreshness, gradeA, daysOnShift };
  }, [batches, profile.joinedAt]);

  const recent = useMemo(
    () => batches.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6),
    [batches],
  );

  function save() {
    updateProfile(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(profile);
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      {/* Identity ------------------------------------------------------------ */}
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fresh to-info text-xl font-semibold text-on-fresh">
            {initialsOf(profile.name)}
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
                <Field label="Role">
                  <Input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
                </Field>
                <Field label="Node">
                  <Input value={draft.node} onChange={(e) => setDraft({ ...draft, node: e.target.value })} />
                </Field>
                <Field label="Bay">
                  <Input value={draft.bay} onChange={(e) => setDraft({ ...draft, bay: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                </Field>
                <Field label="Joined">
                  <Input
                    type="date"
                    value={draft.joinedAt}
                    onChange={(e) => setDraft({ ...draft, joinedAt: e.target.value })}
                  />
                </Field>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-ink">{profile.name}</h2>
                  <Badge tone="fresh">{profile.role}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-2">
                  {profile.node} · {profile.bay}
                </p>
                <p className="readout mt-1 text-xs text-ink-3">
                  {profile.phone} · {stats.daysOnShift} {stats.daysOnShift === 1 ? 'day' : 'days'} on shift
                </p>
              </>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={cancel}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" icon={<Check size={13} />} onClick={save}>
                  Save
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                icon={<Pencil size={13} />}
                onClick={() => {
                  setDraft(profile);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )}
          </div>
        </div>
      </Panel>

      {/* Shift performance --------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Batches scanned" value={stats.scanned.toString()} />
        <Stat label="Routed" value={stats.routed.toString()} tone="fresh" />
        <Stat label="Value recovered" value={formatINR(stats.value)} tone="fresh" />
        <Stat label="Sent to rescue" value={stats.rescued.toString()} tone={stats.rescued ? 'critical' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Recent scans ------------------------------------------------------ */}
        <Panel flush>
          <div className="p-4">
            <PanelHeader title="Recent scans" hint="Batches this operator put through the scanner, newest first" />
          </div>
          {recent.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {recent.map((b) => {
                const spec = PRODUCE[b.produceType];
                return (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 shrink-0 text-center text-sm">{spec.emoji}</span>
                    <div className="min-w-0 flex-[1.4]">
                      <p className="truncate text-sm text-ink">{spec.label}</p>
                      <p className="readout truncate text-xs text-ink-3">
                        {b.id} · {formatWeight(b.weightKg)}
                      </p>
                    </div>
                    <div className="hidden min-w-0 flex-1 sm:block">
                      <ShelfLifeBar days={b.shelfLifeDays} baseLifeDays={spec.baseLifeDays} size="sm" showTicks={false} />
                      <p className="readout mt-1 text-xs text-ink-3">{formatDays(b.shelfLifeDays)}</p>
                    </div>
                    <Badge tone={b.grade === 'A' ? 'fresh' : b.grade === 'B' ? 'urgent' : 'critical'}>
                      Grade {b.grade}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border-t border-line px-4 py-6 text-center text-xs text-ink-3">
              Nothing scanned yet on this device.
            </p>
          )}
        </Panel>

        {/* Quality + session ------------------------------------------------- */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Grading quality" hint="Across every batch on record" />
            <div className="mt-3">
              <Readout label="Avg freshness" value={`${stats.avgFreshness}/100`} tone="fresh" />
              <Readout label="Grade A batches" value={`${stats.gradeA} of ${stats.scanned}`} />
              <Readout label="Total handled" value={formatWeight(stats.weight)} />
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="label-micro">Grade A share</span>
                <span className="readout text-xs text-ink-2">
                  {stats.scanned ? Math.round((stats.gradeA / stats.scanned) * 100) : 0}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-fresh transition-all"
                  style={{ width: `${stats.scanned ? (stats.gradeA / stats.scanned) * 100 : 0}%` }}
                />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Session" hint="Where this operator's data lives" />
            <div className="mt-3">
              <Readout
                label="Storage"
                value={backend === 'online' ? 'Backend + device' : 'This device'}
                tone={backend === 'online' ? 'fresh' : 'default'}
                mono={false}
              />
              <Readout
                label="Backend"
                value={
                  backend === 'online'
                    ? 'Connected'
                    : backend === 'offline'
                      ? 'Unreachable'
                      : backend === 'checking'
                        ? 'Checking…'
                        : 'Not configured'
                }
                tone={backend === 'online' ? 'fresh' : backend === 'offline' ? 'critical' : 'default'}
                mono={false}
              />
              <Readout label="Last activity" value={activity[0] ? relativeTime(activity[0].at) : '—'} />
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw size={12} />}
              className="mt-3 w-full justify-start px-1.5 text-ink-3"
              onClick={() => {
                resetProfile();
                setDraft(DEFAULT_PROFILE);
              }}
            >
              Reset profile to default
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'fresh' | 'critical' }) {
  return (
    <Panel>
      <p className="label-micro">{label}</p>
      <p
        className={clsx(
          'readout mt-2 text-2xl font-semibold leading-none',
          tone === 'fresh' ? 'text-fresh' : tone === 'critical' ? 'text-critical' : 'text-ink',
        )}
      >
        {value}
      </p>
    </Panel>
  );
}
