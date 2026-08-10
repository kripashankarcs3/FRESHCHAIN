/**
 * Grading orchestrator.
 *
 * Two engines can grade a batch:
 *
 *   1. `trained-model` — the PyTorch checkpoint served by the backend at
 *      POST /vision/analyse. Higher accuracy, needs the server up.
 *   2. `on-device`     — the pixel pipeline in vision.ts. Lower ceiling, but
 *      instant, free, offline and can never be unavailable.
 *
 * We always try the model first and fall back silently. That ordering is what
 * lets the demo claim a trained model honestly while remaining immune to venue
 * wifi: if the server does not answer inside the timeout, the operator sees a
 * grade anyway and the UI says which engine produced it.
 *
 * Crucially the *shape* returned is identical either way, so nothing
 * downstream — shelf life, routing, pricing, the store — knows or cares which
 * engine ran.
 */

import { analyseImage, type VisionResult } from './vision';
import { predictFreshness, type ModelPrediction } from './api';
import type { ProduceType } from './produce';

export type VisionEngine = 'trained-model' | 'on-device';

export interface GradedResult extends VisionResult {
  engine: VisionEngine;
  /** Winning class from the trained model, absent for on-device grading. */
  modelLabel?: string;
  modelVersion?: string;
  /** Class distribution, for the "what the model saw" panel. */
  probabilities?: Record<string, number>;
}

/**
 * Grades a batch, preferring the trained model.
 *
 * `file` goes to the server; `image` is the already-decoded element the
 * on-device pipeline samples. We need both because the two engines consume
 * different representations of the same photo.
 */
export async function gradeBatch(
  file: File,
  image: HTMLImageElement,
  produceType: ProduceType,
): Promise<GradedResult> {
  const model = await predictFreshness(file, produceType).catch(() => null);

  if (model && Number.isFinite(model.freshness_score)) {
    // Run the local pipeline too — cheap (~50 ms) and it supplies the four
    // measured signals the results panel renders. The model owns the score;
    // the local pass only explains the surface it was scored on.
    const local = await analyseImage(image, produceType).catch(() => null);
    return fromModel(model, local);
  }

  const local = await analyseImage(image, produceType);
  return { ...local, engine: 'on-device' };
}

function fromModel(model: ModelPrediction, local: VisionResult | null): GradedResult {
  const modelDefects = (model.defects ?? []).map((d) => ({
    label: d.label,
    severity: d.severity,
    detail: d.detail,
  }));

  return {
    freshnessScore: Math.round(model.freshness_score),
    confidence: model.confidence,
    // Model-reported defects lead; measured surface findings follow, so the
    // operator sees the classifier's verdict and the evidence behind it.
    defects: [...modelDefects, ...(local?.defects ?? [])],
    signals: local?.signals ?? [],
    coverage: local?.coverage ?? 0,
    dominantHue: local?.dominantHue ?? 0,
    elapsedMs: model.elapsed_ms ?? local?.elapsedMs ?? 0,
    engine: 'trained-model',
    modelLabel: model.label,
    modelVersion: model.model_version,
    probabilities: model.probabilities,
  };
}
