import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Camera,
  Check,
  CircleAlert,
  Cpu,
  ImageUp,
  RotateCcw,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import {
  Badge,
  Button,
  Field,
  GradeBadge,
  Input,
  Panel,
  PanelHeader,
  Readout,
  Select,
  UrgencyPill,
} from '@/components/ui/primitives';
import { URGENCY_STYLE } from '@/lib/urgencyStyle';
import { FreshnessDial } from '@/components/viz/FreshnessDial';
import { ShelfLifeBar, ShelfLifeScale } from '@/components/viz/ShelfLifeBar';
import { PRODUCE, PRODUCE_LIST, FACILITIES, COLD_STORAGE_BLOCKS, type ProduceType } from '@/lib/produce';
import { analyseImage, loadImage, type VisionResult } from '@/lib/vision';
import { calculateShelfLife, gradeOf, smartRoute, optimizePrice, type RouteResult, type ShelfLifeResult } from '@/lib/algorithms';
import { getRecommendation } from '@/lib/recommend';
import { batchId, formatDays, formatINR, isoDate } from '@/lib/format';
import { useStore } from '@/store/useStore';
import type { Batch } from '@/lib/types';

type Phase = 'idle' | 'analysing' | 'done';

interface Analysis {
  vision: VisionResult;
  shelf: ShelfLifeResult;
  route: RouteResult;
  price: ReturnType<typeof optimizePrice>;
  recommendation: string;
  recommendationSource: 'claude' | 'local';
  facility: string;
}

/** The pipeline the operator watches. Each step names the real work being done. */
const STAGES = [
  { key: 'ingest', label: 'Ingesting image', detail: 'Decode · downsample to 224×224' },
  { key: 'segment', label: 'Isolating specimen', detail: 'Chroma mask · background rejection' },
  { key: 'grade', label: 'Grading surface condition', detail: 'Colour · vibrancy · spots · texture' },
  { key: 'shelf', label: 'Computing shelf life', detail: 'Harvest age · temperature · humidity' },
  { key: 'route', label: 'Running routing engine', detail: 'Channel selection · price optimiser' },
  { key: 'explain', label: 'Drafting recommendation', detail: 'Plain-language action for the floor' },
] as const;

