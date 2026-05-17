export type ReferenceCoverage = "s35" | "full-frame" | "65mm" | null;

export interface ReferenceLookTargets {
  swirl: number;
  centerSharpness: number;
  edgeSoftness: number;
  contrast: number;
  flare: number;
  fieldCurvature: number;
  chromaticAberrationTolerance: number;
}

export interface ReferenceLensConstraints {
  preserveBackFocus: boolean;
  plFriendly: boolean;
  maxFrontDiameterMm: number | null;
  maxLengthMm: number | null;
}

export interface ReferenceLensIntent {
  referenceName: string | null;
  inferredDesignFamily: string | null;
  targetFocalLengthMm: number | null;
  targetFNumberOrTStop: number | null;
  targetCoverage: ReferenceCoverage;
  lookTargets: ReferenceLookTargets;
  constraints: ReferenceLensConstraints;
}

export interface LensSurfacePrescription {
  type: string;
  R: number;
  t: number;
  ap: number;
  ap_optical?: number;
  glass: string;
  stop?: boolean;
  surfaceLabel: string;
  surfaceLabelAuto: boolean;
}

export interface LensBuilderJson {
  name: string;
  notes: string[];
  surfaces: LensSurfacePrescription[];
  sourceType?: "ai_reference_generated";
  referenceName?: string;
  designFamily?: string;
  accuracyLabel?: string;
  referenceIntent?: ReferenceLensIntent;
}

export interface ReferenceAnalysis {
  valid: boolean;
  eflMm?: number | null;
  tStop?: number | null;
  imageCircleMm?: number | null;
  cov?: boolean | null;
  centerRmsMm?: number | null;
  cornerRmsMm?: number | null;
  fieldCurvatureDeltaMm?: number | null;
  rearClearanceMm?: number | null;
  compactLengthMm?: number | null;
}

export interface ReferenceScoreResult {
  lensJson: LensBuilderJson;
  analysis: ReferenceAnalysis;
  score: number;
  warnings: string[];
  explanation: string;
}

const LOOK_DEFAULTS: ReferenceLookTargets = {
  swirl: 0,
  centerSharpness: 6,
  edgeSoftness: 4,
  contrast: 5,
  flare: 3,
  fieldCurvature: 3,
  chromaticAberrationTolerance: 4,
};

