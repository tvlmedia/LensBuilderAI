/* Meridional Raytracer (2D) — TVL Lens Builder (split-view build)
   - Matches your current index.html + style.css (no tabs required)
   - Element modal: achromats + optional FRONT AIR injection
   - Reverse tracing: IMS aperture does NOT vignette
   - Preview: radial mapping (rotational symmetry) with r->obj LUT
   - OSLO-ish convention: glass = medium AFTER surface
   - Added: Scale → FL, Set T, New Lens modal, Preview fullscreen button
*/

(() => {
  // -------------------- tiny helpers --------------------
  const $ = (sel) => document.querySelector(sel);
  const on = (sel, ev, fn, opts) => {
    const el = $(sel);
    if (el) el.addEventListener(ev, fn, opts);
    return el;
  };

  const clone = (obj) =>
    typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

  function num(v, fallback = 0) {
    const s = String(v ?? "").trim().replace(",", ".");
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : fallback;
  }
  function clamp01(x){ return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function smoothstep(a, b, x){
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  // -------------------- canvases --------------------
  const canvas = $("#canvas");
  const ctx = canvas?.getContext("2d");

  const previewCanvasEl = $("#previewCanvas");
  const pctx = previewCanvasEl?.getContext("2d");

  // -------------------- preview state --------------------
  const preview = {
    img: null,
    imgCanvas: document.createElement("canvas"),
    imgCtx: null,
    ready: false,

    imgData: null, // cached pixels

    worldCanvas: document.createElement("canvas"),
    worldCtx: null,
    worldReady: false,
    dirtyKey: "",

    view: { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 },

    // overlay
    rulerOn: false,
    sourceMode: "chart",
    sourceUrls: {
      chart: null,
      custom: null,
    },

    // auto-detected usable image circle (based on vignette falloff)
    usableCircle: {
      valid: false,
      radiusMm: 0,
      diameterMm: 0,
      thresholdRel: 0.35,
      relAtCutoff: 0,
      source: "",
    },
    focusAssist: {
      cacheKey: "",
      sensorX: 0,
      metrics: null,
      mode: "chart-center",
      debugKey: "",
    },
    debug: {
      focusDeltaMm: null,
      spotRmsMm: null,
      spotRmsPx: null,
      kernelPx: null,
      mmPerPx: null,
      method: "",
      centerRmsMm: null,
      centerRmsPx: null,
      centerHitRate: null,
      midRmsMm: null,
      midRmsPx: null,
      midHitRate: null,
      cornerRmsMm: null,
      cornerRmsPx: null,
      cornerHitRate: null,
      bestFocusCenterShiftMm: null,
      bestFocusCornerShiftMm: null,
      fieldCurvatureDeltaMm: null,
    },
  };
  preview.imgCtx = preview.imgCanvas.getContext("2d");
  preview.worldCtx = preview.worldCanvas.getContext("2d");

  // -------------------- UI --------------------
  const ui = {
    tbody: $("#surfTbody"),
    status: $("#statusText"),

    efl: $("#badgeEfl"),
    bfl: $("#badgeBfl"),
    tstop: $("#badgeT"),
    vig: $("#badgeVig"),
    fov: $("#badgeFov"),
    cov: $("#badgeCov"),
    ic: $("#badgeIC"),

    footerWarn: $("#footerWarn"),
    metaInfo: $("#metaInfo"),

    eflTop: $("#badgeEflTop"),
    bflTop: $("#badgeBflTop"),
    tstopTop: $("#badgeTTop"),
    fovTop: $("#badgeFovTop"),
    covTop: $("#badgeCovTop"),
    icTop: $("#badgeICTop"),

    sensorPreset: $("#sensorPreset"),
    sensorW: $("#sensorW"),
    sensorH: $("#sensorH"),
    zoomConfigWrap: $("#zoomConfigWrap"),
    zoomConfigSelect: $("#zoomConfigSelect"),

    fieldAngle: $("#fieldAngle"),
    useZemaxFields: $("#useZemaxFields"),
    rayCount: $("#rayCount"),
    wavePreset: $("#wavePreset"),
    focusMode: $("#focusMode"),
    focusMechanism: $("#focusMechanism"),
    lensFocus: $("#lensFocus"),
    focusShiftSlider: $("#focusShiftSlider"),
    autoRefocusOnDistanceChange: $("#autoRefocusOnDistanceChange"),
    focusShiftActive: $("#focusShiftActive"),
    renderScale: $("#renderScale"),

    prevImg: $("#prevImg"),
    previewSourceMode: $("#previewSourceMode"),
    previewAutoFit: $("#previewAutoFit"),
    prevObjDist: $("#prevObjDist"),
    prevObjH: $("#prevObjH"),
    prevObjW: $("#prevObjW"),
    prevRes: $("#prevRes"),
    previewRenderMode: $("#previewRenderMode"),
    pupilSamples: $("#pupilSamples"),
    previewOrientation: $("#previewOrientation"),
    autoFocusMode: $("#autoFocusMode"),
    btnRenderPreview: $("#btnRenderPreview"),
    btnPreviewFS: $("#btnPreviewFS"),
    btnPreviewRuler: $("#btnPreviewRuler"),
    previewPane: $("#previewPane"),

    raysPane: $("#raysPane"),
    btnRaysFS: $("#btnRaysFS"),

    btnScaleToFocal: $("#btnScaleToFocal"),
    btnSetTStop: $("#btnSetTStop"),
    btnNew: $("#btnNew"),
    btnLoadOmit: $("#btnLoadOmit"),
    btnLoadDemo: $("#btnLoadDemo"),
    btnAdd: $("#btnAdd"),
    btnAddElement: $("#btnAddElement"),
    btnStockLibrary: $("#btnStockLibrary"),
    btnPrototypeBom: $("#btnPrototypeBom"),
    btnStockPrototypeMode: $("#btnStockPrototypeMode"),
    btnAddFieldFlattener: $("#btnAddFieldFlattener"),
    btnDuplicate: $("#btnDuplicate"),
    btnMoveUp: $("#btnMoveUp"),
    btnMoveDown: $("#btnMoveDown"),
    btnRemove: $("#btnRemove"),
    btnCopyJson: $("#btnCopyJson"),
    btnSave: $("#btnSave"),
    btnPasteJson: $("#btnPasteJson"),
    btnPasteZmx: $("#btnPasteZmx"),
    fileLoad: $("#fileLoad"),
    btnAutoFocus: $("#btnAutoFocus"),
    btnCornerFocus: $("#btnCornerFocus"),
    btnAutoTuner: $("#btnAutoTuner"),
    btnAiAssistant: $("#btnAiAssistant"),
    btnRenderEngine: $("#btnRenderEngine"),
    btnDebugOverlay: $("#btnDebugOverlay"),

    autoTunerModal: $("#autoTunerModal"),
    atClose: $("#atClose"),
    atPreset: $("#atPreset"),
    atApplyPreset: $("#atApplyPreset"),
    atGoalFL: $("#atGoalFL"),
    atTargetFL: $("#atTargetFL"),
    atWeightFL: $("#atWeightFL"),
    atWeightFLValue: $("#atWeightFLValue"),
    atHardFL: $("#atHardFL"),
    atTolFL: $("#atTolFL"),
    atGoalT: $("#atGoalT"),
    atTargetT: $("#atTargetT"),
    atWeightT: $("#atWeightT"),
    atWeightTValue: $("#atWeightTValue"),
    atHardT: $("#atHardT"),
    atTolT: $("#atTolT"),
    atGoalIC: $("#atGoalIC"),
    atTargetIC: $("#atTargetIC"),
    atWeightIC: $("#atWeightIC"),
    atWeightICValue: $("#atWeightICValue"),
    atHardIC: $("#atHardIC"),
    atMinIC: $("#atMinIC"),
    atGoalCenter: $("#atGoalCenter"),
    atWeightCenter: $("#atWeightCenter"),
    atWeightCenterValue: $("#atWeightCenterValue"),
    atGoalCorner: $("#atGoalCorner"),
    atWeightCorner: $("#atWeightCorner"),
    atWeightCornerValue: $("#atWeightCornerValue"),
    atGoalFieldCurv: $("#atGoalFieldCurv"),
    atWeightFieldCurv: $("#atWeightFieldCurv"),
    atWeightFieldCurvValue: $("#atWeightFieldCurvValue"),
    atGoalVig: $("#atGoalVig"),
    atWeightVig: $("#atWeightVig"),
    atWeightVigValue: $("#atWeightVigValue"),
    atGoalRear: $("#atGoalRear"),
    atTargetRear: $("#atTargetRear"),
    atWeightRear: $("#atWeightRear"),
    atWeightRearValue: $("#atWeightRearValue"),
    atGoalCompact: $("#atGoalCompact"),
    atWeightCompact: $("#atWeightCompact"),
    atWeightCompactValue: $("#atWeightCompactValue"),
    atVarR: $("#atVarR"),
    atVarAirT: $("#atVarAirT"),
    atVarGlassT: $("#atVarGlassT"),
    atVarStopAp: $("#atVarStopAp"),
    atVarStopT: $("#atVarStopT"),
    atVarAp: $("#atVarAp"),
    atVarRearSpacing: $("#atVarRearSpacing"),
    atVarFrontGroup: $("#atVarFrontGroup"),
    atVarRearGroup: $("#atVarRearGroup"),
    atVarGlass: $("#atVarGlass"),
    atVarFFR: $("#atVarFFR"),
    atVarFFPos: $("#atVarFFPos"),
    atVarFFThick: $("#atVarFFThick"),
    atIterations: $("#atIterations"),
    atStepSize: $("#atStepSize"),
    atRunSpeed: $("#atRunSpeed"),
    atSeed: $("#atSeed"),
    atStopStuck: $("#atStopStuck"),
    atAutoReduce: $("#atAutoReduce"),
    atAnneal: $("#atAnneal"),
    atMinGlass: $("#atMinGlass"),
    atMinAir: $("#atMinAir"),
    atMaxGlass: $("#atMaxGlass"),
    atMaxAir: $("#atMaxAir"),
    atMinRadius: $("#atMinRadius"),
    atMaxRadius: $("#atMaxRadius"),
    atAllowSensorShift: $("#atAllowSensorShift"),
    atAllowIMSAp: $("#atAllowIMSAp"),
    atAllowRSignFlip: $("#atAllowRSignFlip"),
    atStrictFLTLock: $("#atStrictFLTLock"),
    atStrictValidation: $("#atStrictValidation"),
    atProgressFill: $("#atProgressFill"),
    atMetricIteration: $("#atMetricIteration"),
    atMetricBestScore: $("#atMetricBestScore"),
    atMetricBestIter: $("#atMetricBestIter"),
    atMetricSinceBest: $("#atMetricSinceBest"),
    atMetricCurrentScore: $("#atMetricCurrentScore"),
    atMetricImprovement: $("#atMetricImprovement"),
    atMetricAccepted: $("#atMetricAccepted"),
    atMetricRejected: $("#atMetricRejected"),
    atMetricInvalid: $("#atMetricInvalid"),
    atMetricHardFL: $("#atMetricHardFL"),
    atMetricHardT: $("#atMetricHardT"),
    atMetricHardIC: $("#atMetricHardIC"),
    atMetricEFL: $("#atMetricEFL"),
    atMetricT: $("#atMetricT"),
    atMetricIC: $("#atMetricIC"),
    atMetricCOV: $("#atMetricCOV"),
    atMetricBFL: $("#atMetricBFL"),
    atMetricCenterRMS: $("#atMetricCenterRMS"),
    atMetricCornerRMS: $("#atMetricCornerRMS"),
    atMetricFieldCurv: $("#atMetricFieldCurv"),
    atMetricRear: $("#atMetricRear"),
    atStatus: $("#atStatus"),
    atHistoryBody: $("#atHistoryBody"),
    atStart: $("#atStart"),
    atPause: $("#atPause"),
    atStop: $("#atStop"),
    atPreviewBest: $("#atPreviewBest"),
    atApplyBest: $("#atApplyBest"),
    atRevert: $("#atRevert"),
    atCopyDiagnostics: $("#atCopyDiagnostics"),
    atCopyBest: $("#atCopyBest"),
    atSaveBest: $("#atSaveBest"),

    newLensModal: $("#newLensModal"),
    nlClose: $("#nlClose"),
    nlCreate: $("#nlCreate"),
    nlTemplate: $("#nlTemplate"),
    nlFocal: $("#nlFocal"),
    nlT: $("#nlT"),
    nlStopPos: $("#nlStopPos"),
    nlName: $("#nlName"),

    zmxPasteModal: $("#zmxPasteModal"),
    zmxPasteText: $("#zmxPasteText"),
    zmxPasteImport: $("#zmxPasteImport"),
    zmxPasteCancel: $("#zmxPasteCancel"),
    zmxPasteClear: $("#zmxPasteClear"),
    zmxPasteClose: $("#zmxPasteClose"),
    jsonPasteModal: $("#jsonPasteModal"),
    jsonPasteText: $("#jsonPasteText"),
    jsonPasteImport: $("#jsonPasteImport"),
    jsonPasteCancel: $("#jsonPasteCancel"),
    jsonPasteClear: $("#jsonPasteClear"),
    jsonPasteClose: $("#jsonPasteClose"),
    cornerFocusModal: $("#cornerFocusModal"),
    cfClose: $("#cfClose"),
    cfSummary: $("#cfSummary"),
    cfCenterShift: $("#cfCenterShift"),
    cfCornerShift: $("#cfCornerShift"),
    cfFocusDelta: $("#cfFocusDelta"),
    cfCOV: $("#cfCOV"),
    cfIC: $("#cfIC"),
    cfTableBody: $("#cfTableBody"),
    cfNotes: $("#cfNotes"),
    cfRun: $("#cfRun"),
    cfCopy: $("#cfCopy"),

    aiAssistantModal: $("#aiAssistantModal"),
    aiClose: $("#aiClose"),
    aiLensSummary: $("#aiLensSummary"),
    aiReferenceSummary: $("#aiReferenceSummary"),
    aiBuildReference: $("#aiBuildReference"),
    aiAddReferenceLens: $("#aiAddReferenceLens"),
    aiIterateReference: $("#aiIterateReference"),
    aiCandidateSummary: $("#aiCandidateSummary"),
    aiPreviewCandidate: $("#aiPreviewCandidate"),
    aiApplyCandidate: $("#aiApplyCandidate"),
    aiCopyBestJson: $("#aiCopyBestJson"),
    aiRevertCandidate: $("#aiRevertCandidate"),
    aiAutonomousMode: $("#aiAutonomousMode"),
    aiMaxSteps: $("#aiMaxSteps"),
    aiMaxTunerRuns: $("#aiMaxTunerRuns"),
    aiMaxTunerIterations: $("#aiMaxTunerIterations"),
    aiStopOnSuccess: $("#aiStopOnSuccess"),
    aiRunAutonomous: $("#aiRunAutonomous"),
    aiStopAutonomous: $("#aiStopAutonomous"),
    aiBudgetMode: $("#aiBudgetMode"),
    aiBudgetStatus: $("#aiBudgetStatus"),
    aiExpertAnalysis: $("#aiExpertAnalysis"),
    aiAllowTools: $("#aiAllowTools"),
    aiRequireApproval: $("#aiRequireApproval"),
    aiChatHistory: $("#aiChatHistory"),
    aiAutonomousLog: $("#aiAutonomousLog"),
    aiUsageLog: $("#aiUsageLog"),
    aiUsageSummary: $("#aiUsageSummary"),
    aiActionQueue: $("#aiActionQueue"),
    aiChatForm: $("#aiChatForm"),
    aiChatInput: $("#aiChatInput"),
    aiSend: $("#aiSend"),
    aiStatus: $("#aiStatus"),

    stockLibraryModal: $("#stockLibraryModal"),
    stockClose: $("#stockClose"),
    stockSearch: $("#stockSearch"),
    stockSupplierFilter: $("#stockSupplierFilter"),
    stockTypeFilter: $("#stockTypeFilter"),
    stockMaterialFilter: $("#stockMaterialFilter"),
    stockCoatingFilter: $("#stockCoatingFilter"),
    stockDiameterMin: $("#stockDiameterMin"),
    stockDiameterMax: $("#stockDiameterMax"),
    stockEflMin: $("#stockEflMin"),
    stockEflMax: $("#stockEflMax"),
    stockMaxPrice: $("#stockMaxPrice"),
    stockAvailabilityFilter: $("#stockAvailabilityFilter"),
    stockConfidenceFilter: $("#stockConfidenceFilter"),
    stockOnlyToggle: $("#stockOnlyToggle"),
    stockLibrarySummary: $("#stockLibrarySummary"),
    stockResults: $("#stockResults"),
    stockImportSupplier: $("#stockImportSupplier"),
    stockImportType: $("#stockImportType"),
    stockImportText: $("#stockImportText"),
    stockParseImport: $("#stockParseImport"),
    stockAddParsed: $("#stockAddParsed"),
    stockExportLibrary: $("#stockExportLibrary"),
    stockImportPreview: $("#stockImportPreview"),
    prototypeBomModal: $("#prototypeBomModal"),
    bomClose: $("#bomClose"),
    prototypeBomSummary: $("#prototypeBomSummary"),
    prototypeBomBody: $("#prototypeBomBody"),
    bomExportJson: $("#bomExportJson"),
    bomExportCsv: $("#bomExportCsv"),
    bomExportLens: $("#bomExportLens"),

    verifyPanel: $("#verifyPanel"),
    verifyControls: $("#verifyControls"),
    btnToggleVerifyPanel: $("#btnToggleVerifyPanel"),
    verifySummary: $("#verifySummary"),
    verifyWave: $("#verifyWave"),
    verifyWaveHelp: $("#verifyWaveHelp"),
    verifyFields: $("#verifyFields"),
    verifyWeights: $("#verifyWeights"),
    verifyVig: $("#verifyVig"),
    verifyPupil: $("#verifyPupil"),
    verifyZoom: $("#verifyZoom"),
    verifyMatchZemaxWave: $("#verifyMatchZemaxWave"),

    toastHost: $("#toastHost"),
  };

  function toast(msg, ms = 2200) {
    if (!ui.toastHost) return;
    const d = document.createElement("div");
    d.className = "toast";
    d.textContent = String(msg || "");
    ui.toastHost.appendChild(d);
    setTimeout(() => {
      d.style.opacity = "0";
      d.style.transform = "translateY(6px)";
      setTimeout(() => d.remove(), 250);
    }, ms);
  }

  let selectedIndex = 0;
  const autoTunerSurfaceLocks = new Map();

  function getAutoTunerSurfaceLock(index) {
    const key = Number(index);
    const lock = autoTunerSurfaceLocks.get(key);
    return {
      R: !!lock?.R,
      t: !!lock?.t,
      ap: !!lock?.ap,
      glass: !!lock?.glass,
    };
  }

  function setAutoTunerSurfaceLock(index, key, value) {
    const i = Number(index);
    if (!Number.isFinite(i) || i < 0) return;
    const k = String(key || "");
    if (!(k === "R" || k === "t" || k === "ap" || k === "glass")) return;
    const lock = getAutoTunerSurfaceLock(i);
    lock[k] = !!value;
    if (lock.R || lock.t || lock.ap || lock.glass) autoTunerSurfaceLocks.set(i, lock);
    else autoTunerSurfaceLocks.delete(i);
  }

  function clearAutoTunerSurfaceLocks() {
    autoTunerSurfaceLocks.clear();
  }

  function pruneAutoTunerSurfaceLocks() {
    const n = Array.isArray(lens?.surfaces) ? lens.surfaces.length : 0;
    for (const i of Array.from(autoTunerSurfaceLocks.keys())) {
      if (i < 0 || i >= n) autoTunerSurfaceLocks.delete(i);
    }
  }

  // -------------------- sensor presets --------------------
 // -------------------- sensor presets --------------------
const SENSOR_PRESETS = {
  "ARRI Alexa Mini (S35)": { w: 28.25, h: 18.17 },
  "ARRI Alexa Mini LF (LF)": { w: 36.7, h: 25.54 },
  "Sony VENICE (FF)": { w: 36.0, h: 24.0 },
  "Fuji GFX (MF)": { w: 43.8, h: 32.9 },

  // ✅ NEW
  "IMAX 15/70 (70mm)": { w: 70.41, h: 56.62 },
  "65mm Analoog (5-perf)": { w: 52.15, h: 23.07 },
  "ARRI ALEXA 265": { w: 54.12, h: 25.58 },
};
  const DEFAULT_SENSOR_PRESET = "ARRI Alexa Mini LF (LF)";

  function populateSensorPresetsSelect() {
    if (!ui.sensorPreset) return;
    const prev = String(ui.sensorPreset.value || "").trim();
    const keys = Object.keys(SENSOR_PRESETS);
    ui.sensorPreset.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
    if (SENSOR_PRESETS[prev]) {
      ui.sensorPreset.value = prev;
    } else if (SENSOR_PRESETS[DEFAULT_SENSOR_PRESET]) {
      ui.sensorPreset.value = DEFAULT_SENSOR_PRESET;
    } else if (keys.length) {
      ui.sensorPreset.value = keys[0];
    }
  }

  function getSensorWH() {
    const wRaw = Number(ui.sensorW?.value || 36.7);
    const hRaw = Number(ui.sensorH?.value || 25.54);
    const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 36.7;
    const h = Number.isFinite(hRaw) && hRaw > 0 ? hRaw : 25.54;
    return { w, h, halfH: Math.max(0.1, h * 0.5), halfW: Math.max(0.1, w * 0.5) };
  }

  const OV_DEFAULT = 1.0; // 1.0 keeps preview framing sensor-filled
  const USABLE_CIRCLE_THRESHOLD_REL = 0.35; // 35% of center illumination

  function updateUsableCircleBadges() {
    const uc = preview.usableCircle;
    if (!uc?.valid) {
      if (ui.ic) ui.ic.textContent = "Image Circle: —";
      if (ui.icTop) ui.icTop.textContent = "IC: —";
      return;
    }
    const leftTxt = `Image Circle: Ø${uc.diameterMm.toFixed(1)}mm`;
    const topTxt = `IC: Ø${uc.diameterMm.toFixed(1)}mm`;
    if (ui.ic) ui.ic.textContent = leftTxt;
    if (ui.icTop) ui.icTop.textContent = topTxt;
  }

  // -------------------- default preview chart (GitHub) --------------------
  const DEFAULT_PREVIEW_URL = "./TVL_Focus_Distortion_Chart_3x2_6000x4000.png";
  const DEFAULT_LENS_URL = "./bijna-goed.json";
  const LAST_LENS_STORAGE_KEY = "tvl_lensbuilder:last_lens:v1";
  preview.sourceUrls.chart = DEFAULT_PREVIEW_URL;

  function syncIMSCellApertureToUI() {
    if (!ui.tbody || !lens?.surfaces?.length) return;
    const i = lens.surfaces.length - 1;
    const s = lens.surfaces[i];
    if (!s || String(s.type).toUpperCase() !== "IMS") return;
    const apInput = ui.tbody.querySelector(`input.cellInput[data-k="ap"][data-i="${i}"]`);
    if (apInput) apInput.value = Number(s.ap || 0).toFixed(2);
  }

  function shouldPreserveIMSAperture() {
    return !!(lens?.import_options?.preserve_ims_aperture);
  }

  function applySensorToIMS(opts = {}) {
    const force = !!opts.force;
    if (!force && shouldPreserveIMSAperture()) return;
    const { halfH } = getSensorWH();
    const ims = lens?.surfaces?.[lens.surfaces.length - 1];
    if (ims && String(ims.type).toUpperCase() === "IMS") {
      ims.ap = halfH;
      ims.ap_optical = halfH;
      if (ims.ap_mech == null) ims.ap_mech = halfH;
      syncIMSCellApertureToUI();
    }
  }

  function applyPreset(name) {
    const p = SENSOR_PRESETS[name] || SENSOR_PRESETS[DEFAULT_SENSOR_PRESET];
    if (ui.sensorW) ui.sensorW.value = p.w.toFixed(2);
    if (ui.sensorH) ui.sensorH.value = p.h.toFixed(2);
    applySensorToIMS();
  }

  // -------------------- glass db --------------------
  const GLASS_DB = {
  // --- baseline ---
  AIR: { nd: 1.0, Vd: 999.0 },

  // --- SCHOTT (heel gangbaar in foto/cine) ---
  "N-BK7HT":   { nd: 1.5168,  Vd: 64.17 },
  "N-BK10":    { nd: 1.49782, Vd: 66.95 },

  "N-K5":      { nd: 1.52249, Vd: 59.48 },
  "N-KF9":     { nd: 1.52346, Vd: 51.54 },
  "N-PK52A":   { nd: 1.49700, Vd: 81.61 },
  "N-ZK7A":    { nd: 1.508054, Vd: 61.04 },

  // Borosilicate / barium crowns
  "N-BAK1":    { nd: 1.5725,  Vd: 57.55 },
  "N-BAK2":    { nd: 1.53996, Vd: 59.71 },
  "N-BAK4":    { nd: 1.56883, Vd: 55.98 },

  // Barium / “BALF”
  "N-BALF4":   { nd: 1.57956, Vd: 53.87 },
  "N-BALF5":   { nd: 1.54739, Vd: 53.63 },

  // Barium flints / special flints
  "N-BAF4":    { nd: 1.60568, Vd: 43.72 },
  "N-BAF10":   { nd: 1.67003, Vd: 47.11 },
  "N-BAF51":   { nd: 1.65224, Vd: 44.96 },
  "N-BAF52":   { nd: 1.60863, Vd: 46.6 },
  "N-BASF2":   { nd: 1.66446, Vd: 36.0 },

  // Dense crowns / short flints / “SK”
  "N-SK2":     { nd: 1.60738, Vd: 56.65 },
  "N-SK4":     { nd: 1.61272, Vd: 58.63 },
  "N-SK5":     { nd: 1.58913, Vd: 61.27 },
  "N-SK11":    { nd: 1.56384, Vd: 60.8 },
  "N-SK14":    { nd: 1.60311, Vd: 60.6 },
  "N-SK16":    { nd: 1.62041, Vd: 60.32 },

  // “SSK” (veel gebruikt als partner in correctiegroepen)
  "N-SSK2":    { nd: 1.62229, Vd: 53.27 },
  "N-SSK5":    { nd: 1.65844, Vd: 50.88 },
  "N-SSK8":    { nd: 1.61773, Vd: 49.83 },

  // “PSK”
  "N-PSK3":    { nd: 1.55232, Vd: 63.46 },
  "N-PSK53A":  { nd: 1.61800, Vd: 63.39 },

  // “KZFS” (correctie / high performance partners)
  "N-KZFS2":   { nd: 1.55836, Vd: 54.01 },
  "N-KZFS4":   { nd: 1.61336, Vd: 44.49 },
  "N-KZFS5":   { nd: 1.65412, Vd: 39.7 },
  "N-KZFS8":   { nd: 1.72047, Vd: 34.7 },

  // “LAK” (lanthanum crowns — super cinema-typisch)
  "N-LAK9":    { nd: 1.69100, Vd: 54.71 },
  "N-LAK10":   { nd: 1.72003, Vd: 50.62 },
  "N-LAK22":   { nd: 1.65113, Vd: 55.89 },
  "N-LAK28":   { nd: 1.74429, Vd: 50.77 },
  "N-LAK34":   { nd: 1.72916, Vd: 54.5 },

  // “LAF” (lanthanum flints)
  "N-LAF2":    { nd: 1.74397, Vd: 44.85 },
  "N-LAF7":    { nd: 1.7495,  Vd: 34.82 },
  "N-LAF21":   { nd: 1.7880,  Vd: 47.49 },
  "N-LAF34":   { nd: 1.7725,  Vd: 49.62 },

  // “LASF” (high-index lanthanum flints — heel veel cinema correctie)
  "N-LASF9":   { nd: 1.85025, Vd: 32.17 },
  "N-LASF40":  { nd: 1.83404, Vd: 37.3 },
  "N-LASF41":  { nd: 1.83501, Vd: 43.13 },
  "N-LASF43":  { nd: 1.8061,  Vd: 40.61 },
  "N-LASF44":  { nd: 1.8042,  Vd: 46.5 },
  "N-LASF45":  { nd: 1.80107, Vd: 34.97 },

  // Classic “F” / “SF” families (flints) — ook super common
  "N-F2":      { nd: 1.62005, Vd: 36.43 },
  "N-FK5":     { nd: 1.48749, Vd: 70.41 },
  "N-FK58":    { nd: 1.45600, Vd: 90.9 },

  "N-SF1":     { nd: 1.71736, Vd: 29.62 },
  "N-SF2":     { nd: 1.64769, Vd: 33.82 },
  "N-SF4":     { nd: 1.75513, Vd: 27.38 },
  "N-SF5":     { nd: 1.67271, Vd: 32.25 },
  "N-SF6":     { nd: 1.80518, Vd: 25.36 },
  "N-SF8":     { nd: 1.68894, Vd: 31.31 },
  "N-SF10":    { nd: 1.72828, Vd: 28.53 },
  "N-SF11":    { nd: 1.78472, Vd: 25.68 },
  "N-SF15":    { nd: 1.69892, Vd: 30.2 },
  "N-SF57":    { nd: 1.84666, Vd: 23.78 },
  "N-SF66":    { nd: 1.92286, Vd: 20.88 }
};
  // Wavelengths (Fraunhofer + Hg g) nm
  const WL = {
    C: 656.2725,
    d: 587.5618,
    F: 486.1327,
    g: 435.8343,
  };

  // --- Sellmeier + Cauchy dispersion ---
  function sellmeierN_um(glass, lambda_um){
    const s = glass.sellmeier;
    const L2 = lambda_um * lambda_um;
    let n2 = 1.0;
    for (let i=0;i<3;i++){
      n2 += (s.B[i] * L2) / (L2 - s.C[i]);
    }
    return Math.sqrt(n2);
  }

  function fitCauchyFrom3(nC, nd, nF){
    const lC = WL.C / 1000, ld = WL.d / 1000, lF = WL.F / 1000;
    const M = [
      [1, 1/(lC*lC), 1/(lC*lC*lC*lC)],
      [1, 1/(ld*ld), 1/(ld*ld*ld*ld)],
      [1, 1/(lF*lF), 1/(lF*lF*lF*lF)],
    ];
    const y = [nC, nd, nF];

    const A = M.map(r=>r.slice());
    const b = y.slice();

    for (let i=0;i<3;i++){
      let piv=i;
      for (let r=i+1;r<3;r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv=r;
      if (piv!==i){ [A[i],A[piv]]=[A[piv],A[i]]; [b[i],b[piv]]=[b[piv],b[i]]; }

      const div = A[i][i] || 1e-12;
      for (let j=i;j<3;j++) A[i][j] /= div;
      b[i] /= div;

      for (let r=0;r<3;r++){
        if (r===i) continue;
        const f = A[r][i];
        for (let j=i;j<3;j++) A[r][j] -= f*A[i][j];
        b[r] -= f*b[i];
      }
    }
    return { A:b[0], B:b[1], C:b[2] };
  }

  function cauchyN_um(cfit, lambda_um){
    const L2 = lambda_um*lambda_um;
    return cfit.A + cfit.B/L2 + cfit.C/(L2*L2);
  }

  const _cauchyCache = new Map();

  function glassN_fromNdVd(ndRaw, vdRaw, lambdaNm) {
    const nd = Number(ndRaw);
    if (!Number.isFinite(nd) || nd <= 1) return 1.0;
    const Vd = (Number.isFinite(Number(vdRaw)) && Number(vdRaw) > 0) ? Number(vdRaw) : 999;

    const key = `custom_ndvd::${nd.toFixed(8)}::${Vd.toFixed(8)}`;
    let fit = _cauchyCache.get(key);
    if (!fit) {
      const dN = (nd - 1) / Math.max(10, Vd);
      const nF = nd + 0.6 * dN;
      const nC = nd - 0.4 * dN;
      fit = fitCauchyFrom3(nC, nd, nF);
      _cauchyCache.set(key, fit);
    }
    return cauchyN_um(fit, lambdaNm / 1000);
  }

  function getSurfaceCustomGlass(surface) {
    if (!surface || typeof surface !== "object") return null;
    const nd = Number(surface.nd ?? surface.glass_nd);
    if (!Number.isFinite(nd) || nd <= 1) return null;
    const vdRaw = Number(surface.vd ?? surface.glass_vd);
    const Vd = (Number.isFinite(vdRaw) && vdRaw > 0) ? vdRaw : 999;
    return { nd, Vd };
  }

  function glassN_lambda(glassName, lambdaNm){
    const g = GLASS_DB[glassName] || GLASS_DB.AIR;
    if (glassName === "AIR") return 1.0;

    const lambda_um = lambdaNm / 1000;

    if (g.sellmeier && g.sellmeier.B && g.sellmeier.C){
      return sellmeierN_um(g, lambda_um);
    }

    const key = glassName + "::cauchy";
    let fit = _cauchyCache.get(key);
    if (!fit){
      const nd = Number(g.nd || 1.5168);
      const Vd = Math.max(10, Number(g.Vd || 50));
      const dN = (nd - 1) / Vd; // nF - nC
      const nF = nd + 0.6 * dN;
      const nC = nd - 0.4 * dN;
      fit = fitCauchyFrom3(nC, nd, nF);
      _cauchyCache.set(key, fit);
    }
    return cauchyN_um(fit, lambda_um);
  }

  function wavePresetToLambdaNm(w){
    const ww = String(w || "d");
    if (ww === "zemax_pwav") {
      const z = Number(lens?.zemax?.primaryWavelengthNm);
      if (Number.isFinite(z) && z > 0) return z;
      return WL.d;
    }
    const mNm = ww.match(/^nm:\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)$/i);
    if (mNm) {
      const nm = Number(mNm[1]);
      if (Number.isFinite(nm) && nm > 0) return nm;
    }
    const asNum = Number(ww);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    if (ww === "c" || ww === "C") return WL.C;
    if (ww === "F") return WL.F;
    if (ww === "g") return WL.g;
    return WL.d;
  }

  function getActiveAnalysisLambdaNm({ preferZemax = false } = {}) {
    if (preferZemax === true) {
      const z = Number(lens?.zemax?.primaryWavelengthNm);
      if (Number.isFinite(z) && z > 0) return z;
    }
    const preset = ui.wavePreset?.value || "d";
    return wavePresetToLambdaNm(preset);
  }

  function ensureWavePresetOptionForNm(nm, labelPrefix = "Custom") {
    if (!ui.wavePreset) return null;
    const n = Number(nm);
    if (!Number.isFinite(n) || n <= 0) return null;

    const value = `nm:${n.toFixed(3)}`;
    let opt = Array.from(ui.wavePreset.options).find((o) => String(o.value) === value);
    if (!opt) {
      opt = document.createElement("option");
      opt.value = value;
      ui.wavePreset.appendChild(opt);
    }
    opt.textContent = `${labelPrefix} (${n.toFixed(1)}nm)`;
    return value;
  }

  function ensureZemaxPrimaryWaveOption() {
    if (!ui.wavePreset) return;
    const nm = Number(lens?.zemax?.primaryWavelengthNm);
    const value = "zemax_pwav";
    const existing = Array.from(ui.wavePreset.options).find((o) => String(o.value) === value);
    if (!(Number.isFinite(nm) && nm > 0)) {
      if (existing) existing.remove();
      if (ui.wavePreset.value === value) ui.wavePreset.value = "d";
      return;
    }
    let opt = existing;
    if (!opt) {
      opt = document.createElement("option");
      opt.value = value;
      ui.wavePreset.appendChild(opt);
    }
    opt.textContent = `Zemax PWAV (${nm.toFixed(1)}nm) — imported primary wavelength`;
  }

  function setVisibleDefaultWavePresetAfterZemaxImport() {
    if (!ui.wavePreset) return;
    const pwavNm = Number(lens?.zemax?.primaryWavelengthNm);
    // Keep visible-light default for preview/sanity; Zemax PWAV remains selectable.
    if (Number.isFinite(pwavNm) && Math.abs(pwavNm - WL.d) < 1.0) {
      ui.wavePreset.value = "d";
      return;
    }
    ui.wavePreset.value = "d";
  }

  function setWavePresetFromNm(nm, labelPrefix = "Custom") {
    if (!ui.wavePreset) return;
    const n = Number(nm);
    if (!Number.isFinite(n) || n <= 0) return;

    if (Math.abs(n - WL.d) < 1.0) { ui.wavePreset.value = "d"; return; }
    if (Math.abs(n - WL.g) < 1.0) { ui.wavePreset.value = "g"; return; }
    if (Math.abs(n - WL.C) < 1.0) { ui.wavePreset.value = "c"; return; }
    if (Math.abs(n - WL.F) < 1.0) { ui.wavePreset.value = "F"; return; }

    const v = ensureWavePresetOptionForNm(n, labelPrefix);
    if (v) ui.wavePreset.value = v;
  }

function glassN(glassName, wavePresetOrNm = "d") {
  // accepteer zowel "d"/"c"/"F"/"g" ALS lambdaNm als number
  const lambdaNm =
    (typeof wavePresetOrNm === "number" && Number.isFinite(wavePresetOrNm))
      ? wavePresetOrNm
      : wavePresetToLambdaNm(wavePresetOrNm);

  if (glassName && typeof glassName === "object") {
    const custom = getSurfaceCustomGlass(glassName);
    if (custom) return glassN_fromNdVd(custom.nd, custom.Vd, lambdaNm);

    const fallbackName = String(glassName.glass ?? "AIR");
    const key = resolveGlassName(fallbackName);
    if (key === "AIR" && fallbackName !== "AIR") warnMissingGlass(fallbackName);
    return glassN_lambda(key, lambdaNm);
  }

  // resolve aliases + waarschuwing als onbekend
  const key = resolveGlassName(String(glassName ?? "AIR"));
  if (key === "AIR" && glassName !== "AIR") warnMissingGlass(glassName);

  // echte dispersie (Sellmeier indien aanwezig, anders Cauchy-fit)
  return glassN_lambda(key, lambdaNm);
}

function surfaceN(surface, wavePresetOrNm = "d") {
  const custom = getSurfaceCustomGlass(surface);
  if (custom) {
    const lambdaNm =
      (typeof wavePresetOrNm === "number" && Number.isFinite(wavePresetOrNm))
        ? wavePresetOrNm
        : wavePresetToLambdaNm(wavePresetOrNm);
    return glassN_fromNdVd(custom.nd, custom.Vd, lambdaNm);
  }
  return glassN(String(surface?.glass ?? "AIR"), wavePresetOrNm);
}

   // -------------------- GLASS ALIASES (keep existing preset names working) --------------------
const GLASS_ALIASES = {
  // element modal defaults
  "N-BK7": "N-BK7HT",
  BK7: "N-BK7HT",
  F2: "N-F2",
  SF2: "N-SF2",
  SF5: "N-SF5",
  SF6: "N-SF6",
  "N-SF6HT": "N-SF6",
  SF6HT: "N-SF6",

  // your preset names
  LASF35: "N-LASF43",     // kies de beste match in jouw DB
  LASFN31: "N-LASF43",    // idem
  LF5: "N-SF5",           // of N-F2 als je liever minder extreme flint wil

  // SCHOTT / OHARA style names you used
  "S-LAM3": "N-LAK9",     // lanthanum crown-ish
  "S-BAH11": "N-BAK4"     // barium crown-ish (of N-BAF10 als je meer flint wil)
};

function normalizeGlassInput(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return "AIR";
  if (GLASS_DB[raw] || GLASS_ALIASES[raw]) return raw;
  const up = raw.toUpperCase();
  if (GLASS_DB[up] || GLASS_ALIASES[up]) return up;
  return raw;
}

function getGlassOptionNames(surfaces = []) {
  const names = new Set(["AIR"]);
  Object.keys(GLASS_ALIASES).forEach((k) => names.add(k));
  Object.keys(GLASS_DB).forEach((k) => names.add(k));
  (surfaces || []).forEach((s) => names.add(normalizeGlassInput(s?.glass)));

  return Array.from(names).sort((a, b) => {
    if (a === "AIR") return -1;
    if (b === "AIR") return 1;
    return a.localeCompare(b);
  });
}

// helper: resolve any name to a real GLASS_DB key
function resolveGlassName(name) {
  const key = normalizeGlassInput(name);
  if (GLASS_DB[key]) return key;
  const alias = GLASS_ALIASES[key];
  if (alias && GLASS_DB[alias]) return alias;
  return "AIR";
}

// OPTIONAL: warn once per missing glass, so you immediately see what's broken
const _glassWarned = new Set();
function warnMissingGlass(name) {
  if (!_glassWarned.has(name)) {
    _glassWarned.add(name);
    console.warn(`[GLASS_DB] Unknown glass "${name}" (resolved to AIR). Add alias or DB entry.`);
  }
}

  // -------------------- built-in lenses --------------------
  function demoLensSimple() {
    return {
      name: "Demo (simple)",
      surfaces: [
        { type: "OBJ", R: 0.0, t: 10.0, ap: 22.0, glass: "AIR", stop: false },
        { type: "1", R: 42.0, t: 10.0, ap: 22.0, glass: "LASF35", stop: false },
        { type: "2", R: -140.0, t: 10.0, ap: 21.0, glass: "AIR", stop: false },
        { type: "3", R: -30.0, t: 10.0, ap: 19.0, glass: "LASFN31", stop: false },
        { type: "STOP", R: 0.0, t: 10.0, ap: 14.0, glass: "AIR", stop: true },
        { type: "5", R: 12.42, t: 10.0, ap: 8.5, glass: "AIR", stop: false },
        { type: "AST", R: 0.0, t: 6.4, ap: 8.5, glass: "AIR", stop: false },
        { type: "7", R: -18.93, t: 10.0, ap: 11.0, glass: "LF5", stop: false },
        { type: "8", R: 59.6, t: 10.0, ap: 13.0, glass: "LASFN31", stop: false },
        { type: "9", R: -40.49, t: 10.0, ap: 13.0, glass: "AIR", stop: false },
        { type: "IMS", R: 0.0, t: 0.0, ap: 12.0, glass: "AIR", stop: false },
      ],
    };
  }

  function omit50ConceptV1() {
    return {
      name: "OMIT 50mm (concept v1 — scaled Double-Gauss base)",
      notes: [
        "Scaled from Double-Gauss base; used as geometric sanity for this 2D meridional tracer.",
        "Not optimized; coatings/stop/entrance pupil are not modeled.",
      ],
      surfaces: [
        { type: "OBJ", R: 0.0, t: 0.0, ap: 60.0, glass: "AIR", stop: false },

        { type: "1", R: 37.4501, t: 4.49102, ap: 16.46707, glass: "S-LAM3", stop: false },
        { type: "2", R: 135.07984, t: 0.0499, ap: 16.46707, glass: "AIR", stop: false },

        { type: "3", R: 19.59581, t: 8.23852, ap: 13.72255, glass: "S-BAH11", stop: false },
        { type: "4", R: 0.0, t: 0.998, ap: 12.22555, glass: "N-SF5", stop: false },

        { type: "5", R: 12.7994, t: 5.48403, ap: 9.73054, glass: "AIR", stop: false },

        { type: "STOP", R: 0.0, t: 6.48703, ap: 9.28144, glass: "AIR", stop: true },

        { type: "7", R: -15.90319, t: 3.50798, ap: 9.23154, glass: "N-SF5", stop: false },
        { type: "8", R: 0.0, t: 4.48104, ap: 10.47904, glass: "S-LAM3", stop: false },
        { type: "9", R: -21.71158, t: 0.0499, ap: 10.47904, glass: "AIR", stop: false },

        { type: "10", R: 110.3493, t: 3.98204, ap: 11.47705, glass: "S-BAH11", stop: false },
        { type: "11", R: -44.30639, t: 30.6477, ap: 11.47705, glass: "AIR", stop: false },

        { type: "IMS", R: 0.0, t: 0.0, ap: 12.77, glass: "AIR", stop: false },
      ],
    };
  }

  // -------------------- sanitize/load --------------------
  const DRAW_MODE_SET = new Set(["optical", "mechanical", "zemax_like"]);
  const SHOULDER_MODE_SET = new Set(["none", "flat", "step", "bridge"]);
  const EDGE_THICKNESS_MODE_SET = new Set(["auto", "explicit"]);
  const FOCUS_MODE_IMPORT_SET = new Set(["fixed", "manual", "auto"]);
  const FOCUS_MECH_IMPORT_SET = new Set(["move-lens", "move-ims", "move-focus-group"]);

  function finiteNumberOr(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function enumOr(v, allowed, fallback) {
    const s = String(v ?? "").trim().toLowerCase();
    return allowed.has(s) ? s : fallback;
  }

  function sanitizeFocusModeImport(raw) {
    return enumOr(raw, FOCUS_MODE_IMPORT_SET, "auto");
  }

  function sanitizeFocusMechanismImport(raw) {
    return enumOr(raw, FOCUS_MECH_IMPORT_SET, "move-lens");
  }

  function normalizeSurfaceApertures(src, importOptions) {
    const fromDiam = Number(src?.DIAM);
    const importAp = Number.isFinite(fromDiam) ? Math.abs(fromDiam) : null;

    const apOptical = Math.max(0.01, finiteNumberOr(src?.ap_optical, finiteNumberOr(src?.ap, importAp ?? 10)));

    const hasExplicitMech =
      src &&
      Object.prototype.hasOwnProperty.call(src, "ap_mech") &&
      src.ap_mech != null &&
      String(src.ap_mech).trim() !== "";
    let apMech = null;
    if (hasExplicitMech) {
      const m = Number(src.ap_mech);
      apMech = Number.isFinite(m) ? Math.max(0.01, m) : null;
    } else if (importAp != null) {
      if (importOptions?.use_same_ap_for_optics_and_mechanics === false) {
        apMech = Math.max(0.01, importAp);
      } else {
        apMech = apOptical;
      }
    }

    return {
      ap: apOptical, // backwards-compatible alias used by existing optical code
      ap_optical: apOptical,
      ap_mech: apMech, // null => follow optical aperture
    };
  }

  function sanitizeZemaxMeta(z) {
    if (!z || typeof z !== "object") return null;
    const toFiniteList = (arr, mapper = (x) => x) =>
      (Array.isArray(arr) ? arr : [])
        .map((v, i) => mapper(v, i))
        .filter((v) => v != null);

    const wavelengthsNm = toFiniteList(z.wavelengthsNm, (v) => {
      const n = Number(v);
      return (Number.isFinite(n) && n > 0) ? n : null;
    });
    const primaryWavelengthIndex = Number(z.primaryWavelengthIndex);
    const primaryWavelengthNmRaw = Number(z.primaryWavelengthNm);
    const primaryWavelengthNm = (Number.isFinite(primaryWavelengthNmRaw) && primaryWavelengthNmRaw > 0)
      ? primaryWavelengthNmRaw
      : (Number.isInteger(primaryWavelengthIndex) && primaryWavelengthIndex > 0 && wavelengthsNm[primaryWavelengthIndex - 1] != null
        ? wavelengthsNm[primaryWavelengthIndex - 1]
        : null);

    const fields = toFiniteList(z.fields, (f, idx) => {
      const angle = Number(f?.angleDeg ?? f?.fieldDeg ?? f);
      if (!Number.isFinite(angle)) return null;
      const weightRaw = Number(f?.weight);
      const weight = Number.isFinite(weightRaw) ? Math.max(0, weightRaw) : 1;
      const vdx = Number(f?.vdx);
      const vdy = Number(f?.vdy);
      const vcx = Number(f?.vcx);
      const vcy = Number(f?.vcy);
      return {
        index: Number.isFinite(Number(f?.index)) ? Number(f.index) : idx,
        angleDeg: angle,
        weight,
        vdx: Number.isFinite(vdx) ? vdx : 0,
        vdy: Number.isFinite(vdy) ? vdy : 0,
        vcx: Number.isFinite(vcx) ? vcx : 0,
        vcy: Number.isFinite(vcy) ? vcy : 0,
      };
    });

    const maxFieldAngleDeg = fields.length
      ? Math.max(...fields.map((f) => Math.abs(Number(f.angleDeg) || 0)))
      : null;

    const zoomConfigCountRaw = Number(z.zoomConfigCount);
    const zoomConfigCount = Number.isFinite(zoomConfigCountRaw)
      ? Math.max(0, Math.trunc(zoomConfigCountRaw))
      : null;
    const currentConfigIndexRaw = Number(z.currentConfigIndex);
    const currentConfigIndex = Number.isFinite(currentConfigIndexRaw)
      ? Math.max(1, Math.trunc(currentConfigIndexRaw))
      : null;
    const currentConfigLabel = (z?.currentConfigLabel != null && String(z.currentConfigLabel).trim() !== "")
      ? String(z.currentConfigLabel).trim()
      : null;
    const configApertureRaw = Number(z.configAperture);
    const configAperture = Number.isFinite(configApertureRaw) ? configApertureRaw : null;
    const imsSurfaceNumberRaw = Number(z.imsSurfaceNumber);
    const imsSurfaceNumber = Number.isFinite(imsSurfaceNumberRaw) ? Math.max(0, Math.trunc(imsSurfaceNumberRaw)) : null;
    const baseFields = toFiniteList(z.baseFields, (f, idx) => {
      const angle = Number(f?.angleDeg ?? f?.fieldDeg ?? f);
      if (!Number.isFinite(angle)) return null;
      const weightRaw = Number(f?.weight);
      const weight = Number.isFinite(weightRaw) ? Math.max(0, weightRaw) : 1;
      const vdx = Number(f?.vdx);
      const vdy = Number(f?.vdy);
      const vcx = Number(f?.vcx);
      const vcy = Number(f?.vcy);
      return {
        index: Number.isFinite(Number(f?.index)) ? Number(f.index) : idx,
        angleDeg: angle,
        weight,
        vdx: Number.isFinite(vdx) ? vdx : 0,
        vdy: Number.isFinite(vdy) ? vdy : 0,
        vcx: Number.isFinite(vcx) ? vcx : 0,
        vcy: Number.isFinite(vcy) ? vcy : 0,
      };
    });

    return {
      source: String(z.source || "zemax"),
      name: (z?.name != null && String(z.name).trim() !== "") ? String(z.name).trim() : null,
      version: (z?.version != null && String(z.version).trim() !== "") ? String(z.version).trim() : null,
      mode: (z?.mode != null && String(z.mode).trim() !== "") ? String(z.mode).trim().toUpperCase() : null,
      fieldType: String(z.fieldType || "angle_deg"),
      wavelengthsNm,
      primaryWavelengthIndex: Number.isInteger(primaryWavelengthIndex) ? primaryWavelengthIndex : null,
      primaryWavelengthNm,
      fields,
      maxFieldAngleDeg,
      zoomConfigCount,
      currentConfigIndex,
      currentConfigLabel,
      configAperture,
      imsSurfaceNumber,
      baseFields,
    };
  }

  function sanitizeZoomFieldOverrideMap(src) {
    const out = {};
    const obj = (src && typeof src === "object") ? src : {};
    for (const [k, v] of Object.entries(obj)) {
      const keyNum = Number(k);
      const valNum = Number(v);
      if (!Number.isFinite(keyNum) || !Number.isFinite(valNum)) continue;
      out[String(Math.max(0, Math.trunc(keyNum)))] = valNum;
    }
    return out;
  }

  function sanitizeZoomModel(z) {
    if (!z || typeof z !== "object") return null;
    const rawConfigs = Array.isArray(z.configs) ? z.configs : [];
    const configs = rawConfigs
      .map((cfg, idx) => {
        const indexRaw = Number(cfg?.index);
        const index = Number.isFinite(indexRaw) ? Math.max(1, Math.trunc(indexRaw)) : (idx + 1);
        const label = (cfg?.label != null && String(cfg.label).trim() !== "")
          ? String(cfg.label).trim()
          : null;
        const apertureRaw = Number(cfg?.aperture);
        const aperture = Number.isFinite(apertureRaw) ? apertureRaw : null;

        const thicRaw = (cfg?.thicknessOverrides && typeof cfg.thicknessOverrides === "object")
          ? cfg.thicknessOverrides
          : {};
        const thicknessOverrides = {};
        for (const [k, v] of Object.entries(thicRaw)) {
          const surfNo = Number(k);
          const val = Number(v);
          if (!Number.isFinite(surfNo) || !Number.isFinite(val)) continue;
          thicknessOverrides[String(Math.max(0, Math.trunc(surfNo)))] = val;
        }

        const fov = (cfg?.fieldOverrides && typeof cfg.fieldOverrides === "object")
          ? cfg.fieldOverrides
          : {};
        const fieldOverrides = {
          vdx: sanitizeZoomFieldOverrideMap(fov.vdx),
          vdy: sanitizeZoomFieldOverrideMap(fov.vdy),
          vcx: sanitizeZoomFieldOverrideMap(fov.vcx),
          vcy: sanitizeZoomFieldOverrideMap(fov.vcy),
        };

        const overrideSurfaceNumbers = Object.keys(thicknessOverrides)
          .map((k) => Number(k))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);

        return {
          index,
          label,
          aperture,
          thicknessOverrides,
          fieldOverrides,
          overrideSurfaceNumbers,
        };
      })
      .sort((a, b) => a.index - b.index);

    if (!configs.length) return null;
    const activeRaw = Number(z.activeConfig);
    const activeConfig = configs.some((c) => c.index === activeRaw)
      ? activeRaw
      : configs[0].index;

    return { activeConfig, configs };
  }

  function isAirSurfaceMedium(surface) {
    return String(surface?.glass ?? "AIR").trim().toUpperCase() === "AIR";
  }

  function isReservedSurfaceType(typeRaw) {
    const t = String(typeRaw || "").trim().toUpperCase();
    return t === "OBJ" || t === "IMS" || t === "STOP" || t === "MECH" || t === "BAFFLE" || t === "HOUSING";
  }

  function isAutoSurfaceLabelCandidate(surface) {
    const label = String(surface?.surfaceLabel ?? surface?.label ?? "").trim();
    const type = String(surface?.type ?? "").trim();
    if (!label) return true;
    if (surface?.surfaceLabelAuto) return true;
    if (/^\d+$/.test(label) || /^S\d+$/i.test(label)) return true;
    if (/^L\d+[A-Z]?(?:\/L\d+[A-Z]?)?\s+(?:FRONT|REAR|CEMENT)$/i.test(label)) return true;
    return /^\d+$/.test(type) && label === type;
  }

  function setSurfaceAutoLabel(surface, label, force = false) {
    if (!surface || typeof surface !== "object") return;
    const clean = String(label || "").trim();
    if (!clean) return;
    if (force || isAutoSurfaceLabelCandidate(surface)) {
      surface.surfaceLabel = clean;
      surface.surfaceLabelAuto = true;
    }
  }

  function assignElementGroupLabels(surfaces, startIdx, endIdx, elementNo, force = false) {
    const count = endIdx - startIdx + 1;
    if (count <= 0) return;
    if (count === 1) {
      setSurfaceAutoLabel(surfaces[startIdx], `L${elementNo} S1`, force);
      return;
    }
    if (count === 2) {
      setSurfaceAutoLabel(surfaces[startIdx], `L${elementNo} FRONT`, force);
      setSurfaceAutoLabel(surfaces[endIdx], `L${elementNo} REAR`, force);
      return;
    }
    for (let i = startIdx; i <= endIdx; i++) {
      const offset = i - startIdx;
      const letter = String.fromCharCode(65 + Math.min(offset, 25));
      if (i === startIdx) {
        setSurfaceAutoLabel(surfaces[i], `L${elementNo}${letter} FRONT`, force);
      } else if (i === endIdx) {
        const rearLetter = String.fromCharCode(65 + Math.min(offset - 1, 25));
        setSurfaceAutoLabel(surfaces[i], `L${elementNo}${rearLetter} REAR`, force);
      } else {
        const prevLetter = String.fromCharCode(65 + Math.min(offset - 1, 25));
        setSurfaceAutoLabel(surfaces[i], `L${elementNo}${prevLetter}/L${elementNo}${letter} CEMENT`, force);
      }
    }
  }

  function generateSurfaceLabels(surfaces, options = {}) {
    if (!Array.isArray(surfaces)) return surfaces;
    const force = !!options.force;
    let elementNo = 0;
    let fallbackNo = 1;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      if (!s || typeof s !== "object") continue;

      const type = String(s.type || "").trim().toUpperCase();
      if (i === 0 || type === "OBJ") {
        setSurfaceAutoLabel(s, "OBJ", true);
        continue;
      }
      if (i === surfaces.length - 1 || type === "IMS") {
        setSurfaceAutoLabel(s, "IMS", true);
        continue;
      }
      if (s.stop || type === "STOP") {
        setSurfaceAutoLabel(s, "STOP", true);
        continue;
      }
      if (isReservedSurfaceType(type)) {
        setSurfaceAutoLabel(s, type, force);
        continue;
      }

      const mediumBeforeIsAir = i === 0 || isAirSurfaceMedium(surfaces[i - 1]);
      const mediumAfterIsAir = isAirSurfaceMedium(s);
      if (mediumBeforeIsAir && !mediumAfterIsAir) {
        let endIdx = i;
        for (let j = i + 1; j < surfaces.length; j++) {
          const next = surfaces[j];
          const nextType = String(next?.type || "").trim().toUpperCase();
          if (!next || next.stop || nextType === "STOP" || nextType === "IMS" || nextType === "OBJ") break;
          endIdx = j;
          if (isAirSurfaceMedium(next)) break;
        }
        elementNo += 1;
        assignElementGroupLabels(surfaces, i, endIdx, elementNo, force);
        i = endIdx;
        continue;
      }

      setSurfaceAutoLabel(s, `S${fallbackNo++}`, force);
    }
    return surfaces;
  }

  function getSurfaceDisplayLabel(surface, index = 0) {
    const label = String(surface?.surfaceLabel ?? surface?.label ?? "").trim();
    if (label) return label;
    const type = String(surface?.type ?? "").trim();
    if (type) return type;
    return `S${index}`;
  }

  function escapeAttr(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function sanitizeLens(obj) {
  const rawAutofocusMode = String(obj?.import_options?.autofocus_mode || "").trim().toLowerCase();
  const autofocusMode = (
    rawAutofocusMode === "chart-mid" ||
    rawAutofocusMode === "chart-edge" ||
    rawAutofocusMode === "chart-grid" ||
    rawAutofocusMode === "scene-center" ||
    rawAutofocusMode === "chart-center"
  ) ? rawAutofocusMode : "chart-center";

  const importOptions = {
    use_same_ap_for_optics_and_mechanics:
      obj?.import_options?.use_same_ap_for_optics_and_mechanics !== false,
    preserve_ims_aperture:
      obj?.import_options?.preserve_ims_aperture === true,
    use_zemax_fields:
      obj?.import_options?.use_zemax_fields === true,
    match_zemax_wavelength:
      obj?.import_options?.match_zemax_wavelength === true,
    autofocus_mode: autofocusMode,
  };

  const focusMode = sanitizeFocusModeImport(
    obj?.focusMode ?? obj?.focus_mode ?? obj?.focus?.mode
  );
  const focusMechanism = sanitizeFocusMechanismImport(
    obj?.focusMechanism ?? obj?.focus_mechanism ?? obj?.focus?.mechanism
  );
  const focusShiftRaw = Number(
    obj?.focusShiftMm ??
    obj?.focus_shift_mm ??
    obj?.focus?.shiftMm ??
    obj?.focus?.shift_mm ??
    obj?.lensFocus ??
    0
  );
  const focusShiftMm = Number.isFinite(focusShiftRaw) ? focusShiftRaw : 0;
  const autoRefocusOnDistanceChange = (
    obj?.autoRefocusOnDistanceChange ??
    obj?.auto_refocus_on_distance_change ??
    obj?.focus?.autoRefocusOnDistanceChange ??
    true
  ) !== false;

  const safe = {
    name: String(obj?.name ?? "No name"),
    notes: Array.isArray(obj?.notes) ? obj.notes.map(String) : [],
    surfaces: Array.isArray(obj?.surfaces) ? obj.surfaces : [],
    import_options: importOptions,
    importSource: (obj?.importSource != null && String(obj.importSource).trim() !== "")
      ? String(obj.importSource).trim()
      : null,
    originalZmxText: (obj?.originalZmxText != null && String(obj.originalZmxText).trim() !== "")
      ? String(obj.originalZmxText)
      : null,
    zemaxName: (obj?.zemaxName != null && String(obj.zemaxName).trim() !== "")
      ? String(obj.zemaxName).trim()
      : null,
    zemaxVersion: (obj?.zemaxVersion != null && String(obj.zemaxVersion).trim() !== "")
      ? String(obj.zemaxVersion).trim()
      : null,
    sourceType: (obj?.sourceType != null && String(obj.sourceType).trim() !== "")
      ? String(obj.sourceType).trim()
      : null,
    referenceName: (obj?.referenceName != null && String(obj.referenceName).trim() !== "")
      ? String(obj.referenceName).trim()
      : null,
    designFamily: (obj?.designFamily != null && String(obj.designFamily).trim() !== "")
      ? String(obj.designFamily).trim()
      : null,
    accuracyLabel: (obj?.accuracyLabel != null && String(obj.accuracyLabel).trim() !== "")
      ? String(obj.accuracyLabel).trim()
      : null,
    referenceIntent: (obj?.referenceIntent && typeof obj.referenceIntent === "object")
      ? clone(obj.referenceIntent)
      : null,
    stockPrototype: (obj?.stockPrototype && typeof obj.stockPrototype === "object")
      ? clone(obj.stockPrototype)
      : { enabled: obj?.stockPrototypeMode === true },
    zemax: sanitizeZemaxMeta(obj?.zemax),
    zoom: sanitizeZoomModel(obj?.zoom),
    focus: {
      mode: focusMode,
      mechanism: focusMechanism,
      shiftMm: focusShiftMm,
      autoRefocusOnDistanceChange,
    },
  };
  if (!safe.zemaxName && safe.zemax?.name) safe.zemaxName = String(safe.zemax.name);
  if (!safe.zemaxVersion && safe.zemax?.version) safe.zemaxVersion = String(safe.zemax.version);

  safe.surfaces = safe.surfaces.map((s) => {
    const aps = normalizeSurfaceApertures(s, importOptions);
    const glassNdRaw = Number(s?.nd ?? s?.glass_nd ?? s?.zmx?.nd ?? s?.zmx?.glass_nd);
    const glassVdRaw = Number(s?.vd ?? s?.glass_vd ?? s?.zmx?.vd ?? s?.zmx?.Vd ?? s?.zmx?.glass_vd);
    const glassNd = (Number.isFinite(glassNdRaw) && glassNdRaw > 1) ? glassNdRaw : null;
    const glassVd = (glassNd != null)
      ? ((Number.isFinite(glassVdRaw) && glassVdRaw > 0) ? glassVdRaw : 999)
      : null;
    const originalGlass = (() => {
      if (s?.originalGlass != null && String(s.originalGlass).trim() !== "") return String(s.originalGlass).trim();
      if (s?.original_glass != null && String(s.original_glass).trim() !== "") return String(s.original_glass).trim();
      if (s?.zmx?.glass_name != null && String(s.zmx.glass_name).trim() !== "") return String(s.zmx.glass_name).trim();
      return String(s?.glass ?? "").trim() || null;
    })();
    return {
      type: String(s?.type ?? ""),
      surfaceLabel: String(s?.surfaceLabel ?? s?.label ?? "").trim(),
      surfaceLabelAuto: Boolean(s?.surfaceLabelAuto ?? false),
      R: Number(s?.R ?? 0),
      t: Number(s?.t ?? 0),
      ap: aps.ap,
      ap_optical: aps.ap_optical,
      ap_mech: aps.ap_mech,
      draw_mode: enumOr(s?.draw_mode, DRAW_MODE_SET, "zemax_like"),
      shoulder_depth: Math.max(0, finiteNumberOr(s?.shoulder_depth, 0)),
      shoulder_mode: enumOr(s?.shoulder_mode, SHOULDER_MODE_SET, "none"),
      bevel: Math.max(0, finiteNumberOr(s?.bevel, 0)),
      edge_thickness_mode: enumOr(s?.edge_thickness_mode, EDGE_THICKNESS_MODE_SET, "auto"),
      edge_thickness: (() => {
        const et = Number(s?.edge_thickness);
        return Number.isFinite(et) ? Math.max(0, et) : null;
      })(),
      glass: normalizeGlassInput(s?.glass),
      originalGlass,
      nd: glassNd,
      vd: glassVd,
      glass_nd: glassNd,
      glass_vd: glassVd,
      stop: Boolean(s?.stop ?? false),
      stockElementGroupId: (s?.stockElementGroupId != null && String(s.stockElementGroupId).trim() !== "")
        ? String(s.stockElementGroupId)
        : null,
      stockElementSurfaceIndex: Number.isFinite(Number(s?.stockElementSurfaceIndex)) ? Number(s.stockElementSurfaceIndex) : null,
      stockElementSurfaceRole: (s?.stockElementSurfaceRole != null && String(s.stockElementSurfaceRole).trim() !== "")
        ? String(s.stockElementSurfaceRole)
        : null,
      stockElementLocked: s?.stockElementLocked === true,
      stockElementRearSurface: s?.stockElementRearSurface === true,
      stockCatalog: (s?.stockCatalog && typeof s.stockCatalog === "object") ? clone(s.stockCatalog) : null,
      stockOrientation: (s?.stockOrientation != null && String(s.stockOrientation).trim() !== "")
        ? String(s.stockOrientation)
        : null,
      stockAirGapAfterMm: Number.isFinite(Number(s?.stockAirGapAfterMm)) ? Number(s.stockAirGapAfterMm) : null,
      customCopyOfStock: (s?.customCopyOfStock && typeof s.customCopyOfStock === "object") ? clone(s.customCopyOfStock) : null,
      zmx: {
        surf: Number.isFinite(Number(s?.zmx?.surf)) ? Number(s.zmx.surf) : null,
        curv: Number.isFinite(Number(s?.zmx?.curv)) ? Number(s.zmx.curv) : null,
        baseCurv: Number.isFinite(Number(s?.zmx?.baseCurv))
          ? Number(s.zmx.baseCurv)
          : (Number.isFinite(Number(s?.zmx?.curv)) ? Number(s.zmx.curv) : null),
        disz: Number.isFinite(Number(s?.zmx?.disz)) ? Number(s.zmx.disz) : null,
        diam: Number.isFinite(Number(s?.zmx?.diam)) ? Number(s.zmx.diam) : null,
        glass_name: (s?.zmx?.glass_name != null && String(s.zmx.glass_name).trim() !== "")
          ? String(s.zmx.glass_name).trim()
          : originalGlass,
        nd: glassNd,
        vd: glassVd,
        glass_nd: glassNd,
        glass_vd: glassVd,
        baseDisz: Number.isFinite(Number(s?.zmx?.baseDisz))
          ? Number(s.zmx.baseDisz)
          : (Number.isFinite(Number(s?.t)) ? Number(s.t) : null),
      },
    };
  });

    const firstStop = safe.surfaces.findIndex((s) => s.stop);
    if (firstStop >= 0) safe.surfaces.forEach((s, i) => { if (i !== firstStop) s.stop = false; });

    if (safe.surfaces.length >= 1) {
    safe.surfaces[0].type = "OBJ";
    // ✅ hard lock
    safe.surfaces[0].t = 0.0;
  }
    if (safe.surfaces.length >= 1) safe.surfaces[safe.surfaces.length - 1].type = "IMS";
    generateSurfaceLabels(safe.surfaces);

    return safe;
  }

  let lens = sanitizeLens(omit50ConceptV1());
  let _lastParaxialFailSignature = "";
  let _lastZemaxTraceDebugSignature = "";
  const HEAVY_RENDER_DEBOUNCE_MS = 180;
  const MAX_AUTOFOCUS_ITERATIONS = 20;
  const MAX_FOCUS_SHIFT_MM = 100;
  const MAX_RAY_STEPS = 200;
  const RUNTIME_BUSY_STORAGE_KEY = "tvl_lensbuilder:runtime_busy:v1";
  let isAutofocusing = false;
  let _safeModeActive = false;
  let _lastStatusWarning = "";

  function getSafeLocalStorage() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      return window.localStorage;
    } catch (_) {
      return null;
    }
  }

  function setStatusWarning(message, { append = false, force = false } = {}) {
    const text = String(message || "").trim();
    if (!text) return;
    if (!force && text === _lastStatusWarning) return;
    _lastStatusWarning = text;
    if (ui.footerWarn) {
      ui.footerWarn.textContent = append && ui.footerWarn.textContent
        ? `${ui.footerWarn.textContent} • ${text}`
        : text;
    }
    console.warn(text);
  }

  function clearStatusWarning() {
    _lastStatusWarning = "";
    if (ui.footerWarn) ui.footerWarn.textContent = "";
  }

  function markRuntimeBusy(reason) {
    const storage = getSafeLocalStorage();
    if (!storage) return;
    try {
      storage.setItem(RUNTIME_BUSY_STORAGE_KEY, JSON.stringify({
        reason: String(reason || "render"),
        at: Date.now(),
      }));
    } catch (_) {}
  }

  function clearRuntimeBusy() {
    const storage = getSafeLocalStorage();
    if (!storage) return;
    try { storage.removeItem(RUNTIME_BUSY_STORAGE_KEY); } catch (_) {}
  }

  // -------------------- deterministic stock optical element library --------------------
  const STOCK_LIBRARY_STORAGE_KEY = "tvl_lensbuilder:stock_element_library:v1";
  const STOCK_TYPES = new Set([
    "plano-convex",
    "plano-concave",
    "biconvex",
    "biconcave",
    "positive-meniscus",
    "negative-meniscus",
    "achromatic-doublet",
    "achromatic-cemented-doublet",
    "window/filter",
    "unknown/other",
  ]);
  const STOCK_AVAILABILITY = new Set(["stock", "limited_stock", "inquire", "quote", "lead_time", "lead_time_3_weeks", "custom", "unknown"]);
  const STOCK_CONFIDENCE = new Set(["high", "medium", "low", "unavailable"]);
  const STOCK_GLASS_ND = {
    "N-BK7": 1.5168,
    "N-BK7HT": 1.5168,
    BK7: 1.5168,
    K9: 1.5168,
    "FUSED SILICA": 1.4585,
    "UVFS": 1.4585,
    "N-SF5": 1.6727,
    SF5: 1.6727,
  };
  const stockLibraryState = {
    loaded: false,
    elements: [],
    parsedImport: [],
    matchTarget: null,
    sourceSummary: "",
    loadError: "",
  };

  function stockSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";
  }

  function parseStockNumber(value) {
    if (value == null) return null;
    const text = String(value).replace(",", ".").replace(/[^\d.+\-eE]/g, "");
    if (!/[0-9]/.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  function stockNdForMaterial(material) {
    const key = String(material || "").trim().toUpperCase();
    return STOCK_GLASS_ND[key] || 1.5168;
  }

  function stockAvailabilityFromDelivery(delivery) {
    const text = String(delivery || "").trim().toLowerCase();
    if (!text) return "unknown";
    if (text.includes("inquire")) return "inquire";
    if (text.includes("quote")) return "quote";
    if (text.includes("custom")) return "custom";
    if (text.includes("limited")) return "limited_stock";
    if (text.includes("lead") && text.includes("3")) return "lead_time_3_weeks";
    if (text.includes("lead")) return "lead_time";
    if (/(day|week|stock)/.test(text)) return "stock";
    return "unknown";
  }

  function normalizeStockType(type) {
    const t = String(type || "unknown/other").trim().toLowerCase();
    if (t.includes("plano") && (t.includes("convex") || t === "pcx")) return "plano-convex";
    if (t.includes("plano") && (t.includes("concave") || t === "pcv")) return "plano-concave";
    if (t.includes("bi") && t.includes("convex")) return "biconvex";
    if (t.includes("bi") && t.includes("concave")) return "biconcave";
    if (t.includes("positive") && t.includes("meniscus")) return "positive-meniscus";
    if (t.includes("negative") && t.includes("meniscus")) return "negative-meniscus";
    if (t.includes("achrom") && t.includes("cement")) return "achromatic-cemented-doublet";
    if (t.includes("achrom")) return "achromatic-doublet";
    if (t.includes("window") || t.includes("filter")) return "window/filter";
    return STOCK_TYPES.has(t) ? t : "unknown/other";
  }

  function estimateStockRadius(element) {
    const type = normalizeStockType(element.type);
    const diameter = Number(element.diameter_mm);
    const ct = Number(element.center_thickness_mm);
    const et = Number(element.edge_thickness_mm);
    const efl = Number(element.efl_mm);
    const material = element.glass_catalog_name || element.material;
    const n = stockNdForMaterial(material);
    let radiusFromEfl = Number(element.radius_from_efl_mm);
    let radiusFromSag = Number(element.radius_from_sag_mm);

    if (!Number.isFinite(radiusFromEfl) && Number.isFinite(efl) && efl !== 0 && (type === "plano-convex" || type === "plano-concave")) {
      radiusFromEfl = Math.abs(efl) * (n - 1);
    }
    if (!Number.isFinite(radiusFromSag) && Number.isFinite(diameter) && diameter > 0 && Number.isFinite(ct) && Number.isFinite(et)) {
      const sag = type === "plano-concave" ? (et - ct) : (ct - et);
      const a = diameter / 2;
      if (sag > 1e-6) radiusFromSag = (a * a + sag * sag) / (2 * sag);
    }

    let selected = Number(element.selected_radius_mm);
    if (!Number.isFinite(selected)) selected = Number.isFinite(radiusFromEfl)
      ? radiusFromEfl
      : (Number.isFinite(radiusFromSag) ? radiusFromSag : Math.abs(Number(element.radius_1_mm || element.radius_2_mm || 0)));
    const err = Number.isFinite(radiusFromEfl) && Number.isFinite(radiusFromSag)
      ? Math.abs(radiusFromEfl - radiusFromSag)
      : null;
    const relErr = err != null && Number.isFinite(selected) && selected > 0 ? err / selected : 0;
    let confidence = String(element.raytrace_confidence || "high").toLowerCase();
    if (err != null && relErr > 0.15) confidence = "low";
    else if (err != null && relErr > 0.06 && confidence === "high") confidence = "medium";
    return {
      radius_from_efl_mm: Number.isFinite(radiusFromEfl) ? radiusFromEfl : null,
      radius_from_sag_mm: Number.isFinite(radiusFromSag) ? radiusFromSag : null,
      selected_radius_mm: Number.isFinite(selected) && selected > 0 ? selected : null,
      radius_estimation_error_mm: err,
      raytrace_confidence: STOCK_CONFIDENCE.has(confidence) ? confidence : "medium",
    };
  }

  function normalizeStockSurfaceRecord(surface) {
    if (!surface || typeof surface !== "object") return null;
    const radiusType = String(surface.radius_type || surface.radiusType || "").toLowerCase();
    const radiusRaw = surface.radius_mm ?? surface.radius ?? surface.R;
    const radius = radiusRaw == null || radiusType === "plano"
      ? 0
      : parseStockNumber(radiusRaw);
    const thickness = parseStockNumber(surface.thickness_mm ?? surface.thickness ?? surface.t);
    const semi = parseStockNumber(surface.semi_diameter_mm ?? surface.semiDiameterMm ?? surface.ap ?? surface.aperture_mm);
    return {
      surface_index: parseStockNumber(surface.surface_index ?? surface.index),
      radius_mm: Number.isFinite(radius) ? radius : 0,
      radius_type: radiusType || (radiusRaw == null ? "plano" : null),
      thickness_mm: Number.isFinite(thickness) ? thickness : null,
      medium_after: String(surface.medium_after || surface.mediumAfter || surface.glass_after || surface.glass || "AIR").trim() || "AIR",
      semi_diameter_mm: Number.isFinite(semi) ? semi : null,
      surface_role: String(surface.surface_role || surface.role || ""),
    };
  }

  function normalizeStockElement(raw) {
    const supplier = String(raw?.supplier || raw?.store || "Unknown supplier").trim();
    const code = String(raw?.code || raw?.part_number || raw?.partNumber || raw?.id || "unknown").trim();
    const type = normalizeStockType(raw?.type || raw?.element_type || raw?.category);
    const materials = Array.isArray(raw?.materials)
      ? raw.materials.map((m) => String(m || "").trim()).filter(Boolean)
      : String(raw?.materials || "").split(/[\/,]/).map((m) => m.trim()).filter(Boolean);
    const material = String(raw?.material || raw?.glass_catalog_name || raw?.glass_1 || raw?.glass || materials[0] || "N-BK7").trim();
    const diameter = parseStockNumber(raw?.diameter_mm ?? raw?.diameter ?? raw?.Dia ?? raw?.D);
    const ct = parseStockNumber(raw?.center_thickness_mm ?? raw?.center_thickness_total_mm ?? raw?.ct ?? raw?.CT ?? raw?.["Center Thickness"]);
    const et = parseStockNumber(raw?.edge_thickness_mm ?? raw?.et ?? raw?.ET ?? raw?.["Edge Thickness"]);
    const efl = parseStockNumber(raw?.efl_mm ?? raw?.focal_length_mm ?? raw?.focal_length ?? raw?.FL ?? raw?.EFL ?? raw?.["Focal length"]);
    const delivery = String(raw?.delivery || raw?.Delivery || "").trim();
    const availabilityRaw = String(raw?.availability || "").trim().toLowerCase();
    const availability = STOCK_AVAILABILITY.has(availabilityRaw) ? availabilityRaw : stockAvailabilityFromDelivery(delivery || availabilityRaw);
    const coatingRaw = raw?.coating ?? raw?.Coating;
    const coating = coatingRaw == null || String(coatingRaw).trim() === "" ? "" : String(coatingRaw).trim();
    const radiusEstimate = estimateStockRadius({
      ...raw,
      type,
      material,
      glass_catalog_name: raw?.glass_catalog_name || material,
      diameter_mm: diameter,
      center_thickness_mm: ct,
      edge_thickness_mm: et,
      efl_mm: efl,
    });
    const id = String(raw?.id || `${stockSlug(supplier)}-${stockSlug(code)}`).trim();
    const price = parseStockNumber(raw?.price_usd ?? raw?.price ?? raw?.price_raw ?? raw?.["Unit Price"] ?? raw?.Price);
    const surfaces = Array.isArray(raw?.surfaces)
      ? raw.surfaces.map(normalizeStockSurfaceRecord).filter(Boolean)
      : [];
    const confidenceRaw = String(raw?.raytrace_confidence || radiusEstimate.raytrace_confidence || "medium").toLowerCase();
    const out = {
      id,
      supplier,
      store: String(raw?.store || supplier),
      code,
      source_url: String(raw?.source_url || raw?.sourceUrl || raw?.url || ""),
      source_table: String(raw?.source_table || ""),
      category: String(raw?.category || (type.includes("achromatic") ? "achromat" : "singlet")),
      type,
      focal_class: String(raw?.focal_class || ""),
      insertable: raw?.insertable !== false,
      locked_by_default: raw?.locked_by_default !== false,
      material,
      materials: materials.length ? materials : [material],
      glass_1: String(raw?.glass_1 || material),
      glass_2: raw?.glass_2 ? String(raw.glass_2) : "",
      glass_catalog_name: String(raw?.glass_catalog_name || material),
      diameter_mm: diameter,
      semi_diameter_mm: Number.isFinite(Number(raw?.semi_diameter_mm)) ? Number(raw.semi_diameter_mm) : (Number.isFinite(diameter) ? diameter / 2 : null),
      clear_aperture_mm: parseStockNumber(raw?.clear_aperture_mm ?? raw?.clear_aperture),
      center_thickness_mm: ct,
      center_thickness_total_mm: parseStockNumber(raw?.center_thickness_total_mm ?? ct),
      center_thickness_1_mm: parseStockNumber(raw?.center_thickness_1_mm),
      center_thickness_2_mm: parseStockNumber(raw?.center_thickness_2_mm),
      edge_thickness_mm: et,
      efl_mm: efl,
      bfl_mm: parseStockNumber(raw?.bfl_mm ?? raw?.BFL),
      radius_1_mm: parseStockNumber(raw?.radius_1_mm ?? raw?.R1),
      radius_2_mm: parseStockNumber(raw?.radius_2_mm ?? raw?.R2),
      radius_3_mm: parseStockNumber(raw?.radius_3_mm ?? raw?.R3),
      radius_2_type: raw?.radius_2_type || (type.includes("plano") ? "plano" : null),
      ...radiusEstimate,
      coating,
      wavelength_range_nm: raw?.wavelength_range_nm ?? null,
      surface_quality: raw?.surface_quality ?? null,
      irregularity: String(raw?.irregularity || raw?.Irregularity || ""),
      price_usd: Number.isFinite(price) ? price : null,
      price_raw: raw?.price_raw ?? raw?.price ?? null,
      delivery,
      availability,
      raytrace_confidence: STOCK_CONFIDENCE.has(confidenceRaw) ? confidenceRaw : "medium",
      prescription_status: String(raw?.prescription_status || (surfaces.length ? "complete_surface_prescription" : "estimated_from_catalog")),
      air_gap_after_mm: parseStockNumber(raw?.air_gap_after_mm),
      orientation: String(raw?.orientation || raw?.default_orientation || "curved-first"),
      default_orientation: String(raw?.default_orientation || raw?.orientation || "curved-first"),
      orientation_options: Array.isArray(raw?.orientation_options) ? raw.orientation_options.slice() : [],
      surfaces,
      warnings: Array.isArray(raw?.warnings) ? raw.warnings.slice() : [],
      notes: String(raw?.notes || ""),
    };
    if (out.type === "plano-convex" && out.selected_radius_mm) {
      out.radius_1_mm = Number.isFinite(Number(out.radius_1_mm)) ? out.radius_1_mm : out.selected_radius_mm;
      out.radius_2_mm = Number.isFinite(Number(out.radius_2_mm)) ? out.radius_2_mm : null;
      out.radius_2_type = "plano";
    } else if (out.type === "plano-concave" && out.selected_radius_mm) {
      out.radius_1_mm = Number.isFinite(Number(out.radius_1_mm)) ? out.radius_1_mm : -out.selected_radius_mm;
      out.radius_2_mm = Number.isFinite(Number(out.radius_2_mm)) ? out.radius_2_mm : null;
      out.radius_2_type = "plano";
    }
    if (raw?.raw) out.raw = clone(raw.raw);
    return out;
  }

  function stockCatalogSnapshot(element) {
    return normalizeStockElement(element);
  }

  function getStockLibraryCustomEntries() {
    const storage = getSafeLocalStorage();
    if (!storage) return [];
    try {
      const parsed = JSON.parse(storage.getItem(STOCK_LIBRARY_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeStockElement) : [];
    } catch (_) {
      return [];
    }
  }

  function saveStockLibraryCustomEntries(entries) {
    const storage = getSafeLocalStorage();
    if (!storage) return;
    try { storage.setItem(STOCK_LIBRARY_STORAGE_KEY, JSON.stringify(entries.map(normalizeStockElement))); } catch (_) {}
  }

  function mergeStockElements(...lists) {
    const byId = new Map();
    for (const list of lists) {
      for (const item of list || []) {
        const normalized = normalizeStockElement(item);
        byId.set(normalized.id, normalized);
      }
    }
    return [...byId.values()].sort((a, b) => `${a.supplier} ${a.code}`.localeCompare(`${b.supplier} ${b.code}`));
  }

  function extractStockLibraryEntries(json) {
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.entries)) return json.entries;
    if (Array.isArray(json?.elements)) return json.elements;
    return [];
  }

  async function loadStockElementLibrary() {
    if (stockLibraryState.loaded) return stockLibraryState.elements;
    let fileElements = [];
    stockLibraryState.loadError = "";
    try {
      const res = await fetch("./data/element-library.json", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        fileElements = extractStockLibraryEntries(json);
        stockLibraryState.sourceSummary = json?.library_name
          ? `${json.library_name} (${fileElements.length} entries)`
          : `./data/element-library.json (${fileElements.length} entries)`;
      } else {
        stockLibraryState.loadError = `Could not load ./data/element-library.json (${res.status})`;
      }
    } catch (err) {
      stockLibraryState.loadError = `Could not load ./data/element-library.json: ${err?.message || err}`;
    }
    stockLibraryState.elements = mergeStockElements(fileElements, getStockLibraryCustomEntries());
    stockLibraryState.loaded = true;
    renderStockLibraryFilters();
    return stockLibraryState.elements;
  }

  function stockElementTitle(element) {
    return `${element.supplier} ${element.code}`;
  }

  function stockElementLine(element) {
    const efl = Number.isFinite(Number(element.efl_mm)) ? `FL${Number(element.efl_mm).toFixed(1)}` : "FL—";
    const primaryR = stockPrimaryRadius(element);
    const r = Number.isFinite(Number(primaryR)) ? `R${Number(primaryR).toFixed(2)}` : "R—";
    const price = Number.isFinite(Number(element.price_usd)) ? `$${Number(element.price_usd).toFixed(2)}` : "$—";
    return `${element.type} ${element.material} Ø${mmText(element.diameter_mm, 1)} ${efl} CT${mmText(element.center_thickness_mm, 2)} ${r} ${element.coating || ""} ${price} ${element.delivery || ""}`;
  }

  function stockGroupId() {
    return `stock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function isStockLockedSurface(surface) {
    return !!surface?.stockElementLocked && !!surface?.stockElementGroupId;
  }

  function isStockRearAirSurface(surface) {
    return isStockLockedSurface(surface) && surface.stockElementRearSurface === true;
  }

  function isStockSurfaceFieldLocked(surface, key) {
    if (!isStockLockedSurface(surface)) return false;
    if (key === "t" && isStockRearAirSurface(surface)) return false;
    return key === "R" || key === "t" || key === "ap" || key === "glass" || key === "stop" || key === "surfaceLabel" || key === "type";
  }

  function stockApertureForElement(element) {
    const clear = Number(element.clear_aperture_mm);
    const semi = Number(element.semi_diameter_mm);
    const diameter = Number(element.diameter_mm);
    if (Number.isFinite(clear) && clear > 0) return clear / 2;
    if (Number.isFinite(semi) && semi > 0) return semi;
    if (Number.isFinite(diameter) && diameter > 0) return diameter / 2;
    return 10;
  }

  function stockGlassName(element) {
    return normalizeGlassInput(element.glass_catalog_name || element.material || "N-BK7HT");
  }

  function stockPrimaryRadius(element) {
    const values = [
      element?.selected_radius_mm,
      element?.radius_1_mm,
      element?.radius_2_mm,
      element?.radius_3_mm,
    ].map(Number).filter((v) => Number.isFinite(v) && Math.abs(v) > 1e-9);
    return values.length ? Math.max(...values.map((v) => Math.abs(v))) : null;
  }

  function stockBaseSurfacesFromStoredPrescription(elementRaw) {
    const element = normalizeStockElement(elementRaw);
    const rawSurfaces = Array.isArray(element.surfaces) ? element.surfaces : [];
    if (rawSurfaces.length < 2) return null;
    const labelBase = `${element.supplier} ${element.code}`.trim();
    const fallbackAp = Math.max(0.1, stockApertureForElement(element));
    const base = rawSurfaces.map((surface, index) => {
      const radius = Number(surface.radius_mm);
      const thickness = Number(surface.thickness_mm);
      const ap = Number(surface.semi_diameter_mm);
      const glass = normalizeGlassInput(surface.medium_after || (index === rawSurfaces.length - 1 ? "AIR" : stockGlassName(element)));
      const role = String(surface.surface_role || "").trim();
      return {
        type: "",
        R: Number.isFinite(radius) ? radius : 0,
        t: Number.isFinite(thickness) ? Math.max(0, thickness) : 0,
        ap: Number.isFinite(ap) && ap > 0 ? ap : fallbackAp,
        ap_optical: Number.isFinite(ap) && ap > 0 ? ap : fallbackAp,
        glass,
        stop: false,
        surfaceLabel: `${labelBase} ${role || `S${index + 1}`}`.trim(),
        surfaceLabelAuto: false,
      };
    });
    const hasBad = base.some((surface) =>
      !Number.isFinite(surface.R) ||
      !Number.isFinite(surface.t) ||
      !Number.isFinite(surface.ap) ||
      !Number.isFinite(surface.ap_optical)
    );
    if (hasBad) return null;
    if (resolveGlassName(base[base.length - 1].glass) !== "AIR") base[base.length - 1].glass = "AIR";
    return base;
  }

  function orientStockBaseSurfaces(baseSurfaces, orientation, rearAir) {
    const rear = Math.max(0, Number(rearAir) || 0);
    const base = (baseSurfaces || []).map((surface) => ({ ...surface }));
    if (!base.length) return null;
    if (orientation !== "flipped") {
      base[base.length - 1].t = rear;
      base[base.length - 1].glass = "AIR";
      return base;
    }
    const flipped = [];
    for (let k = 0; k < base.length; k++) {
      const originalIndex = base.length - 1 - k;
      const original = base[originalIndex];
      const mediumSource = originalIndex > 0 ? base[originalIndex - 1] : null;
      flipped.push({
        ...original,
        R: Math.abs(Number(original.R)) <= 1e-12 ? 0 : -Number(original.R),
        t: mediumSource ? Math.max(0, Number(mediumSource.t) || 0) : rear,
        glass: mediumSource ? normalizeGlassInput(mediumSource.glass) : "AIR",
        surfaceLabel: String(original.surfaceLabel || `S${originalIndex + 1}`).replace(/\bFRONT\b/i, "TEMP_REAR").replace(/\bREAR\b/i, "FRONT").replace(/\bTEMP_REAR\b/i, "REAR"),
      });
    }
    flipped[flipped.length - 1].t = rear;
    flipped[flipped.length - 1].glass = "AIR";
    return flipped;
  }

  function decorateStockSurfaces(surfaces, element, groupId, orientation, rearAir) {
    const catalog = stockCatalogSnapshot(element);
    return (surfaces || []).map((surface, index) => ({
      ...surface,
      stockElementGroupId: groupId,
      stockElementSurfaceIndex: index,
      stockElementSurfaceRole: index === 0 ? "front" : (index === surfaces.length - 1 ? "rear" : "internal"),
      stockElementLocked: true,
      stockElementRearSurface: index === surfaces.length - 1,
      stockCatalog: catalog,
      stockOrientation: orientation,
      stockAirGapAfterMm: index === surfaces.length - 1 ? rearAir : null,
    }));
  }

  function stockRaytraceability(elementRaw) {
    const element = normalizeStockElement(elementRaw);
    if (element.insertable === false) return { ok: false, reason: "Cannot raytrace: incomplete physical prescription." };
    const stored = stockBaseSurfacesFromStoredPrescription(element);
    if (stored && stored.length >= 2) return { ok: true, source: "stored_surfaces" };
    const ap = stockApertureForElement(element);
    const ct = Number(element.center_thickness_mm);
    const glass = stockGlassName(element);
    const simple = (
      (element.type === "plano-convex" || element.type === "plano-concave" || element.type === "window/filter") &&
      Number.isFinite(ap) && ap > 0 &&
      Number.isFinite(ct) && ct > 0 &&
      (element.type === "window/filter" || Number.isFinite(Number(element.selected_radius_mm || element.radius_1_mm)))
    );
    if (simple && glass) return { ok: true, source: "generated_simple" };
    return { ok: false, reason: "Cannot raytrace: incomplete physical prescription." };
  }

  function stockLensSurfaces(elementRaw, options = {}) {
    const element = normalizeStockElement(elementRaw);
    const groupId = options.groupId || stockGroupId();
    const orientation = options.orientation === "flipped" ? "flipped" : "curved-first";
    const rearAir = Math.max(0, Number(options.airGapAfterMm ?? options.rearAir ?? 4) || 0);
    const storedBase = stockBaseSurfacesFromStoredPrescription(element);
    if (storedBase && storedBase.length >= 2) {
      const oriented = orientStockBaseSurfaces(storedBase, orientation, rearAir);
      return decorateStockSurfaces(oriented, element, groupId, orientation, rearAir);
    }

    const ap = Math.max(0.1, stockApertureForElement(element));
    const ct = Math.max(0.01, Number(element.center_thickness_mm) || 1);
    const R = Math.max(0.0001, Math.abs(Number(element.selected_radius_mm || element.radius_1_mm || 0)) || 1000);
    const glass = stockGlassName(element);
    const catalog = stockCatalogSnapshot(element);
    const labelBase = `${element.supplier} ${element.code}`.trim();
    let surfaces = [];

    if (element.type === "plano-convex") {
      surfaces = orientation === "flipped"
        ? [
            { type: "", R: 0, t: ct, ap, ap_optical: ap, glass, stop: false, surfaceLabel: `${labelBase} PLANO`, surfaceLabelAuto: false },
            { type: "", R: -R, t: rearAir, ap, ap_optical: ap, glass: "AIR", stop: false, surfaceLabel: `${labelBase} CURVED`, surfaceLabelAuto: false },
          ]
        : [
            { type: "", R: R, t: ct, ap, ap_optical: ap, glass, stop: false, surfaceLabel: `${labelBase} CURVED`, surfaceLabelAuto: false },
            { type: "", R: 0, t: rearAir, ap, ap_optical: ap, glass: "AIR", stop: false, surfaceLabel: `${labelBase} PLANO`, surfaceLabelAuto: false },
          ];
    } else if (element.type === "plano-concave") {
      surfaces = orientation === "flipped"
        ? [
            { type: "", R: 0, t: ct, ap, ap_optical: ap, glass, stop: false, surfaceLabel: `${labelBase} PLANO`, surfaceLabelAuto: false },
            { type: "", R: R, t: rearAir, ap, ap_optical: ap, glass: "AIR", stop: false, surfaceLabel: `${labelBase} CURVED`, surfaceLabelAuto: false },
          ]
        : [
            { type: "", R: -R, t: ct, ap, ap_optical: ap, glass, stop: false, surfaceLabel: `${labelBase} CURVED`, surfaceLabelAuto: false },
            { type: "", R: 0, t: rearAir, ap, ap_optical: ap, glass: "AIR", stop: false, surfaceLabel: `${labelBase} PLANO`, surfaceLabelAuto: false },
          ];
    } else if (element.type === "window/filter") {
      surfaces = [
        { type: "", R: 0, t: ct, ap, ap_optical: ap, glass, stop: false, surfaceLabel: `${labelBase} FRONT`, surfaceLabelAuto: false },
        { type: "", R: 0, t: rearAir, ap, ap_optical: ap, glass: "AIR", stop: false, surfaceLabel: `${labelBase} REAR`, surfaceLabelAuto: false },
      ];
    } else {
      const r1 = Number.isFinite(Number(element.radius_1_mm)) ? Number(element.radius_1_mm) : R;
      const r2 = Number.isFinite(Number(element.radius_2_mm)) ? Number(element.radius_2_mm) : -r1;
      surfaces = orientation === "flipped"
        ? [
            { type: "", R: -r2, t: ct, ap, ap_optical: ap, glass, stop: false, surfaceLabel: `${labelBase} REAR`, surfaceLabelAuto: false },
            { type: "", R: -r1, t: rearAir, ap, ap_optical: ap, glass: "AIR", stop: false, surfaceLabel: `${labelBase} FRONT`, surfaceLabelAuto: false },
          ]
        : [
            { type: "", R: r1, t: ct, ap, ap_optical: ap, glass, stop: false, surfaceLabel: `${labelBase} FRONT`, surfaceLabelAuto: false },
            { type: "", R: r2, t: rearAir, ap, ap_optical: ap, glass: "AIR", stop: false, surfaceLabel: `${labelBase} REAR`, surfaceLabelAuto: false },
          ];
    }

    return surfaces.map((surface, index) => ({
      ...surface,
      stockElementGroupId: groupId,
      stockElementSurfaceIndex: index,
      stockElementSurfaceRole: index === 0 ? "front" : (index === surfaces.length - 1 ? "rear" : "internal"),
      stockElementLocked: true,
      stockElementRearSurface: index === surfaces.length - 1,
      stockCatalog: catalog,
      stockOrientation: orientation,
      stockAirGapAfterMm: index === surfaces.length - 1 ? rearAir : null,
    }));
  }

  function insertStockElement(element, options = {}) {
    const ray = stockRaytraceability(element);
    if (!ray.ok) {
      toast(ray.reason);
      if (ui.stockLibrarySummary) ui.stockLibrarySummary.textContent = ray.reason;
      return [];
    }
    const rearAir = Math.max(0, Number(options.airGapAfterMm ?? elUI?.rear?.value ?? 4) || 0);
    const chunk = stockLensSurfaces(element, { orientation: options.orientation, airGapAfterMm: rearAir });
    let insertAt = Number.isFinite(Number(options.insertAt)) ? Number(options.insertAt) : safeInsertAtAfterSelected();
    const imsIdx = getIMSIndex();
    if (imsIdx >= 0) insertAt = Math.min(Math.max(1, insertAt), imsIdx);
    lens.surfaces.splice(insertAt, 0, ...chunk);
    selectedIndex = insertAt;
    if (!lens.stockPrototype || typeof lens.stockPrototype !== "object") lens.stockPrototype = {};
    lens.stockPrototype.lastInsertedCatalogId = element.id;
    lens = sanitizeLens(lens);
    buildTable();
    applySensorToIMS();
    updateStockPrototypeUi();
    validateStockPrototypeMode();
    scheduleRenderAll();
    scheduleRenderPreview();
    updateStockPrototypeUi();
    toast(`Inserted locked stock element: ${stockElementTitle(element)}`);
    return chunk;
  }

  function stockGroupRangeById(groupId) {
    const surfaces = lens?.surfaces || [];
    const indices = surfaces.map((s, i) => s.stockElementGroupId === groupId ? i : -1).filter((i) => i >= 0);
    if (!indices.length) return null;
    return { start: Math.min(...indices), end: Math.max(...indices), indices };
  }

  function stockGroupRangeAt(index) {
    const s = lens?.surfaces?.[index];
    return s?.stockElementGroupId ? stockGroupRangeById(s.stockElementGroupId) : null;
  }

  function setStockPrototypeMode(enabled) {
    if (!lens.stockPrototype || typeof lens.stockPrototype !== "object") lens.stockPrototype = {};
    lens.stockPrototype.enabled = !!enabled;
    updateStockPrototypeUi();
    buildTable();
    validateStockPrototypeMode();
  }

  function updateStockPrototypeUi() {
    const enabled = !!lens?.stockPrototype?.enabled;
    if (ui.btnStockPrototypeMode) {
      ui.btnStockPrototypeMode.textContent = enabled ? "Stock Mode: ON" : "Stock Mode: OFF";
      ui.btnStockPrototypeMode.classList.toggle("btnPrimary", enabled);
      ui.btnStockPrototypeMode.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    if (elUI?.stockModeToggle) elUI.stockModeToggle.textContent = enabled ? "Stock Prototype Mode ON" : "Enable Stock Prototype Mode";
  }

  function collectStockGroups() {
    const groups = new Map();
    (lens?.surfaces || []).forEach((s, index) => {
      if (!isStockLockedSurface(s)) return;
      const groupId = s.stockElementGroupId;
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          groupId,
          firstIndex: index,
          lastIndex: index,
          catalog: s.stockCatalog ? normalizeStockElement(s.stockCatalog) : null,
          orientation: s.stockOrientation || "curved-first",
          surfaces: [],
          airGapAfterMm: null,
        });
      }
      const g = groups.get(groupId);
      g.firstIndex = Math.min(g.firstIndex, index);
      g.lastIndex = Math.max(g.lastIndex, index);
      g.surfaces.push({ index, surface: s });
      if (s.stockElementRearSurface) g.airGapAfterMm = Number(s.t || 0);
    });
    return [...groups.values()].sort((a, b) => a.firstIndex - b.firstIndex);
  }

  function findCustomElementRange(index) {
    const surfaces = lens?.surfaces || [];
    if (!surfaces[index] || isProtectedIndex(index) || isStockLockedSurface(surfaces[index])) return null;
    let start = index;
    for (let i = index; i >= 1; i--) {
      const cur = surfaces[i];
      const prev = surfaces[i - 1];
      if (isProtectedIndex(i) || isStockLockedSurface(cur)) break;
      start = i;
      if (isAirSurfaceMedium(prev) && !isAirSurfaceMedium(cur)) break;
    }
    let end = index;
    for (let i = start; i < surfaces.length - 1; i++) {
      end = i;
      if (isAirSurfaceMedium(surfaces[i])) break;
      if (i > start && isAirSurfaceMedium(surfaces[i])) break;
      if (i + 1 < surfaces.length && !isAirSurfaceMedium(surfaces[i]) && isAirSurfaceMedium(surfaces[i + 1])) {
        end = i + 1;
        break;
      }
    }
    if (start <= 0 || end >= surfaces.length - 1 || end < start) return null;
    return { start, end, surfaces: surfaces.slice(start, end + 1) };
  }

  function inferCustomElementDescriptor(range) {
    const chunk = range?.surfaces || [];
    const glassSurface = chunk.find((s) => !isAirSurfaceMedium(s)) || chunk[0];
    const rearSurface = chunk[chunk.length - 1] || glassSurface;
    const r1 = Number(glassSurface?.R);
    const r2 = Number(rearSurface?.R);
    const type = (() => {
      if (Math.abs(r1 || 0) > 1e-9 && Math.abs(r2 || 0) <= 1e-9) return r1 > 0 ? "plano-convex" : "plano-concave";
      if (Math.abs(r1 || 0) <= 1e-9 && Math.abs(r2 || 0) > 1e-9) return r2 < 0 ? "plano-convex" : "plano-concave";
      if (r1 > 0 && r2 < 0) return "biconvex";
      if (r1 < 0 && r2 > 0) return "biconcave";
      return "unknown/other";
    })();
    return {
      type,
      material: glassSurface?.glass || "AIR",
      diameter_mm: Number(glassSurface?.ap) * 2,
      center_thickness_mm: Number(glassSurface?.t),
      radius_mm: Math.max(Math.abs(r1 || 0), Math.abs(r2 || 0)) || null,
      efl_mm: null,
      air_gap_after_mm: Number(rearSurface?.t || 0),
    };
  }

  function scoreStockMatch(custom, element) {
    const e = normalizeStockElement(element);
    let score = 0;
    let max = 0;
    const add = (weight, value) => { max += weight; score += weight * Math.max(0, Math.min(1, value)); };
    add(28, custom.type === e.type ? 1 : (custom.type === "unknown/other" ? 0.45 : 0.05));
    const materialMatch = normalizeGlassInput(custom.material) === normalizeGlassInput(e.glass_catalog_name || e.material)
      || (e.materials || []).some((m) => normalizeGlassInput(custom.material) === normalizeGlassInput(m));
    add(18, materialMatch ? 1 : 0.35);
    const cr = Number(custom.radius_mm);
    const er = Number(stockPrimaryRadius(e));
    add(18, Number.isFinite(cr) && Number.isFinite(er) ? 1 - Math.min(1, Math.abs(cr - er) / Math.max(1, Math.abs(cr))) : 0.35);
    const cd = Number(custom.diameter_mm);
    const ed = Number(e.diameter_mm);
    add(14, Number.isFinite(cd) && Number.isFinite(ed) ? 1 - Math.min(1, Math.abs(cd - ed) / Math.max(1, Math.abs(cd))) : 0.35);
    const cct = Number(custom.center_thickness_mm);
    const ect = Number(e.center_thickness_mm ?? e.center_thickness_total_mm);
    add(8, Number.isFinite(cct) && Number.isFinite(ect) ? 1 - Math.min(1, Math.abs(cct - ect) / Math.max(1, Math.abs(cct))) : 0.4);
    add(5, e.availability === "stock" ? 1 : (e.availability === "limited_stock" ? 0.7 : 0.25));
    add(5, e.raytrace_confidence === "high" ? 1 : (e.raytrace_confidence === "medium" ? 0.65 : 0.2));
    add(4, Number.isFinite(Number(e.price_usd)) ? 1 / (1 + Number(e.price_usd) / 50) : 0.5);
    return Math.round((score / Math.max(1, max)) * 1000) / 10;
  }

  function stockFilteredElements() {
    const q = String(ui.stockSearch?.value || "").trim().toLowerCase();
    const supplier = String(ui.stockSupplierFilter?.value || "");
    const type = String(ui.stockTypeFilter?.value || "");
    const material = String(ui.stockMaterialFilter?.value || "");
    const coating = String(ui.stockCoatingFilter?.value || "");
    const availability = String(ui.stockAvailabilityFilter?.value || "");
    const confidence = String(ui.stockConfidenceFilter?.value || "");
    const dMin = parseStockNumber(ui.stockDiameterMin?.value);
    const dMax = parseStockNumber(ui.stockDiameterMax?.value);
    const fMin = parseStockNumber(ui.stockEflMin?.value);
    const fMax = parseStockNumber(ui.stockEflMax?.value);
    const maxPrice = parseStockNumber(ui.stockMaxPrice?.value);
    const stockOnly = !!ui.stockOnlyToggle?.checked;
    return (stockLibraryState.elements || []).filter((e) => {
      const hay = `${e.supplier} ${e.code} ${e.type} ${e.material} ${e.glass_catalog_name} ${(e.materials || []).join(" ")} ${e.coating} ${e.delivery} ${e.availability} ${e.source_url}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (supplier && e.supplier !== supplier) return false;
      if (type && e.type !== type) return false;
      if (material && e.material !== material && e.glass_catalog_name !== material && !(e.materials || []).includes(material)) return false;
      if (coating && (e.coating || "Uncoated / none") !== coating) return false;
      if (availability && e.availability !== availability) return false;
      if (confidence && e.raytrace_confidence !== confidence) return false;
      if (stockOnly && e.availability !== "stock" && e.availability !== "limited_stock") return false;
      const d = Number(e.diameter_mm);
      const f = Number(e.efl_mm);
      const p = Number(e.price_usd);
      if (Number.isFinite(dMin) && Number.isFinite(d) && d < dMin) return false;
      if (Number.isFinite(dMax) && Number.isFinite(d) && d > dMax) return false;
      if (Number.isFinite(fMin) && Number.isFinite(f) && f < fMin) return false;
      if (Number.isFinite(fMax) && Number.isFinite(f) && f > fMax) return false;
      if (Number.isFinite(maxPrice) && Number.isFinite(p) && p > maxPrice) return false;
      return true;
    });
  }

  function renderStockLibraryFilters() {
    const elements = stockLibraryState.elements || [];
    const fill = (select, values, allText) => {
      if (!select) return;
      const current = select.value;
      select.innerHTML = `<option value="">${allText}</option>` +
        [...new Set(values.filter(Boolean).map(String))].sort().map((value) =>
          `<option value="${escapeAttr(value)}">${escapeAttr(value)}</option>`
        ).join("");
      if ([...select.options].some((o) => o.value === current)) select.value = current;
    };
    fill(ui.stockSupplierFilter, elements.map((e) => e.supplier), "All suppliers");
    fill(ui.stockTypeFilter, elements.map((e) => e.type), "All types");
    fill(ui.stockMaterialFilter, elements.map((e) => e.glass_catalog_name || e.material), "All materials");
    fill(ui.stockCoatingFilter, elements.map((e) => e.coating || "Uncoated / none"), "All coatings");
    fill(ui.stockAvailabilityFilter, elements.map((e) => e.availability), "Any availability");
    fill(ui.stockConfidenceFilter, elements.map((e) => e.raytrace_confidence), "Any confidence");
  }

  function stockValidationWarnings(element) {
    const e = normalizeStockElement(element);
    const warnings = [];
    const ray = stockRaytraceability(e);
    if (!ray.ok) warnings.push(ray.reason);
    if (e.availability === "inquire" || e.availability === "quote") warnings.push("May not be directly stock.");
    if (e.availability && !["stock", "limited_stock"].includes(e.availability) && e.availability !== "unknown") warnings.push("Verify supplier lead time before ordering.");
    if (e.raytrace_confidence === "low" || e.raytrace_confidence === "medium") warnings.push("Approximate catalog data only.");
    if (String(e.prescription_status || "").includes("estimated")) warnings.push("Radius estimated from catalog EFL/geometry.");
    const err = Number(e.radius_estimation_error_mm);
    const r = Number(e.selected_radius_mm);
    if (Number.isFinite(err) && Number.isFinite(r) && r > 0 && err / r > 0.06) warnings.push("Catalog geometry mismatch — verify before ordering.");
    return warnings;
  }

  function stockCardHtml(element, options = {}) {
    const e = normalizeStockElement(element);
    const match = Number(options.matchScore);
    const warnings = stockValidationWarnings(e);
    const ray = stockRaytraceability(e);
    const price = Number.isFinite(Number(e.price_usd)) ? `$${Number(e.price_usd).toFixed(2)}` : "—";
    const title = stockElementTitle(e);
    const primaryR = stockPrimaryRadius(e);
    const radius = Number.isFinite(Number(primaryR)) ? Number(primaryR).toFixed(2) : "—";
    const matchBadge = Number.isFinite(match) ? `<span class="stockBadge stockMatch">${match.toFixed(1)}% match</span>` : "";
    return `
      <div class="stockCard ${ray.ok ? "" : "stockCardDisabled"}" data-stock-id="${escapeAttr(e.id)}">
        <div class="stockCardTop">
          <strong>${escapeAttr(title)}</strong>
          <span class="stockBadge">${escapeAttr(e.availability)}</span>
          <span class="stockBadge">${escapeAttr(e.raytrace_confidence)}</span>
          ${matchBadge}
        </div>
        <div class="stockCardMeta">
          ${escapeAttr(e.type)} • ${escapeAttr(e.material)} • Ø${escapeAttr(mmText(e.diameter_mm, 1))} • CT ${escapeAttr(mmText(e.center_thickness_mm, 2))} • ET ${escapeAttr(mmText(e.edge_thickness_mm, 2))} • EFL ${escapeAttr(mmText(e.efl_mm, 1))} • R ${escapeAttr(radius)} • ${escapeAttr(e.coating || "—")} • ${price} • ${escapeAttr(e.delivery || "—")}
        </div>
        ${warnings.length ? `<div class="stockWarnings">${warnings.map(escapeAttr).join(" • ")}</div>` : ""}
        <div class="stockCardActions">
          <button class="btn btnPrimary stockAction" type="button" data-action="insert" data-id="${escapeAttr(e.id)}" ${ray.ok ? "" : "disabled"}>Insert locked stock</button>
          <button class="btn stockAction" type="button" data-action="preview" data-id="${escapeAttr(e.id)}">Preview</button>
          ${options.matchMode ? `<button class="btn stockAction" type="button" data-action="replace" data-id="${escapeAttr(e.id)}" ${ray.ok ? "" : "disabled"}>Replace With Stock</button>` : ""}
        </div>
      </div>
    `;
  }

  function renderStockLibraryResults() {
    if (!ui.stockResults) return;
    const elements = stockFilteredElements();
    const matchMode = !!stockLibraryState.matchTarget;
    const scored = matchMode
      ? elements.map((e) => ({ e, score: scoreStockMatch(stockLibraryState.matchTarget.descriptor, e) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
      : elements.map((e) => ({ e, score: null })).slice(0, 100);
    if (ui.stockLibrarySummary) {
      const source = stockLibraryState.loadError || stockLibraryState.sourceSummary || "./data/element-library.json";
      ui.stockLibrarySummary.textContent = matchMode
        ? `Closest stock matches for selected custom element. Showing ${scored.length} of ${elements.length} filtered rows. Source: ${source}.`
        : `${elements.length} matching stock elements. Source: ${source}. Stock elements insert as locked physical glass; only rear air gap/spacer remains editable.`;
    }
    ui.stockResults.innerHTML = scored.length
      ? scored.map((item) => stockCardHtml(item.e, { matchScore: item.score, matchMode })).join("")
      : `<div class="stockEmpty">No stock elements match the current filters.</div>`;
    ui.stockResults.querySelectorAll(".stockAction").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        const action = e.currentTarget.dataset.action;
        const element = stockLibraryState.elements.find((item) => item.id === id);
        if (!element) return;
        if ((action === "insert" || action === "replace") && !stockRaytraceability(element).ok) return previewStockElement(element);
        if (action === "insert") insertStockElement(element);
        if (action === "preview") previewStockElement(element);
        if (action === "replace") replaceCustomElementWithStock(element);
      });
    });
  }

  function previewStockElement(element) {
    const e = normalizeStockElement(element);
    const ray = stockRaytraceability(e);
    if (!ray.ok) {
      if (ui.stockLibrarySummary) ui.stockLibrarySummary.textContent = `${stockElementTitle(e)}: ${ray.reason}`;
      return;
    }
    const surfaces = stockLensSurfaces(e, { airGapAfterMm: 4 });
    const lines = surfaces.map((s, i) => `S${i + 1}: R=${Number(s.R).toFixed(3)} t=${Number(s.t).toFixed(3)} ap=${Number(s.ap).toFixed(3)} glass=${s.glass}`);
    if (ui.stockLibrarySummary) {
      ui.stockLibrarySummary.textContent = `${stockElementTitle(e)} generated prescription preview: ${lines.join(" | ")}`;
    }
  }

  function openStockLibraryModal(options = {}) {
    loadStockElementLibrary().then(() => {
      stockLibraryState.matchTarget = options.matchTarget || null;
      if (ui.stockLibraryModal) {
        ui.stockLibraryModal.classList.remove("hidden");
        ui.stockLibraryModal.setAttribute("aria-hidden", "false");
      }
      renderStockLibraryFilters();
      renderStockLibraryResults();
    });
  }

  function closeStockLibraryModal() {
    if (!ui.stockLibraryModal) return;
    stockLibraryState.matchTarget = null;
    ui.stockLibraryModal.classList.add("hidden");
    ui.stockLibraryModal.setAttribute("aria-hidden", "true");
  }

  function parseDelimitedRows(text) {
    const rows = String(text || "").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!rows.length) return [];
    const delimiter = rows[0].includes("\t") ? "\t" : ",";
    const split = (line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const headers = split(rows[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ""));
    return rows.slice(1).map((line) => {
      const cells = split(line);
      const raw = {};
      headers.forEach((h, i) => { raw[h] = cells[i] ?? ""; });
      return raw;
    });
  }

  function pickRaw(raw, names) {
    for (const name of names) {
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (raw[key] != null && String(raw[key]).trim() !== "") return raw[key];
    }
    return "";
  }

  function parseStockImportRows() {
    const supplier = String(ui.stockImportSupplier?.value || "Unknown supplier").trim();
    const type = normalizeStockType(ui.stockImportType?.value || "unknown/other");
    const rows = parseDelimitedRows(ui.stockImportText?.value || "");
    const parsed = rows.map((raw) => normalizeStockElement({
      supplier,
      type,
      code: pickRaw(raw, ["code", "part", "part number", "item"]),
      material: pickRaw(raw, ["material", "glass"]),
      diameter_mm: pickRaw(raw, ["diameter", "dia", "d"]),
      center_thickness_mm: pickRaw(raw, ["ct", "center thickness", "centerthickness"]),
      edge_thickness_mm: pickRaw(raw, ["et", "edge thickness", "edgethickness"]),
      efl_mm: pickRaw(raw, ["focal length", "focal", "efl", "fl"]),
      irregularity: pickRaw(raw, ["irregularity"]),
      coating: pickRaw(raw, ["coating"]),
      price_usd: pickRaw(raw, ["unit price", "price", "usd"]),
      delivery: pickRaw(raw, ["delivery", "lead time"]),
      raw,
    })).filter((e) => e.code && e.code !== "unknown");
    stockLibraryState.parsedImport = parsed;
    if (ui.stockAddParsed) ui.stockAddParsed.disabled = !parsed.length;
    if (ui.stockImportPreview) {
      ui.stockImportPreview.innerHTML = parsed.length
        ? parsed.slice(0, 20).map((e) => `<div>${escapeAttr(stockElementTitle(e))} — ${escapeAttr(stockElementLine(e))}</div>`).join("")
        : "No valid rows parsed. Check headers like Code, Material, Diameter, CT, ET, Focal length, Coating, Unit Price, Delivery.";
    }
    return parsed;
  }

  function addParsedStockRowsToLibrary() {
    const parsed = stockLibraryState.parsedImport || [];
    if (!parsed.length) return;
    const custom = mergeStockElements(getStockLibraryCustomEntries(), parsed);
    saveStockLibraryCustomEntries(custom);
    stockLibraryState.elements = mergeStockElements(stockLibraryState.elements, custom);
    renderStockLibraryFilters();
    renderStockLibraryResults();
    toast(`Added ${parsed.length} parsed stock rows to local library`);
  }

  function downloadTextFile(filename, text, type = "text/plain") {
    const blob = new Blob([String(text)], { type });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function exportStockLibraryJson() {
    const payload = {
      schema_version: "tvl-stock-optical-element-library-v2-compatible",
      updated: new Date().toISOString(),
      entries: (stockLibraryState.elements || []).map(normalizeStockElement),
    };
    downloadTextFile("element-library.json", JSON.stringify(payload, null, 2), "application/json");
  }

  function replaceCustomElementWithStock(element) {
    const target = stockLibraryState.matchTarget;
    if (!target?.range) return toast("Select a custom element and run Find Closest Stock Match first.");
    const ray = stockRaytraceability(element);
    if (!ray.ok) return toast(ray.reason);
    const range = findCustomElementRange(target.range.start) || target.range;
    const rearAir = Number(target.descriptor?.air_gap_after_mm ?? range.surfaces?.[range.surfaces.length - 1]?.t ?? 4);
    const chunk = stockLensSurfaces(element, { airGapAfterMm: rearAir });
    lens.surfaces.splice(range.start, range.end - range.start + 1, ...chunk);
    selectedIndex = range.start;
    lens = sanitizeLens(lens);
    buildTable();
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
    closeStockLibraryModal();
    toast(`Replaced custom element with locked stock: ${stockElementTitle(element)}`);
  }

  function findClosestStockForSurface(index) {
    const range = findCustomElementRange(index);
    if (!range) return toast("Select a custom non-stock optical element surface first.");
    const descriptor = inferCustomElementDescriptor(range);
    openStockLibraryModal({ matchTarget: { range, descriptor } });
  }

  function convertStockGroupToCustomCopy(index) {
    const range = stockGroupRangeAt(index);
    if (!range) return;
    const catalog = lens.surfaces[range.start]?.stockCatalog;
    const note = `Custom copy based on ${catalog?.supplier || "stock"} ${catalog?.code || ""} — not stock/orderable anymore.`;
    for (const i of range.indices) {
      const s = lens.surfaces[i];
      s.customCopyOfStock = catalog ? stockCatalogSnapshot(catalog) : { note };
      s.stockElementGroupId = null;
      s.stockElementSurfaceIndex = null;
      s.stockElementSurfaceRole = null;
      s.stockElementLocked = false;
      s.stockElementRearSurface = false;
      s.stockCatalog = null;
      s.stockOrientation = null;
      s.stockAirGapAfterMm = null;
    }
    if (!Array.isArray(lens.notes)) lens.notes = [];
    if (!lens.notes.includes(note)) lens.notes.push(note);
    lens = sanitizeLens(lens);
    buildTable();
    scheduleRenderAll();
    scheduleRenderPreview();
    toast("Converted stock element to editable custom copy");
  }

  function flipStockGroup(index) {
    const range = stockGroupRangeAt(index);
    if (!range) return;
    const first = lens.surfaces[range.start];
    const catalog = first?.stockCatalog;
    if (!catalog) return toast("Missing stock catalog snapshot.");
    const rear = range.indices.map((i) => lens.surfaces[i]).find((s) => s.stockElementRearSurface);
    const nextOrientation = first.stockOrientation === "flipped" ? "curved-first" : "flipped";
    const ray = stockRaytraceability(catalog);
    if (!ray.ok) return toast(ray.reason);
    const chunk = stockLensSurfaces(catalog, { orientation: nextOrientation, airGapAfterMm: Number(rear?.t || 4), groupId: first.stockElementGroupId });
    lens.surfaces.splice(range.start, range.end - range.start + 1, ...chunk);
    selectedIndex = range.start;
    lens = sanitizeLens(lens);
    buildTable();
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
    toast(`Flipped ${catalog.supplier} ${catalog.code}`);
  }

  function stockPrototypeWarnings() {
    const warnings = [];
    const groups = collectStockGroups();
    const stockIds = new Set(groups.map((g) => g.groupId));
    const customCount = (lens?.surfaces || []).filter((s, i) =>
      !isProtectedIndex(i) && !isAirSurfaceMedium(s) && !s.stop && !isStockLockedSurface(s)
    ).length;
    if (customCount > 0) warnings.push("This design is not fully orderable from stock glass.");
    const stopAp = Math.max(0, ...((lens?.surfaces || []).filter((s) => s.stop).map((s) => Number(s.ap)).filter(Number.isFinite)));
    for (const group of groups) {
      const c = group.catalog;
      if (!c) continue;
      if (c.availability === "inquire" || c.availability === "quote") warnings.push(`${c.supplier} ${c.code}: May not be directly stock.`);
      if (c.availability && !["stock", "limited_stock"].includes(c.availability) && c.availability !== "unknown") warnings.push(`${c.supplier} ${c.code}: Verify supplier lead time before ordering.`);
      if (c.raytrace_confidence === "low" || c.raytrace_confidence === "medium") warnings.push(`${c.supplier} ${c.code}: Approximate catalog data only.`);
      if (Number.isFinite(stopAp) && stopAp > 0 && Number(c.semi_diameter_mm) < stopAp * 1.05) warnings.push(`${c.supplier} ${c.code}: Likely vignetting/clipping.`);
    }
    if (!stockIds.size && customCount > 0) warnings.push("Stock Prototype Mode expects catalog elements; current design is still theoretical/custom.");
    return [...new Set(warnings)];
  }

  function validateStockPrototypeMode() {
    if (!lens?.stockPrototype?.enabled) return;
    const warnings = stockPrototypeWarnings();
    if (warnings.length) setStatusWarning(warnings[0], { force: true });
  }

  function buildPrototypeBom() {
    const groups = collectStockGroups();
    const customElements = (lens?.surfaces || []).filter((s, i) =>
      !isProtectedIndex(i) && !isAirSurfaceMedium(s) && !s.stop && !isStockLockedSurface(s)
    );
    const items = groups.map((g, index) => ({
      index: index + 1,
      surfaceIndex: g.firstIndex,
      supplier: g.catalog?.supplier || "",
      code: g.catalog?.code || "",
      type: g.catalog?.type || "",
      material: g.catalog?.material || "",
      diameter_mm: g.catalog?.diameter_mm ?? null,
      focal_length_mm: g.catalog?.efl_mm ?? null,
      coating: g.catalog?.coating || "",
      price_usd: g.catalog?.price_usd ?? null,
      delivery: g.catalog?.delivery || "",
      availability: g.catalog?.availability || "unknown",
      source_url: g.catalog?.source_url || "",
      air_gap_after_mm: g.airGapAfterMm,
      raytrace_confidence: g.catalog?.raytrace_confidence || "unknown",
    }));
    const spacers = groups.map((g, index) => ({
      after_element: index + 1,
      air_gap_mm: g.airGapAfterMm,
    }));
    const total = items.reduce((sum, item) => sum + (Number.isFinite(Number(item.price_usd)) ? Number(item.price_usd) : 0), 0);
    return {
      lensName: lens?.name || "Untitled lens",
      generatedAt: new Date().toISOString(),
      stockElementCount: items.length,
      customElementCount: customElements.length,
      totalEstimatedGlassCostUsd: total,
      items,
      spacers,
      warnings: stockPrototypeWarnings(),
    };
  }

  function openPrototypeBomModal() {
    const bom = buildPrototypeBom();
    if (ui.prototypeBomModal) {
      ui.prototypeBomModal.classList.remove("hidden");
      ui.prototypeBomModal.setAttribute("aria-hidden", "false");
    }
    renderPrototypeBom(bom);
  }

  function closePrototypeBomModal() {
    if (!ui.prototypeBomModal) return;
    ui.prototypeBomModal.classList.add("hidden");
    ui.prototypeBomModal.setAttribute("aria-hidden", "true");
  }

  function renderPrototypeBom(bom = buildPrototypeBom()) {
    if (ui.prototypeBomSummary) {
      ui.prototypeBomSummary.textContent = `${bom.stockElementCount} stock elements • ${bom.customElementCount} custom elements • estimated glass cost $${bom.totalEstimatedGlassCostUsd.toFixed(2)}`;
    }
    if (ui.prototypeBomBody) {
      const rows = bom.items.map((item) => `
        <tr>
          <td>${item.index}</td>
          <td>${escapeAttr(item.supplier)}</td>
          <td>${escapeAttr(item.code)}</td>
          <td>${escapeAttr(item.type)}</td>
          <td>${escapeAttr(item.material)}</td>
          <td>${escapeAttr(mmText(item.diameter_mm, 1))}</td>
          <td>${escapeAttr(mmText(item.focal_length_mm, 1))}</td>
          <td>${escapeAttr(item.coating)}</td>
          <td>${Number.isFinite(Number(item.price_usd)) ? `$${Number(item.price_usd).toFixed(2)}` : "—"}</td>
          <td>${escapeAttr(item.delivery)}</td>
          <td>${escapeAttr(item.availability)}</td>
          <td>${item.source_url ? `<a href="${escapeAttr(item.source_url)}" target="_blank" rel="noopener">source</a>` : "—"}</td>
        </tr>
      `).join("");
      ui.prototypeBomBody.innerHTML = `
        <table class="stockBomTable">
          <thead><tr><th>#</th><th>Supplier</th><th>Code</th><th>Type</th><th>Material</th><th>Ø</th><th>FL</th><th>Coating</th><th>Price</th><th>Delivery</th><th>Avail.</th><th>Source</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="12">No stock elements in this lens yet.</td></tr>`}</tbody>
        </table>
        <div class="stockBomBlock"><strong>Air gaps / spacers</strong><br>${bom.spacers.length ? bom.spacers.map((s) => `after element ${s.after_element}: ${mmText(s.air_gap_mm, 3)}`).join("<br>") : "No stock spacers yet."}</div>
        <div class="stockBomBlock"><strong>Warnings</strong><br>${bom.warnings.length ? bom.warnings.map(escapeAttr).join("<br>") : "No stock prototype warnings."}</div>
      `;
    }
  }

  function exportPrototypeBomJson() {
    downloadTextFile("prototype-bom.json", JSON.stringify(buildPrototypeBom(), null, 2), "application/json");
  }

  function exportPrototypeBomCsv() {
    const bom = buildPrototypeBom();
    const header = ["index","supplier","code","type","material","diameter_mm","focal_length_mm","coating","price_usd","delivery","availability","source_url","air_gap_after_mm"];
    const rows = bom.items.map((item) => header.map((key) => `"${String(item[key] ?? "").replace(/"/g, '""')}"`).join(","));
    downloadTextFile("prototype-bom.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  }

  function exportStockPrototypeLensJson() {
    const out = clone(lens);
    out.stockPrototype = { ...(out.stockPrototype || {}), bom: buildPrototypeBom() };
    downloadTextFile(`${String(out.name || "stock-prototype-lens").replace(/[^\w\-]+/g, "_")}.json`, JSON.stringify(out, null, 2), "application/json");
  }

  function wireStockLibraryUI() {
    if (ui.btnStockLibrary) ui.btnStockLibrary.addEventListener("click", () => openStockLibraryModal());
    if (ui.btnPrototypeBom) ui.btnPrototypeBom.addEventListener("click", openPrototypeBomModal);
    if (ui.btnStockPrototypeMode) ui.btnStockPrototypeMode.addEventListener("click", () => setStockPrototypeMode(!lens?.stockPrototype?.enabled));
    if (ui.stockClose) ui.stockClose.addEventListener("click", closeStockLibraryModal);
    if (ui.stockLibraryModal) ui.stockLibraryModal.addEventListener("mousedown", (e) => {
      if (e.target === ui.stockLibraryModal) closeStockLibraryModal();
    });
    [
      ui.stockSearch,
      ui.stockSupplierFilter,
      ui.stockTypeFilter,
      ui.stockMaterialFilter,
      ui.stockCoatingFilter,
      ui.stockDiameterMin,
      ui.stockDiameterMax,
      ui.stockEflMin,
      ui.stockEflMax,
      ui.stockMaxPrice,
      ui.stockAvailabilityFilter,
      ui.stockConfidenceFilter,
      ui.stockOnlyToggle,
    ].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", renderStockLibraryResults);
      el.addEventListener("change", renderStockLibraryResults);
    });
    if (ui.stockParseImport) ui.stockParseImport.addEventListener("click", parseStockImportRows);
    if (ui.stockAddParsed) ui.stockAddParsed.addEventListener("click", addParsedStockRowsToLibrary);
    if (ui.stockExportLibrary) ui.stockExportLibrary.addEventListener("click", exportStockLibraryJson);
    if (ui.bomClose) ui.bomClose.addEventListener("click", closePrototypeBomModal);
    if (ui.prototypeBomModal) ui.prototypeBomModal.addEventListener("mousedown", (e) => {
      if (e.target === ui.prototypeBomModal) closePrototypeBomModal();
    });
    if (ui.bomExportJson) ui.bomExportJson.addEventListener("click", exportPrototypeBomJson);
    if (ui.bomExportCsv) ui.bomExportCsv.addEventListener("click", exportPrototypeBomCsv);
    if (ui.bomExportLens) ui.bomExportLens.addEventListener("click", exportStockPrototypeLensJson);
    loadStockElementLibrary().then(() => {
      renderStockLibraryFilters();
      updateStockPrototypeUi();
    });
  }

  function readRuntimeBusyMarker() {
    const storage = getSafeLocalStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(RUNTIME_BUSY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function isSafeFocusShift(shiftMm) {
    const n = Number(shiftMm);
    return Number.isFinite(n) && Math.abs(n) <= MAX_FOCUS_SHIFT_MM;
  }

  function enterSafeMode(reason = "runtime guard") {
    _safeModeActive = true;
    if (ui.focusMode) ui.focusMode.value = "manual";
    if (ui.autoRefocusOnDistanceChange) ui.autoRefocusOnDistanceChange.checked = false;
    if (ui.rayCount) ui.rayCount.value = "7";
    focusRuntime.lastAutoKey = "";
    focusRuntime.lastAutoMetric = null;
    focusRuntime.lastAutoShiftMm = getFocusShiftMm();
    try { setRenderEngineEnabled(false); } catch (_) { renderEngineEnabled = false; }
    try { syncFocusControlsUI(); } catch (_) {}
    try { persistLensSession(); } catch (_) {}
    setStatusWarning(`Safe Mode: ${reason}. Preview OFF, focus manual, rays 7.`, { force: true });
  }

  function handleRuntimeError(prefix, error) {
    const msg = error?.message || String(error || "unknown error");
    console.error(prefix, error);
    enterSafeMode(`${prefix}: ${msg}`);
  }

  function handleRaytraceGuard(message) {
    const text = String(message || "Raytrace stopped.");
    if (_safeModeActive) {
      setStatusWarning(text);
      return;
    }
    enterSafeMode(text);
  }

  function buildPersistableLensPayload() {
    if (!lens || typeof lens !== "object") return null;
    const snapshot = clone(lens);
    // Keep storage footprint predictable; this source text can be large.
    if (snapshot && typeof snapshot === "object" && "originalZmxText" in snapshot) {
      delete snapshot.originalZmxText;
    }
    return {
      version: 1,
      savedAt: Date.now(),
      lens: snapshot,
    };
  }

  function persistLensSession() {
    const storage = getSafeLocalStorage();
    if (!storage) return false;
    try {
      const payload = buildPersistableLensPayload();
      if (!payload) return false;
      storage.setItem(LAST_LENS_STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function restoreLensSession() {
    const storage = getSafeLocalStorage();
    if (!storage) return false;
    try {
      const raw = storage.getItem(LAST_LENS_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const savedLens = parsed?.lens ?? parsed;
      if (!savedLens || !Array.isArray(savedLens?.surfaces) || !savedLens.surfaces.length) return false;
      loadLens(savedLens);
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeInitialAnchorScroll() {
    if (typeof window === "undefined") return;
    const hasAppMainHash = String(window.location.hash || "") === "#appMain";

    if (hasAppMainHash) {
      try {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      } catch (_) {}
    }
    try {
      if (window.history && "scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch (_) {}

    const resetScroll = () => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      } catch (_) {
        window.scrollTo(0, 0);
      }
      try {
        const scroller = document.scrollingElement;
        if (scroller) scroller.scrollTop = 0;
      } catch (_) {}
    };

    resetScroll();
    requestAnimationFrame(resetScroll);
    setTimeout(resetScroll, 0);
  }

  function zoomRoleForIndex(idx, total) {
    if (total <= 1) return null;
    if (idx === 0) return "Wide";
    if (idx === total - 1) return "Tele";
    return "Mid";
  }

  function formatZoomConfigLabel(cfg, idx, total) {
    const role = zoomRoleForIndex(idx, total);
    const raw = String(cfg?.label || "").trim();
    if (raw) {
      if (role) return `${role} — ${raw}`;
      return `Config ${cfg?.index ?? (idx + 1)} — ${raw}`;
    }
    if (role) return `${role} — Config ${cfg?.index ?? (idx + 1)}`;
    return `Config ${cfg?.index ?? (idx + 1)}`;
  }

  function updateZoomConfigUI() {
    if (!ui.zoomConfigWrap || !ui.zoomConfigSelect) return;
    const configs = Array.isArray(lens?.zoom?.configs) ? lens.zoom.configs : [];
    if (configs.length <= 1) {
      ui.zoomConfigWrap.classList.add("hidden");
      ui.zoomConfigSelect.innerHTML = "";
      return;
    }

    const active = Number(lens?.zoom?.activeConfig);
    ui.zoomConfigSelect.innerHTML = configs
      .map((cfg, idx) => {
        const label = formatZoomConfigLabel(cfg, idx, configs.length);
        const val = Number(cfg?.index);
        return `<option value="${Number.isFinite(val) ? val : (idx + 1)}">${label}</option>`;
      })
      .join("");
    const activeCfg = configs.some((cfg) => Number(cfg?.index) === active)
      ? active
      : Number(configs[0]?.index || 1);
    ui.zoomConfigSelect.value = String(activeCfg);
    ui.zoomConfigWrap.classList.remove("hidden");
  }

  function syncActiveZoomConfigFromUI() {
    if (!ui.zoomConfigSelect) return false;
    const cfgIdx = Number(ui.zoomConfigSelect.value);
    if (!Number.isFinite(cfgIdx)) return false;
    return applyZoomConfigToLens(cfgIdx, { silent: true, skipBuild: true, skipRender: true });
  }

  function applyZoomConfigToLens(configIndex, opts = {}) {
    const options = {
      silent: opts?.silent === true,
      skipBuild: opts?.skipBuild === true,
      skipRender: opts?.skipRender === true,
    };
    if (!lens?.zoom?.configs?.length) return false;

    const target = Number(configIndex);
    const cfg = lens.zoom.configs.find((c) => Number(c?.index) === target);
    if (!cfg) return false;
    const overrideKeys = Object.keys(cfg?.thicknessOverrides || {})
      .map((k) => String(Math.max(0, Math.trunc(Number(k)))))
      .filter((k) => k !== "0");
    const matchedOverrideKeys = new Set();

    for (const s of lens.surfaces || []) {
      if (!s) continue;
      if (!s.zmx || typeof s.zmx !== "object") s.zmx = {};
      if (!Number.isFinite(Number(s.zmx.baseDisz)) && Number.isFinite(Number(s.t))) {
        s.zmx.baseDisz = Number(s.t);
      }

      const surfNo = Number(s?.zmx?.surf);
      const type = String(s?.type || "").toUpperCase();
      if (!Number.isFinite(surfNo) || surfNo <= 0 || type === "IMS") continue;

      const key = String(Math.max(0, Math.trunc(surfNo)));
      const override = Number(cfg?.thicknessOverrides?.[key]);
      if (Number.isFinite(override)) {
        s.t = override;
        matchedOverrideKeys.add(key);
      } else if (Number.isFinite(Number(s?.zmx?.baseDisz))) {
        s.t = Number(s.zmx.baseDisz);
      }
    }

    const cfgIdx = lens.zoom.configs.findIndex((c) => Number(c?.index) === Number(cfg.index));
    if (!lens.zemax || typeof lens.zemax !== "object") lens.zemax = {};
    lens.zemax.zoomConfigCount = Math.max(0, Number(lens.zoom.configs.length) || 0);
    lens.zemax.currentConfigIndex = Number(cfg.index);
    lens.zemax.currentConfigLabel = formatZoomConfigLabel(cfg, Math.max(0, cfgIdx), lens.zoom.configs.length);
    lens.zemax.configAperture = Number.isFinite(Number(cfg?.aperture)) ? Number(cfg.aperture) : null;
    const imsIdxMeta = (lens.surfaces || []).findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    lens.zemax.imsSurfaceNumber = imsIdxMeta >= 0 && Number.isFinite(Number(lens?.surfaces?.[imsIdxMeta]?.zmx?.surf))
      ? Number(lens.surfaces[imsIdxMeta].zmx.surf)
      : null;

    const hasFieldOverrides = !!(
      cfg?.fieldOverrides &&
      (Object.keys(cfg.fieldOverrides.vdx || {}).length ||
       Object.keys(cfg.fieldOverrides.vdy || {}).length ||
       Object.keys(cfg.fieldOverrides.vcx || {}).length ||
       Object.keys(cfg.fieldOverrides.vcy || {}).length)
    );
    if (Array.isArray(lens?.zemax?.fields)) {
      if (!Array.isArray(lens.zemax.baseFields) || !lens.zemax.baseFields.length) {
        lens.zemax.baseFields = clone(lens.zemax.fields);
      }
      const baseFields = Array.isArray(lens.zemax.baseFields) ? lens.zemax.baseFields : [];
      const ov = cfg.fieldOverrides || {};
      const pick = (mapObj, keys, fallback) => {
        for (const k of keys) {
          const v = Number(mapObj?.[k]);
          if (Number.isFinite(v)) return v;
        }
        return fallback;
      };
      lens.zemax.fields = baseFields.map((f, i) => {
        const idx0 = Number.isFinite(Number(f?.index)) ? Number(f.index) : i;
        const keys = [String(i + 1), String(i), String(idx0), String(idx0 + 1)];
        return {
          ...f,
          vdx: pick(ov.vdx, keys, Number(f?.vdx) || 0),
          vdy: pick(ov.vdy, keys, Number(f?.vdy) || 0),
          vcx: pick(ov.vcx, keys, Number(f?.vcx) || 0),
          vcy: pick(ov.vcy, keys, Number(f?.vcy) || 0),
        };
      });
      lens.zemax.currentFieldOverrideSource = hasFieldOverrides ? `config_${cfg.index}` : "base";
    }

    lens.zoom.activeConfig = Number(cfg.index);
    clampAllApertures(lens.surfaces);
    computeVertices(lens.surfaces, 0, 0);
    updateZoomConfigUI();

    if (!options.silent) {
      try {
        const availableSurfNos = (lens.surfaces || [])
          .map((s) => Number(s?.zmx?.surf))
          .filter((n) => Number.isFinite(n))
          .map((n) => String(Math.max(0, Math.trunc(n))));
        const unmatchedOverrides = overrideKeys.filter((k) => !matchedOverrideKeys.has(k));
        const rows = (lens.surfaces || []).map((s, i) => {
          const zmxSurfNum = Number(s?.zmx?.surf);
          const zmxSurfKey = Number.isFinite(zmxSurfNum) ? String(Math.max(0, Math.trunc(zmxSurfNum))) : null;
          const overrideRaw = zmxSurfKey != null ? cfg?.thicknessOverrides?.[zmxSurfKey] : null;
          const override = Number(overrideRaw);
          return {
            row: i,
            type: String(s?.type || ""),
            zmxSurf: Number.isFinite(zmxSurfNum) ? zmxSurfNum : null,
            R: Number(s?.R),
            t: Number(s?.t),
            vx: Number.isFinite(Number(s?.vx)) ? Number(s.vx) : null,
            baseDisz: Number.isFinite(Number(s?.zmx?.baseDisz)) ? Number(s.zmx.baseDisz) : null,
            override: Number.isFinite(override) ? override : null,
            glass: String(s?.glass || "AIR"),
            nd: Number.isFinite(Number(s?.nd)) ? Number(s.nd) : null,
            vd: Number.isFinite(Number(s?.vd)) ? Number(s.vd) : null,
            ap: Number(s?.ap),
            stop: !!s?.stop,
          };
        });
        const imsIndex = (lens.surfaces || []).findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
        const imsSurfNo = imsIndex >= 0 ? Number(lens?.surfaces?.[imsIndex]?.zmx?.surf) : null;
        console.groupCollapsed(`[zoom-config] Applied ${formatZoomConfigLabel(cfg, Math.max(0, cfgIdx), lens.zoom.configs.length)}`);
        console.table(rows);
        console.log("[zoom-config] thicknessOverrides", cfg?.thicknessOverrides || {});
        console.log("[zoom-config] matchedOverrideKeys", Array.from(matchedOverrideKeys).sort((a, b) => Number(a) - Number(b)));
        console.log("[zoom-config] imsIndex", imsIndex, "imsZmxSurf", Number.isFinite(imsSurfNo) ? imsSurfNo : null);
        if (unmatchedOverrides.length) {
          console.warn("[zoom-config] Unmatched THIC overrides (zmx surface numbers not found):", unmatchedOverrides, {
            availableSurfNos,
          });
        }
        console.groupEnd();
      } catch (_) {}
    }

    if (!options.skipBuild) buildTable();
    if (!options.skipRender) {
      scheduleRenderAll();
      scheduleRenderPreview();
    }
    if (!options.silent) toast(`Zoom config: ${formatZoomConfigLabel(cfg, Math.max(0, cfgIdx), lens.zoom.configs.length)}`);
    return true;
  }

  function loadLens(obj) {
    lens = sanitizeLens(obj);
    clearAutoTunerSurfaceLocks();
    verifyPanelExpanded = false;
    focusRuntime.lastAutoKey = "";
    focusRuntime.lastAutoMetric = null;
    focusRuntime.lastAutoShiftMm = Number(lens?.focus?.shiftMm) || 0;
    if (ui.useZemaxFields) ui.useZemaxFields.checked = !!lens?.import_options?.use_zemax_fields;
    if (ui.verifyMatchZemaxWave) ui.verifyMatchZemaxWave.checked = !!lens?.import_options?.match_zemax_wavelength;
    if (ui.autoFocusMode) {
      const autofocusRaw = String(lens?.import_options?.autofocus_mode || "").trim().toLowerCase();
      ui.autoFocusMode.value = PREVIEW_AUTOFOCUS_MODES.has(autofocusRaw)
        ? autofocusRaw
        : PREVIEW_AUTOFOCUS_DEFAULT_MODE;
    }
    if (ui.focusMode) ui.focusMode.value = sanitizeFocusModeImport(lens?.focus?.mode);
    if (ui.focusMechanism) ui.focusMechanism.value = sanitizeFocusMechanismImport(lens?.focus?.mechanism);
    if (ui.autoRefocusOnDistanceChange) {
      ui.autoRefocusOnDistanceChange.checked = lens?.focus?.autoRefocusOnDistanceChange !== false;
    }
    if (_safeModeActive) {
      if (ui.focusMode) ui.focusMode.value = "manual";
      if (ui.autoRefocusOnDistanceChange) ui.autoRefocusOnDistanceChange.checked = false;
      if (ui.rayCount) ui.rayCount.value = "7";
      if (lens.focus) {
        lens.focus.mode = "manual";
        lens.focus.autoRefocusOnDistanceChange = false;
      }
    }
    updateZemaxVerifyChrome();
    ensureZemaxPrimaryWaveOption();
    const initialFocusShiftMm = Number(lens?.focus?.shiftMm);
    setFocusShiftMm(Number.isFinite(initialFocusShiftMm) ? initialFocusShiftMm : getFocusShiftMm(), { updateStatus: false });
    syncFocusControlsUI();
    selectedIndex = 0;
    clampAllApertures(lens.surfaces);
    updateZoomConfigUI();
    if (Array.isArray(lens?.zoom?.configs) && lens.zoom.configs.length) {
      const firstIdx = Number(lens.zoom.configs[0]?.index || 1);
      const desired = Number.isFinite(Number(lens?.zoom?.activeConfig))
        ? Number(lens.zoom.activeConfig)
        : firstIdx;
      if (!applyZoomConfigToLens(desired, { silent: true, skipBuild: true, skipRender: true })) {
        applyZoomConfigToLens(firstIdx, { silent: true, skipBuild: true, skipRender: true });
      }
    }
    buildTable();
    applySensorToIMS();
    scheduleRenderAll();
    if (preview.ready) scheduleRenderPreview();
    persistLensSession();
  }

  // -------------------- table helpers --------------------
  function clampSelected() {
    selectedIndex = Math.max(0, Math.min(lens.surfaces.length - 1, selectedIndex));
  }
  function enforceSingleStop(changedIndex) {
    if (!lens.surfaces[changedIndex]?.stop) return;
    lens.surfaces.forEach((s, i) => { if (i !== changedIndex) s.stop = false; });
  }

  let _focusMemo = null;
  function rememberTableFocus() {
    const a = document.activeElement;
    if (!a) return;
    if (!(a.classList && a.classList.contains("cellInput"))) return;
    _focusMemo = {
      i: a.dataset.i,
      k: a.dataset.k,
      ss: typeof a.selectionStart === "number" ? a.selectionStart : null,
      se: typeof a.selectionEnd === "number" ? a.selectionEnd : null,
    };
  }
  function restoreTableFocus() {
    if (!_focusMemo || !ui.tbody) return;
    const sel = `input.cellInput[data-i="${_focusMemo.i}"][data-k="${_focusMemo.k}"]`;
    const el = ui.tbody.querySelector(sel);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (_focusMemo.ss != null && _focusMemo.se != null) {
      try { el.setSelectionRange(_focusMemo.ss, _focusMemo.se); } catch (_) {}
    }
    _focusMemo = null;
  }

  // -------------------- table build + events --------------------
  function buildTable() {
    clampSelected();
    if (!ui.tbody) return;
    pruneAutoTunerSurfaceLocks();
    generateSurfaceLabels(lens.surfaces);
    const glassOptionNames = getGlassOptionNames(lens.surfaces);

    rememberTableFocus();
    ui.tbody.innerHTML = "";

    lens.surfaces.forEach((s, idx) => {
      const tr = document.createElement("tr");
      tr.classList.toggle("selected", idx === selectedIndex);

      tr.addEventListener("click", (ev) => {
        if (["INPUT", "SELECT", "OPTION", "TEXTAREA"].includes(ev.target.tagName)) return;
        selectedIndex = idx;
        buildTable();
      });

     const isOBJ = String(s.type || "").toUpperCase() === "OBJ";
     const glassValue = normalizeGlassInput(s.glass);
     const customNd = Number(s?.nd ?? s?.glass_nd);
     const customVd = Number(s?.vd ?? s?.glass_vd);
     const hasCustomGlass = Number.isFinite(customNd) && customNd > 1 && Number.isFinite(customVd) && customVd > 0;
     const customGlassLabel = hasCustomGlass
       ? `CUSTOM nd=${customNd.toFixed(3)} vd=${customVd.toFixed(1)}`
       : null;
     const locks = getAutoTunerSurfaceLock(idx);
     const isIMS = String(s.type || "").toUpperCase() === "IMS";
     const protectedSurface = isOBJ || isIMS;
     const stockLocked = isStockLockedSurface(s);
     const stockRearAir = isStockRearAirSurface(s);
     const stockFirst = stockLocked && stockGroupRangeAt(idx)?.start === idx;
     const customCopy = !!s.customCopyOfStock;
     const rowWarn = !!lens?.stockPrototype?.enabled && !protectedSurface && !s.stop && !isAirSurfaceMedium(s) && !stockLocked;
     tr.classList.toggle("stockLockedRow", stockLocked);
     tr.classList.toggle("stockPrototypeWarnRow", rowWarn);

tr.innerHTML = `
  <td style="width:34px; font-family:var(--mono)">${idx}</td>
  <td style="width:72px"><input class="cellInput" data-k="surfaceLabel" data-i="${idx}" value="${escapeAttr(getSurfaceDisplayLabel(s, idx))}" ${stockLocked ? "disabled" : ""}></td>
  <td style="width:92px"><input class="cellInput" data-k="R" data-i="${idx}" type="number" step="0.01" value="${s.R}" ${stockLocked ? "disabled" : ""}></td>

  <td style="width:92px">
    <input class="cellInput" data-k="t" data-i="${idx}" type="number" step="0.01"
      value="${isOBJ ? 0 : s.t}" ${isOBJ || (stockLocked && !stockRearAir) ? "disabled" : ""}>
  </td>

  <td style="width:92px"><input class="cellInput" data-k="ap" data-i="${idx}" type="number" step="0.01" value="${s.ap}" ${stockLocked ? "disabled" : ""}></td>
        <td style="width:110px">
          <select class="cellSelect" data-k="glass" data-i="${idx}" ${stockLocked ? "disabled" : ""}>
            ${glassOptionNames.map((name) =>
              `<option value="${name}" ${name === glassValue ? "selected" : ""}>${
                (name === glassValue && hasCustomGlass) ? customGlassLabel : name
              }</option>`
            ).join("")}
          </select>
        </td>
        <td class="cellChk" style="width:58px">
          <input type="checkbox" data-k="stop" data-i="${idx}" ${s.stop ? "checked" : ""} ${stockLocked ? "disabled" : ""}>
        </td>
        <td class="lockCell">
          <input type="checkbox" data-lock-k="R" data-i="${idx}" ${locks.R || protectedSurface || stockLocked ? "checked" : ""} ${protectedSurface || stockLocked ? "disabled" : ""} title="Lock R">
        </td>
        <td class="lockCell">
          <input type="checkbox" data-lock-k="t" data-i="${idx}" ${locks.t || protectedSurface || (stockLocked && !stockRearAir) ? "checked" : ""} ${protectedSurface || (stockLocked && !stockRearAir) ? "disabled" : ""} title="Lock t">
        </td>
        <td class="lockCell">
          <input type="checkbox" data-lock-k="ap" data-i="${idx}" ${locks.ap || isOBJ || stockLocked ? "checked" : ""} ${isOBJ || stockLocked ? "disabled" : ""} title="Lock aperture">
        </td>
        <td class="lockCell">
          <input type="checkbox" data-lock-k="glass" data-i="${idx}" ${locks.glass || protectedSurface || stockLocked ? "checked" : ""} ${protectedSurface || stockLocked ? "disabled" : ""} title="Lock glass">
        </td>
        <td class="stockActionCell">
          ${stockLocked ? `<span class="stockMiniBadge">LOCKED STOCK ELEMENT</span>${stockRearAir ? `<span class="stockMiniHint">Air gap editable</span>` : ""}${stockFirst ? `<button class="miniBtn stockRowAction" type="button" data-action="flip" data-i="${idx}">Flip</button><button class="miniBtn stockRowAction" type="button" data-action="custom-copy" data-i="${idx}">Convert to Custom Copy</button>` : ""}` : (protectedSurface || s.stop || isAirSurfaceMedium(s) ? "" : `<button class="miniBtn stockRowAction" type="button" data-action="find" data-i="${idx}">Find Closest Stock Match</button>${customCopy ? `<span class="stockMiniHint">custom copy</span>` : ""}`)}
        </td>
      `;
      ui.tbody.appendChild(tr);
    });

    ui.tbody.querySelectorAll("input.cellInput").forEach((el) => {
      el.addEventListener("input", onCellInput);
      el.addEventListener("change", onCellCommit);
      el.addEventListener("blur", onCellCommit);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); onCellCommit(e); }
      });
    });

    ui.tbody.querySelectorAll("select.cellSelect").forEach((el) => el.addEventListener("change", onCellCommit));
    ui.tbody.querySelectorAll('input[type="checkbox"][data-k="stop"]').forEach((el) => el.addEventListener("change", onCellCommit));
    ui.tbody.querySelectorAll('input[type="checkbox"][data-lock-k]').forEach((el) => {
      el.addEventListener("click", (e) => e.stopPropagation());
      el.addEventListener("change", (e) => {
        const input = e.target;
        setAutoTunerSurfaceLock(input.dataset.i, input.dataset.lockK, input.checked);
      });
    });
    ui.tbody.querySelectorAll(".stockRowAction").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const i = Number(e.currentTarget.dataset.i);
        const action = e.currentTarget.dataset.action;
        selectedIndex = Number.isFinite(i) ? i : selectedIndex;
        if (action === "find") findClosestStockForSurface(selectedIndex);
        if (action === "custom-copy") convertStockGroupToCustomCopy(selectedIndex);
        if (action === "flip") flipStockGroup(selectedIndex);
      });
    });

    restoreTableFocus();
  }

 function onCellInput(e) {
  const el = e.target;
  const i = Number(el.dataset.i);
  const k = el.dataset.k;
  if (!Number.isFinite(i) || !k) return;

  selectedIndex = i;
  const s = lens.surfaces[i];
  if (!s) return;
  if (isStockSurfaceFieldLocked(s, k)) {
    setStatusWarning("Locked stock element: only Air Gap / Spacer After is editable.");
    buildTable();
    return;
  }

  const t0 = String(s.type || "").toUpperCase();

  // ✅ OBJ thickness hard lock
  if (t0 === "OBJ" && k === "t") {
    s.t = 0.0;
    el.value = "0";
    scheduleRenderAll();
    scheduleRenderPreview();
    return;
  }

  if ((k === "R" || k === "t" || k === "ap") && String(el.value ?? "").trim() === "") {
    setStatusWarning(`Invalid number in surface ${i}`);
    return;
  }

  if (k === "surfaceLabel") {
    s.surfaceLabel = String(el.value ?? "");
    s.surfaceLabelAuto = false;
  } else if (k === "type") s.type = el.value;
  else if (k === "ap") {
    const ap = num(el.value, s.ap ?? 0);
    if (ap <= 0) setStatusWarning(`Raytrace stopped: invalid surface ${i} ap <= 0`);
    s.ap = ap;
    s.ap_optical = ap;
  } else if (k === "R" || k === "t") {
    s[k] = num(el.value, s[k] ?? 0);
    if (k === "t" && isStockRearAirSurface(s)) s.stockAirGapAfterMm = s[k];
  }
  else s[k] = num(el.value, s[k] ?? 0);

  applySensorToIMS();
  scheduleRenderAll();
  scheduleRenderPreview();
}

function onCellCommit(e) {
  const el = e.target;
  const i = Number(el.dataset.i);
  const k = el.dataset.k;
  if (!Number.isFinite(i) || !k) return;

  selectedIndex = i;
  const s = lens.surfaces[i];
  if (!s) return;
  if (isStockSurfaceFieldLocked(s, k)) {
    setStatusWarning("Locked stock element: convert to custom copy before editing physical catalog fields.");
    buildTable();
    return;
  }

  const t0 = String(s.type || "").toUpperCase();

  // ✅ OBJ thickness hard lock (ook op commit)
  if (t0 === "OBJ" && k === "t") {
    s.t = 0.0;
    el.value = "0";
  }

  if ((k === "R" || k === "t" || k === "ap") && String(el.value ?? "").trim() === "") {
    setStatusWarning(`Invalid number in surface ${i}`);
    buildTable();
    scheduleRenderAll();
    return;
  }

  if (k === "stop") {
    s.stop = !!el.checked;
    enforceSingleStop(i);
  } else if (k === "glass") {
    s.glass = normalizeGlassInput(el.value);
    s.originalGlass = s.glass;
    s.nd = null;
    s.vd = null;
    s.glass_nd = null;
    s.glass_vd = null;
  } else if (k === "surfaceLabel") {
    const label = String(el.value ?? "").trim();
    const upperLabel = label.toUpperCase();
    s.surfaceLabel = label;
    s.surfaceLabelAuto = false;
    if (upperLabel === "STOP") {
      s.type = "STOP";
      s.stop = true;
      s.surfaceLabelAuto = true;
      enforceSingleStop(i);
    } else if (upperLabel === "MECH" || upperLabel === "BAFFLE" || upperLabel === "HOUSING") {
      s.type = upperLabel;
    } else if (!label) {
      s.surfaceLabelAuto = true;
      generateSurfaceLabels(lens.surfaces, { force: true });
    }
  } else if (k === "type") {
    s.type = String(el.value ?? "");
    if (String(s.type).toUpperCase() === "STOP") {
      s.stop = true;
      enforceSingleStop(i);
    }
  } else if (k === "ap") {
    const ap = num(el.value, s.ap ?? 0);
    if (ap <= 0) setStatusWarning(`Raytrace stopped: invalid surface ${i} ap <= 0`);
    s.ap = ap;
    s.ap_optical = ap;
  } else if (k === "R" || k === "t") {
    s[k] = num(el.value, s[k] ?? 0);
    if (k === "t" && isStockRearAirSurface(s)) s.stockAirGapAfterMm = s[k];
  } else {
    s[k] = String(el.value ?? "");
  }

  if (i === 0) {
    s.type = "OBJ";
    s.surfaceLabel = "OBJ";
    s.surfaceLabelAuto = true;
    s.t = 0.0;
    s.stop = false;
  }
  if (i === lens.surfaces.length - 1) {
    s.type = "IMS";
    s.surfaceLabel = "IMS";
    s.surfaceLabelAuto = true;
    s.stop = false;
  }

  applySensorToIMS();
  clampAllApertures(lens.surfaces);
  generateSurfaceLabels(lens.surfaces);
  buildTable();
  scheduleRenderAll();
  scheduleRenderPreview();
}

  // -------------------- math helpers --------------------
  function normalize(v) {
    const m = Math.hypot(v.x, v.y);
    if (m < 1e-12) return { x: 0, y: 0 };
    return { x: v.x / m, y: v.y / m };
  }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function mul(a, s) { return { x: a.x * s, y: a.y * s }; }

  const HIT_T_EPS = 1e-9;
  const SURFACE_BRANCH_EPS = 1e-6;
  const DEBUG_FIRST_NEG_SURFACE_INTERSECT = true;
  const DEBUG_FIRST_TRACE_FAIL = true;
  let _loggedNegSurfaceBranch2D = false;
  let _loggedNegSurfaceBranch3D = false;
  let _loggedTraceFail = false;

  function maybeLogNegativeSurfaceBranch2D(surf, roots, chosen) {
    if (!DEBUG_FIRST_NEG_SURFACE_INTERSECT || _loggedNegSurfaceBranch2D) return;
    if (!(Number(surf?.R || 0) < -1e-9)) return;
    _loggedNegSurfaceBranch2D = true;
    console.log("[intersectSurface 2D] first negative-surface branch check", {
      type: String(surf?.type || ""),
      vx: Number(surf?.vx || 0),
      R: Number(surf?.R || 0),
      roots,
      chosen: chosen
        ? { t: chosen.t, hit: chosen.hit, xExpected: chosen.xExpected, branchError: chosen.branchError }
        : null,
    });
  }

  function maybeLogNegativeSurfaceBranch3D(surf, roots, chosen) {
    if (!DEBUG_FIRST_NEG_SURFACE_INTERSECT || _loggedNegSurfaceBranch3D) return;
    if (!(Number(surf?.R || 0) < -1e-9)) return;
    _loggedNegSurfaceBranch3D = true;
    console.log("[intersectSurface3D] first negative-surface branch check", {
      type: String(surf?.type || ""),
      vx: Number(surf?.vx || 0),
      R: Number(surf?.R || 0),
      roots,
      chosen: chosen
        ? { t: chosen.t, hit: chosen.hit, xExpected: chosen.xExpected, branchError: chosen.branchError }
        : null,
    });
  }

  function maybeLogTraceFail(tag, payload) {
    if (!DEBUG_FIRST_TRACE_FAIL || _loggedTraceFail) return;
    _loggedTraceFail = true;
    console.warn(`[trace] ${tag}`, payload);
  }

  function refract(I, N, n1, n2) {
    I = normalize(I);
    N = normalize(N);
    if (dot(I, N) > 0) N = mul(N, -1);
    const cosi = -dot(N, I);
    const eta = n1 / n2;
    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;
    const T = add(mul(I, eta), mul(N, eta * cosi - Math.sqrt(k)));
    return normalize(T);
  }

  function intersectSurface(ray, surf) {
    if (!validateRayForTrace(ray)) return null;
    const vx = Number(surf?.vx);
    const R = Number(surf?.R ?? 0);
    const ap = getSurfaceOpticalAp(surf);
    if (!Number.isFinite(vx) || !Number.isFinite(R) || !Number.isFinite(ap) || ap <= 0) return null;

    if (Math.abs(R) < 1e-9) {
      if (Math.abs(ray.d.x) < 1e-12) return null;

      const tRaw = (vx - ray.p.x) / ray.d.x;
      if (!Number.isFinite(tRaw) || tRaw <= -HIT_T_EPS) return null;
      const t = tRaw < 0 ? 0 : tRaw;

      const hit = add(ray.p, mul(ray.d, t));
      const vignetted = Math.abs(hit.y) > ap + HIT_T_EPS;

      const N = { x: -1, y: 0 };
      return { hit, t, vignetted, normal: N };
    }

    const cx = vx + R;
    const rad = Math.abs(R);

    const px = ray.p.x - cx;
    const py = ray.p.y;
    const dx = ray.d.x;
    const dy = ray.d.y;

    const A = dx * dx + dy * dy;
    if (!Number.isFinite(A) || Math.abs(A) < 1e-18) return null;
    const B = 2 * (px * dx + py * dy);
    const C = px * px + py * py - rad * rad;

    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;

    const sdisc = Math.sqrt(disc);
    const t1 = (-B - sdisc) / (2 * A);
    const t2 = (-B + sdisc) / (2 * A);

    const signR = Math.sign(R) || 1;
    const evalRoot = (t) => {
      if (!Number.isFinite(t)) {
        return { t, positive: false, inside: null, hit: null, xExpected: null, branchError: null, branchOk: false };
      }
      const hit = add(ray.p, mul(ray.d, t));
      const inside = rad * rad - hit.y * hit.y;
      const xExpected = cx - signR * Math.sqrt(Math.max(0, inside));
      const branchError = Math.abs(hit.x - xExpected);
      const nonNegative = t >= -HIT_T_EPS;
      const branchOk = nonNegative && inside >= -SURFACE_BRANCH_EPS && branchError <= SURFACE_BRANCH_EPS;
      const tClamped = t < 0 ? 0 : t;
      return { t: tClamped, nonNegative, inside, hit, xExpected, branchError, branchOk };
    };

    const roots = [evalRoot(t1), evalRoot(t2)];
    let chosen = null;
    for (const r of roots) {
      if (!r.branchOk) continue;
      if (!chosen || r.t < chosen.t) chosen = r;
    }
    if (!chosen) {
      const fallback = roots
        .filter((r) => r.nonNegative && r.inside >= -SURFACE_BRANCH_EPS && Number.isFinite(r.branchError))
        .sort((a, b) => a.branchError - b.branchError)[0] || null;
      const fallbackTol = Math.max(SURFACE_BRANCH_EPS * 50, 1e-4);
      if (fallback && fallback.branchError <= fallbackTol) chosen = fallback;
    }

    maybeLogNegativeSurfaceBranch2D(surf, roots, chosen);
    if (!chosen) return null;

    const hit = chosen.hit;
    const t = chosen.t;
    const vignetted = Math.abs(hit.y) > ap + HIT_T_EPS;
    const Nout = normalize({ x: hit.x - cx, y: hit.y });
    return { hit, t, vignetted, normal: Nout };
  }

  const _surfacePositionCache = new WeakMap();

  function computeVertices(surfaces, lensShift = 0, sensorShift = 0) {
    if (!Array.isArray(surfaces)) return 0;
    const key = [
      Number(lensShift).toFixed(6),
      Number(sensorShift).toFixed(6),
      surfaces.length,
      ...surfaces.map((s) => `${String(s?.type || "")}:${Number(s?.t ?? 0).toFixed(6)}`),
    ].join("|");
    const cached = _surfacePositionCache.get(surfaces);
    if (cached?.key === key && Array.isArray(cached.vx) && cached.vx.length === surfaces.length) {
      for (let i = 0; i < surfaces.length; i++) surfaces[i].vx = cached.vx[i];
      return cached.total;
    }
    let x = 0;
    for (let i = 0; i < surfaces.length; i++) {
      surfaces[i].vx = x;
      const dt = Number(surfaces[i].t ?? 0);
      if (!Number.isFinite(dt)) {
        handleRaytraceGuard(`Raytrace stopped: invalid surface ${i} t`);
        continue;
      }
      x += dt;
    }

    if (Number.isFinite(lensShift) && Math.abs(lensShift) > 1e-12) {
      for (let i = 0; i < surfaces.length; i++) {
        const t = String(surfaces[i]?.type || "").toUpperCase();
        if (t !== "IMS") surfaces[i].vx += lensShift;
      }
    }

    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx >= 0 && Number.isFinite(sensorShift) && Math.abs(sensorShift) > 1e-12) {
      surfaces[imsIdx].vx += sensorShift;
    }

    _surfacePositionCache.set(surfaces, {
      key,
      total: x,
      vx: surfaces.map((s) => Number(s?.vx) || 0),
    });
    return x;
  }

  function getSensorPlaneX(surfaces, fallback = 0) {
    const ims = Array.isArray(surfaces)
      ? surfaces.find((s) => String(s?.type || "").toUpperCase() === "IMS")
      : null;
    const x = Number(ims?.vx);
    if (Number.isFinite(x)) return x;
    const fb = Number(fallback);
    return Number.isFinite(fb) ? fb : 0;
  }

  function findStopSurfaceIndex(surfaces) {
    return surfaces.findIndex((s) => !!s.stop);
  }

  // ==================== 3D (axisymmetric) helpers ====================
  function normalize3(v){
    const m = Math.hypot(v.x, v.y, v.z);
    if (m < 1e-12) return { x:0, y:0, z:0 };
    return { x:v.x/m, y:v.y/m, z:v.z/m };
  }
  function dot3(a,b){ return a.x*b.x + a.y*b.y + a.z*b.z; }
  function add3(a,b){ return { x:a.x+b.x, y:a.y+b.y, z:a.z+b.z }; }
  function mul3(a,s){ return { x:a.x*s, y:a.y*s, z:a.z*s }; }

  function refract3(I, N, n1, n2){
    I = normalize3(I);
    N = normalize3(N);
    if (dot3(I, N) > 0) N = mul3(N, -1);

    const cosi = -dot3(N, I);
    const eta = n1 / n2;
    const k = 1 - eta*eta*(1 - cosi*cosi);
    if (k < 0) return null;

    const T = add3(mul3(I, eta), mul3(N, eta*cosi - Math.sqrt(k)));
    return normalize3(T);
  }

  function intersectSurface3D(ray, surf){
    if (!validateRay3DForTrace(ray)) return null;
    const vx = Number(surf?.vx);
    const R = Number(surf?.R ?? 0);
    const ap = getSurfaceOpticalAp(surf);
    if (!Number.isFinite(vx) || !Number.isFinite(R) || !Number.isFinite(ap) || ap <= 0) return null;

    const isPlane = Math.abs(R) < 1e-9;

    if (isPlane){
      if (Math.abs(ray.d.x) < 1e-12) return null;
      const tRaw = (vx - ray.p.x) / ray.d.x;
      if (!Number.isFinite(tRaw) || tRaw <= -HIT_T_EPS) return null;
      const t = tRaw < 0 ? 0 : tRaw;

      const hit = add3(ray.p, mul3(ray.d, t));
      const r = Math.hypot(hit.y, hit.z);
      const vignetted = r > ap + HIT_T_EPS;

      const N = { x:-1, y:0, z:0 };
      return { hit, t, vignetted, normal: N };
    }

    const cx = vx + R;
    const rad = Math.abs(R);

    const px = ray.p.x - cx;
    const py = ray.p.y;
    const pz = ray.p.z;
    const dx = ray.d.x;
    const dy = ray.d.y;
    const dz = ray.d.z;

    const A = dx*dx + dy*dy + dz*dz;
    if (!Number.isFinite(A) || Math.abs(A) < 1e-18) return null;
    const B = 2 * (px*dx + py*dy + pz*dz);
    const C = px*px + py*py + pz*pz - rad*rad;

    const disc = B*B - 4*A*C;
    if (disc < 0) return null;

    const sdisc = Math.sqrt(disc);
    const t1 = (-B - sdisc) / (2*A);
    const t2 = (-B + sdisc) / (2*A);

    const signR = Math.sign(R) || 1;
    const evalRoot = (t) => {
      if (!Number.isFinite(t)) {
        return { t, positive: false, r2: null, inside: null, hit: null, xExpected: null, branchError: null, branchOk: false };
      }
      const hit = add3(ray.p, mul3(ray.d, t));
      const r2 = hit.y * hit.y + hit.z * hit.z;
      const inside = rad * rad - r2;
      const xExpected = cx - signR * Math.sqrt(Math.max(0, inside));
      const branchError = Math.abs(hit.x - xExpected);
      const nonNegative = t >= -HIT_T_EPS;
      const branchOk = nonNegative && inside >= -SURFACE_BRANCH_EPS && branchError <= SURFACE_BRANCH_EPS;
      const tClamped = t < 0 ? 0 : t;
      return { t: tClamped, nonNegative, r2, inside, hit, xExpected, branchError, branchOk };
    };

    const roots = [evalRoot(t1), evalRoot(t2)];
    let chosen = null;
    for (const r of roots) {
      if (!r.branchOk) continue;
      if (!chosen || r.t < chosen.t) chosen = r;
    }
    if (!chosen) {
      const fallback = roots
        .filter((r) => r.nonNegative && r.inside >= -SURFACE_BRANCH_EPS && Number.isFinite(r.branchError))
        .sort((a, b) => a.branchError - b.branchError)[0] || null;
      const fallbackTol = Math.max(SURFACE_BRANCH_EPS * 50, 1e-4);
      if (fallback && fallback.branchError <= fallbackTol) chosen = fallback;
    }

    maybeLogNegativeSurfaceBranch3D(surf, roots, chosen);
    if (!chosen) return null;

    const hit = chosen.hit;
    const t = chosen.t;
    const r = Math.hypot(hit.y, hit.z);
    const vignetted = r > ap + HIT_T_EPS;

    const Nout = normalize3({ x: hit.x - cx, y: hit.y, z: hit.z });
    return { hit, t, vignetted, normal: Nout };
  }

  function traceRayReverse3D(ray, surfaces, wavePreset){
    let vignetted = false;
    let tir = false;
    let failReason = null;
    let failSurfaceIndex = null;

  if (!validateRay3DForTrace(ray)) {
    handleRaytraceGuard("Raytrace stopped: invalid 3D ray input.");
    return { pts: [], vignetted: true, tir: false, failReason: "invalid_ray", failSurfaceIndex: null, endRay: ray };
  }

  let raySteps = 0;
  for (let i = surfaces.length - 1; i >= 0; i--){
    if (++raySteps > MAX_RAY_STEPS) {
      handleRaytraceGuard("Raytrace stopped: max ray steps reached.");
      vignetted = true;
      failReason = "max_ray_steps";
      break;
    }
    const s = surfaces[i];
    const type = String(s?.type || "").toUpperCase();
    const isOBJ  = type === "OBJ";
    const isIMS  = type === "IMS";
    const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";

    if (isOBJ){
      continue;
    }
    const surfaceGuard = validateSurfaceForRaytrace(s, i);
    if (!surfaceGuard.ok) {
      handleRaytraceGuard(surfaceGuard.message);
      vignetted = true;
      failReason = surfaceGuard.reason;
      failSurfaceIndex = i;
      break;
    }

    const hitInfo = intersectSurface3D(ray, s);
      if (!hitInfo){ vignetted = true; failReason = "no_hit"; failSurfaceIndex = i; break; }

      if (!isIMS && hitInfo.vignetted){ vignetted = true; break; }

      if (isIMS || isMECH){
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const nRight = surfaceN(s, wavePreset);
      const nLeft  = (i === 0) ? 1.0 : surfaceN(surfaces[i - 1], wavePreset);
      if (!Number.isFinite(Number(nRight)) || !Number.isFinite(Number(nLeft)) || Number(nRight) <= 0 || Number(nLeft) <= 0) {
        handleRaytraceGuard(`Raytrace stopped: invalid refractive index at surface ${i}`);
        vignetted = true;
        failReason = "invalid_refractive_index";
        failSurfaceIndex = i;
        break;
      }

      if (Math.abs(nLeft - nRight) < 1e-9){
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const newDir = refract3(ray.d, hitInfo.normal, nRight, nLeft);
      if (!newDir){ tir = true; failReason = "tir"; failSurfaceIndex = i; break; }
      if (!Number.isFinite(Number(newDir.x)) || !Number.isFinite(Number(newDir.y)) || !Number.isFinite(Number(newDir.z))) {
        handleRaytraceGuard(`Raytrace stopped: numerical overflow at surface ${i}`);
        vignetted = true;
        failReason = "numerical_overflow";
        failSurfaceIndex = i;
        break;
      }

      ray = { p: hitInfo.hit, d: newDir };
    }

    return { vignetted, tir, failReason, failSurfaceIndex, endRay: ray };
  }

  function intersectPlaneX3D(ray, xPlane){
    if (Math.abs(ray.d.x) < 1e-12) return null;
    const t = (xPlane - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    return add3(ray.p, mul3(ray.d, t));
  }

  // -------------------- physical sanity clamps --------------------
  const AP_SAFETY = 0.90;
  const AP_MAX_PLANE = 30.0;
  const AP_MIN = 0.01;
  const DEFAULT_SHOULDER_MIN_DIFF = 0.35;

  function isZemaxImportedLens() {
    const src = String(lens?.importSource || "").trim().toLowerCase();
    const zsrc = String(lens?.zemax?.source || "").trim().toLowerCase();
    return (
      src === "zemax" ||
      src === "zmx_text" ||
      src === "zmx_file" ||
      src.includes("zemax") ||
      src.includes("zmx") ||
      zsrc === "zemax" ||
      !!lens?.originalZmxText
    );
  }

  function shouldBypassApertureClampForSurface(s) {
    if (!isZemaxImportedLens()) return false;
    const surfNo = Number(s?.zmx?.surf);
    if (Number.isFinite(surfNo) && surfNo >= 0) return true;
    return !!lens?.originalZmxText;
  }

  function isAirMediumName(name) {
    return String(name ?? "AIR").trim().toUpperCase() === "AIR";
  }

  function isPhysicalSurfaceType(typeRaw) {
    const t = String(typeRaw || "").toUpperCase();
    return t !== "OBJ" && t !== "IMS" && t !== "MECH" && t !== "BAFFLE" && t !== "HOUSING";
  }

  function getRawSurfaceOpticalAp(s) {
    return Number(s?.ap_optical ?? s?.ap);
  }

  function validateSurfaceForRaytrace(s, surfaceIndex = null) {
    const label = Number.isFinite(Number(surfaceIndex)) ? `surface ${Number(surfaceIndex)}` : "surface";
    const type = String(s?.type || "").toUpperCase();
    if (!s || typeof s !== "object") return { ok: false, reason: "missing_surface", message: `Raytrace stopped: missing ${label}` };
    const R = Number(s.R ?? 0);
    const t = Number(s.t ?? 0);
    const apRaw = getRawSurfaceOpticalAp(s);
    if (!Number.isFinite(R)) return { ok: false, reason: "invalid_R", message: `Raytrace stopped: invalid ${label} R` };
    if (!Number.isFinite(t)) return { ok: false, reason: "invalid_t", message: `Raytrace stopped: invalid ${label} t` };
    if (!Number.isFinite(apRaw)) return { ok: false, reason: "invalid_ap", message: `Raytrace stopped: invalid ${label} ap` };
    if (apRaw <= 0 && type !== "OBJ") return { ok: false, reason: "invalid_ap", message: `Raytrace stopped: invalid ${label} ap <= 0` };

    const hasNd = s.nd != null && String(s.nd).trim() !== "";
    const hasVd = s.vd != null && String(s.vd).trim() !== "";
    if (hasNd && !Number.isFinite(Number(s.nd))) return { ok: false, reason: "invalid_nd", message: `Raytrace stopped: invalid ${label} nd` };
    if (hasVd && !Number.isFinite(Number(s.vd))) return { ok: false, reason: "invalid_vd", message: `Raytrace stopped: invalid ${label} vd` };
    return { ok: true };
  }

  function validateRayForTrace(ray) {
    return !!(
      ray &&
      Number.isFinite(Number(ray?.p?.x)) &&
      Number.isFinite(Number(ray?.p?.y)) &&
      Number.isFinite(Number(ray?.d?.x)) &&
      Number.isFinite(Number(ray?.d?.y))
    );
  }

  function validateRay3DForTrace(ray) {
    return !!(
      ray &&
      Number.isFinite(Number(ray?.p?.x)) &&
      Number.isFinite(Number(ray?.p?.y)) &&
      Number.isFinite(Number(ray?.p?.z)) &&
      Number.isFinite(Number(ray?.d?.x)) &&
      Number.isFinite(Number(ray?.d?.y)) &&
      Number.isFinite(Number(ray?.d?.z))
    );
  }

  function getSurfaceOpticalAp(s) {
    const ap = Number(s?.ap_optical ?? s?.ap ?? AP_MIN);
    if (shouldBypassApertureClampForSurface(s)) {
      return Math.max(AP_MIN, ap);
    }
    const lim = maxApForSurface(s);
    return Math.max(AP_MIN, Math.min(ap, lim));
  }

  function getSurfaceMechanicalAp(s) {
    const fallback = getSurfaceOpticalAp(s);
    const hasExplicitMech = s && s.ap_mech != null && String(s.ap_mech).trim() !== "";
    const raw = hasExplicitMech ? Number(s.ap_mech) : NaN;
    let ap = Number.isFinite(raw) ? raw : fallback;

    const R = Number(s?.R || 0);
    if (Number.isFinite(R) && Math.abs(R) >= 1e-9) {
      // Keep branch-aware sphere evaluation stable at the edge.
      const lim = Math.max(AP_MIN, Math.abs(R) - 1e-5);
      ap = Math.min(ap, lim);
    }

    return Math.max(AP_MIN, ap);
  }

  function hasExplicitMechanicalAperture(s) {
    if (!s) return false;
    if (!(s.ap_mech != null && String(s.ap_mech).trim() !== "")) return false;
    const m = Number(s.ap_mech);
    return Number.isFinite(m) && m > 0;
  }

  function isStopLikeSurface(s) {
    if (!s) return false;
    if (Boolean(s.stop)) return true;
    return String(s.type || "").toUpperCase() === "STOP";
  }

  function getSurfaceDrawMode(s) {
    const dm = String(s?.draw_mode ?? "zemax_like").trim().toLowerCase();
    if (dm === "optical" || dm === "mechanical" || dm === "zemax_like") return dm;
    return "zemax_like";
  }

  function getSurfaceShoulderMode(s) {
    const sm = String(s?.shoulder_mode ?? "none").trim().toLowerCase();
    if (sm === "none" || sm === "flat" || sm === "step" || sm === "bridge") return sm;
    return "none";
  }

  function getSurfaceShoulderDepth(s, fallback = 0) {
    const d = Number(s?.shoulder_depth);
    if (Number.isFinite(d) && d > 0) return d;
    return Math.max(0, Number(fallback) || 0);
  }

  function getSurfaceBevel(s) {
    const b = Number(s?.bevel);
    return Number.isFinite(b) ? Math.max(0, b) : 0;
  }

  function getSurfaceEdgeThicknessMode(s) {
    const m = String(s?.edge_thickness_mode ?? "auto").trim().toLowerCase();
    return m === "explicit" ? "explicit" : "auto";
  }

  function maxApForSurface(s) {
    const R = Number(s?.R || 0);
    if (!Number.isFinite(R) || Math.abs(R) < 1e-9) return AP_MAX_PLANE;
    return Math.max(AP_MIN, Math.abs(R) * AP_SAFETY);
  }

  function clampSurfaceAp(s) {
    if (!s) return;

    const t = String(s.type || "").toUpperCase();
    if (t === "IMS" || t === "OBJ") return;

    const lim = maxApForSurface(s);
    const apOpt = Number(s.ap_optical ?? s.ap ?? AP_MIN);
    if (shouldBypassApertureClampForSurface(s)) {
      const unclamped = Math.max(AP_MIN, apOpt);
      s.ap_optical = unclamped;
      s.ap = unclamped;
      return;
    }
    const clamped = Math.max(AP_MIN, Math.min(apOpt, lim));
    s.ap_optical = clamped;
    s.ap = clamped;
  }

  function clampAllApertures(surfaces) {
    if (!Array.isArray(surfaces)) return;
    for (const s of surfaces) clampSurfaceAp(s);
  }

  function surfaceXatY(s, y) {
    const vx = s.vx;
    const R = s.R;
    if (Math.abs(R) < 1e-9) return vx;

    const cx = vx + R;
    const rad = Math.abs(R);
    const sign = Math.sign(R) || 1;
    const inside = rad * rad - y * y;
    if (inside < 0) return null;
    return cx - sign * Math.sqrt(inside);
  }

  function maxNonOverlappingSemiDiameter(sFront, sBack, minCT = 0.10) {
    const apGuess = Math.max(AP_MIN, Math.min(getSurfaceOpticalAp(sFront), getSurfaceOpticalAp(sBack)));
    function gapAt(y) {
      const xf = surfaceXatY(sFront, y);
      const xb = surfaceXatY(sBack, y);
      if (xf == null || xb == null) return -1e9;
      return xb - xf;
    }
    if (gapAt(0) < minCT) return 0.01;
    if (gapAt(apGuess) >= minCT) return apGuess;

    let lo = 0, hi = apGuess;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) * 0.5;
      if (gapAt(mid) >= minCT) lo = mid;
      else hi = mid;
    }
    return Math.max(0.01, lo);
  }

  // -------------------- tracing --------------------
function traceRayForward(ray, surfaces, wavePreset, opts = {}) {
  const skipIMS = !!opts.skipIMS;
  const rayIndex = Number.isFinite(Number(opts?.rayIndex)) ? Number(opts.rayIndex) : null;
  const debugTrace = opts?.debugTrace === true;

  let pts = [];
  let vignetted = false;
  let tir = false;
  let reachedIMS = false;
  let failReason = null;
  let failSurfaceIndex = null;
  let failSurface = null;

  if (!validateRayForTrace(ray)) {
    handleRaytraceGuard("Raytrace stopped: invalid ray input.");
    return {
      pts: [],
      vignetted: true,
      tir: false,
      reachedIMS: false,
      failReason: "invalid_ray",
      failSurfaceIndex: null,
      failSurface: null,
      endRay: ray,
    };
  }

  // ✅ teken altijd vanaf ray start
  pts.push({ x: ray.p.x, y: ray.p.y });

  let nBefore = 1.0;
  const logTraceFailDetailed = (reason, surfaceIndex, s, hitInfo, nAfter = null) => {
    if (!debugTrace) return;
    console.warn("[trace fail]", {
      reason,
      rayIndex,
      surfaceIndex,
      zmxSurf: Number.isFinite(Number(s?.zmx?.surf)) ? Number(s.zmx.surf) : null,
      type: String(s?.type || ""),
      vx: Number(s?.vx || 0),
      R: Number(s?.R || 0),
      t: Number(s?.t || 0),
      ap: Number(getSurfaceOpticalAp(s)),
      glass: String(s?.glass || "AIR"),
      nd: Number.isFinite(Number(s?.nd)) ? Number(s.nd) : null,
      vd: Number.isFinite(Number(s?.vd)) ? Number(s.vd) : null,
      nBefore: Number.isFinite(Number(nBefore)) ? Number(nBefore) : null,
      nAfter: Number.isFinite(Number(nAfter)) ? Number(nAfter) : null,
      hit: hitInfo?.hit || null,
      rayP: ray?.p || null,
      rayD: ray?.d || null,
      activeZoomConfig: Number.isFinite(Number(lens?.zoom?.activeConfig)) ? Number(lens.zoom.activeConfig) : null,
      activeZoomLabel: String(lens?.zemax?.currentConfigLabel || lens?.zemax?.currentConfigIndex || "—"),
    });
  };

  let raySteps = 0;
  for (let i = 0; i < surfaces.length; i++) {
    if (++raySteps > MAX_RAY_STEPS) {
      handleRaytraceGuard("Raytrace stopped: max ray steps reached.");
      vignetted = true;
      failReason = "max_ray_steps";
      break;
    }
    const s = surfaces[i];
    const type = String(s?.type || "").toUpperCase();
    const isOBJ = type === "OBJ";
    const isIMS = type === "IMS";
    const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";

    if (isOBJ) continue;
    if (skipIMS && isIMS) continue;
    const surfaceGuard = validateSurfaceForRaytrace(s, i);
    if (!surfaceGuard.ok) {
      handleRaytraceGuard(surfaceGuard.message);
      vignetted = true;
      failReason = surfaceGuard.reason;
      failSurfaceIndex = i;
      failSurface = s;
      break;
    }

    const hitInfo = intersectSurface(ray, s);
    if (!hitInfo) {
      if (Number.isFinite(Number(s?.vx)) && Math.abs(Number(ray?.d?.x || 0)) > 1e-12) {
        const tFail = (Number(s.vx) - Number(ray.p.x || 0)) / Number(ray.d.x || 1);
        if (Number.isFinite(tFail) && tFail > 0) {
          pts.push(add(ray.p, mul(ray.d, tFail)));
        }
      }
      const nAfter = (!isIMS && !isMECH) ? surfaceN(s, wavePreset) : null;
      maybeLogTraceFail("forward_no_hit", {
        surfaceIndex: i,
        rayIndex,
        type,
        vx: Number(s?.vx || 0),
        R: Number(s?.R || 0),
        t: Number(s?.t || 0),
        ap: Number(getSurfaceOpticalAp(s)),
        glass: String(s?.glass || "AIR"),
        nd: Number.isFinite(Number(s?.nd)) ? Number(s.nd) : null,
        vd: Number.isFinite(Number(s?.vd)) ? Number(s.vd) : null,
        nBefore,
        nAfter,
        rayP: ray?.p,
        rayD: ray?.d,
      });
      logTraceFailDetailed("no_hit", i, s, null, nAfter);
      vignetted = true;
      failReason = "no_hit";
      failSurfaceIndex = i;
      failSurface = s;
      break;
    }

    pts.push(hitInfo.hit);

    if (isIMS) {
      reachedIMS = true;
      ray = { p: hitInfo.hit, d: ray.d };
      continue;
    }

    if (hitInfo.vignetted) {
      const nAfter = !isMECH ? surfaceN(s, wavePreset) : null;
      maybeLogTraceFail("forward_aperture_clip", {
        surfaceIndex: i,
        rayIndex,
        type,
        vx: Number(s?.vx || 0),
        R: Number(s?.R || 0),
        t: Number(s?.t || 0),
        ap: Number(getSurfaceOpticalAp(s)),
        glass: String(s?.glass || "AIR"),
        nd: Number.isFinite(Number(s?.nd)) ? Number(s.nd) : null,
        vd: Number.isFinite(Number(s?.vd)) ? Number(s.vd) : null,
        nBefore,
        nAfter,
        hit: hitInfo.hit,
      });
      logTraceFailDetailed("aperture_clip", i, s, hitInfo, nAfter);
      vignetted = true;
      failReason = "aperture_clip";
      failSurfaceIndex = i;
      failSurface = s;
      break;
    }

    if (isMECH) {
      ray = { p: hitInfo.hit, d: ray.d };
      continue;
    }

    const nAfter = surfaceN(s, wavePreset);
    if (!Number.isFinite(Number(nAfter)) || Number(nAfter) <= 0) {
      handleRaytraceGuard(`Raytrace stopped: invalid refractive index at surface ${i}`);
      vignetted = true;
      failReason = "invalid_refractive_index";
      failSurfaceIndex = i;
      failSurface = s;
      break;
    }

    if (Math.abs(nAfter - nBefore) < 1e-9) {
      ray = { p: hitInfo.hit, d: ray.d };
      nBefore = nAfter;
      continue;
    }

    const newDir = refract(ray.d, hitInfo.normal, nBefore, nAfter);
    if (!newDir) {
      maybeLogTraceFail("forward_tir", {
        surfaceIndex: i,
        rayIndex,
        type,
        vx: Number(s?.vx || 0),
        R: Number(s?.R || 0),
        t: Number(s?.t || 0),
        ap: Number(getSurfaceOpticalAp(s)),
        glass: String(s?.glass || "AIR"),
        nd: Number.isFinite(Number(s?.nd)) ? Number(s.nd) : null,
        vd: Number.isFinite(Number(s?.vd)) ? Number(s.vd) : null,
        nBefore,
        nAfter,
        hit: hitInfo.hit,
      });
      logTraceFailDetailed("tir", i, s, hitInfo, nAfter);
      tir = true;
      failReason = "tir";
      failSurfaceIndex = i;
      failSurface = s;
      break;
    }
    if (!Number.isFinite(Number(newDir.x)) || !Number.isFinite(Number(newDir.y))) {
      handleRaytraceGuard(`Raytrace stopped: numerical overflow at surface ${i}`);
      vignetted = true;
      failReason = "numerical_overflow";
      failSurfaceIndex = i;
      failSurface = s;
      break;
    }

    ray = { p: hitInfo.hit, d: newDir };
    nBefore = nAfter;
  }

  if (!reachedIMS && !vignetted && !tir) {
    failReason = "no_ims";
  }
  return { pts, vignetted, tir, reachedIMS, failReason, failSurfaceIndex, failSurface, endRay: ray };
}

  function traceRayReverse(ray, surfaces, wavePreset, opts = {}) {
    const ignoreAperture = !!opts.ignoreAperture;
    let pts = [];
    let vignetted = false;
    let tir = false;
    let failReason = null;
    let failSurfaceIndex = null;

    if (!validateRayForTrace(ray)) {
      handleRaytraceGuard("Raytrace stopped: invalid reverse ray input.");
      return { pts, vignetted: true, tir: false, failReason: "invalid_ray", failSurfaceIndex: null, endRay: ray };
    }

    let raySteps = 0;
    for (let i = surfaces.length - 1; i >= 0; i--) {
      if (++raySteps > MAX_RAY_STEPS) {
        handleRaytraceGuard("Raytrace stopped: max ray steps reached.");
        vignetted = true;
        failReason = "max_ray_steps";
        break;
      }
      const s = surfaces[i];
      const type = String(s?.type || "").toUpperCase();
      const isOBJ = type === "OBJ";
      const isIMS = type === "IMS";
      const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";

      if (isOBJ) continue;
      const surfaceGuard = validateSurfaceForRaytrace(s, i);
      if (!surfaceGuard.ok) {
        handleRaytraceGuard(surfaceGuard.message);
        vignetted = true;
        failReason = surfaceGuard.reason;
        failSurfaceIndex = i;
        break;
      }
      const hitInfo = intersectSurface(ray, s);
      if (!hitInfo) { vignetted = true; failReason = "no_hit"; failSurfaceIndex = i; break; }

      pts.push(hitInfo.hit);

      if (!isIMS && hitInfo.vignetted && !ignoreAperture) { vignetted = true; break; }

      if (isIMS || isMECH) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const nRight = surfaceN(s, wavePreset);
      const nLeft  = (i === 0) ? 1.0 : surfaceN(surfaces[i - 1], wavePreset);
      if (!Number.isFinite(Number(nRight)) || !Number.isFinite(Number(nLeft)) || Number(nRight) <= 0 || Number(nLeft) <= 0) {
        handleRaytraceGuard(`Raytrace stopped: invalid refractive index at surface ${i}`);
        vignetted = true;
        failReason = "invalid_refractive_index";
        failSurfaceIndex = i;
        break;
      }

      if (Math.abs(nLeft - nRight) < 1e-9) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const newDir = refract(ray.d, hitInfo.normal, nRight, nLeft);
      if (!newDir) { tir = true; failReason = "tir"; failSurfaceIndex = i; break; }
      if (!Number.isFinite(Number(newDir.x)) || !Number.isFinite(Number(newDir.y))) {
        handleRaytraceGuard(`Raytrace stopped: numerical overflow at surface ${i}`);
        vignetted = true;
        failReason = "numerical_overflow";
        failSurfaceIndex = i;
        break;
      }

      ray = { p: hitInfo.hit, d: newDir };
    }

    return { pts, vignetted, tir, failReason, failSurfaceIndex, endRay: ray };
  }

  function intersectPlaneX(ray, xPlane) {
    if (Math.abs(ray.d.x) < 1e-12) return null;
    const t = (xPlane - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    return add(ray.p, mul(ray.d, t));
  }

  // -------------------- ray bundles --------------------
  function getRayReferencePlane(surfaces) {
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx >= 0) {
      const s = surfaces[stopIdx];
      return { xRef: s.vx, apRef: Math.max(1e-3, getSurfaceOpticalAp(s) * 0.98), refIdx: stopIdx };
    }
    let refIdx = 1;
    if (!surfaces[refIdx] || String(surfaces[refIdx].type).toUpperCase() === "IMS") refIdx = 0;
    const s = surfaces[refIdx] || surfaces[0];
    return { xRef: s.vx, apRef: Math.max(1e-3, getSurfaceOpticalAp(s) * 0.98), refIdx };
  }

  function finiteFieldObjectPoint(surfaces, fieldAngleDeg, objectDistanceMm = null) {
    const dist = Number(objectDistanceMm);
    if (!Number.isFinite(dist) || dist <= 0.1 || dist >= 1e8) return null;
    const xObj = (Number(surfaces?.[0]?.vx) || 0) - dist;
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const yObj = Math.tan(theta) * dist;
    if (!Number.isFinite(xObj) || !Number.isFinite(yObj)) return null;
    return { xObj, yObj, distMm: dist };
  }

  function projectRayThroughAimFromObject(xObj, yObj, xAim, yAim, xStart) {
    const den = xAim - xObj;
    if (!Number.isFinite(den) || Math.abs(den) < 1e-9) return null;
    const t = (xStart - xObj) / den;
    const yStart = yObj + (yAim - yObj) * t;
    if (!Number.isFinite(yStart)) return null;
    const dir = normalize({ x: xAim - xStart, y: yAim - yStart });
    if (!Number.isFinite(dir.x) || !Number.isFinite(dir.y)) return null;
    return { p: { x: xStart, y: yStart }, d: dir };
  }

  function buildRays(surfaces, fieldAngleDeg, count, objectDistanceMm = null) {
    const n = Math.max(3, Math.min(101, count | 0));
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

    const xStart = (surfaces[0]?.vx ?? 0) - 80;
    const { xRef, apRef } = getRayReferencePlane(surfaces);
    const objPoint = finiteFieldObjectPoint(surfaces, fieldAngleDeg, objectDistanceMm);

    const hMax = apRef * 0.98;
    const rays = [];
    const tanT = Math.abs(dir.x) < 1e-9 ? 0 : dir.y / dir.x;

    for (let k = 0; k < n; k++) {
      const a = (k / (n - 1)) * 2 - 1;
      const yAtRef = a * hMax;
      if (objPoint) {
        const finiteRay = projectRayThroughAimFromObject(
          objPoint.xObj,
          objPoint.yObj,
          xRef,
          yAtRef,
          xStart
        );
        if (finiteRay) {
          rays.push(finiteRay);
          continue;
        }
      }
      const y0 = yAtRef - tanT * (xRef - xStart);
      rays.push({ p: { x: xStart, y: y0 }, d: dir });
    }
    return rays;
  }

  function buildDebugCenterRays(surfaces, count = 31) {
    const n = Math.max(3, Math.min(101, count | 0));
    const first = (surfaces || []).find((s) => {
      const t = String(s?.type || "").toUpperCase();
      return t !== "OBJ" && t !== "IMS";
    }) || (surfaces || []).find((s) => String(s?.type || "").toUpperCase() !== "OBJ");
    const stopIdx = findStopSurfaceIndex(surfaces || []);
    const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : first;
    const stopAp = Math.max(0.25, Number(getSurfaceOpticalAp(stopSurf)) || 0.25);
    const firstAp = Math.max(0.25, Math.min(stopAp * 0.55, 3.0));
    const xStart = Number(first?.vx || 0) - 20;
    const rays = [];
    for (let k = 0; k < n; k++) {
      const a = (k / (n - 1)) * 2 - 1;
      rays.push({
        p: { x: xStart, y: a * firstAp },
        d: normalize({ x: 1, y: 0 }),
      });
    }
    return rays;
  }

  function buildEntrancePupilLimitedRays(surfaces, count = 31, fieldAngleDeg = 0, wavePreset = "d", objectDistanceMm = null) {
    const n = Math.max(3, Math.min(101, count | 0));
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

    const first = (surfaces || []).find((s) => {
      const t = String(s?.type || "").toUpperCase();
      return t !== "OBJ" && t !== "IMS";
    }) || (surfaces || []).find((s) => String(s?.type || "").toUpperCase() !== "OBJ");

    const xStart = Number(first?.vx || 0) - 20;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : first;
    const xAim = Number(stopSurf?.vx || 0);
    const objPoint = finiteFieldObjectPoint(surfaces, fieldAngleDeg, objectDistanceMm);
    const stopAp = Math.max(0.25, Number(getSurfaceOpticalAp(stopSurf)) || 0.25);

    let epRadiusMm = null;
    // Start from stop aperture scale so on-axis bundles are not visually collapsed.
    let pupilRadius = stopAp * 0.95;

    try {
      const ep = estimateEntrancePupil(surfaces, wavePreset);
      if (ep && Number.isFinite(ep.radiusMm) && ep.radiusMm > 0.1 && ep.radiusMm < 100) {
        epRadiusMm = Number(ep.radiusMm);
        pupilRadius = epRadiusMm * 0.85;
      }
    } catch (_) {}

    // Keep bundle tied to the active stop aperture instead of a tiny fixed cap.
    pupilRadius = Math.max(stopAp * 0.75, Math.min(pupilRadius, stopAp * 0.98));

    const rays = [];
    for (let k = 0; k < n; k++) {
      const a = (k / (n - 1)) * 2 - 1;
      const yAtAim = a * pupilRadius;
      if (objPoint) {
        const finiteRay = projectRayThroughAimFromObject(
          objPoint.xObj,
          objPoint.yObj,
          xAim,
          yAtAim,
          xStart
        );
        if (finiteRay) {
          rays.push(finiteRay);
          continue;
        }
      }
      const yStart = yAtAim - (Math.abs(dir.x) < 1e-9 ? 0 : (dir.y / dir.x) * (xAim - xStart));
      rays.push({
        p: { x: xStart, y: yStart },
        d: dir,
      });
    }

    return {
      rays,
      bundleRadiusMm: pupilRadius,
      epRadiusMm,
      xStartMm: xStart,
      xAimMm: xAim,
      mode: objPoint ? "entrance_pupil_limited_finite_object" : "entrance_pupil_limited",
    };
  }

  function buildChiefRay(surfaces, fieldAngleDeg) {
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

    const xStart = (surfaces[0]?.vx ?? 0) - 120;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
    const xStop = stopSurf.vx;

    const tanT = Math.abs(dir.x) < 1e-9 ? 0 : dir.y / dir.x;
    const y0 = 0 - tanT * (xStop - xStart);
    return { p: { x: xStart, y: y0 }, d: dir };
  }

  function rayHitYAtX(endRay, x) {
    if (!endRay?.d || Math.abs(endRay.d.x) < 1e-9) return null;
    const t = (x - endRay.p.x) / endRay.d.x;
    if (!Number.isFinite(t)) return null;
    return endRay.p.y + t * endRay.d.y;
  }

  function coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfH) {
    let lo = 0, hi = 60, best = 0;
    for (let iter = 0; iter < 18; iter++) {
      const mid = (lo + hi) * 0.5;
      const ray = buildChiefRay(surfaces, mid);
      const tr = traceRayForward(clone(ray), surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir) { hi = mid; continue; }

      const y = rayHitYAtX(tr.endRay, sensorX);
      if (y == null) { hi = mid; continue; }
      if (Math.abs(y) <= halfH) { best = mid; lo = mid; }
      else hi = mid;
    }
    return best;
  }

  // -------------------- EFL/BFL (paraxial-ish) --------------------
  function lastPhysicalVertexX(surfaces) {
    let maxX = -Infinity;
    for (const s of surfaces || []) {
      const t = String(s?.type || "").toUpperCase();
      if (t === "IMS") continue;
      if (!Number.isFinite(s.vx)) continue;
      maxX = Math.max(maxX, s.vx);
    }
    return Number.isFinite(maxX) ? maxX : 0;
  }
  function firstPhysicalVertexX(surfaces) {
    if (!surfaces?.length) return 0;
    let minX = Infinity;
    for (const s of surfaces) {
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      if (!Number.isFinite(s.vx)) continue;
      minX = Math.min(minX, s.vx);
    }
    return Number.isFinite(minX) ? minX : (surfaces[0]?.vx ?? 0);
  }

  function traceParaxialRayDetailed(surfaces, wavePreset, xStart, y0, opts = {}) {
    const ignoreAperture = opts?.ignoreAperture === true;
    let ray = { p: { x: xStart, y: y0 }, d: normalize({ x: 1, y: 0 }) };
    let nBefore = 1.0;
    let lastSurfaceInfo = null;

    for (let i = 0; i < (surfaces?.length || 0); i++) {
      const s = surfaces[i];
      const type = String(s?.type || "").toUpperCase();
      const isOBJ = type === "OBJ";
      const isIMS = type === "IMS";
      const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";
      if (isOBJ || isIMS) continue;

      const hitInfo = intersectSurface(ray, s);
      if (!hitInfo) {
        return {
          ok: false,
          reason: "no_hit",
          surfaceIndex: i,
          surface: s,
          nBefore,
          nAfter: null,
          hit: null,
          vignetted: false,
          tir: false,
        };
      }

      if (hitInfo.vignetted && !ignoreAperture) {
        return {
          ok: false,
          reason: "aperture_clip",
          surfaceIndex: i,
          surface: s,
          nBefore,
          nAfter: null,
          hit: hitInfo.hit,
          vignetted: true,
          tir: false,
        };
      }

      if (isMECH) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const nAfter = surfaceN(s, wavePreset);
      lastSurfaceInfo = { index: i, surface: s, nBefore, nAfter, hit: hitInfo.hit };

      if (Math.abs(nAfter - nBefore) < 1e-9) {
        ray = { p: hitInfo.hit, d: ray.d };
        nBefore = nAfter;
        continue;
      }

      const newDir = refract(ray.d, hitInfo.normal, nBefore, nAfter);
      if (!newDir) {
        return {
          ok: false,
          reason: "tir",
          surfaceIndex: i,
          surface: s,
          nBefore,
          nAfter,
          hit: hitInfo.hit,
          vignetted: false,
          tir: true,
        };
      }

      ray = { p: hitInfo.hit, d: newDir };
      nBefore = nAfter;
    }

    return {
      ok: true,
      endRay: ray,
      y0,
      lastSurfaceInfo,
    };
  }

  function maybeLogParaxialFailure(surfaces, wavePreset, xStart, y0, fail) {
    if (!fail || fail.ok) return;
    const s = fail.surface || {};
    const signature = [
      fail.reason,
      String(fail.surfaceIndex),
      String(Number(s?.zmx?.surf)),
      Number(s?.R || 0).toFixed(6),
      Number(s?.t || 0).toFixed(6),
      String(s?.glass || "AIR"),
      Number(fail.nBefore || 0).toFixed(6),
      Number(fail.nAfter || 0).toFixed(6),
    ].join("|");
    if (signature === _lastParaxialFailSignature) return;
    _lastParaxialFailSignature = signature;

    const row = {
      reason: fail.reason,
      y0,
      xStart,
      surfaceIndex: fail.surfaceIndex,
      zmxSurf: Number.isFinite(Number(s?.zmx?.surf)) ? Number(s.zmx.surf) : null,
      type: String(s?.type || ""),
      R: Number(s?.R || 0),
      t: Number(s?.t || 0),
      vx: Number(s?.vx || 0),
      ap: Number(s?.ap_optical ?? s?.ap ?? 0),
      glass: String(s?.glass || "AIR"),
      nd: Number.isFinite(Number(s?.nd)) ? Number(s.nd) : null,
      vd: Number.isFinite(Number(s?.vd)) ? Number(s.vd) : null,
      nBefore: Number.isFinite(Number(fail.nBefore)) ? Number(fail.nBefore) : null,
      nAfter: Number.isFinite(Number(fail.nAfter)) ? Number(fail.nAfter) : null,
      hitX: Number.isFinite(Number(fail?.hit?.x)) ? Number(fail.hit.x) : null,
      hitY: Number.isFinite(Number(fail?.hit?.y)) ? Number(fail.hit.y) : null,
      vignetted: !!fail.vignetted,
      tir: !!fail.tir,
      activeZoomConfig: Number.isFinite(Number(lens?.zoom?.activeConfig)) ? Number(lens.zoom.activeConfig) : null,
      activeZoomLabel: String(lens?.zemax?.currentConfigLabel || lens?.zemax?.currentConfigIndex || "—"),
    };

    console.groupCollapsed("[paraxial-debug] EFL/BFL paraxial trace failed");
    console.table([row]);
    console.groupEnd();
  }

  function estimateEflBflParaxial(surfaces, wavePreset) {
    const lastVx = lastPhysicalVertexX(surfaces);
    const xStart = (surfaces[0]?.vx ?? 0) - 160;

    const heights = [0.02, 0.05, 0.10, 0.20, 0.35];
    const fVals = [];
    const xCrossVals = [];
    let firstFail = null;

    for (const y0 of heights) {
      const tr = traceParaxialRayDetailed(surfaces, wavePreset, xStart, y0, { ignoreAperture: true });
      if (!tr || !tr.ok || !tr.endRay) {
        if (!firstFail) {
          firstFail = tr
            ? { ...tr, y0 }
            : {
                ok: false,
                reason: "unknown",
                y0,
                surfaceIndex: null,
                surface: null,
                nBefore: null,
                nAfter: null,
                hit: null,
                vignetted: false,
                tir: false,
              };
        }
        continue;
      }

      const er = tr.endRay;
      const dx = er.d.x, dy = er.d.y;
      if (Math.abs(dx) < 1e-12) continue;

      const uOut = dy / dx;
      if (Math.abs(uOut) < 1e-12) continue;

      const f = -y0 / uOut;
      if (Number.isFinite(f)) fVals.push(f);

      if (Math.abs(dy) > 1e-12) {
        const t = -er.p.y / dy;
        const xCross = er.p.x + t * dx;
        if (Number.isFinite(xCross)) xCrossVals.push(xCross);
      }
    }

    if (fVals.length < 2) {
      if (firstFail) maybeLogParaxialFailure(surfaces, wavePreset, xStart, firstFail.y0, firstFail);
      return { efl: null, bfl: null };
    }

    _lastParaxialFailSignature = "";

    const efl = fVals.reduce((a, b) => a + b, 0) / fVals.length;

    let bfl = null;
    if (xCrossVals.length >= 2) {
      const xF = xCrossVals.reduce((a, b) => a + b, 0) / xCrossVals.length;
      bfl = xF - lastVx;
    }
    return { efl, bfl };
  }

  function lineIntersectionFromRays2D(r1, r2) {
    if (!r1?.p || !r1?.d || !r2?.p || !r2?.d) return null;
    const den = r1.d.x * r2.d.y - r1.d.y * r2.d.x;
    if (!Number.isFinite(den) || Math.abs(den) < 1e-12) return null;

    const dx = r2.p.x - r1.p.x;
    const dy = r2.p.y - r1.p.y;
    const t1 = (dx * r2.d.y - dy * r2.d.x) / den;
    if (!Number.isFinite(t1)) return null;

    return {
      x: r1.p.x + t1 * r1.d.x,
      y: r1.p.y + t1 * r1.d.y,
    };
  }

  function leastSquaresLineIntersection2D(rays) {
    if (!Array.isArray(rays) || rays.length < 2) return null;

    let a11 = 0, a12 = 0, a22 = 0;
    let b1 = 0, b2 = 0;
    let used = 0;

    for (const r of rays) {
      if (!r?.p || !r?.d) continue;
      const m = Math.hypot(r.d.x, r.d.y);
      if (!Number.isFinite(m) || m < 1e-12) continue;

      const dx = r.d.x / m;
      const dy = r.d.y / m;
      const nx = -dy;
      const ny = dx;
      const c = nx * r.p.x + ny * r.p.y;

      a11 += nx * nx;
      a12 += nx * ny;
      a22 += ny * ny;
      b1 += nx * c;
      b2 += ny * c;
      used++;
    }

    if (used < 2) return null;
    const det = a11 * a22 - a12 * a12;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;

    const x = (b1 * a22 - b2 * a12) / det;
    const y = (a11 * b2 - a12 * b1) / det;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, used };
  }

  function estimateStopPointImageParaxial(frontStack, xStop, yStop, wavePreset) {
    const startX = xStop + 1e-4;
    const slopes = [-0.012, -0.008, -0.005, -0.003, 0.003, 0.005, 0.008, 0.012];
    const endRays = [];

    for (const slope of slopes) {
      const ray = {
        p: { x: startX, y: yStop },
        d: normalize({ x: -1, y: slope }),
      };
      const tr = traceRayReverse(clone(ray), frontStack, wavePreset, { ignoreAperture: true });
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;
      endRays.push(tr.endRay);
    }

    if (endRays.length < 2) return null;

    const lsq = leastSquaresLineIntersection2D(endRays);
    if (lsq && Math.abs(lsq.x) < 1e6 && Math.abs(lsq.y) < 1e6) {
      return { x: lsq.x, y: lsq.y, n: lsq.used, method: "lsq" };
    }

    const intersections = [];
    for (let i = 0; i < endRays.length; i++) {
      for (let j = i + 1; j < endRays.length; j++) {
        const d1 = endRays[i].d;
        const d2 = endRays[j].d;
        const m1 = Math.hypot(d1.x, d1.y);
        const m2 = Math.hypot(d2.x, d2.y);
        if (m1 < 1e-12 || m2 < 1e-12) continue;
        const cosang = Math.abs((d1.x * d2.x + d1.y * d2.y) / (m1 * m2));
        if (cosang > 0.99995) continue;

        const cross = lineIntersectionFromRays2D(endRays[i], endRays[j]);
        if (!cross) continue;
        if (!Number.isFinite(cross.x) || !Number.isFinite(cross.y)) continue;
        if (Math.abs(cross.x) > 1e6 || Math.abs(cross.y) > 1e6) continue;
        intersections.push(cross);
      }
    }

    if (!intersections.length) return null;

    const xs = intersections.map((p) => p.x).sort((a, b) => a - b);
    const ys = intersections.map((p) => p.y).sort((a, b) => a - b);
    const median = (arr) => {
      const n = arr.length;
      if (!n) return NaN;
      const mid = Math.floor(n / 2);
      return (n % 2) ? arr[mid] : 0.5 * (arr[mid - 1] + arr[mid]);
    };
    const mx = median(xs);
    const my = median(ys);
    if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;

    const ranked = intersections
      .map((p) => ({ p, d: Math.hypot(p.x - mx, p.y - my) }))
      .sort((a, b) => a.d - b.d);
    const keepN = Math.max(1, Math.ceil(ranked.length * 0.6));
    const core = ranked.slice(0, keepN).map((e) => e.p);

    const x = core.reduce((sum, p) => sum + p.x, 0) / core.length;
    const y = core.reduce((sum, p) => sum + p.y, 0) / core.length;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, n: core.length, method: "pairwise" };
  }

  function estimateEntrancePupilFromOnAxisBundle(surfaces, wavePreset = "d") {
    if (!Array.isArray(surfaces) || !surfaces.length) return null;

    const xStart = (Number(surfaces[0]?.vx) || 0) - 120;
    const testPass = (y) => {
      const ray = {
        p: { x: xStart, y },
        d: normalize({ x: 1, y: 0 }),
      };
      const tr = traceRayForward(clone(ray), surfaces, wavePreset, { skipIMS: true });
      return !!(tr && !tr.vignetted && !tr.tir);
    };

    if (!testPass(0)) return null;

    let apMax = 1;
    for (const s of surfaces) {
      if (!isPhysicalSurfaceType(s?.type)) continue;
      apMax = Math.max(apMax, getSurfaceOpticalAp(s));
    }

    let lo = 0;
    let hi = Math.max(1, apMax * 1.25);
    for (let i = 0; i < 8; i++) {
      if (!testPass(hi)) break;
      lo = hi;
      hi *= 1.5;
    }

    if (lo === 0 && !testPass(hi)) {
      // keep current bracket
    } else if (testPass(hi)) {
      // no clipping even at high test value; clamp to tested max
      return {
        diameterMm: 2 * hi,
        radiusMm: hi,
        xMm: xStart,
        method: "on_axis_bundle_unclipped_fallback",
      };
    }

    for (let iter = 0; iter < 30; iter++) {
      const mid = 0.5 * (lo + hi);
      if (testPass(mid)) lo = mid;
      else hi = mid;
    }

    const radius = Math.max(0, lo);
    if (!Number.isFinite(radius) || radius <= 1e-6) return null;
    return {
      diameterMm: 2 * radius,
      radiusMm: radius,
      xMm: xStart,
      method: "on_axis_bundle_fallback",
    };
  }

  function estimateEntrancePupil(surfaces, wavePreset = "d") {
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return null;

    const stopSurf = surfaces[stopIdx];
    const stopAp = Math.max(1e-6, getSurfaceOpticalAp(stopSurf));
    const xStop = Number(stopSurf?.vx);
    if (!Number.isFinite(xStop)) return null;

    if (stopIdx <= 0) {
      return {
        diameterMm: 2 * stopAp,
        radiusMm: stopAp,
        xMm: xStop,
        method: "stop_direct",
      };
    }

    const frontStack = surfaces.slice(0, stopIdx + 1);
    const yPara = Math.min(1.2, Math.max(0.03, stopAp * 0.015));
    const pPos = estimateStopPointImageParaxial(frontStack, xStop, +yPara, wavePreset);
    const pNeg = estimateStopPointImageParaxial(frontStack, xStop, -yPara, wavePreset);

    if (pPos && pNeg) {
      const m = (pPos.y - pNeg.y) / (2 * yPara);
      const radius = Math.abs(m) * stopAp;
      if (Number.isFinite(radius) && radius > 1e-6 && radius < 1e5) {
        return {
          diameterMm: 2 * radius,
          radiusMm: radius,
          xMm: 0.5 * (pPos.x + pNeg.x),
          method: "paraxial_stop_image",
        };
      }
    }

    const pOne = pPos || pNeg;
    if (pOne) {
      const yObj = pPos ? yPara : -yPara;
      const m = pOne.y / yObj;
      const radius = Math.abs(m) * stopAp;
      if (Number.isFinite(radius) && radius > 1e-6 && radius < 1e5) {
        return {
          diameterMm: 2 * radius,
          radiusMm: radius,
          xMm: pOne.x,
          method: "paraxial_single_side",
        };
      }
    }

    // Near-edge paraxial mapping (less ideal than small-signal, but often robust for very fast lenses).
    const yEdge = stopAp * 0.95;
    const ePos = estimateStopPointImageParaxial(frontStack, xStop, +yEdge, wavePreset);
    const eNeg = estimateStopPointImageParaxial(frontStack, xStop, -yEdge, wavePreset);
    if (ePos && eNeg) {
      const mEdge = (ePos.y - eNeg.y) / (2 * yEdge);
      const radius = Math.abs(mEdge) * stopAp;
      if (Number.isFinite(radius) && radius > 1e-6 && radius < 1e5) {
        return {
          diameterMm: 2 * radius,
          radiusMm: radius,
          xMm: 0.5 * (ePos.x + eNeg.x),
          method: "edge_paraxial_stop_image",
        };
      }
    }

    const eOne = ePos || eNeg;
    if (eOne) {
      const yObj = ePos ? yEdge : -yEdge;
      const m = eOne.y / yObj;
      const radius = Math.abs(m) * stopAp;
      if (Number.isFinite(radius) && radius > 1e-6 && radius < 1e5) {
        return {
          diameterMm: 2 * radius,
          radiusMm: radius,
          xMm: eOne.x,
          method: "edge_paraxial_single_side",
        };
      }
    }

    // Fallback: use full edge imaging (more aberration-sensitive but robust).
    const startX = xStop + 1e-4;
    const slopeBases = [0.03, 0.08, 0.15, 0.25];
    const edgeSigns = [1, -1];
    const edgeEstimates = [];

    for (const sign of edgeSigns) {
      const yEdge = sign * stopAp;
      let edgeHit = null;

      for (const base of slopeBases) {
        const slopes = [-sign * base, sign * base];
        for (const slope of slopes) {
          const rayA = { p: { x: startX, y: yEdge }, d: normalize({ x: -1, y: 0 }) };
          const rayB = { p: { x: startX, y: yEdge }, d: normalize({ x: -1, y: slope }) };

          const trA = traceRayReverse(clone(rayA), frontStack, wavePreset);
          const trB = traceRayReverse(clone(rayB), frontStack, wavePreset);
          if (!trA || !trB) continue;
          if (trA.vignetted || trA.tir || trB.vignetted || trB.tir) continue;
          if (!trA.endRay || !trB.endRay) continue;

          const cross = lineIntersectionFromRays2D(trA.endRay, trB.endRay);
          if (!cross) continue;

          const radius = Math.abs(Number(cross.y));
          if (!Number.isFinite(radius) || radius <= 1e-7 || radius > 1e4) continue;
          if (!Number.isFinite(cross.x) || Math.abs(cross.x) > 1e6) continue;

          edgeHit = { radiusMm: radius, xMm: Number(cross.x) };
          break;
        }
        if (edgeHit) break;
      }

      if (edgeHit) edgeEstimates.push(edgeHit);
    }

    if (!edgeEstimates.length) {
      // Last resort only: this depends on the chosen launch plane and is not
      // the true entrance pupil definition. Keep it as a safety fallback.
      const bundleEP = estimateEntrancePupilFromOnAxisBundle(surfaces, wavePreset);
      if (bundleEP && Number.isFinite(bundleEP.diameterMm) && bundleEP.diameterMm > 1e-6) {
        return bundleEP;
      }
      return {
        diameterMm: 2 * stopAp,
        radiusMm: stopAp,
        xMm: xStop,
        method: "stop_fallback",
      };
    }

    const radiusMm = edgeEstimates.reduce((sum, e) => sum + e.radiusMm, 0) / edgeEstimates.length;
    const xMm = edgeEstimates.reduce((sum, e) => sum + e.xMm, 0) / edgeEstimates.length;
    return {
      diameterMm: 2 * radiusMm,
      radiusMm,
      xMm,
      method: "reverse_stop_image",
    };
  }

  function estimateTStopApprox(efl, surfaces, wavePreset = "d") {
    if (!Number.isFinite(efl) || efl <= 0) return null;

    const ep = estimateEntrancePupil(surfaces, wavePreset);
    const epDiam = Number(ep?.diameterMm);
    if (Number.isFinite(epDiam) && epDiam > 1e-6) {
      const T = efl / epDiam;
      if (Number.isFinite(T) && T > 0) return T;
    }

    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return null;
    const stopAp = Math.max(1e-6, getSurfaceOpticalAp(surfaces[stopIdx]));
    const T = efl / (2 * stopAp);
    return Number.isFinite(T) ? T : null;
  }

  // -------------------- FOV --------------------
  function rad2deg(r) { return (r * 180) / Math.PI; }
  function computeFovDeg(efl, sensorW, sensorH) {
    if (!Number.isFinite(efl) || efl <= 0) return null;
    const diag = Math.hypot(sensorW, sensorH);
    const hfov = 2 * Math.atan(sensorW / (2 * efl));
    const vfov = 2 * Math.atan(sensorH / (2 * efl));
    const dfov = 2 * Math.atan(diag / (2 * efl));
    return { hfov: rad2deg(hfov), vfov: rad2deg(vfov), dfov: rad2deg(dfov) };
  }

  function coversSensorYesNo({ fov, maxField, mode = "diag", marginDeg = 0.5 }) {
    if (!fov || !Number.isFinite(maxField)) return { ok: false, req: null };
    let req = null;
    if (mode === "h") req = fov.hfov * 0.5;
    else if (mode === "v") req = fov.vfov * 0.5;
    else req = fov.dfov * 0.5;
    const ok = maxField + marginDeg >= req;
    return { ok, req };
  }

  // -------------------- autofocus --------------------
  const FOCUS_MODE_SET = new Set(["fixed", "manual", "auto"]);
  const FOCUS_MECHANISM_SET = new Set(["move-lens", "move-ims", "move-focus-group"]);
  const FOCUS_SHIFT_FALLBACK_MM = 0;

  const focusRuntime = {
    lastAutoKey: "",
    lastAutoMetric: null,
    lastAutoShiftMm: 0,
  };

  function normalizeFocusMode(raw) {
    const m = String(raw || "auto").trim().toLowerCase();
    return FOCUS_MODE_SET.has(m) ? m : "auto";
  }

  function normalizeFocusMechanism(raw) {
    const m = String(raw || "move-lens").trim().toLowerCase();
    return FOCUS_MECHANISM_SET.has(m) ? m : "move-lens";
  }

  function getFocusShiftMm() {
    const raw = Number(ui.lensFocus?.value ?? FOCUS_SHIFT_FALLBACK_MM);
    return Number.isFinite(raw) ? raw : FOCUS_SHIFT_FALLBACK_MM;
  }

  function syncFocusStateToLens(shiftOverride = null) {
    if (!lens || typeof lens !== "object") return;
    if (!lens.focus || typeof lens.focus !== "object") lens.focus = {};
    if (!lens.import_options || typeof lens.import_options !== "object") lens.import_options = {};
    lens.focus.mode = normalizeFocusMode(ui.focusMode?.value || lens.focus.mode || "auto");
    lens.focus.mechanism = normalizeFocusMechanism(ui.focusMechanism?.value || lens.focus.mechanism || "move-lens");
    const shiftVal = Number(shiftOverride);
    lens.focus.shiftMm = Number.isFinite(shiftVal) ? shiftVal : getFocusShiftMm();
    lens.focus.autoRefocusOnDistanceChange = !!ui.autoRefocusOnDistanceChange?.checked;
    lens.import_options.autofocus_mode = getPreviewAutofocusMode();
  }

  function setFocusShiftMm(nextShiftMm, { updateStatus = true } = {}) {
    const raw = Number(nextShiftMm);
    if (!Number.isFinite(raw)) {
      setStatusWarning("Invalid focus shift: not a finite number.");
      return getFocusShiftMm();
    }
    if (Math.abs(raw) > MAX_FOCUS_SHIFT_MM) {
      enterSafeMode(`Autofocus stopped: focus shift ${raw.toFixed(2)}mm exceeds ${MAX_FOCUS_SHIFT_MM}mm`);
      return getFocusShiftMm();
    }
    const shift = raw;
    if (ui.lensFocus) ui.lensFocus.value = shift.toFixed(4);
    if (ui.focusShiftSlider) ui.focusShiftSlider.value = String(shift);
    syncFocusStateToLens(shift);
    if (updateStatus) updateFocusShiftStatus();
    return shift;
  }

  function focusPoseFromShift(shiftMm, mechanismRaw) {
    const mechanism = normalizeFocusMechanism(mechanismRaw);
    const shift = Number.isFinite(Number(shiftMm)) ? Number(shiftMm) : 0;

    if (mechanism === "move-ims") {
      return {
        focusMechanism: mechanism,
        focusShiftMm: shift,
        lensShift: 0,
        sensorX: shift,
        mechanismApplied: "move-ims",
      };
    }

    if (mechanism === "move-focus-group") {
      // Placeholder: until focus-group surfaces are modelled, map to whole-lens move.
      return {
        focusMechanism: mechanism,
        focusShiftMm: shift,
        lensShift: shift,
        sensorX: 0,
        mechanismApplied: "move-lens (focus-group placeholder)",
      };
    }

    return {
      focusMechanism: mechanism,
      focusShiftMm: shift,
      lensShift: shift,
      sensorX: 0,
      mechanismApplied: "move-lens",
    };
  }

  function getFocusContext({ objectDistanceMm = null, wavePreset = "d", allowAutoRefocus = false } = {}) {
    const focusMode = normalizeFocusMode(ui.focusMode?.value || "auto");
    const focusMechanism = normalizeFocusMechanism(ui.focusMechanism?.value || "move-lens");
    const autoRefocusOnDistanceChange = !!ui.autoRefocusOnDistanceChange?.checked;
    const targetDist = Number.isFinite(Number(objectDistanceMm)) ? Number(objectDistanceMm) : null;

    let focusShiftMm = getFocusShiftMm();
    let autoRun = null;

    if (focusMode === "auto" && allowAutoRefocus && !isAutofocusing && Number.isFinite(targetDist) && targetDist > 0.1) {
      const autoKey = [
        focusMechanism,
        String(wavePreset || "d"),
        targetDist.toFixed(6),
      ].join("|");
      let shouldRun = false;
      if (!focusRuntime.lastAutoKey) {
        shouldRun = true;
      } else {
        const [lastMech, lastWave, lastDist] = String(focusRuntime.lastAutoKey).split("|");
        const distChanged = lastDist !== targetDist.toFixed(6);
        const nonDistChanged = lastMech !== focusMechanism || lastWave !== String(wavePreset || "d");
        const lastAutoShift = Number(focusRuntime.lastAutoShiftMm);
        const shiftChanged = !Number.isFinite(lastAutoShift) || Math.abs(lastAutoShift - focusShiftMm) > 1e-6;
        shouldRun = nonDistChanged || shiftChanged || (autoRefocusOnDistanceChange && distChanged);
      }
      if (shouldRun) {
        isAutofocusing = true;
        markRuntimeBusy("autofocus:auto-refocus");
        try {
          autoRun = runAutofocusForShift({
            objectDistanceMm: targetDist,
            wavePreset,
            focusMechanism,
            currentShiftMm: focusShiftMm,
            autofocusMode: getPreviewAutofocusMode(),
          });
        } catch (e) {
          autoRun = { ok: false, reason: "exception", error: e?.message || String(e) };
          handleRuntimeError("Autofocus stopped", e);
        } finally {
          isAutofocusing = false;
          clearRuntimeBusy();
        }
        if (autoRun?.stoppedByMaxIterations) {
          setStatusWarning("Autofocus stopped: max iterations reached.");
        }
        if (autoRun?.ok && isSafeFocusShift(autoRun.focusShiftMm)) {
          focusShiftMm = setFocusShiftMm(autoRun.focusShiftMm, { updateStatus: false });
          focusRuntime.lastAutoKey = autoKey;
          focusRuntime.lastAutoMetric = Number.isFinite(autoRun.bestMetricRmsMm) ? autoRun.bestMetricRmsMm : null;
          focusRuntime.lastAutoShiftMm = focusShiftMm;
        } else if (autoRun?.ok) {
          enterSafeMode(`Autofocus stopped: invalid focus shift ${Number(autoRun.focusShiftMm).toFixed(2)}mm`);
          autoRun.ok = false;
          autoRun.reason = "unsafe_focus_shift";
        } else if (autoRun?.reason) {
          setStatusWarning(`Autofocus stopped: ${String(autoRun.reason).replaceAll("_", " ")}.`);
        }
      }
    }

    const pose = focusPoseFromShift(focusShiftMm, focusMechanism);
    return {
      focusMode,
      focusMechanism,
      autoRefocusOnDistanceChange,
      focusShiftMm: pose.focusShiftMm,
      lensShift: pose.lensShift,
      sensorX: pose.sensorX,
      mechanismApplied: pose.mechanismApplied,
      autoRun,
    };
  }

  function updateFocusShiftStatus(extra = "") {
    if (!ui.focusShiftActive) return;
    const mode = normalizeFocusMode(ui.focusMode?.value || "auto");
    const mechanism = normalizeFocusMechanism(ui.focusMechanism?.value || "move-lens");
    const shift = getFocusShiftMm();
    const suffix = extra ? ` • ${extra}` : "";
    ui.focusShiftActive.textContent = `${shift.toFixed(4)} mm • mode ${mode} • mechanism ${mechanism}${suffix}`;
  }

  function syncFocusControlsUI() {
    const mode = normalizeFocusMode(ui.focusMode?.value || "auto");
    const disableShift = mode === "auto";
    if (ui.lensFocus) ui.lensFocus.disabled = disableShift;
    if (ui.focusShiftSlider) ui.focusShiftSlider.disabled = disableShift;
    if (ui.autoRefocusOnDistanceChange) ui.autoRefocusOnDistanceChange.disabled = mode !== "auto";
    syncFocusStateToLens();
    updateFocusShiftStatus();
  }

  function runAutofocusForShift({
    objectDistanceMm,
    wavePreset,
    focusMechanism,
    currentShiftMm,
    autofocusMode,
    sensorHv: sensorHvOverride = null,
  }) {
    const dist = Number(objectDistanceMm);
    if (!Number.isFinite(dist) || dist <= 0.1) {
      return { ok: false, reason: "invalid_object_distance" };
    }

    const { h: sensorH } = getSensorWH();
    const sensorHv = Number.isFinite(Number(sensorHvOverride))
      ? Math.max(1e-6, Number(sensorHvOverride))
      : Math.max(1e-6, sensorH * OV_DEFAULT * 0.5);
    const mech = normalizeFocusMechanism(focusMechanism);
    const startShift = Number.isFinite(Number(currentShiftMm)) ? Number(currentShiftMm) : 0;

    if (mech === "move-ims") {
      const best = autoFocusPreviewSensorForObjectDistance({
        surfaces: lens.surfaces,
        wavePreset,
        lensShift: 0,
        sensorX: startShift,
        objDist: dist,
        sensorHv,
        autofocusMode,
      });
      const ok = isSafeFocusShift(best?.sensorX);
      return {
        ok,
        focusShiftMm: ok ? Number(best.sensorX) : startShift,
        bestMetricRmsMm: Number.isFinite(best?.rmsMm) ? Number(best.rmsMm) : null,
        raysUsed: Number.isFinite(best?.raysUsed) ? Number(best.raysUsed) : 0,
        method: "move-ims",
        stoppedByMaxIterations: best?.stoppedByMaxIterations === true,
        reason: ok ? null : "invalid_focus_shift",
      };
    }

    const best = autoFocusLensShiftForObjectDistance({
      surfaces: lens.surfaces,
      wavePreset,
      lensShift: startShift,
      sensorX: 0,
      objDist: dist,
      sensorHv,
      autofocusMode,
    });
    const ok = isSafeFocusShift(best?.lensShift);
    return {
      ok,
      focusShiftMm: ok ? Number(best.lensShift) : startShift,
      bestMetricRmsMm: Number.isFinite(best?.rmsMm) ? Number(best.rmsMm) : null,
      raysUsed: Number.isFinite(best?.raysUsed) ? Number(best.raysUsed) : 0,
      method: mech === "move-focus-group" ? "move-focus-group (placeholder→lens)" : "move-lens",
      stoppedByMaxIterations: best?.stoppedByMaxIterations === true,
      reason: ok ? null : "invalid_focus_shift",
    };
  }

  function getFocusChartDistanceMm() {
    const d = Number(ui.prevObjDist?.value || 2000);
    if (!Number.isFinite(d) || d <= 0.1) return null;
    return d;
  }

  function thinLensImageDistanceMm(focalLengthMm, objectDistanceMm) {
    const f = Number(focalLengthMm);
    const s = Number(objectDistanceMm);
    if (!Number.isFinite(f) || f <= 0) return null;
    if (!Number.isFinite(s) || s <= f + 1e-9) return null;
    const inv = (1 / f) - (1 / s);
    if (!(inv > 0)) return null;
    const img = 1 / inv;
    return Number.isFinite(img) ? img : null;
  }

  function classifyFiniteDistanceFocusIssue({
    rows = [],
    predictedShiftMm = null,
    actualShiftMm = null,
    shiftErrorMm = null,
    scaleLeakMm = null,
  }) {
    if (!Array.isArray(rows) || !rows.length) return "no_data";
    if (rows.some((r) => !Number.isFinite(r.actualSensorXMm) || Number(r.hitRate || 0) < 0.30)) {
      return "wrong_ray_origin_generation_or_aperture_clipping";
    }
    if (Number.isFinite(scaleLeakMm) && Math.abs(scaleLeakMm) > 0.20) {
      return "preview_scaling_leaks_into_focus_optimization";
    }
    if (Number.isFinite(shiftErrorMm) && Math.abs(shiftErrorMm) > 1.50) {
      return "wrong_image_plane_movement_or_unit_mismatch";
    }
    if (rows.some((r) => Number.isFinite(r.rmsMm) && r.rmsMm > 1.00)) {
      return "focus_metric_or_aberration_dominates";
    }
    if (Number.isFinite(predictedShiftMm) && Number.isFinite(actualShiftMm)) {
      return "finite_distance_focus_shift_physically_consistent";
    }
    return "inconclusive";
  }

  function runFiniteDistanceFocusDiagnostics({
    surfaces,
    wavePreset,
    lensShift,
    sensorX,
    focusMechanism = "move-lens",
    autofocusMode = PREVIEW_AUTOFOCUS_DEFAULT_MODE,
    sensorHv,
    distancesMm = [2000, 20000],
    targetDistanceMm = null,
    printToConsole = true,
  }) {
    if (!Array.isArray(surfaces) || !surfaces.length) return null;
    const efl = estimateEflBflParaxial(surfaces, wavePreset).efl;
    if (!Number.isFinite(efl) || efl <= 0) return null;

    const uniqueDistances = Array.from(new Set((distancesMm || [])
      .map((d) => Number(d))
      .filter((d) => Number.isFinite(d) && d > Math.max(1, efl + 1e-6))));
    if (!uniqueDistances.length) return null;

    const mechanism = normalizeFocusMechanism(focusMechanism);
    const startSensorX = mechanism === "move-ims" ? (Number(sensorX) || 0) : 0;
    const startLensShift = Number(lensShift) || 0;
    const startShiftMm = mechanism === "move-ims" ? startSensorX : startLensShift;
    const sensorHvMm = Number.isFinite(Number(sensorHv)) ? Number(sensorHv) : 1;

    const rows = [];
    for (const objectDistanceMm of uniqueDistances) {
      const af = runAutofocusForShift({
        objectDistanceMm,
        wavePreset,
        focusMechanism: mechanism,
        currentShiftMm: startShiftMm,
        autofocusMode,
        sensorHv: sensorHvMm,
      });
      const pose = focusPoseFromShift(af?.focusShiftMm, mechanism);
      const ev = evaluatePreviewFocusAtSensorX({
        surfaces,
        wavePreset,
        lensShift: pose.lensShift,
        sensorX: pose.sensorX,
        objDist: objectDistanceMm,
        sensorHv: sensorHvMm,
        autofocusMode,
      });
      computeVertices(surfaces, pose.lensShift, pose.sensorX);
      const stopIdx = findStopSurfaceIndex(surfaces);
      const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
      const sensorPlaneX = Number.isFinite(Number(ev?.sensorPlaneX))
        ? Number(ev.sensorPlaneX)
        : getSensorPlaneX(surfaces, pose.sensorX);
      const predictedImageDistanceMm = thinLensImageDistanceMm(efl, objectDistanceMm);
      rows.push({
        focalLengthMm: efl,
        objectDistanceMm,
        predictedImageDistanceMm,
        actualSensorXMm: sensorPlaneX,
        actualLensShiftMm: Number(pose.lensShift),
        actualFocusShiftMm: Number.isFinite(Number(af?.focusShiftMm)) ? Number(af.focusShiftMm) : null,
        deltaFromStartMm: Number.isFinite(Number(af?.focusShiftMm)) ? (Number(af.focusShiftMm) - startShiftMm) : null,
        rmsMm: Number.isFinite(Number(ev?.rmsMm)) ? Number(ev.rmsMm) : null,
        hitRate: Number.isFinite(Number(ev?.hitRate)) ? Number(ev.hitRate) : null,
        raysUsed: Number.isFinite(Number(af?.raysUsed)) ? Number(af.raysUsed) : 0,
        xObjPlaneMm: Number(surfaces?.[0]?.vx || 0) - objectDistanceMm,
        startRayXMm: sensorPlaneX + 0.05,
        stopXMm: Number(stopSurf?.vx || 0),
      });
    }

    const compareField = mechanism === "move-ims" ? "actualSensorXMm" : "actualFocusShiftMm";
    for (const row of rows) {
      const cmp = Number(row?.[compareField]);
      row.actualComparisonMm = Number.isFinite(cmp) ? cmp : null;
      row.comparisonMetric = compareField;
    }

    const ref = rows
      .filter((r) => Number.isFinite(r.predictedImageDistanceMm) && Number.isFinite(r.actualComparisonMm))
      .sort((a, b) => b.objectDistanceMm - a.objectDistanceMm)[0] || null;

    let principalPlaneEstimateMm = null;
    if (mechanism === "move-ims" && ref) {
      principalPlaneEstimateMm = ref.actualSensorXMm - ref.predictedImageDistanceMm;
    }

    for (const row of rows) {
      row.predictedSensorXMm = null;
      row.predictedFocusShiftMm = null;
      row.predictedVsActualMm = null;

      if (mechanism === "move-ims") {
        if (Number.isFinite(principalPlaneEstimateMm) && Number.isFinite(row.predictedImageDistanceMm)) {
          row.predictedSensorXMm = principalPlaneEstimateMm + row.predictedImageDistanceMm;
          row.predictedVsActualMm = row.actualSensorXMm - row.predictedSensorXMm;
        }
        continue;
      }

      if (
        ref &&
        Number.isFinite(ref.predictedImageDistanceMm) &&
        Number.isFinite(ref.actualComparisonMm) &&
        Number.isFinite(row.predictedImageDistanceMm) &&
        Number.isFinite(row.actualComparisonMm)
      ) {
        row.predictedFocusShiftMm =
          ref.actualComparisonMm + (row.predictedImageDistanceMm - ref.predictedImageDistanceMm);
        row.predictedVsActualMm = row.actualComparisonMm - row.predictedFocusShiftMm;
      }
    }

    const row2000 = rows.find((r) => Math.abs(r.objectDistanceMm - 2000) < 1e-6) || null;
    const row20000 = rows.find((r) => Math.abs(r.objectDistanceMm - 20000) < 1e-6) || null;
    const predictedShiftMm = (row2000 && row20000 &&
      Number.isFinite(row2000.predictedImageDistanceMm) && Number.isFinite(row20000.predictedImageDistanceMm))
      ? (row2000.predictedImageDistanceMm - row20000.predictedImageDistanceMm)
      : null;
    const actualShiftMm = (row2000 && row20000 &&
      Number.isFinite(row2000.actualComparisonMm) && Number.isFinite(row20000.actualComparisonMm))
      ? (row2000.actualComparisonMm - row20000.actualComparisonMm)
      : null;
    const shiftErrorMm = (Number.isFinite(actualShiftMm) && Number.isFinite(predictedShiftMm))
      ? (actualShiftMm - predictedShiftMm)
      : null;

    const checkDistanceMm = Number.isFinite(Number(targetDistanceMm))
      ? Number(targetDistanceMm)
      : (row2000 ? 2000 : uniqueDistances[0]);
    const baseAtCheck = runAutofocusForShift({
      objectDistanceMm: checkDistanceMm,
      wavePreset,
      focusMechanism: mechanism,
      currentShiftMm: startShiftMm,
      autofocusMode,
      sensorHv: sensorHvMm,
    });
    const scaledAtCheck = runAutofocusForShift({
      objectDistanceMm: checkDistanceMm,
      wavePreset,
      focusMechanism: mechanism,
      currentShiftMm: startShiftMm,
      autofocusMode,
      sensorHv: sensorHvMm * 1.7,
    });
    const baseShift = Number(baseAtCheck?.focusShiftMm);
    const scaledShift = Number(scaledAtCheck?.focusShiftMm);
    const scaleLeakMm = (
      Number.isFinite(baseShift) &&
      Number.isFinite(scaledShift)
    ) ? (scaledShift - baseShift) : null;

    computeVertices(surfaces, startLensShift, startSensorX);

    const suspectedCause = classifyFiniteDistanceFocusIssue({
      rows,
      predictedShiftMm,
      actualShiftMm,
      shiftErrorMm,
      scaleLeakMm,
    });

    const report = {
      autofocusMode,
      focusMechanism: mechanism,
      comparisonMetric: compareField,
      focalLengthMm: efl,
      targetDistanceMm: Number.isFinite(Number(targetDistanceMm)) ? Number(targetDistanceMm) : null,
      rows,
      principalPlaneEstimateMm,
      predictedShift2000to20000Mm: predictedShiftMm,
      actualShift2000to20000Mm: actualShiftMm,
      shiftError2000to20000Mm: shiftErrorMm,
      scaleLeakMm,
      suspectedCause,
    };

    if (printToConsole) {
      console.groupCollapsed("[focus-verify] finite-distance autofocus");
      console.log("Focal length (mm):", Number(efl.toFixed(6)));
      console.log("Focus mechanism:", mechanism);
      console.log("Autofocus mode:", autofocusMode);
      console.table(rows.map((r) => ({
        focalLengthMm: Number(r.focalLengthMm.toFixed(6)),
        objectDistanceMm: r.objectDistanceMm,
        predictedThinLensImageDistanceMm: Number.isFinite(r.predictedImageDistanceMm) ? Number(r.predictedImageDistanceMm.toFixed(6)) : null,
        comparisonMetric: r.comparisonMetric,
        actualComparisonMm: Number.isFinite(r.actualComparisonMm) ? Number(r.actualComparisonMm.toFixed(6)) : null,
        actualFocusShiftMm: Number.isFinite(r.actualFocusShiftMm) ? Number(r.actualFocusShiftMm.toFixed(6)) : null,
        actualLensShiftMm: Number.isFinite(r.actualLensShiftMm) ? Number(r.actualLensShiftMm.toFixed(6)) : null,
        actualAutofocusSensorXMm: Number.isFinite(r.actualSensorXMm) ? Number(r.actualSensorXMm.toFixed(6)) : null,
        predictedFocusShiftMm: Number.isFinite(r.predictedFocusShiftMm) ? Number(r.predictedFocusShiftMm.toFixed(6)) : null,
        predictedVsActualMm: Number.isFinite(r.predictedVsActualMm) ? Number(r.predictedVsActualMm.toFixed(6)) : null,
        xObjPlaneMm: Number.isFinite(r.xObjPlaneMm) ? Number(r.xObjPlaneMm.toFixed(6)) : null,
        startRayXMm: Number.isFinite(r.startRayXMm) ? Number(r.startRayXMm.toFixed(6)) : null,
        stopXMm: Number.isFinite(r.stopXMm) ? Number(r.stopXMm.toFixed(6)) : null,
        rmsMm: Number.isFinite(r.rmsMm) ? Number(r.rmsMm.toFixed(6)) : null,
        hitRate: Number.isFinite(r.hitRate) ? Number(r.hitRate.toFixed(4)) : null,
      })));
      console.log("Predicted shift 2000→20000 (mm):", Number.isFinite(predictedShiftMm) ? Number(predictedShiftMm.toFixed(6)) : null);
      console.log(`Actual shift 2000→20000 (${compareField}) (mm):`, Number.isFinite(actualShiftMm) ? Number(actualShiftMm.toFixed(6)) : null);
      console.log("Shift error (actual - predicted) (mm):", Number.isFinite(shiftErrorMm) ? Number(shiftErrorMm.toFixed(6)) : null);
      console.log("Scale leak check ΔfocusShift (mm):", Number.isFinite(scaleLeakMm) ? Number(scaleLeakMm.toFixed(6)) : null);
      console.log("Suspected cause:", suspectedCause);
      console.groupEnd();
    }

    return report;
  }

  function autoFocusLensShiftForObjectDistance({
    surfaces,
    wavePreset,
    lensShift,
    sensorX,
    objDist,
    sensorHv,
    autofocusMode = PREVIEW_AUTOFOCUS_DEFAULT_MODE,
  }) {
    const efl = estimateEflBflParaxial(surfaces, wavePreset).efl;
    const range = Math.max(2, Math.min(32, Number.isFinite(efl) && efl > 0 ? efl * 0.22 : 16));
    const coarseStep = Math.max(0.25, range / 12);
    const fineStep = Math.max(0.04, coarseStep / 6);

    let iterations = 0;
    let stoppedByMaxIterations = false;
    const evaluateAtShift = (shiftMm) => {
      if (iterations >= MAX_AUTOFOCUS_ITERATIONS) {
        stoppedByMaxIterations = true;
        return null;
      }
      iterations++;
      return evaluatePreviewFocusAtSensorX({
        surfaces,
        wavePreset,
        lensShift: shiftMm,
        sensorX,
        objDist,
        sensorHv,
        autofocusMode,
      });
    };

    let bestShift = Number.isFinite(Number(lensShift)) ? Number(lensShift) : 0;
    let best = evaluateAtShift(bestShift);
    if (!best || !Number.isFinite(Number(best.score))) {
      return {
        lensShift: bestShift,
        deltaMm: 0,
        rmsMm: null,
        hitRate: null,
        raysUsed: 0,
        method: "preview_af_lens_shift",
        iterations,
        stoppedByMaxIterations,
      };
    }

    const searchCenter = bestShift;
    for (let sh = searchCenter - range; sh <= searchCenter + range + 1e-9; sh += coarseStep) {
      const ev = evaluateAtShift(sh);
      if (!ev) break;
      if (ev.score < best.score) {
        best = ev;
        bestShift = sh;
      }
    }

    for (let sh = bestShift - coarseStep; sh <= bestShift + coarseStep + 1e-9; sh += fineStep) {
      const ev = evaluateAtShift(sh);
      if (!ev) break;
      if (ev.score < best.score) {
        best = ev;
        bestShift = sh;
      }
    }

    return {
      lensShift: bestShift,
      deltaMm: bestShift - lensShift,
      rmsMm: best.rmsMm,
      hitRate: best.hitRate,
      raysUsed: best.raysUsed,
      method: "preview_af_lens_shift",
      iterations,
      stoppedByMaxIterations,
    };
  }

  function autoFocus() {
    if (isAutofocusing) {
      setStatusWarning("Autofocus already running; skipped nested refocus.");
      return;
    }
    isAutofocusing = true;
    markRuntimeBusy("autofocus:manual");
    try {
    const focusMode = normalizeFocusMode(ui.focusMode?.value || "auto");
    const focusMechanism = normalizeFocusMechanism(ui.focusMechanism?.value || "move-lens");
    const wavePreset = ui.wavePreset?.value || "d";
    const targetDistance = getFocusChartDistanceMm();
    const autofocusMode = getPreviewAutofocusMode();

    if (!(targetDistance > 0.1)) {
      setStatusWarning("Auto focus failed: set a valid focus chart distance first.");
      return;
    }

    const currentShiftMm = getFocusShiftMm();
    const af = runAutofocusForShift({
      objectDistanceMm: targetDistance,
      wavePreset,
      focusMechanism,
      currentShiftMm,
      autofocusMode,
    });

    if (!af?.ok) {
      setStatusWarning(`Refocus failed: ${String(af?.reason || "too few valid chart-center rays").replaceAll("_", " ")}.`);
      scheduleRenderAll({ immediate: true });
      return;
    }
    if (af?.stoppedByMaxIterations) {
      setStatusWarning("Autofocus stopped: max iterations reached.");
    }
    if (!isSafeFocusShift(af.focusShiftMm)) {
      enterSafeMode(`Autofocus stopped: invalid focus shift ${Number(af.focusShiftMm).toFixed(2)}mm`);
      return;
    }

    const nextShiftMm = setFocusShiftMm(af.focusShiftMm, { updateStatus: false });
    const pose = focusPoseFromShift(nextShiftMm, focusMechanism);
    const focusedForLog = clone(lens.surfaces);
    computeVertices(focusedForLog, pose.lensShift, pose.sensorX);
    const sensorPlaneX = getSensorPlaneX(focusedForLog, pose.sensorX);

    console.log("[focus:refocus-now]", {
      objectDistanceMm: targetDistance,
      focusMode,
      mode: autofocusMode,
      focusMechanism,
      mechanismApplied: pose.mechanismApplied,
      previousFocusShiftMm: currentShiftMm,
      focusShiftMm: nextShiftMm,
      sensorPlaneXMm: Number.isFinite(sensorPlaneX) ? sensorPlaneX : null,
      autofocusBestMetricRmsMm: Number.isFinite(af?.bestMetricRmsMm) ? af.bestMetricRmsMm : null,
      raysUsed: Number(af?.raysUsed || 0),
    });
    const rmsTxt = Number.isFinite(af?.bestMetricRmsMm) ? af.bestMetricRmsMm.toFixed(4) : "—";
    updateFocusShiftStatus(`auto metric ${rmsTxt}mm`);
    if (ui.footerWarn) ui.footerWarn.textContent =
      `Refocus: shift=${nextShiftMm.toFixed(3)}mm • RMS=${rmsTxt}mm • d=${targetDistance.toFixed(1)}mm • ${pose.mechanismApplied}`;

    const diagReport = runFiniteDistanceFocusDiagnostics({
      surfaces: clone(lens.surfaces),
      wavePreset,
      lensShift: pose.lensShift,
      sensorX: pose.sensorX,
      focusMechanism,
      autofocusMode,
      distancesMm: [2000, 20000],
      targetDistanceMm: targetDistance,
      printToConsole: true,
    });
    if (diagReport && ui.footerWarn && Number.isFinite(diagReport.actualShift2000to20000Mm) && Number.isFinite(diagReport.predictedShift2000to20000Mm)) {
      const actual = Number(diagReport.actualShift2000to20000Mm).toFixed(3);
      const thin = Number(diagReport.predictedShift2000to20000Mm).toFixed(3);
      ui.footerWarn.textContent += ` • Δx(2m→20m)=${actual}mm vs thin=${thin}mm`;
    }

    renderAll();
    scheduleRenderPreview();
    } catch (e) {
      handleRuntimeError("Autofocus stopped", e);
    } finally {
      isAutofocusing = false;
      clearRuntimeBusy();
    }
  }

  // -------------------- drawing --------------------
  let view = { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 };

  function drawBackgroundCSS(w, h) {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;

    const step = 80;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();
  }

  function resizeCanvasToCSS() {
    if (!canvas || !ctx) return;
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.floor(r.width * dpr));
    canvas.height = Math.max(2, Math.floor(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resizePreviewCanvasToCSS() {
    if (!previewCanvasEl || !pctx) return;
    const r = previewCanvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    previewCanvasEl.width  = Math.max(2, Math.floor(r.width  * dpr));
    previewCanvasEl.height = Math.max(2, Math.floor(r.height * dpr));

    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    previewCanvasEl._cssW = Math.max(2, r.width);
    previewCanvasEl._cssH = Math.max(2, r.height);
  }

  function worldToScreen(p, world) {
    const { cx, cy, s } = world;
    return { x: cx + p.x * s, y: cy - p.y * s };
  }

  function makeWorldTransform() {
    if (!canvas) return { cx: 0, cy: 0, s: 1 };
    const r = canvas.getBoundingClientRect();
    const cx = r.width / 2 + view.panX;
    const cy = r.height / 2 + view.panY;
    const base = Number(ui.renderScale?.value || 1.25) * 3.2;
    const s = base * view.zoom;
    return { cx, cy, s };
  }

  function drawAxes(world) {
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.beginPath();
    const p1 = worldToScreen({ x: -240, y: 0 }, world);
    const p2 = worldToScreen({ x: 800, y: 0 }, world);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  function buildSurfacePolyline(s, ap, steps = 90) {
    const apSafe = Math.max(AP_MIN, Number(ap || 0));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const y = -apSafe + (i / steps) * (2 * apSafe);
      const x = surfaceXatY(s, y);
      if (x == null) continue;
      pts.push({ x, y });
    }
    return pts;
  }

  function drawSurfaceWithAperture(world, s, ap, style = {}) {
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = style.lineWidth ?? 1.25;
    ctx.strokeStyle = style.strokeStyle ?? "rgba(255,255,255,.22)";
    ctx.shadowColor = style.shadowColor ?? "transparent";
    ctx.shadowBlur = style.shadowBlur ?? 0;
    if (Array.isArray(style.dash)) ctx.setLineDash(style.dash);

    const vx = Number(s?.vx || 0);
    const apDraw = Math.max(AP_MIN, Number(ap || AP_MIN));

    if (Math.abs(Number(s?.R || 0)) < 1e-9) {
      const a = worldToScreen({ x: vx, y: -apDraw }, world);
      const b = worldToScreen({ x: vx, y: apDraw }, world);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const curve = buildSurfacePolyline(s, apDraw, style.steps ?? 90);
    if (curve.length >= 2) {
      ctx.beginPath();
      const p0 = worldToScreen(curve[0], world);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < curve.length; i++) {
        const p = worldToScreen(curve[i], world);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function resolvePairDrawMode(sA, sB) {
    const a = getSurfaceDrawMode(sA);
    const b = getSurfaceDrawMode(sB);
    if (a !== "zemax_like") return a;
    if (b !== "zemax_like") return b;
    // No explicit mechanical aperture data: default to simple optical interval drawing.
    if (!hasExplicitMechanicalAperture(sA) && !hasExplicitMechanicalAperture(sB)) return "optical";
    return "zemax_like";
  }

  function resolvePairShoulderMode(sA, sB, drawMode) {
    const a = getSurfaceShoulderMode(sA);
    const b = getSurfaceShoulderMode(sB);
    if (a !== "none") return a;
    if (b !== "none") return b;
    if (drawMode !== "zemax_like") return "none";

    const rA = Math.abs(Number(sA?.R || 0));
    const rB = Math.abs(Number(sB?.R || 0));
    if (rA < 1e-9 || rB < 1e-9) return "flat";

    const apA = getSurfaceMechanicalAp(sA);
    const apB = getSurfaceMechanicalAp(sB);
    if (Math.abs(apA - apB) >= DEFAULT_SHOULDER_MIN_DIFF) return "step";
    return "flat";
  }

  function resolvePairShoulderDepth(sA, sB, shoulderMode) {
    const explicit = Math.max(getSurfaceShoulderDepth(sA, 0), getSurfaceShoulderDepth(sB, 0));
    const edgeA = Number(sA?.edge_thickness);
    const edgeB = Number(sB?.edge_thickness);
    const explicitEdge =
      Math.max(
        Number.isFinite(edgeA) ? Math.max(0, edgeA) : 0,
        Number.isFinite(edgeB) ? Math.max(0, edgeB) : 0
      );
    const edgeModeA = getSurfaceEdgeThicknessMode(sA);
    const edgeModeB = getSurfaceEdgeThicknessMode(sB);
    if (edgeModeA === "explicit" || edgeModeB === "explicit") {
      if (explicitEdge > 0) return explicitEdge;
      if (explicit > 0) return explicit;
    }
    if (explicit > 0) return explicit;

    const gap = Math.abs(Number(sB?.vx || 0) - Number(sA?.vx || 0));
    if (shoulderMode === "bridge") return Math.max(0.1, gap * 0.35);
    if (shoulderMode === "step") return Math.max(0.1, gap * 0.5);
    if (shoulderMode === "flat") return Math.max(0.05, gap * 0.15);
    return 0;
  }

  function buildShoulderConnector(fromPt, toPt, mode, shoulderDepth, side, bevelFrom = 0, bevelTo = 0) {
    if (!fromPt || !toPt) return null;
    const pts = [{ x: fromPt.x, y: fromPt.y }];
    const dir = toPt.x >= fromPt.x ? 1 : -1;
    const spanX = Math.abs(toPt.x - fromPt.x);
    const spanY = Math.abs(toPt.y - fromPt.y);

    const bFrom = Math.max(0, Number(bevelFrom || 0));
    const bTo = Math.max(0, Number(bevelTo || 0));
    const bf = Math.min(bFrom, Math.max(0, spanX * 0.45));
    const bt = Math.min(bTo, Math.max(0, spanX * 0.45));
    if (bf > 1e-6) pts.push({ x: fromPt.x + dir * bf, y: fromPt.y - side * Math.min(bf, spanY * 0.5) });

    if (mode === "bridge") {
      const d = Math.max(0, Number(shoulderDepth || 0));
      const xBridge = fromPt.x + dir * d;
      pts.push({ x: xBridge, y: fromPt.y });
      pts.push({ x: xBridge, y: toPt.y });
      pts.push({ x: toPt.x, y: toPt.y });
    } else if (mode === "step") {
      const xStep = fromPt.x + dir * Math.max(Number(shoulderDepth || 0), spanX * 0.5);
      const xClamped = dir > 0 ? Math.min(xStep, toPt.x) : Math.max(xStep, toPt.x);
      pts.push({ x: xClamped, y: fromPt.y });
      pts.push({ x: xClamped, y: toPt.y });
      pts.push({ x: toPt.x, y: toPt.y });
    } else if (mode === "flat") {
      pts.push({ x: fromPt.x, y: toPt.y });
      pts.push({ x: toPt.x, y: toPt.y });
    } else {
      pts.push({ x: toPt.x, y: toPt.y });
    }

    if (bt > 1e-6) {
      const xStart = toPt.x - dir * bt;
      pts.push({ x: xStart, y: toPt.y - side * Math.min(bt, spanY * 0.5) });
    }
    pts.push({ x: toPt.x, y: toPt.y });
    return pts;
  }

  function buildMechanicalSegmentShape(sA, sB) {
    const drawMode = resolvePairDrawMode(sA, sB);
    const opticalMode = drawMode === "optical";
    const apAraw = opticalMode ? getSurfaceOpticalAp(sA) : getSurfaceMechanicalAp(sA);
    const apBraw = opticalMode ? getSurfaceOpticalAp(sB) : getSurfaceMechanicalAp(sB);
    // In optical mode, draw the actual glass interval clear aperture only.
    const apShared = opticalMode ? Math.max(AP_MIN, Math.min(apAraw, apBraw)) : null;
    const apA = opticalMode ? apShared : apAraw;
    const apB = opticalMode ? apShared : apBraw;

    const front = buildSurfacePolyline(sA, apA, 90);
    const back = buildSurfacePolyline(sB, apB, 90);
    if (front.length < 2 || back.length < 2) return null;

    const shoulderMode = drawMode === "optical" ? "none" : resolvePairShoulderMode(sA, sB, drawMode);
    const shoulderDepth = resolvePairShoulderDepth(sA, sB, shoulderMode);

    const topFrom = front[front.length - 1];
    const topTo = back[back.length - 1];
    const bottomFrom = back[0];
    const bottomTo = front[0];

    const topConn = buildShoulderConnector(
      topFrom,
      topTo,
      shoulderMode,
      shoulderDepth,
      +1,
      getSurfaceBevel(sA),
      getSurfaceBevel(sB)
    );
    const bottomConn = buildShoulderConnector(
      bottomFrom,
      bottomTo,
      shoulderMode,
      shoulderDepth,
      -1,
      getSurfaceBevel(sB),
      getSurfaceBevel(sA)
    );
    if (!topConn || !bottomConn) return null;

    const poly = front
      .concat(topConn.slice(1))
      .concat(back.slice().reverse())
      .concat(bottomConn.slice(1));

    return {
      drawMode,
      shoulderMode,
      shoulderDepth,
      front,
      back,
      topConn,
      bottomConn,
      poly,
      edgePoints: [front[0], front[front.length - 1], back[0], back[back.length - 1]],
    };
  }

  function drawFilledPolygon(world, poly, fillStyle, strokeStyle) {
    if (!ctx || !Array.isArray(poly) || poly.length < 3) return;
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    const p0 = worldToScreen(poly[0], world);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < poly.length; i++) {
      const p = worldToScreen(poly[i], world);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 1.7;
    ctx.strokeStyle = strokeStyle;
    ctx.shadowColor = "rgba(70,140,255,0.25)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  function collectGlassElements(surfaces) {
    const out = [];
    let i = 0;
    while (i < surfaces.length - 1) {
      const sA = surfaces[i];
      const sB = surfaces[i + 1];
      if (
        !isPhysicalSurfaceType(sA?.type) ||
        !isPhysicalSurfaceType(sB?.type) ||
        isAirMediumName(sA?.glass) ||
        isStopLikeSurface(sA) ||
        isStopLikeSurface(sB)
      ) {
        i++;
        continue;
      }

      const start = i;
      const segments = [];
      while (i < surfaces.length - 1) {
        const a = surfaces[i];
        const b = surfaces[i + 1];
        if (
          !isPhysicalSurfaceType(a?.type) ||
          !isPhysicalSurfaceType(b?.type) ||
          isAirMediumName(a?.glass) ||
          isStopLikeSurface(a) ||
          isStopLikeSurface(b)
        ) break;
        segments.push(i);
        i++;
      }
      if (!segments.length) continue;
      out.push({
        start,
        end: segments[segments.length - 1] + 1,
        segments,
      });
    }
    return out;
  }

  function drawMechanicalElements(world, surfaces, debugStore = null) {
    if (!ctx) return [];

    const ELEMENT_FILL = [
      "rgba(120,180,255,0.10)",
      "rgba(120,220,190,0.10)",
      "rgba(230,180,120,0.10)",
      "rgba(220,140,170,0.10)",
      "rgba(180,160,255,0.10)",
    ];
    const ELEMENT_STROKE = [
      "rgba(220,235,255,0.55)",
      "rgba(190,240,225,0.55)",
      "rgba(240,220,190,0.55)",
      "rgba(245,200,220,0.55)",
      "rgba(220,210,255,0.55)",
    ];

    let minNonOverlap = Infinity;
    const elements = collectGlassElements(surfaces);

    elements.forEach((el, elIdx) => {
      const fill = ELEMENT_FILL[elIdx % ELEMENT_FILL.length];
      const stroke = ELEMENT_STROKE[elIdx % ELEMENT_STROKE.length];

      if (debugStore) {
        debugStore.elements.push({
          index: elIdx,
          start: el.start,
          end: el.end,
          color: stroke,
        });
      }

      for (const segIdx of el.segments) {
        const sA = surfaces[segIdx];
        const sB = surfaces[segIdx + 1];
        const shape = buildMechanicalSegmentShape(sA, sB);
        if (!shape) continue;

        if (Math.abs(Number(sA?.R || 0)) > 1e-9 && Math.abs(Number(sB?.R || 0)) > 1e-9) {
          const nonOverlap = maxNonOverlappingSemiDiameter(sA, sB, 0.10);
          minNonOverlap = Math.min(minNonOverlap, nonOverlap);
        }

        drawFilledPolygon(world, shape.poly, fill, stroke);

        if (debugStore) {
          debugStore.segments.push({
            segIdx,
            elementIndex: elIdx,
            drawMode: shape.drawMode,
            shoulderMode: shape.shoulderMode,
            shoulderDepth: shape.shoulderDepth,
            edgePoints: shape.edgePoints,
            topConn: shape.topConn,
            bottomConn: shape.bottomConn,
          });
        }
      }

      for (let i = el.start + 1; i < el.end; i++) {
        drawSurfaceWithAperture(world, surfaces[i], getSurfaceMechanicalAp(surfaces[i]), {
          lineWidth: 1,
          strokeStyle: "rgba(220,235,255,0.20)",
        });
      }
    });

    if (Number.isFinite(minNonOverlap) && minNonOverlap < 0.5 && ui.footerWarn) {
      ui.footerWarn.textContent =
        "WARNING: element surfaces overlap / too thin somewhere — increase t or reduce curvature/aperture.";
    }

    return elements;
  }

  function drawSurface(world, s) {
    if (!ctx) return;
    drawSurfaceWithAperture(world, s, getSurfaceOpticalAp(s), {
      lineWidth: 1.25,
      strokeStyle: "rgba(255,255,255,.22)",
    });
  }

  function drawOutlineDebugOverlay(world, surfaces, elements, debugStore) {
    if (!ctx || !debugOutlineOverlayEnabled) return;

    for (const s of surfaces) {
      if (!isPhysicalSurfaceType(s?.type)) continue;
      drawSurfaceWithAperture(world, s, getSurfaceOpticalAp(s), {
        lineWidth: 1,
        strokeStyle: "rgba(100,255,140,0.75)",
        dash: [4, 3],
      });
      drawSurfaceWithAperture(world, s, getSurfaceMechanicalAp(s), {
        lineWidth: 1,
        strokeStyle: "rgba(255,190,90,0.75)",
        dash: [2, 3],
      });
    }

    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255,90,180,0.85)";
    for (const seg of debugStore?.segments || []) {
      const conns = [seg.topConn, seg.bottomConn];
      for (const pts of conns) {
        if (!Array.isArray(pts) || pts.length < 2) continue;
        ctx.beginPath();
        const p0 = worldToScreen(pts[0], world);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
          const p = worldToScreen(pts[i], world);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }

    for (const seg of debugStore?.segments || []) {
      for (const ep of seg.edgePoints || []) {
        const p = worldToScreen(ep, world);
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,230,120,0.95)";
        ctx.arc(p.x, p.y, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.font = "11px var(--mono)";
    const elementDbg = debugStore?.elements || [];
    (elements || []).forEach((el, idx) => {
      const s0 = surfaces[el.start];
      const s1 = surfaces[el.end];
      if (!s0 || !s1) return;
      const xMid = (Number(s0.vx || 0) + Number(s1.vx || 0)) * 0.5;
      const yTop = Math.max(getSurfaceMechanicalAp(s0), getSurfaceMechanicalAp(s1)) + 2.5;
      const p = worldToScreen({ x: xMid, y: yTop }, world);
      ctx.fillStyle = elementDbg[idx]?.color || "rgba(255,255,255,.8)";
      ctx.fillText(`E${idx + 1}`, p.x - 8, p.y);
    });

    ctx.restore();
  }

  function drawLens(world, surfaces) {
    const debugStore = debugOutlineOverlayEnabled ? { elements: [], segments: [] } : null;
    const elements = drawMechanicalElements(world, surfaces, debugStore);
    for (const s of surfaces) drawSurface(world, s);
    if (debugOutlineOverlayEnabled) drawOutlineDebugOverlay(world, surfaces, elements, debugStore);
  }

  function drawRays(world, rayTraces, sensorX) {
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(70,140,255,0.85)";
    ctx.shadowColor = "rgba(70,140,255,0.45)";
    ctx.shadowBlur = 12;

    for (const tr of rayTraces) {
      if (!tr.pts || tr.pts.length < 2) continue;
      ctx.globalAlpha = tr.vignetted ? 0.10 : 1.0;

      ctx.beginPath();
      const p0 = worldToScreen(tr.pts[0], world);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < tr.pts.length; i++) {
        const p = worldToScreen(tr.pts[i], world);
        ctx.lineTo(p.x, p.y);
      }

      const last = tr.endRay;
      if (last && Number.isFinite(sensorX) && last.d && Math.abs(last.d.x) > 1e-9) {
        const t = (sensorX - last.p.x) / last.d.x;
        if (t > 0) {
          const hit = add(last.p, mul(last.d, t));
          const ps = worldToScreen(hit, world);
          ctx.lineTo(ps.x, ps.y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStop(world, surfaces) {
    if (!ctx) return;
    const idx = findStopSurfaceIndex(surfaces);
    if (idx < 0) return;
    const s = surfaces[idx];
    const ap = getSurfaceOpticalAp(s);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#b23b3b";
    const a = worldToScreen({ x: s.vx, y: -ap }, world);
    const b = worldToScreen({ x: s.vx, y: ap }, world);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawSensor(world, sensorX, halfH) {
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.setLineDash([6, 6]);

    const a = worldToScreen({ x: sensorX, y: -halfH }, world);
    const b = worldToScreen({ x: sensorX, y: halfH }, world);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1.25;
    const l1 = worldToScreen({ x: sensorX - 2.5, y: halfH }, world);
    const l2 = worldToScreen({ x: sensorX + 2.5, y: halfH }, world);
    const l3 = worldToScreen({ x: sensorX - 2.5, y: -halfH }, world);
    const l4 = worldToScreen({ x: sensorX + 2.5, y: -halfH }, world);

    ctx.beginPath();
    ctx.moveTo(l1.x, l1.y);
    ctx.lineTo(l2.x, l2.y);
    ctx.moveTo(l3.x, l3.y);
    ctx.lineTo(l4.x, l4.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  // -------- PL mount visuals ----------
  const PL_FFD = 52.0;
  const PL_LENS_LIP = 3.0;

  function drawPLFlange(world, xFlange) {
    if (!ctx || !canvas) return;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.setLineDash([10, 8]);

    const r = canvas.getBoundingClientRect();
    const yWorld = (r.height / (world.s || 1)) * 0.6;

    const a = worldToScreen({ x: xFlange, y: -yWorld }, world);
    const b = worldToScreen({ x: xFlange, y: yWorld }, world);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPLMountCutout(world, xFlange, opts = {}) {
    if (!ctx) return;

    const throatR = Number.isFinite(opts.throatR) ? opts.throatR : 27;
    const outerR = Number.isFinite(opts.outerR) ? opts.outerR : 31;
    const camDepth = Number.isFinite(opts.camDepth) ? opts.camDepth : 14;
    const lensLip = Number.isFinite(opts.lensLip) ? opts.lensLip : 3;
    const flangeT = Number.isFinite(opts.flangeT) ? opts.flangeT : 2.0;

    const P = (x, y) => worldToScreen({ x, y }, world);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.fillStyle = "rgba(255,255,255,.02)";

    // flange face
    {
      const a = P(xFlange, -outerR);
      const b = P(xFlange, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // flange thickness
    {
      const a = P(xFlange, -outerR);
      const b = P(xFlange + flangeT, -outerR);
      const c = P(xFlange + flangeT, outerR);
      const d = P(xFlange, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // throat tube
    {
      const a = P(xFlange - lensLip, -throatR);
      const b = P(xFlange + camDepth, -throatR);
      const c = P(xFlange + camDepth, throatR);
      const d = P(xFlange - lensLip, throatR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }

    // tiny shoulder
    {
      const shoulderX = xFlange + flangeT;
      const a = P(shoulderX, -outerR);
      const b = P(shoulderX + 3.0, -outerR);
      const c = P(shoulderX + 3.0, outerR);
      const d = P(shoulderX, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    ctx.font = `11px ${mono}`;
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const lab = P(xFlange - lensLip + 1.5, outerR + 6);
    ctx.fillText("PL mount • Ø54 throat • flange @ sensor-52mm", lab.x, lab.y);

    ctx.restore();
  }

  function drawRulerFrom(world, originX, xMin, yWorld = null, label = "", yOffsetMm = 0) {
    if (!ctx) return;

    let maxAp = 0;
    if (lens?.surfaces?.length) {
      for (const s of lens.surfaces) maxAp = Math.max(maxAp, Math.abs(Number(s.ap || 0)));
    }

    const yBase = (yWorld != null) ? yWorld : (maxAp + 18);
    const y = yBase + yOffsetMm;

    const P = (x, yy) => worldToScreen({ x, y: yy }, world);

    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    const fontMajor = 13;
    const fontMinor = 12;

    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(255,255,255,.30)";
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = `${fontMinor}px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const a = P(xMin, y);
    const b = P(originX, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    const stepMm  = 10;
    const majorMm = 50;

    const tLenMajor = 14;
    const tLenMid   = 10;

    for (let x = originX; x >= xMin - 1e-6; x -= stepMm) {
      const distMm = originX - x;
      const isMajor = (Math.round(distMm) % majorMm) === 0;
      const tLen = isMajor ? tLenMajor : tLenMid;
      const shouldLabel = true;

      const p = P(x, y);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + tLen);
      ctx.stroke();

      if (shouldLabel) {
        const cm = Math.round(distMm / 10);
        const txt = `${cm}cm`;

        ctx.save();
        ctx.font = `${isMajor ? fontMajor : fontMinor}px ${mono}`;

        const padX = 6, padY = 3;
        const w = ctx.measureText(txt).width + padX * 2;
        const h = (isMajor ? fontMajor : fontMinor) + padY * 2;

        ctx.fillStyle = "rgba(0,0,0,.78)";
        ctx.fillRect(p.x - w / 2, p.y + tLen + 3, w, h);

        ctx.fillStyle = "rgba(255,255,255,.95)";
        ctx.shadowColor = "rgba(0,0,0,.75)";
        ctx.shadowBlur = 6;
        ctx.fillText(txt, p.x, p.y + tLen + 5);
        ctx.restore();
      }
    }

    if (label) {
      const p0 = P(originX, y);
      const txt = `${label} 0`;
      ctx.save();
      ctx.font = `${fontMajor}px ${mono}`;
      const padX = 7, padY = 4;
      const w = ctx.measureText(txt).width + padX * 2;
      const h = fontMajor + padY * 2;

      ctx.fillStyle = "rgba(0,0,0,.78)";
      ctx.fillRect(p0.x - w / 2, p0.y + 14, w, h);

      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.shadowColor = "rgba(0,0,0,.75)";
      ctx.shadowBlur = 6;
      ctx.fillText(txt, p0.x, p0.y + 18);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawRuler(world, x0 = 0, xMin = -200, yWorld = null) {
    drawRulerFrom(world, x0, xMin, yWorld, "", 0);
  }

  function drawTitleOverlay(partsOrText) {
    if (!ctx || !canvas) return;

    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    const r = canvas.getBoundingClientRect();

    const padX = 14;
    const padY = 10;
    const maxW = r.width - padX * 2;

    const fontSize = 13;
    const lineH = 17;
    const maxLines = 3;

    let parts = [];
    if (Array.isArray(partsOrText)) {
      parts = partsOrText.map(s => String(s || "").trim()).filter(Boolean);
    } else {
      parts = String(partsOrText || "")
        .split(" • ")
        .map(s => s.trim())
        .filter(Boolean);
    }

    ctx.save();
    ctx.font = `${fontSize}px ${mono}`;

    const lines = [];
    let cur = "";

    for (const p of parts) {
      const test = cur ? (cur + " • " + p) : p;
      if (ctx.measureText(test).width <= maxW) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = p;
        if (lines.length >= maxLines) break;
      }
    }
    if (lines.length < maxLines && cur) lines.push(cur);

    if (lines.length === maxLines && parts.length) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + " …").width > maxW && last.length > 0) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last + " …";
    }

    const barH = padY * 2 + lines.length * lineH;

    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.fillRect(8, 6, r.width - 16, barH);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], padX, 6 + padY + i * lineH);
    }

    ctx.restore();
  }

  function wavePresetSemanticLabel(presetValue) {
    const v = String(presetValue || "d");
    if (v === "d") return "d-line (587.6nm) — visible default";
    if (v === "g") return "g-line (435.8nm) — blue";
    if (v === "c") return "c-line (656.3nm) — red";
    if (v === "zemax_pwav") {
      const z = Number(lens?.zemax?.primaryWavelengthNm);
      return Number.isFinite(z)
        ? `Zemax PWAV (${z.toFixed(1)}nm) — imported primary wavelength`
        : "Zemax PWAV — unavailable";
    }
    const nm = wavePresetToLambdaNm(v);
    return Number.isFinite(nm) ? `${v} (${nm.toFixed(1)}nm)` : v;
  }

  let verifyPanelExpanded = false;

  function hasZemaxLensMeta() {
    return !!(lens?.zemax && typeof lens.zemax === "object");
  }

  function updateZemaxVerifyChrome() {
    const hasZemax = hasZemaxLensMeta();
    const shouldShowControls = true;
    if (ui.verifyControls) {
      ui.verifyControls.classList.toggle("hidden", !shouldShowControls);
    }
    if (ui.btnToggleVerifyPanel) {
      ui.btnToggleVerifyPanel.textContent = verifyPanelExpanded ? "Hide Zemax Verify" : "Show Zemax Verify";
      ui.btnToggleVerifyPanel.setAttribute("aria-expanded", verifyPanelExpanded ? "true" : "false");
      ui.btnToggleVerifyPanel.setAttribute("aria-pressed", verifyPanelExpanded ? "true" : "false");
      ui.btnToggleVerifyPanel.title = hasZemax
        ? "Toggle Zemax verification details"
        : "No Zemax metadata loaded. Click to open debug panel.";
    }
    if (ui.verifyPanel) {
      ui.verifyPanel.classList.toggle("hidden", !verifyPanelExpanded);
    }
  }

  function updateZemaxVerifyPanel({ sensorX = 0 } = {}) {
    if (!ui.verifyPanel) return;
    const z = lens?.zemax;
    updateZemaxVerifyChrome();

    if (!z) {
      if (ui.verifySummary) ui.verifySummary.textContent = "No Zemax metadata loaded.";
      if (ui.verifyWave) ui.verifyWave.textContent = "Load/import a Zemax lens to populate verify details.";
      if (ui.verifyFields) ui.verifyFields.textContent = "Fields: —";
      if (ui.verifyWeights) ui.verifyWeights.textContent = "Field weights: —";
      if (ui.verifyVig) ui.verifyVig.textContent = "Vignetting factors: —";
      if (ui.verifyPupil) ui.verifyPupil.textContent = "Entrance pupil Ø: —";
      if (ui.verifyZoom) ui.verifyZoom.textContent = "Zemax zoom configs: —";
      if (ui.verifyMatchZemaxWave) ui.verifyMatchZemaxWave.disabled = true;
      if (ui.verifyWaveHelp) {
        ui.verifyWaveHelp.textContent =
          "Unchecked: use current dropdown wavelength (normal visible workflow). Checked: verify exactly at Zemax primary wavelength.";
      }
      return;
    }

    if (ui.verifyMatchZemaxWave) ui.verifyMatchZemaxWave.disabled = false;

    const preferZemax = !!ui.verifyMatchZemaxWave?.checked;
    if (lens?.import_options) lens.import_options.match_zemax_wavelength = preferZemax;

    const lambdaPreviewNm = getActiveAnalysisLambdaNm({ preferZemax: false });
    const lambdaVerifyNm = getActiveAnalysisLambdaNm({ preferZemax: preferZemax });

    const verifyParax = estimateEflBflParaxial(lens.surfaces, lambdaVerifyNm);
    const verifyT = estimateTStopApprox(verifyParax.efl, lens.surfaces, lambdaVerifyNm);
    const verifyEP = estimateEntrancePupil(lens.surfaces, lambdaVerifyNm);

    const fields = Array.isArray(z.fields) ? z.fields : [];
    const fieldTxt = fields.length
      ? fields.map((f) => Number(f?.angleDeg || 0).toFixed(2)).join(", ")
      : "—";
    const weightTxt = fields.length
      ? fields.map((f) => Number(f?.weight ?? 1).toFixed(3)).join(", ")
      : "—";
    const vigTxt = fields.length
      ? fields.map((f) => `f${Number(f?.index || 0)}: vdx=${Number(f?.vdx || 0).toFixed(3)} vdy=${Number(f?.vdy || 0).toFixed(3)} vcx=${Number(f?.vcx || 0).toFixed(3)} vcy=${Number(f?.vcy || 0).toFixed(3)}`).join(" | ")
      : "—";

    const pwavNm = Number(z?.primaryWavelengthNm);
    const selectedPreset = String(ui.wavePreset?.value || "d");

    if (ui.verifySummary) {
      const eflTxt = Number.isFinite(verifyParax?.efl) ? `${verifyParax.efl.toFixed(3)}mm` : "—";
      const bflTxt = Number.isFinite(verifyParax?.bfl) ? `${verifyParax.bfl.toFixed(3)}mm` : "—";
      const tTxt = Number.isFinite(verifyT) ? `T≈${verifyT.toFixed(3)}` : "T≈—";
      ui.verifySummary.textContent = `Verify @ ${lambdaVerifyNm.toFixed(1)}nm • EFL ${eflTxt} • BFL ${bflTxt} • ${tTxt}`;
    }
    if (ui.verifyWave) {
      const pwavTxt = Number.isFinite(pwavNm) ? `${pwavNm.toFixed(1)}nm` : "—";
      const modeTxt = preferZemax ? "match Zemax PWAV" : "use dropdown reference";
      ui.verifyWave.textContent = `Preview λ: ${wavePresetSemanticLabel(selectedPreset)} (${lambdaPreviewNm.toFixed(1)}nm) • Verify mode: ${modeTxt} • Zemax PWAV: ${pwavTxt}`;
    }
    if (ui.verifyWaveHelp) {
      ui.verifyWaveHelp.textContent = preferZemax
        ? "Checked: verify exactly at Zemax primary wavelength. Uncheck to use the current dropdown wavelength."
        : "Unchecked: use current dropdown wavelength (normal visible workflow). Check to verify exactly at Zemax primary wavelength.";
    }
    if (ui.verifyFields) {
      ui.verifyFields.textContent = `Fields (${fields.length}): ${fieldTxt}`;
    }
    if (ui.verifyWeights) {
      ui.verifyWeights.textContent = `Field weights: ${weightTxt}`;
    }
    if (ui.verifyVig) {
      ui.verifyVig.textContent = `Vignetting factors: ${vigTxt}`;
    }
    if (ui.verifyPupil) {
      const epTxt = Number.isFinite(Number(verifyEP?.diameterMm)) ? `${Number(verifyEP.diameterMm).toFixed(4)}mm` : "—";
      const epMethod = String(verifyEP?.method || "n/a");
      ui.verifyPupil.textContent = `Entrance pupil Ø: ${epTxt} • method: ${epMethod} • sensorX=${Number(sensorX || 0).toFixed(4)}mm`;
    }
    if (ui.verifyZoom) {
      const zoomConfigs = Array.isArray(lens?.zoom?.configs) ? lens.zoom.configs : [];
      const activeIdx = Number(lens?.zoom?.activeConfig);
      const activeCfg = zoomConfigs.find((c) => Number(c?.index) === activeIdx) || zoomConfigs[0] || null;
      const activeLabel = activeCfg
        ? formatZoomConfigLabel(activeCfg, zoomConfigs.findIndex((c) => c === activeCfg), zoomConfigs.length)
        : "—";
      const thicList = activeCfg?.overrideSurfaceNumbers?.length
        ? activeCfg.overrideSurfaceNumbers.join(", ")
        : "—";
      const apTxt = Number.isFinite(Number(activeCfg?.aperture))
        ? Number(activeCfg.aperture).toFixed(4)
        : "—";
      const imsSurfTxt = Number.isFinite(Number(z?.imsSurfaceNumber))
        ? Number(z.imsSurfaceNumber)
        : "—";
      ui.verifyZoom.textContent =
        `Zemax zoom configs: ${zoomConfigs.length || 1} • Active: ${activeLabel} • Overrides: THIC ${thicList} • Imported F/#: ${apTxt} • IMS surf: ${imsSurfTxt}`;
    }
  }

  // -------------------- render scheduler (RAF throttle) --------------------
  let _rafAll = 0;
  let _rafPrev = 0;
  let _renderAllTimer = 0;
  let _previewRenderTimer = 0;
  let renderEngineEnabled = true;
  let _previewRenderJobId = 0;
  let _renderAllRunning = false;
  let _renderAllQueued = false;
  let _renderPreviewRunning = false;
  let _renderPreviewQueued = false;
  let _renderAllAfterPreview = false;
  let _forcePreviewRender = false;
  let _lastRayPaneRedraw = null;
  let debugOutlineOverlayEnabled = false;

  function updateRenderEngineButton() {
    if (!ui.btnRenderEngine) return;
    ui.btnRenderEngine.textContent = renderEngineEnabled ? "Preview: ON" : "Preview: OFF";
    ui.btnRenderEngine.classList.toggle("btnPrimary", renderEngineEnabled);
    ui.btnRenderEngine.classList.toggle("btnDanger", !renderEngineEnabled);
    ui.btnRenderEngine.setAttribute("aria-pressed", renderEngineEnabled ? "true" : "false");
    ui.btnRenderEngine.title = renderEngineEnabled ? "Disable preview renderer" : "Enable preview renderer";
    if (ui.btnRenderPreview) ui.btnRenderPreview.disabled = !renderEngineEnabled;
  }

  function updateDebugOverlayButton() {
    if (!ui.btnDebugOverlay) return;
    ui.btnDebugOverlay.textContent = debugOutlineOverlayEnabled ? "Outline Debug: ON" : "Outline Debug: OFF";
    ui.btnDebugOverlay.classList.toggle("btnPrimary", debugOutlineOverlayEnabled);
    ui.btnDebugOverlay.setAttribute("aria-pressed", debugOutlineOverlayEnabled ? "true" : "false");
  }

  function toggleDebugOverlay() {
    debugOutlineOverlayEnabled = !debugOutlineOverlayEnabled;
    updateDebugOverlayButton();
    scheduleRenderAll();
  }

  function setRenderEngineEnabled(enabled) {
    const next = !!enabled;
    if (renderEngineEnabled === next) return;
    renderEngineEnabled = next;

    _previewRenderJobId++;
    _renderPreviewQueued = false;
    if (_previewRenderTimer) {
      clearTimeout(_previewRenderTimer);
      _previewRenderTimer = 0;
    }

    if (_rafPrev) {
      cancelAnimationFrame(_rafPrev);
      _rafPrev = 0;
    }

    if (!renderEngineEnabled) {
      hidePreviewProgress();
      toast("Preview renderer: OFF", 1200);
    } else {
      if (preview.ready) scheduleRenderPreview();
      toast("Preview renderer: ON", 1200);
    }

    updateRenderEngineButton();
  }

  function toggleRenderEngine() {
    setRenderEngineEnabled(!renderEngineEnabled);
  }

  function scheduleRenderAll(opts = {}) {
    const immediate = opts?.immediate === true;
    if (_renderAllTimer) clearTimeout(_renderAllTimer);
    if (_rafAll) {
      cancelAnimationFrame(_rafAll);
      _rafAll = 0;
    }
    _renderAllTimer = setTimeout(() => {
      _renderAllTimer = 0;
      _rafAll = requestAnimationFrame(() => {
        _rafAll = 0;
        renderAll();
      });
    }, immediate ? 0 : HEAVY_RENDER_DEBOUNCE_MS);
  }

  function scheduleRenderPreview(opts = {}) {
    if (!renderEngineEnabled) return;
    if (opts?.force === true) _forcePreviewRender = true;
    if (_renderPreviewRunning) {
      _renderPreviewQueued = true;
      _previewRenderJobId++;
      return;
    }
    if (_previewRenderTimer) clearTimeout(_previewRenderTimer);
    if (_rafPrev) {
      cancelAnimationFrame(_rafPrev);
      _rafPrev = 0;
    }
    _previewRenderTimer = setTimeout(() => {
      _previewRenderTimer = 0;
      _rafPrev = requestAnimationFrame(() => {
        _rafPrev = 0;
        if (preview.ready && renderEngineEnabled) renderPreview();
      });
    }, opts?.immediate === true ? 0 : HEAVY_RENDER_DEBOUNCE_MS);
  }

  function renderAll() {
    if (_renderAllTimer) {
      clearTimeout(_renderAllTimer);
      _renderAllTimer = 0;
    }
    if (_renderAllRunning) {
      _renderAllQueued = true;
      return;
    }
    _renderAllRunning = true;
    markRuntimeBusy("renderAll");
    try {
      performRenderAll();
      clearRuntimeBusy();
    } catch (e) {
      handleRuntimeError("Raytrace stopped", e);
      clearRuntimeBusy();
    } finally {
      _renderAllRunning = false;
      if (_renderAllQueued) {
        _renderAllQueued = false;
        scheduleRenderAll();
      }
    }
  }

  function finishPreviewRender() {
    _renderPreviewRunning = false;
    clearRuntimeBusy();
    if (_renderAllAfterPreview) {
      _renderAllAfterPreview = false;
      scheduleRenderAll();
    }
    if (_renderPreviewQueued && renderEngineEnabled) {
      _renderPreviewQueued = false;
      scheduleRenderPreview();
    }
  }

  function renderPreview() {
    if (_previewRenderTimer) {
      clearTimeout(_previewRenderTimer);
      _previewRenderTimer = 0;
    }
    if (!renderEngineEnabled) {
      hidePreviewProgress();
      return;
    }
    if (_renderPreviewRunning) {
      _renderPreviewQueued = true;
      _previewRenderJobId++;
      return;
    }
    _renderPreviewRunning = true;
    markRuntimeBusy("renderPreview");
    try {
      performRenderPreview();
    } catch (e) {
      _renderPreviewRunning = false;
      clearRuntimeBusy();
      handleRuntimeError("Preview stopped", e);
    }
  }

  // ===========================
  // RENDER ALL (rays pane)
  // ===========================
  function performRenderAll() {
    if (!canvas || !ctx) return;
    if (!_safeModeActive) clearStatusWarning();
    syncActiveZoomConfigFromUI();

    const fieldAngle = Number(ui.fieldAngle?.value || 0);
    const rayCount   = Number(ui.rayCount?.value || 31);
    const wavePreset = ui.wavePreset?.value || "d";

    const { w: sensorW, h: sensorH, halfH } = getSensorWH();

    const objectDistanceMm = getFocusChartDistanceMm();
    const focusCtx = getFocusContext({
      objectDistanceMm,
      wavePreset,
      allowAutoRefocus: true,
    });
    const focusMode = focusCtx.focusMode;
    const focusMechanism = focusCtx.focusMechanism;
    const sensorShift = focusCtx.sensorX;
    const lensShift = focusCtx.lensShift;

    // Keep base lens data at nominal pose; focused clones are used for tracing/display.
    computeVertices(lens.surfaces, 0, 0);
    const nominalSensorX = getSensorPlaneX(lens.surfaces, 0);

    // Use a focused optical clone for tracing only.
    const traceSurfaces = clone(lens.surfaces);
    computeVertices(traceSurfaces, lensShift, sensorShift);
    const traceSensorX = getSensorPlaneX(traceSurfaces, sensorShift);
    // Keep a nominal optical clone as fallback when focused pose tracing collapses.
    const nominalTraceSurfaces = clone(lens.surfaces);
    computeVertices(nominalTraceSurfaces, 0, 0);
    const nominalTraceSensorX = getSensorPlaneX(nominalTraceSurfaces, 0);
    let activeTraceSurfaces = traceSurfaces;
    let activeTraceSensorX = traceSensorX;

    const isImportedZemax = !!(
      lens?.originalZmxText ||
      String(lens?.importSource || "").toLowerCase().includes("zmx") ||
      String(lens?.zemax?.source || "").toLowerCase() === "zemax"
    );
    const useZemaxPupilBundle = isImportedZemax && Math.abs(fieldAngle) < 1e-9;
    let rayBundle = useZemaxPupilBundle
      ? buildEntrancePupilLimitedRays(traceSurfaces, rayCount, fieldAngle, wavePreset, objectDistanceMm)
      : { rays: buildRays(traceSurfaces, fieldAngle, rayCount, objectDistanceMm), bundleRadiusMm: null, epRadiusMm: null, mode: "default" };
    let rays = Array.isArray(rayBundle?.rays) ? rayBundle.rays : [];
    let traces = rays.map((r, ri) => traceRayForward(clone(r), traceSurfaces, wavePreset, { rayIndex: ri, debugTrace: useZemaxPupilBundle }));

    if (useZemaxPupilBundle && traces.length && traces.every((t) => t?.vignetted || t?.tir)) {
      rays = buildDebugCenterRays(traceSurfaces, rayCount);
      rayBundle = {
        rays,
        bundleRadiusMm: null,
        epRadiusMm: Number.isFinite(Number(rayBundle?.epRadiusMm)) ? Number(rayBundle.epRadiusMm) : null,
        xStartMm: Number.isFinite(Number(rayBundle?.xStartMm)) ? Number(rayBundle.xStartMm) : null,
        xAimMm: Number.isFinite(Number(rayBundle?.xAimMm)) ? Number(rayBundle.xAimMm) : null,
        mode: "debug_center_fallback",
      };
      traces = rays.map((r, ri) => traceRayForward(clone(r), traceSurfaces, wavePreset, { rayIndex: ri, debugTrace: true }));
      console.warn("[ray-bundle] Fallback to debug center bundle (all rays failed in entrance-pupil-limited bundle).");
    }

    // If focused-pose tracing yields no IMS hits, retry once in nominal pose.
    let reachedIMSCount = traces.filter((t) => t.reachedIMS).length;
    if (isImportedZemax && reachedIMSCount === 0) {
      let nominalBundle = useZemaxPupilBundle
        ? buildEntrancePupilLimitedRays(nominalTraceSurfaces, rayCount, fieldAngle, wavePreset, objectDistanceMm)
        : { rays: buildRays(nominalTraceSurfaces, fieldAngle, rayCount, objectDistanceMm), bundleRadiusMm: null, epRadiusMm: null, mode: "nominal_default" };
      let nominalRays = Array.isArray(nominalBundle?.rays) ? nominalBundle.rays : [];
      let nominalTraces = nominalRays.map((r, ri) => traceRayForward(clone(r), nominalTraceSurfaces, wavePreset, { rayIndex: ri, debugTrace: false }));
      let nominalReachedIMS = nominalTraces.filter((t) => t.reachedIMS).length;
      if (nominalReachedIMS === 0 && useZemaxPupilBundle) {
        nominalRays = buildDebugCenterRays(nominalTraceSurfaces, rayCount);
        nominalBundle = {
          rays: nominalRays,
          bundleRadiusMm: null,
          epRadiusMm: Number.isFinite(Number(nominalBundle?.epRadiusMm)) ? Number(nominalBundle.epRadiusMm) : null,
          xStartMm: Number.isFinite(Number(nominalBundle?.xStartMm)) ? Number(nominalBundle.xStartMm) : null,
          xAimMm: Number.isFinite(Number(nominalBundle?.xAimMm)) ? Number(nominalBundle.xAimMm) : null,
          mode: "nominal_debug_center_fallback",
        };
        nominalTraces = nominalRays.map((r, ri) => traceRayForward(clone(r), nominalTraceSurfaces, wavePreset, { rayIndex: ri, debugTrace: false }));
        nominalReachedIMS = nominalTraces.filter((t) => t.reachedIMS).length;
      }
      if (nominalReachedIMS > reachedIMSCount) {
        activeTraceSurfaces = nominalTraceSurfaces;
        activeTraceSensorX = nominalTraceSensorX;
        rayBundle = nominalBundle;
        rays = nominalRays;
        traces = nominalTraces;
        reachedIMSCount = nominalReachedIMS;
        console.warn("[ray-bundle] Fallback to nominal-pose tracing (focused pose produced zero IMS hits).", {
          activeZoomConfig: Number.isFinite(Number(lens?.zoom?.activeConfig)) ? Number(lens.zoom.activeConfig) : null,
          activeZoomLabel: String(lens?.zemax?.currentConfigLabel || "—"),
        });
      }
    }

    const displaySurfaces = activeTraceSurfaces;
    const displaySensorX = activeTraceSensorX;
    const plX = displaySensorX - PL_FFD;

    const vCount = traces.filter((t) => t.vignetted).length;
    const tirCount = traces.filter((t) => t.tir).length;
    const validCount = traces.filter((t) => !t.vignetted && !t.tir).length;
    reachedIMSCount = traces.filter((t) => t.reachedIMS).length;
    const failReasonCounts = traces.reduce((acc, t) => {
      const key = String(t?.failReason || (t?.reachedIMS ? "ok" : "unknown"));
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const vigPct = traces.length ? Math.round((vCount / traces.length) * 100) : 0;

    let paraxialSource = "focused";
    let { efl, bfl } = estimateEflBflParaxial(activeTraceSurfaces, wavePreset);
    let tStopSurfaceRef = activeTraceSurfaces;
    if (!Number.isFinite(Number(efl))) {
      const nominalParax = estimateEflBflParaxial(nominalTraceSurfaces, wavePreset);
      if (Number.isFinite(Number(nominalParax?.efl))) {
        efl = Number(nominalParax.efl);
        bfl = Number.isFinite(Number(nominalParax?.bfl)) ? Number(nominalParax.bfl) : null;
        tStopSurfaceRef = nominalTraceSurfaces;
        paraxialSource = "nominal_fallback";
      }
    }
    let T = estimateTStopApprox(efl, tStopSurfaceRef, wavePreset);
    if (!Number.isFinite(Number(T))) {
      const importedConfigFno = Number(lens?.zemax?.configAperture);
      if (Number.isFinite(importedConfigFno) && importedConfigFno > 0) T = importedConfigFno;
    }

    const fov = computeFovDeg(efl, sensorW, sensorH);
    const fovTxt = !fov
      ? "FOV: —"
      : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

    const maxField = coverageTestMaxFieldDeg(activeTraceSurfaces, wavePreset, activeTraceSensorX, halfH);
    const covMode = "v";
    const { ok: coversGeom, req } = coversSensorYesNo({ fov, maxField, mode: covMode, marginDeg: 0.5 });
    const sensorDiagMm = Math.hypot(sensorW, sensorH);
    const coversByIC = !!(preview.usableCircle?.valid && preview.usableCircle.diameterMm >= sensorDiagMm);
    const covers = coversGeom && coversByIC;

    const covTxt = !fov
      ? "COV(V): —"
      : `COV(V): ±${maxField.toFixed(1)}° • REQ(V): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;

    const rearVx = lastPhysicalVertexX(displaySurfaces);
    const intrusion = rearVx - plX;
    const rearTxt = (intrusion > 0)
      ? `REAR INTRUSION: +${intrusion.toFixed(2)}mm ❌`
      : `REAR CLEAR: ${Math.abs(intrusion).toFixed(2)}mm ✅`;

    const frontVx = firstPhysicalVertexX(displaySurfaces);
    const lenToFlange = plX - frontVx;
    const totalLen = lenToFlange + PL_LENS_LIP;
    const lenTxt = (Number.isFinite(totalLen) && totalLen > 0)
      ? `LEN≈ ${totalLen.toFixed(1)}mm (front→PL + mount)`
      : `LEN≈ —`;

    if (ui.efl) ui.efl.textContent = `Focal Length: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bfl) ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstop) ui.tstop.textContent = `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.vig) ui.vig.textContent = `Vignette: ${vigPct}%`;
    if (ui.fov) ui.fov.textContent = fovTxt;
    if (ui.cov) ui.cov.textContent = covers ? "COV: YES" : "COV: NO";

    if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.fovTop) ui.fovTop.textContent = fovTxt;
    if (ui.covTop) ui.covTop.textContent = ui.cov?.textContent || (covers ? "COV: YES" : "COV: NO");

    if (!_safeModeActive && reachedIMSCount === 0 && ui.footerWarn) {
      const reasonTxt = Object.entries(failReasonCounts)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
      ui.footerWarn.textContent = `No rays reached IMS (${reasonTxt || "unknown"}).`;
    } else if (!_safeModeActive && tirCount > 0 && ui.footerWarn) {
      ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;
    }

    if (ui.status) {
      ui.status.textContent =
        `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount} • IMS hits ${reachedIMSCount} • ${covTxt}`;
    }
    if (ui.metaInfo) ui.metaInfo.textContent = `sensor ${sensorW.toFixed(2)}×${sensorH.toFixed(2)}mm`;
    updateZemaxVerifyPanel({ sensorX: displaySensorX });

    const eflTxt = efl == null ? "—" : `${efl.toFixed(2)}mm`;
    const tTxt   = T == null ? "—" : `T${T.toFixed(2)}`;
    const focusTxt = `Focus shift: ${focusCtx.focusShiftMm.toFixed(2)}mm (${focusMode}/${focusMechanism}, optical pose)`;
    const flangeTxt = `Flange reference: 52.00mm from displayed sensor plane`;

    const titleParts = [
      lens?.name || "Lens",
      `EFL ${eflTxt}`,
      `BFL ${bfl == null ? "—" : bfl.toFixed(2) + "mm"}`,
      tTxt,
      fovTxt,
      covTxt,
      rearTxt,
      lenTxt,
      flangeTxt,
      focusTxt,
      `Paraxial source: ${paraxialSource}`,
      `Rays valid: ${validCount}/${traces.length} • IMS: ${reachedIMSCount}/${traces.length} • TIR: ${tirCount}`,
      `EP radius: ${Number.isFinite(Number(rayBundle?.epRadiusMm)) ? Number(rayBundle.epRadiusMm).toFixed(3) + "mm" : "—"} • Bundle radius: ${Number.isFinite(Number(rayBundle?.bundleRadiusMm)) ? Number(rayBundle.bundleRadiusMm).toFixed(3) + "mm" : "—"} (${String(rayBundle?.mode || "default")})`,
    ];
    _lastRayPaneRedraw = () => {
      if (!canvas || !ctx) return;
      resizeCanvasToCSS();
      const r = canvas.getBoundingClientRect();
      drawBackgroundCSS(r.width, r.height);
      const world = makeWorldTransform();
      drawAxes(world);
      drawRuler(world, 0, -200);
      const xMinPL = Math.min(frontVx - 20, plX - 20);
      drawRulerFrom(world, plX, xMinPL, null, "", +12);
      drawPLFlange(world, plX);
      drawLens(world, displaySurfaces);
      drawStop(world, displaySurfaces);
      drawRays(world, traces, displaySensorX);
      drawPLMountCutout(world, plX);
      drawSensor(world, displaySensorX, halfH);
      drawTitleOverlay(titleParts);
    };
    _lastRayPaneRedraw();
    if (isImportedZemax) {
      const zoomConfigs = Array.isArray(lens?.zoom?.configs) ? lens.zoom.configs : [];
      const activeIdx = Number(lens?.zoom?.activeConfig);
      const activeCfg = zoomConfigs.find((c) => Number(c?.index) === activeIdx) || null;
      const activeCfgLabel = activeCfg
        ? formatZoomConfigLabel(activeCfg, Math.max(0, zoomConfigs.findIndex((c) => c === activeCfg)), zoomConfigs.length)
        : "—";
      const imsSurfaceIndex = activeTraceSurfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
      const sig = [
        String(activeIdx),
        activeCfgLabel,
        Number.isFinite(Number(efl)) ? Number(efl).toFixed(6) : "null",
        Number.isFinite(Number(bfl)) ? Number(bfl).toFixed(6) : "null",
        String(reachedIMSCount),
        String(vCount),
        String(tirCount),
        JSON.stringify(failReasonCounts),
      ].join("|");
      if (sig !== _lastZemaxTraceDebugSignature) {
        _lastZemaxTraceDebugSignature = sig;
        console.groupCollapsed("[zemax-trace-debug] renderAll");
        console.log("selectedConfig", {
          index: activeIdx,
          label: activeCfgLabel,
          thicknessOverrides: activeCfg?.thicknessOverrides || {},
        });
        console.log("imsDetection", {
          imsSurfaceIndex,
          imsZmxSurf: imsSurfaceIndex >= 0 ? Number(activeTraceSurfaces?.[imsSurfaceIndex]?.zmx?.surf) : null,
          imsVx: imsSurfaceIndex >= 0 ? Number(activeTraceSurfaces?.[imsSurfaceIndex]?.vx) : null,
        });
        console.log("rayStats", {
          traced: traces.length,
          reachedIMS: reachedIMSCount,
          vignetted: vCount,
          tir: tirCount,
          failReasonCounts,
          paraxialSource,
          activeTracePose: activeTraceSurfaces === traceSurfaces ? "focused" : "nominal",
        });
        console.table(activeTraceSurfaces.map((s, i) => ({
          row: i,
          type: String(s?.type || ""),
          zmxSurf: Number.isFinite(Number(s?.zmx?.surf)) ? Number(s.zmx.surf) : null,
          vx: Number.isFinite(Number(s?.vx)) ? Number(s.vx) : null,
          t: Number.isFinite(Number(s?.t)) ? Number(s.t) : null,
          R: Number.isFinite(Number(s?.R)) ? Number(s.R) : null,
          ap: Number.isFinite(Number(getSurfaceOpticalAp(s))) ? Number(getSurfaceOpticalAp(s)) : null,
          glass: String(s?.glass || "AIR"),
          nd: Number.isFinite(Number(s?.nd)) ? Number(s.nd) : null,
          vd: Number.isFinite(Number(s?.vd)) ? Number(s.vd) : null,
          stop: !!s?.stop,
        })));
        console.groupEnd();
      }
    }
    const autoMetricMm = Number(focusCtx?.autoRun?.bestMetricRmsMm);
    updateFocusShiftStatus(
      focusCtx.autoRun?.ok
        ? `auto metric ${Number.isFinite(autoMetricMm) ? autoMetricMm.toFixed(4) : "—"}mm`
        : ""
    );
  }

  // -------------------- view controls (RAYS canvas) --------------------
  function redrawRayPaneOnly() {
    if (_lastRayPaneRedraw) {
      try {
        _lastRayPaneRedraw();
        return;
      } catch (e) {
        console.warn("Ray pane redraw failed, scheduling full render.", e);
      }
    }
    scheduleRenderAll({ immediate: true });
  }

  function bindViewControls() {
    if (!canvas) return;

    canvas.addEventListener("mousedown", (e) => {
      view.dragging = true;
      view.lastX = e.clientX;
      view.lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { view.dragging = false; });

    window.addEventListener("mousemove", (e) => {
      if (!view.dragging) return;
      const dx = e.clientX - view.lastX;
      const dy = e.clientY - view.lastY;
      view.lastX = e.clientX;
      view.lastY = e.clientY;
      view.panX += dx;
      view.panY += dy;
      redrawRayPaneOnly();
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const factor = delta > 0 ? 0.92 : 1.08;
      view.zoom = Math.max(0.12, Math.min(12, view.zoom * factor));
      redrawRayPaneOnly();
    }, { passive: false });

    canvas.addEventListener("dblclick", () => {
      view.panX = 0; view.panY = 0; view.zoom = 1.0;
      redrawRayPaneOnly();
    });
  }

  // -------------------- preview viewport (PAN/ZOOM) --------------------
  function getSensorRectBaseInPane() {
    if (!previewCanvasEl) return { x: 0, y: 0, w: 0, h: 0 };

    const r = previewCanvasEl.getBoundingClientRect();
    const pad = 22;
    const paneW = r.width, paneH = r.height;

    const { w: sensorW, h: sensorH } = getSensorWH();
    const asp = sensorW / sensorH;

    let rw = paneW - pad * 2;
    let rh = rw / asp;

    if (rh > paneH - pad * 2) {
      rh = paneH - pad * 2;
      rw = rh * asp;
    }

    const x = (paneW - rw) * 0.5;
    const y = (paneH - rh) * 0.5;
    return { x, y, w: rw, h: rh };
  }

  function applyViewToSensorRect(sr0, v) {
    const cx0 = sr0.x + sr0.w * 0.5;
    const cy0 = sr0.y + sr0.h * 0.5;

    const cx = cx0 + v.panX;
    const cy = cy0 + v.panY;

    const w = sr0.w * v.zoom;
    const h = sr0.h * v.zoom;

    return { x: cx - w * 0.5, y: cy - h * 0.5, w, h };
  }

  function drawPreviewViewport() {
    if (!previewCanvasEl || !pctx) return;

    resizePreviewCanvasToCSS();

    const Wc = previewCanvasEl._cssW || previewCanvasEl.getBoundingClientRect().width;
    const Hc = previewCanvasEl._cssH || previewCanvasEl.getBoundingClientRect().height;

    pctx.clearRect(0, 0, Wc, Hc);

    const hasImg = !!(preview.imgData && preview.imgCanvas.width > 0 && preview.imgCanvas.height > 0);
    pctx.fillStyle = hasImg ? "#000" : "#fff";
    pctx.fillRect(0, 0, Wc, Hc);

    if (!preview.worldReady) {
      pctx.fillStyle = "rgba(255,255,255,.65)";
      pctx.font = "12px " + (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace");
      pctx.fillText("Preview: render first", 18, 24);
      return;
    }

    const sr0 = getSensorRectBaseInPane();

    const cx = sr0.x + sr0.w * 0.5;
    const cy = sr0.y + sr0.h * 0.5;

    pctx.save();
    pctx.imageSmoothingEnabled = true;
    pctx.imageSmoothingQuality = "high";

    pctx.beginPath();
    pctx.rect(sr0.x, sr0.y, sr0.w, sr0.h);
    pctx.clip();

    pctx.translate(cx + preview.view.panX, cy + preview.view.panY);
    pctx.scale(preview.view.zoom, preview.view.zoom);

    pctx.drawImage(
      preview.worldCanvas,
      -sr0.w * 0.5, -sr0.h * 0.5,
      sr0.w, sr0.h
    );

    pctx.restore();

    pctx.save();
    pctx.lineWidth = 1;
    pctx.strokeStyle = "rgba(255,255,255,.20)";
    pctx.strokeRect(sr0.x, sr0.y, sr0.w, sr0.h);

    const sr = applyViewToSensorRect(sr0, preview.view);
    pctx.strokeStyle = "rgba(42,110,242,.55)";
    pctx.strokeRect(sr.x, sr.y, sr.w, sr.h);

    // --- diagonal ruler (toggle) ---
    if (preview.rulerOn) drawPreviewDiagonalRuler(sr);
    if (debugOutlineOverlayEnabled) drawPreviewDebugOverlay(sr);
    pctx.restore();
  }

  function drawPreviewDebugOverlay(sr) {
    if (!pctx || !sr) return;
    const d = preview.debug || {};
    const lines = [];
    const focusTxt = (Number.isFinite(d.focusDeltaMm))
      ? `Focus Δ: ${d.focusDeltaMm >= 0 ? "+" : ""}${d.focusDeltaMm.toFixed(3)}mm`
      : "Focus Δ: —";
    const rmsMmTxt = Number.isFinite(d.spotRmsMm) ? `${d.spotRmsMm.toFixed(4)}mm` : "—";
    const rmsPxTxt = Number.isFinite(d.spotRmsPx) ? `${d.spotRmsPx.toFixed(2)}px` : "—";
    const kPxTxt = Number.isFinite(d.kernelPx) ? `${d.kernelPx.toFixed(2)}px` : "—";
    const mppTxt = Number.isFinite(d.mmPerPx) ? `${d.mmPerPx.toFixed(5)} mm/px` : "—";
    const cTxt = Number.isFinite(d.centerRmsMm) ? `${d.centerRmsMm.toFixed(4)}mm / ${Number(d.centerRmsPx || 0).toFixed(2)}px` : "—";
    const mTxt = Number.isFinite(d.midRmsMm) ? `${d.midRmsMm.toFixed(4)}mm / ${Number(d.midRmsPx || 0).toFixed(2)}px` : "—";
    const kTxt = Number.isFinite(d.cornerRmsMm) ? `${d.cornerRmsMm.toFixed(4)}mm / ${Number(d.cornerRmsPx || 0).toFixed(2)}px` : "—";
    const cHitTxt = Number.isFinite(d.centerHitRate) ? `${(d.centerHitRate * 100).toFixed(1)}%` : "—";
    const mHitTxt = Number.isFinite(d.midHitRate) ? `${(d.midHitRate * 100).toFixed(1)}%` : "—";
    const kHitTxt = Number.isFinite(d.cornerHitRate) ? `${(d.cornerHitRate * 100).toFixed(1)}%` : "—";
    const curvTxt = Number.isFinite(d.fieldCurvatureDeltaMm)
      ? `${d.fieldCurvatureDeltaMm >= 0 ? "+" : ""}${d.fieldCurvatureDeltaMm.toFixed(3)}mm`
      : "—";
    const icTxt = (preview?.usableCircle?.valid && Number.isFinite(Number(preview?.usableCircle?.diameterMm)))
      ? `Ø${Number(preview.usableCircle.diameterMm).toFixed(2)}mm`
      : "—";

    lines.push(focusTxt);
    lines.push(`Spot RMS: ${rmsMmTxt} • ${rmsPxTxt}`);
    lines.push(`Kernel: ${kPxTxt} • Scale: ${mppTxt}`);
    lines.push(`RMS C/M/K: ${cTxt} • ${mTxt} • ${kTxt}`);
    lines.push(`Valid rays C/M/K: ${cHitTxt} • ${mHitTxt} • ${kHitTxt}`);
    lines.push(`Best focus Δ(center→corner): ${curvTxt}`);
    lines.push(`Image circle est: ${icTxt}`);
    if (d.method) lines.push(`Method: ${String(d.method)}`);

    pctx.save();
    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    pctx.font = `11px ${mono}`;
    pctx.textAlign = "left";
    pctx.textBaseline = "top";

    let maxW = 0;
    for (const ln of lines) maxW = Math.max(maxW, pctx.measureText(ln).width);

    const pad = 8;
    const lineH = 14;
    const boxW = Math.ceil(maxW + pad * 2);
    const boxH = Math.ceil(lines.length * lineH + pad * 2);
    const x = Math.max(10, sr.x + 10);
    const y = Math.max(42, sr.y + 10);

    pctx.fillStyle = "rgba(0,0,0,.55)";
    pctx.strokeStyle = "rgba(255,255,255,.16)";
    pctx.lineWidth = 1;
    pctx.beginPath();
    if (typeof pctx.roundRect === "function") pctx.roundRect(x, y, boxW, boxH, 8);
    else pctx.rect(x, y, boxW, boxH);
    pctx.fill();
    pctx.stroke();

    pctx.fillStyle = "rgba(255,255,255,.90)";
    for (let i = 0; i < lines.length; i++) {
      pctx.fillText(lines[i], x + pad, y + pad + i * lineH);
    }
    pctx.restore();
  }

  // ==========================
  // PREVIEW DIAGONAL RULER (clean, like a physical ruler)
  // - Diagonal from corner to corner through center.
  // - 0 at center. Labels show radius (r) and diameter (Ø=2r).
  // - Scales with sensor W/H.
  // ==========================
  function drawPreviewDiagonalRuler(sr){
    if (!pctx || !sr) return;

    const { w: sensorW, h: sensorH } = getSensorWH();
    const diagMm = Math.hypot(sensorW, sensorH);
    if (!(diagMm > 0)) return;

    const xTL = sr.x, yTL = sr.y;
    const xBR = sr.x + sr.w, yBR = sr.y + sr.h;

    const dx = xBR - xTL;
    const dy = yBR - yTL;
    const diagPx = Math.hypot(dx, dy);
    if (diagPx < 10) return;

    const ux = dx / diagPx;
    const uy = dy / diagPx;
    const nx = -uy;
    const ny = ux;

    const cx = xTL + dx * 0.5;
    const cy = yTL + dy * 0.5;

    const halfDiagMm = diagMm * 0.5;
    const halfDiagPx = diagPx * 0.5;
    const pxPerMm = halfDiagPx / halfDiagMm;

    // tick policy (physical ruler style)
    // - every 1mm: small tick + label
    // - every 5mm: medium tick
    // - every 10mm (1cm): big tick + bigger label
    const stepMm = 1;
    const majorMm = 10;  // 1cm
    const midMm   = 5;   // 5mm
    const labelEveryMm = 1; // label each mm

    const barHalfW = 7.0;
    const tick1mm = 4;
    const tick5mm = 8;
    const tick10mm = 14;

    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    const minorFont = 9;
    const majorFont = 13;
    const labelAngle = Math.atan2(uy, ux) + Math.PI * 0.5;

    // Compact dual-scale label: radius(mm)|diameter(mm)
    function labelText(mm){
      const rmm = Math.round(mm);
      const dmm = Math.round(mm * 2);
      return `${rmm}|${dmm}`;
    }

    const P = (tPx) => ({ x: cx + ux * tPx, y: cy + uy * tPx });

    pctx.save();
    pctx.lineCap = "round";
    pctx.lineJoin = "round";

    // main dark bar (like a ruler)
    pctx.strokeStyle = "rgba(0,0,0,.55)";
    pctx.lineWidth = barHalfW * 2;
    pctx.beginPath();
    pctx.moveTo(xTL, yTL);
    pctx.lineTo(xBR, yBR);
    pctx.stroke();

    // subtle bright edge
    pctx.strokeStyle = "rgba(255,255,255,.18)";
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(xTL, yTL);
    pctx.lineTo(xBR, yBR);
    pctx.stroke();

    // ticks + labels
    pctx.font = `${minorFont}px ${mono}`;
    pctx.fillStyle = "rgba(255,255,255,.92)";
    pctx.strokeStyle = "rgba(255,255,255,.85)";
    pctx.lineWidth = 1.5;
    pctx.textAlign = "left";
    pctx.textBaseline = "middle";

    // center zero tick
    {
      const p0 = P(0);
      pctx.beginPath();
      pctx.moveTo(p0.x - nx * 14, p0.y - ny * 14);
      pctx.lineTo(p0.x + nx * 14, p0.y + ny * 14);
      pctx.stroke();

      // legend: radius|diameter (both in mm)
      const off = barHalfW + tick10mm + 14;
      pctx.save();
      pctx.translate(p0.x + nx * off, p0.y + ny * off);
      pctx.rotate(labelAngle);
      pctx.textAlign = "center";
      pctx.textBaseline = "middle";
      pctx.font = `700 9px ${mono}`;
      pctx.lineWidth = 2.5;
      pctx.strokeStyle = "rgba(0,0,0,.70)";
      pctx.strokeText("r|Ømm", 0, 0);
      pctx.fillStyle = "rgba(255,255,255,.95)";
      pctx.fillText("r|Ømm", 0, 0);
      pctx.restore();
    }

    const maxMm = Math.floor(halfDiagMm + 1e-6);
    for (let mm = 0; mm <= maxMm; mm += stepMm){
      const isMajor = (mm % majorMm) === 0;
      const isMid = !isMajor && (mm % midMm) === 0;
      const len = isMajor ? tick10mm : (isMid ? tick5mm : tick1mm);
      const t = mm * pxPerMm;

      // positive side
      {
        const p = P(t);
        pctx.beginPath();
        pctx.moveTo(p.x - nx * len, p.y - ny * len);
        pctx.lineTo(p.x + nx * len, p.y + ny * len);
        pctx.stroke();

        if ((mm % labelEveryMm) === 0 && mm > 0){
          const txt = labelText(mm);
          const off = barHalfW + len + (isMajor ? 14 : 9);
          const tx = p.x + nx * off;
          const ty = p.y + ny * off;

          pctx.save();
          pctx.translate(tx, ty);
          pctx.rotate(labelAngle);
          pctx.textAlign = "center";
          pctx.textBaseline = "middle";
          pctx.font = `${isMajor ? "700 " : ""}${isMajor ? majorFont : minorFont}px ${mono}`;
          pctx.lineWidth = isMajor ? 3.5 : 2.5;
          pctx.strokeStyle = "rgba(0,0,0,.72)";
          pctx.strokeText(txt, 0, 0);
          pctx.fillStyle = "rgba(255,255,255,.92)";
          pctx.fillText(txt, 0, 0);
          pctx.restore();
        }
      }

      // negative side (mirror ticks, no duplicate labels)
      if (mm === 0) continue;
      {
        const p = P(-t);
        pctx.beginPath();
        pctx.moveTo(p.x - nx * len, p.y - ny * len);
        pctx.lineTo(p.x + nx * len, p.y + ny * len);
        pctx.stroke();
      }
    }

    if (preview.usableCircle?.valid) {
      const cutMm = clamp(preview.usableCircle.radiusMm, 0, maxMm);
      const tCut = cutMm * pxPerMm;
      const pPos = P(tCut);
      const pNeg = P(-tCut);

      pctx.save();
      pctx.strokeStyle = "rgba(255,194,46,.98)";
      pctx.fillStyle = "rgba(255,194,46,.98)";
      pctx.lineWidth = 2.8;

      [pPos, pNeg].forEach((p) => {
        pctx.beginPath();
        pctx.moveTo(p.x - nx * 16, p.y - ny * 16);
        pctx.lineTo(p.x + nx * 16, p.y + ny * 16);
        pctx.stroke();
      });

      // visual circle for quick readout of the usable image circle edge
      pctx.setLineDash([8, 6]);
      pctx.lineWidth = 1.8;
      pctx.strokeStyle = "rgba(255,194,46,.85)";
      pctx.beginPath();
      pctx.arc(cx, cy, Math.max(0, tCut), 0, Math.PI * 2);
      pctx.stroke();
      pctx.setLineDash([]);

      const txt = `usable Ø${preview.usableCircle.diameterMm.toFixed(1)}mm`;
      const off = barHalfW + tick10mm + 22;
      const tx = pPos.x + nx * off;
      const ty = pPos.y + ny * off;

      pctx.font = `700 11px ${mono}`;
      const padX = 8, padY = 5;
      const tw = pctx.measureText(txt).width;
      const bw = tw + padX * 2;
      const bh = 11 + padY * 2;

      pctx.fillStyle = "rgba(17,17,17,.82)";
      pctx.strokeStyle = "rgba(255,194,46,.35)";
      pctx.lineWidth = 1;
      pctx.beginPath();
      if (typeof pctx.roundRect === "function") pctx.roundRect(tx, ty - bh * 0.5, bw, bh, 8);
      else pctx.rect(tx, ty - bh * 0.5, bw, bh);
      pctx.fill();
      pctx.stroke();

      pctx.fillStyle = "rgba(255,220,120,.98)";
      pctx.textAlign = "left";
      pctx.textBaseline = "middle";
      pctx.fillText(txt, tx + padX, ty);
      pctx.restore();
    }

    pctx.restore();
  }

  function bindPreviewViewControls() {
    if (!previewCanvasEl) return;
    if (previewCanvasEl.dataset._pvBound === "1") return;
    previewCanvasEl.dataset._pvBound = "1";

    previewCanvasEl.style.touchAction = "none";

    previewCanvasEl.addEventListener("pointerdown", (e) => {
      preview.view.dragging = true;
      preview.view.lastX = e.clientX;
      preview.view.lastY = e.clientY;
      previewCanvasEl.setPointerCapture(e.pointerId);
    });

    const up = (e) => {
      preview.view.dragging = false;
      try { previewCanvasEl.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    previewCanvasEl.addEventListener("pointerup", up);
    previewCanvasEl.addEventListener("pointercancel", up);

    previewCanvasEl.addEventListener("pointermove", (e) => {
      if (!preview.view.dragging) return;
      const dx = e.clientX - preview.view.lastX;
      const dy = e.clientY - preview.view.lastY;
      preview.view.lastX = e.clientX;
      preview.view.lastY = e.clientY;
      preview.view.panX += dx;
      preview.view.panY += dy;
      drawPreviewViewport();
    });

    previewCanvasEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const factor = delta > 0 ? 0.92 : 1.08;
      preview.view.zoom = Math.max(0.12, Math.min(20, preview.view.zoom * factor));
      drawPreviewViewport();
    }, { passive: false });

    previewCanvasEl.addEventListener("dblclick", () => {
      preview.view.panX = 0;
      preview.view.panY = 0;
      preview.view.zoom = 1.0;
      drawPreviewViewport();
    });
  }

  // -------------------- edit helpers --------------------
  function isProtectedIndex(i) {
    const t = String(lens.surfaces[i]?.type || "").toUpperCase();
    return t === "OBJ" || t === "IMS";
  }

  function getIMSIndex() {
    return lens.surfaces.findIndex((s) => String(s.type).toUpperCase() === "IMS");
  }

  function safeInsertAtAfterSelected() {
    clampSelected();
    let insertAt = selectedIndex + 1;
    const imsIdx = getIMSIndex();
    if (imsIdx >= 0) insertAt = Math.min(insertAt, imsIdx);
    insertAt = Math.max(1, insertAt);
    return insertAt;
  }

  function insertSurface(atIndex, surfaceObj) {
    lens.surfaces.splice(atIndex, 0, surfaceObj);
    selectedIndex = atIndex;
    buildTable();
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
  }
  function insertAfterSelected(surfaceObj) {
    const at = safeInsertAtAfterSelected();
    insertSurface(at, surfaceObj);
  }

  // -------------------- basic editing actions --------------------
  function addSurface() {
    insertAfterSelected({ type: "", R: 0.0, t: 4.0, ap: 18.0, glass: "AIR", stop: false });
  }

  function isFieldFlattenerSurface(surface) {
    const label = String(surface?.surfaceLabel ?? surface?.label ?? surface?.type ?? "").toUpperCase();
    return label.includes("FIELD FLATTENER");
  }

  function isFieldFlattenerAirGapSurface(surfaces, index) {
    const s = surfaces?.[index];
    if (!s || !isAirSurfaceMedium(s)) return false;
    return isFieldFlattenerSurface(s) || isFieldFlattenerSurface(surfaces?.[index + 1]);
  }

  function findFieldFlattenerIndices(surfaces) {
    return (surfaces || [])
      .map((s, i) => isFieldFlattenerSurface(s) ? i : -1)
      .filter((i) => i >= 0);
  }

  function addWeakRearFieldFlattener() {
    try {
      lens = sanitizeLens(lens);
      const surfaces = lens.surfaces || [];
      const imsIdx = getIMSIndex();
      if (imsIdx <= 1) {
        toast("Cannot add field flattener before IMS");
        return;
      }
      const frontAir = 12;
      const rearAir = 12;
      const ap = 18;
      let anchorIdx = imsIdx - 1;
      for (let i = imsIdx - 1; i >= 1; i--) {
        if (isAirSurfaceMedium(surfaces[i])) {
          anchorIdx = i;
          break;
        }
      }
      surfaces[anchorIdx].t = frontAir;
      const insertAt = anchorIdx + 1;
      const front = {
        type: "",
        R: -250,
        t: 2.0,
        ap,
        ap_optical: ap,
        glass: "N-BK7HT",
        stop: false,
        surfaceLabel: "L5 FIELD FLATTENER FRONT",
        surfaceLabelAuto: false,
      };
      const rear = {
        type: "",
        R: 250,
        t: rearAir,
        ap,
        ap_optical: ap,
        glass: "AIR",
        stop: false,
        surfaceLabel: "L5 FIELD FLATTENER REAR",
        surfaceLabelAuto: false,
      };
      surfaces.splice(insertAt, 0, front, rear);
      selectedIndex = insertAt;
      lens = sanitizeLens(lens);
      buildTable();
      applySensorToIMS();
      renderAll();
      scheduleRenderPreview();
      toast("Added weak rear field flattener");
    } catch (e) {
      const msg = e?.message || String(e);
      if (ui.footerWarn) ui.footerWarn.textContent = `Field flattener insert failed: ${msg}`;
      toast(`Field flattener insert failed: ${msg}`);
    }
  }

  function duplicateSelected() {
    clampSelected();
    if (isProtectedIndex(selectedIndex)) return toast("Cannot duplicate OBJ/IMS");
    const s = clone(lens.surfaces[selectedIndex]);
    s.type = "";
    const at = safeInsertAtAfterSelected();
    insertSurface(at, s);
  }

  function moveSelected(delta) {
    clampSelected();
    const i = selectedIndex;
    const j = i + delta;
    if (j < 0 || j >= lens.surfaces.length) return;
    if (isProtectedIndex(i) || isProtectedIndex(j)) return toast("Cannot move OBJ/IMS");
    const a = lens.surfaces[i];
    lens.surfaces[i] = lens.surfaces[j];
    lens.surfaces[j] = a;
    selectedIndex = j;
    buildTable();
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
  }

  function removeSelected() {
    clampSelected();
    if (isProtectedIndex(selectedIndex)) return toast("Cannot remove OBJ/IMS");
    lens.surfaces.splice(selectedIndex, 1);
    selectedIndex = Math.max(0, selectedIndex - 1);

    // repair: ensure single STOP + IMS last + OBJ first
    lens = sanitizeLens(lens);
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
  }

  function newClearLens() {
    loadLens({
      name: "Blank",
      surfaces: [
        { type: "OBJ", R: 0.0, t: 0.0, ap: 60.0, glass: "AIR", stop: false },
        { type: "STOP", R: 0.0, t: 20.0, ap: 8.0, glass: "AIR", stop: true },
        { type: "IMS", R: 0.0, t: 0.0, ap: 12.77, glass: "AIR", stop: false },
      ],
    });
    toast("New / Clear");
  }

  // -------------------- +ELEMENT MODAL --------------------
  const EL_UI_IDS = {
    modal: "#elementModal",
    source: "#elSource",
    stockPicker: "#elStockPicker",
    openStockLibrary: "#elOpenStockLibrary",
    stockModeToggle: "#elStockModeToggle",
    type: "#elType",
    mode: "#elMode",
    f: "#elF",
    ap: "#elAp",
    ct: "#elCt",
    gap: "#elGap",
    rear: "#elAir",
    form: "#elForm",
    g1: "#elGlass1",
    g2: "#elGlass2",
    note: "#elGlassNote",
    cancel: "#elClose",
    insert: "#elAdd",
  };

  const elUI = {
    modal: $(EL_UI_IDS.modal),
    source: $(EL_UI_IDS.source),
    stockPicker: $(EL_UI_IDS.stockPicker),
    openStockLibrary: $(EL_UI_IDS.openStockLibrary),
    stockModeToggle: $(EL_UI_IDS.stockModeToggle),
    type: $(EL_UI_IDS.type),
    mode: $(EL_UI_IDS.mode),
    f: $(EL_UI_IDS.f),
    ap: $(EL_UI_IDS.ap),
    ct: $(EL_UI_IDS.ct),
    gap: $(EL_UI_IDS.gap),
    rear: $(EL_UI_IDS.rear),
    form: $(EL_UI_IDS.form),
    g1: $(EL_UI_IDS.g1),
    g2: $(EL_UI_IDS.g2),
    note: $(EL_UI_IDS.note),
    cancel: $(EL_UI_IDS.cancel),
    insert: $(EL_UI_IDS.insert),
    front: null,
  };

  function modalExists() {
    return !!(elUI.modal && elUI.insert && elUI.cancel && elUI.type && elUI.mode && elUI.f && elUI.ap && elUI.ct);
  }

  function ensureFrontAirFieldInjected() {
    if (!modalExists()) return;
    if (elUI.front) return;

    const grid = elUI.modal.querySelector(".modalGrid");
    if (!grid) return;

    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `
      <label>Front air (mm)</label>
      <input id="elFrontAir" class="cellInput" type="number" step="0.01" value="0" />
    `;

    const rearField = elUI.rear?.closest(".field");
    if (rearField && rearField.parentElement === grid) grid.insertBefore(wrap, rearField);
    else grid.appendChild(wrap);

    elUI.front = wrap.querySelector("#elFrontAir");
  }

  function updateElementModalNote() {
    if (!elUI.note) return;
    const source = String(elUI.source?.value || "custom");
    if (source === "stock") {
      elUI.note.value = "Stock Element Library mode:\n- inserts locked purchasable catalog glass\n- radii/thickness/material/diameter/coating are read-only\n- tune Air Gap / Spacer After, order, and flip only\n- no OpenAI/API required";
      return;
    }
    const t = String(elUI.type?.value || "");
    const frontAir = Number(elUI.front?.value || 0);
    const gap = Number(elUI.gap?.value || 0);

    let msg = "";
    msg += `Front air: ${frontAir.toFixed(2)}mm (inserted as AIR surface before element)\n`;
    if (t === "achromat_cemented") msg += `Cemented achromat: 3 surfaces (no internal air gap)\n`;
    if (t === "achromat") msg += `Air-spaced achromat: 4 surfaces, internal gap = ${gap.toFixed(2)}mm\n`;
    msg += `Tip: displayed T/F# uses entrance pupil (not only physical stop radius)\n`;
    elUI.note.value = msg;
  }

  function updateElementSourceUI() {
    const source = String(elUI.source?.value || "custom");
    const stock = source === "stock";
    if (elUI.stockPicker) elUI.stockPicker.classList.toggle("hidden", !stock);
    [elUI.type, elUI.mode, elUI.form, elUI.f, elUI.ap, elUI.ct, elUI.gap, elUI.rear, elUI.g1, elUI.g2].forEach((node) => {
      const wrap = node?.closest?.(".field");
      if (wrap) wrap.classList.toggle("stockCustomHidden", stock);
    });
    if (elUI.insert) elUI.insert.textContent = stock ? "Open Stock Element Library" : "Insert element";
    updateElementModalNote();
  }

  function openElementModal() {
    if (!modalExists()) return false;
    ensureFrontAirFieldInjected();

    if (elUI.g1 && elUI.g2 && !elUI.g1.dataset._filled) {
      const keys = Object.keys(GLASS_DB);
      elUI.g1.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
      elUI.g2.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
      elUI.g1.value = "BK7";
      elUI.g2.value = "F2";
      elUI.g1.dataset._filled = "1";
    }

    if (elUI.f) elUI.f.value = Number(elUI.f.value || 50);
    if (elUI.ap) elUI.ap.value = Number(elUI.ap.value || 18);
    if (elUI.ct) elUI.ct.value = Number(elUI.ct.value || 4);
    if (elUI.gap) elUI.gap.value = Number(elUI.gap.value || 0.2);
    if (elUI.rear) elUI.rear.value = Number(elUI.rear.value || 4);
    if (elUI.front) elUI.front.value = Number(elUI.front.value || 0);

    [elUI.type, elUI.gap, elUI.front, elUI.source].forEach((x) => {
      if (!x || x.dataset._noteBound) return;
      x.addEventListener("input", updateElementModalNote);
      x.addEventListener("change", () => {
        if (x === elUI.source) updateElementSourceUI();
        else updateElementModalNote();
      });
      x.dataset._noteBound = "1";
    });
    updateElementSourceUI();

    elUI.modal.classList.remove("hidden");
    elUI.modal.style.pointerEvents = "auto";
    elUI.modal.style.opacity = "1";
    return true;
  }

  function closeElementModal() {
    if (!elUI.modal) return;
    elUI.modal.classList.add("hidden");
    elUI.modal.style.pointerEvents = "";
    elUI.modal.style.opacity = "";
  }

  function radiusForSymmetricSinglet(f, n) {
    return 2 * Math.max(0.01, (n - 1)) * Math.max(1e-3, f);
  }

  function buildSingletAuto({ f, ap, ct, rearAir, form, glass1 }) {
    const n = GLASS_DB[glass1]?.nd ?? 1.5168;
    const Rbase = radiusForSymmetricSinglet(f, n);

    let R1 = +Rbase;
    let R2 = -Rbase;

    if (form === "weakmeniscus") { R1 = +Rbase * 1.25; R2 = -Rbase * 1.05; }
    if (form === "plano") { R1 = 0.0; R2 = -Rbase * 1.6; }

    const chunk = [
      { type: "", R: R1, t: ct, ap, glass: glass1, stop: false },
      { type: "", R: R2, t: rearAir, ap, glass: "AIR", stop: false },
    ];
    clampAllApertures(chunk);
    return chunk;
  }

  function buildAchromatCementedAuto({ f, ap, ct, rearAir, form, glass1, glass2 }) {
    const n1 = GLASS_DB[glass1]?.nd ?? 1.5168;
    const n2 = GLASS_DB[glass2]?.nd ?? 1.62;

    const f1 = f * 0.85;
    const f2 = -f * 2.6;

    const R1b = radiusForSymmetricSinglet(f1, n1);
    const R3b = radiusForSymmetricSinglet(Math.abs(f2), n2);

    let R1 = +R1b;
    let R2 = -R1b * 0.85;
    let R3 = +R3b * 0.95;

    if (form === "weakmeniscus") { R1 *= 0.9; R2 *= 1.05; R3 *= 1.1; }
    if (form === "plano") { R1 = 0.0; R2 = -R1b * 1.35; R3 = +R3b * 1.05; }

    const chunk = [
      { type: "", R: R1, t: ct, ap, glass: glass1, stop: false },
      { type: "", R: R2, t: ct, ap, glass: glass2, stop: false },
      { type: "", R: R3, t: rearAir, ap, glass: "AIR", stop: false },
    ];
    clampAllApertures(chunk);
    return chunk;
  }

  function buildAchromatAirSpacedAuto({ f, ap, ct, gap, rearAir, form, glass1, glass2 }) {
    const f1 = f * 0.75;
    const f2 = -f * 2.2;

    const n1 = GLASS_DB[glass1]?.nd ?? 1.5168;
    const n2 = GLASS_DB[glass2]?.nd ?? 1.62;

    const R1b = radiusForSymmetricSinglet(f1, n1);
    const R2b = radiusForSymmetricSinglet(Math.abs(f2), n2);

    let R1 = +R1b;
    let R2 = -R1b * 0.9;
    let R3 = -R2b * 0.9;
    let R4 = +R2b;

    if (form === "weakmeniscus") { R1 *= 0.95; R2 *= 1.05; R3 *= 1.05; R4 *= 0.95; }
    if (form === "plano") { R1 = 0.0; R2 = -R1b * 1.4; R3 = -R2b * 0.9; R4 = +R2b * 1.1; }

    const g = Math.max(0.0, Number(gap || 0));

    const chunk = [
      { type: "", R: R1, t: ct, ap, glass: glass1, stop: false },
      { type: "", R: R2, t: g, ap, glass: "AIR", stop: false },
      { type: "", R: R3, t: ct, ap, glass: glass2, stop: false },
      { type: "", R: R4, t: rearAir, ap, glass: "AIR", stop: false },
    ];
    clampAllApertures(chunk);
    return chunk;
  }

  function readElementModalValues() {
    const f = Number(elUI.f?.value ?? 50);
    const ap = Number(elUI.ap?.value ?? 18);
    const ct = Number(elUI.ct?.value ?? 4);
    const gap = Number(elUI.gap?.value ?? 0);
    const rearAir = Number(elUI.rear?.value ?? 4);
    const frontAir = Number(elUI.front?.value ?? 0);

    const type = String(elUI.type?.value ?? "achromat").toLowerCase();
    const mode = String(elUI.mode?.value ?? "auto").toLowerCase();
    let form = String(elUI.form?.value ?? "symmetric").toLowerCase();
    if (form.includes("plano")) form = "plano";
    else if (form.includes("meniscus")) form = "weakmeniscus";
    else if (form.includes("biconvex")) form = "symmetric";

    const glass1 = String(elUI.g1?.value ?? "BK7");
    const glass2 = String(elUI.g2?.value ?? "F2");

    return { f, ap, ct, gap, rearAir, frontAir, type, mode, form, glass1, glass2 };
  }

  function insertElementFromModal() {
    if (String(elUI.source?.value || "custom") === "stock") {
      openStockLibraryModal();
      return "stock-library";
    }
    const v = readElementModalValues();

    const f = v.f;
    const ap = Math.max(0.1, v.ap);
    const ct = Math.max(0.05, v.ct);
    const gap = Math.max(0.0, v.gap);
    const rearAir = Math.max(0.0, v.rearAir);
    const frontAir = Math.max(0.0, v.frontAir);

    function maybeInsertFrontAir(insertAt) {
      if (frontAir <= 0) return insertAt;
      lens.surfaces.splice(insertAt, 0, { type: "", R: 0.0, t: frontAir, ap: ap, glass: "AIR", stop: false });
      return insertAt + 1;
    }

    if (v.type === "stop") {
      let insertAt = safeInsertAtAfterSelected();
      insertAt = maybeInsertFrontAir(insertAt);
      lens.surfaces.splice(insertAt, 0, { type: "STOP", R: 0.0, t: rearAir, ap, glass: "AIR", stop: true });
      selectedIndex = insertAt;
      enforceSingleStop(insertAt);
      buildTable(); applySensorToIMS(); renderAll(); scheduleRenderPreview();
      return;
    }

    if (v.type === "airgap") {
      let insertAt = safeInsertAtAfterSelected();
      insertAt = maybeInsertFrontAir(insertAt);
      lens.surfaces.splice(insertAt, 0, { type: "", R: 0.0, t: rearAir, ap, glass: "AIR", stop: false });
      selectedIndex = insertAt;
      buildTable(); applySensorToIMS(); renderAll(); scheduleRenderPreview();
      return;
    }

    if (v.mode !== "auto") {
      if (ui.footerWarn) ui.footerWarn.textContent = "Custom mode not implemented yet (auto only).";
      return;
    }

    let chunk = null;

    if (v.type === "achromat_cemented") {
      chunk = buildAchromatCementedAuto({ f, ap, ct, rearAir, form: v.form, glass1: v.glass1, glass2: v.glass2 });
    } else if (v.type.includes("achromat")) {
      chunk = buildAchromatAirSpacedAuto({ f, ap, ct, gap, rearAir, form: v.form, glass1: v.glass1, glass2: v.glass2 });
    } else {
      chunk = buildSingletAuto({ f, ap, ct, rearAir, form: v.form, glass1: v.glass1 });
    }

    if (!chunk || !Array.isArray(chunk) || chunk.length < 2) {
      if (ui.footerWarn) ui.footerWarn.textContent = "Element insert failed (check modal values).";
      return;
    }

    let insertAt = safeInsertAtAfterSelected();
    insertAt = maybeInsertFrontAir(insertAt);

    lens.surfaces.splice(insertAt, 0, ...chunk);
    selectedIndex = insertAt;

    buildTable();
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
  }

  if (modalExists()) {
    elUI.cancel.addEventListener("click", (e) => { e.preventDefault(); closeElementModal(); });
    elUI.insert.addEventListener("click", (e) => {
      e.preventDefault();
      const result = insertElementFromModal();
      if (result !== "stock-library") closeElementModal();
    });
    if (elUI.openStockLibrary) elUI.openStockLibrary.addEventListener("click", (e) => {
      e.preventDefault();
      openStockLibraryModal();
    });
    if (elUI.stockModeToggle) elUI.stockModeToggle.addEventListener("click", (e) => {
      e.preventDefault();
      setStockPrototypeMode(!lens?.stockPrototype?.enabled);
    });

    elUI.modal.addEventListener("mousedown", (e) => { if (e.target === elUI.modal) closeElementModal(); });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && elUI.modal && !elUI.modal.classList.contains("hidden")) closeElementModal();
    });
  }

  // -------------------- preview rendering --------------------
  function setPreviewProgress(p01, txt=""){
    const host = document.getElementById("previewProgress");
    const bar  = document.getElementById("previewProgressBar");
    const lab  = document.getElementById("previewProgressText");
    if (!host || !bar || !lab) return;
    host.style.display = "block";
    const p = Math.max(0, Math.min(1, p01));
    bar.style.transform = `scaleX(${p})`;
    lab.textContent = txt || `${Math.round(p*100)}%`;
  }
  function hidePreviewProgress(){
    const host = document.getElementById("previewProgress");
    if (host) host.style.display = "none";
  }

  function clamp(x,a,b){ return x < a ? a : (x > b ? b : x); }
  function srgbToLin(u){
    u /= 255;
    return (u <= 0.04045) ? (u/12.92) : Math.pow((u+0.055)/1.055, 2.4);
  }
  function linToSrgb(u){
    u = Math.max(0, Math.min(1, u));
    const v = (u <= 0.0031308) ? (12.92*u) : (1.055*Math.pow(u, 1/2.4) - 0.055);
    return Math.round(v*255);
  }

  function setNoUsableCircle(source = "") {
    preview.usableCircle = {
      valid: false,
      radiusMm: 0,
      diameterMm: 0,
      thresholdRel: USABLE_CIRCLE_THRESHOLD_REL,
      relAtCutoff: 0,
      source,
    };
    updateUsableCircleBadges();
  }

  function setUsableCircleFromRadialCurve(radialMm, gainCurve, source = "curve") {
    const n = Math.min(radialMm?.length || 0, gainCurve?.length || 0);
    if (n < 8) { setNoUsableCircle(source); return; }

    const r = [];
    const g = [];
    for (let i = 0; i < n; i++) {
      const ri = Number(radialMm[i]);
      const gi = Number(gainCurve[i]);
      if (!Number.isFinite(ri) || !Number.isFinite(gi)) continue;
      if (ri < 0) continue;
      r.push(ri);
      g.push(Math.max(0, gi));
    }
    if (r.length < 8) { setNoUsableCircle(source); return; }

    const m = r.length;
    const smoothed = new Float64Array(m);
    const halfWin = 3;
    for (let i = 0; i < m; i++) {
      let sum = 0;
      let cnt = 0;
      for (let k = -halfWin; k <= halfWin; k++) {
        const j = i + k;
        if (j < 0 || j >= m) continue;
        sum += g[j];
        cnt++;
      }
      smoothed[i] = cnt ? (sum / cnt) : g[i];
    }

    // Find a stable reference peak near the center region, then search outward.
    // This avoids tiny false IC when the exact chart center is dark.
    const peakSearchEnd = Math.max(3, Math.min(m - 1, Math.floor(m * 0.40)));
    let refIdx = 0;
    let ref = smoothed[0];
    for (let i = 1; i <= peakSearchEnd; i++) {
      if (smoothed[i] > ref) {
        ref = smoothed[i];
        refIdx = i;
      }
    }
    if (!(ref > 1e-9)) { setNoUsableCircle(source); return; }

    const rel = new Float64Array(m);
    for (let i = 0; i < m; i++) rel[i] = smoothed[i] / ref;
    rel[refIdx] = 1;
    for (let i = refIdx + 1; i < m; i++) {
      // enforce non-increasing falloff away from the reference peak
      rel[i] = Math.min(rel[i], rel[i - 1]);
    }

    const thr = USABLE_CIRCLE_THRESHOLD_REL;
    let cutR = r[m - 1];
    let relAtCut = rel[m - 1];

    for (let i = Math.max(refIdx + 1, 1); i < m; i++) {
      if (rel[i] > thr) continue;
      const g0 = rel[i - 1], g1 = rel[i];
      const r0 = r[i - 1], r1 = r[i];
      const denom = (g1 - g0);
      const t = Math.abs(denom) > 1e-9 ? clamp((thr - g0) / denom, 0, 1) : 0;
      cutR = r0 + (r1 - r0) * t;
      relAtCut = g0 + (g1 - g0) * t;
      break;
    }

    if (!(cutR > 0.1)) { setNoUsableCircle(source); return; }
    preview.usableCircle = {
      valid: true,
      radiusMm: cutR,
      diameterMm: cutR * 2,
      thresholdRel: thr,
      relAtCutoff: relAtCut,
      source,
    };
    updateUsableCircleBadges();
  }

  function setUsableCircleFromLUT(transCurve, naturalCurve, rMaxSensorMm, overscan = OV_DEFAULT) {
    const n = Math.min(transCurve?.length || 0, naturalCurve?.length || 0);
    if (n < 8 || !(rMaxSensorMm > 0)) { setNoUsableCircle("LUT"); return; }

    const rMm = new Float64Array(n);
    const gain = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? (i / (n - 1)) : 0;
      const rSensorMm = a * rMaxSensorMm;
      // world render can span overscan*sensor dimensions; ruler mm is in sensor-mm space
      rMm[i] = rSensorMm / Math.max(1e-6, overscan);
      gain[i] = Math.max(0, Number(transCurve[i]) * Number(naturalCurve[i]));
    }
    setUsableCircleFromRadialCurve(rMm, gain, "LUT");
  }

  const PREVIEW_AUTOFOCUS_DEFAULT_MODE = "chart-center";
  const PREVIEW_AUTOFOCUS_MODES = new Set([
    "chart-center",
    "chart-mid",
    "chart-edge",
    "chart-grid",
    "scene-center",
  ]);
  const PREVIEW_ORIENTATION_SET = new Set(["upright", "sensor-real"]);

  const PREVIEW_FOCUS_PUPIL_POINTS = [
    { y: 0.00, z: 0.00 },
    { y: 0.65, z: 0.00 },
    { y: -0.65, z: 0.00 },
    { y: 0.00, z: 0.65 },
    { y: 0.00, z: -0.65 },
    { y: 0.46, z: 0.46 },
    { y: -0.46, z: 0.46 },
    { y: 0.46, z: -0.46 },
    { y: -0.46, z: -0.46 },
    { y: 0.90, z: 0.00 },
    { y: -0.90, z: 0.00 },
    { y: 0.00, z: 0.90 },
    { y: 0.00, z: -0.90 },
  ];

  function getPreviewAutofocusMode() {
    const raw = String(
      ui.autoFocusMode?.value ??
      lens?.import_options?.autofocus_mode ??
      preview.focusAssist.mode ??
      PREVIEW_AUTOFOCUS_DEFAULT_MODE
    ).trim().toLowerCase();
    return PREVIEW_AUTOFOCUS_MODES.has(raw) ? raw : PREVIEW_AUTOFOCUS_DEFAULT_MODE;
  }

  function getPreviewOrientation() {
    const raw = String(ui.previewOrientation?.value || "upright").trim().toLowerCase();
    return PREVIEW_ORIENTATION_SET.has(raw) ? raw : "upright";
  }

  function getPreviewAutofocusSensorSamples(sensorHv, autofocusMode) {
    const h = Math.max(0, Number(sensorHv) || 0);
    if (autofocusMode === "chart-mid" && h > 1e-9) {
      return [{ sy: h * 0.55, sz: 0, w: 1.00, label: "mid" }];
    }
    if (autofocusMode === "chart-edge" && h > 1e-9) {
      return [{ sy: h * 0.80, sz: h * 0.80, w: 1.00, label: "edge" }];
    }
    if (autofocusMode === "chart-grid" && h > 1e-9) {
      return [
        { sy: 0,         sz: 0,         w: 1.00, label: "center" },
        { sy: -h * 0.45, sz: 0,         w: 0.70, label: "left" },
        { sy: h * 0.45,  sz: 0,         w: 0.70, label: "right" },
        { sy: 0,         sz: -h * 0.45, w: 0.70, label: "up" },
        { sy: 0,         sz: h * 0.45,  w: 0.70, label: "down" },
        { sy: h * 0.62,  sz: h * 0.62,  w: 0.55, label: "corner+" },
        { sy: -h * 0.62, sz: h * 0.62,  w: 0.55, label: "corner-" },
      ];
    }
    // chart-center + scene-center default to center-only focus target.
    return [{ sy: 0, sz: 0, w: 1.00, label: "center" }];
  }

  function evaluatePreviewSpotAtSensorPoint({
    surfaces,
    wavePreset,
    lensShift,
    sensorX,
    objDist,
    sy = 0,
    sz = 0,
  }) {
    computeVertices(surfaces, lensShift, sensorX);
    const sensorPlaneX = getSensorPlaneX(surfaces, sensorX);
    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
    const stopAp = Math.max(1e-6, getSurfaceOpticalAp(stopSurf));
    const xStop = Number(stopSurf?.vx || 0);
    const xObjPlane = Number(surfaces?.[0]?.vx || 0) - objDist;
    const startX = sensorPlaneX + 0.05;

    const hits = [];
    let raysUsed = 0;
    for (const p of PREVIEW_FOCUS_PUPIL_POINTS) {
      const py = p.y * stopAp;
      const pz = p.z * stopAp;
      const dir = normalize3({ x: xStop - startX, y: py - sy, z: pz - sz });
      const tr = traceRayReverse3D({ p: { x: startX, y: sy, z: sz }, d: dir }, surfaces, wavePreset);
      raysUsed++;
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;
      const hitObj = intersectPlaneX3D(tr.endRay, xObjPlane);
      if (!hitObj) continue;
      hits.push(hitObj);
    }

    const hitRate = raysUsed > 0 ? (hits.length / raysUsed) : 0;
    if (hits.length < 4) {
      return {
        ok: false,
        sensorPlaneX,
        rmsMm: null,
        hitRate,
        raysUsed,
        validHits: hits.length,
        centroidY: null,
        centroidZ: null,
      };
    }

    const centroidY = hits.reduce((s, h) => s + h.y, 0) / hits.length;
    const centroidZ = hits.reduce((s, h) => s + h.z, 0) / hits.length;
    const rmsMm = Math.sqrt(
      hits.reduce((acc, h) => acc + (h.y - centroidY) ** 2 + (h.z - centroidZ) ** 2, 0) / hits.length
    );
    return {
      ok: true,
      sensorPlaneX,
      rmsMm,
      hitRate,
      raysUsed,
      validHits: hits.length,
      centroidY,
      centroidZ,
    };
  }

  function evaluatePreviewFocusAtSensorX({
    surfaces,
    wavePreset,
    lensShift,
    sensorX,
    objDist,
    sensorHv,
    autofocusMode = PREVIEW_AUTOFOCUS_DEFAULT_MODE,
  }) {
    const mode = PREVIEW_AUTOFOCUS_MODES.has(String(autofocusMode || "").toLowerCase())
      ? String(autofocusMode).toLowerCase()
      : PREVIEW_AUTOFOCUS_DEFAULT_MODE;

    const sensorSamples = getPreviewAutofocusSensorSamples(sensorHv, mode);

    let weightedRms = 0;
    let weightSum = 0;
    let totalHits = 0;
    let totalRays = 0;
    let sensorPlaneX = null;

    for (let fi = 0; fi < sensorSamples.length; fi++) {
      const sample = sensorSamples[fi];
      const spot = evaluatePreviewSpotAtSensorPoint({
        surfaces,
        wavePreset,
        lensShift,
        sensorX,
        objDist,
        sy: sample.sy,
        sz: sample.sz,
      });
      if (!Number.isFinite(sensorPlaneX) && Number.isFinite(spot?.sensorPlaneX)) {
        sensorPlaneX = Number(spot.sensorPlaneX);
      }
      totalRays += Number(spot?.raysUsed || 0);
      totalHits += Number(spot?.validHits || 0);
      if (!spot?.ok || !Number.isFinite(spot?.rmsMm)) continue;
      weightedRms += Number(spot.rmsMm) * sample.w;
      weightSum += sample.w;
    }

    const hitRate = totalRays > 0 ? (totalHits / totalRays) : 0;
    if (!(weightSum > 0) || hitRate < 0.30) {
      return {
        score: Infinity,
        rmsMm: null,
        hitRate,
        sensorPlaneX: Number.isFinite(sensorPlaneX) ? sensorPlaneX : null,
        raysUsed: totalRays,
        validHits: totalHits,
        sampleCount: sensorSamples.length,
        autofocusMode: mode,
      };
    }

    const rmsMm = weightedRms / weightSum;
    const penalty = (hitRate < 0.95) ? (1 + (0.95 - hitRate) * 4) : 1;
    return {
      score: rmsMm * penalty,
      rmsMm,
      hitRate,
      sensorPlaneX: Number.isFinite(sensorPlaneX) ? sensorPlaneX : null,
      raysUsed: totalRays,
      validHits: totalHits,
      sampleCount: sensorSamples.length,
      autofocusMode: mode,
    };
  }

  function autoFocusPreviewSensorForObjectDistance({
    surfaces,
    wavePreset,
    lensShift,
    sensorX,
    objDist,
    sensorHv,
    autofocusMode = PREVIEW_AUTOFOCUS_DEFAULT_MODE,
  }) {
    const objDistMm = Number(objDist);
    const sensorHvMm = Number(sensorHv);
    if (!Number.isFinite(objDistMm) || objDistMm <= 0.1) {
      return {
        sensorX,
        sensorPlaneX: null,
        deltaMm: 0,
        rmsMm: null,
        hitRate: null,
        raysUsed: 0,
        xObjPlaneMm: null,
        startRayXMm: null,
        stopXMm: null,
        method: "preview_af_invalid_target",
      };
    }

    const mode = PREVIEW_AUTOFOCUS_MODES.has(String(autofocusMode || "").toLowerCase())
      ? String(autofocusMode).toLowerCase()
      : PREVIEW_AUTOFOCUS_DEFAULT_MODE;
    preview.focusAssist.mode = mode;

    const keyParts = [
      mode,
      wavePreset,
      objDistMm.toFixed(6),
      Number.isFinite(sensorHvMm) ? sensorHvMm.toFixed(6) : "nan",
      lensShift.toFixed(6),
      String(surfaces?.length || 0),
      ...((surfaces || []).map((s) => [
        String(s?.type || ""),
        Number(s?.R || 0).toFixed(6),
        Number(s?.t || 0).toFixed(6),
        Number(getSurfaceOpticalAp(s)).toFixed(6),
        String(s?.glass || "AIR"),
        s?.stop ? "1" : "0",
      ].join(","))),
    ];
    const key = keyParts.join("|");

    if (preview.focusAssist.cacheKey === key && Number.isFinite(preview.focusAssist.sensorX)) {
      const cached = Number(preview.focusAssist.sensorX);
      const m = preview.focusAssist.metrics || null;
      computeVertices(surfaces, lensShift, cached);
      const sensorPlaneXCached = getSensorPlaneX(surfaces, cached);
      const stopIdxCached = findStopSurfaceIndex(surfaces);
      const stopSurfCached = stopIdxCached >= 0 ? surfaces[stopIdxCached] : surfaces[0];
      const xObjPlaneCached = Number(surfaces?.[0]?.vx || 0) - objDistMm;
      const startXCached = sensorPlaneXCached + 0.05;
      const xStopCached = Number(stopSurfCached?.vx || 0);
      return {
        sensorX: cached,
        sensorPlaneX: sensorPlaneXCached,
        deltaMm: cached - sensorX,
        rmsMm: Number.isFinite(Number(m?.rmsMm)) ? Number(m.rmsMm) : null,
        hitRate: Number.isFinite(Number(m?.hitRate)) ? Number(m.hitRate) : null,
        raysUsed: Number.isFinite(Number(m?.raysUsed)) ? Number(m.raysUsed) : 0,
        xObjPlaneMm: xObjPlaneCached,
        startRayXMm: startXCached,
        stopXMm: xStopCached,
        method: "preview_af_cached",
      };
    }

    const efl = estimateEflBflParaxial(surfaces, wavePreset).efl;
    const range = Math.max(2, Math.min(36, Number.isFinite(efl) && efl > 0 ? efl * 0.26 : 16));
    const coarseStep = Math.max(0.35, range / 12);
    const fineStep = Math.max(0.05, coarseStep / 6);

    let iterations = 0;
    let stoppedByMaxIterations = false;
    const evaluateAtSensorX = (xMm) => {
      if (iterations >= MAX_AUTOFOCUS_ITERATIONS) {
        stoppedByMaxIterations = true;
        return null;
      }
      iterations++;
      return evaluatePreviewFocusAtSensorX({
        surfaces, wavePreset, lensShift, sensorX: xMm, objDist: objDistMm, sensorHv: sensorHvMm, autofocusMode: mode,
      });
    };

    let bestX = Number.isFinite(Number(sensorX)) ? Number(sensorX) : 0;
    let best = evaluateAtSensorX(bestX);
    if (!best || !Number.isFinite(Number(best.score))) {
      return {
        sensorX: bestX,
        sensorPlaneX: null,
        deltaMm: 0,
        rmsMm: null,
        hitRate: null,
        raysUsed: 0,
        method: "preview_af_search",
        iterations,
        stoppedByMaxIterations,
      };
    }

    const searchCenterX = bestX;
    for (let x = searchCenterX - range; x <= searchCenterX + range + 1e-9; x += coarseStep) {
      const ev = evaluateAtSensorX(x);
      if (!ev) break;
      if (ev.score < best.score) {
        best = ev;
        bestX = x;
      }
    }

    for (let x = bestX - coarseStep; x <= bestX + coarseStep + 1e-9; x += fineStep) {
      const ev = evaluateAtSensorX(x);
      if (!ev) break;
      if (ev.score < best.score) {
        best = ev;
        bestX = x;
      }
    }

    preview.focusAssist.cacheKey = key;
    preview.focusAssist.sensorX = bestX;
    preview.focusAssist.metrics = best;
    computeVertices(surfaces, lensShift, bestX);
    const bestSensorPlaneX = getSensorPlaneX(surfaces, bestX);
    const stopIdxBest = findStopSurfaceIndex(surfaces);
    const stopSurfBest = stopIdxBest >= 0 ? surfaces[stopIdxBest] : surfaces[0];
    const xObjPlaneBest = Number(surfaces?.[0]?.vx || 0) - objDistMm;
    const startXBest = bestSensorPlaneX + 0.05;
    const xStopBest = Number(stopSurfBest?.vx || 0);
    const debugKey = `${key}|${bestX.toFixed(6)}|${Number(best?.rmsMm || 0).toFixed(6)}|${Number(best?.hitRate || 0).toFixed(4)}`;
    if (preview.focusAssist.debugKey !== debugKey) {
      preview.focusAssist.debugKey = debugKey;
      console.log("[autofocus:chart]", {
        mode,
        targetChartDistanceMm: objDistMm,
        raysUsed: Number(best?.raysUsed || 0),
        xObjPlaneMm: xObjPlaneBest,
        startRayXMm: startXBest,
        stopXMm: xStopBest,
        previousSensorShiftMm: sensorX,
        bestSensorShiftMm: bestX,
        bestSensorPositionMm: bestSensorPlaneX,
        bestMetricRmsMm: Number.isFinite(best?.rmsMm) ? best.rmsMm : null,
        hitRate: Number.isFinite(best?.hitRate) ? best.hitRate : null,
      });
    }

    return {
      sensorX: bestX,
      sensorPlaneX: bestSensorPlaneX,
      deltaMm: bestX - sensorX,
      rmsMm: best.rmsMm,
      hitRate: best.hitRate,
      raysUsed: best.raysUsed,
      xObjPlaneMm: xObjPlaneBest,
      startRayXMm: startXBest,
      stopXMm: xStopBest,
      method: "preview_af_search",
      iterations,
      stoppedByMaxIterations,
    };
  }

  function estimatePreviewObjectHalfHeightFromChief({
    surfaces,
    wavePreset,
    sensorX,
    xStop,
    xObjPlane,
    sensorWv,
    sensorHv,
    imgAsp,
  }) {
    if (!Array.isArray(surfaces) || !surfaces.length) return null;
    if (!(sensorWv > 0) || !(sensorHv > 0) || !(imgAsp > 0)) return null;

    const startX = sensorX + 0.05;
    const points = [
      { sx: -sensorWv * 0.5, sy: -sensorHv * 0.5 },
      { sx: 0,               sy: -sensorHv * 0.5 },
      { sx: sensorWv * 0.5,  sy: -sensorHv * 0.5 },
      { sx: -sensorWv * 0.5, sy: 0 },
      { sx: 0,               sy: 0 },
      { sx: sensorWv * 0.5,  sy: 0 },
      { sx: -sensorWv * 0.5, sy: sensorHv * 0.5 },
      { sx: 0,               sy: sensorHv * 0.5 },
      { sx: sensorWv * 0.5,  sy: sensorHv * 0.5 },
    ];

    let maxObjX = 0;
    let maxObjY = 0;
    let used = 0;

    for (const pt of points) {
      const pS = { x: startX, y: pt.sx, z: pt.sy };
      const dir = normalize3({ x: xStop - startX, y: -pt.sx, z: -pt.sy });
      const tr = traceRayReverse3D({ p: pS, d: dir }, surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;
      const hitObj = intersectPlaneX3D(tr.endRay, xObjPlane);
      if (!hitObj) continue;
      maxObjX = Math.max(maxObjX, Math.abs(hitObj.y));
      maxObjY = Math.max(maxObjY, Math.abs(hitObj.z));
      used++;
    }

    if (used < 3) return null;
    const halfObjH = Math.max(maxObjY, maxObjX / imgAsp);
    if (!(halfObjH > 1e-9)) return null;

    return { halfObjH: halfObjH * 1.03, used };
  }

  function setUsableCircleFromRenderedPixels(outD, W, H, sensorW, sensorH) {
    const baseCircle = (preview.usableCircle && preview.usableCircle.valid)
      ? { ...preview.usableCircle }
      : null;

    if (!outD || !(W > 0) || !(H > 0) || !(sensorW > 0) || !(sensorH > 0)) {
      setNoUsableCircle("pixels");
      return;
    }

    const halfDiagMm = Math.hypot(sensorW, sensorH) * 0.5;
    if (!(halfDiagMm > 0)) { setNoUsableCircle("pixels"); return; }

    const bins = Math.max(96, Math.min(420, Math.round(halfDiagMm * 14)));
    const sum = new Float64Array(bins);
    const cnt = new Uint32Array(bins);

    for (let py = 0; py < H; py++) {
      const yMm = (0.5 - (py + 0.5) / H) * sensorH;
      for (let px = 0; px < W; px++) {
        const xMm = ((px + 0.5) / W - 0.5) * sensorW;
        const rMm = Math.hypot(xMm, yMm);
        const b = Math.min(bins - 1, Math.max(0, Math.floor((rMm / halfDiagMm) * (bins - 1))));
        const o = (py * W + px) * 4;
        const rr = outD[o] / 255;
        const gg = outD[o + 1] / 255;
        const bb = outD[o + 2] / 255;
        const lum = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
        // Penalize clearly blue-dominant fringe, but keep neutral chart detail stable.
        const blueDom = Math.max(0, bb - Math.max(rr, gg));
        const usableScore = lum * (1 - 0.65 * blueDom);
        sum[b] += usableScore;
        cnt[b]++;
      }
    }

    const rCurve = [];
    const gCurve = [];
    for (let b = 0; b < bins; b++) {
      if (cnt[b] < 8) continue;
      rCurve.push(((b + 0.5) / bins) * halfDiagMm);
      gCurve.push(sum[b] / cnt[b]);
    }
    setUsableCircleFromRadialCurve(rCurve, gCurve, "pixels");

    if (baseCircle && baseCircle.valid) {
      if (!preview.usableCircle.valid) {
        preview.usableCircle = baseCircle;
        updateUsableCircleBadges();
      } else if (preview.usableCircle.radiusMm > baseCircle.radiusMm) {
        preview.usableCircle = baseCircle;
        updateUsableCircleBadges();
      }
    }
  }

 function performRenderPreview() {
  if (!renderEngineEnabled) {
    hidePreviewProgress();
    finishPreviewRender();
    return;
  }
  if (!pctx || !previewCanvasEl) {
    finishPreviewRender();
    return;
  }
  syncActiveZoomConfigFromUI();
  if (!preview.worldCtx) preview.worldCtx = preview.worldCanvas.getContext("2d");
  const jobId = ++_previewRenderJobId;
  setNoUsableCircle("pending");

  const doCA  = !!document.getElementById("optCA")?.checked;
  const q     = String(document.getElementById("renderQuality")?.value || "normal");
  const previewOrientation = getPreviewOrientation();
  const previewModeRaw = String(ui.previewRenderMode?.value || "").trim().toLowerCase();
  const previewMode = (previewModeRaw === "quality" || previewModeRaw === "fast")
    ? previewModeRaw
    : (document.getElementById("optDOF")?.checked ? "quality" : "fast");
  const requestedPupilSamples = Math.round(Number(ui.pupilSamples?.value));
  const sppFallback = (q === "hq" ? 64 : (q === "draft" ? 12 : 28));
  const spp = previewMode === "quality"
    ? clamp(Number.isFinite(requestedPupilSamples) ? requestedPupilSamples : sppFallback, 8, 128)
    : 1;
  const lutPupilSqrt = (q === "hq" ? 16 : (q === "draft" ? 10 : 14));

  const wavePreset = ui.wavePreset?.value || "d";
  const focusChartDistanceMm = getFocusChartDistanceMm() ?? 2000;
  const focusCtx = getFocusContext({
    objectDistanceMm: focusChartDistanceMm,
    wavePreset,
    allowAutoRefocus: true,
  });
  const sensorShift = focusCtx.sensorX;
  const lensShift = focusCtx.lensShift;

  computeVertices(lens.surfaces, lensShift, sensorShift);
  let sensorX = getSensorPlaneX(lens.surfaces, sensorShift);

  const { w: sensorW, h: sensorH } = getSensorWH();

  let stopIdx = findStopSurfaceIndex(lens.surfaces);
  let stopSurf = stopIdx >= 0 ? lens.surfaces[stopIdx] : lens.surfaces[0];
  let xStop = Number(stopSurf?.vx || 0);
  let stopAp = Math.max(1e-6, getSurfaceOpticalAp(stopSurf));

  let xObjPlane = (lens.surfaces[0]?.vx ?? 0) - focusChartDistanceMm;

  const previewParaxFocused = estimateEflBflParaxial(lens.surfaces, wavePreset);
  let previewParax = previewParaxFocused;
  let previewParaxSource = "focused";
  if (!Number.isFinite(Number(previewParax?.efl))) {
    const nominalForParax = clone(lens.surfaces);
    computeVertices(nominalForParax, 0, 0);
    const previewParaxNominal = estimateEflBflParaxial(nominalForParax, wavePreset);
    if (Number.isFinite(Number(previewParaxNominal?.efl))) {
      previewParax = previewParaxNominal;
      previewParaxSource = "nominal_fallback";
    }
  }
  if (!Number.isFinite(Number(previewParax?.efl))) {
    resizePreviewCanvasToCSS();
    const rc = previewCanvasEl.getBoundingClientRect();
    pctx.clearRect(0, 0, rc.width, rc.height);
    pctx.fillStyle = "rgba(0,0,0,0.92)";
    pctx.fillRect(0, 0, rc.width, rc.height);
    pctx.fillStyle = "rgba(255,255,255,0.9)";
    pctx.font = "600 16px var(--font-main, sans-serif)";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText("No valid optical trace yet", rc.width * 0.5, rc.height * 0.5);
    console.warn("[preview-black]", {
      reason: "no_valid_optical_trace",
      efl: previewParax?.efl ?? null,
      bfl: previewParax?.bfl ?? null,
      paraxialSource: previewParaxSource,
      lensShift,
      sensorShift,
      activeZoomConfig: Number.isFinite(Number(lens?.zoom?.activeConfig)) ? Number(lens.zoom.activeConfig) : null,
      activeZoomLabel: String(lens?.zemax?.currentConfigLabel || "—"),
    });
    hidePreviewProgress();
    finishPreviewRender();
    return;
  }

  const baseRaw = Number(ui.prevRes?.value || 720);
  const base = Math.max(64, Number.isFinite(baseRaw) ? baseRaw : 720);
  const aspect = sensorW / sensorH;
  const W = Math.max(64, Math.round(base * aspect));
  const H = Math.max(64, base);

  const previewOverscan = OV_DEFAULT;
  const sensorWv = sensorW * previewOverscan;
  const sensorHv = sensorH * previewOverscan;
  const halfWv = sensorWv * 0.5;
  const halfHv = sensorHv * 0.5;
  const rMaxSensor = Math.hypot(halfWv, halfHv);

  const hasImg = !!(preview.ready && preview.imgData && preview.imgCanvas.width > 0 && preview.imgCanvas.height > 0);
  const imgW = preview.imgCanvas.width;
  const imgH = preview.imgCanvas.height;
  const imgData = hasImg ? preview.imgData : null;
  const autoFill = !!ui.previewAutoFit?.checked;
  const previewRenderKey = JSON.stringify({
    mode: previewMode,
    q,
    doCA,
    spp,
    lutPupilSqrt,
    wavePreset,
    focusChartDistanceMm,
    focusMode: focusCtx.focusMode,
    focusMechanism: focusCtx.focusMechanism,
    focusShiftMm: Number(focusCtx.focusShiftMm).toFixed(6),
    sensorW: Number(sensorW).toFixed(6),
    sensorH: Number(sensorH).toFixed(6),
    res: Number(base).toFixed(3),
    autoFill,
    orientation: previewOrientation,
    objW: String(ui.prevObjW?.value || ""),
    objH: String(ui.prevObjH?.value || ""),
    imgW,
    imgH,
    sourceMode: preview.sourceMode,
    surfaces: (lens.surfaces || []).map((s) => [
      String(s?.type || ""),
      Number(s?.R ?? 0).toFixed(6),
      Number(s?.t ?? 0).toFixed(6),
      Number(s?.ap ?? 0).toFixed(6),
      Number(s?.ap_optical ?? s?.ap ?? 0).toFixed(6),
      String(s?.glass || "AIR"),
      s?.stop ? 1 : 0,
    ]),
  });
  if (!_forcePreviewRender && preview.worldReady && preview.dirtyKey === previewRenderKey) {
    drawPreviewViewport();
    finishPreviewRender();
    return;
  }
  _forcePreviewRender = false;
  preview.dirtyKey = previewRenderKey;

  let focusInfo = {
    sensorX,
    deltaMm: 0,
    rmsMm: null,
    hitRate: null,
    method: `preview_focus_${focusCtx.focusMode}`,
  };
  if (Number.isFinite(focusChartDistanceMm) && focusChartDistanceMm > 0.1 && focusChartDistanceMm < 1e8) {
    const autofocusMode = getPreviewAutofocusMode();
    const ev = evaluatePreviewFocusAtSensorX({
      surfaces: lens.surfaces,
      wavePreset,
      lensShift,
      sensorX: sensorShift,
      objDist: focusChartDistanceMm,
      sensorHv,
      autofocusMode,
    });
    const evSensorX = Number.isFinite(Number(ev?.sensorPlaneX)) ? Number(ev.sensorPlaneX) : sensorX;
    focusInfo = {
      sensorX: evSensorX,
      deltaMm: 0,
      rmsMm: Number.isFinite(ev?.rmsMm) ? Number(ev.rmsMm) : null,
      hitRate: Number.isFinite(ev?.hitRate) ? Number(ev.hitRate) : null,
      method: focusCtx.autoRun?.ok
        ? `preview_focus_eval_only (auto ${focusCtx.focusMechanism})`
        : "preview_focus_eval_only",
    };
  }

  if (focusCtx.autoRun?.ok) _renderAllAfterPreview = true;
  const metricTxt = Number.isFinite(focusCtx?.autoRun?.bestMetricRmsMm)
    ? `auto metric ${Number(focusCtx.autoRun.bestMetricRmsMm).toFixed(4)}mm`
    : "";
  updateFocusShiftStatus(metricTxt);

  preview.debug.focusDeltaMm = Number.isFinite(focusInfo?.deltaMm) ? focusInfo.deltaMm : null;
  preview.debug.spotRmsMm = Number.isFinite(focusInfo?.rmsMm) ? focusInfo.rmsMm : null;
  preview.debug.spotRmsPx = null;
  preview.debug.kernelPx = null;
  preview.debug.mmPerPx = (H > 0) ? (sensorH / H) : null;
  preview.debug.method = `${String(focusInfo?.method || "")} • ${previewMode}${previewMode === "quality" ? ` • spp=${spp}` : ""}`;
  preview.debug.centerRmsMm = null;
  preview.debug.centerRmsPx = null;
  preview.debug.centerHitRate = null;
  preview.debug.midRmsMm = null;
  preview.debug.midRmsPx = null;
  preview.debug.midHitRate = null;
  preview.debug.cornerRmsMm = null;
  preview.debug.cornerRmsPx = null;
  preview.debug.cornerHitRate = null;
  preview.debug.bestFocusCenterShiftMm = null;
  preview.debug.bestFocusCornerShiftMm = null;
  preview.debug.fieldCurvatureDeltaMm = null;

  function sample(u, v) {
    if (!hasImg) return [255, 255, 255, 255];
    if (autoFill) {
      u = clamp(u, 0, 1);
      v = clamp(v, 0, 1);
    } else if (u < 0 || u > 1 || v < 0 || v > 1) {
      return [0, 0, 0, 255];
    }

    const x = u * (imgW - 1);
    const y = v * (imgH - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(imgW - 1, x0 + 1);
    const y1 = Math.min(imgH - 1, y0 + 1);
    const tx = x - x0, ty = y - y0;

    function px(ix, iy) {
      const o = (iy * imgW + ix) * 4;
      return [imgData[o], imgData[o + 1], imgData[o + 2], imgData[o + 3]];
    }

    const c00 = px(x0, y0), c10 = px(x1, y0), c01 = px(x0, y1), c11 = px(x1, y1);
    const lerp = (a, b, t) => a + (b - a) * t;

    const c0 = c00.map((v0, i) => lerp(v0, c10[i], tx));
    const c1 = c01.map((v0, i) => lerp(v0, c11[i], tx));
    return c0.map((v0, i) => lerp(v0, c1[i], ty));
  }

  const imgAsp = hasImg ? (imgW / imgH) : (16 / 9);
  const objHManual = Number(ui.prevObjH?.value || 1650);
  const objWManual = Number(ui.prevObjW?.value || (objHManual * imgAsp));
  const autoFitObj = autoFill
    ? estimatePreviewObjectHalfHeightFromChief({
        surfaces: lens.surfaces,
        wavePreset,
        sensorX,
        xStop,
        xObjPlane,
        sensorWv,
        sensorHv,
        imgAsp,
      })
    : null;
  const halfObjH = (autoFitObj && Number.isFinite(autoFitObj.halfObjH) && autoFitObj.halfObjH > 1e-6)
    ? autoFitObj.halfObjH
    : Math.max(1e-3, objHManual * 0.5);
  const halfObjW = autoFill
    ? (halfObjH * imgAsp)
    : Math.max(1e-3, objWManual * 0.5);
  if (autoFill && autoFitObj && Number.isFinite(autoFitObj.halfObjH) && autoFitObj.halfObjH > 1e-6) {
    setAutoObjectSizeMm(halfObjW * 2, halfObjH * 2);
  }

  function objectMmToUV(xmm, ymm) {
    const u = 0.5 + (xmm / (2 * halfObjW));
    const v = 0.5 - (ymm / (2 * halfObjH));
    return { u, v };
  }

  function objectHitToPreviewUV(xmm, ymm) {
    let x = Number(xmm) || 0;
    let y = Number(ymm) || 0;
    if (previewOrientation === "upright") {
      x = -x;
      y = -y;
    }
    return objectMmToUV(x, y);
  }

  function rmsMmToPreviewPx(rmsMm) {
    const mm = Number(rmsMm);
    if (!Number.isFinite(mm)) return null;
    const pxPerMmX = W / Math.max(1e-9, 2 * halfObjW);
    const pxPerMmY = H / Math.max(1e-9, 2 * halfObjH);
    const pxPerMm = Math.sqrt(pxPerMmX * pxPerMmY);
    return mm * pxPerMm;
  }

  function findBestSensorShiftForSpot({ sy = 0, sz = 0, startShift = sensorShift }) {
    const efl = estimateEflBflParaxial(lens.surfaces, wavePreset).efl;
    const range = Math.max(1.5, Math.min(18, Number.isFinite(efl) && efl > 0 ? efl * 0.16 : 8));
    const coarseStep = Math.max(0.25, range / 10);
    const fineStep = Math.max(0.05, coarseStep / 6);

    let bestShift = Number(startShift) || 0;
    let iterations = 0;
    const evaluateSpotAtShift = (xMm) => {
      if (iterations >= MAX_AUTOFOCUS_ITERATIONS) return null;
      iterations++;
      return evaluatePreviewSpotAtSensorPoint({
        surfaces: lens.surfaces,
        wavePreset,
        lensShift,
        sensorX: xMm,
        objDist: focusChartDistanceMm,
        sy,
        sz,
      });
    };
    let best = evaluateSpotAtShift(bestShift);
    if (!best) {
      return {
        bestShiftMm: bestShift,
        bestRmsMm: null,
        bestSensorPlaneX: null,
      };
    }

    for (let x = bestShift - range; x <= bestShift + range + 1e-9; x += coarseStep) {
      const ev = evaluateSpotAtShift(x);
      if (!ev) break;
      const evRms = Number(ev?.rmsMm);
      const bestRms = Number(best?.rmsMm);
      if (Number.isFinite(evRms) && (!Number.isFinite(bestRms) || evRms < bestRms)) {
        best = ev;
        bestShift = x;
      }
    }

    for (let x = bestShift - coarseStep; x <= bestShift + coarseStep + 1e-9; x += fineStep) {
      const ev = evaluateSpotAtShift(x);
      if (!ev) break;
      const evRms = Number(ev?.rmsMm);
      const bestRms = Number(best?.rmsMm);
      if (Number.isFinite(evRms) && (!Number.isFinite(bestRms) || evRms < bestRms)) {
        best = ev;
        bestShift = x;
      }
    }

    return {
      bestShiftMm: bestShift,
      bestRmsMm: Number.isFinite(best?.rmsMm) ? Number(best.rmsMm) : null,
      bestSensorPlaneX: Number.isFinite(best?.sensorPlaneX) ? Number(best.sensorPlaneX) : null,
    };
  }

  function updatePreviewFieldSpotDebug() {
    const halfW = sensorW * 0.5;
    const halfH = sensorH * 0.5;

    let midSy = halfW * 0.55;
    let midSz = 0;
    let cornerSy = halfW * 0.92;
    let cornerSz = halfH * 0.92;

    if (ui.useZemaxFields?.checked && Array.isArray(lens?.zemax?.fields) && lens.zemax.fields.length > 1) {
      const angs = lens.zemax.fields
        .map((f) => Math.abs(Number(f?.angleDeg)))
        .filter((v) => Number.isFinite(v));
      const maxA = angs.length ? Math.max(...angs) : 0;
      if (maxA > 1e-9) {
        const sorted = [...angs].sort((a, b) => a - b);
        const midA = sorted[Math.floor(sorted.length * 0.5)] || (0.5 * maxA);
        const midFrac = clamp(midA / maxA, 0, 1);
        const cornerFrac = clamp(1.0, 0, 1);
        midSy = halfW * midFrac;
        midSz = 0;
        cornerSy = halfW * cornerFrac * 0.98;
        cornerSz = halfH * cornerFrac * 0.98;
      }
    }

    const center = evaluatePreviewSpotAtSensorPoint({
      surfaces: lens.surfaces,
      wavePreset,
      lensShift,
      sensorX: sensorShift,
      objDist: focusChartDistanceMm,
      sy: 0,
      sz: 0,
    });
    const mid = evaluatePreviewSpotAtSensorPoint({
      surfaces: lens.surfaces,
      wavePreset,
      lensShift,
      sensorX: sensorShift,
      objDist: focusChartDistanceMm,
      sy: midSy,
      sz: midSz,
    });
    const corner = evaluatePreviewSpotAtSensorPoint({
      surfaces: lens.surfaces,
      wavePreset,
      lensShift,
      sensorX: sensorShift,
      objDist: focusChartDistanceMm,
      sy: cornerSy,
      sz: cornerSz,
    });

    preview.debug.centerRmsMm = Number.isFinite(center?.rmsMm) ? Number(center.rmsMm) : null;
    preview.debug.centerRmsPx = Number.isFinite(preview.debug.centerRmsMm) ? rmsMmToPreviewPx(preview.debug.centerRmsMm) : null;
    preview.debug.centerHitRate = Number.isFinite(center?.hitRate) ? Number(center.hitRate) : null;
    preview.debug.midRmsMm = Number.isFinite(mid?.rmsMm) ? Number(mid.rmsMm) : null;
    preview.debug.midRmsPx = Number.isFinite(preview.debug.midRmsMm) ? rmsMmToPreviewPx(preview.debug.midRmsMm) : null;
    preview.debug.midHitRate = Number.isFinite(mid?.hitRate) ? Number(mid.hitRate) : null;
    preview.debug.cornerRmsMm = Number.isFinite(corner?.rmsMm) ? Number(corner.rmsMm) : null;
    preview.debug.cornerRmsPx = Number.isFinite(preview.debug.cornerRmsMm) ? rmsMmToPreviewPx(preview.debug.cornerRmsMm) : null;
    preview.debug.cornerHitRate = Number.isFinite(corner?.hitRate) ? Number(corner.hitRate) : null;

    const centerBest = findBestSensorShiftForSpot({ sy: 0, sz: 0, startShift: sensorShift });
    const cornerBest = findBestSensorShiftForSpot({ sy: cornerSy, sz: cornerSz, startShift: sensorShift });
    preview.debug.bestFocusCenterShiftMm = Number.isFinite(centerBest?.bestShiftMm) ? Number(centerBest.bestShiftMm) : null;
    preview.debug.bestFocusCornerShiftMm = Number.isFinite(cornerBest?.bestShiftMm) ? Number(cornerBest.bestShiftMm) : null;
    preview.debug.fieldCurvatureDeltaMm = (
      Number.isFinite(preview.debug.bestFocusCenterShiftMm) &&
      Number.isFinite(preview.debug.bestFocusCornerShiftMm)
    ) ? (preview.debug.bestFocusCornerShiftMm - preview.debug.bestFocusCenterShiftMm) : null;

    // Restore current preview pose after spot diagnostics (helper traces move vertices).
    computeVertices(lens.surfaces, lensShift, sensorShift);
  }

  function naturalCos4(rS) {
    const dirChief0 = normalize3({ x: xStop - (sensorX + 0.05), y: -rS, z: 0 });
    const cosT = clamp(Math.abs(dirChief0.x), 0, 1);
    return Math.pow(cosT, 4);
  }

  function samplePupilDisk(u, v) {
    // Shirley/Chiu concentric mapping
    const a = (u * 2 - 1);
    const b = (v * 2 - 1);
    let r, phi;
    if (a === 0 && b === 0) { r = 0; phi = 0; }
    else if (Math.abs(a) > Math.abs(b)) { r = a; phi = (Math.PI / 4) * (b / a); }
    else { r = b; phi = (Math.PI / 2) - (Math.PI / 4) * (a / b); }

    const rr = Math.abs(r) * stopAp; // stopAp = semi-diameter
    return { y: rr * Math.cos(phi), z: rr * Math.sin(phi) };
  }

  const taps = [
    [0, 0],
    [0.55, 0.15],
    [-0.48, 0.36],
    [0.25, -0.58],
    [-0.28, -0.18],
    [0.78, -0.22],
    [-0.72, -0.44],
    [0.12, 0.74],
    [-0.14, -0.82],
  ];

  function requestPreviewFrame(fn) {
    requestAnimationFrame(() => {
      try {
        fn();
      } catch (e) {
        finishPreviewRender();
        handleRuntimeError("Preview stopped", e);
      }
    });
  }

  if (Number.isFinite(focusChartDistanceMm) && focusChartDistanceMm > 0.1 && focusChartDistanceMm < 1e8) {
    updatePreviewFieldSpotDebug();
    sensorX = getSensorPlaneX(lens.surfaces, sensorShift);
    if (ui.useZemaxFields?.checked && Array.isArray(lens?.zemax?.fields) && lens.zemax.fields.length) {
      preview.debug.method = `${preview.debug.method} • fields=zemax`;
    }
  } else {
    preview.debug.centerRmsMm = null;
    preview.debug.centerRmsPx = null;
    preview.debug.centerHitRate = null;
    preview.debug.midRmsMm = null;
    preview.debug.midRmsPx = null;
    preview.debug.midHitRate = null;
    preview.debug.cornerRmsMm = null;
    preview.debug.cornerRmsPx = null;
    preview.debug.cornerHitRate = null;
    preview.debug.bestFocusCenterShiftMm = null;
    preview.debug.bestFocusCornerShiftMm = null;
    preview.debug.fieldCurvatureDeltaMm = null;
  }

  function renderFastLUT() {
    const LUT_N = 900;
    const WAVES = doCA ? ["c", "d", "g"] : [wavePreset, wavePreset, wavePreset];

    const rObjLUT   = [new Float32Array(LUT_N), new Float32Array(LUT_N), new Float32Array(LUT_N)];
    const transLUT  = [new Float32Array(LUT_N), new Float32Array(LUT_N), new Float32Array(LUT_N)];
    const sigmaRadLUT = [new Float32Array(LUT_N), new Float32Array(LUT_N), new Float32Array(LUT_N)];
    const sigmaTanLUT = [new Float32Array(LUT_N), new Float32Array(LUT_N), new Float32Array(LUT_N)];
    const sigmaLUT  = [new Float32Array(LUT_N), new Float32Array(LUT_N), new Float32Array(LUT_N)];
    const naturalLUT = new Float32Array(LUT_N);

    const epsX = 0.05;
    const startX = sensorX + epsX;

    function lookup(ch, absR) {
      const t = clamp(absR / rMaxSensor, 0, 1);
      const x = t * (LUT_N - 1);
      const i0 = Math.floor(x);
      const i1 = Math.min(LUT_N - 1, i0 + 1);
      const u = x - i0;
      return {
        rObj:   rObjLUT[ch][i0]   * (1 - u) + rObjLUT[ch][i1]   * u,
        trans:  transLUT[ch][i0]  * (1 - u) + transLUT[ch][i1]  * u,
        sigmaRad: sigmaRadLUT[ch][i0] * (1 - u) + sigmaRadLUT[ch][i1] * u,
        sigmaTan: sigmaTanLUT[ch][i0] * (1 - u) + sigmaTanLUT[ch][i1] * u,
        sigma:  sigmaLUT[ch][i0]  * (1 - u) + sigmaLUT[ch][i1]  * u,
        nat:    naturalLUT[i0]    * (1 - u) + naturalLUT[i1]    * u,
      };
    }

    // Build LUT in chunks (prevents freezing)
    let k = 0;
    const kPerFrame = (q === "hq") ? 18 : (q === "draft" ? 40 : 26);

    function buildStep() {
      if (!renderEngineEnabled || jobId !== _previewRenderJobId) {
        hidePreviewProgress();
        finishPreviewRender();
        return;
      }
      const end = Math.min(LUT_N, k + kPerFrame);
      setPreviewProgress(k / LUT_N, `LUT ${Math.round((k / LUT_N) * 100)}%`);

      for (; k < end; k++) {
        const a = k / (LUT_N - 1);
        const rS = a * rMaxSensor;
        const pS = { x: startX, y: rS, z: 0 };

        naturalLUT[k] = naturalCos4(rS);

        for (let ch = 0; ch < 3; ch++) {
          const wave = WAVES[ch];

          // chief ray -> object radius
          {
            const dirChief = normalize3({ x: xStop - startX, y: -rS, z: 0 });
            const trC = traceRayReverse3D({ p: pS, d: dirChief }, lens.surfaces, wave);
            if (!trC.vignetted && !trC.tir) {
              const hitObj = intersectPlaneX3D(trC.endRay, xObjPlane);
              rObjLUT[ch][k] = hitObj ? Math.hypot(hitObj.y, hitObj.z) : 0;
            } else {
              rObjLUT[ch][k] = 0;
            }
          }

          // pupil sampling -> transmission + sigma
          let ok = 0, total = 0;
          let sumY = 0, sumZ = 0, sumYY = 0, sumZZ = 0;

          for (let iy = 0; iy < lutPupilSqrt; iy++) {
            for (let ix = 0; ix < lutPupilSqrt; ix++) {
              const uu = (ix + Math.random()) / lutPupilSqrt;
              const vv = (iy + Math.random()) / lutPupilSqrt;

              const pp = samplePupilDisk(uu, vv);
              const target = { x: xStop, y: pp.y, z: pp.z };
              const dir = normalize3({ x: target.x - pS.x, y: target.y - pS.y, z: target.z - pS.z });

              const tr = traceRayReverse3D({ p: pS, d: dir }, lens.surfaces, wave);
              total++;
              if (tr.vignetted || tr.tir) continue;

              const hitObj = intersectPlaneX3D(tr.endRay, xObjPlane);
              if (!hitObj) continue;

              ok++;
              sumY += hitObj.y; sumZ += hitObj.z;
              sumYY += hitObj.y * hitObj.y;
              sumZZ += hitObj.z * hitObj.z;
            }
          }

          transLUT[ch][k] = total ? (ok / total) : 0;

          if (ok > 2) {
            const my = sumY / ok, mz = sumZ / ok;
            const varY = Math.max(0, sumYY / ok - my * my);
            const varZ = Math.max(0, sumZZ / ok - mz * mz);
            sigmaRadLUT[ch][k] = Math.sqrt(varY);
            sigmaTanLUT[ch][k] = Math.sqrt(varZ);
            sigmaLUT[ch][k] = Math.sqrt(varY + varZ);
            // Use centroid radius for mapping to preserve coma/field-curvature shifts
            // better than chief-only mapping in fast mode.
            rObjLUT[ch][k] = Math.hypot(my, mz);
          } else {
            sigmaRadLUT[ch][k] = 0;
            sigmaTanLUT[ch][k] = 0;
            sigmaLUT[ch][k] = 0;
          }
        }
      }

      if (k < LUT_N) {
        requestPreviewFrame(buildStep);
        return;
      }

      setUsableCircleFromLUT(transLUT[1], naturalLUT, rMaxSensor, previewOverscan);
      const centerL = lookup(1, 0);
      const centerSigmaRad = Number.isFinite(centerL?.sigmaRad) ? Number(centerL.sigmaRad) : Number(centerL?.sigma || 0);
      const centerSigmaTan = Number.isFinite(centerL?.sigmaTan) ? Number(centerL.sigmaTan) : Number(centerL?.sigma || 0);
      const pxPerMmX = W / Math.max(1e-9, 2 * halfObjW);
      const pxPerMmY = H / Math.max(1e-9, 2 * halfObjH);
      const centerKernelPx = (Number.isFinite(centerSigmaRad) || Number.isFinite(centerSigmaTan))
        ? Math.max(centerSigmaRad * pxPerMmX, centerSigmaTan * pxPerMmY)
        : null;
      preview.debug.kernelPx = Number.isFinite(centerKernelPx) ? centerKernelPx : null;
      if (!Number.isFinite(preview.debug.spotRmsPx) && Number.isFinite(centerKernelPx)) {
        preview.debug.spotRmsPx = centerKernelPx;
      }

      // Allocate world canvas AFTER LUT is ready
      preview.worldCanvas.width = W;
      preview.worldCanvas.height = H;
      preview.worldCtx = preview.worldCanvas.getContext("2d", { willReadFrequently: true });
      const wctx = preview.worldCtx;

      const out = wctx.createImageData(W, H);
      const outD = out.data;
      let litPixels = 0;

      function objXYPhysical(L, sx, sy, rS) {
        if (rS <= 1e-9) return { ox: 0, oy: 0 };
        const s = L.rObj / rS;
        // LUT gives radial magnitude only; reconstruct physical object-plane sign
        // from sensor coords (sensor-real convention = inverted image).
        return { ox: -sx * s, oy: -sy * s };
      }

      for (let py = 0; py < H; py++) {
        const sy = (0.5 - (py + 0.5) / H) * sensorHv;

        for (let px = 0; px < W; px++) {
          const sx = ((px + 0.5) / W - 0.5) * sensorWv;
          const rS = Math.hypot(sx, sy);
          const idx = (py * W + px) * 4;

          if (!doCA) {
            const L = lookup(1, rS); // green basis
            const gain = clamp(L.trans * L.nat, 0, 1);

            if (gain < 1e-4) {
              outD[idx] = 0; outD[idx + 1] = 0; outD[idx + 2] = 0; outD[idx + 3] = 255;
              continue;
            }

            const p = objXYPhysical(L, sx, sy, rS);
            const uv0 = objectHitToPreviewUV(p.ox, p.oy);
            const sigmaBoost = 1.15;
            const sigR = Math.max(0, Number(L.sigmaRad || L.sigma || 0) * sigmaBoost);
            const sigT = Math.max(0, Number(L.sigmaTan || L.sigma || 0) * sigmaBoost);
            const pNorm = Math.hypot(p.ox, p.oy);
            const urx = pNorm > 1e-9 ? (p.ox / pNorm) : 1;
            const ury = pNorm > 1e-9 ? (p.oy / pNorm) : 0;
            const utx = -ury;
            const uty = urx;

            if (sigR < 1e-4 && sigT < 1e-4) {
              const c = sample(uv0.u, uv0.v);
              outD[idx]     = clamp(c[0] * gain, 0, 255);
              outD[idx + 1] = clamp(c[1] * gain, 0, 255);
              outD[idx + 2] = clamp(c[2] * gain, 0, 255);
              outD[idx + 3] = 255;
              if (outD[idx] > 0 || outD[idx + 1] > 0 || outD[idx + 2] > 0) litPixels++;
            } else {
              let r = 0, g = 0, b = 0;
              for (let t = 0; t < taps.length; t++) {
                const o = taps[t];
                const ox = p.ox + urx * (o[0] * sigR) + utx * (o[1] * sigT);
                const oy = p.oy + ury * (o[0] * sigR) + uty * (o[1] * sigT);
                const uv = objectHitToPreviewUV(ox, oy);
                const c = sample(uv.u, uv.v);
                r += c[0]; g += c[1]; b += c[2];
              }
              const inv = 1 / taps.length;
              outD[idx]     = clamp(r * inv * gain, 0, 255);
              outD[idx + 1] = clamp(g * inv * gain, 0, 255);
              outD[idx + 2] = clamp(b * inv * gain, 0, 255);
              outD[idx + 3] = 255;
              if (outD[idx] > 0 || outD[idx + 1] > 0 || outD[idx + 2] > 0) litPixels++;
            }
            continue;
          }

          // CA path (with sigma blur per channel)
          const Lr = lookup(0, rS);
          const Lg = lookup(1, rS);
          const Lb = lookup(2, rS);

          const gr = clamp(Lr.trans * Lr.nat, 0, 1);
          const gg = clamp(Lg.trans * Lg.nat, 0, 1);
          const gb = clamp(Lb.trans * Lb.nat, 0, 1);

          if (gr < 1e-4 && gg < 1e-4 && gb < 1e-4) {
            outD[idx] = 0; outD[idx + 1] = 0; outD[idx + 2] = 0; outD[idx + 3] = 255;
            continue;
          }

          function chanSample(L, sx, sy, rS, chGain, chIndex){
            const p = objXYPhysical(L, sx, sy, rS);
            const uv0 = objectHitToPreviewUV(p.ox, p.oy);
            const sigmaBoost = 1.15;
            const sigR = Math.max(0, Number(L.sigmaRad || L.sigma || 0) * sigmaBoost);
            const sigT = Math.max(0, Number(L.sigmaTan || L.sigma || 0) * sigmaBoost);
            const pNorm = Math.hypot(p.ox, p.oy);
            const urx = pNorm > 1e-9 ? (p.ox / pNorm) : 1;
            const ury = pNorm > 1e-9 ? (p.oy / pNorm) : 0;
            const utx = -ury;
            const uty = urx;

            if (sigR < 1e-4 && sigT < 1e-4) {
              const c = sample(uv0.u, uv0.v);
              return clamp(c[chIndex] * chGain, 0, 255);
            }

            let acc = 0;
            for (let t = 0; t < taps.length; t++){
              const o = taps[t];
              const ox = p.ox + urx * (o[0] * sigR) + utx * (o[1] * sigT);
              const oy = p.oy + ury * (o[0] * sigR) + uty * (o[1] * sigT);
              const uv = objectHitToPreviewUV(ox, oy);
              const c = sample(uv.u, uv.v);
              acc += c[chIndex];
            }
            return clamp((acc / taps.length) * chGain, 0, 255);
          }

          outD[idx]     = chanSample(Lr, sx, sy, rS, gr, 0);
          outD[idx + 1] = chanSample(Lg, sx, sy, rS, gg, 1);
          outD[idx + 2] = chanSample(Lb, sx, sy, rS, gb, 2);
          outD[idx + 3] = 255;
          if (outD[idx] > 0 || outD[idx + 1] > 0 || outD[idx + 2] > 0) litPixels++;
        }
      }

      setUsableCircleFromRenderedPixels(outD, W, H, sensorW, sensorH);

      wctx.putImageData(out, 0, 0);
      preview.worldReady = true;
      if (litPixels <= 0) {
        console.warn("[preview-black]", {
          reason: "all_pixels_black_fast_lut",
          mode: "fast",
          activeZoomConfig: Number.isFinite(Number(lens?.zoom?.activeConfig)) ? Number(lens.zoom.activeConfig) : null,
          activeZoomLabel: String(lens?.zemax?.currentConfigLabel || "—"),
        });
      }
      hidePreviewProgress();
      drawPreviewViewport();
      finishPreviewRender();
    }

    requestPreviewFrame(buildStep);
  }

  function renderDOFPath() {
    // allocate render target
    preview.worldCanvas.width  = W;
    preview.worldCanvas.height = H;
    const wctx = preview.worldCanvas.getContext("2d", { willReadFrequently: true });
    preview.worldCtx = wctx;

    const out  = wctx.createImageData(W, H);
    const outD = out.data;
    let litPixels = 0;

    const epsX   = 0.05;
    const startX = sensorX + epsX;

    const WAVES = doCA ? ["c","d","g"] : [wavePreset, wavePreset, wavePreset];

    let row = 0;
    const rowsPerChunk = (q === "hq") ? 10 : (q === "draft" ? 24 : 16);

    function step() {
      if (!renderEngineEnabled || jobId !== _previewRenderJobId) {
        hidePreviewProgress();
        finishPreviewRender();
        return;
      }
      const yEnd = Math.min(H, row + rowsPerChunk);
      setPreviewProgress(row / H, `DOF ${Math.round((row / H) * 100)}%`);

      for (; row < yEnd; row++) {
        const sy = (0.5 - (row + 0.5) / H) * sensorHv;

        for (let col = 0; col < W; col++) {
          const sx = ((col + 0.5) / W - 0.5) * sensorWv;
          const rS = Math.hypot(sx, sy);

          const nat = naturalCos4(rS);

          let accR = 0, accG = 0, accB = 0;
          let wSum = 0;

          for (let s = 0; s < spp; s++) {
            const jx = (Math.random() - 0.5) * (sensorWv / W) * 0.6;
            const jy = (Math.random() - 0.5) * (sensorHv / H) * 0.6;

            const pS = { x: startX, y: sx + jx, z: sy + jy };

            const pp = samplePupilDisk(Math.random(), Math.random());
            const target = { x: xStop, y: pp.y, z: pp.z };
            const dir0 = normalize3({ x: target.x - pS.x, y: target.y - pS.y, z: target.z - pS.z });

            let colLin = [0, 0, 0];
            let okAny = false;

            for (let ch = 0; ch < 3; ch++) {
              const wave = WAVES[ch];
              const tr = traceRayReverse3D({ p: pS, d: dir0 }, lens.surfaces, wave);
              if (tr.vignetted || tr.tir) continue;

              const hitObj = intersectPlaneX3D(tr.endRay, xObjPlane);
              if (!hitObj) continue;

              const uv = objectHitToPreviewUV(hitObj.y, hitObj.z);
              const c  = sample(uv.u, uv.v);

              colLin[ch] = srgbToLin(c[ch]);
              okAny = true;
            }

            if (!okAny) continue;

            const w = nat;
            accR += colLin[0] * w;
            accG += colLin[1] * w;
            accB += colLin[2] * w;
            wSum += w;
          }

          const idx = (row * W + col) * 4;
          if (wSum <= 1e-9) {
            outD[idx] = 0; outD[idx + 1] = 0; outD[idx + 2] = 0; outD[idx + 3] = 255;
          } else {
            outD[idx]     = linToSrgb(accR / wSum);
            outD[idx + 1] = linToSrgb(accG / wSum);
            outD[idx + 2] = linToSrgb(accB / wSum);
            outD[idx + 3] = 255;
            if (outD[idx] > 0 || outD[idx + 1] > 0 || outD[idx + 2] > 0) litPixels++;
          }
        }
      }

      wctx.putImageData(out, 0, 0);
      preview.worldReady = true;
      drawPreviewViewport();

      if (row < H) requestPreviewFrame(step);
      else {
        setUsableCircleFromRenderedPixels(outD, W, H, sensorW, sensorH);
        if (litPixels <= 0) {
          console.warn("[preview-black]", {
            reason: "all_pixels_black_quality_dof",
            mode: "quality",
            activeZoomConfig: Number.isFinite(Number(lens?.zoom?.activeConfig)) ? Number(lens.zoom.activeConfig) : null,
            activeZoomLabel: String(lens?.zemax?.currentConfigLabel || "—"),
          });
        }
        hidePreviewProgress();
        drawPreviewViewport();
        finishPreviewRender();
      }
    }

    requestPreviewFrame(step);
  }

  // --- run ---
  preview.worldReady = false;

  if (previewMode === "fast") {
    renderFastLUT();
  } else {
    renderDOFPath();
  }
  }

  // -------------------- toolbar actions: Scale → FL, Set T --------------------
  function scaleSurfaceDimensions(s, k) {
    if (!s || !Number.isFinite(k) || k <= 0) return;

    const t = String(s.type || "").toUpperCase();
    if (t !== "OBJ" && t !== "IMS") s.t = Number(s.t || 0) * k;
    if (Math.abs(Number(s.R || 0)) > 1e-9) s.R = Number(s.R) * k;

    const ap = Number(s.ap);
    if (Number.isFinite(ap)) s.ap = Math.max(AP_MIN, ap * k);

    const apOpt = Number(s.ap_optical);
    if (Number.isFinite(apOpt)) s.ap_optical = Math.max(AP_MIN, apOpt * k);

    if (s.ap_mech != null && String(s.ap_mech).trim() !== "") {
      const apMech = Number(s.ap_mech);
      if (Number.isFinite(apMech)) s.ap_mech = Math.max(AP_MIN, apMech * k);
    }

    const shoulder = Number(s.shoulder_depth);
    if (Number.isFinite(shoulder)) s.shoulder_depth = Math.max(0, shoulder * k);

    const bevel = Number(s.bevel);
    if (Number.isFinite(bevel)) s.bevel = Math.max(0, bevel * k);

    if (String(s.edge_thickness_mode || "").toLowerCase() === "explicit") {
      const et = Number(s.edge_thickness);
      if (Number.isFinite(et)) s.edge_thickness = Math.max(0, et * k);
    }
  }

  function scaleToTargetFocal() {
    const wavePreset = ui.wavePreset?.value || "d";
    const cur = estimateEflBflParaxial(lens.surfaces, wavePreset).efl;
    if (!Number.isFinite(cur) || cur <= 0) {
      if (ui.footerWarn) ui.footerWarn.textContent = "Scale→FL: current EFL not solvable (try a valid stop + lens).";
      return;
    }

    const target = num(prompt("Target focal length (mm)?", String(Math.round(cur))), cur);
    if (!Number.isFinite(target) || target <= 0) return;

    const k = target / cur;

    for (let i = 0; i < lens.surfaces.length; i++) {
      scaleSurfaceDimensions(lens.surfaces[i], k);
    }

    computeVertices(lens.surfaces, 0, 0);
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();

    if (ui.footerWarn) ui.footerWarn.textContent = `Scale→FL: EFL ${cur.toFixed(2)} → target ${target.toFixed(2)} (k=${k.toFixed(4)}).`;
  }

  function setTargetTStop() {
    const wavePreset = ui.wavePreset?.value || "d";
    const { efl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
    if (!Number.isFinite(efl) || efl <= 0) {
      if (ui.footerWarn) ui.footerWarn.textContent = "Set T: EFL unknown (try Scale→FL or fix geometry).";
      return;
    }

    const stopIdx = findStopSurfaceIndex(lens.surfaces);
    if (stopIdx < 0) {
      if (ui.footerWarn) ui.footerWarn.textContent = "Set T: no STOP surface marked.";
      return;
    }

    const currentT = estimateTStopApprox(efl, lens.surfaces, wavePreset);
    const targetT = num(prompt("Target T-stop? (approx)", currentT ? currentT.toFixed(2) : "2.00"), currentT || 2.0);
    if (!Number.isFinite(targetT) || targetT <= 0) return;

    const stopSurf = lens.surfaces[stopIdx];
    const loMin = AP_MIN;
    const hiMax = maxApForSurface(stopSurf);
    const prevAp = getSurfaceOpticalAp(stopSurf);

    let lo = loMin;
    let hi = hiMax;
    let bestAp = prevAp;
    let bestErr = Infinity;

    const evalAtAp = (ap) => {
      stopSurf.ap = ap;
      stopSurf.ap_optical = ap;
      const t = estimateTStopApprox(efl, lens.surfaces, wavePreset);
      return Number.isFinite(t) ? t : null;
    };

    const tLo = evalAtAp(lo);
    const tHi = evalAtAp(hi);

    if (tLo == null || tHi == null) {
      const guessAp = Math.max(loMin, Math.min(efl / (2 * targetT), hiMax));
      bestAp = guessAp;
    } else {
      for (let iter = 0; iter < 28; iter++) {
        const mid = 0.5 * (lo + hi);
        const tMid = evalAtAp(mid);
        if (tMid == null) { hi = mid; continue; }

        const err = Math.abs(tMid - targetT);
        if (err < bestErr) {
          bestErr = err;
          bestAp = mid;
        }

        // Larger aperture -> lower T, so tMid > target means aperture must grow.
        if (tMid > targetT) lo = mid;
        else hi = mid;
      }
    }

    const stopAp = Math.max(loMin, Math.min(bestAp, hiMax));
    lens.surfaces[stopIdx].ap = stopAp;
    lens.surfaces[stopIdx].ap_optical = stopAp;

    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();

    if (ui.footerWarn) ui.footerWarn.textContent = `Set T: stop ap → ${lens.surfaces[stopIdx].ap.toFixed(2)}mm (semi-diam) for T${targetT.toFixed(2)} @ EFL ${efl.toFixed(2)}mm.`;
  }

  // -------------------- Auto Tuner --------------------
  const AUTO_TUNER_INVALID_SCORE = 1e9;
  const AUTO_TUNER_HISTORY_LIMIT = 18;
  const AUTO_TUNER_DEFAULT_LIMITS = {
    minGlassT: 1.0,
    minAirGap: 0.1,
    maxGlassT: 20.0,
    maxAirGap: 80.0,
    minRadiusAbs: 8.0,
    maxRadiusAbs: 5000.0,
  };

  const autoTunerState = {
    running: false,
    paused: false,
    timer: 0,
    timerKind: "",
    iteration: 0,
    lastUiIteration: -1,
    originalLens: null,
    acceptedLens: null,
    bestLens: null,
    config: null,
    rng: Math.random,
    originalMerit: null,
    acceptedMerit: null,
    currentMerit: null,
    bestMerit: null,
    bestIteration: null,
    history: [],
    noImprove: 0,
    acceptedMoves: 0,
    rejectedMoves: 0,
    invalidMoves: 0,
    hardRejectedFL: 0,
    hardRejectedT: 0,
    hardRejectedIC: 0,
    stepScale: 1,
    stopReason: "",
    diagnostics: "",
    baselineInvalid: false,
    previewingBest: false,
    consecutiveInvalid: 0,
    invalidByCategory: {},
    disabledMutationGroups: new Set(),
    lastMessage: "",
  };

  function deg2rad(d) { return (d * Math.PI) / 180; }

  function finiteOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function scoreText(value, digits = 5) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n) >= 100000) return n.toExponential(3);
    return n.toFixed(digits);
  }

  function mmText(value, digits = 2) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(digits)}mm` : "—";
  }

  function tText(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `T${n.toFixed(2)}` : "—";
  }

  function compactAutoTunerNumber(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
  }

  function collectAutoTunerHardConstraintViolations(merit, config = {}) {
    if (!merit || merit.invalidPenalty > 0) return [];
    const hard = config?.hardConstraints || {};
    const metrics = merit?.metrics || {};
    const strictFLT = hard.strictFLTLock !== false;
    const eps = 1e-9;
    const violations = [];

    const flHard = hard.focalLength || {};
    if (strictFLT && flHard.enabled) {
      const efl = Number(metrics.efl);
      const target = Number(flHard.target);
      const tolerance = Math.max(0, Number(flHard.tolerance));
      if (!Number.isFinite(efl) || !Number.isFinite(target) || !Number.isFinite(tolerance)) {
        violations.push({ ok: false, category: "fl", reason: "Rejected: EFL unavailable for hard focal length lock" });
      } else if (Math.abs(efl - target) > tolerance + eps) {
        violations.push({
          ok: false,
          category: "fl",
          reason: `Rejected: EFL ${compactAutoTunerNumber(efl)}mm outside ${compactAutoTunerNumber(target)} ±${compactAutoTunerNumber(tolerance)}mm`,
          current: efl,
          target,
          tolerance,
        });
      }
    }

    const tHard = hard.tStop || {};
    if (strictFLT && tHard.enabled) {
      const tStop = Number(metrics.T);
      const target = Number(tHard.target);
      const tolerance = Math.max(0, Number(tHard.tolerance));
      if (!Number.isFinite(tStop) || !Number.isFinite(target) || !Number.isFinite(tolerance)) {
        violations.push({ ok: false, category: "t", reason: "Rejected: T-stop unavailable for hard T lock" });
      } else if (Math.abs(tStop - target) > tolerance + eps) {
        violations.push({
          ok: false,
          category: "t",
          reason: `Rejected: T${compactAutoTunerNumber(tStop)} outside T${compactAutoTunerNumber(target)} ±${compactAutoTunerNumber(tolerance)}`,
          current: tStop,
          target,
          tolerance,
        });
      }
    }

    const icHard = hard.imageCircle || {};
    if (icHard.enabled) {
      const imageCircle = Number(metrics.imageCircleMm);
      const minimum = Math.max(0, Number(icHard.minimum));
      if (!Number.isFinite(imageCircle) || !Number.isFinite(minimum)) {
        violations.push({ ok: false, category: "ic", reason: "Rejected: image circle unavailable for hard minimum" });
      } else if (imageCircle + eps < minimum) {
        violations.push({
          ok: false,
          category: "ic",
          reason: `Rejected: IC ${compactAutoTunerNumber(imageCircle, 1)}mm below ${compactAutoTunerNumber(minimum, 1)}mm minimum`,
          current: imageCircle,
          minimum,
        });
      }
    }

    return violations;
  }

  function checkAutoTunerHardConstraints(merit, config = {}) {
    const violations = collectAutoTunerHardConstraintViolations(merit, config);
    if (violations.length) return violations[0];
    return { ok: true };
  }

  function describeAutoTunerBaselineHardViolation(violation) {
    if (!violation) return "";
    if (violation.category === "ic") {
      const cur = compactAutoTunerNumber(violation.current, 1);
      const min = compactAutoTunerNumber(violation.minimum, 1);
      return `Current lens is already below hard IC minimum (${cur}mm < ${min}mm). The optimizer may reject all candidates. Use Image Circle as a soft target first.`;
    }
    if (violation.category === "fl") {
      const cur = compactAutoTunerNumber(violation.current);
      const target = compactAutoTunerNumber(violation.target);
      const tol = compactAutoTunerNumber(violation.tolerance);
      return `Current lens is already outside the hard Focal Length range (${cur}mm outside ${target} ±${tol}mm). The optimizer may reject all candidates. Use Focal Length as a soft target first or loosen the tolerance.`;
    }
    if (violation.category === "t") {
      const cur = compactAutoTunerNumber(violation.current);
      const target = compactAutoTunerNumber(violation.target);
      const tol = compactAutoTunerNumber(violation.tolerance);
      return `Current lens is already outside the hard T-stop range (T${cur} outside T${target} ±${tol}). The optimizer may reject all candidates. Use T-stop as a soft target first or loosen the tolerance.`;
    }
    return violation.reason || "Current lens is already outside a hard Auto Tuner constraint. The optimizer may reject all candidates.";
  }

  function confirmAutoTunerBaselineHardConstraints(merit, config) {
    const violations = collectAutoTunerHardConstraintViolations(merit, config);
    if (!violations.length) return { ok: true, warning: "" };
    const warning = violations.map(describeAutoTunerBaselineHardViolation).filter(Boolean).join("\n\n");
    const message = `${warning}\n\nStart Auto Tuner anyway?`;
    const proceed = (typeof window !== "undefined" && typeof window.confirm === "function")
      ? window.confirm(message)
      : false;
    return { ok: proceed, warning };
  }

  function goalConfig(targets, weights, key, defaultTarget = null) {
    const raw = targets?.[key];
    const isObj = raw && typeof raw === "object";
    const enabled = isObj ? raw.enabled !== false : raw != null;
    const target = isObj ? raw.target : (raw ?? defaultTarget);
    const weightRaw = weights?.[key] ?? (isObj ? raw.weight : null) ?? 1;
    const weight = Math.max(0, Number.isFinite(Number(weightRaw)) ? Number(weightRaw) : 1);
    return { enabled: !!enabled && weight > 0, target: Number(target), weight };
  }

  function getAutoTunerLimits(config = {}) {
    const src = config?.limits || {};
    const out = { ...AUTO_TUNER_DEFAULT_LIMITS };
    for (const key of Object.keys(out)) {
      const n = Number(src[key]);
      if (Number.isFinite(n) && n > 0) out[key] = n;
    }
    out.maxGlassT = Math.max(out.minGlassT, out.maxGlassT);
    out.maxAirGap = Math.max(out.minAirGap, out.maxAirGap);
    out.maxRadiusAbs = Math.max(out.minRadiusAbs, out.maxRadiusAbs);
    return out;
  }

  function recomputeSurfacePositionsForLens(lensState) {
    const surfaces = lensState?.surfaces;
    if (!Array.isArray(surfaces)) return lensState;
    if (surfaces[0]) {
      surfaces[0].type = "OBJ";
      surfaces[0].vx = 0;
      surfaces[0].t = 0;
    }
    if (surfaces[surfaces.length - 1]) {
      surfaces[surfaces.length - 1].type = "IMS";
    }
    computeVertices(surfaces, 0, 0);
    return lensState;
  }

  if (typeof window !== "undefined") {
    window.recomputeSurfacePositionsForLens = recomputeSurfacePositionsForLens;
  }

  function getAutoTunerSurfaceLabel(surface, index = 0) {
    return getSurfaceDisplayLabel(surface, index) || `S${index}`;
  }

  function formatAutoTunerCrossingDiagnostic(diag) {
    if (!diag) return "";
    const cur = diag.current || {};
    const prev = diag.previous || {};
    const ap = Number(diag.apertureMm);
    const clearance = Number(diag.edgeClearanceMm);
    const parts = [
      `Invalid: ${cur.label || `S${cur.index}`} crossing with ${prev.label || `S${prev.index}`} at aperture ${Number.isFinite(ap) ? ap.toFixed(3) : "—"}mm.`,
      `Edge clearance = ${Number.isFinite(clearance) ? clearance.toFixed(4) : "—"}mm.`,
      `prev index=${prev.index}, label=${prev.label}, vx=${mmText(prev.vx, 4)}, R=${mmText(prev.R, 4)}, t=${mmText(prev.t, 4)}.`,
      `current index=${cur.index}, label=${cur.label}, vx=${mmText(cur.vx, 4)}, R=${mmText(cur.R, 4)}, t=${mmText(cur.t, 4)}.`,
      `front edge x=${mmText(diag.frontEdgeX, 4)}, rear edge x=${mmText(diag.rearEdgeX, 4)}, y=${mmText(diag.yMm, 4)}.`,
    ];
    if (diag.reason) parts.push(`Reason: ${diag.reason}.`);
    return parts.join(" ");
  }

  function createAutoTunerDiagnostics(reason, validation = null, metrics = null) {
    const lines = [];
    const text = String(reason || validation?.reason || "Auto Tuner diagnostics");
    lines.push(text);
    if (validation?.diagnostic) lines.push(formatAutoTunerCrossingDiagnostic(validation.diagnostic));
    if (Array.isArray(validation?.warnings) && validation.warnings.length) {
      lines.push(`Warnings: ${validation.warnings.join(" | ")}`);
    }
    if (metrics) {
      lines.push([
        `EFL=${mmText(metrics.efl)}`,
        `T=${tText(metrics.T)}`,
        `IC=${mmText(metrics.imageCircleMm, 1)}`,
        `BFL=${mmText(metrics.bfl)}`,
        `COV=${metrics.cov ? "YES" : "NO"}`,
        `rear clearance=${mmText(metrics.rearClearance)}`,
      ].join(" • "));
    }
    return lines.filter(Boolean).join("\n");
  }

  function createInvalidMerit(reason, metrics = {}) {
    return {
      totalScore: AUTO_TUNER_INVALID_SCORE,
      focalLengthError: 1,
      tStopError: 1,
      imageCircleError: 1,
      centerSharpnessScore: 100,
      cornerSharpnessScore: 100,
      vignettingPenalty: 100,
      rearIntrusionPenalty: 100,
      invalidPenalty: AUTO_TUNER_INVALID_SCORE,
      compactnessPenalty: 0,
      notes: [],
      warnings: [String(reason || "invalid lens")],
      metrics,
    };
  }

  function autoTunerSurfaceSignature(surface) {
    return [
      String(surface?.type || ""),
      String(surface?.surfaceLabel ?? surface?.label ?? ""),
      surface?.stop ? "1" : "0",
    ].join("|");
  }

  function isAutoTunerMechanicalSurface(surface) {
    const t = String(surface?.type || "").toUpperCase();
    return t === "MECH" || t === "BAFFLE" || t === "HOUSING";
  }

  function autoTunerSagSafeAperture(a, b) {
    const apA = Number(getSurfaceOpticalAp(a));
    const apB = Number(getSurfaceOpticalAp(b));
    let ap = Math.min(
      Number.isFinite(apA) && apA > 0 ? apA : Infinity,
      Number.isFinite(apB) && apB > 0 ? apB : Infinity
    );
    for (const s of [a, b]) {
      const R = Math.abs(Number(s?.R || 0));
      if (R > 1e-9) ap = Math.min(ap, Math.max(0.01, R - 1e-4));
    }
    return Number.isFinite(ap) && ap > 0 ? ap : 0.01;
  }

  function checkAutoTunerSurfaceCrossings(lensState, config = {}) {
    recomputeSurfacePositionsForLens(lensState);
    const surfaces = lensState?.surfaces || [];
    const lastIdx = surfaces.length - 1;
    const epsilon = Number.isFinite(Number(config?.crossingEpsilonMm))
      ? Number(config.crossingEpsilonMm)
      : 0.001;

    for (let i = 1; i < lastIdx - 1; i++) {
      const prev = surfaces[i];
      const cur = surfaces[i + 1];
      const prevType = String(prev?.type || "").toUpperCase();
      const curType = String(cur?.type || "").toUpperCase();
      if (prevType === "OBJ" || curType === "OBJ" || prevType === "IMS" || curType === "IMS") continue;
      if (prevType === "STOP" || curType === "STOP" || prev?.stop || cur?.stop) continue;
      if (isAutoTunerMechanicalSurface(prev) || isAutoTunerMechanicalSurface(cur)) continue;

      const ap = autoTunerSagSafeAperture(prev, cur);
      const samples = [0, 0.25, 0.5, 0.75, 1.0].map((f) => ap * f);
      let minClearance = Infinity;
      let minY = 0;
      let frontEdgeX = null;
      let rearEdgeX = null;

      for (const y of samples) {
        const xPrev = surfaceXatY(prev, y);
        const xCur = surfaceXatY(cur, y);
        if (xPrev == null || xCur == null) {
          return {
            ok: false,
            reason: `surface ${i + 1} edge geometry invalid`,
            category: "crossing",
            diagnostic: {
              reason: "sag could not be evaluated at clear aperture",
              apertureMm: ap,
              yMm: y,
              frontEdgeX: xPrev,
              rearEdgeX: xCur,
              edgeClearanceMm: null,
              previous: {
                index: i,
                label: getAutoTunerSurfaceLabel(prev, i),
                vx: Number(prev?.vx),
                R: Number(prev?.R),
                t: Number(prev?.t),
              },
              current: {
                index: i + 1,
                label: getAutoTunerSurfaceLabel(cur, i + 1),
                vx: Number(cur?.vx),
                R: Number(cur?.R),
                t: Number(cur?.t),
              },
            },
          };
        }
        const clearance = xCur - xPrev;
        if (clearance < minClearance) {
          minClearance = clearance;
          minY = y;
          frontEdgeX = xPrev;
          rearEdgeX = xCur;
        }
      }

      if (minClearance < -epsilon) {
        const prevLabel = getAutoTunerSurfaceLabel(prev, i);
        const curLabel = getAutoTunerSurfaceLabel(cur, i + 1);
        return {
          ok: false,
          reason: `Invalid: ${curLabel} crossing with ${prevLabel} at aperture ${ap.toFixed(3)}mm. Edge clearance = ${minClearance.toFixed(4)}mm.`,
          category: "crossing",
          diagnostic: {
            reason: "negative edge clearance",
            apertureMm: ap,
            yMm: minY,
            frontEdgeX,
            rearEdgeX,
            edgeClearanceMm: minClearance,
            previous: {
              index: i,
              label: prevLabel,
              vx: Number(prev?.vx),
              R: Number(prev?.R),
              t: Number(prev?.t),
            },
            current: {
              index: i + 1,
              label: curLabel,
              vx: Number(cur?.vx),
              R: Number(cur?.R),
              t: Number(cur?.t),
            },
          },
        };
      }
    }

    return { ok: true, reason: "", penalty: 0, warnings: [] };
  }

  function autoTunerRaytraceCanEvaluate(lensState, wavePreset = "d") {
    try {
      const L = clone(lensState);
      recomputeSurfacePositionsForLens(L);
      const surfaces = L?.surfaces || [];
      if (!surfaces.length) return false;
      const bundles = [
        buildRays(surfaces, 0, 7, getFocusChartDistanceMm()),
        buildDebugCenterRays(surfaces, 7),
      ];
      for (const rays of bundles) {
        let reached = 0;
        for (let i = 0; i < rays.length; i++) {
          const tr = traceRayForward(clone(rays[i]), surfaces, wavePreset, { rayIndex: i });
          if (tr && tr.reachedIMS && !tr.tir && tr.endRay?.p) reached++;
        }
        if (reached > 0) return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function validateAutoTunerLensState(lensState, config = {}) {
    const limits = getAutoTunerLimits(config);
    recomputeSurfacePositionsForLens(lensState);
    if (config?.originalLens) recomputeSurfacePositionsForLens(config.originalLens);
    const surfaces = lensState?.surfaces;
    const original = config?.originalLens;
    const originalSurfaces = original?.surfaces;
    if (!Array.isArray(surfaces) || surfaces.length < 2) {
      return { ok: false, reason: "missing surfaces" };
    }
    if (originalSurfaces && surfaces.length !== originalSurfaces.length) {
      return { ok: false, reason: "surface count changed" };
    }

    const lastIdx = surfaces.length - 1;
    if (String(surfaces[0]?.type || "").toUpperCase() !== "OBJ") return { ok: false, reason: "OBJ changed" };
    if (String(surfaces[lastIdx]?.type || "").toUpperCase() !== "IMS") return { ok: false, reason: "IMS changed" };

    if (originalSurfaces) {
      for (let i = 0; i < surfaces.length; i++) {
        if (autoTunerSurfaceSignature(surfaces[i]) !== autoTunerSurfaceSignature(originalSurfaces[i])) {
          return { ok: false, reason: `surface ${i} label/type/stop changed` };
        }
      }
    }

    const stopIdx = findStopSurfaceIndex(surfaces);
    const originalStopIdx = originalSurfaces ? findStopSurfaceIndex(originalSurfaces) : stopIdx;
    if (stopIdx < 0 || (originalSurfaces && stopIdx !== originalStopIdx)) {
      return { ok: false, reason: "STOP changed" };
    }

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const type = String(s?.type || "").toUpperCase();
      const R = Number(s?.R ?? 0);
      const t = Number(s?.t ?? 0);
      const ap = Number(s?.ap_optical ?? s?.ap);
      if (!Number.isFinite(R) || !Number.isFinite(t) || !Number.isFinite(ap)) {
        return { ok: false, reason: `surface ${i} has NaN/Infinity` };
      }
      if (i === 0 && Math.abs(t) > 1e-9) return { ok: false, reason: "OBJ thickness changed" };
      if (t < -1e-9) return { ok: false, reason: `surface ${i} has negative thickness` };
      if (type !== "OBJ" && ap <= 0) return { ok: false, reason: `surface ${i} has non-positive aperture` };

      if (Math.abs(R) > 1e-9) {
        const ar = Math.abs(R);
        if (ar < limits.minRadiusAbs || ar > limits.maxRadiusAbs) {
          return { ok: false, reason: `surface ${i} radius out of bounds` };
        }
      }

      if (i > 0 && i < lastIdx) {
        const isAir = isAirSurfaceMedium(s);
        const minT = isAir ? limits.minAirGap : limits.minGlassT;
        const maxT = isAir ? limits.maxAirGap : limits.maxGlassT;
        if (t + 1e-9 < minT) return { ok: false, reason: `surface ${i} thickness below minimum` };
        if (t - 1e-9 > maxT) return { ok: false, reason: `surface ${i} thickness above maximum` };
      }

      if (originalSurfaces && !config.allowRadiusSignFlip) {
        const oR = Number(originalSurfaces[i]?.R ?? 0);
        if (Math.abs(oR) < 1e-9 && Math.abs(R) > 1e-9) {
          return { ok: false, reason: `surface ${i} plane changed` };
        }
        if (Math.abs(oR) > 1e-9 && Math.sign(oR) !== Math.sign(R)) {
          return { ok: false, reason: `surface ${i} radius sign changed` };
        }
      }

      const guard = validateSurfaceForRaytrace(s, i);
      if (!guard.ok) return { ok: false, reason: guard.reason || `surface ${i} invalid` };
    }

    const crossing = checkAutoTunerSurfaceCrossings(lensState, config);
    if (!crossing.ok) {
      if (!config.strictPhysicalValidation && autoTunerRaytraceCanEvaluate(lensState, config.wavePreset || "d")) {
        return {
          ok: true,
          reason: crossing.reason,
          warnings: [crossing.reason],
          softPenalty: 2.5 + Math.min(25, Math.abs(Number(crossing?.diagnostic?.edgeClearanceMm || 0)) * 8),
          diagnostic: crossing.diagnostic,
          category: "crossing",
        };
      }
      return crossing;
    }

    return { ok: true, reason: "" };
  }

  function evaluateSpotSpreadAtIMS(surfaces, wavePreset, fieldAngleDeg, rayCount = 13, objectDistanceMm = null, sensorShift = 0) {
    computeVertices(surfaces, 0, Number(sensorShift) || 0);
    const count = Math.max(5, Math.min(31, Number(rayCount) | 0));
    const finiteObj = Number(objectDistanceMm);
    const objDist = Number.isFinite(finiteObj) && finiteObj > 0.1 ? finiteObj : null;
    let bundle = null;
    try {
      bundle = buildEntrancePupilLimitedRays(surfaces, count, fieldAngleDeg, wavePreset, objDist);
    } catch (_) {
      bundle = null;
    }
    const rays = Array.isArray(bundle?.rays) && bundle.rays.length
      ? bundle.rays
      : buildRays(surfaces, fieldAngleDeg, count, objDist);
    const hits = [];
    let traced = 0;
    let vignetted = 0;
    let tir = 0;
    for (let i = 0; i < rays.length; i++) {
      traced++;
      const tr = traceRayForward(clone(rays[i]), surfaces, wavePreset, { rayIndex: i });
      if (!tr || tr.tir) { tir++; continue; }
      if (tr.vignetted) { vignetted++; continue; }
      if (!tr.reachedIMS || !tr.endRay?.p) continue;
      const y = Number(tr.endRay.p.y);
      if (Number.isFinite(y)) hits.push(y);
    }
    const hitRate = traced > 0 ? hits.length / traced : 0;
    if (hits.length < 3) {
      return {
        ok: false,
        rmsMm: null,
        maxRadiusMm: null,
        centroidMm: null,
        hitRate,
        traced,
        hits: hits.length,
        vignetted,
        tir,
      };
    }
    const centroid = hits.reduce((sum, y) => sum + y, 0) / hits.length;
    const rms = Math.sqrt(hits.reduce((sum, y) => sum + (y - centroid) ** 2, 0) / hits.length);
    const maxRadius = hits.reduce((m, y) => Math.max(m, Math.abs(y - centroid)), 0);
    return {
      ok: true,
      rmsMm: rms,
      maxRadiusMm: maxRadius,
      centroidMm: centroid,
      hitRate,
      traced,
      hits: hits.length,
      vignetted,
      tir,
    };
  }

  function autoTunerSpotScore(spot) {
    const rms = Number(spot?.rmsMm);
    const hitRate = Number(spot?.hitRate || 0);
    if (!spot?.ok || !Number.isFinite(rms)) return 50 + Math.max(0, 1 - hitRate) * 50;
    return rms * (1 + Math.max(0, 0.9 - hitRate) * 4);
  }

  function findBestFocusShiftAtIMS(surfaces, wavePreset, fieldAngleDeg, objectDistanceMm, startShift = 0, rayCount = 11) {
    const parax = estimateEflBflParaxial(surfaces, wavePreset);
    const efl = Number(parax?.efl);
    const range = Math.max(1.2, Math.min(18, Number.isFinite(efl) && efl > 0 ? efl * 0.16 : 8));
    const coarseStep = Math.max(0.30, range / 8);
    const fineStep = Math.max(0.06, coarseStep / 5);
    let bestShift = Number.isFinite(Number(startShift)) ? Number(startShift) : 0;
    let bestSpot = evaluateSpotSpreadAtIMS(surfaces, wavePreset, fieldAngleDeg, rayCount, objectDistanceMm, bestShift);
    let bestScore = autoTunerSpotScore(bestSpot);

    for (let x = bestShift - range; x <= bestShift + range + 1e-9; x += coarseStep) {
      const spot = evaluateSpotSpreadAtIMS(surfaces, wavePreset, fieldAngleDeg, rayCount, objectDistanceMm, x);
      const score = autoTunerSpotScore(spot);
      if (score < bestScore) {
        bestScore = score;
        bestSpot = spot;
        bestShift = x;
      }
    }

    for (let x = bestShift - coarseStep; x <= bestShift + coarseStep + 1e-9; x += fineStep) {
      const spot = evaluateSpotSpreadAtIMS(surfaces, wavePreset, fieldAngleDeg, rayCount, objectDistanceMm, x);
      const score = autoTunerSpotScore(spot);
      if (score < bestScore) {
        bestScore = score;
        bestSpot = spot;
        bestShift = x;
      }
    }

    computeVertices(surfaces, 0, 0);
    return {
      shiftMm: bestShift,
      score: bestScore,
      spot: bestSpot,
      rmsMm: Number.isFinite(Number(bestSpot?.rmsMm)) ? Number(bestSpot.rmsMm) : null,
      hitRate: Number.isFinite(Number(bestSpot?.hitRate)) ? Number(bestSpot.hitRate) : null,
    };
  }

  function getAutoTunerFieldAngles(sensorDiag, efl) {
    const halfDiag = Math.max(0, Number(sensorDiag) || 0) * 0.5;
    const f = Number(efl);
    const cornerFieldDeg = (Number.isFinite(f) && f > 0 && halfDiag > 0)
      ? Math.max(0, Math.min(55, rad2deg(Math.atan(halfDiag / f))))
      : 0;
    return {
      center: 0,
      mid: cornerFieldDeg * 0.5,
      corner: cornerFieldDeg,
    };
  }

  function evaluateFieldFocusMetricsAtIMS(lensState, opts = {}) {
    const L = clone(lensState);
    const surfaces = L?.surfaces || [];
    if (!surfaces.length) return null;
    clampAllApertures(surfaces);
    recomputeSurfacePositionsForLens(L);
    const wavePreset = String(opts.wavePreset || ui.wavePreset?.value || "d");
    const { w: sensorW, h: sensorH } = getSensorWH();
    const sensorDiag = Math.hypot(sensorW, sensorH);
    const parax = estimateEflBflParaxial(surfaces, wavePreset);
    const efl = finiteOrNull(parax?.efl);
    const angles = getAutoTunerFieldAngles(sensorDiag, efl);
    const objectDistanceMm = Number.isFinite(Number(opts.objectDistanceMm))
      ? Number(opts.objectDistanceMm)
      : getFocusChartDistanceMm();
    const rayCount = Math.max(7, Math.min(17, Number(opts.rayCount) || 11));

    const current = {
      center: evaluateSpotSpreadAtIMS(surfaces, wavePreset, angles.center, rayCount, objectDistanceMm, 0),
      mid: evaluateSpotSpreadAtIMS(surfaces, wavePreset, angles.mid, rayCount, objectDistanceMm, 0),
      corner: evaluateSpotSpreadAtIMS(surfaces, wavePreset, angles.corner, rayCount, objectDistanceMm, 0),
    };
    const focus = {
      center: findBestFocusShiftAtIMS(surfaces, wavePreset, angles.center, objectDistanceMm, 0, rayCount),
      mid: findBestFocusShiftAtIMS(surfaces, wavePreset, angles.mid, objectDistanceMm, 0, rayCount),
      corner: findBestFocusShiftAtIMS(surfaces, wavePreset, angles.corner, objectDistanceMm, 0, rayCount),
    };
    const centerShift = Number(focus.center?.shiftMm);
    const cornerShift = Number(focus.corner?.shiftMm);
    const delta = Number.isFinite(centerShift) && Number.isFinite(cornerShift) ? (cornerShift - centerShift) : null;

    return {
      angles,
      sensorDiag,
      efl,
      current,
      focus,
      centerBestShiftMm: Number.isFinite(centerShift) ? centerShift : null,
      cornerBestShiftMm: Number.isFinite(cornerShift) ? cornerShift : null,
      fieldCurvatureDeltaMm: Number.isFinite(delta) ? delta : null,
      centerBestRmsMm: Number.isFinite(Number(focus.center?.rmsMm)) ? Number(focus.center.rmsMm) : null,
      midBestRmsMm: Number.isFinite(Number(focus.mid?.rmsMm)) ? Number(focus.mid.rmsMm) : null,
      cornerBestRmsMm: Number.isFinite(Number(focus.corner?.rmsMm)) ? Number(focus.corner.rmsMm) : null,
      centerCurrentRmsMm: Number.isFinite(Number(current.center?.rmsMm)) ? Number(current.center.rmsMm) : null,
      midCurrentRmsMm: Number.isFinite(Number(current.mid?.rmsMm)) ? Number(current.mid.rmsMm) : null,
      cornerCurrentRmsMm: Number.isFinite(Number(current.corner?.rmsMm)) ? Number(current.corner.rmsMm) : null,
    };
  }

  function pctText(value, digits = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : "—";
  }

  function summarizeCornerFocusDiagnostic(metrics, autoMetrics = null) {
    const notes = [];
    const delta = Number(metrics?.fieldCurvatureDeltaMm);
    const centerBest = Number(metrics?.centerBestRmsMm);
    const cornerBest = Number(metrics?.cornerBestRmsMm);
    const cornerCurrent = Number(metrics?.cornerCurrentRmsMm);
    const cornerHit = Number(metrics?.current?.corner?.hitRate ?? metrics?.focus?.corner?.hitRate);
    const cov = autoMetrics?.cov;
    const efl = Number(metrics?.efl);
    const curvatureThreshold = Math.max(0.35, Number.isFinite(efl) && efl > 0 ? efl * 0.008 : 0.45);

    if (cov === false || cornerHit < 0.55) {
      notes.push("Likely coverage/vignetting limitation: corner rays are not reliably reaching IMS.");
    }
    if (Number.isFinite(delta) && Math.abs(delta) > curvatureThreshold) {
      notes.push("Likely field curvature: corners focus at different plane.");
      notes.push("A weak rear field flattener or rear-group spacing may help before pushing stronger corner RMS optimization.");
    }
    if (Number.isFinite(cornerBest) && Number.isFinite(centerBest) && cornerBest > Math.max(0.08, centerBest * 2.5)) {
      notes.push("Likely coma/astigmatism: corner aberrations remain after refocus.");
    } else if (Number.isFinite(cornerBest) && Number.isFinite(cornerCurrent) && cornerBest < cornerCurrent * 0.70) {
      notes.push("Corner refocus improves RMS strongly, so focus-plane matching is worth tuning.");
    }
    if (!notes.length) {
      notes.push("No dominant corner failure detected by this meridional diagnostic. Try tuning stop position and rear group spacing while watching corner RMS.");
    }
    return notes;
  }

  function buildCornerFocusReport(lensState = lens) {
    const wavePreset = ui.wavePreset?.value || "d";
    const objectDistanceMm = getFocusChartDistanceMm();
    const fieldFocus = evaluateFieldFocusMetricsAtIMS(lensState, { wavePreset, objectDistanceMm, rayCount: 13 });
    const metrics = getAutoTunerMetrics(lensState, { wavePreset, objectDistanceMm, includeFieldFocus: false });
    const notes = summarizeCornerFocusDiagnostic(fieldFocus, metrics);
    return {
      wavePreset,
      objectDistanceMm,
      fieldFocus,
      metrics,
      notes,
      createdAt: new Date().toISOString(),
    };
  }

  function renderCornerFocusReport(report) {
    const ff = report?.fieldFocus || {};
    const metrics = report?.metrics || {};
    const row = (label, current, best) => `
      <tr>
        <td>${escapeAttr(label)}</td>
        <td>${mmText(current?.rmsMm, 4)}</td>
        <td>${pctText(current?.hitRate, 0)}</td>
        <td>${mmText(best?.shiftMm, 3)}</td>
        <td>${mmText(best?.rmsMm, 4)}</td>
        <td>${pctText(best?.hitRate, 0)}</td>
      </tr>
    `;

    if (ui.cfCenterShift) ui.cfCenterShift.textContent = mmText(ff.centerBestShiftMm, 3);
    if (ui.cfCornerShift) ui.cfCornerShift.textContent = mmText(ff.cornerBestShiftMm, 3);
    if (ui.cfFocusDelta) ui.cfFocusDelta.textContent = mmText(ff.fieldCurvatureDeltaMm, 3);
    if (ui.cfCOV) ui.cfCOV.textContent = metrics?.cov ? "YES" : "NO";
    if (ui.cfIC) ui.cfIC.textContent = mmText(metrics?.imageCircleMm, 1);
    if (ui.cfTableBody) {
      ui.cfTableBody.innerHTML = [
        row("Center", ff.current?.center, ff.focus?.center),
        row("Mid field", ff.current?.mid, ff.focus?.mid),
        row("Corner / edge", ff.current?.corner, ff.focus?.corner),
      ].join("");
    }
    const primary = report?.notes?.[0] || "Corner focus diagnostic complete.";
    if (ui.cfSummary) ui.cfSummary.textContent = primary;
    if (ui.cfNotes) {
      const detail = [
        ...((report?.notes || []).slice(1)),
        `Center current RMS: ${mmText(ff.centerCurrentRmsMm, 4)}; corner current RMS: ${mmText(ff.cornerCurrentRmsMm, 4)}.`,
        `Center best RMS: ${mmText(ff.centerBestRmsMm, 4)}; corner best RMS: ${mmText(ff.cornerBestRmsMm, 4)}.`,
      ].filter(Boolean).join("\n");
      ui.cfNotes.textContent = detail;
    }
  }

  function formatCornerFocusReportText(report) {
    const ff = report?.fieldFocus || {};
    const metrics = report?.metrics || {};
    const lines = [
      "Corner Focus Test",
      `Wave: ${report?.wavePreset || "—"}`,
      `Image circle: ${mmText(metrics?.imageCircleMm, 1)}; COV: ${metrics?.cov ? "YES" : "NO"}`,
      `Center best shift: ${mmText(ff.centerBestShiftMm, 3)}`,
      `Corner best shift: ${mmText(ff.cornerBestShiftMm, 3)}`,
      `Focus delta: ${mmText(ff.fieldCurvatureDeltaMm, 3)}`,
      `Center RMS current/best: ${mmText(ff.centerCurrentRmsMm, 4)} / ${mmText(ff.centerBestRmsMm, 4)}`,
      `Mid RMS current/best: ${mmText(ff.midCurrentRmsMm, 4)} / ${mmText(ff.midBestRmsMm, 4)}`,
      `Corner RMS current/best: ${mmText(ff.cornerCurrentRmsMm, 4)} / ${mmText(ff.cornerBestRmsMm, 4)}`,
      "",
      ...((report?.notes || []).map((n) => `- ${n}`)),
    ];
    return lines.join("\n");
  }

  let lastCornerFocusReport = null;

  function runCornerFocusTest() {
    try {
      lastCornerFocusReport = buildCornerFocusReport(lens);
      renderCornerFocusReport(lastCornerFocusReport);
      toast("Corner Focus Test complete", 1600);
    } catch (e) {
      const msg = e?.message || String(e);
      if (ui.cfSummary) ui.cfSummary.textContent = `Corner Focus Test failed: ${msg}`;
      if (ui.footerWarn) ui.footerWarn.textContent = `Corner Focus Test failed: ${msg}`;
    }
  }

  function openCornerFocusModal() {
    if (!ui.cornerFocusModal) return;
    ui.cornerFocusModal.classList.remove("hidden");
    ui.cornerFocusModal.setAttribute("aria-hidden", "false");
    runCornerFocusTest();
  }

  function closeCornerFocusModal() {
    if (!ui.cornerFocusModal) return;
    ui.cornerFocusModal.classList.add("hidden");
    ui.cornerFocusModal.setAttribute("aria-hidden", "true");
  }

  async function copyCornerFocusReport() {
    if (!lastCornerFocusReport) lastCornerFocusReport = buildCornerFocusReport(lens);
    try {
      await copyTextToClipboard(formatCornerFocusReportText(lastCornerFocusReport));
      toast("Copied Corner Focus report", 1600);
    } catch (e) {
      if (ui.cfSummary) ui.cfSummary.textContent = `Copy failed: ${e?.message || e}`;
    }
  }

  function getAutoTunerCompactLength(surfaces) {
    computeVertices(surfaces, 0, 0);
    const front = firstPhysicalVertexX(surfaces);
    const rear = lastPhysicalVertexX(surfaces);
    const len = rear - front;
    return Number.isFinite(len) && len > 0 ? len : null;
  }

  function getAutoTunerMetrics(lensState, opts = {}) {
    const L = clone(lensState);
    const surfaces = L?.surfaces || [];
    const wavePreset = String(opts.wavePreset || ui.wavePreset?.value || "d");
    clampAllApertures(surfaces);
    recomputeSurfacePositionsForLens(L);
    const { w: sensorW, h: sensorH, halfH } = getSensorWH();
    const sensorDiag = Math.hypot(sensorW, sensorH);
    const halfDiag = sensorDiag * 0.5;
    const sensorX = getSensorPlaneX(surfaces, 0);
    const parax = estimateEflBflParaxial(surfaces, wavePreset);
    const efl = finiteOrNull(parax?.efl);
    const bfl = finiteOrNull(parax?.bfl);
    const T = efl != null ? finiteOrNull(estimateTStopApprox(efl, surfaces, wavePreset)) : null;
    let maxFieldDiag = 0;
    let imageCircleMm = 0;
    try {
      maxFieldDiag = coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfDiag);
      if (efl != null && efl > 0 && Number.isFinite(maxFieldDiag)) {
        imageCircleMm = 2 * efl * Math.tan(deg2rad(maxFieldDiag));
      }
    } catch (_) {
      maxFieldDiag = 0;
      imageCircleMm = 0;
    }
    const covers = Number.isFinite(imageCircleMm) && imageCircleMm + 0.25 >= sensorDiag;
    const rearVx = lastPhysicalVertexX(surfaces);
    const plX = sensorX - PL_FFD;
    const rearClearance = Number.isFinite(rearVx) && Number.isFinite(plX) ? plX - rearVx : null;
    const compactLength = getAutoTunerCompactLength(surfaces);
    const objectDistanceMm = Number.isFinite(Number(opts.objectDistanceMm))
      ? Number(opts.objectDistanceMm)
      : getFocusChartDistanceMm();
    const fieldAngles = getAutoTunerFieldAngles(sensorDiag, efl);
    const cornerFieldDeg = fieldAngles.corner;
    const centerSpot = evaluateSpotSpreadAtIMS(surfaces, wavePreset, 0, 13, objectDistanceMm);
    const midSpot = evaluateSpotSpreadAtIMS(surfaces, wavePreset, fieldAngles.mid, 13, objectDistanceMm);
    const cornerSpot = evaluateSpotSpreadAtIMS(surfaces, wavePreset, cornerFieldDeg, 13, objectDistanceMm);
    const fieldFocus = opts.includeFieldFocus
      ? evaluateFieldFocusMetricsAtIMS(L, { wavePreset, objectDistanceMm, rayCount: opts.focusRayCount || 9 })
      : null;
    return {
      efl,
      bfl,
      T,
      imageCircleMm: Number.isFinite(imageCircleMm) ? imageCircleMm : 0,
      cov: covers,
      maxFieldDeg: maxFieldDiag,
      sensorW,
      sensorH,
      sensorDiag,
      halfH,
      sensorX,
      rearClearance,
      compactLength,
      centerSpot,
      midSpot,
      cornerSpot,
      fieldFocus,
      wavePreset,
    };
  }

  function evaluateLensMerit(lensState, targets = {}, weights = {}) {
    recomputeSurfacePositionsForLens(lensState);
    const validation = validateAutoTunerLensState(lensState, {
      limits: targets?.limits || targets?.safetyLimits || AUTO_TUNER_DEFAULT_LIMITS,
      originalLens: targets?.originalLens || null,
      allowRadiusSignFlip: !!targets?.allowRadiusSignFlip,
      strictPhysicalValidation: !!targets?.strictPhysicalValidation,
      wavePreset: targets?.wavePreset || ui.wavePreset?.value || "d",
    });
    if (!validation.ok) {
      let invalidMetrics = {};
      try {
        invalidMetrics = getAutoTunerMetrics(lensState, {
          wavePreset: targets?.wavePreset || ui.wavePreset?.value || "d",
          objectDistanceMm: targets?.objectDistanceMm,
        });
      } catch (_) {}
      return createInvalidMerit(validation.reason, invalidMetrics);
    }

    const fieldCurvGoal = goalConfig(targets, weights, "fieldCurvature", null);
    const metrics = getAutoTunerMetrics(lensState, {
      wavePreset: targets?.wavePreset || ui.wavePreset?.value || "d",
      objectDistanceMm: targets?.objectDistanceMm,
      includeFieldFocus: fieldCurvGoal.enabled,
    });
    const notes = [];
    const warnings = Array.isArray(validation?.warnings) ? validation.warnings.slice() : [];
    let total = Number(validation?.softPenalty || 0);

    const flGoal = goalConfig(targets, weights, "focalLength", null);
    const focalLengthError = (flGoal.enabled && Number.isFinite(flGoal.target) && flGoal.target > 0)
      ? (metrics.efl != null ? Math.abs(metrics.efl - flGoal.target) / flGoal.target : 1)
      : 0;
    if (flGoal.enabled) total += focalLengthError * flGoal.weight;

    const tGoal = goalConfig(targets, weights, "tStop", null);
    const tStopError = (tGoal.enabled && Number.isFinite(tGoal.target) && tGoal.target > 0)
      ? (metrics.T != null ? Math.abs(metrics.T - tGoal.target) / tGoal.target : 1)
      : 0;
    if (tGoal.enabled) total += tStopError * tGoal.weight;

    const icGoal = goalConfig(targets, weights, "imageCircle", null);
    const imageCircleError = (icGoal.enabled && Number.isFinite(icGoal.target) && icGoal.target > 0)
      ? Math.max(0, icGoal.target - Number(metrics.imageCircleMm || 0)) / icGoal.target
      : 0;
    if (icGoal.enabled) total += imageCircleError * icGoal.weight;

    const sharpNorm = Math.max(0.015, Number(targets?.sharpnessNormMm) || 0.08);
    const centerGoal = goalConfig(targets, weights, "centerSharpness", null);
    const centerSharpnessScore = metrics.centerSpot?.ok
      ? (Number(metrics.centerSpot.rmsMm) / sharpNorm) * (1 + Math.max(0, 0.9 - Number(metrics.centerSpot.hitRate || 0)) * 3)
      : 25;
    if (centerGoal.enabled) total += centerSharpnessScore * centerGoal.weight;

    const cornerGoal = goalConfig(targets, weights, "cornerSharpness", null);
    const cornerSharpnessScore = metrics.cornerSpot?.ok
      ? (Number(metrics.cornerSpot.rmsMm) / sharpNorm) * (1 + Math.max(0, 0.9 - Number(metrics.cornerSpot.hitRate || 0)) * 4)
      : 35;
    if (cornerGoal.enabled) total += cornerSharpnessScore * cornerGoal.weight;

    const fieldFocus = metrics.fieldFocus;
    const focusDelta = Number(fieldFocus?.fieldCurvatureDeltaMm);
    const cornerBestRms = Number(fieldFocus?.cornerBestRmsMm);
    const centerBestRms = Number(fieldFocus?.centerBestRmsMm);
    const fcNorm = Math.max(0.10, Number(targets?.fieldCurvatureNormMm) || 0.50);
    const fieldCurvatureScore = fieldCurvGoal.enabled
      ? (
          Number.isFinite(focusDelta)
            ? Math.abs(focusDelta) / fcNorm
            : 18
        ) + (
          Number.isFinite(cornerBestRms)
            ? (cornerBestRms / sharpNorm) * 0.85
            : 18
        ) + (
          Number.isFinite(centerBestRms)
            ? (centerBestRms / sharpNorm) * 0.30
            : 6
        )
      : 0;
    if (fieldCurvGoal.enabled) total += fieldCurvatureScore * fieldCurvGoal.weight;

    const vigGoal = goalConfig(targets, weights, "vignetting", null);
    const cornerHitRate = Number(metrics.cornerSpot?.hitRate || 0);
    const centerHitRate = Number(metrics.centerSpot?.hitRate || 0);
    let vignettingPenalty = Math.max(0, 1 - centerHitRate) * 1.5 + Math.max(0, 1 - cornerHitRate) * 3.0;
    if (!metrics.cov) vignettingPenalty += 1.5;
    if (vigGoal.enabled) total += vignettingPenalty * vigGoal.weight;

    const rearGoal = goalConfig(targets, weights, "rearClearance", 0);
    const rearTarget = Number.isFinite(rearGoal.target) ? rearGoal.target : 0;
    const rearClearance = Number(metrics.rearClearance);
    let rearIntrusionPenalty = 0;
    if (!Number.isFinite(rearClearance)) {
      rearIntrusionPenalty = 5;
    } else if (rearClearance < rearTarget) {
      rearIntrusionPenalty = (rearTarget - rearClearance) / Math.max(1, Math.abs(rearTarget) || 1);
      if (rearClearance < 0) rearIntrusionPenalty += Math.min(20, Math.abs(rearClearance));
    }
    if (metrics.bfl != null && rearGoal.enabled && metrics.bfl < rearTarget) {
      rearIntrusionPenalty += (rearTarget - metrics.bfl) / Math.max(1, Math.abs(rearTarget) || 1) * 0.5;
    }
    if (rearGoal.enabled) total += rearIntrusionPenalty * rearGoal.weight;

    const compactGoal = goalConfig(targets, weights, "compactness", null);
    const compactTarget = Number(compactGoal.target);
    const compactnessPenalty = (compactGoal.enabled && Number.isFinite(compactTarget) && compactTarget > 0 && Number.isFinite(metrics.compactLength))
      ? Math.max(0, metrics.compactLength - compactTarget) / compactTarget
      : 0;
    if (compactGoal.enabled) total += compactnessPenalty * compactGoal.weight;

    if (!metrics.cov) notes.push("COV NO");
    if (rearClearance < 0) notes.push("rear intrusion");
    if (!metrics.centerSpot?.ok) warnings.push("center spot weak");
    if (!metrics.cornerSpot?.ok) warnings.push("corner spot weak");
    if (validation?.softPenalty > 0) notes.push("soft crossing penalty");

    const totalScore = Number.isFinite(total) ? total : AUTO_TUNER_INVALID_SCORE;
    return {
      totalScore,
      focalLengthError,
      tStopError,
      imageCircleError,
      centerSharpnessScore,
      cornerSharpnessScore,
      fieldCurvatureScore,
      vignettingPenalty,
      rearIntrusionPenalty,
      invalidPenalty: 0,
      compactnessPenalty,
      notes,
      warnings,
      diagnostic: validation?.diagnostic || null,
      metrics,
    };
  }

  if (typeof window !== "undefined") {
    window.evaluateLensMerit = evaluateLensMerit;
  }

  function autoTunerOriginalLock(config, index, key) {
    const locks = config?.locks;
    const lock = Array.isArray(locks) ? locks[index] : null;
    return !!lock?.[key];
  }

  function setAutoTunerSurfaceAperture(s, ap) {
    const v = Math.max(AP_MIN, Number(ap) || AP_MIN);
    s.ap = v;
    s.ap_optical = v;
    if (s.ap_mech != null && String(s.ap_mech).trim() !== "") s.ap_mech = v;
  }

  function copyAutoTunerField(target, source, key) {
    if (!target || !source) return;
    if (key === "ap") {
      target.ap = source.ap;
      target.ap_optical = source.ap_optical;
      target.ap_mech = source.ap_mech;
      return;
    }
    target[key] = source[key];
    if (key === "glass") {
      target.originalGlass = source.originalGlass;
      target.nd = source.nd;
      target.vd = source.vd;
      target.glass_nd = source.glass_nd;
      target.glass_vd = source.glass_vd;
    }
  }

  function repairAutoTunerCandidate(candidate, original, config) {
    const surfaces = candidate?.surfaces;
    const originalSurfaces = original?.surfaces;
    if (!Array.isArray(surfaces) || !Array.isArray(originalSurfaces) || surfaces.length !== originalSurfaces.length) {
      return { ok: false, reason: "surface count changed" };
    }
    const limits = getAutoTunerLimits(config);
    const lastIdx = surfaces.length - 1;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const o = originalSurfaces[i];
      if (!s || !o) return { ok: false, reason: `missing surface ${i}` };

      s.type = o.type;
      s.surfaceLabel = o.surfaceLabel;
      s.surfaceLabelAuto = o.surfaceLabelAuto;
      s.stop = !!o.stop;

      const isOBJ = i === 0 || String(o.type || "").toUpperCase() === "OBJ";
      const isIMS = i === lastIdx || String(o.type || "").toUpperCase() === "IMS";
      if (isOBJ) {
        Object.assign(s, clone(o), { type: "OBJ", surfaceLabel: "OBJ", surfaceLabelAuto: true, stop: false, t: 0 });
        continue;
      }
      if (isIMS) {
        const keepAp = !config?.allowIMSAperture;
        const next = clone(o);
        if (!keepAp) {
          next.ap = s.ap;
          next.ap_optical = s.ap_optical;
          next.ap_mech = s.ap_mech;
        }
        Object.assign(s, next, { type: "IMS", surfaceLabel: "IMS", surfaceLabelAuto: true, stop: false });
        if (!config?.allowSensorShift) s.t = o.t;
      }

      if (autoTunerOriginalLock(config, i, "R")) copyAutoTunerField(s, o, "R");
      if (autoTunerOriginalLock(config, i, "t")) copyAutoTunerField(s, o, "t");
      if (autoTunerOriginalLock(config, i, "ap")) copyAutoTunerField(s, o, "ap");
      if (autoTunerOriginalLock(config, i, "glass")) copyAutoTunerField(s, o, "glass");

      const oR = Number(o.R || 0);
      let R = Number(s.R || 0);
      if (!Number.isFinite(R)) R = oR;
      if (!config?.allowRadiusSignFlip) {
        if (Math.abs(oR) < 1e-9) R = 0;
        else R = Math.sign(oR) * Math.abs(R || oR);
      }
      if (Math.abs(R) > 1e-9) {
        const ar = clamp(Math.abs(R), limits.minRadiusAbs, limits.maxRadiusAbs);
        R = Math.sign(R) * ar;
      }
      s.R = R;

      if (i > 0 && i < lastIdx) {
        const isAir = isAirSurfaceMedium(s);
        const minT = isAir ? limits.minAirGap : limits.minGlassT;
        const maxT = isAir ? limits.maxAirGap : limits.maxGlassT;
        const tRaw = Number(s.t);
        const tFallback = Number.isFinite(Number(o.t)) ? Number(o.t) : minT;
        s.t = clamp(Number.isFinite(tRaw) ? tRaw : tFallback, minT, maxT);
      }

      if (String(s.type || "").toUpperCase() !== "OBJ") {
        const lim = maxApForSurface(s);
        const apRaw = Number(s.ap_optical ?? s.ap);
        const apFallback = Number.isFinite(Number(o.ap_optical ?? o.ap)) ? Number(o.ap_optical ?? o.ap) : AP_MIN;
        const ap = clamp(Number.isFinite(apRaw) ? apRaw : apFallback, AP_MIN, Math.max(AP_MIN, lim));
        setAutoTunerSurfaceAperture(s, ap);
      }

      if (s.glass !== o.glass && !config?.allowed?.glassTypes) {
        copyAutoTunerField(s, o, "glass");
      }
    }

    generateSurfaceLabels(surfaces);
    clampAllApertures(surfaces);
    recomputeSurfacePositionsForLens(candidate);
    const validation = validateAutoTunerLensState(candidate, {
      ...config,
      originalLens: original,
    });
    return validation;
  }

  function makeAutoTunerRng(seedValue) {
    const text = String(seedValue ?? "").trim();
    if (!text) return Math.random;
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6D2B79F5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function autoTunerSignedRandom(rng) {
    return (rng() + rng()) - 1;
  }

  function autoTunerStepProfile(stepSize) {
    const key = String(stepSize || "small");
    if (key === "large") {
      return { rRel: 0.10, airAbs: 0.90, glassAbs: 0.35, tRel: 0.12, apAbs: 0.35, apRel: 0.08 };
    }
    if (key === "medium") {
      return { rRel: 0.045, airAbs: 0.35, glassAbs: 0.16, tRel: 0.055, apAbs: 0.16, apRel: 0.04 };
    }
    return { rRel: 0.018, airAbs: 0.12, glassAbs: 0.06, tRel: 0.022, apAbs: 0.07, apRel: 0.018 };
  }

  function autoTunerMutableGlassPool() {
    return Object.keys(GLASS_DB).filter((name) => name !== "AIR").sort();
  }

  function autoTunerOpCategory(op) {
    if (!op) return "unknown";
    return `${op.kind}:${op.group || "default"}`;
  }

  function collectAutoTunerMutationOps(baseLens, config, originalLens) {
    const surfaces = baseLens?.surfaces || [];
    const originalSurfaces = originalLens?.surfaces || [];
    const ops = [];
    const seen = new Set();
    const stopIdx = findStopSurfaceIndex(surfaces);
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    const lastIdx = imsIdx >= 0 ? imsIdx : surfaces.length - 1;
    const allowed = config?.allowed || {};
    const limits = getAutoTunerLimits(config);

    const add = (op) => {
      const key = `${op.kind}:${op.i}:${op.group || ""}`;
      if (seen.has(key)) return;
      if (config?.disabledMutationGroups?.has?.(autoTunerOpCategory(op))) return;
      seen.add(key);
      ops.push(op);
    };

    for (let i = 1; i < lastIdx; i++) {
      const s = surfaces[i];
      const o = originalSurfaces[i] || s;
      const type = String(s?.type || "").toUpperCase();
      const isStop = !!s?.stop || type === "STOP";
      const isAir = isAirSurfaceMedium(s);
      const isFF = isFieldFlattenerSurface(s);
      const isFFGap = isFieldFlattenerAirGapSurface(surfaces, i);

      if (allowed.radii && !isFF && !isStop && !autoTunerOriginalLock(config, i, "R")) {
        const r0 = Number(o?.R ?? s?.R ?? 0);
        if (Math.abs(r0) >= limits.minRadiusAbs && isPhysicalSurfaceType(type)) add({ kind: "R", i });
      }

      if (allowed.airGaps && isAir && !isFFGap && !autoTunerOriginalLock(config, i, "t")) add({ kind: "t", i, group: "air" });
      if (allowed.glassThicknesses && !isAir && !isFF && !autoTunerOriginalLock(config, i, "t")) add({ kind: "t", i, group: "glass" });
      if (allowed.stopAperture && isStop && !autoTunerOriginalLock(config, i, "ap")) add({ kind: "ap", i, group: "stop" });
      if (allowed.clearApertures && !isStop && !isFF && !autoTunerOriginalLock(config, i, "ap")) add({ kind: "ap", i, group: "clear" });
      if (allowed.glassTypes && !isAir && !isFF && !autoTunerOriginalLock(config, i, "glass")) add({ kind: "glass", i });

      if (allowed.stopPosition && stopIdx >= 0 && (i === stopIdx || i === stopIdx - 1) && isAir && !isFFGap && !autoTunerOriginalLock(config, i, "t")) {
        add({ kind: "t", i, group: "stop" });
      }
      if (allowed.rearGroupSpacing && stopIdx >= 0 && i > stopIdx && isAir && !isFFGap && !autoTunerOriginalLock(config, i, "t")) {
        add({ kind: "t", i, group: "rearGroup" });
      }
      if (allowed.frontGroupSpacing && stopIdx >= 0 && i < stopIdx && isAir && !isFFGap && !autoTunerOriginalLock(config, i, "t")) {
        add({ kind: "t", i, group: "frontGroup" });
      }
    }

    if (allowed.rearElementSpacing) {
      for (let i = lastIdx - 1; i >= 1; i--) {
        const s = surfaces[i];
        if (isAirSurfaceMedium(s) && !isFieldFlattenerAirGapSurface(surfaces, i) && !autoTunerOriginalLock(config, i, "t")) {
          add({ kind: "t", i, group: "rearElement" });
          break;
        }
      }
    }

    const ffIndices = findFieldFlattenerIndices(surfaces);
    if (ffIndices.length) {
      if (allowed.fieldFlattenerRadii) {
        for (const i of ffIndices) {
          const s = surfaces[i];
          const type = String(s?.type || "").toUpperCase();
          const r0 = Number(s?.R ?? 0);
          if (Math.abs(r0) >= limits.minRadiusAbs && isPhysicalSurfaceType(type) && !autoTunerOriginalLock(config, i, "R")) {
            add({ kind: "R", i, group: "fieldFlattenerR" });
          }
        }
      }
      if (allowed.fieldFlattenerThickness) {
        for (const i of ffIndices) {
          const s = surfaces[i];
          if (!isAirSurfaceMedium(s) && !autoTunerOriginalLock(config, i, "t")) {
            add({ kind: "t", i, group: "fieldFlattenerThickness" });
          }
        }
      }
      if (allowed.fieldFlattenerPosition) {
        const first = Math.min(...ffIndices);
        const last = Math.max(...ffIndices);
        const frontGap = first - 1;
        if (frontGap >= 1 && isAirSurfaceMedium(surfaces[frontGap]) && !autoTunerOriginalLock(config, frontGap, "t")) {
          add({ kind: "t", i: frontGap, group: "fieldFlattenerPosition" });
        }
        if (last >= 1 && last < lastIdx && isAirSurfaceMedium(surfaces[last]) && !autoTunerOriginalLock(config, last, "t")) {
          add({ kind: "t", i: last, group: "fieldFlattenerPosition" });
        }
      }
    }

    return ops;
  }

  function applyAutoTunerMutation(candidate, op, config, rng) {
    const s = candidate?.surfaces?.[op?.i];
    if (!s) return false;
    const profile = autoTunerStepProfile(config?.stepSize);
    const limits = getAutoTunerLimits(config);
    const scale = Math.max(0.05, Number(config?.stepScale || 1));
    const signed = autoTunerSignedRandom(rng || Math.random);

    if (op.kind === "R") {
      const current = Number(s.R || 0);
      if (!Number.isFinite(current) || Math.abs(current) < 1e-9) return false;
      const factor = Math.max(0.20, 1 + signed * profile.rRel * scale);
      const nextAbs = clamp(Math.abs(current) * factor, limits.minRadiusAbs, limits.maxRadiusAbs);
      s.R = Math.sign(current) * nextAbs;
      return true;
    }

    if (op.kind === "t") {
      const isAir = isAirSurfaceMedium(s);
      const absStep = (isAir ? profile.airAbs : profile.glassAbs) * scale;
      const relStep = Math.max(0.02, Math.abs(Number(s.t || 0)) * profile.tRel * scale);
      s.t = Number(s.t || 0) + signed * Math.max(absStep, relStep);
      return true;
    }

    if (op.kind === "ap") {
      const current = Number(s.ap_optical ?? s.ap ?? AP_MIN);
      const absStep = profile.apAbs * scale;
      const relStep = Math.max(0.02, Math.abs(current) * profile.apRel * scale);
      setAutoTunerSurfaceAperture(s, current + signed * Math.max(absStep, relStep));
      return true;
    }

    if (op.kind === "glass") {
      const pool = autoTunerMutableGlassPool();
      if (!pool.length) return false;
      const current = normalizeGlassInput(s.glass);
      let next = current;
      for (let tries = 0; tries < 8 && next === current; tries++) {
        next = pool[Math.floor((rng || Math.random)() * pool.length)] || current;
      }
      if (!next || next === current) return false;
      s.glass = next;
      s.originalGlass = next;
      s.nd = null;
      s.vd = null;
      s.glass_nd = null;
      s.glass_vd = null;
      return true;
    }

    return false;
  }

  function readAutoTunerConfig() {
    const currentMetrics = getAutoTunerMetrics(lens, { wavePreset: ui.wavePreset?.value || "d" });
    const compactLength = currentMetrics.compactLength || 1;
    const iterations = Math.max(1, Math.floor(num(ui.atIterations?.value, 1000)));
    const stopIfStuck = Math.max(0, Math.floor(num(ui.atStopStuck?.value, 350)));
    const limits = {
      minGlassT: num(ui.atMinGlass?.value, AUTO_TUNER_DEFAULT_LIMITS.minGlassT),
      minAirGap: num(ui.atMinAir?.value, AUTO_TUNER_DEFAULT_LIMITS.minAirGap),
      maxGlassT: num(ui.atMaxGlass?.value, AUTO_TUNER_DEFAULT_LIMITS.maxGlassT),
      maxAirGap: num(ui.atMaxAir?.value, AUTO_TUNER_DEFAULT_LIMITS.maxAirGap),
      minRadiusAbs: num(ui.atMinRadius?.value, AUTO_TUNER_DEFAULT_LIMITS.minRadiusAbs),
      maxRadiusAbs: num(ui.atMaxRadius?.value, AUTO_TUNER_DEFAULT_LIMITS.maxRadiusAbs),
    };
    const targets = {
      wavePreset: ui.wavePreset?.value || "d",
      objectDistanceMm: getFocusChartDistanceMm(),
      limits,
      allowRadiusSignFlip: !!ui.atAllowRSignFlip?.checked,
      strictPhysicalValidation: !!ui.atStrictValidation?.checked,
      focalLength: { enabled: !!ui.atGoalFL?.checked, target: num(ui.atTargetFL?.value, currentMetrics.efl || 50) },
      tStop: { enabled: !!ui.atGoalT?.checked, target: num(ui.atTargetT?.value, currentMetrics.T || 2) },
      imageCircle: { enabled: !!ui.atGoalIC?.checked, target: num(ui.atTargetIC?.value, 45) },
      centerSharpness: { enabled: !!ui.atGoalCenter?.checked },
      cornerSharpness: { enabled: !!ui.atGoalCorner?.checked },
      fieldCurvature: { enabled: !!ui.atGoalFieldCurv?.checked },
      vignetting: { enabled: !!ui.atGoalVig?.checked },
      rearClearance: { enabled: !!ui.atGoalRear?.checked, target: num(ui.atTargetRear?.value, 0) },
      compactness: { enabled: !!ui.atGoalCompact?.checked, target: compactLength },
    };
    const weights = {
      focalLength: num(ui.atWeightFL?.value, 5),
      tStop: num(ui.atWeightT?.value, 4),
      imageCircle: num(ui.atWeightIC?.value, 7),
      centerSharpness: num(ui.atWeightCenter?.value, 6),
      cornerSharpness: num(ui.atWeightCorner?.value, 7),
      fieldCurvature: num(ui.atWeightFieldCurv?.value, 6),
      vignetting: num(ui.atWeightVig?.value, 7),
      rearClearance: num(ui.atWeightRear?.value, 4),
      compactness: num(ui.atWeightCompact?.value, 3),
    };
    const strictFLTLock = ui.atStrictFLTLock ? !!ui.atStrictFLTLock.checked : true;
    const hardConstraints = {
      strictFLTLock,
      focalLength: {
        enabled: strictFLTLock && !!ui.atGoalFL?.checked && !!ui.atHardFL?.checked,
        target: targets.focalLength.target,
        tolerance: Math.max(0, num(ui.atTolFL?.value, 1.0)),
      },
      tStop: {
        enabled: strictFLTLock && !!ui.atGoalT?.checked && !!ui.atHardT?.checked,
        target: targets.tStop.target,
        tolerance: Math.max(0, num(ui.atTolT?.value, 0.15)),
      },
      imageCircle: {
        enabled: !!ui.atGoalIC?.checked && !!ui.atHardIC?.checked,
        minimum: Math.max(0, num(ui.atMinIC?.value, targets.imageCircle.target || 45)),
      },
    };
    return {
      iterations,
      stopIfStuck,
      stepSize: String(ui.atStepSize?.value || "small"),
      runSpeed: String(ui.atRunSpeed?.value || "safe"),
      autoReduce: !!ui.atAutoReduce?.checked,
      anneal: !!ui.atAnneal?.checked,
      seed: String(ui.atSeed?.value || ""),
      limits,
      allowSensorShift: !!ui.atAllowSensorShift?.checked,
      allowIMSAperture: !!ui.atAllowIMSAp?.checked,
      allowRadiusSignFlip: !!ui.atAllowRSignFlip?.checked,
      strictPhysicalValidation: !!ui.atStrictValidation?.checked,
      allowed: {
        radii: !!ui.atVarR?.checked,
        airGaps: !!ui.atVarAirT?.checked,
        glassThicknesses: !!ui.atVarGlassT?.checked,
        stopAperture: !!ui.atVarStopAp?.checked,
        stopPosition: !!ui.atVarStopT?.checked,
        clearApertures: !!ui.atVarAp?.checked,
        rearElementSpacing: !!ui.atVarRearSpacing?.checked,
        frontGroupSpacing: !!ui.atVarFrontGroup?.checked,
        rearGroupSpacing: !!ui.atVarRearGroup?.checked,
        glassTypes: !!ui.atVarGlass?.checked,
        fieldFlattenerRadii: !!ui.atVarFFR?.checked,
        fieldFlattenerPosition: !!ui.atVarFFPos?.checked,
        fieldFlattenerThickness: !!ui.atVarFFThick?.checked,
      },
      locks: (lens.surfaces || []).map((_, i) => getAutoTunerSurfaceLock(i)),
      targets,
      weights,
      hardConstraints,
      stepScale: 1,
    };
  }

  function cancelAutoTunerTimer() {
    if (!autoTunerState.timer) return;
    if (autoTunerState.timerKind === "idle" && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(autoTunerState.timer);
    } else {
      clearTimeout(autoTunerState.timer);
    }
    autoTunerState.timer = 0;
    autoTunerState.timerKind = "";
  }

  function autoTunerBatchSettings(runSpeed) {
    const speed = String(runSpeed || "safe");
    if (speed === "aggressive") return { budgetMs: 24, maxBatch: 90, delayMs: 0, updateEvery: 100 };
    if (speed === "fast") return { budgetMs: 16, maxBatch: 45, delayMs: 0, updateEvery: 75 };
    return { budgetMs: 8, maxBatch: 14, delayMs: 12, updateEvery: 50 };
  }

  function updateAutoTunerButtons() {
    const running = !!autoTunerState.running;
    const hasOriginal = !!autoTunerState.originalLens;
    const hasBest = !!autoTunerState.bestLens;
    if (ui.atStart) ui.atStart.disabled = running;
    if (ui.atPause) {
      ui.atPause.disabled = !running;
      ui.atPause.textContent = autoTunerState.paused ? "Resume" : "Pause";
    }
    if (ui.atStop) ui.atStop.disabled = !running;
    if (ui.atPreviewBest) ui.atPreviewBest.disabled = !hasBest || running;
    if (ui.atApplyBest) ui.atApplyBest.disabled = !hasBest || running;
    if (ui.atRevert) ui.atRevert.disabled = !hasOriginal || running;
    if (ui.atCopyDiagnostics) ui.atCopyDiagnostics.disabled = !autoTunerState.diagnostics;
    if (ui.atCopyBest) ui.atCopyBest.disabled = !hasBest;
    if (ui.atSaveBest) ui.atSaveBest.disabled = !hasBest;
  }

  function renderAutoTunerHistory() {
    if (!ui.atHistoryBody) return;
    ui.atHistoryBody.innerHTML = autoTunerState.history.map((h) => `
      <tr>
        <td>${h.iteration}</td>
        <td>${scoreText(h.score, 4)}</td>
        <td>${mmText(h.efl)}</td>
        <td>${h.T == null ? "—" : Number(h.T).toFixed(2)}</td>
        <td>${mmText(h.imageCircleMm, 1)}</td>
        <td>${mmText(h.bfl)}</td>
        <td>${escapeAttr((h.notes || []).join(", "))}</td>
      </tr>
    `).join("");
  }

  function updateAutoTunerProgress(force = false) {
    const cfg = autoTunerState.config || {};
    const totalIter = Number(cfg.iterations || 0);
    const iter = Number(autoTunerState.iteration || 0);
    const best = autoTunerState.bestMerit;
    const cur = autoTunerState.currentMerit || autoTunerState.acceptedMerit;
    const origScore = Number(autoTunerState.originalMerit?.totalScore);
    const bestScore = Number(best?.totalScore);
    const bestIterRaw = Number(autoTunerState.bestIteration);
    const hasBestIter = !!autoTunerState.bestLens && Number.isFinite(bestIterRaw);
    const bestIter = hasBestIter ? Math.max(0, Math.floor(bestIterRaw)) : null;
    const sinceBest = hasBestIter ? Math.max(0, iter - bestIter) : null;
    const progressPct = totalIter > 0 ? clamp((iter / totalIter) * 100, 0, 100) : 0;
    const improvement = Number.isFinite(origScore) && Number.isFinite(bestScore) && Math.abs(origScore) > 1e-12
      ? ((origScore - bestScore) / Math.abs(origScore)) * 100
      : null;

    if (!force && iter === autoTunerState.lastUiIteration) return;
    autoTunerState.lastUiIteration = iter;
    if (ui.atProgressFill) ui.atProgressFill.style.width = `${progressPct.toFixed(1)}%`;
    if (ui.atMetricIteration) ui.atMetricIteration.textContent = `${iter} / ${totalIter || 0}`;
    if (ui.atMetricBestScore) ui.atMetricBestScore.textContent = scoreText(bestScore);
    if (ui.atMetricBestIter) ui.atMetricBestIter.textContent = hasBestIter ? String(bestIter) : "—";
    if (ui.atMetricSinceBest) ui.atMetricSinceBest.textContent = hasBestIter ? String(sinceBest) : "—";
    if (ui.atMetricCurrentScore) ui.atMetricCurrentScore.textContent = scoreText(cur?.totalScore);
    if (ui.atMetricImprovement) ui.atMetricImprovement.textContent = Number.isFinite(improvement) ? `${improvement.toFixed(2)}%` : "—";
    if (ui.atMetricAccepted) ui.atMetricAccepted.textContent = String(autoTunerState.acceptedMoves || 0);
    if (ui.atMetricRejected) ui.atMetricRejected.textContent = String(autoTunerState.rejectedMoves || 0);
    if (ui.atMetricInvalid) ui.atMetricInvalid.textContent = String(autoTunerState.invalidMoves || 0);
    if (ui.atMetricHardFL) ui.atMetricHardFL.textContent = String(autoTunerState.hardRejectedFL || 0);
    if (ui.atMetricHardT) ui.atMetricHardT.textContent = String(autoTunerState.hardRejectedT || 0);
    if (ui.atMetricHardIC) ui.atMetricHardIC.textContent = String(autoTunerState.hardRejectedIC || 0);
    if (ui.atMetricEFL) ui.atMetricEFL.textContent = mmText(best?.metrics?.efl);
    if (ui.atMetricT) ui.atMetricT.textContent = tText(best?.metrics?.T);
    if (ui.atMetricIC) ui.atMetricIC.textContent = mmText(best?.metrics?.imageCircleMm, 1);
    if (ui.atMetricCOV) ui.atMetricCOV.textContent = best?.metrics ? (best.metrics.cov ? "YES" : "NO") : "—";
    if (ui.atMetricBFL) ui.atMetricBFL.textContent = mmText(best?.metrics?.bfl);
    if (ui.atMetricCenterRMS) ui.atMetricCenterRMS.textContent = mmText(best?.metrics?.centerSpot?.rmsMm, 4);
    if (ui.atMetricCornerRMS) ui.atMetricCornerRMS.textContent = mmText(best?.metrics?.cornerSpot?.rmsMm, 4);
    if (ui.atMetricFieldCurv) ui.atMetricFieldCurv.textContent = mmText(best?.metrics?.fieldFocus?.fieldCurvatureDeltaMm, 3);
    if (ui.atMetricRear) ui.atMetricRear.textContent = mmText(best?.metrics?.rearClearance);

    const statusBits = [];
    if (autoTunerState.running) statusBits.push(autoTunerState.paused ? "Paused" : "Running");
    else statusBits.push(autoTunerState.stopReason || "Ready");
    if (hasBestIter) {
      statusBits.push(`best iter ${bestIter}`);
      statusBits.push(`since best ${sinceBest}`);
    }
    if (autoTunerState.lastMessage) statusBits.push(autoTunerState.lastMessage);
    statusBits.push(`accepted ${autoTunerState.acceptedMoves}`);
    statusBits.push(`rejected ${autoTunerState.rejectedMoves}`);
    if (autoTunerState.invalidMoves) statusBits.push(`invalid ${autoTunerState.invalidMoves}`);
    if (autoTunerState.hardRejectedFL) statusBits.push(`hard FL ${autoTunerState.hardRejectedFL}`);
    if (autoTunerState.hardRejectedT) statusBits.push(`hard T ${autoTunerState.hardRejectedT}`);
    if (autoTunerState.hardRejectedIC) statusBits.push(`hard IC ${autoTunerState.hardRejectedIC}`);
    if (hasBestIter && Number(cfg.stopIfStuck) > 0 && sinceBest > Number(cfg.stopIfStuck) * 0.75) {
      statusBits.push(`No improvement for ${sinceBest} iterations — probably safe to stop.`);
    }
    if (autoTunerState.noImprove) statusBits.push(`stuck ${autoTunerState.noImprove}`);
    if (ui.atStatus) ui.atStatus.textContent = statusBits.join(" • ");
    renderAutoTunerHistory();
    updateAutoTunerButtons();
  }

  function pushAutoTunerHistory(iteration, merit) {
    const metrics = merit?.metrics || {};
    autoTunerState.history.unshift({
      iteration,
      score: merit?.totalScore,
      efl: metrics.efl,
      T: metrics.T,
      imageCircleMm: metrics.imageCircleMm,
      bfl: metrics.bfl,
      notes: [...(merit?.notes || []), ...(merit?.warnings || [])].slice(0, 2),
    });
    autoTunerState.history = autoTunerState.history.slice(0, AUTO_TUNER_HISTORY_LIMIT);
  }

  function autoTunerShouldAccept(candidateMerit, acceptedMerit, config, rng) {
    const nextScore = Number(candidateMerit?.totalScore);
    const curScore = Number(acceptedMerit?.totalScore);
    if (!Number.isFinite(nextScore)) return false;
    if (!Number.isFinite(curScore)) return true;
    if (nextScore < curScore) return true;
    if (!config?.anneal) return false;
    const progress = config.iterations > 0 ? clamp(autoTunerState.iteration / config.iterations, 0, 1) : 1;
    const temp = Math.max(1e-9, Math.abs(curScore) * 0.015 * (1 - progress) * Math.max(0.1, autoTunerState.stepScale));
    const delta = nextScore - curScore;
    if (delta > temp * 3) return false;
    return (rng || Math.random)() < Math.exp(-delta / temp);
  }

  function recordAutoTunerInvalidCandidate(op, reason) {
    const category = autoTunerOpCategory(op);
    autoTunerState.invalidMoves++;
    autoTunerState.rejectedMoves++;
    autoTunerState.noImprove++;
    autoTunerState.consecutiveInvalid++;
    autoTunerState.invalidByCategory[category] = (autoTunerState.invalidByCategory[category] || 0) + 1;
    autoTunerState.diagnostics = createAutoTunerDiagnostics(
      `Invalid candidate (${category}): ${reason || "unknown"}`,
      null,
      autoTunerState.currentMerit?.metrics || autoTunerState.acceptedMerit?.metrics || null
    );

    if (autoTunerState.consecutiveInvalid >= 50) {
      let worstCategory = category;
      let worstCount = -1;
      for (const [k, v] of Object.entries(autoTunerState.invalidByCategory)) {
        if (v > worstCount) {
          worstCategory = k;
          worstCount = v;
        }
      }
      autoTunerState.stepScale = Math.max(0.10, autoTunerState.stepScale * 0.55);
      if (worstCategory) autoTunerState.disabledMutationGroups.add(worstCategory);
      if (autoTunerState.config) autoTunerState.config.disabledMutationGroups = autoTunerState.disabledMutationGroups;
      autoTunerState.consecutiveInvalid = 0;
      autoTunerState.invalidByCategory = {};
      autoTunerState.lastMessage = `Too many invalid candidates — reducing step size${worstCategory ? `, disabled ${worstCategory}` : ""}`;
    }
  }

  function recordAutoTunerHardReject(op, hardCheck, merit) {
    const category = hardCheck?.category || "";
    autoTunerState.rejectedMoves++;
    autoTunerState.noImprove++;
    autoTunerState.consecutiveInvalid = 0;
    if (category === "fl") autoTunerState.hardRejectedFL++;
    else if (category === "t") autoTunerState.hardRejectedT++;
    else if (category === "ic") autoTunerState.hardRejectedIC++;
    const reason = hardCheck?.reason || "Rejected by hard Auto Tuner constraint";
    autoTunerState.lastMessage = reason;
    autoTunerState.diagnostics = createAutoTunerDiagnostics(
      `${reason} (${autoTunerOpCategory(op)})`,
      null,
      merit?.metrics || autoTunerState.acceptedMerit?.metrics || null
    );
  }

  function autoTunerIteration() {
    const cfg = autoTunerState.config;
    autoTunerState.iteration++;
    cfg.stepScale = autoTunerState.stepScale;
    const ops = collectAutoTunerMutationOps(autoTunerState.acceptedLens, cfg, autoTunerState.originalLens);
    if (!ops.length) {
      autoTunerState.stopReason = "No allowed mutable variables";
      return false;
    }

    const maxAttempts = Math.max(1, Math.min(10, ops.length * 2));
    let candidate = null;
    let merit = null;
    let selectedOp = null;
    let lastInvalidReason = "";
    let lastRejectReason = "";
    let candidatePassesHardConstraints = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      selectedOp = ops[Math.floor(autoTunerState.rng() * ops.length)];
      candidate = clone(autoTunerState.acceptedLens);
      const changed = applyAutoTunerMutation(candidate, selectedOp, cfg, autoTunerState.rng);
      if (!changed) {
        lastInvalidReason = "mutation produced no change";
        recordAutoTunerInvalidCandidate(selectedOp, lastInvalidReason);
        continue;
      }
      recomputeSurfacePositionsForLens(candidate);

      const repaired = repairAutoTunerCandidate(candidate, autoTunerState.originalLens, cfg);
      merit = repaired.ok
        ? evaluateLensMerit(candidate, { ...cfg.targets, originalLens: autoTunerState.originalLens }, cfg.weights)
        : createInvalidMerit(repaired.reason);
      autoTunerState.currentMerit = merit;

      if (!repaired.ok || merit.invalidPenalty > 0 || !Number.isFinite(Number(merit.totalScore))) {
        lastInvalidReason = repaired.reason || (merit?.warnings || []).join(", ") || "invalid merit";
        recordAutoTunerInvalidCandidate(selectedOp, lastInvalidReason);
        continue;
      }
      const hardCheck = checkAutoTunerHardConstraints(merit, cfg);
      if (!hardCheck.ok) {
        lastRejectReason = hardCheck.reason;
        recordAutoTunerHardReject(selectedOp, hardCheck, merit);
        continue;
      }
      candidatePassesHardConstraints = true;
      break;
    }

    if (!candidate || !merit || !candidatePassesHardConstraints || merit.invalidPenalty > 0 || !Number.isFinite(Number(merit.totalScore))) {
      autoTunerState.lastMessage = lastRejectReason || (lastInvalidReason
        ? `Rejected invalid candidate: ${lastInvalidReason}`
        : autoTunerState.lastMessage);
      return true;
    }

    const finalHardCheck = checkAutoTunerHardConstraints(merit, cfg);
    if (!finalHardCheck.ok) {
      recordAutoTunerHardReject(selectedOp, finalHardCheck, merit);
      autoTunerState.lastMessage = finalHardCheck.reason || autoTunerState.lastMessage;
      return true;
    }

    const accepted = autoTunerShouldAccept(merit, autoTunerState.acceptedMerit, cfg, autoTunerState.rng);
    if (accepted) {
      autoTunerState.acceptedLens = candidate;
      autoTunerState.acceptedMerit = merit;
      autoTunerState.acceptedMoves++;
      autoTunerState.consecutiveInvalid = 0;
    } else {
      autoTunerState.rejectedMoves++;
    }

    const bestScore = Number(autoTunerState.bestMerit?.totalScore);
    if (!Number.isFinite(bestScore) || Number(merit.totalScore) < bestScore) {
      autoTunerState.bestLens = clone(candidate);
      autoTunerState.bestMerit = merit;
      autoTunerState.bestIteration = autoTunerState.iteration;
      autoTunerState.noImprove = 0;
      pushAutoTunerHistory(autoTunerState.iteration, merit);
    } else {
      autoTunerState.noImprove++;
    }

    if (cfg.autoReduce && autoTunerState.noImprove > 0 && autoTunerState.noImprove % 150 === 0) {
      autoTunerState.stepScale = Math.max(0.12, autoTunerState.stepScale * 0.72);
    }

    return true;
  }

  function finishAutoTuner(reason) {
    cancelAutoTunerTimer();
    autoTunerState.running = false;
    autoTunerState.paused = false;
    autoTunerState.stopReason = reason || "Stopped";
    updateAutoTunerProgress(true);
    updateLensAiCandidateFromAutoTuner();
    notifyLensAiAutoTunerFinished(autoTunerState.stopReason);
    if (reason) toast(`Auto Tuner: ${reason}`, 1800);
  }

  function handleAutoTunerCrash(error) {
    console.error("Auto Tuner failed", error);
    cancelAutoTunerTimer();
    autoTunerState.running = false;
    autoTunerState.paused = false;
    autoTunerState.stopReason = `Crashed: ${error?.message || error}`;
    if (autoTunerState.originalLens) loadLens(autoTunerState.originalLens);
    updateAutoTunerProgress(true);
    notifyLensAiAutoTunerFinished(autoTunerState.stopReason);
    toast("Auto Tuner stopped and original lens restored", 2600);
  }

  function runAutoTunerChunk() {
    if (!autoTunerState.running || autoTunerState.paused) return;
    const cfg = autoTunerState.config;
    const settings = autoTunerBatchSettings(cfg.runSpeed);
    const started = performance.now();
    let batch = 0;
    try {
      while (
        autoTunerState.running &&
        !autoTunerState.paused &&
        autoTunerState.iteration < cfg.iterations &&
        batch < settings.maxBatch &&
        performance.now() - started < settings.budgetMs
      ) {
        const ok = autoTunerIteration();
        batch++;
        if (!ok) {
          finishAutoTuner(autoTunerState.stopReason || "Stopped");
          return;
        }
        if (cfg.stopIfStuck > 0 && autoTunerState.noImprove >= cfg.stopIfStuck) {
          finishAutoTuner(`Stopped after ${cfg.stopIfStuck} iterations without improvement`);
          return;
        }
      }
    } catch (e) {
      handleAutoTunerCrash(e);
      return;
    }

    if (autoTunerState.iteration % settings.updateEvery === 0 || autoTunerState.iteration >= cfg.iterations) {
      updateAutoTunerProgress(true);
    }

    if (!autoTunerState.running || autoTunerState.paused) return;
    if (autoTunerState.iteration >= cfg.iterations) {
      finishAutoTuner("Completed");
      return;
    }
    scheduleAutoTunerChunk();
  }

  function scheduleAutoTunerChunk() {
    cancelAutoTunerTimer();
    const cfg = autoTunerState.config || {};
    const settings = autoTunerBatchSettings(cfg.runSpeed);
    if (typeof requestIdleCallback === "function" && cfg.runSpeed === "safe") {
      autoTunerState.timerKind = "idle";
      autoTunerState.timer = requestIdleCallback(() => runAutoTunerChunk(), { timeout: 120 });
      return;
    }
    autoTunerState.timerKind = "timeout";
    autoTunerState.timer = setTimeout(runAutoTunerChunk, settings.delayMs);
  }

  function startAutoTuner() {
    if (autoTunerState.running) return;
    try {
      const cfg = readAutoTunerConfig();
      const original = clone(lens);
      recomputeSurfacePositionsForLens(original);
      cfg.originalLens = original;
      cfg.targets.originalLens = original;
      cfg.disabledMutationGroups = new Set();
      const originalMerit = evaluateLensMerit(original, cfg.targets, cfg.weights);
      const baselineHardCheck = checkAutoTunerHardConstraints(originalMerit, cfg);
      const baselineInvalid = originalMerit.invalidPenalty > 0 || !Number.isFinite(Number(originalMerit.totalScore));
      if (baselineInvalid) {
        const validation = validateAutoTunerLensState(original, {
          ...cfg,
          originalLens: original,
          wavePreset: cfg.targets.wavePreset,
        });
        autoTunerState.running = false;
        autoTunerState.paused = false;
        autoTunerState.iteration = 0;
        autoTunerState.lastUiIteration = -1;
        autoTunerState.originalLens = original;
        autoTunerState.acceptedLens = clone(original);
        autoTunerState.bestLens = null;
        autoTunerState.config = cfg;
        autoTunerState.originalMerit = originalMerit;
        autoTunerState.acceptedMerit = originalMerit;
        autoTunerState.currentMerit = originalMerit;
        autoTunerState.bestMerit = originalMerit;
        autoTunerState.bestIteration = null;
        autoTunerState.history = [];
        autoTunerState.noImprove = 0;
        autoTunerState.acceptedMoves = 0;
        autoTunerState.rejectedMoves = 0;
        autoTunerState.invalidMoves = 0;
        autoTunerState.hardRejectedFL = 0;
        autoTunerState.hardRejectedT = 0;
        autoTunerState.hardRejectedIC = 0;
        autoTunerState.stepScale = 1;
        autoTunerState.baselineInvalid = true;
        autoTunerState.previewingBest = false;
        autoTunerState.consecutiveInvalid = 0;
        autoTunerState.invalidByCategory = {};
        autoTunerState.disabledMutationGroups = new Set();
        autoTunerState.stopReason = "Baseline invalid — fix validation or lens before tuning";
        autoTunerState.lastMessage = validation?.reason || (originalMerit.warnings || []).join(", ");
        autoTunerState.diagnostics = createAutoTunerDiagnostics(autoTunerState.stopReason, validation, originalMerit.metrics);
        updateAutoTunerProgress(true);
        toast("Auto Tuner baseline invalid; diagnostics available", 2600);
        return;
      }
      const baselineConfirm = confirmAutoTunerBaselineHardConstraints(originalMerit, cfg);
      if (!baselineConfirm.ok) {
        autoTunerState.running = false;
        autoTunerState.paused = false;
        autoTunerState.iteration = 0;
        autoTunerState.lastUiIteration = -1;
        autoTunerState.originalLens = original;
        autoTunerState.acceptedLens = clone(original);
        autoTunerState.bestLens = null;
        autoTunerState.config = cfg;
        autoTunerState.originalMerit = originalMerit;
        autoTunerState.acceptedMerit = originalMerit;
        autoTunerState.currentMerit = originalMerit;
        autoTunerState.bestMerit = null;
        autoTunerState.bestIteration = null;
        autoTunerState.history = [];
        autoTunerState.noImprove = 0;
        autoTunerState.acceptedMoves = 0;
        autoTunerState.rejectedMoves = 0;
        autoTunerState.invalidMoves = 0;
        autoTunerState.hardRejectedFL = 0;
        autoTunerState.hardRejectedT = 0;
        autoTunerState.hardRejectedIC = 0;
        autoTunerState.stepScale = 1;
        autoTunerState.baselineInvalid = false;
        autoTunerState.previewingBest = false;
        autoTunerState.consecutiveInvalid = 0;
        autoTunerState.invalidByCategory = {};
        autoTunerState.disabledMutationGroups = new Set();
        autoTunerState.stopReason = "Baseline outside hard constraint — run cancelled";
        autoTunerState.lastMessage = baselineConfirm.warning || baselineHardCheck.reason || "";
        autoTunerState.diagnostics = createAutoTunerDiagnostics(
          autoTunerState.lastMessage || autoTunerState.stopReason,
          null,
          originalMerit.metrics
        );
        updateAutoTunerProgress(true);
        toast("Auto Tuner cancelled; hard baseline warning shown", 2600);
        return;
      }
      const ops = collectAutoTunerMutationOps(original, cfg, original);
      if (!ops.length) {
        if (ui.atStatus) ui.atStatus.textContent = "No mutable variables selected.";
        toast("Auto Tuner: no allowed variables selected");
        return;
      }

      autoTunerState.running = true;
      autoTunerState.paused = false;
      autoTunerState.iteration = 0;
      autoTunerState.lastUiIteration = -1;
      autoTunerState.originalLens = original;
      autoTunerState.acceptedLens = clone(original);
      autoTunerState.bestLens = baselineHardCheck.ok ? clone(original) : null;
      autoTunerState.config = cfg;
      autoTunerState.rng = makeAutoTunerRng(cfg.seed);
      autoTunerState.originalMerit = originalMerit;
      autoTunerState.acceptedMerit = originalMerit;
      autoTunerState.currentMerit = originalMerit;
      autoTunerState.bestMerit = baselineHardCheck.ok ? originalMerit : null;
      autoTunerState.bestIteration = baselineHardCheck.ok ? 0 : null;
      autoTunerState.history = [];
      autoTunerState.noImprove = 0;
      autoTunerState.acceptedMoves = 0;
      autoTunerState.rejectedMoves = 0;
      autoTunerState.invalidMoves = 0;
      autoTunerState.hardRejectedFL = 0;
      autoTunerState.hardRejectedT = 0;
      autoTunerState.hardRejectedIC = 0;
      autoTunerState.stepScale = 1;
      autoTunerState.baselineInvalid = false;
      autoTunerState.previewingBest = false;
      autoTunerState.consecutiveInvalid = 0;
      autoTunerState.invalidByCategory = {};
      autoTunerState.disabledMutationGroups = new Set();
      autoTunerState.diagnostics = createAutoTunerDiagnostics(
        baselineHardCheck.ok ? "Baseline OK" : baselineHardCheck.reason,
        null,
        originalMerit.metrics
      );
      autoTunerState.lastMessage = baselineHardCheck.ok
        ? ""
        : `${baselineHardCheck.reason}; candidates must enter the hard target window before becoming best`;
      autoTunerState.stopReason = "Running";
      if (baselineHardCheck.ok) pushAutoTunerHistory(0, originalMerit);
      updateAutoTunerProgress(true);
      scheduleAutoTunerChunk();
    } catch (e) {
      handleAutoTunerCrash(e);
    }
  }

  function pauseAutoTuner() {
    if (!autoTunerState.running) return;
    autoTunerState.paused = !autoTunerState.paused;
    if (autoTunerState.paused) {
      cancelAutoTunerTimer();
    } else {
      scheduleAutoTunerChunk();
    }
    updateAutoTunerProgress(true);
  }

  function stopAutoTuner() {
    if (!autoTunerState.running) return;
    finishAutoTuner("Stopped");
  }

  function previewAutoTunerBest() {
    if (!autoTunerState.bestLens || autoTunerState.running) return;
    const liveLens = clone(lens);
    const liveSelected = selectedIndex;
    try {
      lens = sanitizeLens(autoTunerState.bestLens);
      selectedIndex = Math.min(Math.max(0, liveSelected), lens.surfaces.length - 1);
      buildTable();
      applySensorToIMS();
      renderAll();
    } finally {
      lens = sanitizeLens(liveLens);
      selectedIndex = Math.min(Math.max(0, liveSelected), lens.surfaces.length - 1);
      buildTable();
      applySensorToIMS();
    }
    autoTunerState.previewingBest = false;
    autoTunerState.lastMessage = "Previewed best result in the ray pane without applying it.";
    updateAutoTunerProgress(true);
    toast("Previewed Auto Tuner best result");
  }

  function applyAutoTunerBest() {
    if (!autoTunerState.bestLens || autoTunerState.running) return;
    loadLens(autoTunerState.bestLens);
    renderAll();
    if (preview.ready) scheduleRenderPreview({ force: true });
    autoTunerState.previewingBest = false;
    toast("Applied Auto Tuner best result");
    updateAutoTunerButtons();
  }

  function revertAutoTunerOriginal() {
    if (!autoTunerState.originalLens || autoTunerState.running) return;
    loadLens(autoTunerState.originalLens);
    renderAll();
    if (preview.ready) scheduleRenderPreview({ force: true });
    autoTunerState.previewingBest = false;
    toast("Restored original lens");
    updateAutoTunerButtons();
  }

  function cloneAutoTunerBestLensForJson() {
    if (!autoTunerState.bestLens) return null;
    const out = clone(autoTunerState.bestLens);
    const iter = Number(autoTunerState.bestIteration);
    const score = Number(autoTunerState.bestMerit?.totalScore);
    if (Number.isFinite(iter) && Number.isFinite(score)) {
      const note = `Auto Tuner best result found at iteration ${Math.max(0, Math.floor(iter))}, score ${scoreText(score, 5)}`;
      if (Array.isArray(out.notes)) {
        if (!out.notes.includes(note)) out.notes.push(note);
      } else if (out.notes == null || out.notes === "") {
        out.notes = [note];
      } else {
        out.notes = [String(out.notes), note];
      }
    }
    return out;
  }

  async function copyAutoTunerBestJson() {
    if (!autoTunerState.bestLens) return;
    const text = JSON.stringify(cloneAutoTunerBestLensForJson(), null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast("Copied best JSON");
    } catch (e) {
      if (ui.atStatus) ui.atStatus.textContent = `Copy failed: ${e?.message || e}`;
    }
  }

  async function copyAutoTunerDiagnostics() {
    const text = String(autoTunerState.diagnostics || "");
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast("Copied Auto Tuner diagnostics");
    } catch (e) {
      if (ui.atStatus) ui.atStatus.textContent = `Diagnostics copy failed: ${e?.message || e}`;
    }
  }

  function saveAutoTunerBestJson() {
    if (!autoTunerState.bestLens) return;
    try {
      const bestJson = cloneAutoTunerBestLensForJson();
      const blob = new Blob([JSON.stringify(bestJson, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      const safeName = String(bestJson?.name || lens?.name || "lens").replace(/[^\w\-]+/g, "_");
      a.href = url;
      a.download = `${safeName}_auto_tuned.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
      toast("Saved best JSON");
    } catch (e) {
      if (ui.atStatus) ui.atStatus.textContent = `Save failed: ${e?.message || e}`;
    }
  }

  function setAutoTunerGoal(id, enabled) {
    const el = ui[id];
    if (el) el.checked = !!enabled;
  }

  function setAutoTunerWeight(id, value) {
    const el = ui[id];
    if (el) el.value = String(value);
  }

  function setAutoTunerHard(id, checked) {
    const el = ui[id];
    if (el) el.checked = !!checked;
  }

  function setAutoTunerVar(id, checked) {
    const el = ui[id];
    if (el) el.checked = !!checked;
  }

  function applyAutoTunerPreset(name) {
    const metrics = getAutoTunerMetrics(lens, { wavePreset: ui.wavePreset?.value || "d" });
    const curFL = metrics.efl || 50;
    const curT = metrics.T || 2;
    const curRear = Number.isFinite(metrics.rearClearance) ? Math.max(0, metrics.rearClearance) : 0;
    [
      "atGoalFL","atGoalT","atGoalIC","atGoalCenter","atGoalCorner","atGoalFieldCurv","atGoalVig","atGoalRear","atGoalCompact",
    ].forEach((id) => setAutoTunerGoal(id, false));
    if (ui.atStrictFLTLock) ui.atStrictFLTLock.checked = true;
    setAutoTunerHard("atHardFL", false);
    setAutoTunerHard("atHardT", false);
    setAutoTunerHard("atHardIC", false);
    if (ui.atTolFL) ui.atTolFL.value = "1.0";
    if (ui.atTolT) ui.atTolT.value = "0.15";
    if (ui.atMinIC) ui.atMinIC.value = "45";

    if (name === "flOnly") {
      setAutoTunerGoal("atGoalFL", true);
      if (ui.atTargetFL) ui.atTargetFL.value = curFL.toFixed(2);
      setAutoTunerHard("atHardFL", true);
      setAutoTunerWeight("atWeightFL", 8);
    } else if (name === "corners") {
      setAutoTunerGoal("atGoalCorner", true);
      setAutoTunerGoal("atGoalIC", true);
      setAutoTunerGoal("atGoalVig", true);
      if (ui.atTargetIC) ui.atTargetIC.value = "45";
      if (ui.atMinIC) ui.atMinIC.value = "45";
      setAutoTunerHard("atHardIC", true);
      setAutoTunerWeight("atWeightCorner", 9);
      setAutoTunerWeight("atWeightIC", 8);
      setAutoTunerWeight("atWeightVig", 8);
    } else if (name === "cornerFlatten") {
      setAutoTunerGoal("atGoalFL", true);
      setAutoTunerGoal("atGoalT", true);
      setAutoTunerGoal("atGoalIC", true);
      setAutoTunerGoal("atGoalCenter", true);
      setAutoTunerGoal("atGoalCorner", true);
      setAutoTunerGoal("atGoalFieldCurv", true);
      setAutoTunerGoal("atGoalVig", true);
      if (ui.atTargetFL) ui.atTargetFL.value = Number.isFinite(curFL) ? curFL.toFixed(2) : "50";
      if (ui.atTargetT) ui.atTargetT.value = Number.isFinite(curT) ? curT.toFixed(2) : "2.00";
      if (ui.atTargetIC) ui.atTargetIC.value = "45";
      if (ui.atMinIC) ui.atMinIC.value = "45";
      if (ui.atTolFL) ui.atTolFL.value = "0.75";
      if (ui.atTolT) ui.atTolT.value = "0.20";
      setAutoTunerHard("atHardFL", true);
      setAutoTunerHard("atHardT", true);
      setAutoTunerHard("atHardIC", false);
      setAutoTunerWeight("atWeightFL", 5);
      setAutoTunerWeight("atWeightT", 4);
      setAutoTunerWeight("atWeightIC", 6);
      setAutoTunerWeight("atWeightCenter", 4);
      setAutoTunerWeight("atWeightCorner", 10);
      setAutoTunerWeight("atWeightFieldCurv", 8);
      setAutoTunerWeight("atWeightVig", 8);
      setAutoTunerVar("atVarR", true);
      setAutoTunerVar("atVarAirT", true);
      setAutoTunerVar("atVarStopT", true);
      setAutoTunerVar("atVarFrontGroup", true);
      setAutoTunerVar("atVarRearGroup", true);
      setAutoTunerVar("atVarRearSpacing", true);
      setAutoTunerVar("atVarGlassT", false);
      setAutoTunerVar("atVarStopAp", false);
      setAutoTunerVar("atVarAp", false);
      setAutoTunerVar("atVarGlass", false);
      setAutoTunerVar("atVarFFR", false);
      setAutoTunerVar("atVarFFPos", false);
      setAutoTunerVar("atVarFFThick", false);
      setAutoTunerVar("atAllowIMSAp", false);
      setAutoTunerVar("atAllowSensorShift", false);
      setAutoTunerVar("atAllowRSignFlip", false);
    } else if (name === "clearance") {
      setAutoTunerGoal("atGoalRear", true);
      if (ui.atTargetRear) ui.atTargetRear.value = curRear.toFixed(2);
      setAutoTunerWeight("atWeightRear", 8);
    } else if (name === "currentImprove") {
      setAutoTunerGoal("atGoalFL", true);
      setAutoTunerGoal("atGoalT", true);
      setAutoTunerGoal("atGoalIC", true);
      setAutoTunerGoal("atGoalCenter", true);
      setAutoTunerGoal("atGoalCorner", true);
      setAutoTunerGoal("atGoalVig", true);
      if (ui.atTargetFL) ui.atTargetFL.value = curFL.toFixed(2);
      if (ui.atTargetT) ui.atTargetT.value = curT.toFixed(2);
      if (ui.atTargetIC) ui.atTargetIC.value = Math.max(45, metrics.sensorDiag || 45).toFixed(1);
      if (ui.atMinIC) ui.atMinIC.value = Math.max(45, metrics.sensorDiag || 45).toFixed(1);
      setAutoTunerHard("atHardFL", true);
      setAutoTunerHard("atHardT", true);
      setAutoTunerHard("atHardIC", true);
      setAutoTunerWeight("atWeightFL", 4);
      setAutoTunerWeight("atWeightT", 3);
      setAutoTunerWeight("atWeightCenter", 5);
      setAutoTunerWeight("atWeightCorner", 8);
      setAutoTunerWeight("atWeightIC", 7);
      setAutoTunerWeight("atWeightFieldCurv", 6);
      setAutoTunerWeight("atWeightVig", 6);
    } else {
      setAutoTunerGoal("atGoalFL", true);
      setAutoTunerGoal("atGoalT", true);
      setAutoTunerGoal("atGoalIC", true);
      setAutoTunerGoal("atGoalCenter", true);
      setAutoTunerGoal("atGoalCorner", true);
      setAutoTunerGoal("atGoalVig", true);
      setAutoTunerGoal("atGoalRear", true);
      if (ui.atTargetFL) ui.atTargetFL.value = "50";
      if (ui.atTargetT) ui.atTargetT.value = "2.00";
      if (ui.atTargetIC) ui.atTargetIC.value = "45";
      if (ui.atMinIC) ui.atMinIC.value = "45";
      if (ui.atTargetRear) ui.atTargetRear.value = curRear.toFixed(2);
      setAutoTunerHard("atHardFL", true);
      setAutoTunerHard("atHardT", true);
      setAutoTunerHard("atHardIC", true);
      setAutoTunerWeight("atWeightFL", 5);
      setAutoTunerWeight("atWeightT", 4);
      setAutoTunerWeight("atWeightIC", 8);
      setAutoTunerWeight("atWeightCenter", 7);
      setAutoTunerWeight("atWeightCorner", 8);
      setAutoTunerWeight("atWeightFieldCurv", 6);
      setAutoTunerWeight("atWeightVig", 8);
      setAutoTunerWeight("atWeightRear", 4);
    }
    syncAutoTunerWeightOutputs();
  }

  function syncAutoTunerDefaultsFromCurrentLens() {
    const metrics = getAutoTunerMetrics(lens, { wavePreset: ui.wavePreset?.value || "d" });
    if (ui.atTargetFL && Number.isFinite(metrics.efl)) ui.atTargetFL.value = metrics.efl.toFixed(2);
    else if (ui.atTargetFL) ui.atTargetFL.value = "50";
    if (ui.atTargetT && Number.isFinite(metrics.T)) ui.atTargetT.value = metrics.T.toFixed(2);
    else if (ui.atTargetT) ui.atTargetT.value = "2.00";
    if (ui.atTargetRear) {
      const rear = Number.isFinite(metrics.rearClearance) ? Math.max(0, metrics.rearClearance) : 0;
      ui.atTargetRear.value = rear.toFixed(2);
    }
    if (ui.atTargetIC && (!Number.isFinite(num(ui.atTargetIC.value, NaN)) || num(ui.atTargetIC.value, 0) <= 0)) {
      ui.atTargetIC.value = "45";
    }
    if (ui.atTolFL && (!Number.isFinite(num(ui.atTolFL.value, NaN)) || num(ui.atTolFL.value, 0) < 0)) ui.atTolFL.value = "1.0";
    if (ui.atTolT && (!Number.isFinite(num(ui.atTolT.value, NaN)) || num(ui.atTolT.value, 0) < 0)) ui.atTolT.value = "0.15";
    if (ui.atMinIC && (!Number.isFinite(num(ui.atMinIC.value, NaN)) || num(ui.atMinIC.value, 0) <= 0)) {
      ui.atMinIC.value = ui.atTargetIC?.value || "45";
    }
  }

  function syncAutoTunerWeightOutputs() {
    const pairs = [
      ["atWeightFL", "atWeightFLValue"],
      ["atWeightT", "atWeightTValue"],
      ["atWeightIC", "atWeightICValue"],
      ["atWeightCenter", "atWeightCenterValue"],
      ["atWeightCorner", "atWeightCornerValue"],
      ["atWeightFieldCurv", "atWeightFieldCurvValue"],
      ["atWeightVig", "atWeightVigValue"],
      ["atWeightRear", "atWeightRearValue"],
      ["atWeightCompact", "atWeightCompactValue"],
    ];
    for (const [inputId, outputId] of pairs) {
      if (ui[outputId] && ui[inputId]) ui[outputId].textContent = String(ui[inputId].value);
    }
  }

  function openAutoTunerModal() {
    if (!ui.autoTunerModal) return;
    syncAutoTunerDefaultsFromCurrentLens();
    syncAutoTunerWeightOutputs();
    updateAutoTunerProgress(true);
    ui.autoTunerModal.classList.remove("hidden");
    ui.autoTunerModal.setAttribute("aria-hidden", "false");
  }

  function closeAutoTunerModal() {
    if (!ui.autoTunerModal) return;
    ui.autoTunerModal.classList.add("hidden");
    ui.autoTunerModal.setAttribute("aria-hidden", "true");
  }

  function isAutoTunerModalOpen() {
    return !!(ui.autoTunerModal && !ui.autoTunerModal.classList.contains("hidden"));
  }

  function wireAutoTunerUI() {
    if (!ui.autoTunerModal) return;
    on("#btnAutoTuner", "click", openAutoTunerModal);
    if (ui.atClose) ui.atClose.addEventListener("click", closeAutoTunerModal);
    if (ui.atApplyPreset) ui.atApplyPreset.addEventListener("click", () => applyAutoTunerPreset(ui.atPreset?.value || "clean50"));
    [
      "atWeightFL","atWeightT","atWeightIC","atWeightCenter","atWeightCorner","atWeightFieldCurv","atWeightVig","atWeightRear","atWeightCompact",
    ].forEach((id) => {
      if (ui[id]) ui[id].addEventListener("input", syncAutoTunerWeightOutputs);
    });
    if (ui.atStart) ui.atStart.addEventListener("click", startAutoTuner);
    if (ui.atPause) ui.atPause.addEventListener("click", pauseAutoTuner);
    if (ui.atStop) ui.atStop.addEventListener("click", stopAutoTuner);
    if (ui.atPreviewBest) ui.atPreviewBest.addEventListener("click", previewAutoTunerBest);
    if (ui.atApplyBest) ui.atApplyBest.addEventListener("click", applyAutoTunerBest);
    if (ui.atRevert) ui.atRevert.addEventListener("click", revertAutoTunerOriginal);
    if (ui.atCopyDiagnostics) ui.atCopyDiagnostics.addEventListener("click", copyAutoTunerDiagnostics);
    if (ui.atCopyBest) ui.atCopyBest.addEventListener("click", copyAutoTunerBestJson);
    if (ui.atSaveBest) ui.atSaveBest.addEventListener("click", saveAutoTunerBestJson);
    ui.autoTunerModal.addEventListener("mousedown", (e) => {
      if (e.target === ui.autoTunerModal) closeAutoTunerModal();
    });
    syncAutoTunerWeightOutputs();
    updateAutoTunerButtons();
  }

  // -------------------- Reference Lens Builder --------------------
  const REFERENCE_LOOK_DEFAULTS = Object.freeze({
    swirl: 0,
    centerSharpness: 6,
    edgeSoftness: 4,
    contrast: 5,
    flare: 3,
    fieldCurvature: 3,
    chromaticAberrationTolerance: 4,
  });

  function clampLookScore(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0;
  }

  function mergeLookTargets(overrides = {}) {
    return {
      swirl: clampLookScore(overrides.swirl ?? REFERENCE_LOOK_DEFAULTS.swirl),
      centerSharpness: clampLookScore(overrides.centerSharpness ?? REFERENCE_LOOK_DEFAULTS.centerSharpness),
      edgeSoftness: clampLookScore(overrides.edgeSoftness ?? REFERENCE_LOOK_DEFAULTS.edgeSoftness),
      contrast: clampLookScore(overrides.contrast ?? REFERENCE_LOOK_DEFAULTS.contrast),
      flare: clampLookScore(overrides.flare ?? REFERENCE_LOOK_DEFAULTS.flare),
      fieldCurvature: clampLookScore(overrides.fieldCurvature ?? REFERENCE_LOOK_DEFAULTS.fieldCurvature),
      chromaticAberrationTolerance: clampLookScore(overrides.chromaticAberrationTolerance ?? REFERENCE_LOOK_DEFAULTS.chromaticAberrationTolerance),
    };
  }

  function parseReferenceLensIntent(promptRaw = "") {
    const prompt = String(promptRaw || "").trim();
    const lower = prompt.toLowerCase();
    let referenceName = null;
    let inferredDesignFamily = null;
    let targetFocalLengthMm = null;
    let targetFNumberOrTStop = null;
    let targetCoverage = null;
    let lookTargets = mergeLookTargets();
    const constraints = {
      preserveBackFocus: /preserve back|keep back|same back|bfl/i.test(prompt),
      plFriendly: /\bpl\b|pl-friendly|pl friendly|positive lock/i.test(prompt),
      maxFrontDiameterMm: null,
      maxLengthMm: null,
    };

    const focalMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mm/);
    if (focalMatch) targetFocalLengthMm = num(focalMatch[1], null);
    const speedMatch = lower.match(/(?:f\/|f\s*|t\s*)(\d+(?:[.,]\d+)?)/);
    if (speedMatch) targetFNumberOrTStop = num(speedMatch[1], null);
    const frontMatch = lower.match(/front(?:\s+diameter)?(?:\s*<=|\s*under|\s*max)?\s*(\d+(?:[.,]\d+)?)\s*mm/);
    if (frontMatch) constraints.maxFrontDiameterMm = num(frontMatch[1], null);
    const lengthMatch = lower.match(/(?:length|long)(?:\s*<=|\s*under|\s*max)?\s*(\d+(?:[.,]\d+)?)\s*mm/);
    if (lengthMatch) constraints.maxLengthMm = num(lengthMatch[1], null);

    if (/65mm|large format|\b65\b/.test(lower)) targetCoverage = "65mm";
    else if (/full[-\s]?frame|\bff\b|vista/.test(lower)) targetCoverage = "full-frame";
    else if (/s35|super\s*35|super35/.test(lower)) targetCoverage = "s35";

    if (/helios\s*44(?:-?2)?/.test(lower)) {
      referenceName = "Helios 44-2";
      inferredDesignFamily = "Biotar / Double Gauss inspired";
      targetFocalLengthMm = targetFocalLengthMm || 58;
      targetFNumberOrTStop = targetFNumberOrTStop || 2;
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
      targetFocalLengthMm = targetFocalLengthMm || 58;
      targetFNumberOrTStop = targetFNumberOrTStop || 2;
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
      targetFocalLengthMm = targetFocalLengthMm || 50;
      targetFNumberOrTStop = targetFNumberOrTStop || 2;
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
      targetFocalLengthMm = targetFocalLengthMm || 80;
      targetFNumberOrTStop = targetFNumberOrTStop || 2;
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
      targetFocalLengthMm = targetFocalLengthMm || 50;
      targetFNumberOrTStop = targetFNumberOrTStop || 2;
      lookTargets = mergeLookTargets({ centerSharpness: 7, edgeSoftness: 5, fieldCurvature: 4 });
    }

    if (/swirl|swirly/.test(lower)) lookTargets.swirl = Math.max(lookTargets.swirl, /strong|more|extra/.test(lower) ? 9 : 7);
    if (/usable center|sharp center|clean center/.test(lower)) lookTargets.centerSharpness = Math.max(lookTargets.centerSharpness, 7);
    if (/soft edge|soft edges|edge softness/.test(lower)) lookTargets.edgeSoftness = Math.max(lookTargets.edgeSoftness, 7);
    if (/low contrast|lower contrast|vintage contrast/.test(lower)) lookTargets.contrast = Math.min(lookTargets.contrast, 4);
    if (/flare|flary/.test(lower)) lookTargets.flare = Math.max(lookTargets.flare, 6);
    if (/field curvature|curved field/.test(lower)) lookTargets.fieldCurvature = Math.max(lookTargets.fieldCurvature, 7);

    return {
      referenceName,
      inferredDesignFamily,
      targetFocalLengthMm,
      targetFNumberOrTStop,
      targetCoverage,
      lookTargets,
      constraints,
    };
  }

  function referenceMetadata(intent, family, referenceName = null) {
    return {
      sourceType: "ai_reference_generated",
      referenceName: referenceName || intent.referenceName || "Reference lens",
      designFamily: family || intent.inferredDesignFamily || "Reference-inspired",
      accuracyLabel: "inspired, not exact clone",
      referenceIntent: intent,
    };
  }

  function withReferenceMetadata(lensObj, intent, family, referenceName = null) {
    const meta = referenceMetadata(intent, family, referenceName);
    const out = {
      ...lensObj,
      ...meta,
      notes: [
        ...(Array.isArray(lensObj.notes) ? lensObj.notes : []),
        `${meta.referenceName}: ${meta.accuracyLabel}.`,
        "Generated by Reference Lens Builder from a controlled design-family starter, then scored by local raytrace metrics.",
      ],
    };
    return out;
  }

  function setReferenceSurfaceLabels(lensObj) {
    const surfaces = lensObj?.surfaces || [];
    surfaces.forEach((s, i) => {
      if (s.type === "OBJ") {
        s.surfaceLabel = "OBJ";
        s.surfaceLabelAuto = false;
      } else if (String(s.type || "").toUpperCase() === "IMS") {
        s.surfaceLabel = "IMS";
        s.surfaceLabelAuto = false;
      } else if (s.stop || String(s.type || "").toUpperCase() === "STOP") {
        s.surfaceLabel = "STOP";
        s.surfaceLabelAuto = false;
      } else if (!String(s.surfaceLabel || "").trim()) {
        s.surfaceLabel = `REF S${i}`;
        s.surfaceLabelAuto = false;
      }
    });
    return lensObj;
  }

  function createDoubleGaussStarter(intent = {}) {
    const target = intent?.targetFocalLengthMm || 50;
    const base = clone(omit50ConceptV1());
    base.name = `${target}mm Double Gauss reference starter`;
    base.surfaces.forEach((s) => {
      if (s.glass === "S-LAM3") s.glass = "N-LAK9";
      if (s.glass === "S-BAH11") s.glass = "N-BAK4";
      if (s.glass === "LF5") s.glass = "N-F2";
    });
    setReferenceSurfaceLabels(base);
    return normalizeReferenceStarter(withReferenceMetadata(base, intent, "Double Gauss", intent.referenceName || "Double Gauss"), intent);
  }

  function createBiotarInspiredStarter(intent = {}) {
    const target = intent?.targetFocalLengthMm || 58;
    const speed = intent?.targetFNumberOrTStop || 2;
    const L = {
      name: `${target}mm f/${speed} Biotar-inspired reference starter`,
      notes: [
        "6-element / 4-group Biotar-style starting point for local optimization.",
        "Radii/glass are plausible placeholders, not historical Helios/Carl Zeiss prescription data.",
      ],
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
        { type: "IMS", R: 0, t: 0, ap: getSensorWH().halfH || 12.77, glass: "AIR", stop: false, surfaceLabel: "IMS", surfaceLabelAuto: false },
      ],
    };
    return normalizeReferenceStarter(withReferenceMetadata(L, intent, "Biotar / Double Gauss inspired", intent.referenceName || "Helios 44-2"), intent);
  }

  function createPetzvalStarter(intent = {}) {
    const target = intent?.targetFocalLengthMm || 80;
    const speed = intent?.targetFNumberOrTStop || 2;
    const L = {
      name: `${target}mm f/${speed} Petzval reference starter`,
      notes: [
        "Petzval portrait-family starter with intentionally curved field and strong outer falloff.",
        "Not a historical prescription; intended as a controllable starting layout.",
      ],
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
        { type: "IMS", R: 0, t: 0, ap: getSensorWH().halfH || 12.77, glass: "AIR", stop: false, surfaceLabel: "IMS", surfaceLabelAuto: false },
      ],
    };
    return normalizeReferenceStarter(withReferenceMetadata(L, intent, "Petzval portrait family", intent.referenceName || "Petzval"), intent);
  }

  function normalizeReferenceStarter(lensObj, intent = {}) {
    const L = sanitizeLens(lensObj);
    const targetF = Number(intent?.targetFocalLengthMm);
    const targetSpeed = Number(intent?.targetFNumberOrTStop);
    if (Number.isFinite(targetF) && targetF > 0) {
      scaleReferenceLensToFocalLength(L, targetF);
      refineReferenceLensFocalLength(L, targetF);
    }
    if (Number.isFinite(targetSpeed) && targetSpeed > 0) {
      setReferenceLensStopForSpeed(L, targetSpeed);
      refineReferenceLensSpeed(L, targetSpeed);
    }
    if (String(intent?.targetCoverage || "") === "full-frame") setReferenceMinApertures(L, 18);
    if (String(intent?.targetCoverage || "") === "65mm") setReferenceMinApertures(L, 24);
    recomputeSurfacePositionsForLens(L);
    return L;
  }

  function scaleReferenceLensToFocalLength(lensObj, targetF) {
    const efl = estimateEflBflParaxial(lensObj.surfaces, ui.wavePreset?.value || "d").efl;
    if (!Number.isFinite(efl) || efl <= 0) return false;
    const k = targetF / efl;
    for (const s of lensObj.surfaces || []) scaleSurfaceDimensions(s, k);
    recomputeSurfacePositionsForLens(lensObj);
    return true;
  }

  function scaleReferenceLensByFactor(lensObj, k) {
    if (!Number.isFinite(k) || k <= 0) return false;
    for (const s of lensObj.surfaces || []) scaleSurfaceDimensions(s, k);
    recomputeSurfacePositionsForLens(lensObj);
    return true;
  }

  function refineReferenceLensFocalLength(lensObj, targetF) {
    // Starter families are intentionally approximate; this uses the local analyzer
    // once or twice to land closer to the requested reference focal length before
    // future optimizer actions take over.
    for (let i = 0; i < 3; i++) {
      let measured = null;
      try {
        measured = getAutoTunerMetrics(lensObj, { wavePreset: ui.wavePreset?.value || "d", includeFieldFocus: false })?.efl;
      } catch (_) {
        measured = estimateEflBflParaxial(lensObj.surfaces, ui.wavePreset?.value || "d")?.efl;
      }
      if (!Number.isFinite(measured) || measured <= 0) return false;
      const k = targetF / measured;
      if (Math.abs(k - 1) < 0.01) return true;
      scaleReferenceLensByFactor(lensObj, Math.max(0.25, Math.min(4, k)));
    }
    return true;
  }

  function setReferenceLensStopForSpeed(lensObj, speed) {
    const efl = estimateEflBflParaxial(lensObj.surfaces, ui.wavePreset?.value || "d").efl;
    const stopIdx = findStopSurfaceIndex(lensObj.surfaces);
    if (!Number.isFinite(efl) || efl <= 0 || stopIdx < 0) return false;
    const ap = Math.max(AP_MIN, Math.min(maxApForSurface(lensObj.surfaces[stopIdx]), efl / (2 * speed)));
    lensObj.surfaces[stopIdx].ap = ap;
    lensObj.surfaces[stopIdx].ap_optical = ap;
    return true;
  }

  function refineReferenceLensSpeed(lensObj, targetSpeed) {
    const stopIdx = findStopSurfaceIndex(lensObj.surfaces);
    if (stopIdx < 0 || !Number.isFinite(targetSpeed) || targetSpeed <= 0) return false;
    const stop = lensObj.surfaces[stopIdx];
    for (let i = 0; i < 3; i++) {
      let measured = null;
      try {
        measured = getAutoTunerMetrics(lensObj, { wavePreset: ui.wavePreset?.value || "d", includeFieldFocus: false })?.T;
      } catch (_) {
        measured = estimateTStopApprox(
          estimateEflBflParaxial(lensObj.surfaces, ui.wavePreset?.value || "d")?.efl,
          lensObj.surfaces,
          ui.wavePreset?.value || "d"
        );
      }
      if (!Number.isFinite(measured) || measured <= 0) return false;
      const ratio = measured / targetSpeed;
      if (Math.abs(ratio - 1) < 0.02) return true;
      const nextAp = Math.max(AP_MIN, Math.min(maxApForSurface(stop), Number(stop.ap || 0) * Math.max(0.25, Math.min(4, ratio))));
      stop.ap = nextAp;
      stop.ap_optical = nextAp;
    }
    return true;
  }

  function setReferenceMinApertures(lensObj, minAp) {
    const imsIdx = lensObj.surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    for (let i = 1; i < lensObj.surfaces.length; i++) {
      if (i === imsIdx) continue;
      const s = lensObj.surfaces[i];
      if (String(s?.type || "").toUpperCase() === "OBJ") continue;
      const ap = Math.max(Number(s.ap || 0), minAp);
      s.ap = ap;
      s.ap_optical = Math.max(Number(s.ap_optical || 0), ap);
    }
  }

  function createReferenceStarterLens(intent = {}) {
    const family = String(intent?.inferredDesignFamily || "").toLowerCase();
    const ref = String(intent?.referenceName || "").toLowerCase();
    if (ref.includes("helios") || family.includes("biotar")) return createBiotarInspiredStarter(intent);
    if (family.includes("petzval") || ref.includes("petzval")) return createPetzvalStarter(intent);
    return createDoubleGaussStarter(intent);
  }

  function referenceCoverageTargetMm(intent = {}) {
    const cov = String(intent?.targetCoverage || "").toLowerCase();
    if (cov === "65mm") return 60;
    if (cov === "full-frame") return 45;
    if (cov === "s35") return 31;
    return null;
  }

  function estimateReferenceChromaticPenalty(lensObj) {
    try {
      const parax = estimateEflBflParaxial(lensObj.surfaces, "d");
      const field = getAutoTunerFieldAngles(Math.hypot(getSensorWH().w, getSensorWH().h), parax.efl).mid;
      const c = evaluateSpotSpreadAtIMS(lensObj.surfaces, "c", field, 9, getFocusChartDistanceMm());
      const g = evaluateSpotSpreadAtIMS(lensObj.surfaces, "g", field, 9, getFocusChartDistanceMm());
      const cCent = Number(c?.centroidMm);
      const gCent = Number(g?.centroidMm);
      if (!Number.isFinite(cCent) || !Number.isFinite(gCent)) return { penalty: 8, warning: "Chromatic proxy weak; one wavelength did not trace cleanly." };
      const shift = Math.abs(cCent - gCent);
      return { penalty: Math.min(12, shift * 12), warning: shift > 0.35 ? `High chromatic focus/centroid spread proxy (${shift.toFixed(3)}mm).` : "" };
    } catch (_) {
      return { penalty: 4, warning: "Chromatic proxy unavailable for this starter." };
    }
  }

  function scoreReferenceMatch(lensObj, intent = {}) {
    const warnings = [];
    const explanation = [];
    const breakdown = {};
    let score = 100;
    let metrics = null;
    try {
      metrics = getAutoTunerMetrics(lensObj, { wavePreset: ui.wavePreset?.value || "d", includeFieldFocus: true, focusRayCount: 9 });
    } catch (e) {
      return {
        lensJson: lensObj,
        analysis: { valid: false, metrics: null, breakdown: { invalid: 100 } },
        score: 0,
        warnings: [`Invalid generated lens: ${e?.message || e}`],
        explanation: "The generated starter could not be evaluated by the local raytrace tools.",
      };
    }

    const targetF = Number(intent?.targetFocalLengthMm);
    if (Number.isFinite(targetF) && targetF > 0) {
      const err = metrics.efl != null ? Math.abs(metrics.efl - targetF) / targetF : 1;
      breakdown.focalLength = Math.min(25, err * 120);
      score -= breakdown.focalLength;
      explanation.push(`Focal length target ${targetF}mm, measured ${mmText(metrics.efl)}.`);
    }

    const targetSpeed = Number(intent?.targetFNumberOrTStop);
    if (Number.isFinite(targetSpeed) && targetSpeed > 0) {
      const err = metrics.T != null ? Math.abs(metrics.T - targetSpeed) / targetSpeed : 1;
      breakdown.speed = Math.min(20, err * 90);
      score -= breakdown.speed;
      explanation.push(`Speed target f/T${targetSpeed}, measured ${tText(metrics.T)}.`);
    }

    const icTarget = referenceCoverageTargetMm(intent);
    if (icTarget) {
      const shortfall = Math.max(0, icTarget - Number(metrics.imageCircleMm || 0)) / icTarget;
      breakdown.coverage = shortfall * 25 + (!metrics.cov ? 8 : 0);
      score -= breakdown.coverage;
      if (shortfall > 0) warnings.push(`Coverage target ${icTarget}mm; current image circle ${mmText(metrics.imageCircleMm, 1)}.`);
    }

    const centerRms = Number(metrics.centerSpot?.rmsMm);
    const cornerRms = Number(metrics.cornerSpot?.rmsMm);
    if (!metrics.centerSpot?.ok || !Number.isFinite(centerRms)) {
      breakdown.center = 22;
      warnings.push("Center rays are not clean enough for a usable reference starter.");
    } else {
      const centerTarget = Math.max(0.03, 0.18 - (intent.lookTargets?.centerSharpness || 6) * 0.012);
      breakdown.center = Math.max(0, Math.min(18, (centerRms - centerTarget) * 60));
      explanation.push(`Center RMS ${mmText(centerRms, 4)}.`);
    }
    score -= breakdown.center || 0;

    const desiredSoftness = Number(intent.lookTargets?.edgeSoftness || 4);
    if (Number.isFinite(cornerRms) && Number.isFinite(centerRms)) {
      const ratio = cornerRms / Math.max(0.001, centerRms);
      if (desiredSoftness >= 7) {
        breakdown.outerFieldLook = ratio >= 1.4 ? 0 : (1.4 - ratio) * 6;
        explanation.push(`Outer field is ${ratio.toFixed(2)}x center RMS, matching a softer vintage edge target.`);
      } else {
        breakdown.outerFieldLook = Math.max(0, ratio - 3.0) * 4;
      }
      score -= Math.min(12, breakdown.outerFieldLook);
    }

    const fcDelta = Math.abs(Number(metrics.fieldFocus?.fieldCurvatureDeltaMm));
    const swirlTarget = Number(intent.lookTargets?.swirl || 0);
    const fieldTarget = Number(intent.lookTargets?.fieldCurvature || 0);
    if (Number.isFinite(fcDelta)) {
      if (swirlTarget >= 7 || fieldTarget >= 7) {
        breakdown.fieldCurvatureLook = fcDelta >= 0.4 ? 0 : (0.4 - fcDelta) * 8;
        explanation.push(`Field curvature proxy ${mmText(fcDelta, 3)} supports the requested vintage swirl/curved field look.`);
      } else {
        breakdown.fieldCurvatureLook = Math.max(0, fcDelta - 1.2) * 6;
      }
      score -= Math.min(10, breakdown.fieldCurvatureLook);
    } else if (swirlTarget >= 7) {
      breakdown.fieldCurvatureLook = 5;
      score -= 5;
      warnings.push("Field curvature proxy unavailable; swirl match is uncertain.");
    }

    const ca = estimateReferenceChromaticPenalty(lensObj);
    const caTolerance = Number(intent.lookTargets?.chromaticAberrationTolerance || 4);
    breakdown.chromatic = Math.max(0, ca.penalty - caTolerance * 0.45);
    score -= Math.min(12, breakdown.chromatic);
    if (ca.warning) warnings.push(ca.warning);

    if (intent.constraints?.plFriendly) {
      const rear = Number(metrics.rearClearance);
      breakdown.plFriendly = Number.isFinite(rear) && rear >= 0 ? 0 : 14;
      score -= breakdown.plFriendly;
      if (breakdown.plFriendly > 0) warnings.push("Back focus/rear clearance is not PL-friendly yet.");
    }

    if (intent.constraints?.maxLengthMm) {
      const length = Number(metrics.compactLength);
      if (Number.isFinite(length) && length > intent.constraints.maxLengthMm) {
        breakdown.length = Math.min(10, (length - intent.constraints.maxLengthMm) / Math.max(1, intent.constraints.maxLengthMm) * 30);
        score -= breakdown.length;
        warnings.push(`Starter length ${mmText(length)} exceeds requested max ${intent.constraints.maxLengthMm}mm.`);
      }
    }

    score = Math.max(0, Math.min(100, score));
    return {
      lensJson: lensObj,
      analysis: {
        valid: true,
        metrics: compactLensAiMetrics(metrics),
        rawMetrics: metrics,
        breakdown,
      },
      score,
      warnings,
      explanation: explanation.join(" "),
    };
  }

  function buildReferenceLensFromPrompt(promptRaw = "") {
    const prompt = String(promptRaw || "").trim();
    if (!prompt) {
      toast("Enter a reference prompt in the AI chat input first.");
      return null;
    }
    const intent = parseReferenceLensIntent(prompt);
    const lensJson = createReferenceStarterLens(intent);
    const result = scoreReferenceMatch(lensJson, intent);
    result.intent = intent;
    lensAiState.referenceResult = result;
    lensAiState.latestCandidateLens = clone(result.lensJson);
    lensAiState.latestCandidateMerit = {
      totalScore: 100 - result.score,
      metrics: result.analysis?.rawMetrics || null,
      notes: result.warnings || [],
    };
    renderReferenceLensResult(result);
    updateLensAiCandidateSummary();
    appendLensAiMessage("assistant", `Built a ${intent.inferredDesignFamily || "reference-inspired"} starter from your prompt. It is staged as a candidate, not applied.`);
    return result;
  }

  function getLensAiReferencePrompt() {
    const typed = String(ui.aiChatInput?.value || "").trim();
    if (typed) return typed;
    for (let i = lensAiState.messages.length - 1; i >= 0; i--) {
      const msg = lensAiState.messages[i];
      if (msg?.role === "user" && String(msg.content || "").trim()) return String(msg.content).trim();
    }
    return "";
  }

  function renderReferenceLensResult(result) {
    if (!ui.aiReferenceSummary) return;
    if (!result) {
      ui.aiReferenceSummary.textContent = "Use the chat prompt, then build a controlled starter prescription.";
      if (ui.aiAddReferenceLens) ui.aiAddReferenceLens.disabled = true;
      if (ui.aiIterateReference) ui.aiIterateReference.disabled = true;
      return;
    }
    const intent = result.intent || {};
    const metrics = result.analysis?.metrics || {};
    const warnings = result.warnings || [];
    const breakdown = result.analysis?.breakdown || {};
    const breakdownRows = Object.entries(breakdown)
      .filter(([, value]) => Number.isFinite(Number(value)) && Math.abs(Number(value)) > 0.001)
      .map(([key, value]) => `${key}: -${Number(value).toFixed(1)}`);
    ui.aiReferenceSummary.innerHTML = [
      `<strong>${escapeAttr(intent.referenceName || "Reference starter")}</strong>`,
      `Family: ${escapeAttr(intent.inferredDesignFamily || "Inferred starter")}`,
      `Target: ${escapeAttr(mmText(intent.targetFocalLengthMm))} • ${escapeAttr(tText(intent.targetFNumberOrTStop))} • coverage ${escapeAttr(intent.targetCoverage || "current")}`,
      `Generated: ${escapeAttr(mmText(metrics.efl))} • ${escapeAttr(tText(metrics.tStop))} • IC ${escapeAttr(mmText(metrics.imageCircleMm, 1))} • COV ${metrics.cov ? "YES" : "NO"}`,
      `Score: ${Number(result.score).toFixed(1)} / 100`,
      breakdownRows.length ? `Breakdown: ${escapeAttr(breakdownRows.join(" • "))}` : "",
      result.explanation ? `<div>${escapeAttr(result.explanation)}</div>` : "",
      warnings.length ? `<ul>${warnings.map((w) => `<li>${escapeAttr(w)}</li>`).join("")}</ul>` : "",
    ].filter(Boolean).join("<br>");
    if (ui.aiAddReferenceLens) ui.aiAddReferenceLens.disabled = false;
    if (ui.aiIterateReference) ui.aiIterateReference.disabled = false;
  }

  function addReferenceLensToBuilder() {
    const result = lensAiState.referenceResult;
    if (!result?.lensJson) {
      toast("No reference lens has been generated yet.");
      return null;
    }
    lensAiState.originalLens = clone(lens);
    loadLens(result.lensJson);
    renderAll();
    if (preview.ready) scheduleRenderPreview({ force: true });
    updateLensAiLensSummary();
    return appendLensAiToolResult("Reference lens added", `Loaded ${result.lensJson.name || "reference starter"} into Lens Builder.`, result.analysis);
  }

  function iterateReferenceLens(opts = {}) {
    const result = lensAiState.referenceResult;
    if (!result?.lensJson) {
      toast("No reference lens has been generated yet.");
      return null;
    }
    if (!opts.skipConfirm && !confirm("Load this reference starter into Lens Builder and start a safe Auto Tuner pass?")) return null;
    addReferenceLensToBuilder();
    const args = buildLensAiSuggestedTunerSettings({
      preset: "cornerFlatten",
      iterations: Math.min(1000, Number(ui.aiMaxTunerIterations?.value || 5000)),
      targets: {
        focalLength: { target: result.intent?.targetFocalLengthMm || result.analysis?.metrics?.efl || 50 },
        tStop: { target: result.intent?.targetFNumberOrTStop || result.analysis?.metrics?.tStop || 2 },
        imageCircle: { target: referenceCoverageTargetMm(result.intent) || 45 },
      },
      hardConstraints: {
        focalLength: { tolerance: 0.75 },
        tStop: { tolerance: 0.20 },
        imageCircle: { enabled: false, minimum: referenceCoverageTargetMm(result.intent) || 45 },
      },
      allowedVariables: {
        radii: true,
        airGaps: true,
        stopPosition: true,
        frontGroupSpacing: true,
        rearGroupSpacing: true,
        rearElementSpacing: true,
      },
    });
    return runLensAiAutoTunerAction({ type: "run_auto_tuner", label: "Iterate reference starter", args }, { headless: false });
  }

  // -------------------- AI Lens Assistant --------------------
  const lensAiState = {
    messages: [],
    toolResults: [],
    latestActions: [],
    latestCandidateLens: null,
    latestCandidateMerit: null,
    referenceResult: null,
    originalLens: null,
    busy: false,
    autoTunerWaiters: [],
    usage: {
      requests: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      maxRequests: 30,
      maxTokens: 150000,
      override: false,
      events: [],
    },
    autonomous: {
      running: false,
      stopRequested: false,
      goal: "",
      steps: 0,
      tunerRuns: 0,
      maxSteps: 6,
      maxTunerRuns: 3,
      maxTunerIterations: 5000,
      stopOnSuccess: true,
      originalMetrics: null,
      lastGoalStatus: null,
      stopReason: "",
    },
  };

  const LENS_AI_SAFE_AUTORUN = new Set([
    "get_lens_state",
    "get_lens_metrics",
    "build_reference_lens",
    "run_corner_focus_test",
    "suggest_auto_tuner_settings",
    "run_local_tuner",
    "run_auto_tuner",
    "preview_candidate",
    "copy_best_json",
  ]);
  const LENS_AI_STRUCTURAL_ACTIONS = new Set([
    "apply_candidate",
    "add_reference_lens",
    "iterate_reference_lens",
    "add_weak_rear_field_flattener",
    "scale_to_focal_length",
    "set_surface_value",
  ]);

  function isLensAiOpen() {
    return !!(ui.aiAssistantModal && !ui.aiAssistantModal.classList.contains("hidden"));
  }

  function getLensAiBudgetMode() {
    const mode = String(ui.aiBudgetMode?.value || "cheap");
    if (lensAiBudgetExceeded() && !lensAiState.usage.override) return "local";
    return mode === "expert" || mode === "auto" || mode === "local" ? mode : "cheap";
  }

  function lensAiBudgetExceeded() {
    const u = lensAiState.usage;
    return Number(u.requests || 0) >= Number(u.maxRequests || 30) ||
      Number(u.totalTokens || 0) >= Number(u.maxTokens || 150000);
  }

  function updateLensAiBudgetUi(status = "") {
    const mode = getLensAiBudgetMode();
    const label = mode === "local"
      ? (lensAiBudgetExceeded() ? "AI: budget exceeded, local only" : "AI: skipped, local action used")
      : (mode === "expert" ? "AI: expert ready" : (mode === "auto" ? "AI: auto routing" : "AI: cheap planner ready"));
    if (ui.aiBudgetStatus) ui.aiBudgetStatus.textContent = status || label;
    const u = lensAiState.usage;
    if (ui.aiUsageSummary) {
      ui.aiUsageSummary.textContent = `AI usage: ${u.requests || 0}/${u.maxRequests} requests • ${u.totalTokens || 0}/${u.maxTokens} tokens • cached ${u.cachedInputTokens || 0}`;
    }
  }

  function appendLensAiUsageLine(text) {
    const clean = String(text || "").trim();
    if (!clean || !ui.aiUsageLog) return;
    const d = document.createElement("div");
    d.className = "aiUsageLine";
    d.textContent = clean;
    ui.aiUsageLog.prepend(d);
    while (ui.aiUsageLog.children.length > 12) ui.aiUsageLog.removeChild(ui.aiUsageLog.lastChild);
  }

  function recordLensAiSkip(reason) {
    updateLensAiBudgetUi(`AI: skipped, local action used • ${reason}`);
    appendLensAiUsageLine(`skipped • ${reason}`);
  }

  function recordLensAiUsage(usage, reason = "") {
    const u = usage || {};
    const totals = lensAiState.usage;
    const input = Number(u.inputTokens || u.prompt_tokens || 0);
    const cached = Number(u.cachedInputTokens || u.cached_tokens || 0);
    const output = Number(u.outputTokens || u.completion_tokens || 0);
    const total = Number(u.totalTokens || u.total_tokens || (input + output));
    totals.requests += 1;
    totals.inputTokens += Number.isFinite(input) ? input : 0;
    totals.cachedInputTokens += Number.isFinite(cached) ? cached : 0;
    totals.outputTokens += Number.isFinite(output) ? output : 0;
    totals.totalTokens += Number.isFinite(total) ? total : 0;
    totals.events.unshift({ ...u, reason, createdAt: new Date().toISOString() });
    totals.events = totals.events.slice(0, 20);
    const model = u.model || "unknown";
    const cost = Number.isFinite(Number(u.estimatedCost)) && Number(u.estimatedCost) > 0
      ? ` • est $${Number(u.estimatedCost).toFixed(4)}`
      : "";
    appendLensAiUsageLine(`${model} • in ${input || "?"} • cached ${cached || 0} • out ${output || "?"} • total ${total || "?"}${cost} • ${reason}`);
    updateLensAiBudgetUi(u.mode === "expert" ? "AI: expert used" : "AI: cheap planner used");
    if (lensAiBudgetExceeded()) {
      updateLensAiBudgetUi("AI: budget exceeded, local only");
      toast("AI budget exceeded; switching to local-only mode.", 2200);
    }
  }

  function parseLensAiNumericConstraint(message, kind) {
    const lower = String(message || "").toLowerCase();
    const re = kind === "t"
      ? /(?:keep|preserve|lock|hold)?\s*t\s*([0-9]+(?:[.,][0-9]+)?)/i
      : /(?:keep|preserve|lock|hold)?\s*([0-9]+(?:[.,][0-9]+)?)\s*mm/i;
    const m = lower.match(re);
    const value = m ? num(m[1], null) : null;
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function buildLensAiConstraintArgs(message) {
    const metrics = getLensAiMetrics({ includeFieldFocus: false });
    const efl = parseLensAiNumericConstraint(message, "efl") || metrics.efl || 50;
    const tStop = parseLensAiNumericConstraint(message, "t") || metrics.tStop || 2;
    return {
      targets: {
        focalLength: { target: efl },
        tStop: { target: tStop },
        imageCircle: { target: 45 },
      },
      hardConstraints: {
        focalLength: { enabled: true, tolerance: Math.max(0.5, Math.abs(efl) * 0.015) },
        tStop: { enabled: true, tolerance: 0.20 },
        imageCircle: { enabled: false, minimum: 45 },
      },
      constraints: {
        keepEflMin: efl - Math.max(0.5, Math.abs(efl) * 0.015),
        keepEflMax: efl + Math.max(0.5, Math.abs(efl) * 0.015),
        keepTStopMin: tStop - 0.20,
        keepTStopMax: tStop + 0.20,
        preserveLook: true,
      },
    };
  }

  function parseLensAiLocalIntent(message) {
    const text = String(message || "").trim();
    const lower = text.toLowerCase();
    if (!text) return { confidence: 0, actions: [] };
    const constraints = buildLensAiConstraintArgs(text);
    const actions = [];
    let confidence = 0;
    let reason = "";

    if (/\b(build|create|make)\b.*\b(helios|44-2|biotar|petzval|cooke|panchro|double\s*gauss)\b|\b(helios|biotar|petzval|panchro)\b.*\b(lens|build|create)\b/.test(lower)) {
      actions.push({ type: "build_reference_lens", label: "Build reference starter", autoRunnable: true, requiresApproval: false, args: { prompt: text } });
      confidence = 0.95;
      reason = "reference lens command";
    } else if (/field\s*flattener|try.*flattener|add.*flattener/.test(lower)) {
      actions.push({ type: "add_weak_rear_field_flattener", label: "Add rear field flattener", requiresApproval: true, autoRunnable: false, args: {} });
      confidence = 0.86;
      reason = "field flattener command";
    } else if (/corner|hoek|sharp|scherp|coma|astig|field\s*curv/.test(lower)) {
      actions.push({ type: "run_corner_focus_test", label: "Run Corner Focus Test", autoRunnable: true, requiresApproval: false, args: {} });
      actions.push({ type: "run_local_tuner", label: "Run local corner tuner", autoRunnable: true, requiresApproval: false, args: { target: "improve_corners", iterations: 1200, ...constraints } });
      confidence = 0.88;
      reason = "corner improvement command";
    } else if (/image\s*circle|coverage|cov|vignet/.test(lower)) {
      actions.push({ type: "run_local_tuner", label: "Run local image-circle tuner", autoRunnable: true, requiresApproval: false, args: { target: "increase_image_circle", iterations: 1200, ...constraints } });
      confidence = 0.86;
      reason = "image circle command";
    } else if (/pl[-\s]?friendly|rear\s*(intrusion|clearance)|bfl|back\s*focus|mechanical\s*clearance/.test(lower)) {
      actions.push({ type: "run_local_tuner", label: "Run local clearance tuner", autoRunnable: true, requiresApproval: false, args: { target: "improve_clearance", iterations: 1000, ...constraints } });
      confidence = 0.84;
      reason = "mechanical clearance command";
    } else if (/auto\s*tune|autotune|iterate|tune\b|optimi[sz]e/.test(lower)) {
      actions.push({ type: "run_local_tuner", label: "Run local tuner", autoRunnable: true, requiresApproval: false, args: { target: "general_improve", iterations: 1000, ...constraints } });
      confidence = 0.80;
      reason = "local tuning command";
    } else if (/\b(keep|preserve|lock|hold)\b/.test(lower) && (parseLensAiNumericConstraint(text, "efl") || parseLensAiNumericConstraint(text, "t"))) {
      actions.push({ type: "suggest_auto_tuner_settings", label: "Prepare locked tuner settings", autoRunnable: true, requiresApproval: false, args: constraints });
      confidence = 0.78;
      reason = "hard target lock command";
    }

    if (/expert|deep report|detailed analysis|ambiguous/.test(lower)) confidence = Math.min(confidence, 0.5);
    return {
      confidence,
      reason,
      actions,
      assistantMessage: actions.length
        ? `I can handle that locally as a deterministic LensBuilder action (${reason}). No API call needed.`
        : "",
    };
  }

  function getLensAiLocalPlan(message, opts = {}) {
    const plan = parseLensAiLocalIntent(message);
    const localOnly = getLensAiBudgetMode() === "local" && !opts.forceExpert;
    if (plan.confidence > 0.75) return plan;
    if (!localOnly) return null;
    return {
      confidence: 1,
      reason: lensAiBudgetExceeded() ? "session budget exceeded" : "local-only budget mode",
      actions: [{ type: "get_lens_metrics", label: "Read current metrics", autoRunnable: true, requiresApproval: false, args: {} }],
      assistantMessage: "Local-only mode is active. I can inspect metrics and run common deterministic LensBuilder actions without calling the API.",
    };
  }

  async function runLensAiLocalPlan(plan, opts = {}) {
    const actions = (Array.isArray(plan?.actions) ? plan.actions : []).map(normalizeLensAiAction).filter((a) => a.type);
    recordLensAiSkip(plan?.reason || "local parser");
    appendLensAiMessage("assistant", plan?.assistantMessage || "Handled locally without an API call.");
    renderLensAiActions(actions, { skipAutoRun: true });
    for (const action of actions) {
      if (action.requiresApproval || !action.autoRunnable) continue;
      if (
        opts.autonomous &&
        (action.type === "run_auto_tuner" || action.type === "run_local_tuner") &&
        lensAiState.autonomous.tunerRuns >= lensAiState.autonomous.maxTunerRuns
      ) {
        appendLensAiLog("Tuner limit:", `Skipped ${action.label}; max tuner runs reached.`);
        appendLensAiToolResult("Tuner limit reached", `Skipped ${action.label}; max tuner runs reached.`);
        continue;
      }
      await executeLensAiAction(action, {
        ...opts,
        headless: opts.headless !== false,
        waitForFinish: opts.waitForFinish !== false,
        localPlan: true,
      });
    }
    return { actions, local: true };
  }

  function getLensAiMetrics(opts = {}) {
    const includeFieldFocus = !!opts.includeFieldFocus;
    const m = getAutoTunerMetrics(lens, {
      wavePreset: ui.wavePreset?.value || "d",
      includeFieldFocus,
      focusRayCount: opts.focusRayCount || 9,
    });
    const fieldFocus = m.fieldFocus || lastCornerFocusReport?.fieldFocus || null;
    const centerHit = Number(m.centerSpot?.hitRate);
    const midHit = Number(m.midSpot?.hitRate);
    const cornerHit = Number(m.cornerSpot?.hitRate);
    return {
      efl: finiteOrNull(m.efl),
      tStop: finiteOrNull(m.T),
      bfl: finiteOrNull(m.bfl),
      imageCircleMm: finiteOrNull(m.imageCircleMm),
      cov: !!m.cov,
      vignetting: Number.isFinite(cornerHit) ? Math.max(0, 1 - cornerHit) : null,
      rearClearance: finiteOrNull(m.rearClearance),
      centerRmsMm: finiteOrNull(m.centerSpot?.rmsMm),
      midRmsMm: finiteOrNull(m.midSpot?.rmsMm),
      cornerRmsMm: finiteOrNull(m.cornerSpot?.rmsMm),
      centerHitRate: Number.isFinite(centerHit) ? centerHit : null,
      midHitRate: Number.isFinite(midHit) ? midHit : null,
      cornerHitRate: Number.isFinite(cornerHit) ? cornerHit : null,
      fieldCurvatureDeltaMm: finiteOrNull(fieldFocus?.fieldCurvatureDeltaMm),
      centerBestFocusShiftMm: finiteOrNull(fieldFocus?.centerBestShiftMm),
      cornerBestFocusShiftMm: finiteOrNull(fieldFocus?.cornerBestShiftMm),
      centerBestRmsMm: finiteOrNull(fieldFocus?.centerBestRmsMm),
      cornerBestRmsMm: finiteOrNull(fieldFocus?.cornerBestRmsMm),
    };
  }

  function summarizeLensForAI(lensState) {
    const L = clone(lensState || lens);
    recomputeSurfacePositionsForLens(L);
    const surfaces = Array.isArray(L?.surfaces) ? L.surfaces : [];
    const metricsRaw = getAutoTunerMetrics(L, { wavePreset: ui.wavePreset?.value || "d", includeFieldFocus: false });
    const metrics = compactLensAiMetrics(metricsRaw);
    const stopSurfaceIndex = findStopSurfaceIndex(surfaces);
    const physical = surfaces.filter((s) => {
      const type = String(s?.type || "").toUpperCase();
      return type !== "OBJ" && type !== "IMS";
    });
    const aps = physical.map((s) => Number(s.ap)).filter(Number.isFinite);
    const glassList = [...new Set(physical.map((s) => String(s.glass || "AIR")).filter((g) => g && g !== "AIR"))].slice(0, 24);
    const sensor = getSensorWH();
    const fieldAngles = getAutoTunerFieldAngles(Math.hypot(sensor.w, sensor.h), metrics?.efl);
    const warnings = [];
    if (metrics?.cov === false) warnings.push("Coverage/COV is not passing current sensor diagonal.");
    if (Number.isFinite(Number(metrics?.rearClearance)) && Number(metrics.rearClearance) < 0) warnings.push("Rear intrusion is negative vs PL clearance plane.");
    if (!Number.isFinite(Number(metrics?.efl))) warnings.push("EFL unavailable.");
    return {
      name: L?.name || "Untitled lens",
      sensor: {
        w: num(ui.sensorW?.value, sensor.w),
        h: num(ui.sensorH?.value, sensor.h),
      },
      surfaceCount: surfaces.length,
      efl: metrics?.efl ?? null,
      bfl: metrics?.bfl ?? null,
      tStop: metrics?.tStop ?? null,
      imageCircle: metrics?.imageCircleMm ?? null,
      coverageOk: metrics?.cov ?? null,
      fieldAngles,
      rearIntrusion: Number.isFinite(Number(metrics?.rearClearance)) ? Math.max(0, -Number(metrics.rearClearance)) : null,
      rearClearance: metrics?.rearClearance ?? null,
      stopSurfaceIndex,
      glassList,
      clearApertureRange: {
        min: aps.length ? Math.min(...aps) : null,
        max: aps.length ? Math.max(...aps) : null,
      },
      warnings,
      selectedMetrics: {
        centerRmsMm: metrics?.centerRmsMm ?? null,
        midRmsMm: metrics?.midRmsMm ?? null,
        cornerRmsMm: metrics?.cornerRmsMm ?? null,
        fieldCurvatureDeltaMm: metrics?.fieldCurvatureDeltaMm ?? null,
      },
    };
  }

  function compactLensForAiPrompt(lensState) {
    return summarizeLensForAI(lensState);
  }

  function getLensAiAvailableActions() {
    return [
      "get_lens_state",
      "get_lens_metrics",
      "build_reference_lens",
      "run_corner_focus_test",
      "suggest_auto_tuner_settings",
      "run_local_tuner",
      "run_auto_tuner",
      "preview_candidate",
      "copy_best_json",
      "apply_candidate",
      "add_reference_lens",
      "iterate_reference_lens",
      "revert_to_original",
      "add_weak_rear_field_flattener",
      "scale_to_focal_length",
      "set_surface_value",
    ];
  }

  function getLensAiAutonomousSettings() {
    return {
      enabled: !!ui.aiAutonomousMode?.checked,
      maxSteps: Math.max(1, Math.min(20, Math.floor(num(ui.aiMaxSteps?.value, 6)))),
      maxTunerRuns: Math.max(0, Math.min(10, Math.floor(num(ui.aiMaxTunerRuns?.value, 3)))),
      maxTunerIterations: Math.max(50, Math.min(50000, Math.floor(num(ui.aiMaxTunerIterations?.value, 5000)))),
      stopOnSuccess: ui.aiStopOnSuccess ? !!ui.aiStopOnSuccess.checked : true,
      requireApprovalBeforeApply: ui.aiRequireApproval ? !!ui.aiRequireApproval.checked : true,
    };
  }

  function getLensAiAutonomousPayloadState() {
    const a = lensAiState.autonomous || {};
    return {
      enabled: !!ui.aiAutonomousMode?.checked,
      running: !!a.running,
      stopRequested: !!a.stopRequested,
      steps: a.steps || 0,
      tunerRuns: a.tunerRuns || 0,
      maxSteps: a.maxSteps || num(ui.aiMaxSteps?.value, 6),
      maxTunerRuns: a.maxTunerRuns || num(ui.aiMaxTunerRuns?.value, 3),
      maxTunerIterations: a.maxTunerIterations || num(ui.aiMaxTunerIterations?.value, 5000),
      stopOnSuccess: ui.aiStopOnSuccess ? !!ui.aiStopOnSuccess.checked : true,
      originalMetrics: a.originalMetrics || null,
      latestCandidate: getLensAiCandidateSummaryData(),
      goalStatus: a.lastGoalStatus || null,
      stopReason: a.stopReason || "",
    };
  }

  function getLensAiPayload(message, opts = {}) {
    const lensSummary = summarizeLensForAI(lens);
    const includeFullLensJson = !!opts.includeFullLensJson;
    const lensJson = includeFullLensJson ? clone(lens) : null;
    if (lensJson) recomputeSurfacePositionsForLens(lensJson);
    return {
      message,
      aiBudgetMode: getLensAiBudgetMode(),
      forceExpert: !!opts.forceExpert,
      promptCacheKey: "lensbuilder-ai-v1",
      lensJson: includeFullLensJson ? lensJson : null,
      lensSummary,
      metrics: getLensAiMetrics({ includeFieldFocus: false }),
      recentAutoTuner: getLensAiRecentAutoTunerCompact(),
      toolResults: lensAiState.toolResults.slice(-3).map((r) => ({ title: r.title, text: String(r.text || "").slice(0, 700), createdAt: r.createdAt })),
      history: lensAiState.messages.slice(-6).map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 900) })),
      autonomousState: opts.autonomousState || getLensAiAutonomousPayloadState(),
      availableActions: getLensAiAvailableActions(),
    };
  }

  function getLensAiRecentAutoTunerCompact() {
    const recent = getLensAiRecentAutoTuner();
    if (!recent) return null;
    return {
      running: recent.running,
      iteration: recent.iteration,
      bestIteration: recent.bestIteration,
      sinceBest: recent.sinceBest,
      bestScore: recent.bestScore,
      bestMetrics: recent.bestMetrics,
      accepted: recent.accepted,
      rejected: recent.rejected,
      invalid: recent.invalid,
    };
  }

  function getLensAiRecentAutoTuner() {
    if (!autoTunerState.bestMerit && !autoTunerState.currentMerit) return null;
    const bestIter = Number(autoTunerState.bestIteration);
    const iter = Number(autoTunerState.iteration || 0);
    return {
      running: !!autoTunerState.running,
      iteration: iter,
      bestIteration: Number.isFinite(bestIter) ? bestIter : null,
      sinceBest: Number.isFinite(bestIter) ? Math.max(0, iter - bestIter) : null,
      bestScore: finiteOrNull(autoTunerState.bestMerit?.totalScore),
      bestMetrics: compactLensAiMetrics(autoTunerState.bestMerit?.metrics),
      accepted: autoTunerState.acceptedMoves || 0,
      rejected: autoTunerState.rejectedMoves || 0,
      invalid: autoTunerState.invalidMoves || 0,
    };
  }

  function compactLensAiMetrics(metrics) {
    if (!metrics) return null;
    return {
      efl: finiteOrNull(metrics.efl),
      tStop: finiteOrNull(metrics.T),
      bfl: finiteOrNull(metrics.bfl),
      imageCircleMm: finiteOrNull(metrics.imageCircleMm),
      cov: metrics.cov == null ? null : !!metrics.cov,
      rearClearance: finiteOrNull(metrics.rearClearance),
      centerRmsMm: finiteOrNull(metrics.centerSpot?.rmsMm),
      midRmsMm: finiteOrNull(metrics.midSpot?.rmsMm),
      cornerRmsMm: finiteOrNull(metrics.cornerSpot?.rmsMm),
      fieldCurvatureDeltaMm: finiteOrNull(metrics.fieldFocus?.fieldCurvatureDeltaMm),
    };
  }

  function lensAiMetricGridHtml(metrics) {
    const rows = [
      ["EFL", mmText(metrics?.efl)],
      ["T", tText(metrics?.tStop)],
      ["IC", mmText(metrics?.imageCircleMm, 1)],
      ["COV", metrics?.cov ? "YES" : "NO"],
      ["BFL", mmText(metrics?.bfl)],
      ["Rear clr", mmText(metrics?.rearClearance)],
      ["Center RMS", mmText(metrics?.centerRmsMm, 4)],
      ["Corner RMS", mmText(metrics?.cornerRmsMm, 4)],
    ];
    return rows.map(([label, value]) => `<div><span>${escapeAttr(label)}</span><strong>${escapeAttr(value)}</strong></div>`).join("");
  }

  function updateLensAiLensSummary() {
    if (!ui.aiLensSummary) return;
    try {
      ui.aiLensSummary.innerHTML = lensAiMetricGridHtml(getLensAiMetrics({ includeFieldFocus: false }));
    } catch (e) {
      ui.aiLensSummary.textContent = `Metrics unavailable: ${e?.message || e}`;
    }
  }

  function getLensAiCandidateLens() {
    if (lensAiState.latestCandidateLens) return clone(lensAiState.latestCandidateLens);
    if (autoTunerState.bestLens && Number(autoTunerState.iteration || 0) > 0) return clone(autoTunerState.bestLens);
    return null;
  }

  function getLensAiCandidateMerit() {
    return lensAiState.latestCandidateMerit || autoTunerState.bestMerit || null;
  }

  function updateLensAiCandidateFromAutoTuner() {
    if (!autoTunerState.bestLens || Number(autoTunerState.iteration || 0) <= 0) return;
    lensAiState.latestCandidateLens = clone(autoTunerState.bestLens);
    lensAiState.latestCandidateMerit = autoTunerState.bestMerit ? clone(autoTunerState.bestMerit) : null;
    updateLensAiCandidateSummary();
  }

  function updateLensAiCandidateSummary() {
    if (!ui.aiCandidateSummary) return;
    const candidate = getLensAiCandidateLens();
    const merit = getLensAiCandidateMerit();
    const hasCandidate = !!candidate;
    ui.aiPreviewCandidate.disabled = !hasCandidate || autoTunerState.running;
    ui.aiApplyCandidate.disabled = !hasCandidate || autoTunerState.running;
    if (ui.aiCopyBestJson) ui.aiCopyBestJson.disabled = !hasCandidate;
    ui.aiRevertCandidate.disabled = !lensAiState.originalLens && !autoTunerState.originalLens;
    if (!hasCandidate) {
      ui.aiCandidateSummary.textContent = "No candidate yet.";
      return;
    }
    const m = merit?.metrics ? compactLensAiMetrics(merit.metrics) : getLensAiMetricsForCandidate(candidate);
    const iter = Number(autoTunerState.bestIteration);
    const score = Number(merit?.totalScore);
    ui.aiCandidateSummary.innerHTML = [
      `<span>Best candidate</span><strong>${Number.isFinite(score) ? scoreText(score) : "Ready"}</strong>`,
      `EFL ${escapeAttr(mmText(m?.efl))} • ${escapeAttr(tText(m?.tStop))} • IC ${escapeAttr(mmText(m?.imageCircleMm, 1))}`,
      `COV ${m?.cov ? "YES" : "NO"} • corner RMS ${escapeAttr(mmText(m?.cornerRmsMm, 4))}`,
      `center RMS ${escapeAttr(mmText(m?.centerRmsMm, 4))} • FC ${escapeAttr(mmText(m?.fieldCurvatureDeltaMm, 3))}`,
      Number.isFinite(iter) ? `Best iter ${Math.max(0, Math.floor(iter))}` : "",
    ].filter(Boolean).join("<br>");
  }

  function getLensAiMetricsForCandidate(candidate) {
    try {
      const m = getAutoTunerMetrics(candidate, { wavePreset: ui.wavePreset?.value || "d", includeFieldFocus: false });
      return compactLensAiMetrics(m);
    } catch (_) {
      return null;
    }
  }

  function getLensAiCandidateSummaryData() {
    const candidate = getLensAiCandidateLens();
    const merit = getLensAiCandidateMerit();
    const metrics = merit?.metrics ? compactLensAiMetrics(merit.metrics) : (candidate ? getLensAiMetricsForCandidate(candidate) : null);
    const bestIter = Number(autoTunerState.bestIteration);
    const iter = Number(autoTunerState.iteration || 0);
    return {
      exists: !!candidate,
      score: finiteOrNull(merit?.totalScore),
      metrics,
      bestIteration: Number.isFinite(bestIter) ? bestIter : null,
      sinceBest: Number.isFinite(bestIter) ? Math.max(0, iter - bestIter) : null,
      accepted: autoTunerState.acceptedMoves || 0,
      rejected: autoTunerState.rejectedMoves || 0,
      invalid: autoTunerState.invalidMoves || 0,
    };
  }

  function appendLensAiMessage(role, content) {
    const cleanRole = role === "user" || role === "tool" ? role : "assistant";
    const text = String(content || "").trim();
    if (!text) return;
    lensAiState.messages.push({ role: cleanRole, content: text });
    lensAiState.messages = lensAiState.messages.slice(-40);
    if (!ui.aiChatHistory) return;
    const d = document.createElement("div");
    d.className = `aiMsg aiMsg${cleanRole.charAt(0).toUpperCase()}${cleanRole.slice(1)}`;
    d.textContent = text;
    ui.aiChatHistory.appendChild(d);
    ui.aiChatHistory.scrollTop = ui.aiChatHistory.scrollHeight;
  }

  function appendLensAiToolResult(title, text, data = null) {
    const result = { title: String(title || "Tool result"), text: String(text || ""), data, createdAt: new Date().toISOString() };
    lensAiState.toolResults.push(result);
    lensAiState.toolResults = lensAiState.toolResults.slice(-12);
    appendLensAiMessage("tool", `${result.title}\n${result.text}`);
    return result;
  }

  function appendLensAiLog(label, text = "") {
    if (!ui.aiAutonomousLog) return;
    const d = document.createElement("div");
    d.className = "aiLogLine";
    d.innerHTML = `<strong>${escapeAttr(label)}</strong>${text ? ` ${escapeAttr(text)}` : ""}`;
    ui.aiAutonomousLog.appendChild(d);
    ui.aiAutonomousLog.scrollTop = ui.aiAutonomousLog.scrollHeight;
  }

  function clearLensAiLog() {
    if (ui.aiAutonomousLog) ui.aiAutonomousLog.innerHTML = "";
  }

  function setLensAiBusy(busy, message = "") {
    lensAiState.busy = !!busy;
    if (ui.aiSend) ui.aiSend.disabled = !!busy;
    if (ui.aiBuildReference) ui.aiBuildReference.disabled = !!busy;
    if (ui.aiExpertAnalysis) ui.aiExpertAnalysis.disabled = !!busy;
    if (ui.aiRunAutonomous) ui.aiRunAutonomous.disabled = !!busy || !!lensAiState.autonomous?.running;
    if (ui.aiStopAutonomous) ui.aiStopAutonomous.disabled = !lensAiState.autonomous?.running;
    if (ui.aiStatus) ui.aiStatus.textContent = message || (busy ? "Thinking..." : "Ready.");
  }

  function openLensAiAssistant() {
    if (!ui.aiAssistantModal) return;
    if (!lensAiState.originalLens) lensAiState.originalLens = clone(lens);
    ui.aiAssistantModal.classList.remove("hidden");
    ui.aiAssistantModal.setAttribute("aria-hidden", "false");
    updateLensAiLensSummary();
    updateLensAiCandidateSummary();
    updateLensAiBudgetUi();
    renderReferenceLensResult(lensAiState.referenceResult);
    setLensAiAutonomousRunning(!!lensAiState.autonomous?.running);
    if (!lensAiState.messages.length) {
      appendLensAiMessage(
        "assistant",
        "I can inspect the current lens, run a corner focus diagnostic, and set up safe Auto Tuner runs. I will not apply changes without approval."
      );
    }
    setTimeout(() => ui.aiChatInput?.focus(), 0);
  }

  function closeLensAiAssistant() {
    if (!ui.aiAssistantModal) return;
    ui.aiAssistantModal.classList.add("hidden");
    ui.aiAssistantModal.setAttribute("aria-hidden", "true");
  }

  function normalizeLensAiAction(raw, index = 0) {
    const type = String(raw?.type || raw?.name || raw?.action || "").trim();
    const args = raw?.args && typeof raw.args === "object"
      ? raw.args
      : (raw?.input && typeof raw.input === "object" ? raw.input : {});
    const structural = LENS_AI_STRUCTURAL_ACTIONS.has(type);
    return {
      id: String(raw?.id || `${type || "action"}_${index}`),
      type,
      label: String(raw?.label || lensAiDefaultActionLabel(type)),
      rationale: String(raw?.rationale || raw?.reason || ""),
      requiresApproval: raw?.requiresApproval == null ? structural : !!raw.requiresApproval,
      autoRunnable: raw?.autoRunnable == null ? LENS_AI_SAFE_AUTORUN.has(type) : !!raw.autoRunnable,
      args,
    };
  }

  function lensAiDefaultActionLabel(type) {
    const t = String(type || "");
    if (t === "get_lens_state") return "Inspect lens JSON";
    if (t === "get_lens_metrics") return "Read current metrics";
    if (t === "build_reference_lens") return "Build reference starter";
    if (t === "run_corner_focus_test") return "Run Corner Focus Test";
    if (t === "suggest_auto_tuner_settings") return "Suggest tuner settings";
    if (t === "run_local_tuner") return "Run local tuner";
    if (t === "run_auto_tuner") return "Run suggested tuner";
    if (t === "preview_candidate") return "Preview best";
    if (t === "copy_best_json") return "Copy best JSON";
    if (t === "apply_candidate") return "Apply candidate";
    if (t === "add_reference_lens") return "Add reference lens";
    if (t === "iterate_reference_lens") return "Iterate reference starter";
    if (t === "revert_to_original") return "Revert";
    if (t === "add_weak_rear_field_flattener") return "Add rear flattener";
    if (t === "scale_to_focal_length") return "Scale to focal length";
    if (t === "set_surface_value") return "Set surface value";
    return "Run action";
  }

  function renderLensAiActions(actions, opts = {}) {
    const list = (actions || []).map(normalizeLensAiAction).filter((a) => a.type);
    lensAiState.latestActions = list;
    if (!ui.aiActionQueue) return;
    ui.aiActionQueue.innerHTML = "";
    for (const action of list) {
      const card = document.createElement("div");
      card.className = "aiActionCard";
      const copy = document.createElement("div");
      const title = document.createElement("div");
      title.className = "aiActionTitle";
      title.textContent = action.label;
      const text = document.createElement("div");
      text.className = "aiActionText";
      text.textContent = action.rationale || lensAiActionHint(action);
      copy.appendChild(title);
      copy.appendChild(text);
      const btn = document.createElement("button");
      btn.className = action.requiresApproval ? "btn" : "btn btnPrimary";
      btn.type = "button";
      btn.textContent = action.label;
      btn.disabled = action.type === "set_surface_value";
      if (action.type === "set_surface_value") text.textContent = "Disabled in v1. Use manual surface controls for direct edits.";
      btn.addEventListener("click", () => executeLensAiAction(action));
      card.appendChild(copy);
      card.appendChild(btn);
      ui.aiActionQueue.appendChild(card);
    }
    if (!opts.skipAutoRun) maybeAutoRunLensAiActions(list);
  }

  function lensAiActionHint(action) {
    if (action.type === "run_local_tuner") return "Runs deterministic local tuning. The AI is not called inside the optimizer loop and the result is staged only.";
    if (action.type === "run_auto_tuner") return "Uses existing Auto Tuner with hard FL/T constraints and no automatic apply.";
    if (action.type === "build_reference_lens") return "Creates a controlled starter prescription from a known design family and stages it as a candidate.";
    if (action.type === "add_reference_lens") return "Loads the staged reference starter into Lens Builder.";
    if (action.type === "iterate_reference_lens") return "Loads the staged starter and runs a safe Auto Tuner pass.";
    if (action.type === "suggest_auto_tuner_settings") return "Builds safe Auto Tuner settings without changing the lens.";
    if (action.type === "run_corner_focus_test") return "Checks whether corner blur looks like field curvature, coma/astigmatism, or coverage.";
    if (action.requiresApproval) return "Requires approval before changing the lens.";
    return "Safe read-only action.";
  }

  function maybeAutoRunLensAiActions(actions) {
    if (!ui.aiAllowTools?.checked) return;
    const action = actions.find((a) => a.autoRunnable && LENS_AI_SAFE_AUTORUN.has(a.type) && !a._ran);
    if (!action) return;
    action._ran = true;
    setTimeout(() => executeLensAiAction(action), 80);
  }

  async function requestLensAiPlan(message, opts = {}) {
    if (getLensAiBudgetMode() === "local" && !opts.forceExpert) {
      const err = new Error("AI is in local-only mode. Use a local LensBuilder action or switch budget mode.");
      err.lensAiStage = "frontend";
      throw err;
    }
    let payload;
    try {
      payload = getLensAiPayload(message, opts);
    } catch (e) {
      e.lensAiStage = "frontend";
      throw e;
    }

    let response;
    try {
      response = await fetch("/api/lens-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const err = new Error(`Request to /api/lens-ai failed: ${e?.message || e}`);
      err.lensAiStage = "backend";
      throw err;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.assistantMessage || parsed?.detail || text;
      } catch (_) {}
      const err = new Error(detail || `AI endpoint returned ${response.status}`);
      err.lensAiStage = "backend";
      throw err;
    }
    try {
      const json = await response.json();
      recordLensAiUsage(json?.usage || null, opts.reason || (opts.forceExpert ? "Expert analysis" : "planner request"));
      return json;
    } catch (e) {
      const err = new Error(`Invalid JSON from /api/lens-ai: ${e?.message || e}`);
      err.lensAiStage = "backend";
      throw err;
    }
  }

  function lensAiGoalMentionsCorners(goal) {
    return /corner|hoek|sharp|scherp|field|coma|astig|circle|coverage|vignet/i.test(String(goal || ""));
  }

  function lensAiGoalStatusSummary() {
    const original = lensAiState.autonomous?.originalMetrics || null;
    const candidate = getLensAiCandidateSummaryData();
    const m = candidate?.metrics || null;
    if (!candidate?.exists || !m || !original) {
      return {
        success: false,
        confidence: 0.2,
        summary: "No candidate has been produced yet.",
      };
    }
    const eflOk = Number.isFinite(Number(m.efl)) && m.efl >= 49.25 && m.efl <= 50.75;
    const tOk = Number.isFinite(Number(m.tStop)) && m.tStop >= 1.80 && m.tStop <= 2.20;
    const covOk = m.cov === true;
    const cornerImproved = Number.isFinite(Number(m.cornerRmsMm)) &&
      Number.isFinite(Number(original.cornerRmsMm)) &&
      m.cornerRmsMm < original.cornerRmsMm;
    const centerOk = !Number.isFinite(Number(m.centerRmsMm)) ||
      !Number.isFinite(Number(original.centerRmsMm)) ||
      m.centerRmsMm <= original.centerRmsMm * 1.25;
    const fcOriginal = Math.abs(Number(original.fieldCurvatureDeltaMm));
    const fcCandidate = Math.abs(Number(m.fieldCurvatureDeltaMm));
    const fcImproved = Number.isFinite(fcOriginal) && Number.isFinite(fcCandidate) ? fcCandidate <= fcOriginal : true;
    const icPreferred = Number.isFinite(Number(m.imageCircleMm)) && m.imageCircleMm >= 45;
    const success = eflOk && tOk && covOk && cornerImproved && centerOk && fcImproved;
    const checks = [eflOk, tOk, covOk, cornerImproved, centerOk, fcImproved, icPreferred].filter(Boolean).length;
    return {
      success,
      confidence: Math.max(0.1, Math.min(1, checks / 7)),
      summary: [
        `EFL ${mmText(m.efl)} ${eflOk ? "OK" : "outside 49.25-50.75"}`,
        `${tText(m.tStop)} ${tOk ? "OK" : "outside T1.80-T2.20"}`,
        `COV ${covOk ? "YES" : "NO"}`,
        `corner RMS ${mmText(original.cornerRmsMm, 4)} -> ${mmText(m.cornerRmsMm, 4)}${cornerImproved ? " improved" : " not improved"}`,
        `center RMS ${centerOk ? "within limit" : "worse >25%"}`,
        icPreferred ? "IC >=45mm" : `IC ${mmText(m.imageCircleMm, 1)}`,
      ].join("; "),
    };
  }

  function setLensAiAutonomousRunning(running) {
    lensAiState.autonomous.running = !!running;
    if (ui.aiRunAutonomous) ui.aiRunAutonomous.disabled = !!running || !!lensAiState.busy;
    if (ui.aiStopAutonomous) ui.aiStopAutonomous.disabled = !running;
    if (ui.aiAutonomousMode) ui.aiAutonomousMode.disabled = !!running;
  }

  function stopLensAiAutonomous(reason = "Stopped by user") {
    lensAiState.autonomous.stopRequested = true;
    lensAiState.autonomous.stopReason = reason;
    if (autoTunerState.running) stopAutoTuner();
    appendLensAiLog("Stop requested:", reason);
    setLensAiAutonomousRunning(false);
    setLensAiBusy(false, reason);
  }

  async function runLensAiAutonomousPreflight(goal) {
    appendLensAiLog("Step 1:", "Reading current metrics");
    const metrics = getLensAiMetrics({ includeFieldFocus: false });
    lensAiState.autonomous.originalMetrics = metrics;
    appendLensAiToolResult("Lens metrics", formatLensAiMetricsText(metrics), metrics);
    updateLensAiLensSummary();

    if (lensAiGoalMentionsCorners(goal)) {
      appendLensAiLog("Step 2:", "Running Corner Focus Test");
      lastCornerFocusReport = buildCornerFocusReport(lens);
      if (isCornerFocusModalOpen()) renderCornerFocusReport(lastCornerFocusReport);
      const result = lensAiCornerFocusToolResult(lastCornerFocusReport);
      appendLensAiToolResult("Corner Focus Test", result.text, result.data);
      lensAiState.autonomous.originalMetrics = getLensAiMetrics({ includeFieldFocus: true });
    }
  }

  async function startLensAiAutonomous(goalRaw = "") {
    const goal = String(goalRaw || ui.aiChatInput?.value || lensAiState.autonomous.goal || "").trim();
    if (!goal || lensAiState.autonomous.running) return;
    const settings = getLensAiAutonomousSettings();
    lensAiState.originalLens = clone(lens);
    lensAiState.autonomous = {
      ...lensAiState.autonomous,
      running: true,
      stopRequested: false,
      goal,
      steps: 0,
      tunerRuns: 0,
      maxSteps: settings.maxSteps,
      maxTunerRuns: settings.maxTunerRuns,
      maxTunerIterations: settings.maxTunerIterations,
      stopOnSuccess: settings.stopOnSuccess,
      originalMetrics: null,
      lastGoalStatus: null,
      stopReason: "",
    };
    clearLensAiLog();
    setLensAiAutonomousRunning(true);
    setLensAiBusy(true, "AI is improving the lens...");

    try {
      await runLensAiAutonomousPreflight(goal);
      const localPlan = getLensAiLocalPlan(goal, { autonomous: true });
      if (localPlan) {
        appendLensAiLog("Local planner:", `${localPlan.reason || "matched common command"}; skipping API.`);
        await runLensAiLocalPlan(localPlan, { autonomous: true, headless: true, waitForFinish: true });
        lensAiState.autonomous.stopReason = "Local planner completed.";
      }
      while (
        lensAiState.autonomous.running &&
        !lensAiState.autonomous.stopRequested &&
        !lensAiState.autonomous.stopReason &&
        lensAiState.autonomous.steps < lensAiState.autonomous.maxSteps
      ) {
        lensAiState.autonomous.steps++;
        const stepNo = lensAiState.autonomous.steps;
        appendLensAiLog(`Step ${stepNo}:`, "Asking AI for next strategy");
        const result = await requestLensAiPlan(goal, {
          autonomousState: getLensAiAutonomousPayloadState(),
          reason: "autonomous planner",
        });
        const assistantMessage = String(result?.assistantMessage || result?.message || "Continuing autonomous lens improvement.");
        appendLensAiMessage("assistant", assistantMessage);
        const actions = (Array.isArray(result?.actions) ? result.actions : []).map(normalizeLensAiAction).filter((a) => a.type);
        renderLensAiActions(actions, { skipAutoRun: true });

        if (!actions.length) {
          lensAiState.autonomous.stopReason = result?.stopReason || "AI returned no further actions.";
          break;
        }

        for (const action of actions) {
          if (lensAiState.autonomous.stopRequested) break;
          if (action.type === "run_auto_tuner" && lensAiState.autonomous.tunerRuns >= lensAiState.autonomous.maxTunerRuns) {
            appendLensAiLog("Tuner limit:", `Skipped ${action.label}; max tuner runs reached.`);
            appendLensAiToolResult("Tuner limit reached", `Skipped ${action.label}; max tuner runs reached.`);
            continue;
          }
          if (action.requiresApproval) {
            appendLensAiLog("Approval needed:", `${action.label}. Stopping autonomous loop before permanent/structural change.`);
            lensAiState.autonomous.stopReason = `${action.label} requires approval.`;
            lensAiState.autonomous.stopRequested = true;
            break;
          }
          appendLensAiLog(`Step ${stepNo}:`, action.label);
          await executeLensAiAction(action, { autonomous: true, headless: true });
        }

        const localGoal = lensAiGoalStatusSummary();
        lensAiState.autonomous.lastGoalStatus = result?.goalStatus || localGoal;
        updateLensAiCandidateSummary();
        if (settings.stopOnSuccess && localGoal.success) {
          lensAiState.autonomous.stopReason = "Success criteria met.";
          break;
        }
        if (result?.shouldContinue === false) {
          lensAiState.autonomous.stopReason = result?.stopReason || localGoal.summary || "AI stopped.";
          break;
        }
      }

      if (!lensAiState.autonomous.stopReason) {
        lensAiState.autonomous.stopReason = lensAiState.autonomous.steps >= lensAiState.autonomous.maxSteps
          ? "Reached max autonomous steps."
          : "Stopped.";
      }
      const finalStatus = lensAiGoalStatusSummary();
      lensAiState.autonomous.lastGoalStatus = finalStatus;
      appendLensAiLog("Finished:", lensAiState.autonomous.stopReason);
      appendLensAiMessage(
        "assistant",
        `Autonomous run finished: ${lensAiState.autonomous.stopReason}\n\n${finalStatus.summary}\n\nBest candidate is ready for Preview, Apply, Copy JSON, or Revert.`
      );
    } catch (e) {
      if (lensAiState.originalLens) {
        loadLens(lensAiState.originalLens);
        renderAll();
      }
      const prefix = e?.lensAiStage === "frontend" ? "AI frontend error" : (e?.lensAiStage === "backend" ? "AI backend error" : "AI autonomous error");
      appendLensAiMessage("assistant", `${prefix}: ${e?.message || e}`);
      appendLensAiLog("Error:", "Original lens restored.");
    } finally {
      lensAiState.autonomous.running = false;
      setLensAiAutonomousRunning(false);
      setLensAiBusy(false, lensAiState.autonomous.stopReason || "Autonomous run complete.");
      updateLensAiLensSummary();
      updateLensAiCandidateSummary();
    }
  }

  async function submitLensAiMessage() {
    const message = String(ui.aiChatInput?.value || "").trim();
    if (!message || lensAiState.busy) return;
    ui.aiChatInput.value = "";
    appendLensAiMessage("user", message);
    if (ui.aiAutonomousMode?.checked) {
      await startLensAiAutonomous(message);
      return;
    }
    setLensAiBusy(true, "Asking AI assistant...");
    try {
      const localPlan = getLensAiLocalPlan(message);
      if (localPlan) {
        setLensAiBusy(true, "Running local LensBuilder action...");
        await runLensAiLocalPlan(localPlan, { headless: true, waitForFinish: true });
        setLensAiBusy(false, "Ready.");
        return;
      }
      const result = await requestLensAiPlan(message, { reason: `${getLensAiBudgetMode()} planner` });
      const assistantMessage = String(result?.assistantMessage || result?.message || "I made a safe plan.");
      appendLensAiMessage("assistant", assistantMessage);
      renderLensAiActions(Array.isArray(result?.actions) ? result.actions : []);
      setLensAiBusy(false, "Ready.");
    } catch (e) {
      const prefix = e?.lensAiStage === "frontend" ? "AI frontend error" : "AI backend error";
      appendLensAiMessage("assistant", `${prefix}: ${e?.message || e}`);
      setLensAiBusy(false, `${prefix}.`);
    }
  }

  async function requestLensAiExpertAnalysis() {
    if (lensAiState.busy) return;
    if (lensAiBudgetExceeded() && !lensAiState.usage.override) {
      if (!confirm("The AI session budget is exceeded. Run one expert request anyway?")) return;
      lensAiState.usage.override = true;
    }
    const typed = String(ui.aiChatInput?.value || "").trim();
    const message = typed || "Expert analysis: review the current lens summary, recent tool results, and suggest the next safest local action. Do not apply changes.";
    if (typed) {
      ui.aiChatInput.value = "";
      appendLensAiMessage("user", message);
    }
    setLensAiBusy(true, "Asking expert model...");
    try {
      const result = await requestLensAiPlan(message, { forceExpert: true, reason: "Expert analysis" });
      appendLensAiMessage("assistant", String(result?.assistantMessage || result?.message || "Expert analysis completed."));
      renderLensAiActions(Array.isArray(result?.actions) ? result.actions : []);
      setLensAiBusy(false, "Ready.");
    } catch (e) {
      const prefix = e?.lensAiStage === "frontend" ? "AI frontend error" : "AI backend error";
      appendLensAiMessage("assistant", `${prefix}: ${e?.message || e}`);
      setLensAiBusy(false, `${prefix}.`);
    }
  }

  function requireLensAiApproval(action, message) {
    if (!ui.aiRequireApproval?.checked && !action?.requiresApproval) return true;
    return confirm(message || `${action?.label || "This action"} will change the lens. Continue?`);
  }

  async function executeLensAiAction(actionRaw, opts = {}) {
    const action = normalizeLensAiAction(actionRaw);
    if (!action.type) return null;
    if (opts.autonomous && action.requiresApproval) {
      const text = `${action.label} requires user approval and was not run autonomously.`;
      appendLensAiLog("Approval needed:", text);
      return appendLensAiToolResult("Approval needed", text, { action });
    }
    try {
      if (action.type === "get_lens_state") {
        const summary = compactLensForAiPrompt(lens);
        return appendLensAiToolResult("Lens state", `${summary.surfaceCount} surfaces loaded. OBJ/IMS are protected; labels are preserved.`, summary);
      } else if (action.type === "get_lens_metrics") {
        const metrics = getLensAiMetrics({ includeFieldFocus: false });
        updateLensAiLensSummary();
        return appendLensAiToolResult("Lens metrics", formatLensAiMetricsText(metrics), metrics);
      } else if (action.type === "build_reference_lens") {
        const prompt = String(action.args?.prompt || action.args?.referencePrompt || getLensAiReferencePrompt()).trim();
        const result = buildReferenceLensFromPrompt(prompt);
        if (!result) return null;
        return appendLensAiToolResult(
          "Reference starter built",
          `${result.intent?.referenceName || "Reference"} -> ${result.intent?.inferredDesignFamily || "starter"}; score ${Number(result.score).toFixed(1)}/100. Staged as a candidate, not applied.`,
          {
            intent: result.intent,
            score: result.score,
            metrics: result.analysis?.metrics || null,
            warnings: result.warnings || [],
          }
        );
      } else if (action.type === "run_corner_focus_test") {
        lastCornerFocusReport = buildCornerFocusReport(lens);
        if (isCornerFocusModalOpen()) renderCornerFocusReport(lastCornerFocusReport);
        const result = lensAiCornerFocusToolResult(lastCornerFocusReport);
        return appendLensAiToolResult("Corner Focus Test", result.text, result.data);
      } else if (action.type === "suggest_auto_tuner_settings") {
        const settings = buildLensAiSuggestedTunerSettings(action.args || {});
        return appendLensAiToolResult("Suggested Auto Tuner settings", formatLensAiTunerSettingsText(settings), settings);
      } else if (action.type === "run_local_tuner") {
        return await runLensAiLocalTunerAction(action, opts);
      } else if (action.type === "run_auto_tuner") {
        return await runLensAiAutoTunerAction(action, opts);
      } else if (action.type === "preview_candidate") {
        return previewLensAiCandidate();
      } else if (action.type === "copy_best_json") {
        return await copyLensAiBestJson();
      } else if (action.type === "apply_candidate") {
        return applyLensAiCandidate(action);
      } else if (action.type === "add_reference_lens") {
        if (!requireLensAiApproval(action, "Load the generated reference starter into Lens Builder?")) return null;
        return addReferenceLensToBuilder();
      } else if (action.type === "iterate_reference_lens") {
        if (!requireLensAiApproval(action, "Load the generated reference starter and run a safe Auto Tuner pass?")) return null;
        return iterateReferenceLens({ skipConfirm: true });
      } else if (action.type === "revert_to_original") {
        return revertLensAiOriginal();
      } else if (action.type === "add_weak_rear_field_flattener") {
        if (!requireLensAiApproval(action, "Add a weak rear field flattener before IMS?")) return null;
        if (!lensAiState.originalLens) lensAiState.originalLens = clone(lens);
        addWeakRearFieldFlattener();
        updateLensAiLensSummary();
        return appendLensAiToolResult("Added field flattener", formatLensAiMetricsText(getLensAiMetrics({ includeFieldFocus: false })));
      } else if (action.type === "scale_to_focal_length") {
        if (!requireLensAiApproval(action, "Scale optical geometry to the requested focal length?")) return null;
        return scaleLensAiToFocalLength(action);
      } else if (action.type === "set_surface_value") {
        return appendLensAiToolResult("Surface edit blocked", "set_surface_value is disabled in v1. Use the surface table for direct edits.");
      } else {
        return appendLensAiToolResult("Unknown action", `Action type "${action.type}" is not implemented in v1.`);
      }
    } catch (e) {
      return appendLensAiToolResult("Action failed", `${action.label}: ${e?.message || e}`, { error: true });
    } finally {
      updateLensAiCandidateSummary();
    }
  }

  function isCornerFocusModalOpen() {
    return !!(ui.cornerFocusModal && !ui.cornerFocusModal.classList.contains("hidden"));
  }

  function formatLensAiMetricsText(metrics) {
    return [
      `EFL: ${mmText(metrics?.efl)}`,
      `T-stop: ${tText(metrics?.tStop)}`,
      `Image circle: ${mmText(metrics?.imageCircleMm, 1)}`,
      `COV: ${metrics?.cov ? "YES" : "NO"}`,
      `BFL: ${mmText(metrics?.bfl)}`,
      `Rear clearance: ${mmText(metrics?.rearClearance)}`,
      `Center RMS: ${mmText(metrics?.centerRmsMm, 4)}`,
      `Mid RMS: ${mmText(metrics?.midRmsMm, 4)}`,
      `Corner RMS: ${mmText(metrics?.cornerRmsMm, 4)}`,
      `Field curvature delta: ${mmText(metrics?.fieldCurvatureDeltaMm, 3)}`,
    ].join("\n");
  }

  function lensAiCornerFocusToolResult(report) {
    const ff = report?.fieldFocus || {};
    const notes = report?.notes || summarizeCornerFocusDiagnostic(ff, report?.metrics || null);
    const likely = lensAiLikelyIssue(notes);
    const data = {
      centerBestFocusShiftMm: finiteOrNull(ff.centerBestShiftMm),
      cornerBestFocusShiftMm: finiteOrNull(ff.cornerBestShiftMm),
      centerRmsAtCenterFocusMm: finiteOrNull(ff.centerBestRmsMm),
      cornerRmsAtCenterFocusMm: finiteOrNull(ff.cornerCurrentRmsMm),
      cornerRmsAtCornerFocusMm: finiteOrNull(ff.cornerBestRmsMm),
      fieldCurvatureDeltaMm: finiteOrNull(ff.fieldCurvatureDeltaMm),
      likelyIssue: likely,
      notes,
    };
    const text = [
      `Likely issue: ${likely}`,
      `Center best shift: ${mmText(data.centerBestFocusShiftMm, 3)}`,
      `Corner best shift: ${mmText(data.cornerBestFocusShiftMm, 3)}`,
      `Focus delta: ${mmText(data.fieldCurvatureDeltaMm, 3)}`,
      `Corner RMS at current plane: ${mmText(data.cornerRmsAtCenterFocusMm, 4)}`,
      `Corner RMS after corner refocus: ${mmText(data.cornerRmsAtCornerFocusMm, 4)}`,
      "",
      ...notes.map((n) => `- ${n}`),
    ].join("\n");
    return { text, data };
  }

  function lensAiLikelyIssue(notes) {
    const joined = (notes || []).join(" ").toLowerCase();
    if (joined.includes("coverage") || joined.includes("vignetting")) return "coverage/vignetting";
    if (joined.includes("field curvature")) return "field curvature";
    if (joined.includes("coma") || joined.includes("astigmatism")) return "coma/astigmatism";
    return "unknown";
  }

  function buildLensAiSuggestedTunerSettings(args = {}) {
    const current = getLensAiMetrics({ includeFieldFocus: false });
    const targetFL = Number(args?.targets?.focalLength?.target ?? args?.targetFocalLength ?? current.efl ?? 50);
    const targetT = Number(args?.targets?.tStop?.target ?? args?.targetTStop ?? current.tStop ?? 2);
    return {
      preset: String(args?.preset || "cornerFlatten"),
      iterations: Math.max(50, Math.floor(Number(args?.iterations || lensAiState.autonomous?.maxTunerIterations || num(ui.aiMaxTunerIterations?.value, 5000)))),
      stepSize: String(args?.stepSize || "small"),
      runSpeed: String(args?.runSpeed || "safe"),
      maxStuckIterations: Math.max(50, Math.floor(Number(args?.maxStuckIterations || 700))),
      targets: {
        focalLength: { enabled: true, target: Number.isFinite(targetFL) && targetFL > 0 ? targetFL : 50 },
        tStop: { enabled: true, target: Number.isFinite(targetT) && targetT > 0 ? targetT : 2 },
        imageCircle: { enabled: true, target: Number(args?.targets?.imageCircle?.target ?? 45) || 45 },
      },
      hardConstraints: {
        focalLength: { enabled: true, tolerance: Number(args?.hardConstraints?.focalLength?.tolerance ?? 0.75) || 0.75 },
        tStop: { enabled: true, tolerance: Number(args?.hardConstraints?.tStop?.tolerance ?? 0.20) || 0.20 },
        imageCircle: { enabled: !!args?.hardConstraints?.imageCircle?.enabled, minimum: Number(args?.hardConstraints?.imageCircle?.minimum ?? 45) || 45 },
      },
      allowedVariables: {
        radii: args?.allowedVariables?.radii !== false,
        airGaps: args?.allowedVariables?.airGaps !== false,
        stopPosition: args?.allowedVariables?.stopPosition !== false,
        frontGroupSpacing: args?.allowedVariables?.frontGroupSpacing !== false,
        rearGroupSpacing: args?.allowedVariables?.rearGroupSpacing !== false,
        rearElementSpacing: args?.allowedVariables?.rearElementSpacing !== false,
        fieldFlattenerRadii: !!args?.allowedVariables?.fieldFlattenerRadii,
        fieldFlattenerPosition: !!args?.allowedVariables?.fieldFlattenerPosition,
        fieldFlattenerThickness: !!args?.allowedVariables?.fieldFlattenerThickness,
        clearApertures: false,
        stopAperture: false,
        glassThicknesses: false,
        glassTypes: false,
        sensorShift: false,
        imsAperture: false,
      },
      weights: {
        focalLength: num(args?.weights?.focalLength, 6),
        tStop: num(args?.weights?.tStop, 5),
        imageCircle: num(args?.weights?.imageCircle, 7),
        centerSharpness: num(args?.weights?.centerSharpness, 4),
        cornerSharpness: num(args?.weights?.cornerSharpness, 10),
        fieldCurvature: num(args?.weights?.fieldCurvature, 8),
        vignetting: num(args?.weights?.vignetting, 8),
        rearClearance: num(args?.weights?.rearClearance, 4),
        compactness: num(args?.weights?.compactness, 2),
      },
      extraTargets: {
        centerSharpness: { enabled: args?.targets?.centerSharpness?.enabled !== false },
        cornerSharpness: { enabled: args?.targets?.cornerSharpness?.enabled !== false },
        fieldCurvature: { enabled: !!args?.targets?.fieldCurvature?.enabled },
        vignetting: { enabled: args?.targets?.vignetting?.enabled !== false },
        rearClearance: {
          enabled: !!args?.targets?.rearClearance?.enabled,
          target: Number(args?.targets?.rearClearance?.target ?? 0) || 0,
        },
        compactness: { enabled: !!args?.targets?.compactness?.enabled },
      },
    };
  }

  function buildLensAiLocalTunerSettings(args = {}) {
    const target = String(args?.target || args?.goal || "general_improve");
    const current = getLensAiMetrics({ includeFieldFocus: false });
    const maxIter = Math.max(50, Number(ui.aiMaxTunerIterations?.value || lensAiState.autonomous?.maxTunerIterations || 5000));
    const settings = buildLensAiSuggestedTunerSettings({
      ...args,
      iterations: Math.min(Math.max(50, Math.floor(Number(args?.iterations || 1000))), maxIter),
      stepSize: args?.stepSize || "small",
      runSpeed: args?.runSpeed || "safe",
    });
    settings.localTarget = target;
    settings.dryRunLocal = true;
    settings.allowedVariables = {
      ...settings.allowedVariables,
      radii: args?.allowedVariables?.radii !== false,
      airGaps: args?.allowedVariables?.airGaps !== false,
      stopPosition: args?.allowedVariables?.stopPosition !== false,
      rearGroupSpacing: args?.allowedVariables?.rearGroupSpacing !== false,
      rearElementSpacing: args?.allowedVariables?.rearElementSpacing !== false,
      frontGroupSpacing: target === "improve_corners" || !!args?.allowedVariables?.frontGroupSpacing,
      clearApertures: false,
      stopAperture: false,
      glassThicknesses: false,
      glassTypes: false,
      sensorShift: false,
      imsAperture: false,
    };

    if (target === "increase_image_circle") {
      settings.targets.imageCircle.target = Math.max(45, Number(current.imageCircleMm || 0) + 1.5);
      settings.extraTargets.cornerSharpness.enabled = true;
      settings.extraTargets.fieldCurvature.enabled = false;
      settings.weights.imageCircle = 11;
      settings.weights.vignetting = 10;
      settings.weights.cornerSharpness = 6;
    } else if (target === "improve_clearance") {
      settings.extraTargets.rearClearance.enabled = true;
      settings.extraTargets.rearClearance.target = Math.max(0, Number(args?.targets?.rearClearance?.target ?? current.bfl ?? 0) || 0);
      settings.extraTargets.cornerSharpness.enabled = false;
      settings.weights.rearClearance = 11;
      settings.weights.imageCircle = 3;
      settings.weights.cornerSharpness = 3;
      settings.allowedVariables.radii = false;
      settings.allowedVariables.airGaps = true;
      settings.allowedVariables.rearGroupSpacing = true;
      settings.allowedVariables.rearElementSpacing = true;
    } else if (target === "improve_corners") {
      settings.extraTargets.fieldCurvature.enabled = true;
      settings.weights.centerSharpness = 4;
      settings.weights.cornerSharpness = 12;
      settings.weights.fieldCurvature = 9;
      settings.weights.imageCircle = 8;
      settings.weights.vignetting = 8;
    }
    return settings;
  }

  async function runLensAiLocalTunerAction(action, opts = {}) {
    const settings = buildLensAiLocalTunerSettings(action.args || {});
    appendLensAiUsageLine(`local tuner • ${settings.localTarget || "general"} • ${settings.iterations} iterations • no API`);
    updateLensAiBudgetUi("AI: skipped, local tuner running");
    return await runLensAiAutoTunerAction(
      { ...action, type: "run_auto_tuner", label: action.label || "Run local tuner", args: settings },
      { ...opts, headless: opts.headless !== false, waitForFinish: opts.waitForFinish !== false }
    );
  }

  function formatLensAiTunerSettingsText(settings) {
    return [
      `Preset: ${settings.preset}${settings.localTarget ? ` (${settings.localTarget})` : ""}`,
      `Iterations: ${settings.iterations}`,
      `Step size: ${settings.stepSize}; speed: ${settings.runSpeed}`,
      `Hard EFL: ${settings.targets.focalLength.target} +/- ${settings.hardConstraints.focalLength.tolerance}mm`,
      `Hard T: ${settings.targets.tStop.target} +/- ${settings.hardConstraints.tStop.tolerance}`,
      `IC target: ${settings.targets.imageCircle.target}mm${settings.hardConstraints.imageCircle.enabled ? " hard minimum" : " soft"}`,
      `Allowed: ${Object.entries(settings.allowedVariables).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`,
    ].join("\n");
  }

  function notifyLensAiAutoTunerFinished(reason) {
    const waiters = lensAiState.autoTunerWaiters.splice(0);
    const summary = buildLensAiAutoTunerResult(reason || autoTunerState.stopReason || "Stopped");
    for (const resolve of waiters) resolve(summary);
  }

  function waitForLensAiAutoTunerFinish() {
    if (!autoTunerState.running) return Promise.resolve(buildLensAiAutoTunerResult(autoTunerState.stopReason || "Not running"));
    return new Promise((resolve) => lensAiState.autoTunerWaiters.push(resolve));
  }

  function buildLensAiAutoTunerResult(reason = "") {
    const merit = autoTunerState.bestMerit || null;
    const metrics = merit?.metrics ? compactLensAiMetrics(merit.metrics) : null;
    const bestIter = Number(autoTunerState.bestIteration);
    const iter = Number(autoTunerState.iteration || 0);
    const orig = Number(autoTunerState.originalMerit?.totalScore);
    const best = Number(merit?.totalScore);
    const improvement = Number.isFinite(orig) && Number.isFinite(best) && Math.abs(orig) > 1e-12
      ? ((orig - best) / Math.abs(orig)) * 100
      : null;
    return {
      reason,
      bestScore: finiteOrNull(best),
      bestMetrics: metrics,
      bestIteration: Number.isFinite(bestIter) ? bestIter : null,
      sinceBest: Number.isFinite(bestIter) ? Math.max(0, iter - bestIter) : null,
      improvement: Number.isFinite(Number(improvement)) ? improvement : null,
      accepted: autoTunerState.acceptedMoves || 0,
      rejected: autoTunerState.rejectedMoves || 0,
      invalid: autoTunerState.invalidMoves || 0,
      hardRejectedFL: autoTunerState.hardRejectedFL || 0,
      hardRejectedT: autoTunerState.hardRejectedT || 0,
      hardRejectedIC: autoTunerState.hardRejectedIC || 0,
      topCandidates: (autoTunerState.history || []).slice(-5).reverse().map((h) => ({
        iteration: h.iteration,
        score: finiteOrNull(h.score),
        efl: finiteOrNull(h.efl),
        tStop: finiteOrNull(h.T),
        imageCircleMm: finiteOrNull(h.imageCircleMm),
        bfl: finiteOrNull(h.bfl),
        notes: Array.isArray(h.notes) ? h.notes.join(", ") : String(h.notes || ""),
      })),
    };
  }

  function formatLensAiAutoTunerResultText(result) {
    const m = result?.bestMetrics || {};
    return [
      `Status: ${result?.reason || "Stopped"}`,
      `Best score: ${scoreText(result?.bestScore)}`,
      `Best iter: ${result?.bestIteration ?? "—"}; since best: ${result?.sinceBest ?? "—"}`,
      `EFL: ${mmText(m.efl)}; ${tText(m.tStop)}; IC: ${mmText(m.imageCircleMm, 1)}; COV: ${m.cov ? "YES" : "NO"}`,
      `Center RMS: ${mmText(m.centerRmsMm, 4)}; corner RMS: ${mmText(m.cornerRmsMm, 4)}; FC: ${mmText(m.fieldCurvatureDeltaMm, 3)}`,
      `Accepted/rejected/invalid: ${result?.accepted || 0}/${result?.rejected || 0}/${result?.invalid || 0}`,
    ].join("\n");
  }

  async function runLensAiAutoTunerAction(action, opts = {}) {
    if (autoTunerState.running) {
      return appendLensAiToolResult("Auto Tuner", "Auto Tuner is already running.");
    }
    if (!lensAiState.originalLens) lensAiState.originalLens = clone(lens);
    const settings = buildLensAiSuggestedTunerSettings(action.args || {});
    if (opts.autonomous) {
      const maxIter = Math.max(50, Number(lensAiState.autonomous?.maxTunerIterations || num(ui.aiMaxTunerIterations?.value, 5000)));
      settings.iterations = Math.min(settings.iterations, maxIter);
      lensAiState.autonomous.tunerRuns++;
      appendLensAiLog(`Step ${lensAiState.autonomous.steps}:`, `Running Auto Tuner (${settings.iterations} iterations, ${settings.stepSize}, ${settings.runSpeed})`);
    }
    configureAutoTunerFromLensAiArgs(settings);
    if (!opts.headless) openAutoTunerModal();
    startAutoTuner();
    if (!autoTunerState.running) {
      const result = buildLensAiAutoTunerResult(autoTunerState.stopReason || "Auto Tuner did not start");
      return appendLensAiToolResult("Auto Tuner result", formatLensAiAutoTunerResultText(result), result);
    }
    const shouldWait = !!(opts.autonomous || opts.waitForFinish);
    if (!shouldWait) {
      return appendLensAiToolResult(
        "Auto Tuner started",
        "Running suggested tuner with existing Auto Tuner safety checks. It will not apply the best result automatically.",
        { settings }
      );
    }
    const result = await waitForLensAiAutoTunerFinish();
    updateLensAiCandidateFromAutoTuner();
    return appendLensAiToolResult("Auto Tuner result", formatLensAiAutoTunerResultText(result), result);
  }

  function configureAutoTunerFromLensAiArgs(args) {
    const preset = String(args?.preset || "cornerFlatten");
    if (ui.atPreset) ui.atPreset.value = preset === "clean50" ? "clean50" : "cornerFlatten";
    applyAutoTunerPreset(ui.atPreset?.value || "cornerFlatten");

    if (ui.atIterations && Number.isFinite(Number(args?.iterations))) ui.atIterations.value = String(Math.max(1, Math.floor(Number(args.iterations))));
    if (ui.atStepSize && args?.stepSize) ui.atStepSize.value = String(args.stepSize);
    if (ui.atRunSpeed && args?.runSpeed) ui.atRunSpeed.value = String(args.runSpeed);
    if (ui.atStopStuck && Number.isFinite(Number(args?.maxStuckIterations))) ui.atStopStuck.value = String(Math.max(0, Math.floor(Number(args.maxStuckIterations))));

    const targets = args?.targets || {};
    const hard = args?.hardConstraints || {};
    const flTarget = Number(targets?.focalLength?.target ?? targets?.focalLength ?? args?.targetFocalLength);
    const tTarget = Number(targets?.tStop?.target ?? targets?.tStop ?? args?.targetTStop);
    const icTarget = Number(targets?.imageCircle?.target ?? targets?.imageCircle ?? args?.targetImageCircle);
    if (Number.isFinite(flTarget) && flTarget > 0) ui.atTargetFL.value = flTarget.toFixed(2);
    if (Number.isFinite(tTarget) && tTarget > 0) ui.atTargetT.value = tTarget.toFixed(2);
    if (Number.isFinite(icTarget) && icTarget > 0) ui.atTargetIC.value = icTarget.toFixed(1);

    if (ui.atGoalFL) ui.atGoalFL.checked = targets?.focalLength?.enabled !== false;
    if (ui.atGoalT) ui.atGoalT.checked = targets?.tStop?.enabled !== false;
    if (ui.atGoalIC) ui.atGoalIC.checked = targets?.imageCircle?.enabled !== false;
    const extraTargets = args?.extraTargets || args?.targets || {};
    if (ui.atGoalCenter && extraTargets?.centerSharpness) ui.atGoalCenter.checked = extraTargets.centerSharpness.enabled !== false;
    if (ui.atGoalCorner && extraTargets?.cornerSharpness) ui.atGoalCorner.checked = extraTargets.cornerSharpness.enabled !== false;
    if (ui.atGoalFieldCurv && extraTargets?.fieldCurvature) ui.atGoalFieldCurv.checked = !!extraTargets.fieldCurvature.enabled;
    if (ui.atGoalVig && extraTargets?.vignetting) ui.atGoalVig.checked = extraTargets.vignetting.enabled !== false;
    if (ui.atGoalRear && extraTargets?.rearClearance) ui.atGoalRear.checked = !!extraTargets.rearClearance.enabled;
    if (ui.atTargetRear && Number.isFinite(Number(extraTargets?.rearClearance?.target))) ui.atTargetRear.value = String(extraTargets.rearClearance.target);
    if (ui.atGoalCompact && extraTargets?.compactness) ui.atGoalCompact.checked = !!extraTargets.compactness.enabled;
    if (ui.atHardFL) ui.atHardFL.checked = hard?.focalLength?.enabled !== false;
    if (ui.atHardT) ui.atHardT.checked = hard?.tStop?.enabled !== false;
    if (ui.atHardIC) ui.atHardIC.checked = !!hard?.imageCircle?.enabled;
    if (ui.atTolFL && Number.isFinite(Number(hard?.focalLength?.tolerance))) ui.atTolFL.value = String(hard.focalLength.tolerance);
    if (ui.atTolT && Number.isFinite(Number(hard?.tStop?.tolerance))) ui.atTolT.value = String(hard.tStop.tolerance);
    if (ui.atMinIC && Number.isFinite(Number(hard?.imageCircle?.minimum))) ui.atMinIC.value = String(hard.imageCircle.minimum);

    const weights = args?.weights || {};
    if (ui.atWeightFL && Number.isFinite(Number(weights.focalLength))) ui.atWeightFL.value = String(weights.focalLength);
    if (ui.atWeightT && Number.isFinite(Number(weights.tStop))) ui.atWeightT.value = String(weights.tStop);
    if (ui.atWeightIC && Number.isFinite(Number(weights.imageCircle))) ui.atWeightIC.value = String(weights.imageCircle);
    if (ui.atWeightCenter && Number.isFinite(Number(weights.centerSharpness))) ui.atWeightCenter.value = String(weights.centerSharpness);
    if (ui.atWeightCorner && Number.isFinite(Number(weights.cornerSharpness))) ui.atWeightCorner.value = String(weights.cornerSharpness);
    if (ui.atWeightFieldCurv && Number.isFinite(Number(weights.fieldCurvature))) ui.atWeightFieldCurv.value = String(weights.fieldCurvature);
    if (ui.atWeightVig && Number.isFinite(Number(weights.vignetting))) ui.atWeightVig.value = String(weights.vignetting);
    if (ui.atWeightRear && Number.isFinite(Number(weights.rearClearance))) ui.atWeightRear.value = String(weights.rearClearance);
    if (ui.atWeightCompact && Number.isFinite(Number(weights.compactness))) ui.atWeightCompact.value = String(weights.compactness);

    const allowed = args?.allowedVariables || {};
    const hasAllowed = allowed && Object.keys(allowed).length > 0;
    if (hasAllowed) {
      setAutoTunerVar("atVarR", allowed.radii !== false);
      setAutoTunerVar("atVarAirT", allowed.airGaps !== false);
      setAutoTunerVar("atVarStopT", allowed.stopPosition !== false);
      setAutoTunerVar("atVarFrontGroup", !!allowed.frontGroupSpacing);
      setAutoTunerVar("atVarRearGroup", allowed.rearGroupSpacing !== false);
      setAutoTunerVar("atVarRearSpacing", allowed.rearElementSpacing !== false);
      setAutoTunerVar("atVarGlassT", !!allowed.glassThicknesses);
      setAutoTunerVar("atVarStopAp", !!allowed.stopAperture);
      setAutoTunerVar("atVarAp", !!allowed.clearApertures);
      setAutoTunerVar("atVarGlass", !!allowed.glassTypes);
      setAutoTunerVar("atVarFFR", !!allowed.fieldFlattenerRadii);
      setAutoTunerVar("atVarFFPos", !!allowed.fieldFlattenerPosition);
      setAutoTunerVar("atVarFFThick", !!allowed.fieldFlattenerThickness);
      setAutoTunerVar("atAllowSensorShift", !!allowed.sensorShift);
      setAutoTunerVar("atAllowIMSAp", !!allowed.imsAperture);
    }
    syncAutoTunerWeightOutputs();
  }

  function previewLensAiCandidate() {
    const candidate = getLensAiCandidateLens();
    if (!candidate || autoTunerState.running) return;
    const liveLens = clone(lens);
    const liveSelected = selectedIndex;
    try {
      lens = sanitizeLens(candidate);
      selectedIndex = Math.min(Math.max(0, liveSelected), lens.surfaces.length - 1);
      buildTable();
      applySensorToIMS();
      renderAll();
    } finally {
      lens = sanitizeLens(liveLens);
      selectedIndex = Math.min(Math.max(0, liveSelected), lens.surfaces.length - 1);
      buildTable();
      applySensorToIMS();
    }
    appendLensAiToolResult("Preview best", "Rendered the candidate in the ray pane without applying it permanently.");
    toast("Previewed AI candidate");
    return { previewed: true };
  }

  function applyLensAiCandidate(action) {
    const candidate = getLensAiCandidateLens();
    if (!candidate || autoTunerState.running) return;
    if (!requireLensAiApproval(action, "Apply the current best candidate to the lens?")) return;
    if (!lensAiState.originalLens) lensAiState.originalLens = clone(lens);
    loadLens(candidate);
    renderAll();
    if (preview.ready) scheduleRenderPreview({ force: true });
    updateLensAiLensSummary();
    return appendLensAiToolResult("Applied candidate", formatLensAiMetricsText(getLensAiMetrics({ includeFieldFocus: false })));
  }

  function revertLensAiOriginal() {
    const original = lensAiState.originalLens || autoTunerState.originalLens;
    if (!original || autoTunerState.running) return;
    loadLens(original);
    renderAll();
    if (preview.ready) scheduleRenderPreview({ force: true });
    updateLensAiLensSummary();
    return appendLensAiToolResult("Reverted", "Restored the AI Assistant original lens clone.");
  }

  async function copyLensAiBestJson() {
    const candidate = getLensAiCandidateLens();
    if (!candidate) return appendLensAiToolResult("Copy best JSON", "No best candidate available yet.");
    const out = clone(candidate);
    const iter = Number(autoTunerState.bestIteration);
    const score = Number(getLensAiCandidateMerit()?.totalScore);
    if (Number.isFinite(iter) && Number.isFinite(score)) {
      const note = `AI Lens Assistant best candidate found at iteration ${Math.max(0, Math.floor(iter))}, score ${scoreText(score, 5)}`;
      if (Array.isArray(out.notes)) {
        if (!out.notes.includes(note)) out.notes.push(note);
      } else if (out.notes == null || out.notes === "") {
        out.notes = [note];
      } else {
        out.notes = [String(out.notes), note];
      }
    }
    await copyTextToClipboard(JSON.stringify(out, null, 2));
    toast("Copied AI best JSON");
    return appendLensAiToolResult("Copy best JSON", "Copied the current AI best candidate JSON.");
  }

  function scaleLensAiToFocalLength(action) {
    const target = Number(action?.args?.targetFocalLength ?? action?.args?.target ?? action?.args?.focalLength);
    if (!Number.isFinite(target) || target <= 0) {
      appendLensAiToolResult("Scale blocked", "Missing positive target focal length.");
      return;
    }
    const wavePreset = ui.wavePreset?.value || "d";
    const cur = estimateEflBflParaxial(lens.surfaces, wavePreset).efl;
    if (!Number.isFinite(cur) || cur <= 0) {
      appendLensAiToolResult("Scale blocked", "Current EFL is not solvable.");
      return;
    }
    if (!lensAiState.originalLens) lensAiState.originalLens = clone(lens);
    const k = target / cur;
    const allowClearApertures = !!action?.args?.allowClearApertures;
    for (const s of lens.surfaces || []) {
      const type = String(s?.type || "").toUpperCase();
      if (type !== "OBJ" && type !== "IMS") s.t = Number(s.t || 0) * k;
      if (Math.abs(Number(s.R || 0)) > 1e-9) s.R = Number(s.R) * k;
      if (allowClearApertures) {
        const ap = Number(s.ap);
        if (Number.isFinite(ap) && type !== "OBJ" && type !== "IMS") s.ap = Math.max(AP_MIN, ap * k);
        const apOpt = Number(s.ap_optical);
        if (Number.isFinite(apOpt) && type !== "OBJ" && type !== "IMS") s.ap_optical = Math.max(AP_MIN, apOpt * k);
      }
    }
    computeVertices(lens.surfaces, 0, 0);
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();
    updateLensAiLensSummary();
    return appendLensAiToolResult("Scaled focal length", `Scaled EFL ${cur.toFixed(2)}mm -> ${target.toFixed(2)}mm with k=${k.toFixed(4)}. Clear apertures ${allowClearApertures ? "scaled" : "preserved"}.`);
  }

  function wireLensAiUI() {
    if (!ui.aiAssistantModal) return;
    on("#btnAiAssistant", "click", openLensAiAssistant);
    if (ui.aiClose) ui.aiClose.addEventListener("click", closeLensAiAssistant);
    if (ui.aiChatForm) {
      ui.aiChatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        submitLensAiMessage();
      });
    }
    if (ui.aiChatInput) {
      ui.aiChatInput.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          submitLensAiMessage();
        }
      });
    }
    if (ui.aiPreviewCandidate) ui.aiPreviewCandidate.addEventListener("click", () => previewLensAiCandidate());
    if (ui.aiApplyCandidate) ui.aiApplyCandidate.addEventListener("click", () => applyLensAiCandidate({ type: "apply_candidate", label: "Apply candidate", requiresApproval: true }));
    if (ui.aiCopyBestJson) ui.aiCopyBestJson.addEventListener("click", () => copyLensAiBestJson());
    if (ui.aiRevertCandidate) ui.aiRevertCandidate.addEventListener("click", revertLensAiOriginal);
    if (ui.aiBuildReference) ui.aiBuildReference.addEventListener("click", () => buildReferenceLensFromPrompt(getLensAiReferencePrompt()));
    if (ui.aiAddReferenceLens) ui.aiAddReferenceLens.addEventListener("click", () => addReferenceLensToBuilder());
    if (ui.aiIterateReference) ui.aiIterateReference.addEventListener("click", () => iterateReferenceLens());
    if (ui.aiBudgetMode) ui.aiBudgetMode.addEventListener("change", () => updateLensAiBudgetUi());
    if (ui.aiExpertAnalysis) ui.aiExpertAnalysis.addEventListener("click", requestLensAiExpertAnalysis);
    if (ui.aiRunAutonomous) {
      ui.aiRunAutonomous.addEventListener("click", () => {
        const goal = String(ui.aiChatInput?.value || lensAiState.autonomous.goal || "").trim();
        if (goal) appendLensAiMessage("user", goal);
        startLensAiAutonomous(goal || "Improve this lens safely within the current constraints.");
      });
    }
    if (ui.aiStopAutonomous) ui.aiStopAutonomous.addEventListener("click", () => stopLensAiAutonomous());
    ui.aiAssistantModal.addEventListener("mousedown", (e) => {
      if (e.target === ui.aiAssistantModal) closeLensAiAssistant();
    });
    updateLensAiLensSummary();
    updateLensAiCandidateSummary();
  }

  // -------------------- New Lens modal --------------------
  function openNewLensModal() {
    if (!ui.newLensModal) return;
    ui.newLensModal.classList.remove("hidden");
  }
  function closeNewLensModal() {
    if (!ui.newLensModal) return;
    ui.newLensModal.classList.add("hidden");
  }

  function makeTemplate(templateName) {
    const t = String(templateName || "blank");
    if (t === "doubleGauss" || t === "omit50v1") return omit50ConceptV1();
    if (t === "tessar") {
      return sanitizeLens({
        name: "Tessar-ish (simple)",
        surfaces: [
          { type: "OBJ", R: 0, t: 0, ap: 60, glass: "AIR", stop: false },
          { type: "1", R: 70, t: 4.5, ap: 18, glass: "BK7", stop: false },
          { type: "2", R: -35, t: 1.2, ap: 18, glass: "AIR", stop: false },
          { type: "STOP", R: 0, t: 6.0, ap: 8, glass: "AIR", stop: true },
          { type: "4", R: -50, t: 3.8, ap: 16, glass: "F2", stop: false },
          { type: "5", R: 120, t: 18, ap: 16, glass: "AIR", stop: false },
          { type: "IMS", R: 0, t: 0, ap: 12.77, glass: "AIR", stop: false },
        ],
      });
    }
    return sanitizeLens({
      name: "Blank",
      surfaces: [
        { type: "OBJ", R: 0.0, t: 0.0, ap: 60.0, glass: "AIR", stop: false },
        { type: "STOP", R: 0.0, t: 20.0, ap: 8.0, glass: "AIR", stop: true },
        { type: "IMS", R: 0.0, t: 0.0, ap: 12.77, glass: "AIR", stop: false },
      ],
    });
  }

  function createNewLensFromModal() {
    const template = ui.nlTemplate?.value || "blank";
    const targetF = num(ui.nlFocal?.value, 50);
    const targetT = num(ui.nlT?.value, 2.8);
    const stopPos = ui.nlStopPos?.value || "keep";
    const name = (ui.nlName?.value || "New lens").trim();

    let L = sanitizeLens(makeTemplate(template));
    L.name = name || L.name;

    if (stopPos === "middle") {
      const stopIdx = findStopSurfaceIndex(L.surfaces);
      if (stopIdx >= 0) L.surfaces[stopIdx].stop = false;
      const mid = Math.max(1, Math.min(L.surfaces.length - 2, Math.floor(L.surfaces.length / 2)));
      L.surfaces[mid].stop = true;
      L.surfaces[mid].type = "STOP";
      const f = findStopSurfaceIndex(L.surfaces);
      L.surfaces.forEach((s, i) => { if (i !== f) s.stop = false; });
    }

    loadLens(L);

    {
      const wavePreset = ui.wavePreset?.value || "d";
      const cur = estimateEflBflParaxial(lens.surfaces, wavePreset).efl;
      if (Number.isFinite(cur) && cur > 0 && Number.isFinite(targetF) && targetF > 0) {
        const k = targetF / cur;
        for (let i = 0; i < lens.surfaces.length; i++) {
          scaleSurfaceDimensions(lens.surfaces[i], k);
        }
      }
    }

    {
      const wavePreset = ui.wavePreset?.value || "d";
      const { efl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
      const stopIdx = findStopSurfaceIndex(lens.surfaces);
      if (stopIdx >= 0 && Number.isFinite(efl) && efl > 0 && Number.isFinite(targetT) && targetT > 0) {
        const newAp = efl / (2 * targetT);
        const stopAp = Math.max(AP_MIN, Math.min(newAp, maxApForSurface(lens.surfaces[stopIdx])));
        lens.surfaces[stopIdx].ap = stopAp;
        lens.surfaces[stopIdx].ap_optical = stopAp;
      }
    }

    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    scheduleRenderPreview();
    closeNewLensModal();
  }

  // -------------------- fullscreen helpers --------------------
  async function togglePaneFullscreen(pane) {
    if (!pane) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await pane.requestFullscreen();
    } catch (e) {
      if (ui.footerWarn) ui.footerWarn.textContent = `Fullscreen failed: ${e?.message || e}`;
    }
  }

  async function togglePreviewFullscreen() {
    await togglePaneFullscreen(ui.previewPane);
    setTimeout(() => {
      resizePreviewCanvasToCSS();
      if (preview.ready) scheduleRenderPreview();
    }, 50);
  }

  async function toggleRaysFullscreen() {
    await togglePaneFullscreen(ui.raysPane);
    setTimeout(() => {
      resizeCanvasToCSS();
      redrawRayPaneOnly();
    }, 50);
  }

  function isZmxPasteModalOpen() {
    return !!(ui.zmxPasteModal && !ui.zmxPasteModal.classList.contains("hidden"));
  }

  function openZmxPasteModal() {
    if (!ui.zmxPasteModal) return;
    ui.zmxPasteModal.classList.remove("hidden");
    ui.zmxPasteModal.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      if (ui.zmxPasteText) ui.zmxPasteText.focus({ preventScroll: true });
    }, 0);
  }

  function closeZmxPasteModal() {
    if (!ui.zmxPasteModal) return;
    ui.zmxPasteModal.classList.add("hidden");
    ui.zmxPasteModal.setAttribute("aria-hidden", "true");
  }

  function clearZmxPasteText() {
    if (!ui.zmxPasteText) return;
    ui.zmxPasteText.value = "";
    ui.zmxPasteText.focus({ preventScroll: true });
  }

  async function importFromZmxPasteModal() {
    const raw = String(ui.zmxPasteText?.value || "");
    if (!raw.trim()) {
      const msg = "Paste Zemax text first.";
      if (ui.footerWarn) ui.footerWarn.textContent = msg;
      toast(msg);
      return false;
    }

    if (!/(^|\n)\s*SURF\s+-?\d+/im.test(raw)) {
      const msg = "This does not look like a Zemax sequential file.";
      if (ui.footerWarn) ui.footerWarn.textContent = msg;
      toast(msg);
      return false;
    }

    try {
      importZemaxText(raw, "pasted_zmx", { importSource: "zmx_text" });
      closeZmxPasteModal();
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      if (ui.footerWarn) ui.footerWarn.textContent = `ZMX paste import failed: ${msg}`;
      toast(`ZMX import failed: ${msg}`);
      return false;
    }
  }

  function isJsonPasteModalOpen() {
    return !!(ui.jsonPasteModal && !ui.jsonPasteModal.classList.contains("hidden"));
  }

  function openJsonPasteModal() {
    if (!ui.jsonPasteModal) return;
    ui.jsonPasteModal.classList.remove("hidden");
    ui.jsonPasteModal.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      if (ui.jsonPasteText) ui.jsonPasteText.focus({ preventScroll: true });
    }, 0);
  }

  function closeJsonPasteModal() {
    if (!ui.jsonPasteModal) return;
    ui.jsonPasteModal.classList.add("hidden");
    ui.jsonPasteModal.setAttribute("aria-hidden", "true");
  }

  function clearJsonPasteText() {
    if (!ui.jsonPasteText) return;
    ui.jsonPasteText.value = "";
    ui.jsonPasteText.focus({ preventScroll: true });
  }

  function importLensJsonText(rawText, sourceName = "pasted_json") {
    const text = String(rawText ?? "").trim();
    if (!text) throw new Error("Paste lens JSON first.");

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON (${e?.message || e})`);
    }

    const obj = parsed?.lens ?? parsed;
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.surfaces) || !obj.surfaces.length) {
      throw new Error("JSON must contain a lens object with a non-empty surfaces array.");
    }

    loadLens(obj);
    toast(`Loaded lens JSON${sourceName ? `: ${sourceName}` : ""}`);
    return obj;
  }

  async function importFromJsonPasteModal() {
    const raw = String(ui.jsonPasteText?.value || "");
    try {
      importLensJsonText(raw, "pasted JSON");
      closeJsonPasteModal();
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      if (ui.footerWarn) ui.footerWarn.textContent = `JSON paste import failed: ${msg}`;
      toast(`JSON import failed: ${msg}`);
      return false;
    }
  }

  // -------------------- preview source + image load --------------------
  function syncPreviewFitUI() {
    if (!ui.prevObjH || !ui.prevObjW || !ui.previewAutoFit) return;
    const autoFit = !!ui.previewAutoFit.checked;
    ui.prevObjH.disabled = false;
    ui.prevObjW.disabled = false;
    ui.prevObjH.readOnly = autoFit;
    ui.prevObjW.readOnly = autoFit;
    ui.prevObjH.title = autoFit
      ? "Auto-filled from current distance/focus/framing"
      : "Manual object height in mm";
    ui.prevObjW.title = autoFit
      ? "Auto-filled from current distance/focus/framing"
      : "Manual object width in mm";
  }

  function setAutoObjectSizeMm(nextWidthMm, nextHeightMm) {
    const w = Number(nextWidthMm);
    const h = Number(nextHeightMm);
    if (ui.prevObjW && Number.isFinite(w) && w > 1e-6) {
      const prevW = Number(ui.prevObjW.value);
      if (!Number.isFinite(prevW) || Math.abs(prevW - w) >= 0.05) {
        ui.prevObjW.value = w.toFixed(2);
      }
    }
    if (ui.prevObjH && Number.isFinite(h) && h > 1e-6) {
      const prevH = Number(ui.prevObjH.value);
      if (!Number.isFinite(prevH) || Math.abs(prevH - h) >= 0.05) {
        ui.prevObjH.value = h.toFixed(2);
      }
    }
  }

  function getPreviewSourceUrl(modeRaw) {
    const mode = String(modeRaw || "").toLowerCase() === "custom" ? "custom" : "chart";
    return preview.sourceUrls[mode] || null;
  }

  async function setPreviewSourceMode(modeRaw) {
    const mode = String(modeRaw || "").toLowerCase() === "custom" ? "custom" : "chart";
    const url = getPreviewSourceUrl(mode);
    if (!url) {
      if (mode === "custom") {
        preview.sourceMode = "chart";
        if (ui.previewSourceMode) ui.previewSourceMode.value = "chart";
        toast("Load eerst een custom image.");
      }
      return false;
    }

    preview.sourceMode = mode;
    if (ui.previewSourceMode) ui.previewSourceMode.value = mode;
    await loadPreviewImageFromURL(url, { announce: false });
    return true;
  }

  function loadPreviewImageFromURL(url, opts = {}) {
    return new Promise((resolve, reject) => {
      const sourceUrl = String(url || "").trim();
      if (!sourceUrl) {
        reject(new Error("Empty preview URL"));
        return;
      }
      const announce = opts.announce !== false;
      const noCacheBust =
        opts.noCacheBust === true ||
        /^data:/i.test(sourceUrl) ||
        /^blob:/i.test(sourceUrl);
      const imgSrc = noCacheBust
        ? sourceUrl
        : sourceUrl + (sourceUrl.includes("?") ? "&" : "?") + "t=" + Date.now();

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        preview.img = img;

        preview.imgCanvas.width = img.naturalWidth || img.width;
        preview.imgCanvas.height = img.naturalHeight || img.height;
        preview.imgCtx.setTransform(1, 0, 0, 1, 0, 0);
        preview.imgCtx.imageSmoothingEnabled = true;
        preview.imgCtx.imageSmoothingQuality = "high";
        preview.imgCtx.clearRect(0, 0, preview.imgCanvas.width, preview.imgCanvas.height);
        preview.imgCtx.drawImage(img, 0, 0);

        const id = preview.imgCtx.getImageData(0, 0, preview.imgCanvas.width, preview.imgCanvas.height);
        preview.imgData = id.data;
        preview.ready = true;
        preview.worldReady = false;
        preview.dirtyKey = "";

        if (announce && ui.footerWarn) {
          ui.footerWarn.textContent =
            `Preview image loaded: ${preview.imgCanvas.width}×${preview.imgCanvas.height} (${preview.sourceMode})`;
        }
        scheduleRenderPreview();
        resolve(true);
      };
      img.onerror = (e) => {
        if (ui.footerWarn) ui.footerWarn.textContent = `Preview image load failed: ${sourceUrl}`;
        reject(e);
      };
      img.src = imgSrc;
    });
  }

  function loadPreviewImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        preview.sourceUrls.custom = url;
        setPreviewSourceMode("custom").then(resolve).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // -------------------- load lens JSON --------------------
  function parseZemaxFirstNumber(s) {
    const m = String(s ?? "").replace(/,/g, ".").match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function parseZemaxNumberList(s) {
    const m = String(s ?? "").replace(/,/g, ".").match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
    if (!m) return [];
    return m
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
  }

  function unitTokenToMmScale(token) {
    const u = String(token ?? "").trim().toUpperCase();
    if (u === "MM" || u === "MILLIMETER" || u === "MILLIMETERS") return 1;
    if (u === "CM" || u === "CENTIMETER" || u === "CENTIMETERS") return 10;
    if (u === "M" || u === "METER" || u === "METERS") return 1000;
    if (u === "IN" || u === "INCH" || u === "INCHES") return 25.4;
    return 1;
  }

  function stripOptionalQuotes(s) {
    const raw = String(s ?? "").trim();
    if (!raw) return "";
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1).trim();
    }
    return raw;
  }

  function sourceNameToLensName(sourceName = "Zemax import") {
    return String(sourceName || "Zemax import").replace(/\.(zmx|seq|txt)$/i, "");
  }

  function isLikelyZemaxSequentialText(txt) {
    if (!txt) return false;
    const s = String(txt);
    const hasSurf = /(^|\n)\s*SURF\s+-?\d+/im.test(s);
    const hasModeSeq = /(^|\n)\s*MODE\s+SEQ\b/im.test(s);
    const hasCurv = /(^|\n)\s*CURV\s+/im.test(s);
    return hasSurf && (hasModeSeq || hasCurv);
  }

  function parseZemaxGlassLine(line) {
    const parts = String(line || "").trim().split(/\s+/).filter(Boolean);
    const glass = parts[1] ? String(parts[1]).trim() : "AIR";
    const glassUp = glass.toUpperCase();

    if (glassUp === "___BLANK") {
      const ndFixed = parseZemaxFirstNumber(parts[4]);
      const vdFixed = parseZemaxFirstNumber(parts[5]);
      let nd = (Number.isFinite(ndFixed) && ndFixed > 1) ? ndFixed : NaN;
      let vd = (Number.isFinite(vdFixed) && vdFixed > 0) ? vdFixed : NaN;

      // Fallback for variant formatting; still prefer the explicit slots above.
      if (!Number.isFinite(nd) || !Number.isFinite(vd)) {
        const nums = parts
          .slice(2)
          .map((p) => parseZemaxFirstNumber(p))
          .filter((n) => Number.isFinite(n));
        for (let i = 0; i < nums.length; i++) {
          const n = nums[i];
          if (n > 1.2 && n < 3.0) {
            nd = n;
            for (let j = i + 1; j < nums.length; j++) {
              if (nums[j] > 1) { vd = nums[j]; break; }
            }
            break;
          }
        }
      }

      return {
        glass,
        nd: Number.isFinite(nd) ? nd : null,
        vd: Number.isFinite(vd) ? vd : null,
      };
    }

    const nums = parts
      .slice(2)
      .map((p) => parseZemaxFirstNumber(p))
      .filter((n) => Number.isFinite(n));

    let nd = NaN;
    let ndIdx = -1;
    for (let i = 0; i < nums.length; i++) {
      const n = nums[i];
      if (n > 1.2 && n < 3.0) {
        nd = n;
        ndIdx = i;
        break;
      }
    }

    let vd = NaN;
    if (ndIdx >= 0) {
      for (let i = ndIdx + 1; i < nums.length; i++) {
        const v = nums[i];
        if (v > 1) {
          vd = v;
          break;
        }
      }
    }

    if (!Number.isFinite(nd) && nums.length >= 2) {
      const ndTail = nums[nums.length - 2];
      const vdTail = nums[nums.length - 1];
      if (ndTail > 1.2 && ndTail < 3.0 && vdTail > 1) {
        nd = ndTail;
        vd = vdTail;
      }
    }

    if (Number.isFinite(nd) && !Number.isFinite(vd)) vd = 999;

    return {
      glass,
      nd: Number.isFinite(nd) ? nd : null,
      vd: Number.isFinite(vd) ? vd : null,
    };
  }

  function extractLikelyZemaxLinesFromText(txt) {
    const all = String(txt || "").replace(/\r/g, "").split("\n");
    if (!all.length) return [];
    const idxVers = all.findIndex((ln) => /^\s*VERS\b/i.test(ln));
    const idxModeSeq = all.findIndex((ln) => /^\s*MODE\s+SEQ\b/i.test(ln));
    const idxModeAny = all.findIndex((ln) => /^\s*MODE\b/i.test(ln));
    const idxSurf = all.findIndex((ln) => /^\s*SURF\s+-?\d+/i.test(ln));
    let start = -1;

    const preferred = [idxVers, idxModeSeq].filter((n) => n >= 0);
    if (preferred.length) {
      start = Math.min(...preferred);
    } else if (idxModeAny >= 0) {
      start = idxModeAny;
    } else if (idxSurf >= 0) {
      start = idxSurf;
    }

    if (start < 0) return all;
    return all.slice(start);
  }

  function parseZemaxMultiConfigLines(lines, unitScaleDefault = 1) {
    const out = {
      count: 1,
      configsByIndex: new Map(),
    };
    if (!Array.isArray(lines) || !lines.length) return out;

    let unitScaleToMm = Number.isFinite(Number(unitScaleDefault)) ? Number(unitScaleDefault) : 1;
    const ensureConfig = (cfgIndex) => {
      const idx = Number.isFinite(Number(cfgIndex)) ? Math.max(1, Math.trunc(Number(cfgIndex))) : 1;
      if (!out.configsByIndex.has(idx)) {
        out.configsByIndex.set(idx, {
          index: idx,
          label: null,
          aperture: null,
          thicknessOverrides: {},
          fieldOverrides: { vdx: {}, vdy: {}, vcx: {}, vcy: {} },
        });
      }
      return out.configsByIndex.get(idx);
    };

    for (const raw of lines) {
      const line = String(raw || "").trim();
      if (!line) continue;

      const mUnit = line.match(/^UNIT\s+([A-Za-z]+)/i);
      if (mUnit) {
        unitScaleToMm = unitTokenToMmScale(mUnit[1]);
        continue;
      }

      const mNum = line.match(/^MNUM\s+(\d+)/i);
      if (mNum) {
        out.count = Math.max(out.count, Math.max(1, Math.trunc(Number(mNum[1]))));
        continue;
      }

      const mOffQuoted = line.match(/^MOFF\s+0\s+(\d+)\s+"([^"]*)"/i);
      if (mOffQuoted) {
        const cfg = ensureConfig(Number(mOffQuoted[1]));
        const label = String(mOffQuoted[2] || "").trim();
        if (label) cfg.label = label;
        continue;
      }
      const mOffBare = line.match(/^MOFF\s+0\s+(\d+)\s+(.+)$/i);
      if (mOffBare) {
        const cfg = ensureConfig(Number(mOffBare[1]));
        const label = stripOptionalQuotes(String(mOffBare[2] || "")).trim();
        if (label) cfg.label = label;
        continue;
      }

      const mAper = line.match(/^APER\s+0\s+(\d+)\s+([-+0-9.Ee]+)/i);
      if (mAper) {
        const cfg = ensureConfig(Number(mAper[1]));
        const val = Number(mAper[2]);
        if (Number.isFinite(val)) cfg.aperture = val;
        continue;
      }

      const mThic = line.match(/^THIC\s+(\d+)\s+(\d+)\s+([-+0-9.Ee]+)/i);
      if (mThic) {
        const surfNo = Math.max(0, Math.trunc(Number(mThic[1])));
        const cfg = ensureConfig(Number(mThic[2]));
        const val = Number(mThic[3]);
        if (Number.isFinite(val)) cfg.thicknessOverrides[String(surfNo)] = val * unitScaleToMm;
        continue;
      }

      const mFv = line.match(/^FV(DX|DY|CX|CY)\s+(\d+)\s+(\d+)\s+([-+0-9.Ee]+)/i);
      if (mFv) {
        const axis = String(mFv[1] || "").toLowerCase();
        const fieldIndex = Math.max(0, Math.trunc(Number(mFv[2])));
        const cfg = ensureConfig(Number(mFv[3]));
        const val = Number(mFv[4]);
        if (!Number.isFinite(val)) continue;
        const key = `v${axis}`;
        if (!cfg.fieldOverrides[key]) cfg.fieldOverrides[key] = {};
        cfg.fieldOverrides[key][String(fieldIndex)] = val;
      }
    }

    for (let i = 1; i <= out.count; i++) ensureConfig(i);
    return out;
  }

  function buildZoomConfigsFromMeta(multiConfig, surfaces) {
    if (!multiConfig || typeof multiConfig !== "object") return [];
    const map = multiConfig.configsByIndex instanceof Map ? multiConfig.configsByIndex : new Map();
    if (!map.size && !(Number(multiConfig.count) > 1)) return [];

    const knownSurfNos = new Set(
      (Array.isArray(surfaces) ? surfaces : [])
        .map((s) => Number(s?.zmx?.surf))
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.max(0, Math.trunc(n)))
    );

    const count = Math.max(1, Number.isFinite(Number(multiConfig.count)) ? Math.trunc(Number(multiConfig.count)) : 1);
    for (let i = 1; i <= count; i++) {
      if (!map.has(i)) {
        map.set(i, {
          index: i,
          label: null,
          aperture: null,
          thicknessOverrides: {},
          fieldOverrides: { vdx: {}, vdy: {}, vcx: {}, vcy: {} },
        });
      }
    }

    const list = Array.from(map.values())
      .map((cfg, arrIdx) => {
        const index = Math.max(1, Math.trunc(Number(cfg?.index || (arrIdx + 1))));
        const label = (cfg?.label != null && String(cfg.label).trim() !== "")
          ? String(cfg.label).trim()
          : null;
        const aperture = Number.isFinite(Number(cfg?.aperture)) ? Number(cfg.aperture) : null;

        const thicknessOverrides = {};
        for (const [k, v] of Object.entries(cfg?.thicknessOverrides || {})) {
          const surfNo = Math.max(0, Math.trunc(Number(k)));
          const val = Number(v);
          if (!Number.isFinite(surfNo) || !Number.isFinite(val)) continue;
          // Keep known surface overrides, but also keep unknown keys for diagnostics and round-trip.
          if (knownSurfNos.size > 0 && !knownSurfNos.has(surfNo)) {
            thicknessOverrides[String(surfNo)] = val;
            continue;
          }
          thicknessOverrides[String(surfNo)] = val;
        }

        const fieldOverrides = {
          vdx: sanitizeZoomFieldOverrideMap(cfg?.fieldOverrides?.vdx),
          vdy: sanitizeZoomFieldOverrideMap(cfg?.fieldOverrides?.vdy),
          vcx: sanitizeZoomFieldOverrideMap(cfg?.fieldOverrides?.vcx),
          vcy: sanitizeZoomFieldOverrideMap(cfg?.fieldOverrides?.vcy),
        };

        const overrideSurfaceNumbers = Object.keys(thicknessOverrides)
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);

        return {
          index,
          label,
          aperture,
          thicknessOverrides,
          fieldOverrides,
          overrideSurfaceNumbers,
        };
      })
      .sort((a, b) => a.index - b.index);

    const hasThic = list.some((cfg) => Object.keys(cfg.thicknessOverrides || {}).length > 0);
    if (!hasThic && list.length <= 1) return [];
    return list;
  }

  function parseZemaxSequentialText(txt, sourceName = "Zemax file") {
    const lines = extractLikelyZemaxLinesFromText(txt);
    if (!lines.length) throw new Error("Empty file");

    let unitScaleToMm = 1;
    const parsed = [];
    let cur = null;

    const zemaxMeta = {
      source: "zemax",
      name: null,
      version: null,
      mode: null,
      fieldType: "angle_deg",
      wavelengthsByIndex: new Map(),
      primaryWavelengthIndex: null,
      fieldsRaw: {
        yfln: [],
        fwgn: [],
        vdx: [],
        vdy: [],
        vcx: [],
        vcy: [],
      },
      multiConfig: parseZemaxMultiConfigLines(lines, unitScaleToMm),
    };

    const pushCur = () => {
      if (!cur) return;
      parsed.push(cur);
      cur = null;
    };

    for (const raw of lines) {
      const line = String(raw || "").trim();
      if (!line) continue;
      if (line.startsWith("!") || line.startsWith("#") || line.startsWith("//")) continue;

      const up = line.toUpperCase();

      if (/^VERS\b/i.test(line)) {
        zemaxMeta.version = stripOptionalQuotes(line.replace(/^VERS\b/i, ""));
        continue;
      }
      if (/^MODE\b/i.test(line)) {
        zemaxMeta.mode = stripOptionalQuotes(line.replace(/^MODE\b/i, "")).toUpperCase();
        continue;
      }
      if (/^NAME\b/i.test(line)) {
        const nm = stripOptionalQuotes(line.replace(/^NAME\b/i, ""));
        if (nm) zemaxMeta.name = nm;
        continue;
      }
      if (/^PWAV\b/i.test(line)) {
        const nums = parseZemaxNumberList(line.replace(/^PWAV\b/i, ""));
        if (nums.length) zemaxMeta.primaryWavelengthIndex = Math.max(1, Math.round(nums[0]));
        continue;
      }
      if (/^WAVM\b/i.test(line)) {
        const nums = parseZemaxNumberList(line.replace(/^WAVM\b/i, ""));
        if (nums.length) {
          let idx = 0;
          // Zemax WAVM format is typically: WAVM <idx> <lambda_um> <weight>
          // Use the wavelength slot (2nd numeric token), not the weight token.
          let lam = (nums.length >= 2) ? nums[1] : nums[nums.length - 1];
          if (nums.length >= 2) idx = Math.round(nums[0]);
          if (!Number.isFinite(idx) || idx <= 0) idx = zemaxMeta.wavelengthsByIndex.size + 1;
          if (Number.isFinite(lam) && lam > 0) {
            const lamNm = lam < 10 ? lam * 1000 : lam;
            zemaxMeta.wavelengthsByIndex.set(idx, lamNm);
          }
        }
        continue;
      }
      if (/^FTYP\b/i.test(line)) {
        const nums = parseZemaxNumberList(line.replace(/^FTYP\b/i, ""));
        const ftyp = nums.length ? Math.round(nums[0]) : 0;
        // 0 in Zemax is angular fields; keep default as angle_deg.
        if (ftyp === 0) zemaxMeta.fieldType = "angle_deg";
        else if (ftyp === 1) zemaxMeta.fieldType = "image_height";
        continue;
      }
      if (/^YFLN\b/i.test(line)) {
        zemaxMeta.fieldsRaw.yfln = parseZemaxNumberList(line.replace(/^YFLN\b/i, ""));
        continue;
      }
      if (/^FWGN\b/i.test(line)) {
        zemaxMeta.fieldsRaw.fwgn = parseZemaxNumberList(line.replace(/^FWGN\b/i, ""));
        continue;
      }
      if (/^VDXN?\b/i.test(line)) {
        zemaxMeta.fieldsRaw.vdx = parseZemaxNumberList(line.replace(/^VDXN?\b/i, ""));
        continue;
      }
      if (/^VDYN?\b/i.test(line)) {
        zemaxMeta.fieldsRaw.vdy = parseZemaxNumberList(line.replace(/^VDYN?\b/i, ""));
        continue;
      }
      if (/^VCXN?\b/i.test(line)) {
        zemaxMeta.fieldsRaw.vcx = parseZemaxNumberList(line.replace(/^VCXN?\b/i, ""));
        continue;
      }
      if (/^VCYN?\b/i.test(line)) {
        zemaxMeta.fieldsRaw.vcy = parseZemaxNumberList(line.replace(/^VCYN?\b/i, ""));
        continue;
      }

      if (up.startsWith("UNIT")) {
        const parts = up.split(/\s+/);
        unitScaleToMm = unitTokenToMmScale(parts[1] || "MM");
        continue;
      }

      const mSurf = up.match(/^SURF\s+(-?\d+)/);
      if (mSurf) {
        pushCur();
        cur = {
          idx: Number(mSurf[1]),
          CURV: 0,
          DISZ: 0,
          DIAM: NaN,
          GLAS: "AIR",
          ORIGINAL_GLASS: "AIR",
          nd: null,
          vd: null,
          GLAS_ND: null,
          GLAS_VD: null,
          STOP: false,
        };
        continue;
      }

      if (!cur) continue;

      if (up.startsWith("CURV")) {
        const v = parseZemaxFirstNumber(line.slice(4));
        if (Number.isFinite(v)) cur.CURV = v;
        continue;
      }

      if (up.startsWith("DISZ")) {
        const v = parseZemaxFirstNumber(line.slice(4));
        if (Number.isFinite(v)) cur.DISZ = v;
        continue;
      }

      if (up.startsWith("DIAM")) {
        const v = parseZemaxFirstNumber(line.slice(4));
        if (Number.isFinite(v)) cur.DIAM = Math.abs(v);
        continue;
      }

      if (up.startsWith("GLAS")) {
        const parsedGlass = parseZemaxGlassLine(line);
        const glassName = String(parsedGlass.glass || "AIR").trim();
        const isBlank = glassName.toUpperCase() === "___BLANK";
        cur.ORIGINAL_GLASS = glassName || "AIR";
        cur.GLAS = isBlank ? "CUSTOM" : glassName;
        cur.nd = parsedGlass.nd;
        cur.vd = parsedGlass.vd;
        cur.GLAS_ND = parsedGlass.nd;
        cur.GLAS_VD = parsedGlass.vd;
        continue;
      }

      if (/^STOP\b/i.test(line)) {
        cur.STOP = true;
        continue;
      }
    }

    pushCur();
    if (!parsed.length) throw new Error("No SURF blocks found");

    parsed.sort((a, b) => a.idx - b.idx);
    const surfaces = parsed.map((s, i) => {
      const isFirst = i === 0;
      const isLast = i === parsed.length - 1;
      const curv = Number(s.CURV || 0);
      const R = Math.abs(curv) < 1e-12 ? 0 : (1 / curv) * unitScaleToMm;
      const t = Number.isFinite(Number(s.DISZ)) ? Number(s.DISZ) * unitScaleToMm : 0;
      const apSemi = Number.isFinite(Number(s.DIAM)) ? Math.max(0.01, Number(s.DIAM) * unitScaleToMm) : 10;

      const g = String(s.GLAS || "AIR").trim();
      const glass = (!g || g === "-" || /^MIRROR$/i.test(g)) ? "AIR" : g;
      const originalGlass = String(s.ORIGINAL_GLASS || g || "AIR").trim();
      const glassNd = (Number.isFinite(Number(s.nd ?? s.GLAS_ND)) && Number(s.nd ?? s.GLAS_ND) > 1)
        ? Number(s.nd ?? s.GLAS_ND)
        : null;
      const glassVd = (glassNd != null)
        ? ((Number.isFinite(Number(s.vd ?? s.GLAS_VD)) && Number(s.vd ?? s.GLAS_VD) > 0) ? Number(s.vd ?? s.GLAS_VD) : 999)
        : null;

      return {
        type: isFirst ? "OBJ" : (isLast ? "IMS" : String(i)),
        R,
        t,
        ap: apSemi,
        ap_optical: apSemi,
        ap_mech: null,
        draw_mode: "optical",
        shoulder_mode: "none",
        shoulder_depth: 0,
        bevel: 0,
        edge_thickness_mode: "auto",
        glass,
        originalGlass,
        nd: glassNd,
        vd: glassVd,
        glass_nd: glassNd,
        glass_vd: glassVd,
        stop: isLast ? false : !!s.STOP,
        zmx: {
          surf: s.idx,
          curv: curv,
          baseCurv: curv,
          disz: t,
          disz_raw: Number(s.DISZ),
          baseDisz: t,
          diam: Number(s.DIAM),
          glass_name: originalGlass,
          nd: glassNd,
          vd: glassVd,
          glass_nd: glassNd,
          glass_vd: glassVd,
        },
      };
    });
    if (!surfaces.length) throw new Error("No valid surfaces after parse");

    const sortedWaveIdx = Array.from(zemaxMeta.wavelengthsByIndex.keys()).sort((a, b) => a - b);
    const wavelengthsNm = sortedWaveIdx
      .map((idx) => Number(zemaxMeta.wavelengthsByIndex.get(idx)))
      .filter((v) => Number.isFinite(v) && v > 0);

    const primaryWavelengthIndex = Number.isFinite(Number(zemaxMeta.primaryWavelengthIndex))
      ? Math.max(1, Math.round(Number(zemaxMeta.primaryWavelengthIndex)))
      : null;
    const primaryWavelengthNm = (primaryWavelengthIndex != null && zemaxMeta.wavelengthsByIndex.has(primaryWavelengthIndex))
      ? Number(zemaxMeta.wavelengthsByIndex.get(primaryWavelengthIndex))
      : null;

    const yfln = Array.isArray(zemaxMeta.fieldsRaw.yfln) ? zemaxMeta.fieldsRaw.yfln : [];
    const fwgn = Array.isArray(zemaxMeta.fieldsRaw.fwgn) ? zemaxMeta.fieldsRaw.fwgn : [];
    const vdx = Array.isArray(zemaxMeta.fieldsRaw.vdx) ? zemaxMeta.fieldsRaw.vdx : [];
    const vdy = Array.isArray(zemaxMeta.fieldsRaw.vdy) ? zemaxMeta.fieldsRaw.vdy : [];
    const vcx = Array.isArray(zemaxMeta.fieldsRaw.vcx) ? zemaxMeta.fieldsRaw.vcx : [];
    const vcy = Array.isArray(zemaxMeta.fieldsRaw.vcy) ? zemaxMeta.fieldsRaw.vcy : [];
    const fieldCount = Math.max(yfln.length, fwgn.length, vdx.length, vdy.length, vcx.length, vcy.length, 0);
    const fields = [];
    for (let i = 0; i < fieldCount; i++) {
      const angleDegRaw = Number(yfln[i]);
      const angleDeg = Number.isFinite(angleDegRaw) ? angleDegRaw : (i === 0 ? 0 : null);
      if (angleDeg == null) continue;
      const weightRaw = Number(fwgn[i]);
      fields.push({
        index: i,
        angleDeg,
        weight: Number.isFinite(weightRaw) ? Math.max(0, weightRaw) : 1,
        vdx: Number.isFinite(Number(vdx[i])) ? Number(vdx[i]) : 0,
        vdy: Number.isFinite(Number(vdy[i])) ? Number(vdy[i]) : 0,
        vcx: Number.isFinite(Number(vcx[i])) ? Number(vcx[i]) : 0,
        vcy: Number.isFinite(Number(vcy[i])) ? Number(vcy[i]) : 0,
      });
    }

    const zoomConfigs = buildZoomConfigsFromMeta(zemaxMeta.multiConfig, surfaces);
    const zoom = zoomConfigs.length
      ? { activeConfig: Number(zoomConfigs[0]?.index || 1), configs: zoomConfigs }
      : null;
    const imsSurfaceNumber = Number(surfaces?.[surfaces.length - 1]?.zmx?.surf);

    const lensName = zemaxMeta.name || sourceNameToLensName(sourceName);
    return {
      name: lensName,
      zemaxName: zemaxMeta.name || null,
      zemaxVersion: zemaxMeta.version || null,
      notes: [
        "Imported from Zemax sequential text.",
        "Mapping: R = 1/CURV, t = DISZ, glass = GLAS, ap = DIAM (semi-diameter).",
        "GLAS lines with explicit nd/Vd are preserved per surface (e.g. ___BLANK).",
        "Default draw mode for Zemax import is optical-only (no inferred mechanical shoulders).",
      ],
      import_options: {
        use_same_ap_for_optics_and_mechanics: false,
        preserve_ims_aperture: true,
        use_zemax_fields: fields.length > 0,
        match_zemax_wavelength: false,
      },
      zemax: {
        source: "zemax",
        name: zemaxMeta.name || null,
        version: zemaxMeta.version || null,
        mode: zemaxMeta.mode || null,
        fieldType: zemaxMeta.fieldType || "angle_deg",
        wavelengthsNm,
        primaryWavelengthIndex,
        primaryWavelengthNm,
        fields,
        zoomConfigCount: zoomConfigs.length,
        currentConfigIndex: zoom ? zoom.activeConfig : null,
        currentConfigLabel: zoom ? (zoom.configs[0]?.label || `Config ${zoom.activeConfig}`) : null,
        configAperture: zoom ? (Number.isFinite(Number(zoom.configs[0]?.aperture)) ? Number(zoom.configs[0].aperture) : null) : null,
        imsSurfaceNumber: Number.isFinite(imsSurfaceNumber) ? imsSurfaceNumber : null,
      },
      ...(zoom ? { zoom } : {}),
      surfaces,
    };
  }

  function importZemaxText(rawText, sourceName = "pasted_zmx", opts = {}) {
    const text = String(rawText ?? "").trim();
    if (!text) throw new Error("Paste Zemax text first.");

    const normalizedBlock = extractLikelyZemaxLinesFromText(text).join("\n").trim();
    if (!normalizedBlock) throw new Error("Paste Zemax text first.");

    const hasSurf = /(^|\n)\s*SURF\s+-?\d+/im.test(normalizedBlock);
    if (!hasSurf) throw new Error("This does not look like a Zemax sequential file.");

    const hasModeSeq = /(^|\n)\s*MODE\s+SEQ\b/im.test(normalizedBlock);
    const hasVers = /(^|\n)\s*VERS\b/im.test(normalizedBlock);
    if (!hasModeSeq && !hasVers && !/(^|\n)\s*CURV\s+/im.test(normalizedBlock)) {
      throw new Error("This does not look like a Zemax sequential file.");
    }

    const parsed = parseZemaxSequentialText(normalizedBlock, sourceName);
    parsed.importSource = String(opts.importSource || "zmx_text");
    parsed.originalZmxText = text;
    parsed.zemaxName = parsed.zemaxName || parsed.zemax?.name || null;
    parsed.zemaxVersion = parsed.zemaxVersion || parsed.zemax?.version || null;
    if (parsed.zemaxName) parsed.name = parsed.zemaxName;

    loadLens(parsed);

    ensureZemaxPrimaryWaveOption();
    setVisibleDefaultWavePresetAfterZemaxImport();
    scheduleRenderAll();
    scheduleRenderPreview();

    const displayName = parsed.zemaxName || parsed.name || sourceNameToLensName(sourceName);
    toast(`Loaded Zemax lens: ${displayName}`);
    return parsed;
  }

  async function loadLensFromURL(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const txt = await r.text();

      try {
        const obj = JSON.parse(txt);
        loadLens(obj);
        toast("Loaded lens JSON");
        return true;
      } catch (_) {}

      if (isLikelyZemaxSequentialText(txt) || /\.(zmx|seq|txt)(\?|$)/i.test(url)) {
        importZemaxText(txt, url.split("/").pop() || "Zemax import", { importSource: "zmx_file" });
        return true;
      }

      throw new Error("Unknown lens format (expected JSON or Zemax sequential text)");
    } catch (e) {
      if (ui.footerWarn) ui.footerWarn.textContent = `Lens load failed: ${url} (${e?.message || e})`;
      return false;
    }
  }

  function loadLensFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const txt = String(reader.result || "");
        const name = String(file?.name || "");
        const lower = name.toLowerCase();

        const parseAttempts = [];
        const tryJson = () => {
          const obj = JSON.parse(txt);
          loadLens(obj);
          toast("Loaded lens JSON (file)");
          return true;
        };
        const tryZemax = () => {
          if (!isLikelyZemaxSequentialText(txt) && !/\.(zmx|seq|txt)$/i.test(lower)) {
            throw new Error("Not Zemax sequential text");
          }
          importZemaxText(txt, name || "Zemax import", { importSource: "zmx_file" });
          return true;
        };

        const order = /\.(zmx|seq)$/i.test(lower) ? [tryZemax, tryJson] : [tryJson, tryZemax];
        for (const fn of order) {
          try {
            fn();
            resolve(true);
            return;
          } catch (e) {
            parseAttempts.push(e?.message || String(e));
          }
        }

        const msg = `Lens parse failed (${parseAttempts.join(" | ")})`;
        if (ui.footerWarn) ui.footerWarn.textContent = msg;
        reject(new Error(msg));
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async function copyTextToClipboard(text) {
    const value = String(text ?? "");
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {}
    }
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  }

  async function copyLensJsonToClipboard() {
    try {
      const text = JSON.stringify(clone(lens), null, 2);
      await copyTextToClipboard(text);
      toast("Copied lens JSON");
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      if (ui.footerWarn) ui.footerWarn.textContent = `Copy JSON failed: ${msg}`;
      toast(`Copy JSON failed: ${msg}`);
      return false;
    }
  }

  // -------------------- save lens JSON --------------------
  function saveLensToFile() {
    try {
      const out = clone(lens);
      if (out?.originalZmxText) {
        const keep = window.confirm("Include original ZMX text in saved JSON? (larger file)");
        if (!keep) delete out.originalZmxText;
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      const safeName = String(lens?.name || "lens").replace(/[^\w\-]+/g, "_");
      a.download = `${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
      toast("Saved lens JSON");
    } catch (e) {
      if (ui.footerWarn) ui.footerWarn.textContent = `Save failed: ${e?.message || e}`;
    }
  }

// -------------------- init + bindings --------------------
function wireUI() {
  // sensor presets
  populateSensorPresetsSelect();

  if (ui.sensorPreset) {
    ui.sensorPreset.addEventListener("change", (e) => {
      applyPreset(e.target.value);
      scheduleRenderAll();
      scheduleRenderPreview();
    });
  }

  // manual sensor dims
  if (ui.sensorW) ui.sensorW.addEventListener("change", () => {
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
  });
  if (ui.sensorH) ui.sensorH.addEventListener("change", () => {
    applySensorToIMS();
    scheduleRenderAll();
    scheduleRenderPreview();
  });

  // live render controls
  [
    "fieldAngle","rayCount","wavePreset",
    "focusMode","focusMechanism","lensFocus","focusShiftSlider","autoRefocusOnDistanceChange",
    "renderScale","prevObjDist","prevObjH","prevObjW","prevRes",
    "previewAutoFit","previewOrientation","previewRenderMode","pupilSamples"
  ].forEach((id) => {
    const el = ui[id];
    if (!el) return;
    el.addEventListener("input", () => { scheduleRenderAll(); scheduleRenderPreview(); });
    el.addEventListener("change", () => { scheduleRenderAll(); scheduleRenderPreview(); });
  });

  if (ui.lensFocus) {
    ui.lensFocus.addEventListener("input", () => {
      setFocusShiftMm(ui.lensFocus.value, { updateStatus: true });
      scheduleRenderAll();
      scheduleRenderPreview();
    });
    ui.lensFocus.addEventListener("change", () => {
      setFocusShiftMm(ui.lensFocus.value, { updateStatus: true });
      scheduleRenderAll();
      scheduleRenderPreview();
    });
  }
  if (ui.focusShiftSlider) {
    ui.focusShiftSlider.addEventListener("input", () => {
      setFocusShiftMm(ui.focusShiftSlider.value, { updateStatus: true });
      scheduleRenderAll();
      scheduleRenderPreview();
    });
    ui.focusShiftSlider.addEventListener("change", () => {
      setFocusShiftMm(ui.focusShiftSlider.value, { updateStatus: true });
      scheduleRenderAll();
      scheduleRenderPreview();
    });
  }
  if (ui.focusMode || ui.focusMechanism) {
    const focusModeHandler = () => {
      syncFocusControlsUI();
      scheduleRenderAll();
      scheduleRenderPreview();
    };
    if (ui.focusMode) ui.focusMode.addEventListener("change", focusModeHandler);
    if (ui.focusMechanism) ui.focusMechanism.addEventListener("change", focusModeHandler);
  }
  if (ui.autoRefocusOnDistanceChange) {
    ui.autoRefocusOnDistanceChange.addEventListener("change", () => {
      syncFocusStateToLens();
      scheduleRenderAll();
      scheduleRenderPreview();
    });
  }
  if (ui.autoFocusMode) {
    ui.autoFocusMode.addEventListener("change", () => {
      if (!lens.import_options || typeof lens.import_options !== "object") lens.import_options = {};
      lens.import_options.autofocus_mode = getPreviewAutofocusMode();
      scheduleRenderAll();
      scheduleRenderPreview();
    });
  }
  if (ui.zoomConfigSelect) {
    ui.zoomConfigSelect.addEventListener("change", () => {
      const idx = Number(ui.zoomConfigSelect.value);
      applyZoomConfigToLens(idx, { silent: false, skipBuild: false, skipRender: false });
      scheduleRenderPreview();
    });
  }

  // preview options (DOF/CA/quality)
  ["optDOF","optCA","renderQuality"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => scheduleRenderPreview());
  });

  // toolbar buttons
  on("#btnNew", "click", newClearLens);
  on("#btnLoadOmit", "click", () => loadLens(omit50ConceptV1()));
  on("#btnLoadDemo", "click", () => loadLens(demoLensSimple()));
  on("#btnCopyJson", "click", copyLensJsonToClipboard);
  on("#btnPasteJson", "click", openJsonPasteModal);
  on("#btnPasteZmx", "click", openZmxPasteModal);
  on("#btnCornerFocus", "click", openCornerFocusModal);
  on("#btnAddFieldFlattener", "click", addWeakRearFieldFlattener);

  on("#btnAdd", "click", addSurface);
  on("#btnAddElement", "click", () => {
  if (typeof openElementModal === "function") {
    const ok = openElementModal();
    if (ok === false) toast("Element modal missing");
  } else {
    toast("Element modal missing");
  }
});

  on("#btnDuplicate", "click", duplicateSelected);
  on("#btnMoveUp", "click", () => moveSelected(-1));
  on("#btnMoveDown", "click", () => moveSelected(+1));
  on("#btnRemove", "click", removeSelected);

  on("#btnScaleToFocal", "click", scaleToTargetFocal);
  on("#btnSetTStop", "click", setTargetTStop);
  on("#btnAutoFocus", "click", autoFocus);
  on("#btnRenderEngine", "click", toggleRenderEngine);
  on("#btnDebugOverlay", "click", toggleDebugOverlay);
  wireAutoTunerUI();
  wireLensAiUI();
  wireStockLibraryUI();

  on("#btnSave", "click", saveLensToFile);

  // lens JSON file picker
  if (ui.fileLoad) {
    ui.fileLoad.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      await loadLensFromFile(f);
      ui.fileLoad.value = "";
    });
  }

  if (ui.zmxPasteImport) {
    ui.zmxPasteImport.addEventListener("click", (e) => {
      e.preventDefault();
      importFromZmxPasteModal();
    });
  }
  if (ui.zmxPasteCancel) {
    ui.zmxPasteCancel.addEventListener("click", (e) => {
      e.preventDefault();
      closeZmxPasteModal();
    });
  }
  if (ui.zmxPasteClose) {
    ui.zmxPasteClose.addEventListener("click", (e) => {
      e.preventDefault();
      closeZmxPasteModal();
    });
  }
  if (ui.zmxPasteClear) {
    ui.zmxPasteClear.addEventListener("click", (e) => {
      e.preventDefault();
      clearZmxPasteText();
    });
  }
  if (ui.zmxPasteText) {
    ui.zmxPasteText.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        importFromZmxPasteModal();
      }
    });
  }
  if (ui.zmxPasteModal) {
    ui.zmxPasteModal.addEventListener("mousedown", (e) => {
      if (e.target === ui.zmxPasteModal) closeZmxPasteModal();
    });
  }

  if (ui.cfRun) {
    ui.cfRun.addEventListener("click", (e) => {
      e.preventDefault();
      runCornerFocusTest();
    });
  }
  if (ui.cfCopy) {
    ui.cfCopy.addEventListener("click", (e) => {
      e.preventDefault();
      copyCornerFocusReport();
    });
  }
  if (ui.cfClose) {
    ui.cfClose.addEventListener("click", (e) => {
      e.preventDefault();
      closeCornerFocusModal();
    });
  }
  if (ui.cornerFocusModal) {
    ui.cornerFocusModal.addEventListener("mousedown", (e) => {
      if (e.target === ui.cornerFocusModal) closeCornerFocusModal();
    });
  }

  if (ui.jsonPasteImport) {
    ui.jsonPasteImport.addEventListener("click", (e) => {
      e.preventDefault();
      importFromJsonPasteModal();
    });
  }
  if (ui.jsonPasteCancel) {
    ui.jsonPasteCancel.addEventListener("click", (e) => {
      e.preventDefault();
      closeJsonPasteModal();
    });
  }
  if (ui.jsonPasteClose) {
    ui.jsonPasteClose.addEventListener("click", (e) => {
      e.preventDefault();
      closeJsonPasteModal();
    });
  }
  if (ui.jsonPasteClear) {
    ui.jsonPasteClear.addEventListener("click", (e) => {
      e.preventDefault();
      clearJsonPasteText();
    });
  }
  if (ui.jsonPasteText) {
    ui.jsonPasteText.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        importFromJsonPasteModal();
      }
    });
  }
  if (ui.jsonPasteModal) {
    ui.jsonPasteModal.addEventListener("mousedown", (e) => {
      if (e.target === ui.jsonPasteModal) closeJsonPasteModal();
    });
  }

  // preview image picker
  if (ui.prevImg) {
    ui.prevImg.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try { await loadPreviewImageFromFile(f); }
      catch (_) {}
      ui.prevImg.value = "";
    });
  }

  if (ui.previewSourceMode) {
    ui.previewSourceMode.addEventListener("change", async (e) => {
      const mode = String(e.target.value || "chart");
      try { await setPreviewSourceMode(mode); }
      catch (_) {}
    });
  }
  if (ui.previewAutoFit) {
    ui.previewAutoFit.addEventListener("change", () => {
      syncPreviewFitUI();
      scheduleRenderPreview();
    });
  }
  if (ui.verifyMatchZemaxWave) {
    ui.verifyMatchZemaxWave.addEventListener("change", () => {
      if (lens?.import_options) lens.import_options.match_zemax_wavelength = !!ui.verifyMatchZemaxWave.checked;
      scheduleRenderAll();
    });
  }
  if (ui.btnToggleVerifyPanel) {
    ui.btnToggleVerifyPanel.addEventListener("click", () => {
      verifyPanelExpanded = !verifyPanelExpanded;
      updateZemaxVerifyChrome();
      scheduleRenderAll();
    });
  }
  syncPreviewFitUI();

  // preview buttons
  if (ui.btnRenderPreview) ui.btnRenderPreview.addEventListener("click", () => scheduleRenderPreview({ force: true, immediate: true }));
  if (ui.btnPreviewFS) ui.btnPreviewFS.addEventListener("click", togglePreviewFullscreen);
  if (ui.btnPreviewRuler) ui.btnPreviewRuler.addEventListener("click", () => {
    preview.rulerOn = !preview.rulerOn;
    ui.btnPreviewRuler.classList.toggle("isOn", preview.rulerOn);
    drawPreviewViewport();
  });
  if (ui.btnRaysFS) ui.btnRaysFS.addEventListener("click", toggleRaysFullscreen);

  // New Lens modal buttons (optional)
  on("#btnNewLens", "click", () => (typeof openNewLensModal === "function") && openNewLensModal());
  if (ui.nlClose) ui.nlClose.addEventListener("click", (e) => { e.preventDefault(); closeNewLensModal(); });
  if (ui.nlCreate) ui.nlCreate.addEventListener("click", (e) => { e.preventDefault(); createNewLensFromModal(); });
  if (ui.newLensModal) {
    ui.newLensModal.addEventListener("mousedown", (e) => {
      if (e.target === ui.newLensModal) closeNewLensModal();
    });
  }

  // selection hotkeys
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isAutoTunerModalOpen()) {
      e.preventDefault();
      closeAutoTunerModal();
      return;
    }
    if (e.key === "Escape" && isLensAiOpen()) {
      e.preventDefault();
      closeLensAiAssistant();
      return;
    }
    if (e.key === "Escape" && isZmxPasteModalOpen()) {
      e.preventDefault();
      closeZmxPasteModal();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (document.activeElement && ["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) return;
      removeSelected();
    }
    if (e.key === "ArrowUp" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); moveSelected(-1); }
    if (e.key === "ArrowDown" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); moveSelected(+1); }
  });

  // resize
  window.addEventListener("resize", () => {
    resizeCanvasToCSS();
    resizePreviewCanvasToCSS();
    scheduleRenderAll();
    if (preview.ready) scheduleRenderPreview();
  });

  window.addEventListener("pagehide", () => {
    persistLensSession();
  });
  window.addEventListener("beforeunload", () => {
    persistLensSession();
  });
}

// -------------------- boot --------------------
function boot() {
  normalizeInitialAnchorScroll();
  wireUI();
  updateZemaxVerifyChrome();
  updateRenderEngineButton();
  updateDebugOverlayButton();
  bindViewControls();
  bindPreviewViewControls();
  setFocusShiftMm(getFocusShiftMm(), { updateStatus: false });
  syncFocusControlsUI();
  const previousBusy = readRuntimeBusyMarker();
  if (previousBusy) {
    clearRuntimeBusy();
    enterSafeMode(`previous ${String(previousBusy.reason || "render")} did not finish`);
  }

  if (typeof window !== "undefined") {
    window.runFiniteDistanceFocusDiagnostics = (opts = {}) => {
      const wavePreset = String(opts.wavePreset || ui.wavePreset?.value || "d");
      const autofocusMode = String(opts.autofocusMode || getPreviewAutofocusMode());
      const { h: sensorH } = getSensorWH();
      const sensorHv = Number.isFinite(Number(opts.sensorHv))
        ? Number(opts.sensorHv)
        : Math.max(1e-6, sensorH * OV_DEFAULT * 0.5);
      const focusMechanism = normalizeFocusMechanism(opts.focusMechanism || ui.focusMechanism?.value || "move-lens");
      const focusShiftMm = Number(opts.focusShiftMm ?? opts.lensShift ?? ui.lensFocus?.value ?? 0);
      const pose = focusPoseFromShift(focusShiftMm, focusMechanism);
      const report = runFiniteDistanceFocusDiagnostics({
        surfaces: lens.surfaces,
        wavePreset,
        lensShift: Number(opts.lensShift ?? pose.lensShift),
        sensorX: Number(opts.sensorX ?? pose.sensorX),
        focusMechanism,
        autofocusMode,
        sensorHv,
        distancesMm: Array.isArray(opts.distancesMm) ? opts.distancesMm : [2000, 20000],
        targetDistanceMm: Number(opts.targetDistanceMm ?? ui.prevObjDist?.value ?? 2000),
        printToConsole: opts.printToConsole !== false,
      });
      return report;
    };
  }

  // default sensor preset -> use current select or Mini LF
  if (ui.sensorPreset && SENSOR_PRESETS?.[ui.sensorPreset.value]) applyPreset(ui.sensorPreset.value);
  else applyPreset(DEFAULT_SENSOR_PRESET);

  // initial table + draw
  clampAllApertures(lens.surfaces);
  buildTable();
  applySensorToIMS();
  renderAll();

  // load default assets (non-blocking)
  preview.sourceUrls.chart = DEFAULT_PREVIEW_URL;
  preview.sourceMode = "chart";
  if (ui.previewSourceMode) ui.previewSourceMode.value = "chart";
  loadPreviewImageFromURL(DEFAULT_PREVIEW_URL, { announce: false }).catch(() => {});

  const restoredSession = restoreLensSession();
  if (!restoredSession) {
    loadLensFromURL(DEFAULT_LENS_URL).catch(() => {});
  } else {
    toast("Laatste lens hersteld");
  }
}

boot();
})();