export function Scan() {
  const navigate = useNavigate();
  const addBatch = useStore((s) => s.addBatch);
  const acceptRoute = useStore((s) => s.acceptRoute);

  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [produceType, setProduceType] = useState<ProduceType>('tomato');
  const [weightKg, setWeightKg] = useState(250);
  const [harvestDate, setHarvestDate] = useState(() => isoDate(new Date(Date.now() - 2 * 86_400_000)));
  const [tempCelsius, setTempCelsius] = useState(14);
  const [humidityPct, setHumidityPct] = useState(76);
  const [block, setBlock] = useState<string>(COLD_STORAGE_BLOCKS[0]);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [savedBatch, setSavedBatch] = useState<Batch | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    if (!f.type.startsWith('image/')) {
      setError('That file is not an image. Upload a JPG, PNG or HEIC photo of the batch.');
      return;
    }
    try {
      const { image, objectUrl } = await loadImage(f);
      imageRef.current = image;
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return objectUrl;
      });
      setFile(f);
      setAnalysis(null);
      setSavedBatch(null);
      setPhase('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That image could not be read.');
    }
  }, []);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    imageRef.current = null;
    setAnalysis(null);
    setSavedBatch(null);
    setPhase('idle');
    setStage(0);
    setError(null);
  };

  async function runAnalysis() {
    const image = imageRef.current;
    if (!image) return;

    setPhase('analysing');
    setStage(0);
    setError(null);

    // Each stage is paced so the operator can read what the system is doing.
    // The work underneath is real — nothing here is a fake progress bar.
    const beat = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      await beat(320);
      setStage(1);
      await beat(260);
      setStage(2);

      const vision = await analyseImage(image, produceType);
      await beat(420);

      if (vision.freshnessScore === 0 && vision.confidence < 0.2) {
        setPhase('idle');
        setError('Could not isolate produce in that photo. Fill the frame with the batch and avoid heavy shadow.');
        return;
      }

      setStage(3);
      const shelf = calculateShelfLife(produceType, new Date(harvestDate), { tempCelsius, humidityPct }, vision.freshnessScore);
      await beat(380);

      setStage(4);
      const route = smartRoute(shelf.days, weightKg, produceType);
      const price = route.price;
      const facility = FACILITIES[route.destination][0];
      await beat(340);

      setStage(5);
      const rec = await getRecommendation({ produceType, weightKg, freshnessScore: vision.freshnessScore, shelfLife: shelf, route, facility });
      await beat(260);

      setAnalysis({ vision, shelf, route, price, recommendation: rec.text, recommendationSource: rec.source, facility });
      setPhase('done');
    } catch (e) {
      setPhase('idle');
      setError(e instanceof Error ? e.message : 'Analysis failed. Try another photo.');
    }
  }

  function confirmBatch() {
    if (!analysis) return;
    const batch: Batch = {
      id: batchId(),
      produceType,
      weightKg,
      harvestDate,
      freshnessScore: analysis.vision.freshnessScore,
      grade: gradeOf(analysis.vision.freshnessScore),
      shelfLifeDays: analysis.shelf.days,
      destination: analysis.route.destination,
      destinationLabel: analysis.route.destinationLabel,
      facility: analysis.facility,
      urgency: analysis.route.urgency,
      suggestedPricePerKg: analysis.route.suggestedPricePerKg,
      valueRecovered: analysis.route.valueRecovered,
      status: 'pending',
      createdAt: new Date().toISOString(),
      coldStorageBlock: block,
      tempCelsius,
      humidityPct,
      confidence: analysis.vision.confidence,
      defects: analysis.vision.defects,
      signals: analysis.vision.signals,
      recommendation: analysis.recommendation,
      imageUrl: preview ?? undefined,
      origin: 'Bay 2 intake',
    };
    addBatch(batch);
    acceptRoute(batch.id);
    setSavedBatch(batch);
  }

  const spec = PRODUCE[produceType];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
      {/* ---------------------------------------------------------------- */}
      {/* Left — intake form                                                */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-4 lg:sticky lg:top-[76px]">
        <Panel>
          <PanelHeader title="Batch intake" hint="Photo plus four fields. Everything else is derived." />

          <div className="mt-4">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {preview ? (
              <div className="relative overflow-hidden rounded-lg border border-line">
                <img src={preview} alt="Batch" className="h-44 w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-canvas/85 via-transparent to-transparent" />
                {phase === 'analysing' && <ScanOverlay />}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2.5">
                  <span className="readout truncate text-xs text-ink-2">{file?.name}</span>
                  <button
                    onClick={reset}
                    className="shrink-0 rounded border border-line-strong bg-surface/90 p-1 text-ink-2 backdrop-blur transition-colors hover:text-ink"
                    aria-label="Remove photo"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
                onClick={() => fileInput.current?.click()}
                className={clsx(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
                  dragging ? 'border-fresh/60 bg-fresh/[0.04]' : 'border-line-strong bg-surface-2 hover:border-[#3a434b]',
                )}
              >
                <ImageUp size={20} className="mb-2.5 text-ink-3" strokeWidth={1.7} />
                <p className="text-sm font-medium text-ink">Drop a batch photo</p>
                <p className="mt-1 max-w-[30ch] text-balance text-xs leading-relaxed text-ink-3">
                  Fill the frame with the produce. Grading runs on-device — the photo never leaves this browser.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Camera size={13} />}
                  className="mt-3.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraInput.current?.click();
                  }}
                >
                  Use camera
                </Button>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/[0.07] px-3 py-2.5">
              <CircleAlert size={13} className="mt-0.5 shrink-0 text-critical" />
              <p className="text-xs leading-relaxed text-ink-2">{error}</p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Produce type">
                <Select value={produceType} onChange={(e) => setProduceType(e.target.value as ProduceType)}>
                  {PRODUCE_LIST.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji}  {p.label} — base {p.baseLifeDays}d · ₹{p.mandiPricePerKg}/kg
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Weight (kg)">
              <Input type="number" min={1} value={weightKg} onChange={(e) => setWeightKg(Math.max(1, Number(e.target.value)))} />
            </Field>
            <Field label="Harvest date">
              <Input type="date" max={isoDate(new Date())} value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} />
            </Field>
            <Field label="Storage temp (°C)">
              <Input type="number" step="0.5" value={tempCelsius} onChange={(e) => setTempCelsius(Number(e.target.value))} />
            </Field>
            <Field label="Humidity (%)">
              <Input type="number" min={0} max={100} value={humidityPct} onChange={(e) => setHumidityPct(Number(e.target.value))} />
            </Field>
            <div className="col-span-2">
              <Field label="Cold storage block">
                <Select value={block} onChange={(e) => setBlock(e.target.value)}>
                  {COLD_STORAGE_BLOCKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full"
            icon={<ScanLine size={16} strokeWidth={2.2} />}
            disabled={!preview}
            loading={phase === 'analysing'}
            onClick={runAnalysis}
          >
            {phase === 'analysing' ? 'Analysing…' : analysis ? 'Re-run analysis' : 'Analyse batch'}
          </Button>
          {!preview && <p className="mt-2 text-center text-xs text-ink-3">Add a photo to enable grading.</p>}
        </Panel>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Right — pipeline / result                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="min-w-0">
        <AnimatePresence mode="wait">
          {phase === 'idle' && !analysis && <IdleState key="idle" />}

          {phase === 'analysing' && <Pipeline key="pipe" stage={stage} />}

          {phase === 'done' && analysis && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              <ResultHeader analysis={analysis} produceType={produceType} weightKg={weightKg} />

              <div className="grid gap-4 xl:grid-cols-2">
                <SignalsPanel analysis={analysis} />
                <ShelfLifePanel analysis={analysis} produceType={produceType} />
              </div>

              <RoutePanel
                analysis={analysis}
                weightKg={weightKg}
                saved={savedBatch}
                onConfirm={confirmBatch}
                onRescan={reset}
                onOpenRouting={() => navigate('/routing')}
                spec={spec}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ScanOverlay() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-fresh/20 to-transparent"
        initial={{ top: '-20%' }}
        animate={{ top: ['-20%', '110%'] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-3 rounded border border-fresh/30" />
      {(['left-3 top-3', 'right-3 top-3', 'left-3 bottom-3', 'right-3 bottom-3'] as const).map((pos) => (
        <span key={pos} className={clsx('absolute h-3 w-3 border-fresh', pos)} style={{ borderWidth: 1.5 }} />
      ))}
    </div>
  );
}

function IdleState() {
  return (
    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Panel className="flex flex-col items-center justify-center px-6 py-12 text-center lg:min-h-[calc(100vh-136px)] lg:py-0">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-3">
          <ScanLine size={19} strokeWidth={1.7} />
        </div>
        <h2 className="text-lg font-semibold text-ink">Nothing scanned yet</h2>
        <p className="mt-1.5 max-w-[46ch] text-balance text-sm leading-relaxed text-ink-2">
          Upload a photo and FreshChain will grade the surface, compute how many days the batch has left, and pick the
          channel it can still reach in time.
        </p>

        <ol className="mt-7 grid w-full max-w-lg gap-2.5 text-left sm:grid-cols-3">
          {[
            { n: '01', t: 'Grade', d: 'On-device surface analysis' },
            { n: '02', t: 'Predict', d: 'Shelf life from real conditions' },
            { n: '03', t: 'Route', d: 'Channel, price and buyer' },
          ].map((s) => (
            <li key={s.n} className="rounded-lg border border-line bg-surface-2 p-3">
              <span className="readout text-micro text-ink-3">{s.n}</span>
              <p className="mt-1.5 text-sm font-medium text-ink">{s.t}</p>
              <p className="mt-0.5 text-xs leading-snug text-ink-3">{s.d}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </motion.div>
  );
}

function Pipeline({ stage }: { stage: number }) {
  return (
    <motion.div key="pipe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Panel className="lg:min-h-[calc(100vh-136px)]">
        <PanelHeader title="Analysis running" hint="On-device · no image leaves this browser" />

        <ol className="mt-5 space-y-1">
          {STAGES.map((s, i) => {
            const state = i < stage ? 'done' : i === stage ? 'active' : 'pending';
            return (
              <li key={s.key} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors">
                <span
                  className={clsx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                    state === 'done' && 'border-fresh/40 bg-fresh/15 text-fresh',
                    state === 'active' && 'border-fresh/60 text-fresh',
                    state === 'pending' && 'border-line text-ink-3',
                  )}
                >
                  {state === 'done' ? (
                    <Check size={11} strokeWidth={3} />
                  ) : state === 'active' ? (
                    <span className="h-1.5 w-1.5 animate-blink rounded-full bg-fresh" />
                  ) : (
                    <span className="h-1 w-1 rounded-full bg-current" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={clsx('text-sm transition-colors', state === 'pending' ? 'text-ink-3' : 'text-ink')}>
                    {s.label}
                  </p>
                  <p className="readout truncate text-xs text-ink-3">{s.detail}</p>
                </div>
                {state === 'active' && (
                  <div className="h-0.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full w-1/3 animate-sweep bg-fresh" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs text-ink-3">
          <Cpu size={12} />
          Grading runs on this device. No inference server, no per-scan API cost, works offline.
        </p>
      </Panel>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */

function ResultHeader({ analysis, produceType, weightKg }: { analysis: Analysis; produceType: ProduceType; weightKg: number }) {
  const { vision, shelf, route } = analysis;
  const spec = PRODUCE[produceType];
  const style = URGENCY_STYLE[route.urgency];

  return (
    <Panel>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <FreshnessDial score={vision.freshnessScore} size={168} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <GradeBadge grade={gradeOf(vision.freshnessScore)} />
            <UrgencyPill urgency={route.urgency} />
            <Badge tone="neutral">{Math.round(vision.confidence * 100)}% confidence</Badge>
          </div>

          <h2 className="mt-3 text-2xl font-semibold text-ink">
            {spec.emoji} {spec.label} · {weightKg} kg
          </h2>

          <div className="mt-3 flex items-baseline gap-2">
            <span className={clsx('readout text-3xl font-semibold', style.text)}>{shelf.days}</span>
            <span className="text-sm text-ink-2">days of shelf life remaining</span>
          </div>
          <div className="mt-2.5 max-w-sm">
            <ShelfLifeBar days={shelf.days} baseLifeDays={spec.baseLifeDays} size="lg" />
            <ShelfLifeScale baseLifeDays={spec.baseLifeDays} />
          </div>

          <p className="readout mt-3 text-xs text-ink-3">
            Graded in {vision.elapsedMs.toFixed(0)} ms · {Math.round(vision.coverage * 100)}% of frame identified as produce
          </p>
        </div>
      </div>
    </Panel>
  );
}

function SignalsPanel({ analysis }: { analysis: Analysis }) {
  const { vision } = analysis;
  return (
    <Panel>
      <PanelHeader title="What the model saw" hint="Four independent measurements, combined into the score" />

      <div className="mt-4 space-y-3">
        {vision.signals.map((s) => (
          <div key={s.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs text-ink-2">{s.label}</span>
              <span className="readout text-xs text-ink-3">{s.reading}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${s.score}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-full"
                  style={{
                    background: s.score > 70 ? 'var(--fresh)' : s.score > 45 ? 'var(--urgent)' : 'var(--critical)',
                  }}
                />
              </div>
              <span className="readout w-7 shrink-0 text-right text-xs text-ink">{s.score}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-3.5">
        <p className="label-micro mb-2.5">Defects detected</p>
        {vision.defects.length ? (
          <ul className="space-y-2">
            {vision.defects.map((d) => (
              <li key={d.label} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: d.severity > 0.5 ? 'var(--critical)' : 'var(--urgent)' }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink">{d.label}</p>
                  <p className="text-xs leading-relaxed text-ink-3">{d.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-fresh">
            <Check size={12} strokeWidth={2.5} /> No defects detected — surface is clean across all four signals.
          </p>
        )}
      </div>
    </Panel>
  );
}

function ShelfLifePanel({ analysis, produceType }: { analysis: Analysis; produceType: ProduceType }) {
  const { shelf, price } = analysis;
  const spec = PRODUCE[produceType];

  return (
    <Panel>
      <PanelHeader title="Shelf life breakdown" hint="Every day subtracted, and why" />

      <div className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-ink-2">Base life · {spec.label.toLowerCase()}</span>
          <span className="readout text-sm text-ink">{shelf.baseLifeDays.toFixed(1)} d</span>
        </div>
        {shelf.factors.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between">
            <span className="text-xs text-ink-3">{f.label}</span>
            <span className="readout text-sm text-critical">{f.days.toFixed(1)} d</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-2.5">
          <span className="text-sm font-medium text-ink">Remaining</span>
          <span className="readout text-lg font-semibold text-ink">{shelf.days.toFixed(1)} d</span>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3.5">
        <p className="label-micro mb-2">Price optimiser</p>
        <Readout label="Mandi rate" value={`${formatINR(price.mandiPricePerKg, true)}/kg`} />
        <Readout
          label={`Channel ×${price.channelMultiplier}`}
          value={`${formatINR(price.channelBasePerKg, true)}/kg`}
        />
        <Readout
          label="Urgency discount"
          value={`−${price.urgencyDiscountPct}%`}
          tone={price.urgencyDiscountPct > 0 ? 'urgent' : 'default'}
        />
        <Readout label="Demand premium" value={`+${price.demandPremiumPct}%`} tone="fresh" />
        <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-2.5">
          <span className="text-sm font-medium text-ink">Quoted rate</span>
          <span className="readout text-lg font-semibold text-fresh">{formatINR(price.pricePerKg, true)}/kg</span>
        </div>
      </div>
    </Panel>
  );
}

function RoutePanel({
  analysis,
  weightKg,
  saved,
  onConfirm,
  onRescan,
  onOpenRouting,
  spec,
}: {
  analysis: Analysis;
  weightKg: number;
  saved: Batch | null;
  onConfirm: () => void;
  onRescan: () => void;
  onOpenRouting: () => void;
  spec: (typeof PRODUCE)[ProduceType];
}) {
  const { route, recommendation, recommendationSource, facility, shelf } = analysis;
  const style = URGENCY_STYLE[route.urgency];

  return (
    <Panel className={clsx('border', route.urgency === 'CRITICAL' ? 'border-critical/30' : 'border-line')}>
      <PanelHeader
        title="Routing decision"
        hint="Produced by the routing engine — deterministic, not a model output"
        action={<UrgencyPill urgency={route.urgency} />}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-ink-3">Send to</span>
            <span className={clsx('text-xl font-semibold', style.text)}>{route.destinationLabel}</span>
            <ArrowRight size={14} className="text-ink-3" />
            <span className="truncate text-sm text-ink-2">{facility}</span>
          </div>

          <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-ink-2">{route.rationale}</p>

          <div className="mt-4 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <Readout label="Rate" value={`${formatINR(route.suggestedPricePerKg, true)}/kg`} />
            <Readout label="Lot value" value={formatINR(route.suggestedPricePerKg * weightKg)} />
            <Readout label="Act within" value={`${route.actionWindowHours}h`} tone={route.urgency === 'CRITICAL' ? 'critical' : 'default'} />
            <Readout label="Value saved" value={formatINR(route.valueRecovered)} tone="fresh" />
          </div>

          <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles size={11} className="text-fresh" />
              <span className="label-micro">Recommendation</span>
              <Badge tone="neutral" className="ml-auto">
                {recommendationSource === 'claude' ? 'Claude' : 'On-device'}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-ink">{recommendation}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col justify-between gap-3 lg:w-52">
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <p className="label-micro">Batch summary</p>
            <p className="mt-2 text-sm text-ink">
              {spec.emoji} {weightKg} kg {spec.label.toLowerCase()}
            </p>
            <p className="readout mt-1 text-xs text-ink-3">{formatDays(shelf.days)} · Grade {gradeOf(analysis.vision.freshnessScore)}</p>
          </div>

          {saved ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-fresh/30 bg-fresh/[0.07] px-3 py-2.5">
                <Check size={14} className="shrink-0 text-fresh" strokeWidth={2.6} />
                <p className="text-xs leading-snug text-ink">
                  <span className="readout">{saved.id}</span> routed. Buyer notified.
                </p>
              </div>
              <Button variant="secondary" className="w-full" onClick={onOpenRouting}>
                Open in routing
              </Button>
              <Button variant="ghost" size="sm" className="w-full" icon={<RotateCcw size={12} />} onClick={onRescan}>
                Scan another
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button variant="primary" size="lg" className="w-full" onClick={onConfirm}>
                Accept &amp; route batch
              </Button>
              <Button variant="ghost" size="sm" className="w-full" icon={<RotateCcw size={12} />} onClick={onRescan}>
                Discard and rescan
              </Button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