function clampLookScore(value: number | null | undefined): number {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function mergeLookTargets(overrides: Partial<ReferenceLookTargets> = {}): ReferenceLookTargets {
  return {
    swirl: clampLookScore(overrides.swirl ?? LOOK_DEFAULTS.swirl),
    centerSharpness: clampLookScore(overrides.centerSharpness ?? LOOK_DEFAULTS.centerSharpness),
    edgeSoftness: clampLookScore(overrides.edgeSoftness ?? LOOK_DEFAULTS.edgeSoftness),
    contrast: clampLookScore(overrides.contrast ?? LOOK_DEFAULTS.contrast),
    flare: clampLookScore(overrides.flare ?? LOOK_DEFAULTS.flare),
    fieldCurvature: clampLookScore(overrides.fieldCurvature ?? LOOK_DEFAULTS.fieldCurvature),
    chromaticAberrationTolerance: clampLookScore(
      overrides.chromaticAberrationTolerance ?? LOOK_DEFAULTS.chromaticAberrationTolerance,
    ),
  };
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function parseReferenceLensIntent(promptRaw: string): ReferenceLensIntent {
  const prompt = promptRaw.trim();
  const lower = prompt.toLowerCase();
  let referenceName: string | null = null;
  let inferredDesignFamily: string | null = null;
  let targetFocalLengthMm = parseNumber(lower.match(/(\d+(?:[.,]\d+)?)\s*mm/)?.[1]);
  let targetFNumberOrTStop = parseNumber(lower.match(/(?:f\/|f\s*|t\s*)(\d+(?:[.,]\d+)?)/)?.[1]);
  let targetCoverage: ReferenceCoverage = null;
  let lookTargets = mergeLookTargets();
  const constraints: ReferenceLensConstraints = {
    preserveBackFocus: /preserve back|keep back|same back|bfl/i.test(prompt),
    plFriendly: /\bpl\b|pl-friendly|pl friendly|positive lock/i.test(prompt),
    maxFrontDiameterMm: parseNumber(lower.match(/front(?:\s+diameter)?(?:\s*<=|\s*under|\s*max)?\s*(\d+(?:[.,]\d+)?)\s*mm/)?.[1]),
    maxLengthMm: parseNumber(lower.match(/(?:length|long)(?:\s*<=|\s*under|\s*max)?\s*(\d+(?:[.,]\d+)?)\s*mm/)?.[1]),
  };

  if (/65mm|large format|\b65\b/.test(lower)) targetCoverage = "65mm";
  else if (/full[-\s]?frame|\bff\b|vista/.test(lower)) targetCoverage = "full-frame";
  else if (/s35|super\s*35|super35/.test(lower)) targetCoverage = "s35";

  if (/helios\s*44(?:-?2)?/.test(lower)) {
    referenceName = "Helios 44-2";
    inferredDesignFamily = "Biotar / Double Gauss inspired";
    targetFocalLengthMm ??= 58;
    targetFNumberOrTStop ??= 2;
    lookTargets = mergeLookTargets({
      swirl: 9,
      centerSharpness: 6,
      edgeSoftness: 8,
      contrast: 4,
      flare: 6,
      fieldCurvature: 8,
      chromaticAberrationTolerance: 6,
    });
  } else if (/biotar/.test(lower)) {
    referenceName = "Biotar 58mm f/2";
    inferredDesignFamily = "Double Gauss / Biotar";
    targetFocalLengthMm ??= 58;
    targetFNumberOrTStop ??= 2;
    lookTargets = mergeLookTargets({
      swirl: /swirl|swirly|stronger/.test(lower) ? 8 : 6,
      centerSharpness: 7,
      edgeSoftness: 7,
      contrast: 5,
      flare: 5,
      fieldCurvature: 7,
      chromaticAberrationTolerance: 5,
    });
  } else if (/cooke|panchro/.test(lower)) {
    referenceName = "Cooke Panchro";
    inferredDesignFamily = "classic Panchro-inspired";
    targetFocalLengthMm ??= 50;
    targetFNumberOrTStop ??= 2;
    lookTargets = mergeLookTargets({
      swirl: 2,
      centerSharpness: 7,
      edgeSoftness: 5,
      contrast: 4,
      flare: 5,
      fieldCurvature: 4,
      chromaticAberrationTolerance: 5,
    });
  } else if (/petzval/.test(lower)) {
    referenceName = "Petzval";
    inferredDesignFamily = "Petzval portrait family";
    targetFocalLengthMm ??= 80;
    targetFNumberOrTStop ??= 2;
    lookTargets = mergeLookTargets({
      swirl: 10,
      centerSharpness: 5,
      edgeSoftness: 9,
      contrast: 4,
      flare: 6,
      fieldCurvature: 10,
      chromaticAberrationTolerance: 7,
    });
  } else if (/double\s*gauss|gauss/.test(lower)) {
    referenceName = "Double Gauss";
    inferredDesignFamily = "Double Gauss";
    targetFocalLengthMm ??= 50;
    targetFNumberOrTStop ??= 2;
    lookTargets = mergeLookTargets({ centerSharpness: 7, edgeSoftness: 5, fieldCurvature: 4 });
  }

  if (/swirl|swirly/.test(lower)) lookTargets.swirl = Math.max(lookTargets.swirl, /strong|more|extra/.test(lower) ? 9 : 7);
  if (/usable center|sharp center|clean center/.test(lower)) lookTargets.centerSharpness = Math.max(lookTargets.centerSharpness, 7);
  if (/soft edge|soft edges|edge softness/.test(lower)) lookTargets.edgeSoftness = Math.max(lookTargets.edgeSoftness, 7);
  if (/low contrast|lower contrast|vintage contrast/.test(lower)) lookTargets.contrast = Math.min(lookTargets.contrast, 4);
  if (/flare|flary/.test(lower)) lookTargets.flare = Math.max(lookTargets.flare, 6);
  if (/field curvature|curved field/.test(lower)) lookTargets.fieldCurvature = Math.max(lookTargets.fieldCurvature, 7);

  return { referenceName, inferredDesignFamily, targetFocalLengthMm, targetFNumberOrTStop, targetCoverage, lookTargets, constraints };
}

function addMetadata(lens: LensBuilderJson, intent: ReferenceLensIntent, family: string, referenceName: string): LensBuilderJson {
  return {
    ...lens,
    sourceType: "ai_reference_generated",
    referenceName,
    designFamily: family,
    accuracyLabel: "inspired, not exact clone",
    referenceIntent: intent,
    notes: [
      ...lens.notes,
      `${referenceName}: inspired, not exact clone.`,
      "Generated from a controlled design-family starter. Future optimizer actions should tune this prescription through LensBuilder's raytrace/scoring tools, not by arbitrary JSON mutation.",
    ],
  };
}

function imsSurface(ap = 12.77): LensSurfacePrescription {
  return { type: "IMS", R: 0, t: 0, ap, glass: "AIR", stop: false, surfaceLabel: "IMS", surfaceLabelAuto: false };
}

export function createDoubleGaussStarter(intent: ReferenceLensIntent = parseReferenceLensIntent("Double Gauss")): LensBuilderJson {
  const target = intent.targetFocalLengthMm ?? 50;
  const speed = intent.targetFNumberOrTStop ?? 2;
  return addMetadata({
    name: `${target}mm f/${speed} Double Gauss reference starter`,
    notes: ["Symmetric Double Gauss starter for local LensBuilder validation and optimization."],
    surfaces: [
      { type: "OBJ", R: 0, t: 0, ap: 70, glass: "AIR", stop: false, surfaceLabel: "OBJ", surfaceLabelAuto: false },
      { type: "1", R: 46, t: 5.2, ap: 21, glass: "N-LAK9", stop: false, surfaceLabel: "L1 FRONT", surfaceLabelAuto: false },
      { type: "2", R: 210, t: 1.3, ap: 21, glass: "AIR", stop: false, surfaceLabel: "L1 REAR", surfaceLabelAuto: false },
      { type: "3", R: 32, t: 3.0, ap: 18, glass: "N-F2", stop: false, surfaceLabel: "L2 FRONT", surfaceLabelAuto: false },
      { type: "4", R: 18, t: 6.0, ap: 18, glass: "N-BAK4", stop: false, surfaceLabel: "L2/L3 CEMENT", surfaceLabelAuto: false },
      { type: "5", R: 72, t: 5.5, ap: 16, glass: "AIR", stop: false, surfaceLabel: "L3 REAR", surfaceLabelAuto: false },
      { type: "STOP", R: 0, t: 7.0, ap: Math.max(8, target / (2 * speed)), glass: "AIR", stop: true, surfaceLabel: "STOP", surfaceLabelAuto: false },
      { type: "7", R: -72, t: 3.1, ap: 16, glass: "N-F2", stop: false, surfaceLabel: "L4 FRONT", surfaceLabelAuto: false },
      { type: "8", R: -18, t: 6.0, ap: 18, glass: "N-BAK4", stop: false, surfaceLabel: "L4/L5 CEMENT", surfaceLabelAuto: false },
      { type: "9", R: -32, t: 1.3, ap: 18, glass: "AIR", stop: false, surfaceLabel: "L5 REAR", surfaceLabelAuto: false },
      { type: "10", R: -210, t: 5.2, ap: 21, glass: "N-LAK9", stop: false, surfaceLabel: "L6 FRONT", surfaceLabelAuto: false },
      { type: "11", R: -46, t: 38, ap: 21, glass: "AIR", stop: false, surfaceLabel: "L6 REAR", surfaceLabelAuto: false },
      imsSurface(),
    ],
  }, intent, intent.inferredDesignFamily ?? "Double Gauss", intent.referenceName ?? "Double Gauss");
}

export function createBiotarInspiredStarter(intent: ReferenceLensIntent = parseReferenceLensIntent("Helios 44-2")): LensBuilderJson {
  const target = intent.targetFocalLengthMm ?? 58;
  const speed = intent.targetFNumberOrTStop ?? 2;
  return addMetadata({
    name: `${target}mm f/${speed} Biotar-inspired reference starter`,
    notes: ["6-element / 4-group Biotar-style starting point for local LensBuilder optimization."],
    surfaces: [
      { type: "OBJ", R: 0, t: 0, ap: 70, glass: "AIR", stop: false, surfaceLabel: "OBJ", surfaceLabelAuto: false },
      { type: "1", R: 42, t: 4.2, ap: 21, glass: "N-BK7HT", stop: false, surfaceLabel: "L1 FRONT", surfaceLabelAuto: false },
      { type: "2", R: 145, t: 1.0, ap: 21, glass: "AIR", stop: false, surfaceLabel: "L1 REAR", surfaceLabelAuto: false },
      { type: "3", R: 30, t: 3.2, ap: 19, glass: "N-F2", stop: false, surfaceLabel: "L2 FRONT", surfaceLabelAuto: false },
      { type: "4", R: 17, t: 5.6, ap: 18, glass: "N-BAK4", stop: false, surfaceLabel: "L2/L3 CEMENT", surfaceLabelAuto: false },
      { type: "5", R: 64, t: 5.0, ap: 16, glass: "AIR", stop: false, surfaceLabel: "L3 REAR", surfaceLabelAuto: false },
      { type: "STOP", R: 0, t: 7.0, ap: Math.max(8, target / (2 * speed)), glass: "AIR", stop: true, surfaceLabel: "STOP", surfaceLabelAuto: false },
      { type: "7", R: -64, t: 3.4, ap: 16, glass: "N-F2", stop: false, surfaceLabel: "L4 FRONT", surfaceLabelAuto: false },
      { type: "8", R: -17, t: 5.4, ap: 18, glass: "N-BAK4", stop: false, surfaceLabel: "L4/L5 CEMENT", surfaceLabelAuto: false },
      { type: "9", R: -30, t: 1.0, ap: 19, glass: "AIR", stop: false, surfaceLabel: "L5 REAR", surfaceLabelAuto: false },
      { type: "10", R: -145, t: 4.4, ap: 21, glass: "N-BK7HT", stop: false, surfaceLabel: "L6 FRONT", surfaceLabelAuto: false },
      { type: "11", R: -42, t: 39, ap: 21, glass: "AIR", stop: false, surfaceLabel: "L6 REAR", surfaceLabelAuto: false },
      imsSurface(),
    ],
  }, intent, "Biotar / Double Gauss inspired", intent.referenceName ?? "Helios 44-2");
}

export function createPetzvalStarter(intent: ReferenceLensIntent = parseReferenceLensIntent("Petzval")): LensBuilderJson {
  const target = intent.targetFocalLengthMm ?? 80;
  const speed = intent.targetFNumberOrTStop ?? 2;
  return addMetadata({
    name: `${target}mm f/${speed} Petzval reference starter`,
    notes: ["Petzval portrait-family starter with intentionally curved field and outer falloff."],
    surfaces: [
      { type: "OBJ", R: 0, t: 0, ap: 80, glass: "AIR", stop: false, surfaceLabel: "OBJ", surfaceLabelAuto: false },
      { type: "1", R: 82, t: 6.0, ap: 28, glass: "N-BK7HT", stop: false, surfaceLabel: "FRONT CROWN FRONT", surfaceLabelAuto: false },
      { type: "2", R: -58, t: 2.2, ap: 27, glass: "N-F2", stop: false, surfaceLabel: "FRONT CEMENT", surfaceLabelAuto: false },
      { type: "3", R: -165, t: 30, ap: 25, glass: "AIR", stop: false, surfaceLabel: "FRONT GROUP REAR", surfaceLabelAuto: false },
      { type: "STOP", R: 0, t: 7.0, ap: Math.max(10, target / (2 * speed)), glass: "AIR", stop: true, surfaceLabel: "STOP", surfaceLabelAuto: false },
      { type: "5", R: 72, t: 4.0, ap: 22, glass: "N-BK7HT", stop: false, surfaceLabel: "REAR CROWN FRONT", surfaceLabelAuto: false },
      { type: "6", R: -48, t: 3.0, ap: 20, glass: "AIR", stop: false, surfaceLabel: "REAR CROWN REAR", surfaceLabelAuto: false },
      { type: "7", R: -78, t: 3.0, ap: 18, glass: "N-F2", stop: false, surfaceLabel: "REAR FLINT FRONT", surfaceLabelAuto: false },
      { type: "8", R: -240, t: 48, ap: 18, glass: "AIR", stop: false, surfaceLabel: "REAR FLINT REAR", surfaceLabelAuto: false },
      imsSurface(),
    ],
  }, intent, "Petzval portrait family", intent.referenceName ?? "Petzval");
}

export function createReferenceStarterLens(intent: ReferenceLensIntent): LensBuilderJson {
  const family = (intent.inferredDesignFamily ?? "").toLowerCase();
  const reference = (intent.referenceName ?? "").toLowerCase();
  if (reference.includes("helios") || family.includes("biotar")) return createBiotarInspiredStarter(intent);
  if (reference.includes("petzval") || family.includes("petzval")) return createPetzvalStarter(intent);
  return createDoubleGaussStarter(intent);
}

function targetCoverageMm(intent: ReferenceLensIntent): number | null {
  if (intent.targetCoverage === "65mm") return 60;
  if (intent.targetCoverage === "full-frame") return 45;
  if (intent.targetCoverage === "s35") return 31;
  return null;
}

function penaltyFromRelativeError(actual: number | null | undefined, target: number | null, scale: number): number {
  const measured = Number(actual);
  if (!target || !Number.isFinite(measured)) return 0;
  return Math.min(scale, (Math.abs(measured - target) / target) * scale * 5);
}

export function scoreReferenceMatch(
  lensJson: LensBuilderJson,
  intent: ReferenceLensIntent,
  analysis: ReferenceAnalysis,
): ReferenceScoreResult {
  const warnings: string[] = [];
  const explanation: string[] = [];
  let score = analysis.valid ? 100 : 0;

  if (!analysis.valid) {
    warnings.push("Generated starter is invalid according to the LensBuilder raytrace/validation layer.");
    return { lensJson, analysis, score, warnings, explanation: warnings[0] };
  }

  const flPenalty = penaltyFromRelativeError(analysis.eflMm, intent.targetFocalLengthMm, 25);
  const speedPenalty = penaltyFromRelativeError(analysis.tStop, intent.targetFNumberOrTStop, 20);
  score -= flPenalty + speedPenalty;

  const coverage = targetCoverageMm(intent);
  const imageCircle = Number(analysis.imageCircleMm);
  if (coverage && Number.isFinite(imageCircle)) {
    const shortfall = Math.max(0, coverage - imageCircle) / coverage;
    const coveragePenalty = shortfall * 25 + (analysis.cov === false ? 8 : 0);
    score -= coveragePenalty;
    if (shortfall > 0) warnings.push(`Coverage shortfall: target ${coverage}mm, got ${imageCircle.toFixed(1)}mm.`);
  }

  const centerRms = Number(analysis.centerRmsMm);
  const cornerRms = Number(analysis.cornerRmsMm);
  if (Number.isFinite(centerRms) && centerRms > 0.20) {
    score -= 12;
    warnings.push("Center RMS is high for a usable starter.");
  }

  if (intent.lookTargets.edgeSoftness >= 7 && Number.isFinite(centerRms) && Number.isFinite(cornerRms)) {
    const ratio = cornerRms / Math.max(0.001, centerRms);
    if (ratio < 1.4) score -= 8;
    explanation.push(`Outer-field RMS ratio ${ratio.toFixed(2)}x is used as a soft edge-rendering proxy.`);
  }

  const fieldCurvatureDelta = Number(analysis.fieldCurvatureDeltaMm);
  if (intent.lookTargets.fieldCurvature >= 7 && Number.isFinite(fieldCurvatureDelta)) {
    const delta = Math.abs(fieldCurvatureDelta);
    if (delta < 0.4) score -= 6;
    explanation.push(`Field curvature proxy ${delta.toFixed(3)}mm is used as a swirl/curved-field proxy.`);
  }

  const rearClearance = Number(analysis.rearClearanceMm);
  if (intent.constraints.plFriendly && Number.isFinite(rearClearance) && rearClearance < 0) {
    score -= 14;
    warnings.push("PL-friendly back focus was requested, but rear clearance is negative.");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    lensJson,
    analysis,
    score,
    warnings,
    explanation: explanation.join(" "),
  };
}
