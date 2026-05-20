/* Flare Ghost Tracer
   Simplified double-reflection ghost raytracer for Flare Lab.
   This is not a full non-sequential stray-light solver: it traces a small
   meridional ray bundle through the current lens prescription, reflects at
   selected surface pairs, and reports where those ghost bundles hit IMS. */
(() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const EPS = 1e-6;
  const AIR_NAMES = new Set(["", "AIR", "VACUUM", "OBJECT", "OBJ"]);
  const GLASS_ND = new Map(Object.entries({
    "N-BK7": 1.5168,
    "N-BK7HT": 1.5168,
    BK7: 1.5168,
    K9: 1.5168,
    "N-BAK4": 1.5688,
    BAK4: 1.5688,
    "N-SK16": 1.6204,
    SK16: 1.6204,
    "N-F2": 1.6200,
    F2: 1.6200,
    "N-SF2": 1.6477,
    SF2: 1.6477,
    "N-SF5": 1.6727,
    SF5: 1.6727,
    "N-SF11": 1.7847,
    SF11: 1.7847,
    "N-LASF31A": 1.8830,
    "FUSED SILICA": 1.4585,
    UVFS: 1.4585,
    SILICA: 1.4585,
    "CAF2": 1.4338,
  }));

  function finite(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function mediumName(value) {
    return String(value || "AIR").trim().toUpperCase();
  }

  function isAir(value) {
    return AIR_NAMES.has(mediumName(value));
  }

  function resolveIndex(surface, medium) {
    if (isAir(medium)) return 1;
    const explicit = finite(surface?.nd ?? surface?.glass_nd, null);
    if (explicit && explicit > 1) return explicit;
    const name = mediumName(medium)
      .replace(/^SCHOTT\s+/, "")
      .replace(/^OHARA\s+/, "")
      .replace(/\s+/g, " ");
    if (GLASS_ND.has(name)) return GLASS_ND.get(name);
    return 1.5168;
  }

  function vAdd(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function vScale(a, s) {
    return { x: a.x * s, y: a.y * s };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function normalize(v) {
    const len = Math.hypot(v.x, v.y);
    if (!Number.isFinite(len) || len < EPS) return { x: 1, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  function reflectDir(dir, normal) {
    const n = normalize(normal);
    const d = dot(dir, n);
    return normalize({ x: dir.x - 2 * d * n.x, y: dir.y - 2 * d * n.y });
  }

  function refractDir(dir, normal, n1, n2) {
    let n = normalize(normal);
    let cosi = clamp(dot(dir, n), -1, 1);
    if (cosi > 0) {
      n = { x: -n.x, y: -n.y };
      cosi = -cosi;
    }
    const eta = n1 / Math.max(EPS, n2);
    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;
    return normalize({
      x: eta * dir.x + (eta * -cosi - Math.sqrt(k)) * n.x,
      y: eta * dir.y + (eta * -cosi - Math.sqrt(k)) * n.y,
    });
  }

  function intersectSurface(ray, surface) {
    const R = finite(surface.R, 0);
    if (!Number.isFinite(R) || Math.abs(R) < EPS) {
      const denom = ray.dir.x;
      if (Math.abs(denom) < EPS) return null;
      const t = (surface.vx - ray.origin.x) / denom;
      if (!Number.isFinite(t) || t <= EPS) return null;
      const point = vAdd(ray.origin, vScale(ray.dir, t));
      return { point, distance: t, normal: { x: 1, y: 0 } };
    }

    const center = { x: surface.vx + R, y: 0 };
    const ox = ray.origin.x - center.x;
    const oy = ray.origin.y - center.y;
    const b = 2 * (ray.dir.x * ox + ray.dir.y * oy);
    const c = ox * ox + oy * oy - R * R;
    const disc = b * b - 4 * c;
    if (!Number.isFinite(disc) || disc < 0) return null;
    const root = Math.sqrt(disc);
    const t1 = (-b - root) / 2;
    const t2 = (-b + root) / 2;
    let t = Infinity;
    if (t1 > EPS) t = t1;
    if (t2 > EPS && t2 < t) t = t2;
    if (!Number.isFinite(t)) return null;
    const point = vAdd(ray.origin, vScale(ray.dir, t));
    const normal = normalize({ x: point.x - center.x, y: point.y - center.y });
    return { point, distance: t, normal };
  }

  function apertureFor(surface, options) {
    const ap = finite(surface.ap_optical ?? surface.ap, 0);
    const scale = surface.isStop ? finite(options.stopScale, 1) : 1;
    return Math.max(0, ap * scale);
  }

  function isInsideAperture(hit, surface, options) {
    const ap = apertureFor(surface, options);
    if (!Number.isFinite(ap) || ap <= 0) return false;
    return Math.abs(hit.point.y) <= ap + 1e-5;
  }

  function nBefore(surface, direction) {
    return direction === "forward" ? surface.nBefore : surface.nAfter;
  }

  function nAfter(surface, direction) {
    return direction === "forward" ? surface.nAfter : surface.nBefore;
  }

  function transmit(ray, surface, direction, options) {
    const hit = intersectSurface(ray, surface);
    if (!hit || !isInsideAperture(hit, surface, options)) {
      return { ray: null, reason: "clipped" };
    }
    const n1 = nBefore(surface, direction);
    const n2 = nAfter(surface, direction);
    let nextDir = ray.dir;
    if (Math.abs(n1 - n2) > 1e-5) {
      nextDir = refractDir(ray.dir, hit.normal, n1, n2);
      if (!nextDir) return { ray: null, reason: "tir" };
    }
    return {
      ray: {
        origin: vAdd(hit.point, vScale(nextDir, EPS * 20)),
        dir: nextDir,
      },
      reason: "ok",
      hit,
    };
  }

  function reflectAt(ray, surface, options) {
    const hit = intersectSurface(ray, surface);
    if (!hit || !isInsideAperture(hit, surface, options)) {
      return { ray: null, reason: "clipped" };
    }
    const dir = reflectDir(ray.dir, hit.normal);
    return {
      ray: {
        origin: vAdd(hit.point, vScale(dir, EPS * 20)),
        dir,
      },
      reason: "ok",
      hit,
    };
  }

  function intersectSensor(ray, sensorX) {
    const denom = ray.dir.x;
    if (Math.abs(denom) < EPS) return null;
    const t = (sensorX - ray.origin.x) / denom;
    if (!Number.isFinite(t) || t <= EPS) return null;
    return vAdd(ray.origin, vScale(ray.dir, t));
  }

  function sampleOffsets(count) {
    const n = Math.max(5, Math.round(count) || 31);
    const samples = [];
    if (n === 1) return [0];
    for (let i = 0; i < n; i++) {
      const u = -1 + (2 * i) / (n - 1);
      samples.push(Math.sin(u * Math.PI * 0.5));
    }
    return samples;
  }

  function buildFallbackSurfaces() {
    return [
      { index: 0, type: "OBJ", R: 0, t: 0, ap: 80, glass: "AIR" },
      { index: 1, type: "FRONT", R: 72, t: 6, ap: 24, glass: "N-BK7" },
      { index: 2, type: "REAR", R: -118, t: 8, ap: 24, glass: "AIR" },
      { index: 3, type: "STOP", R: 0, t: 7, ap: 12, glass: "AIR", stop: true },
      { index: 4, type: "FRONT", R: -96, t: 4, ap: 21, glass: "N-F2" },
      { index: 5, type: "REAR", R: 180, t: 34, ap: 21, glass: "AIR" },
      { index: 6, type: "IMS", R: 0, t: 0, ap: 22, glass: "AIR" },
    ];
  }

  function buildLensModel(lensInfo) {
    const rawInput = Array.isArray(lensInfo?.surfaces) && lensInfo.surfaces.length >= 3
      ? lensInfo.surfaces
      : buildFallbackSurfaces();
    const fallback = !(Array.isArray(lensInfo?.surfaces) && lensInfo.surfaces.length >= 3);
    const raw = rawInput.map((surface, index) => ({
      ...surface,
      index: finite(surface?.index, index),
      R: finite(surface?.R, 0),
      t: Math.max(0, finite(surface?.t, 0) || 0),
      ap: Math.max(0, finite(surface?.ap_optical ?? surface?.ap, 0) || 0),
      ap_optical: Math.max(0, finite(surface?.ap_optical ?? surface?.ap, 0) || 0),
      glass: surface?.glass || "AIR",
      type: String(surface?.type || ""),
      label: String(surface?.surfaceLabel || surface?.label || surface?.type || `S${index}`),
      stop: !!surface?.stop,
    }));

    let vx = 0;
    raw.forEach((surface, index) => {
      surface.vx = vx;
      if (index < raw.length - 1) vx += Math.max(0, finite(surface.t, 0) || 0);
    });

    const ims = raw.find((s) => String(s.type).toUpperCase() === "IMS") || raw[raw.length - 1];
    const sensorX = finite(ims?.vx, vx);
    let previousMedium = "AIR";
    let previousSurface = null;
    const surfaces = [];
    raw.forEach((surface) => {
      const type = String(surface.type || "").toUpperCase();
      const n0 = resolveIndex(previousSurface || surface, previousMedium);
      const n1 = resolveIndex(surface, surface.glass);
      if (type !== "OBJ" && type !== "IMS") {
        surfaces.push({
          index: surface.index,
          rawIndex: surface.index,
          label: surface.label,
          type,
          vx: finite(surface.vx, 0),
          R: finite(surface.R, 0),
          ap: finite(surface.ap, 0),
          ap_optical: finite(surface.ap_optical, finite(surface.ap, 0)),
          glassBefore: previousMedium,
          glassAfter: surface.glass,
          nBefore: n0,
          nAfter: n1,
          isStop: !!surface.stop || type === "STOP",
          refractive: Math.abs(n0 - n1) > 1e-5,
        });
      }
      previousMedium = surface.glass || "AIR";
      previousSurface = surface;
    });

    const stop = surfaces.find((s) => s.isStop) || surfaces[Math.floor(surfaces.length / 2)] || null;
    return {
      fallback,
      surfaces,
      sensorX,
      stop,
      efl: finite(lensInfo?.efl, 50) || 50,
      sensorWidthMm: finite(lensInfo?.sensorWidthMm, 36) || 36,
      sensorHeightMm: finite(lensInfo?.sensorHeightMm, 24) || 24,
      lensName: String(lensInfo?.lensName || ""),
      airGlassSurfaceCount: finite(lensInfo?.airGlassSurfaceCount, surfaces.filter((s) => s.refractive).length),
      estimatedGroups: finite(lensInfo?.estimatedGroups, 4),
      currentTStop: finite(lensInfo?.currentTStop, 2),
    };
  }

  function surfaceReflectance(surface, vintageFactor) {
    if (!surface.refractive) return 0;
    const raw = Math.pow((surface.nBefore - surface.nAfter) / Math.max(EPS, surface.nBefore + surface.nAfter), 2);
    const modernCap = 0.0065;
    const vintageCap = clamp(0.018 * vintageFactor, 0.010, 0.042);
    const cap = vintageFactor > 1.05 ? vintageCap : modernCap;
    return clamp(Math.min(raw, cap), 0, 0.05);
  }

  function profileVintageFactor(model) {
    return /(omit|vintage|uncoated|tuned|soviet|helios|biotar|petzval|panchro|swirl|old)/i.test(model.lensName)
      ? 1.8
      : 1.0;
  }

  function generateCandidates(model, maxPairs) {
    const vintageFactor = profileVintageFactor(model);
    const reflective = model.surfaces
      .filter((s) => s.refractive && !s.isStop && apertureFor(s, { stopScale: 1 }) > 0)
      .map((surface) => ({
        surface,
        reflectance: surfaceReflectance(surface, vintageFactor),
      }))
      .filter((item) => item.reflectance > 1e-5);
    const pairs = [];
    for (let a = 0; a < reflective.length; a++) {
      for (let b = a + 1; b < reflective.length; b++) {
        const i = model.surfaces.indexOf(reflective[a].surface);
        const j = model.surfaces.indexOf(reflective[b].surface);
        if (i < 0 || j < 0 || j <= i) continue;
        const spacing = Math.abs(reflective[b].surface.vx - reflective[a].surface.vx);
        const spacingWeight = clamp(0.55 + spacing / 80, 0.55, 1.25);
        const transmission = Math.pow(0.985, Math.max(0, j - i - 1));
        const pairStrength = reflective[a].reflectance * reflective[b].reflectance * transmission * spacingWeight;
        pairs.push({
          i,
          j,
          surfaceI: reflective[a].surface,
          surfaceJ: reflective[b].surface,
          pairStrength,
          reflectanceI: reflective[a].reflectance,
          reflectanceJ: reflective[b].reflectance,
          label: `S${reflective[a].surface.rawIndex}-S${reflective[b].surface.rawIndex}`,
        });
      }
    }
    pairs.sort((a, b) => b.pairStrength - a.pairStrength);
    return pairs.slice(0, clamp(Math.round(maxPairs) || 12, 4, 18));
  }

  function fieldAngleFromLamp(model, opts) {
    const efl = Math.max(1, Math.abs(finite(model.efl, 50) || 50));
    const sensorW = Math.max(1, finite(model.sensorWidthMm, 36) || 36);
    const sensorH = Math.max(1, finite(model.sensorHeightMm, 24) || 24);
    const fovX = 2 * Math.atan(sensorW / (2 * efl));
    const fovY = 2 * Math.atan(sensorH / (2 * efl));
    const nx = finite(opts.frameNormX, finite(opts.lampXNorm, 0)) || 0;
    const ny = finite(opts.frameNormY, finite(opts.lampYNorm, 0)) || 0;
    const overscan = 1.25;
    const ax = Math.tan(nx * fovX * 0.5 * overscan);
    const ay = Math.tan(ny * fovY * 0.5 * overscan);
    const slope = Math.hypot(ax, ay);
    return Math.atan(slope);
  }

  function traceCandidate(model, candidate, opts) {
    const raysPerPair = clamp(Math.round(opts.raysPerPair) || 37, 9, 81);
    const selectedT = Math.max(0.7, finite(opts.selectedT, model.currentTStop) || model.currentTStop || 2);
    const wideOpenT = Math.max(0.7, finite(opts.wideOpenT, model.currentTStop) || model.currentTStop || 2);
    const stopScale = clamp(wideOpenT / selectedT, 0.035, 1);
    const first = model.surfaces[0];
    const stop = model.stop || first;
    const stopRadius = Math.max(0.3, apertureFor(stop, { stopScale }) || 8);
    const firstX = first ? first.vx : 0;
    const distanceMm = Math.max(100, finite(opts.distanceMm, 3000) || 3000);
    const fieldAngle = fieldAngleFromLamp(model, opts);
    const source = {
      x: firstX - distanceMm,
      y: Math.tan(fieldAngle) * distanceMm,
    };
    const offsets = sampleOffsets(raysPerPair);
    const hits = [];
    let clipped = 0;
    let failed = 0;

    for (const offset of offsets) {
      const target = {
        x: stop ? stop.vx : firstX,
        y: offset * stopRadius,
      };
      let ray = {
        origin: source,
        dir: normalize({ x: target.x - source.x, y: target.y - source.y }),
      };
      let ok = true;

      for (let k = 0; k < candidate.j; k++) {
        const result = transmit(ray, model.surfaces[k], "forward", { stopScale });
        if (!result.ray) {
          ok = false;
          result.reason === "clipped" ? clipped++ : failed++;
          break;
        }
        ray = result.ray;
      }
      if (!ok) continue;

      let result = reflectAt(ray, model.surfaces[candidate.j], { stopScale });
      if (!result.ray) {
        result.reason === "clipped" ? clipped++ : failed++;
        continue;
      }
      ray = result.ray;

      for (let k = candidate.j - 1; k > candidate.i; k--) {
        result = transmit(ray, model.surfaces[k], "backward", { stopScale });
        if (!result.ray) {
          ok = false;
          result.reason === "clipped" ? clipped++ : failed++;
          break;
        }
        ray = result.ray;
      }
      if (!ok) continue;

      result = reflectAt(ray, model.surfaces[candidate.i], { stopScale });
      if (!result.ray) {
        result.reason === "clipped" ? clipped++ : failed++;
        continue;
      }
      ray = result.ray;

      for (let k = candidate.i + 1; k < model.surfaces.length; k++) {
        result = transmit(ray, model.surfaces[k], "forward", { stopScale });
        if (!result.ray) {
          ok = false;
          result.reason === "clipped" ? clipped++ : failed++;
          break;
        }
        ray = result.ray;
      }
      if (!ok) continue;

      const sensorHit = intersectSensor(ray, model.sensorX);
      if (!sensorHit || !Number.isFinite(sensorHit.y)) {
        failed++;
        continue;
      }
      hits.push(sensorHit.y);
    }

    if (hits.length < Math.max(4, Math.ceil(offsets.length * 0.12))) {
      return { ghost: null, clipped, failed, rayCount: offsets.length };
    }

    const centroid = hits.reduce((sum, y) => sum + y, 0) / hits.length;
    const variance = hits.reduce((sum, y) => sum + Math.pow(y - centroid, 2), 0) / hits.length;
    const rms = Math.sqrt(Math.max(variance, 0));
    const maxRadius = hits.reduce((max, y) => Math.max(max, Math.abs(y - centroid)), 0);
    const validFraction = hits.length / offsets.length;
    const offAxisBoost = clamp(0.65 + Math.tan(fieldAngle) * 1.2, 0.65, 1.85);
    const apertureEnergy = stopScale * stopScale;
    const intensity = candidate.pairStrength * validFraction * offAxisBoost * apertureEnergy;

    return {
      ghost: {
        pairLabel: candidate.label,
        surfaceI: candidate.surfaceI.rawIndex,
        surfaceJ: candidate.surfaceJ.rawIndex,
        surfaceILabel: candidate.surfaceI.label,
        surfaceJLabel: candidate.surfaceJ.label,
        centroidMm: centroid,
        rmsMm: Math.max(rms, 0.02),
        maxRadiusMm: Math.max(maxRadius, rms, 0.04),
        validFraction,
        intensity,
        pairStrength: candidate.pairStrength,
        hitCount: hits.length,
        rayCount: offsets.length,
        clippedCount: clipped,
        failedCount: failed,
      },
      clipped,
      failed,
      rayCount: offsets.length,
    };
  }

  function trace(lensInfo, opts = {}) {
    const model = buildLensModel(lensInfo || {});
    const maxPairs = clamp(Math.round(opts.maxPairs) || 12, 4, 18);
    const candidates = generateCandidates(model, maxPairs);
    const ghosts = [];
    let clipped = 0;
    let failed = 0;
    let rays = 0;
    for (const candidate of candidates) {
      const result = traceCandidate(model, candidate, opts);
      clipped += result.clipped || 0;
      failed += result.failed || 0;
      rays += result.rayCount || 0;
      if (!result.ghost) continue;
      if (result.ghost.intensity < 1e-8) continue;
      ghosts.push(result.ghost);
    }
    ghosts.sort((a, b) => b.intensity - a.intensity);
    const lost = clipped + failed;
    const failedRayFraction = rays > 0 ? lost / rays : 0;
    const totalGhostEnergy = ghosts.reduce((sum, ghost) => sum + ghost.intensity, 0);
    return {
      modelType: model.fallback ? "fallback approximate ghost layout" : "double-reflection ghost raytrace",
      fallback: model.fallback,
      candidateCount: candidates.length,
      tracedPairCount: candidates.length,
      visibleGhostCount: ghosts.length,
      ghosts,
      strayEnergy: totalGhostEnergy,
      failedRayFraction,
      clippedRayCount: clipped,
      failedRayCount: failed,
      rayCount: rays,
      sensorWidthMm: model.sensorWidthMm,
      sensorHeightMm: model.sensorHeightMm,
      efl: model.efl,
    };
  }

  window.FlareGhostTracer = {
    trace,
    buildLensModel,
    generateCandidates,
  };
})();
