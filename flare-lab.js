/* Flare Lab: local 2D canvas flare preview.
   This is an approximate cinematography look simulator, not a full non-sequential stray-light solver.
   It never calls external APIs and never mutates the current Lens Builder prescription. */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, x) => {
    const t = clamp01((x - edge0) / Math.max(1e-9, edge1 - edge0));
    return t * t * (3 - 2 * t);
  };

  const fallbackLensInfo = {
    surfaceCount: 10,
    airGlassSurfaceCount: 8,
    estimatedGroups: 4,
    apertureIndex: 5,
    currentTStop: 2.0,
    imageCircle: 46.3,
    lensName: "",
    hasLensData: false,
  };
  const DEFAULT_LAMP = {
    x: 0.55,
    y: -0.25,
    distanceM: 3.0,
    kelvin: 2300,
    brightness: 1.0,
  };

  const els = {
    lensBuilderView: $("#appMain"),
    flareLabView: $("#flareLabView"),
    btnLensBuilderTab: $("#btnLensBuilderTab"),
    btnFlareLabTab: $("#btnFlareLabTab"),
    btnFlareBack: $("#btnFlareBack"),
    canvas: $("#flareCanvas"),
    lensSummary: $("#flareLensSummary"),
    riskSummary: $("#flareRiskSummary"),
    tStop: $("#flareTStop"),
    tStopValue: $("#flareTStopValue"),
    showOverlay: $("#flareShowOverlay"),
    resetLamp: $("#flareResetLamp"),
  };

  if (!els.canvas || !els.flareLabView) return;

  const ctx = els.canvas.getContext("2d", { alpha: false });
  const state = {
    active: false,
    dragging: false,
    dpr: 1,
    width: 1,
    height: 1,
    raf: 0,
    ghostSignature: "",
    ghosts: [],
    lensInfo: fallbackLensInfo,
    lampX: DEFAULT_LAMP.x,
    lampY: DEFAULT_LAMP.y,
    wideOpenTStop: 2.0,
    noisePattern: null,
    noisePatternKey: "",
    userTStopTouched: false,
    lastRisk: { score: 0, label: "Low", veil: 0 },
  };

  function valueOf(el, fallback) {
    const n = Number(String(el?.value ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }

  function controls() {
    const model = estimateFlareDefaults(state.lensInfo);
    const tMin = Math.max(0.7, Number(state.wideOpenTStop) || 2.0);
    return {
      lampX: state.lampX,
      lampY: state.lampY,
      distanceM: DEFAULT_LAMP.distanceM,
      brightness: DEFAULT_LAMP.brightness,
      kelvin: DEFAULT_LAMP.kelvin,
      enableGhosts: true,
      enableVeil: true,
      enableSensorBounce: model.sensorBounce,
      ghostIntensity: model.ghostIntensity,
      veilingIntensity: model.veilingIntensity,
      coatingEfficiency: model.coatingEfficiency,
      blackingQuality: model.blackingQuality,
      diffusion: model.diffusion,
      tStop: clamp(valueOf(els.tStop, tMin), tMin, 22),
      irisBlades: model.irisBlades,
      showBackground: true,
      flareOnly: false,
      showMarkers: false,
      showOverlay: !!els.showOverlay?.checked,
    };
  }

  function syncOutputs(c) {
    if (els.tStopValue) els.tStopValue.textContent = `T${c.tStop.toFixed(1)}`;
  }

  function showView(view) {
    const flare = view === "flare";
    state.active = flare;
    els.flareLabView.classList.toggle("hidden", !flare);
    els.lensBuilderView?.classList.toggle("hidden", flare);
    els.btnFlareLabTab?.classList.toggle("btnPrimary", flare);
    els.btnLensBuilderTab?.classList.toggle("btnPrimary", !flare);
    els.btnFlareLabTab?.setAttribute("aria-pressed", flare ? "true" : "false");
    els.btnLensBuilderTab?.setAttribute("aria-pressed", flare ? "false" : "true");
    if (flare) {
      readLensInfo();
      scheduleDraw(true);
    }
  }

  function readLensInfo() {
    const getter = window.getLensBuilderFlareInfo;
    const info = typeof getter === "function" ? getter() : null;
    applyLensInfo(info || fallbackLensInfo);
  }

  function applyLensInfo(info) {
    const next = {
      ...fallbackLensInfo,
      ...(info && typeof info === "object" ? info : {}),
    };
    next.surfaceCount = Math.max(0, Number(next.surfaceCount) || fallbackLensInfo.surfaceCount);
    next.airGlassSurfaceCount = Math.max(0, Number(next.airGlassSurfaceCount) || fallbackLensInfo.airGlassSurfaceCount);
    next.estimatedGroups = Math.max(1, Number(next.estimatedGroups) || fallbackLensInfo.estimatedGroups);
    next.currentTStop = Math.max(0.7, Number(next.currentTStop) || fallbackLensInfo.currentTStop);
    next.imageCircle = Math.max(1, Number(next.imageCircle) || fallbackLensInfo.imageCircle);
    next.lensName = String(next.lensName || next.name || "");
    state.lensInfo = next;
    state.wideOpenTStop = clamp(next.currentTStop || 2.0, 0.7, 22);
    if (els.tStop) {
      els.tStop.min = String(state.wideOpenTStop);
      els.tStop.max = "22";
      const current = valueOf(els.tStop, state.wideOpenTStop);
      if (!state.userTStopTouched || current < state.wideOpenTStop) {
        els.tStop.value = String(state.wideOpenTStop);
      } else {
        els.tStop.value = String(clamp(current, state.wideOpenTStop, 22));
      }
    }
    state.ghostSignature = "";
    updateLensSummary();
  }

  function updateLensSummary() {
    const info = state.lensInfo;
    if (!els.lensSummary) return;
    const source = info.hasLensData ? "Current lens" : "Fallback lens";
    els.lensSummary.textContent = `${source}: ${info.surfaceCount} surfaces, ${info.airGlassSurfaceCount} air/glass transitions, ${info.estimatedGroups} groups.`;
  }

  function estimateFlareDefaults(infoInput) {
    const info = infoInput || fallbackLensInfo;
    const surfaces = Math.max(0, Number(info.surfaceCount) || fallbackLensInfo.surfaceCount);
    const transitions = Math.max(0, Number(info.airGlassSurfaceCount) || fallbackLensInfo.airGlassSurfaceCount);
    const groups = Math.max(1, Number(info.estimatedGroups) || fallbackLensInfo.estimatedGroups);
    const complexity = clamp01((transitions - 4) / 14);
    return {
      coatingEfficiency: clamp(0.91 - complexity * 0.10 - Math.max(0, surfaces - 14) * 0.003, 0.70, 0.93),
      blackingQuality: clamp(0.82 - complexity * 0.09 - Math.max(0, groups - 5) * 0.018, 0.64, 0.86),
      diffusion: clamp(0.18 + complexity * 0.20 + Math.max(0, groups - 4) * 0.018, 0.16, 0.46),
      ghostIntensity: clamp(0.48 + transitions * 0.026 + complexity * 0.16, 0.52, 1.05),
      veilingIntensity: clamp(0.28 + complexity * 0.22 + Math.max(0, groups - 3) * 0.025, 0.30, 0.78),
      sensorBounce: true,
      irisBlades: 9,
    };
  }

  function riskScore(c) {
    const info = state.lensInfo;
    const transitions = Number(info.airGlassSurfaceCount) || 0;
    const groups = Number(info.estimatedGroups) || 0;
    const imageCircle = Number(info.imageCircle);
    const name = String(info.lensName || "").toLowerCase();
    const wideOpen = Math.max(0.7, Number(state.wideOpenTStop) || Number(info.currentTStop) || 2.0);
    const surfaceScore = clamp((transitions - 6) * 6, 0, 30);
    const speedScore = wideOpen <= 1.5 ? 18 : wideOpen <= 2.1 ? 12 : wideOpen <= 2.8 ? 7 : 3;
    const complexityScore = clamp((groups - 4) * 5, 0, 15);
    const coverageScore = Number.isFinite(imageCircle) && imageCircle < 44 ? clamp((44 - imageCircle) * 0.9, 0, 7) : 0;
    const profileBonus = /(omit|vintage|uncoated|tuned|soviet|helios|biotar|petzval|panchro|swirl)/.test(name) ? 8 : 0;
    let score = 32 + surfaceScore + speedScore + complexityScore + coverageScore + profileBonus;
    score = clamp(Math.round(score), 0, 100);
    const label = score >= 80 ? "Extreme" : score >= 60 ? "High" : score >= 35 ? "Medium" : "Low";
    return { score, label };
  }

  function apertureResponse(c) {
    const wideOpenT = Math.max(0.7, Number(state.wideOpenTStop) || Number(state.lensInfo?.currentTStop) || 2.0);
    const selectedT = Math.max(wideOpenT, Number(c.tStop) || wideOpenT);
    const stopRatio = selectedT / wideOpenT;
    return {
      wideOpenT,
      selectedT,
      stopRatio,
      flareOpenFactor: clamp(1 / Math.sqrt(stopRatio), 0.15, 1),
      veilFactor: clamp(1 / Math.pow(stopRatio, 0.85), 0.05, 1),
      ghostSizeFactor: clamp(1 / Math.sqrt(stopRatio), 0.35, 1),
      irisDefinition: smoothstep(2.8, 8.0, selectedT),
    };
  }

  function kelvinToRgb(kelvin) {
    const t = clamp(kelvin, 1000, 40000) / 100;
    let r;
    let g;
    let b;
    if (t <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
      b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
      b = 255;
    }
    return {
      r: Math.round(clamp(r, 0, 255)),
      g: Math.round(clamp(g, 0, 255)),
      b: Math.round(clamp(b, 0, 255)),
    };
  }

  function rgba(rgb, a) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(a, 0, 1)})`;
  }

  function mixRgb(a, b, t) {
    return {
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t)),
    };
  }

  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function randomFromSeed(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ghostSignature(c) {
    const info = state.lensInfo;
    return [
      info.surfaceCount,
      info.airGlassSurfaceCount,
      info.estimatedGroups,
      info.apertureIndex,
      c.irisBlades,
      c.enableGhosts,
      c.enableSensorBounce,
      c.coatingEfficiency.toFixed(2),
      c.blackingQuality.toFixed(2),
      String(info.lensName || ""),
    ].join("|");
  }

  function ensureGhosts(c) {
    const sig = ghostSignature(c);
    if (sig === state.ghostSignature) return;
    state.ghostSignature = sig;
    state.ghosts = generateGhosts(c);
  }

  function generateGhosts(c) {
    if (!c.enableGhosts) return [];
    const info = state.lensInfo;
    const count = Math.round(clamp(5 + info.airGlassSurfaceCount * 0.35 + (1 - c.coatingEfficiency) * 3, 6, 12));
    const seed = hashString(`${info.surfaceCount}:${info.airGlassSurfaceCount}:${info.estimatedGroups}:${info.apertureIndex}:${info.imageCircle}:${info.lensName}`);
    const rnd = randomFromSeed(seed);
    const multipliers = [-0.90, -0.55, -0.25, 0.15, 0.38, 0.70, -1.18, 0.98, -0.08, 0.52, -0.72, 0.26];
    const ghosts = [];
    for (let i = 0; i < count; i++) {
      const layer = i / Math.max(1, count - 1);
      const type = i === 0 ? "orb" : (i % 5 === 0 ? "point" : (i % 4 === 0 ? "iris" : "disc"));
      ghosts.push({
        id: i + 1,
        type,
        multiplier: (multipliers[i % multipliers.length] || 0.2) + (rnd() - 0.5) * 0.055,
        perp: (rnd() - 0.5) * lerp(0.035, 0.28, layer),
        radiusNorm: type === "orb"
          ? lerp(0.17, 0.24, rnd())
          : type === "point"
            ? lerp(0.006, 0.014, rnd())
            : type === "iris"
              ? lerp(0.040, 0.080, rnd())
              : lerp(0.030, 0.105, rnd()),
        opacity: type === "orb"
          ? lerp(0.060, 0.125, rnd())
          : type === "point"
            ? lerp(0.16, 0.30, rnd())
            : type === "iris"
              ? lerp(0.075, 0.18, rnd())
              : lerp(0.095, 0.24, rnd()),
        blurNorm: type === "point" ? lerp(0.001, 0.003, rnd()) : lerp(0.002, 0.020, rnd()),
        ring: lerp(0.25, 0.58, rnd()),
        tintShift: rnd(),
        label: `S${Math.max(1, Math.round(lerp(1, info.surfaceCount, rnd())))}-S${Math.max(1, Math.round(lerp(1, info.surfaceCount, rnd())))}`,
      });
    }
    return ghosts;
  }

  function resizeCanvas() {
    const rect = els.canvas.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const w = Math.max(320, Math.round(rect.width * dpr));
    const h = Math.max(240, Math.round(rect.height * dpr));
    if (els.canvas.width !== w || els.canvas.height !== h) {
      els.canvas.width = w;
      els.canvas.height = h;
    }
    state.dpr = dpr;
    state.width = w;
    state.height = h;
  }

  function frameGeometry(c) {
    const w = state.width;
    const h = state.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = Math.min(w, h) * 0.42;
    return {
      w,
      h,
      cx,
      cy,
      scale,
      lampX: cx + c.lampX * scale,
      lampY: cy + c.lampY * scale,
    };
  }

  function lampPositionStatus(g) {
    const inside = g.lampX >= 0 && g.lampX <= g.w && g.lampY >= 0 && g.lampY <= g.h;
    if (!inside) return "off-frame";
    const marginX = g.w * 0.10;
    const marginY = g.h * 0.10;
    const nearEdge = g.lampX < marginX || g.lampX > g.w - marginX || g.lampY < marginY || g.lampY > g.h - marginY;
    return nearEdge ? "edge" : "inside frame";
  }

  function getLampOverscanBounds(rect) {
    const scale = Math.max(1, Math.min(rect.width, rect.height) * 0.42);
    return {
      minX: (-rect.width * 0.25 - rect.width * 0.5) / scale,
      maxX: (rect.width * 1.25 - rect.width * 0.5) / scale,
      minY: (-rect.height * 0.25 - rect.height * 0.5) / scale,
      maxY: (rect.height * 1.25 - rect.height * 0.5) / scale,
    };
  }

  function scheduleDraw(regenerate = false) {
    if (regenerate) state.ghostSignature = "";
    if (state.raf) return;
    state.raf = requestAnimationFrame(draw);
  }

  function draw() {
    state.raf = 0;
    resizeCanvas();
    const c = controls();
    syncOutputs(c);
    ensureGhosts(c);
    const g = frameGeometry(c);
    const response = apertureResponse(c);
    const lampColor = kelvinToRgb(c.kelvin);
    const warmGold = { r: 255, g: 198, b: 92 };
    const ghostColor = mixRgb(lampColor, warmGold, 0.56);
    const distanceFactor = clamp(Math.pow(3 / Math.max(0.2, c.distanceM), 1.55), 0.08, 5);
    const apertureFactor = response.flareOpenFactor;
    const visibleHalfX = g.w / (2 * g.scale);
    const visibleHalfY = g.h / (2 * g.scale);
    const edgePressure = Math.max(Math.abs(c.lampX) / Math.max(0.01, visibleHalfX), Math.abs(c.lampY) / Math.max(0.01, visibleHalfY));
    const offAxis = clamp(Math.hypot(c.lampX, c.lampY) / 1.25, 0, 1.9);
    const strength = c.brightness * distanceFactor * apertureFactor;
    const coatingLoss = 1 - c.coatingEfficiency;
    const blackingLoss = 1 - c.blackingQuality;
    const risk = riskScore(c);
    const veilingLevel = c.enableVeil
      ? clamp(response.veilFactor * c.veilingIntensity * (0.10 + coatingLoss * 0.52 + blackingLoss * 0.42 + c.diffusion * 0.22) * (0.32 + offAxis * 0.32 + Math.max(0, edgePressure - 0.72) * 0.60), 0, 1.25)
      : 0;
    state.lastRisk = { ...risk, veil: veilingLevel };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    drawBackground(c, g, veilingLevel);
    drawVeiling(c, g, lampColor, veilingLevel, offAxis, edgePressure, response);
    drawGhosts(c, g, ghostColor, strength, coatingLoss, offAxis, response);
    drawSensorBounce(c, g, lampColor, strength, coatingLoss, response);
    drawLamp(c, g, lampColor, strength, response);
    drawDither(g, veilingLevel);
    if (c.showMarkers) drawMarkers(c, g);
    if (c.showOverlay) drawOverlay(c, g, risk, veilingLevel);
    updateRiskSummary(risk, veilingLevel);
  }

  function drawBackground(c, g, veilingLevel = 0) {
    ctx.fillStyle = "#020306";
    ctx.fillRect(0, 0, g.w, g.h);
    if (!c.showBackground || c.flareOnly) return;
    const bg = ctx.createLinearGradient(0, 0, g.w, g.h);
    bg.addColorStop(0, "#151922");
    bg.addColorStop(0.52, "#07090e");
    bg.addColorStop(1, "#100d0a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, g.w, g.h);

    ctx.save();
    const wash = clamp01(veilingLevel / 1.1);
    const barX = g.w * 0.075;
    const barW = g.w * 0.115;
    const barGap = g.h * 0.018;
    const startY = g.h * 0.28;
    const barH = g.h * 0.075;
    const tones = [0.30, 0.22, 0.16, 0.11, 0.075];
    tones.forEach((tone, i) => {
      const lifted = lerp(tone, 0.24, wash * 0.55);
      ctx.fillStyle = `rgba(255,255,255,${lifted})`;
      roundedRect(barX, startY + i * (barH + barGap), barW, barH, 4 * state.dpr);
      ctx.fill();
    });
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1 * state.dpr;
    const padX = g.w * 0.075;
    const padY = g.h * 0.095;
    roundedRect(padX, padY, g.w - padX * 2, g.h - padY * 2, 10 * state.dpr);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.moveTo(g.cx, padY);
    ctx.lineTo(g.cx, g.h - padY);
    ctx.moveTo(padX, g.cy);
    ctx.lineTo(g.w - padX, g.cy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const silhouette = ctx.createRadialGradient(g.w * 0.70, g.h * 0.58, 0, g.w * 0.70, g.h * 0.58, Math.min(g.w, g.h) * 0.22);
    silhouette.addColorStop(0, "rgba(255,255,255,.075)");
    silhouette.addColorStop(0.62, "rgba(255,255,255,.025)");
    silhouette.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = silhouette;
    ctx.beginPath();
    ctx.ellipse(g.w * 0.70, g.h * 0.58, g.w * 0.13, g.h * 0.20, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const vignette = ctx.createRadialGradient(g.cx, g.cy, Math.min(g.w, g.h) * 0.08, g.cx, g.cy, Math.max(g.w, g.h) * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.62)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, g.w, g.h);
  }

  function drawVeiling(c, g, color, level, offAxis, edgePressure, response) {
    if (!c.enableVeil || level <= 0.001) return;
    const amber = mixRgb(color, { r: 255, g: 188, b: 86 }, 0.64);
    const radius = Math.max(g.w, g.h) * lerp(0.72, 1.55, clamp01(level));
    const anchorX = clamp(g.lampX, -g.w * 0.22, g.w * 1.22);
    const anchorY = clamp(g.lampY, -g.h * 0.22, g.h * 1.22);
    const veil = ctx.createRadialGradient(anchorX, anchorY, 0, g.cx, g.cy, radius);
    veil.addColorStop(0, rgba(amber, clamp(0.095 * level, 0, 0.16)));
    veil.addColorStop(0.42, rgba(amber, clamp(0.040 * level, 0, 0.075)));
    veil.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, g.w, g.h);

    const lift = clamp(0.018 * level + 0.012 * clamp01(edgePressure - 0.65), 0, 0.055);
    ctx.fillStyle = rgba(mixRgb(color, { r: 255, g: 215, b: 146 }, 0.55), lift);
    ctx.fillRect(0, 0, g.w, g.h);

    if (offAxis > 0.25) {
      const vx = g.cx - g.lampX;
      const vy = g.cy - g.lampY;
      const len = Math.max(1, Math.hypot(vx, vy));
      const nx = -vy / len;
      const ny = vx / len;
      const beamW = Math.min(g.w, g.h) * lerp(0.10, 0.28, clamp01(offAxis / 1.5));
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = `blur(${(beamW * 0.32).toFixed(1)}px)`;
      ctx.fillStyle = rgba(amber, clamp(level * response.veilFactor * 0.030, 0, 0.060));
      ctx.beginPath();
      ctx.moveTo(g.lampX + nx * beamW, g.lampY + ny * beamW);
      ctx.lineTo(g.cx + nx * beamW * 0.35, g.cy + ny * beamW * 0.35);
      ctx.lineTo(g.cx - nx * beamW * 0.35, g.cy - ny * beamW * 0.35);
      ctx.lineTo(g.lampX - nx * beamW, g.lampY - ny * beamW);
      ctx.closePath();
      ctx.fill();
      ctx.filter = "none";
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  function drawGhosts(c, g, baseColor, strength, coatingLoss, offAxis, response) {
    if (!c.enableGhosts) return;
    const vx = g.lampX - g.cx;
    const vy = g.lampY - g.cy;
    const len = Math.max(1, Math.hypot(vx, vy));
    const px = -vy / len;
    const py = vx / len;
    const ghostStrength = clamp(strength * c.ghostIntensity * (0.30 + coatingLoss * 1.15) * (0.82 + offAxis * 0.52), 0, 2.8);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const ghost of state.ghosts) {
      const x = g.cx + vx * ghost.multiplier + px * ghost.perp * g.scale;
      const y = g.cy + vy * ghost.multiplier + py * ghost.perp * g.scale;
      const typeSizeBoost = ghost.type === "orb" ? 1.25 : ghost.type === "point" ? 0.65 : 1;
      const r = ghost.radiusNorm * Math.min(g.w, g.h) * response.ghostSizeFactor * typeSizeBoost;
      const blur = ghost.blurNorm * Math.min(g.w, g.h) * lerp(1.35, 0.38, response.irisDefinition);
      const tintTarget = ghost.tintShift > 0.66
        ? { r: 255, g: 218, b: 136 }
        : ghost.tintShift > 0.34
          ? { r: 255, g: 164, b: 102 }
          : { r: 255, g: 236, b: 180 };
      const tint = mixRgb(baseColor, tintTarget, 0.52);
      const irisBoost = ghost.type === "iris" ? lerp(0.10, 1.0, response.irisDefinition) : 1;
      const alpha = clamp(ghost.opacity * ghostStrength * irisBoost, 0, ghost.type === "point" ? 0.46 : 0.38);
      drawGhostShape(x, y, r, blur, tint, alpha, ghost, c.irisBlades, c.tStop, response);
    }
    ctx.restore();
  }

  function drawGhostShape(x, y, radius, blur, color, alpha, ghost, blades, tStop, response) {
    if (alpha <= 0.002 || radius <= 0) return;
    const type = String(ghost?.type || "disc");
    if (type === "point") {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.5);
      grad.addColorStop(0, "rgba(255,250,224,.72)");
      grad.addColorStop(0.22, rgba(color, alpha));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.save();
    ctx.filter = `blur(${Math.max(0, blur).toFixed(1)}px)`;

    if (type === "iris") {
      const irisAlpha = alpha * clamp(response.irisDefinition, 0.05, 0.92);
      ctx.fillStyle = rgba(color, irisAlpha * 0.72);
      drawIrisPolygon(x, y, radius, blades, -Math.PI / 2, tStop);
      const rim = ctx.createRadialGradient(x, y, radius * 0.20, x, y, radius * 1.18);
      rim.addColorStop(0, "rgba(0,0,0,0)");
      rim.addColorStop(0.70, rgba(color, irisAlpha * 0.07));
      rim.addColorStop(0.88, rgba(color, irisAlpha * 0.25));
      rim.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (type === "orb") {
      const grad = ctx.createRadialGradient(x, y, radius * 0.06, x, y, radius * 1.35);
      grad.addColorStop(0, rgba(color, alpha * 0.025));
      grad.addColorStop(0.48, rgba(color, alpha * 0.070));
      grad.addColorStop(0.72, rgba(color, alpha * 0.34));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const grad = ctx.createRadialGradient(x, y, radius * 0.04, x, y, radius * 1.18);
    grad.addColorStop(0, rgba(color, alpha * 0.20));
    grad.addColorStop(0.46, rgba(color, alpha * 0.09));
    grad.addColorStop(0.70, rgba(color, alpha * (0.22 + Number(ghost?.ring || 0.35) * 0.28)));
    grad.addColorStop(0.86, rgba(color, alpha * 0.12));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.18, 0, Math.PI * 2);
    ctx.fill();

    const glint = ctx.createRadialGradient(x - radius * 0.22, y - radius * 0.18, 0, x - radius * 0.22, y - radius * 0.18, radius * 0.45);
    glint.addColorStop(0, rgba({ r: 255, g: 245, b: 210 }, alpha * 0.18));
    glint.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.arc(x - radius * 0.22, y - radius * 0.18, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawIrisPolygon(x, y, radius, blades, rotation, tStop) {
    const defined = clamp01((tStop - 2.0) / 5.5);
    const innerRound = lerp(0.94, 0.78, defined);
    ctx.beginPath();
    for (let i = 0; i < blades; i++) {
      const a = rotation + (i / blades) * Math.PI * 2;
      const rr = radius * (i % 2 ? innerRound : 1);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawSensorBounce(c, g, color, strength, coatingLoss, response) {
    if (!c.enableSensorBounce) return;
    const vx = g.lampX - g.cx;
    const vy = g.lampY - g.cy;
    const x = g.cx - vx * 0.62;
    const y = g.cy - vy * 0.62;
    const r = Math.min(g.w, g.h) * (0.042 + 0.014 * c.diffusion) * response.ghostSizeFactor;
    const alpha = clamp(strength * response.flareOpenFactor * (0.045 + coatingLoss * 0.22), 0, 0.19);
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.translate(x, y);
    ctx.rotate(0.22);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
    grad.addColorStop(0, rgba(mixRgb(color, { r: 255, g: 120, b: 165 }, 0.25), alpha));
    grad.addColorStop(0.55, rgba(color, alpha * 0.22));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.85, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLamp(c, g, color, strength, response) {
    const inside = g.lampX >= 0 && g.lampX <= g.w && g.lampY >= 0 && g.lampY <= g.h;
    const glowRadius = Math.min(g.w, g.h) * clamp(0.055 + c.diffusion * 0.055 + response.flareOpenFactor * 0.13 + strength * 0.018, 0.045, 0.30);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(g.lampX, g.lampY, 0, g.lampX, g.lampY, glowRadius);
    glow.addColorStop(0, rgba({ r: 255, g: 249, b: 224 }, clamp(0.62 * strength, 0.12, 0.90)));
    glow.addColorStop(0.12, rgba(mixRgb(color, { r: 255, g: 210, b: 116 }, 0.36), clamp(0.34 * strength, 0.05, 0.62)));
    glow.addColorStop(0.52, rgba(color, clamp(0.070 * strength, 0.015, 0.17)));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(g.lampX, g.lampY, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!inside) return;
    ctx.save();
    ctx.fillStyle = "rgba(255,248,220,.98)";
    ctx.shadowColor = rgba(color, 0.95);
    ctx.shadowBlur = Math.min(g.w, g.h) * 0.018 * (0.35 + response.flareOpenFactor + c.diffusion * 0.8);
    ctx.beginPath();
    ctx.arc(g.lampX, g.lampY, Math.max(4.5 * state.dpr, Math.min(g.w, g.h) * 0.010), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function ensureNoisePattern() {
    const key = `${Math.round(state.dpr * 100)}:128`;
    if (state.noisePattern && state.noisePatternKey === key) return state.noisePattern;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const nctx = canvas.getContext("2d");
    const img = nctx.createImageData(size, size);
    const rnd = randomFromSeed(0x51f15e);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(118 + rnd() * 34);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.floor(18 + rnd() * 20);
    }
    nctx.putImageData(img, 0, 0);
    state.noisePattern = ctx.createPattern(canvas, "repeat");
    state.noisePatternKey = key;
    return state.noisePattern;
  }

  function drawDither(g, veilingLevel) {
    const pattern = ensureNoisePattern();
    if (!pattern) return;
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = clamp(0.025 + veilingLevel * 0.018, 0.018, 0.050);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, g.w, g.h);
    ctx.restore();
  }

  function drawMarkers(c, g) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,209,138,.34)";
    ctx.fillStyle = "rgba(255,209,138,.82)";
    ctx.setLineDash([6 * state.dpr, 8 * state.dpr]);
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cy);
    ctx.lineTo(g.lampX, g.lampY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${11 * state.dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    state.ghosts.forEach((ghost) => {
      const vx = g.lampX - g.cx;
      const vy = g.lampY - g.cy;
      const len = Math.max(1, Math.hypot(vx, vy));
      const px = -vy / len;
      const py = vx / len;
      const x = g.cx - vx * ghost.multiplier + px * ghost.perp * g.scale;
      const y = g.cy - vy * ghost.multiplier + py * ghost.perp * g.scale;
      ctx.beginPath();
      ctx.arc(x, y, 3.2 * state.dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(ghost.label, x + 7 * state.dpr, y - 7 * state.dpr);
    });
    ctx.restore();
  }

  function drawOverlay(c, g, risk, veilingLevel) {
    const lines = [
      `Distance: ${c.distanceM.toFixed(1)}m`,
      `Kelvin: ${Math.round(c.kelvin)}K`,
      `T-stop: T${c.tStop.toFixed(1)}`,
      `Lamp position: ${lampPositionStatus(g)}`,
      `Estimated ghosts: ${state.ghosts.length}`,
      `Flare risk: ${risk.label} (${risk.score}/100)`,
      "Approximate preview, not full stray-light simulation.",
    ];
    const pad = 12 * state.dpr;
    const lineH = 17 * state.dpr;
    const width = 390 * state.dpr;
    const height = pad * 2 + lineH * lines.length;
    const x = 18 * state.dpr;
    const y = 18 * state.dpr;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.48)";
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 1 * state.dpr;
    roundedRect(x, y, width, height, 12 * state.dpr);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.86)";
    ctx.font = `${12 * state.dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    lines.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + (i + 0.82) * lineH));
    ctx.restore();
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function updateRiskSummary(risk, veilingLevel) {
    const c = controls();
    if (els.lensSummary) {
      const info = state.lensInfo;
      const source = info.hasLensData ? "Current lens" : "Fallback lens";
      els.lensSummary.innerHTML = [
        `<div><strong>${source}</strong></div>`,
        `<div>Surfaces: ${Math.round(info.surfaceCount)}</div>`,
        `<div>Air/glass transitions: ${Math.round(info.airGlassSurfaceCount)}</div>`,
        `<div>Estimated groups: ${Math.round(info.estimatedGroups)}</div>`,
        `<div>Current selected T-stop: T${c.tStop.toFixed(1)}</div>`,
      ].join("");
    }
    if (!els.riskSummary) return;
    els.riskSummary.textContent = `Estimated flare risk: ${risk.label} (${risk.score}/100)`;
  }

  function setLampFromEvent(event) {
    const rect = els.canvas.getBoundingClientRect();
    const xCss = event.clientX - rect.left;
    const yCss = event.clientY - rect.top;
    const scale = Math.min(rect.width, rect.height) * 0.42;
    const bounds = getLampOverscanBounds(rect);
    const nx = clamp((xCss - rect.width * 0.5) / Math.max(1, scale), bounds.minX, bounds.maxX);
    const ny = clamp((yCss - rect.height * 0.5) / Math.max(1, scale), bounds.minY, bounds.maxY);
    state.lampX = nx;
    state.lampY = ny;
    scheduleDraw(false);
  }

  function bindControls() {
    [els.showOverlay].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", () => scheduleDraw(false));
      el.addEventListener("change", () => scheduleDraw(false));
    });
    if (els.tStop) {
      els.tStop.addEventListener("input", () => {
        state.userTStopTouched = true;
        scheduleDraw(false);
      });
      els.tStop.addEventListener("change", () => {
        state.userTStopTouched = true;
        scheduleDraw(true);
      });
    }
    if (els.resetLamp) {
      els.resetLamp.addEventListener("click", () => {
        state.lampX = DEFAULT_LAMP.x;
        state.lampY = DEFAULT_LAMP.y;
        scheduleDraw(false);
      });
    }
  }

  function bindPointer() {
    els.canvas.addEventListener("pointerdown", (event) => {
      state.dragging = true;
      els.canvas.classList.add("isDragging");
      els.canvas.setPointerCapture?.(event.pointerId);
      setLampFromEvent(event);
    });
    els.canvas.addEventListener("pointermove", (event) => {
      if (!state.dragging) return;
      setLampFromEvent(event);
    });
    const stop = (event) => {
      state.dragging = false;
      els.canvas.classList.remove("isDragging");
      try { els.canvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    els.canvas.addEventListener("pointerup", stop);
    els.canvas.addEventListener("pointercancel", stop);
    els.canvas.addEventListener("lostpointercapture", () => {
      state.dragging = false;
      els.canvas.classList.remove("isDragging");
    });
  }

  function init() {
    els.btnFlareLabTab?.addEventListener("click", () => showView("flare"));
    els.btnLensBuilderTab?.addEventListener("click", () => showView("lens"));
    els.btnFlareBack?.addEventListener("click", () => showView("lens"));
    bindControls();
    bindPointer();
    window.addEventListener("resize", () => scheduleDraw(false));
    window.addEventListener("lensbuilder:flare-info", (event) => {
      applyLensInfo(event.detail || fallbackLensInfo);
      scheduleDraw(true);
    });
    readLensInfo();
    scheduleDraw(true);
  }

  init();
})();
