/**
 * aitag 生图台 - 前端逻辑 v1.0 (Endfield Protocol)
 * 移植自 astrbot_plugin_nai_image test-panel v4.7，改造点：
 *   - API 层改为 aitag 后端：/api/studio/config（配置快照）与 /api/studio/generate（统一生图）
 *   - 移除试用生成与 AstrBot Bridge 依赖；面板状态缓存改用 localStorage
 *   - 新增 gpt-image 模型适配：按模型类别切换参数面（quality/background/output_format）
 *   - 新增结果「传到图库」（走 /api/upload，含参数 meta）与管理员后端密钥配置卡
 *   - 终末地等高线拓扑地形引擎原样保留
 */

(function () {
  "use strict";

  // ===== DOM 引用 =====
  const $ = (id) => document.getElementById(id);
  const els = {
    contourCanvas: $("contourCanvas"),
    naiPrompt: $("naiPrompt"),
    nlPrompt: $("nlPrompt"),
    sampler: $("sampler"),
    size: $("size"),
    steps: $("steps"),
    scale: $("scale"),
    cfg: $("cfg"),
    noiseSchedule: $("noiseSchedule"),
    model: $("model"),
    count: $("count"),
    style: $("style"),
    customArtistsWrapper: $("customArtistsWrapper"),
    customArtists: $("customArtists"),
    negative: $("negative"),
    loadDefaultNegative: $("loadDefaultNegative"),
    generateBtn: $("generateBtn"),
    resetBtn: $("resetBtn"),
    tokenBadge: $("tokenBadge"),
    openaiBadge: $("openaiBadge"),
    resultMeta: $("resultMeta"),
    emptyState: $("emptyState"),
    loadingState: $("loadingState"),
    loadingText: $("loadingText"),
    errorState: $("errorState"),
    errorMsg: $("errorMsg"),
    retryBtn: $("retryBtn"),
    resultGrid: $("resultGrid"),
    mergeInfo: $("mergeInfo"),
    mergeSteps: $("mergeSteps"),
    callFormat: $("callFormat"),
    callFormatHint: $("callFormatHint"),
    openaiConfigStatus: $("openaiConfigStatus"),
    openaiConfigStatusText: $("openaiConfigStatusText"),
    refUploadWrap: $("refUploadWrap"),
    refFile: $("refFile"),
    refCountTag: $("refCountTag"),
    refGridWrap: $("refGridWrap"),
    refGrid: $("refGrid"),
    refRemove: $("refRemove"),
    refStrengthWrap: $("refStrengthWrap"),
    refStrength: $("refStrength"),
    refModeWrap: $("refModeWrap"),
    refMode: $("refMode"),
    refNoiseWrap: $("refNoiseWrap"),
    refNoise: $("refNoise"),
    openaiSeedWrap: $("openaiSeedWrap"),
    openaiSeed: $("openaiSeed"),
    directorActionWrap: $("directorActionWrap"),
    directorAction: $("directorAction"),
    charListWrap: $("charListWrap"),
    charList: $("charList"),
    charAdd: $("charAdd"),
    // gpt-image
    gptImageWrap: $("gptImageWrap"),
    gptQuality: $("gptQuality"),
    gptBackground: $("gptBackground"),
    gptOutputFormat: $("gptOutputFormat"),
    // NAI 专属参数字段（gpt-image 模式下隐藏）
    samplerField: $("samplerField"),
    stepsField: $("stepsField"),
    scaleField: $("scaleField"),
    cfgField: $("cfgField"),
    noiseScheduleField: $("noiseScheduleField"),
    styleCard: $("styleCard"),
  };

  // ===== 状态 =====
  let isGenerating = false;
  let lastRequestBody = null;
  // 本地上传参考图列表（OpenAI 兼容格式）：{ b64, dataUrl, name, strength, caption }
  let referenceImages = [];
  // 精准参考描述默认值（后端配置下发）
  let defaultDirectorCaption = "character&style";
  // 参考图默认权重（后端配置下发）
  let defaultVibeStrength = 0.6;
  let defaultDirectorStrength = 1;
  // 当前调用格式："direct" | "openai"
  let currentCallFormat = "direct";
  // 分段切换按钮引用
  let formatToggleBtns = [];
  // OpenAI 兼容模型列表（后端配置接口下发）
  let openaiModels = [
    "nai-diffusion-5-full",
    "nai-diffusion-5-curated",
    "nai-diffusion-4-5-full",
    "nai-diffusion-4-5-curated",
    "nai-diffusion-4-full",
    "nai-diffusion-4-curated-preview",
    "nai-diffusion-3",
    "nai-diffusion-furry-3",
  ];
  let gptimageModels = ["gpt-image-1"];
  // 最近一次生成结果（传图库用）
  let lastResult = { images: [], body: null, meta: null };
  // NAI 直连模式可用的模型下拉项
  const DIRECT_MODEL_OPTIONS = [
    { value: "nai-diffusion-4-5-full", label: "V4.5 完整版 [4.5_FULL]" },
    { value: "nai-diffusion-5-full", label: "V5 完整版 [5.0_FULL]" },
  ];
  // NAI 尺寸分档 → OpenAI 像素尺寸（后端同款映射，直连反查用）
  const NAI_SIZE_MAP = {
    方图: "1024x1024",
    竖图: "832x1216",
    横图: "1216x832",
    "2K方图": "1472x1472",
    "2K竖图": "1088x1920",
    "2K横图": "1920x1088",
    "4K方图": "1472x1472",
    "4K竖图": "1088x1920",
    "4K横图": "1920x1088",
  };

  // ===== 工具函数 =====
  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }

  function setBadge(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "badge " + (type || "badge-neutral");
  }

  // 徽章点击：未配置时引导去个人资料设置（顶层窗口跳转）
  function bindBadgeConfigShortcut(el, getConfigured) {
    if (!el) return;
    el.addEventListener("click", () => {
      if (!getConfigured()) goProfile();
    });
  }

  function isGptModel(name) {
    return /^gpt-image/i.test(String(name || "").trim());
  }

  // ===== API 层（aitag 后端，session cookie 鉴权） =====
  async function apiGet(path) {
    const resp = await fetch(path, { credentials: "same-origin" });
    if (resp.status === 401) {
      window.top.location.href = "/login";
      throw new Error("未登录，正在跳转登录页...");
    }
    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error((data && data.error) || `HTTP ${resp.status}`);
    return data;
  }

  async function apiPost(path, body) {
    const resp = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.status === 401) {
      window.top.location.href = "/login";
      throw new Error("未登录，正在跳转登录页...");
    }
    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error((data && data.error) || `HTTP ${resp.status}`);
    return data;
  }

  // =========================================================================
  // ===== 终末地等高线拓扑地形引擎 (HIGH-VISIBILITY CONTOUR TOPOLOGY) =====
  // =========================================================================
  function initContourEngine() {
    const canvas = els.contourCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const NUM_SOURCES = 18;
    const sources = [];

    function initSources() {
      sources.length = 0;
      for (let i = 0; i < NUM_SOURCES; i++) {
        const isPeak = i % 3 !== 0;
        sources.push({
          relX: 0.05 + Math.random() * 0.9,
          relY: 0.05 + Math.random() * 0.9,
          baseRadius: 160 + Math.random() * 180,
          amp: (isPeak ? 1.0 : -0.8) * (0.75 + Math.random() * 0.5),
          speedX: (Math.random() - 0.5) * 0.00012,
          speedY: (Math.random() - 0.5) * 0.00012,
          freq: 0.00035 + Math.random() * 0.00055,
          phase: Math.random() * Math.PI * 2,
          radiusOscFreq: 0.00025 + Math.random() * 0.00045,
        });
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener("resize", resize);
    resize();
    initSources();

    const NUM_LEVELS = 16;
    const ISO_LEVELS = [];
    for (let i = 0; i < NUM_LEVELS; i++) {
      ISO_LEVELS.push(-1.35 + (2.7 / (NUM_LEVELS - 1)) * i);
    }

    const STEP = 26;

    const MS_EDGES = [
      [],
      [[3, 2]],
      [[2, 1]],
      [[3, 1]],
      [[0, 1]],
      [[3, 0], [2, 1]],
      [[0, 2]],
      [[3, 0]],
      [[0, 3]],
      [[0, 2]],
      [[0, 1], [3, 2]],
      [[0, 1]],
      [[1, 3]],
      [[1, 2]],
      [[2, 3]],
      []
    ];

    function evaluateField(x, y, time) {
      let val = 0;
      for (let i = 0; i < NUM_SOURCES; i++) {
        const s = sources[i];
        const driftX = Math.sin(time * s.freq + s.phase) * 45;
        const driftY = Math.cos(time * s.freq * 0.85 + s.phase) * 45;
        const sx = s.relX * width + driftX;
        const sy = s.relY * height + driftY;

        const dx = x - sx;
        const dy = y - sy;
        const distSq = dx * dx + dy * dy;

        const r = s.baseRadius + Math.sin(time * s.radiusOscFreq + s.phase) * 30;
        const twoSigmaSq = 2 * r * r;

        if (distSq < 6.5 * r * r) {
          val += s.amp * Math.exp(-distSq / twoSigmaSq);
        }
      }
      return val;
    }

    function getEdgePoint(edgeIndex, x0, y0, step, vTL, vTR, vBR, vBL, iso) {
      const interp = (vA, vB) => {
        const d = vB - vA;
        return Math.abs(d) < 1e-6 ? 0.5 : Math.max(0, Math.min(1, (iso - vA) / d));
      };

      switch (edgeIndex) {
        case 0:
          return { x: x0 + interp(vTL, vTR) * step, y: y0 };
        case 1:
          return { x: x0 + step, y: y0 + interp(vTR, vBR) * step };
        case 2:
          return { x: x0 + interp(vBL, vBR) * step, y: y0 + step };
        case 3:
          return { x: x0, y: y0 + interp(vTL, vBL) * step };
        default:
          return { x: x0, y: y0 };
      }
    }

    function stitchAndRenderPolylines(segments, isoIndex, totalLevels) {
      if (segments.length === 0) return;

      const isKeyRidge = isoIndex === totalLevels - 2 || isoIndex === totalLevels - 5;
      const isMajorLine = isoIndex % 3 === 0;

      ctx.beginPath();
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        ctx.moveTo(seg[0].x, seg[0].y);
        ctx.lineTo(seg[1].x, seg[1].y);
      }

      if (isKeyRidge) {
        ctx.strokeStyle = "rgba(217, 199, 0, 0.38)";
        ctx.lineWidth = 1.4;
      } else if (isMajorLine) {
        ctx.strokeStyle = "rgba(16, 17, 16, 0.15)";
        ctx.lineWidth = 1.1;
      } else {
        ctx.strokeStyle = "rgba(16, 17, 16, 0.06)";
        ctx.lineWidth = 0.8;
      }
      ctx.stroke();
    }

    let lastFrameTime = 0;
    const TARGET_INTERVAL = 1000 / 30;

    function render(timestamp) {
      requestAnimationFrame(render);

      if (document.hidden) return;
      if (timestamp - lastFrameTime < TARGET_INTERVAL) return;
      lastFrameTime = timestamp;

      ctx.clearRect(0, 0, width, height);

      const cols = Math.ceil(width / STEP) + 1;
      const rows = Math.ceil(height / STEP) + 1;
      const grid = new Float32Array(cols * rows);

      for (let r = 0; r < rows; r++) {
        const y = r * STEP;
        const rowOffset = r * cols;
        for (let c = 0; c < cols; c++) {
          const x = c * STEP;
          grid[rowOffset + c] = evaluateField(x, y, timestamp);
        }
      }

      for (let l = 0; l < ISO_LEVELS.length; l++) {
        const iso = ISO_LEVELS[l];
        const segments = [];

        for (let r = 0; r < rows - 1; r++) {
          const y0 = r * STEP;
          const r0 = r * cols;
          const r1 = (r + 1) * cols;

          for (let c = 0; c < cols - 1; c++) {
            const x0 = c * STEP;
            const vTL = grid[r0 + c];
            const vTR = grid[r0 + c + 1];
            const vBR = grid[r1 + c + 1];
            const vBL = grid[r1 + c];

            let cellIndex = 0;
            if (vTL >= iso) cellIndex |= 8;
            if (vTR >= iso) cellIndex |= 4;
            if (vBR >= iso) cellIndex |= 2;
            if (vBL >= iso) cellIndex |= 1;

            if (cellIndex === 0 || cellIndex === 15) continue;

            const edgePairs = MS_EDGES[cellIndex];
            for (let p = 0; p < edgePairs.length; p++) {
              const pA = getEdgePoint(edgePairs[p][0], x0, y0, STEP, vTL, vTR, vBR, vBL, iso);
              const pB = getEdgePoint(edgePairs[p][1], x0, y0, STEP, vTL, vTR, vBR, vBL, iso);
              segments.push([pA, pB]);
            }
          }
        }

        stitchAndRenderPolylines(segments, l, ISO_LEVELS.length);
      }
    }

    requestAnimationFrame(render);
  }

  // =========================================================================
  // ===== 面板状态缓存（localStorage） =====
  // =========================================================================
  const CACHE_KEY = "aitag_studio_cache_v1";

  function getCachedFields() {
    return [
      "naiPrompt", "nlPrompt", "sampler", "size", "steps", "scale",
      "cfg", "noiseSchedule", "model", "count", "style", "customArtists", "negative",
      "refStrength", "refMode", "refNoise", "openaiSeed", "directorAction",
      "gptQuality", "gptBackground", "gptOutputFormat"
    ];
  }

  let _saveCacheTimer = null;
  function saveCache() {
    if (_saveCacheTimer) clearTimeout(_saveCacheTimer);
    _saveCacheTimer = setTimeout(() => {
      try {
        const data = {};
        getCachedFields().forEach((key) => {
          const el = els[key];
          if (el) data[key] = el.value;
        });
        data.callFormat = currentCallFormat;
        const chars = collectCharRows();
        if (chars.length) data.characters = chars;
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn("[aitag Studio] 缓存保存失败:", e);
      }
    }, 500);
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return false;
      let restored = false;
      getCachedFields().forEach((key) => {
        const el = els[key];
        if (el && data[key] != null) {
          el.value = data[key];
          restored = true;
        }
      });
      if (data.callFormat === "openai" || data.callFormat === "direct") {
        currentCallFormat = data.callFormat;
        restored = true;
      }
      if (Array.isArray(data.characters) && data.characters.length) {
        clearCharRows();
        data.characters.slice(0, MAX_CHAR_ROWS).forEach((item) => {
          if (!item || typeof item.prompt !== "string" || !item.prompt.trim()) return;
          addCharRow(item.prompt, Number(item.x) || 0.5, Number(item.y) || 0.5);
        });
        restored = true;
      }
      return restored;
    } catch (e) {
      console.warn("[aitag Studio] 缓存加载失败:", e);
      return false;
    }
  }

  // ===== 加载配置状态（当前用户自己的密钥，脱敏） =====
  let panelConfig = null;

  function goProfile() {
    // iframe 场景需要跳顶层窗口
    try {
      window.top.location.href = "/profile";
    } catch (e) {
      window.location.href = "/profile";
    }
  }

  async function loadTokenStatus() {
    try {
      const resp = await apiGet("/api/studio/config");
      const config = resp.config || {};
      panelConfig = resp;
      const directOk = Boolean(config.direct && config.direct.configured);
      const openaiOk = Boolean(config.openai && config.openai.configured);
      setBadge(els.tokenBadge, directOk ? "直连: 已配置" : "直连: 未配置", directOk ? "badge-success" : "badge-error");
      setBadge(els.openaiBadge, openaiOk ? "OpenAI: 已配置" : "OpenAI: 未配置", openaiOk ? "badge-success" : "badge-error");
      bindBadgeConfigShortcut(els.tokenBadge, () => Boolean(panelConfig?.config?.direct?.configured));
      bindBadgeConfigShortcut(els.openaiBadge, () => Boolean(panelConfig?.config?.openai?.configured));
      if (els.tokenBadge) els.tokenBadge.style.cursor = directOk ? "" : "pointer";
      if (els.openaiBadge) els.openaiBadge.style.cursor = openaiOk ? "" : "pointer";
      if (Array.isArray(resp.openai_models) && resp.openai_models.length) {
        openaiModels = resp.openai_models;
      }
      if (Array.isArray(resp.gptimage_models) && resp.gptimage_models.length) {
        gptimageModels = resp.gptimage_models;
      }
      if (resp.openai_director_caption) {
        defaultDirectorCaption = String(resp.openai_director_caption);
      }
      const vibeStrength = parseFloat(resp.openai_vibe_strength);
      if (!Number.isNaN(vibeStrength) && vibeStrength >= 0 && vibeStrength <= 1) {
        defaultVibeStrength = vibeStrength;
      }
      const directorStrength = parseFloat(resp.openai_director_strength);
      if (!Number.isNaN(directorStrength) && directorStrength >= 0 && directorStrength <= 1) {
        defaultDirectorStrength = directorStrength;
      }
      if (els.openaiConfigStatus && currentCallFormat === "openai") {
        show(els.openaiConfigStatus);
        if (config.openai && config.openai.configured) {
          els.openaiConfigStatusText.textContent =
            "OpenAI 接口已配置：" + (config.openai.base_url || "");
          els.openaiConfigStatus.querySelector(".status-dot").className = "status-dot ok";
          const go = $("goProfileBtn");
          if (go) hide(go);
        } else {
          els.openaiConfigStatusText.textContent =
            "你还未配置 OpenAI 兼容密钥（消耗你自己的额度）";
          els.openaiConfigStatus.querySelector(".status-dot").className = "status-dot error";
          const go = $("goProfileBtn");
          if (go) show(go);
        }
      } else if (els.openaiConfigStatus) {
        hide(els.openaiConfigStatus);
      }
    } catch (err) {
      setBadge(els.tokenBadge, "配置加载失败", "badge-error");
    }
  }

  // ===== 尺寸与点数消耗映射 =====
  const SIZE_BASE_COSTS = [
    { value: "竖图", baseCost: 1 },
    { value: "横图", baseCost: 1 },
    { value: "方图", baseCost: 1 },
    { value: "2K竖图", baseCost: 15 },
    { value: "2K横图", baseCost: 15 },
    { value: "2K方图", baseCost: 15 },
    { value: "4K竖图", baseCost: 25 },
    { value: "4K横图", baseCost: 25 },
    { value: "4K方图", baseCost: 25 },
  ];

  // OpenAI 兼容格式直接用像素分辨率（接口文档 §12.1）
  const OPENAI_SIZE_OPTIONS = [
    { value: "832x1216", tier: "竖图", baseCost: 1 },
    { value: "1216x832", tier: "横图", baseCost: 1 },
    { value: "1024x1024", tier: "方图", baseCost: 1 },
    { value: "1088x1920", tier: "2K竖图", baseCost: 15 },
    { value: "1920x1088", tier: "2K横图", baseCost: 15 },
    { value: "1472x1472", tier: "2K方图", baseCost: 15 },
  ];

  // gpt-image 官方尺寸枚举
  const GPT_SIZE_OPTIONS = [
    { value: "1024x1536", label: "1024x1536（竖图）" },
    { value: "1536x1024", label: "1536x1024（横图）" },
    { value: "1024x1024", label: "1024x1024（方图）" },
    { value: "auto", label: "auto（模型自定）" },
  ];

  function sizeDisplayName(value) {
    const opt = OPENAI_SIZE_OPTIONS.find((o) => o.value === value);
    return opt ? `${opt.value}（${opt.tier}）` : value;
  }

  function getModelCostFloor(modelName) {
    return modelName === "nai-diffusion-5-full" ? 5 : 1;
  }

  function currentModelIsGpt() {
    return currentCallFormat === "openai" && isGptModel(els.model ? els.model.value : "");
  }

  function updateSizeOptionsUI() {
    if (!els.size) return;
    const curSize = els.size.value;
    const curModel = els.model ? els.model.value : "";
    els.size.innerHTML = "";
    let options;
    if (currentCallFormat === "openai" && isGptModel(curModel)) {
      options = GPT_SIZE_OPTIONS.map((opt) => ({ value: opt.value, text: opt.label, baseCost: 0 }));
    } else if (currentCallFormat === "openai") {
      options = OPENAI_SIZE_OPTIONS.map((opt) => ({
        value: opt.value,
        text: opt.value,
        baseCost: opt.baseCost,
      }));
    } else {
      options = SIZE_BASE_COSTS.map((opt) => ({
        value: opt.value,
        text: opt.value,
        baseCost: opt.baseCost,
      }));
    }
    options.forEach((opt) => {
      const cost = options === OPENAI_SIZE_OPTIONS || options === GPT_SIZE_OPTIONS
        ? opt.baseCost
        : Math.max(opt.baseCost, getModelCostFloor(curModel));
      const elOpt = document.createElement("option");
      elOpt.value = opt.value;
      elOpt.textContent = opt.baseCost ? `${opt.text}(-${cost})` : opt.text;
      if (opt.value === curSize) {
        elOpt.selected = true;
      }
      els.size.appendChild(elOpt);
    });
    if (!options.some((opt) => opt.value === curSize)) {
      els.size.value =
        currentCallFormat === "openai" ? (isGptModel(curModel) ? "1024x1536" : "832x1216") : "竖图";
    }
  }

  // 按当前调用格式替换模型下拉项：直连只有 V4.5/V5 完整版，
  // OpenAI 兼容格式展示完整模型列表（NAI 系列 + gpt-image 分组）
  function updateModelOptionsUI() {
    if (!els.model) return;
    const curModel = els.model.value;
    els.model.innerHTML = "";
    if (currentCallFormat === "openai") {
      const groupNai = document.createElement("optgroup");
      groupNai.label = "NovelAI 系列";
      openaiModels.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        groupNai.appendChild(opt);
      });
      els.model.appendChild(groupNai);
      const groupGpt = document.createElement("optgroup");
      groupGpt.label = "通用图片模型 (gpt-image)";
      gptimageModels.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        groupGpt.appendChild(opt);
      });
      els.model.appendChild(groupGpt);
    } else {
      DIRECT_MODEL_OPTIONS.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.value;
        opt.textContent = item.label;
        els.model.appendChild(opt);
      });
    }
    if (Array.from(els.model.options).some((o) => o.value === curModel)) {
      els.model.value = curModel;
    }
  }

  // ===== gpt-image 参数面切换：按模型类别显隐 NAI 专属字段 =====
  function applyModelKindUI() {
    const gpt = currentModelIsGpt();
    const openai = currentCallFormat === "openai";
    if (gpt) {
      // gpt-image:官方参数面,NAI 的采样参数/风格/负面全不适用
      if (els.gptImageWrap) show(els.gptImageWrap);
      [els.samplerField, els.stepsField, els.scaleField, els.cfgField, els.noiseScheduleField]
        .forEach((el) => hide(el));
      hide(els.styleCard);
      hide(els.openaiSeedWrap);
      hide(els.directorActionWrap);
      hide(els.charListWrap);
    } else {
      if (els.gptImageWrap) hide(els.gptImageWrap);
      [els.samplerField, els.stepsField, els.scaleField, els.noiseScheduleField]
        .forEach((el) => show(el));
      // CFG Rescale 只有 NAI 直连(GET /generate 的 cfg 参数)接收;
      // OpenAI 兼容端点不提交该参数(nai_image 同款契约),故仅直连显示
      if (openai) hide(els.cfgField);
      else show(els.cfgField);
      show(els.styleCard);
      if (openai) {
        show(els.openaiSeedWrap);
        show(els.directorActionWrap);
        show(els.charListWrap);
      }
    }
  }

  // ===== 表单交互 =====
  function toggleCustomArtists() {
    if (els.style.value === "custom") {
      show(els.customArtistsWrapper);
    } else {
      hide(els.customArtistsWrapper);
    }
    saveCache();
  }

  function buildRequestBody() {
    const safeInt = (v, d) => { const n = parseInt(v, 10); return Number.isNaN(n) ? d : n; };
    const safeFloat = (v, d) => { const n = parseFloat(v); return Number.isNaN(n) ? d : n; };

    const body = {
      nai_prompt: els.naiPrompt.value.trim(),
      nl_prompt: els.nlPrompt.value.trim(),
      style: els.style.value,
      size: els.size.value,
      sampler: els.sampler.value,
      steps: safeInt(els.steps.value, 24),
      scale: safeFloat(els.scale.value, 6),
      cfg: safeFloat(els.cfg.value, 7),
      noise_schedule: els.noiseSchedule.value,
      model: els.model.value,
      n: safeInt(els.count.value, 1),
      call_format: currentCallFormat,
    };

    const neg = els.negative.value.trim();
    if (neg) body.negative = neg;

    if (body.style === "custom") {
      body.custom_artists = els.customArtists.value.trim();
    }

    if (body.call_format === "openai") {
      const refs = referenceImages;
      if (refs.length) {
        body.reference_image_b64_list = refs.map((r) => r.b64);
      }
      const mode = els.refMode ? els.refMode.value : "vibe";
      if (els.refMode) {
        body.reference_mode = mode;
      }
      if (mode === "img2img") {
        if (els.refStrength) {
          const strength = parseFloat(els.refStrength.value);
          if (!Number.isNaN(strength) && strength > 0 && strength <= 1) {
            body.strength = strength;
          }
        }
        if (els.refNoise) {
          const noise = parseFloat(els.refNoise.value);
          if (!Number.isNaN(noise) && noise >= 0 && noise <= 1) {
            body.noise = noise;
          }
        }
      } else if (refs.length && !isGptModel(body.model)) {
        body.reference_strengths = refs.map((r) =>
          Math.min(1, Math.max(0, Number(r.strength) || 0))
        );
        if (mode === "director") {
          body.director_captions = refs.map((r) => r.caption);
        }
      }
      if (els.openaiSeed && els.openaiSeed.value !== "") {
        const seed = parseInt(els.openaiSeed.value, 10);
        if (!Number.isNaN(seed) && seed >= -1) {
          body.seed = seed;
        }
      }
      if (els.directorAction && els.directorAction.value && !isGptModel(body.model)) {
        body.director_action = els.directorAction.value;
      }
      // gpt-image 专属参数
      if (isGptModel(body.model)) {
        body.quality = els.gptQuality ? els.gptQuality.value : "auto";
        body.background = els.gptBackground ? els.gptBackground.value : "auto";
        body.output_format = els.gptOutputFormat ? els.gptOutputFormat.value : "png";
        body.size = els.size.value;
      } else {
        const chars = collectCharRows();
        if (chars.length) {
          body.characters = chars;
        }
      }
    }

    return body;
  }

  // ===== 多角色坐标行管理 =====
  const MAX_CHAR_ROWS = 6;

  function addCharRow(prompt = "", x = 0.5, y = 0.5) {
    if (!els.charList || els.charList.children.length >= MAX_CHAR_ROWS) return;

    const row = document.createElement("div");
    row.className = "char-row";

    const promptInput = document.createElement("input");
    promptInput.type = "text";
    promptInput.className = "input acrylic-input char-prompt";
    promptInput.placeholder = "角色提示词，如 1girl, red dress";
    promptInput.value = prompt;

    const xInput = document.createElement("input");
    xInput.type = "number";
    xInput.className = "input acrylic-input char-coord";
    xInput.min = "0";
    xInput.max = "1";
    xInput.step = "0.05";
    xInput.value = String(x);
    xInput.title = "x 坐标（0-1，从左到右）";

    const yInput = document.createElement("input");
    yInput.type = "number";
    yInput.className = "input acrylic-input char-coord";
    yInput.min = "0";
    yInput.max = "1";
    yInput.step = "0.05";
    yInput.value = String(y);
    yInput.title = "y 坐标（0-1，从上到下）";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-link char-remove";
    removeBtn.title = "移除该角色";
    removeBtn.innerHTML = '<span class="link-icon">✕</span>';
    removeBtn.addEventListener("click", () => {
      row.remove();
      saveCache();
    });

    row.appendChild(promptInput);
    row.appendChild(xInput);
    row.appendChild(yInput);
    row.appendChild(removeBtn);
    els.charList.appendChild(row);

    promptInput.addEventListener("input", saveCache);
  }

  function clearCharRows() {
    if (els.charList) els.charList.innerHTML = "";
  }

  function collectCharRows() {
    if (!els.charList) return [];
    const chars = [];
    Array.from(els.charList.children).forEach((row) => {
      const inputs = row.querySelectorAll("input");
      if (inputs.length < 3) return;
      const prompt = String(inputs[0].value || "").trim();
      if (!prompt) return;
      let x = parseFloat(inputs[1].value);
      let y = parseFloat(inputs[2].value);
      if (Number.isNaN(x)) x = 0.5;
      if (Number.isNaN(y)) y = 0.5;
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
      chars.push({ prompt, x, y });
    });
    return chars;
  }

  // ===== 多张参考图管理（OpenAI 兼容格式，最多 8 张） =====
  const MAX_REF_IMAGES = 8;
  const REF_CAPTIONS = ["character&style", "character", "style"];

  function currentRefMode() {
    return els.refMode ? els.refMode.value : "vibe";
  }

  function defaultRefStrength() {
    return currentRefMode() === "director" ? defaultDirectorStrength : defaultVibeStrength;
  }

  function addRefImages(fileList) {
    let remaining = MAX_REF_IMAGES - referenceImages.length;
    Array.from(fileList || []).forEach((file) => {
      if (remaining <= 0) return;
      if (!file || file.type.indexOf("image/") !== 0) return;
      remaining -= 1;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = String(e.target.result || "");
        const comma = dataUrl.indexOf(",");
        referenceImages.push({
          b64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
          dataUrl,
          name: file.name || `image_${referenceImages.length + 1}`,
          strength: defaultRefStrength(),
          caption: defaultDirectorCaption,
        });
        renderRefGrid();
        saveCache();
      };
      reader.onerror = () => {
        showError(`参考图 ${file.name || ""} 读取失败，请重新选择。`);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeRefImage(index) {
    referenceImages.splice(index, 1);
    renderRefGrid();
    saveCache();
  }

  function clearReferenceImage() {
    referenceImages = [];
    if (els.refFile) els.refFile.value = "";
    renderRefGrid();
  }

  function renderRefGrid() {
    if (!els.refGrid) return;
    const mode = currentRefMode();
    els.refGrid.className = "ref-grid mode-" + mode;
    els.refGrid.innerHTML = "";

    referenceImages.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "ref-item";

      const thumb = document.createElement("img");
      thumb.className = "ref-thumb";
      thumb.src = item.dataUrl;
      thumb.alt = `参考图 ${idx + 1}`;
      thumb.title = item.name;
      thumb.addEventListener("click", () => openLightbox(item.dataUrl));
      row.appendChild(thumb);

      const body = document.createElement("div");
      body.className = "ref-item-body";

      const controls = document.createElement("div");
      controls.className = "ref-item-controls";

      // 逐图强度：gpt-image 模式不支持强度，隐藏输入（样式由 mode-* 控制）
      const strengthInput = document.createElement("input");
      strengthInput.type = "number";
      strengthInput.className = "input acrylic-input ref-strength-input";
      strengthInput.min = "0";
      strengthInput.max = "1";
      strengthInput.step = "0.05";
      strengthInput.value = String(item.strength);
      strengthInput.title = `第 ${idx + 1} 张参考图的强度（0-1）`;
      strengthInput.addEventListener("change", () => {
        const value = parseFloat(strengthInput.value);
        if (!Number.isNaN(value)) {
          item.strength = Math.min(1, Math.max(0, value));
        }
        strengthInput.value = String(item.strength);
        saveCache();
      });
      controls.appendChild(strengthInput);

      // 逐图精准参考描述（仅 director 模式显示）
      const captionSelect = document.createElement("select");
      captionSelect.className = "select acrylic-input ref-caption-select";
      REF_CAPTIONS.forEach((cap) => {
        const opt = document.createElement("option");
        opt.value = cap;
        opt.textContent = cap;
        captionSelect.appendChild(opt);
      });
      if (REF_CAPTIONS.indexOf(item.caption) < 0) {
        item.caption = defaultDirectorCaption;
      }
      captionSelect.value = item.caption;
      captionSelect.title = `第 ${idx + 1} 张参考图的 base_caption`;
      captionSelect.addEventListener("change", () => {
        item.caption = captionSelect.value;
        saveCache();
      });
      controls.appendChild(captionSelect);

      body.appendChild(controls);

      const meta = document.createElement("div");
      meta.className = "ref-item-meta";
      meta.textContent = `REF_${String(idx + 1).padStart(2, "0")} · ${item.name}`;
      body.appendChild(meta);

      row.appendChild(body);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-link ref-item-remove";
      removeBtn.title = "移除该参考图";
      removeBtn.innerHTML = '<span class="link-icon">✕</span>';
      removeBtn.addEventListener("click", () => removeRefImage(idx));
      row.appendChild(removeBtn);

      els.refGrid.appendChild(row);
    });

    if (els.refCountTag) {
      els.refCountTag.textContent = `${referenceImages.length} / ${MAX_REF_IMAGES}`;
    }
    if (els.refGridWrap) {
      if (referenceImages.length) show(els.refGridWrap);
      else hide(els.refGridWrap);
    }
  }

  // 按参考图使用模式切换可见性
  function applyRefModeUI() {
    const openai = currentCallFormat === "openai";
    const mode = currentRefMode();
    if (els.refGrid) {
      els.refGrid.classList.remove("mode-vibe", "mode-img2img", "mode-director");
      els.refGrid.classList.add("mode-" + mode);
    }
    if (openai && mode === "img2img") {
      show(els.refStrengthWrap);
      show(els.refNoiseWrap);
    } else {
      hide(els.refStrengthWrap);
      hide(els.refNoiseWrap);
    }
  }

  // ===== 生成图片 =====
  async function generate() {
    if (isGenerating) return;

    const body = buildRequestBody();
    if (!body.nai_prompt && !body.nl_prompt && !body.director_action) {
      showError("请至少填写一个提示词框（NAI 风格或自然语言）。");
      return;
    }
    if (body.call_format === "openai") {
      const refCount = (body.reference_image_b64_list || []).length;
      if (body.director_action && !refCount) {
        showError("图片处理动作需要先在「调用格式」卡片上传一张源图片。");
        return;
      }
      if (body.reference_mode === "director" && !refCount && !isGptModel(body.model)) {
        showError(
          "精准参考（director）需要先在「调用格式」卡片上传至少一张参考图（可多选，最多 8 张）。"
        );
        return;
      }
    }

    lastRequestBody = body;
    isGenerating = true;
    const refCountText = (body.reference_image_b64_list || []).length
      ? `（含 ${(body.reference_image_b64_list || []).length} 张参考图）`
      : "";
    els.loadingText.textContent = body.director_action
      ? "正在以 director-tools 处理图片..."
      : body.call_format === "openai"
        ? `正在以 ${isGptModel(body.model) ? "gpt-image" : "OpenAI 兼容格式"}生成${refCountText}...`
        : "正在直连生成图片...";
    setLoading(true);
    hideError();
    hideResults();
    hideMergeInfo();

    try {
      const resp = await apiPost("/api/studio/generate", body);

      const images = resp && Array.isArray(resp.data) ? resp.data : null;
      if (!images || images.length === 0) {
        throw new Error((resp && resp.error) || "上游未返回图片");
      }

      if (resp.merge_info) {
        displayMergeInfo(resp.merge_info);
      }

      displayResults(images, body, resp.meta || null, resp.merge_info || null);
    } catch (err) {
      const msg = err?.message || String(err);
      showError(msg);
    } finally {
      isGenerating = false;
      setLoading(false);
    }
  }

  // ===== 合并步骤展示 =====
  function displayMergeInfo(info) {
    hide(els.emptyState);
    els.mergeSteps.innerHTML = "";

    const steps = [];

    if (info.artists) {
      steps.push({ label: "画师串（预置风格 / 自定义，服务端合并）", value: info.artists });
    }

    if (info.nai_prompt) {
      steps.push({ label: "NAI 风格提示词", value: info.nai_prompt });
    }

    if (info.nl_prompt) {
      steps.push({ label: "自然语言提示词（不转译，直接拼接）", value: info.nl_prompt });
    }

    steps.push({ label: "完整 Prompt（发送至生图站点）", value: info.full_prompt, highlight: true });

    steps.forEach((step, idx) => {
      const row = document.createElement("div");
      row.className = "merge-step";

      const num = document.createElement("span");
      num.className = "merge-step-num";
      num.textContent = String(idx + 1);

      const body = document.createElement("div");
      body.className = "merge-step-body";

      const label = document.createElement("div");
      label.className = "merge-step-label";
      label.textContent = step.label;

      const value = document.createElement("div");
      value.className = "merge-step-value" + (step.highlight ? " highlight" : "");
      value.textContent = step.value;

      body.appendChild(label);
      body.appendChild(value);
      row.appendChild(num);
      row.appendChild(body);
      els.mergeSteps.appendChild(row);
    });

    show(els.mergeInfo);
  }

  function hideMergeInfo() {
    hide(els.mergeInfo);
  }

  // ===== UI 状态控制 =====
  function setLoading(loading) {
    if (loading) {
      hide(els.emptyState);
      hide(els.errorState);
      show(els.loadingState);
      els.generateBtn.disabled = true;
      els.loadingText.textContent = "正在生成图片...";
    } else {
      hide(els.loadingState);
      els.generateBtn.disabled = false;
    }
  }

  function showError(msg) {
    hide(els.emptyState);
    hide(els.loadingState);
    hide(els.resultGrid);
    hideMergeInfo();
    show(els.errorState);
    els.errorMsg.textContent = msg || "未知错误";
  }

  function hideError() {
    hide(els.errorState);
  }

  function hideResults() {
    hide(els.resultGrid);
    hide(els.resultMeta);
    hideMergeInfo();
    show(els.emptyState);
  }

  function displayResults(images, requestBody, meta, lastMergeInfo) {
    hide(els.emptyState);
    hide(els.errorState);

    const styleNames = {
      vertical: "韩漫小清新风",
      comicDoujin: "漫画同人风",
      r18: "2.5D唯美风",
      lolita25d: "2.5D唯美风（萝）",
      anime: "本子里番风",
      galgame: "GalGame风",
      custom: "自定义",
    };
    const kindLabel = isGptModel(requestBody.model)
      ? "gpt-image"
      : requestBody.call_format === "openai"
        ? "OpenAI"
        : "NAI直连";
    const styleLabel = isGptModel(requestBody.model)
      ? ""
      : `${styleNames[requestBody.style] || requestBody.style} · `;
    const sizeLabel = isGptModel(requestBody.model) ? requestBody.size : sizeDisplayName(requestBody.size);
    const elapsed = meta && meta.elapsed_ms ? ` · ${(meta.elapsed_ms / 1000).toFixed(1)}s` : "";
    const metaText = `${styleLabel}${sizeLabel} · ${images.length} UNIT · ${kindLabel}${elapsed}`;
    setBadge(els.resultMeta, metaText, "badge-tech-success");
    show(els.resultMeta);

    lastResult = { images, body: requestBody, meta, mergeInfo: lastMergeInfo };

    els.resultGrid.innerHTML = "";
    els.resultGrid.className = "result-grid";

    if (images.length > 1) {
      els.resultGrid.classList.add(images.length === 2 ? "cols-2" : "cols-4");
    }

    images.forEach((item, idx) => {
      const b64 = item.b64_json || item.b64 || item;
      const ext = item.ext || "png";
      const wrap = document.createElement("div");
      wrap.className = "result-item";

      const label = document.createElement("span");
      label.className = "result-item-label";
      label.textContent = `${idx + 1} / ${images.length}`;
      wrap.appendChild(label);

      const img = document.createElement("img");
      img.src = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,` + b64;
      img.alt = `生成结果 ${idx + 1}`;
      img.addEventListener("click", () => openLightbox(img.src));
      wrap.appendChild(img);

      const actions = document.createElement("div");
      actions.className = "result-item-actions";

      const dlBtn = document.createElement("button");
      dlBtn.className = "result-item-action";
      dlBtn.textContent = "下载";
      dlBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        downloadImage(b64, ext, idx + 1);
      });
      actions.appendChild(dlBtn);

      const upBtn = document.createElement("button");
      upBtn.className = "result-item-action";
      upBtn.textContent = "传到图库";
      upBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        uploadToGallery(b64, ext, idx + 1, images.length, upBtn);
      });
      actions.appendChild(upBtn);

      wrap.appendChild(actions);
      els.resultGrid.appendChild(wrap);
    });

    show(els.resultGrid);
  }

  // ===== 图片放大 =====
  function openLightbox(src) {
    const lb = document.createElement("div");
    lb.className = "lightbox";
    const img = document.createElement("img");
    img.src = src;
    img.addEventListener("click", (e) => e.stopPropagation());
    lb.appendChild(img);
    lb.addEventListener("click", () => lb.remove());
    document.body.appendChild(lb);
  }

  function downloadImage(b64, ext, index) {
    const link = document.createElement("a");
    link.href = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,` + b64;
    link.download = `aitag_studio_${Date.now()}_${index}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ===== 传到图库（走 /api/upload，自动带生成参数 meta） =====
  async function uploadToGallery(b64, ext, index, total, btn) {
    if (btn.disabled) return;
    const body = lastResult.body || {};
    const meta = lastResult.meta || {};
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "上传中...";
    try {
      // base64 → File
      const byteStr = atob(b64);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const file = new File([bytes], `studio_${Date.now()}_${index}.${ext}`, {
        type: `image/${ext === "jpg" ? "jpeg" : ext}`,
      });

      const form = new FormData();
      form.append("files", file);
      form.append("ai_type", isGptModel(body.model) ? "other" : "nai");
      // 标题用站点默认(作品 <id 前 6 位>),不拿提示词当标题
      form.append("title", "");
      // 参数 meta：图库详情页按 NAI 格式渲染（gpt-image 模型名附画质信息）
      const wh = String(body.size || "").match(/^(\d+)x(\d+)$/);
      const modelLabel = isGptModel(body.model)
        ? `${body.model} · quality=${body.quality || "auto"} · ${body.size}`
        : body.model || "";
      form.append(
        "meta_0",
        JSON.stringify({
          _format: "nai",
          prompt: (lastResult.mergeInfo && lastResult.mergeInfo.full_prompt) || body.nai_prompt || "",
          uc: body.negative || "",
          model: modelLabel,
          sampler: isGptModel(body.model) ? "gpt-image" : body.sampler || "",
          steps: isGptModel(body.model) ? null : Number(body.steps) || null,
          scale: isGptModel(body.model) ? null : Number(body.scale) || null,
          width: wh ? Number(wh[1]) : null,
          height: wh ? Number(wh[2]) : null,
          seed: typeof body.seed === "number" && body.seed >= 0 ? body.seed : null,
        })
      );

      const resp = await fetch("/api/upload", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || !data.ok) {
        throw new Error((data && data.error) || `上传失败 HTTP ${resp.status}`);
      }
      const workId = (data.ids && data.ids[0]) || data.id;
      btn.textContent = "✓ 已入库";
      if (workId) {
        // 站内跳转：顶层级窗口打开详情页
        window.open(`/i/${workId}`, "_blank");
      }
    } catch (err) {
      btn.textContent = prevText;
      btn.disabled = false;
      showError(`传到图库失败：${err?.message || err}`);
    }
  }

  // ===== 重置参数 =====
  function resetParams() {
    els.naiPrompt.value = "";
    els.nlPrompt.value = "";
    els.sampler.value = "k_dpmpp_2m_sde";
    els.steps.value = "24";
    els.scale.value = "6";
    els.cfg.value = "7";
    els.noiseSchedule.value = "karras";
    els.model.value = "nai-diffusion-4-5-full";
    els.style.value = "vertical";
    updateSizeOptionsUI();
    els.size.value = "竖图";
    els.count.value = "1";
    els.negative.value = "";
    els.customArtists.value = "";
    clearReferenceImage();
    els.refStrength.value = "0.7";
    els.refMode.value = "vibe";
    els.refNoise.value = "0.7";
    els.openaiSeed.value = "-1";
    els.directorAction.value = "";
    if (els.gptQuality) els.gptQuality.value = "auto";
    if (els.gptBackground) els.gptBackground.value = "auto";
    if (els.gptOutputFormat) els.gptOutputFormat.value = "png";
    clearCharRows();
    toggleCustomArtists();
    setCallFormat("direct");
    saveCache();
  }

  // ===== 调用格式切换（NAI 直连 / OpenAI 兼容） =====
  function initFormatToggle() {
    formatToggleBtns = Array.from(
      els.callFormat.querySelectorAll(".format-toggle-btn")
    );
    formatToggleBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var fmt = btn.getAttribute("data-format");
        if (fmt === currentCallFormat) return;
        setCallFormat(fmt);
        saveCache();
      });
    });
  }

  function setCallFormat(fmt) {
    currentCallFormat = fmt;
    formatToggleBtns.forEach(function (btn) {
      var active = btn.getAttribute("data-format") === fmt;
      btn.classList.toggle("active", active);
    });
    var openai = fmt === "openai";
    if (openai) {
      show(els.refUploadWrap);
      show(els.refModeWrap);
      show(els.openaiSeedWrap);
      show(els.directorActionWrap);
      show(els.charListWrap);
      if (els.openaiConfigStatus) show(els.openaiConfigStatus);
      els.callFormatHint.textContent =
        "请求按 OpenAI 兼容格式发往配置的 /v1/images 端点（api.syuan.org），支持 NAI 全系、gpt-image、参考图与图片处理动作。";
    } else {
      hide(els.refUploadWrap);
      hide(els.refStrengthWrap);
      hide(els.refModeWrap);
      hide(els.refNoiseWrap);
      hide(els.openaiSeedWrap);
      hide(els.directorActionWrap);
      hide(els.charListWrap);
      if (els.openaiConfigStatus) hide(els.openaiConfigStatus);
      els.callFormatHint.textContent =
        "直连 nai.sta1n.cn 原生接口生成（画师串走独立 artist 参数，支持 CFG Rescale）。";
    }
    applyRefModeUI();
    updateModelOptionsUI();
    updateSizeOptionsUI();
    applyModelKindUI();
  }

  function handleReferenceFileChange() {
    if (!els.refFile || !els.refFile.files) return;
    addRefImages(els.refFile.files);
    // 允许再次选择同一批文件
    els.refFile.value = "";
  }

  // ===== 载入默认负面词 =====
  async function loadDefaultNegative() {
    try {
      if (panelConfig && panelConfig.default_negative) {
        els.negative.value = panelConfig.default_negative;
      } else {
        const resp = await apiGet("/api/studio/config");
        panelConfig = resp;
        els.negative.value = resp.default_negative || fallbackDefaultNegative();
      }
    } catch (e) {
      fallbackDefaultNegative();
    }
    saveCache();
  }

  function fallbackDefaultNegative() {
    els.negative.value =
      "{{bad anatomy}},{bad feet},bad hands,{{{bad proportions}}},{blurry},cloned face,cropped," +
      "{{{deformed}}},{{{disfigured}}},error,{{{extra arms}}},{extra digit},{{{extra legs}}},extra limbs," +
      "{{extra limbs}},{fewer digits},{{{fused fingers}}},gross proportions,ink eyes,ink hair," +
      "jpeg artifacts,{{{{long neck}}}},low quality,{malformed limbs},{{missing arms}},{missing fingers}," +
      "{{missing legs}},{{{more than 2 nipples}}},mutated hands,{{{mutation}}},normal quality,owres," +
      "{{poorly drawn face}},{{poorly drawn hands}},reen eyes,signature,text,{{too many fingers}}," +
      "{{{ugly}}},username,uta,watermark,worst quality,{{{more than 2 legs}}}";
    return els.negative.value;
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    els.model.addEventListener("change", () => {
      updateSizeOptionsUI();
      applyModelKindUI();
      saveCache();
    });
    els.style.addEventListener("change", toggleCustomArtists);
    initFormatToggle();
    els.refFile.addEventListener("change", handleReferenceFileChange);
    els.refRemove.addEventListener("click", clearReferenceImage);
    if (els.refMode) {
      els.refMode.addEventListener("change", () => {
        applyRefModeUI();
        renderRefGrid();
        saveCache();
      });
    }
    if (els.charAdd) {
      els.charAdd.addEventListener("click", () => {
        addCharRow();
        saveCache();
      });
    }
    els.generateBtn.addEventListener("click", generate);
    els.resetBtn.addEventListener("click", resetParams);
    els.retryBtn.addEventListener("click", () => {
      if (lastRequestBody) {
        hideError();
        generate();
      }
    });
    els.loadDefaultNegative.addEventListener("click", loadDefaultNegative);
    const goBtn = $("goProfileBtn");
    if (goBtn) goBtn.addEventListener("click", goProfile);

    // 所有表单字段变更时自动缓存
    getCachedFields().forEach((key) => {
      const el = els[key];
      if (el) {
        el.addEventListener("input", saveCache);
        el.addEventListener("change", saveCache);
      }
    });

    // Ctrl+Enter 快捷生成
    [els.naiPrompt, els.nlPrompt].forEach((ta) => {
      ta.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          generate();
        }
      });
    });
  }

  // ===== 初始化 =====
  async function init() {
    console.log(
      "%c AITAG STUDIO %c VISUAL SYNTHESIS TERMINAL INITIALIZED ",
      "background: #fff500; color: #101110; font-weight: bold; padding: 2px 4px; border-radius: 4px;",
      "background: #e8e8e2; color: #101110; padding: 2px 4px; border-radius: 4px;"
    );
    initContourEngine();

    bindEvents();
    loadCache();
    updateSizeOptionsUI();
    toggleCustomArtists();
    setCallFormat(currentCallFormat);
    await loadTokenStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
