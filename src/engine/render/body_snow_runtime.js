import { cubicBezierScalar } from "./layout_math.js";
import {
  BODY_SNOW_CANVAS_ID,
  getBodySnowLayerSpec,
  getBodySnowParticleBudget,
  getBodySnowRefArea,
  resolveBodySnowPreset,
  resolveBodySnowReduceMotion,
} from "./body_snow_config.js";

let _bodySnowState = null;
let _bodySnowLastStopReason = "not-started";

function getBodySnowRuntimeConfig() {
  const { perfMode, scale, densityMul } = resolveBodySnowPreset();
  return {
    reduceMotion: resolveBodySnowReduceMotion(),
    perfMode,
    scale,
    densityMul
  };
}

function createLayerSpec(profileId, layerId) {
  return getBodySnowLayerSpec(profileId, layerId);
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function randSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

function computeLayerCount(spec, internalW, internalH, densityMul, remainingCap) {
  const refArea = getBodySnowRefArea();
  const area = Math.max(1, internalW * internalH);
  const scaled = Math.round(spec.baseCount * (area / refArea) * densityMul * 0.85);
  return Math.max(6, Math.min(Math.max(0, remainingCap), scaled));
}

function assignNewDriftSegment(particle, spec, globalWindBias = 0) {
  const prevDelta = Number(particle.segDeltaX || 0);
  const duration = randRange(spec.segMinSec, spec.segMaxSec);

  let delta = randRange(spec.deltaMin, spec.deltaMax) * randSign();
  delta += globalWindBias;

  if (prevDelta !== 0 && Math.sign(prevDelta) !== Math.sign(delta)) {
    const prevAbs = Math.abs(prevDelta);
    const curAbs = Math.abs(delta);
    if (prevAbs > spec.deltaMax * 0.68 && curAbs > spec.deltaMax * 0.68) {
      delta *= 0.5;
    }
  }

  const absDelta = Math.max(0.5, Math.abs(delta));
  const c1Mag = Math.min(absDelta * 0.6, absDelta * randRange(0.2, 0.6));
  const c2Mag = Math.min(absDelta * 0.6, absDelta * randRange(0.2, 0.6));
  const c1 = c1Mag * randSign();
  const c2 = c2Mag * randSign();

  particle.segStartX = particle.x;
  particle.segDeltaX = delta;
  particle.c1 = c1;
  particle.c2 = c2;
  particle.segDuration = duration;
  particle.segTime = 0;
}

function createSnowParticle(spec, internalW, internalH, topOnly = false) {
  const size = spec.id === 3
    ? (Math.random() < 0.12 ? 3 : 2)
    : (spec.sizeMin === spec.sizeMax ? spec.sizeMin : (Math.random() < 0.65 ? 1 : 2));
  const particle = {
    x: randRange(0, internalW),
    y: topOnly ? randRange(-internalH, 0) : randRange(-internalH, internalH),
    prevX: 0,
    prevY: 0,
    vy: randRange(spec.vyMin, spec.vyMax),
    size,
    alpha: randRange(spec.alphaMin, spec.alphaMax),
    layerId: spec.id,
    phase: randRange(0, Math.PI * 2),
    driftSeed: Math.random(),
    segStartX: 0,
    segDeltaX: 0,
    c1: 0,
    c2: 0,
    segDuration: 1.2,
    segTime: 0
  };
  particle.prevX = particle.x;
  particle.prevY = particle.y;
  assignNewDriftSegment(particle, spec, 0);
  return particle;
}

function recreateBodySnowParticles(state, resetTopOnly = false) {
  const { internalW, internalH, densityMul, profileId } = state;
  const specs = [createLayerSpec(profileId, 1), createLayerSpec(profileId, 2), createLayerSpec(profileId, 3)];
  const maxTotal = getBodySnowParticleBudget(profileId);
  let remaining = maxTotal;
  state.layers = specs.map((spec) => {
    const count = computeLayerCount(spec, internalW, internalH, densityMul, remaining);
    remaining = Math.max(0, remaining - count);
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push(createSnowParticle(spec, internalW, internalH, resetTopOnly));
    }
    return { spec, particles };
  });
}

function drawBodySnowFrame(state, alpha = 1) {
  const { ctx, internalW, internalH, layers } = state;
  const t = Math.max(0, Math.min(1, Number(alpha) || 0));
  ctx.clearRect(0, 0, internalW, internalH);

  for (const layer of layers) {
    for (const particle of layer.particles) {
      const rx = particle.prevX + (particle.x - particle.prevX) * t;
      const ry = particle.prevY + (particle.y - particle.prevY) * t;
      const px = Math.round(rx);
      const py = Math.round(ry);
      if (px < -4 || py < -4 || px > internalW + 4 || py > internalH + 4) continue;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0.05, Math.min(1, particle.alpha)).toFixed(3)})`;
      ctx.fillRect(px, py, particle.size, particle.size);
    }
  }
}

function stepBodySnow(state, dtSec, nowMs) {
  const dt = Math.max(0.001, Math.min(0.05, dtSec));
  const frameFactor = dt * 60;
  const { internalW, internalH, layers } = state;

  const globalWindBase = Math.sin(nowMs * 0.0007) * 0.35;
  const margin = 10;

  for (const layer of layers) {
    const spec = layer.spec;
    const globalWindBias = globalWindBase * spec.windWeight;
    for (const particle of layer.particles) {
      particle.prevX = particle.x;
      particle.prevY = particle.y;
      particle.y += particle.vy * frameFactor;

      particle.segTime += dt;
      const u = Math.max(0, Math.min(1, particle.segTime / Math.max(0.001, particle.segDuration)));
      const dx = cubicBezierScalar(0, particle.c1, particle.c2, particle.segDeltaX, u);
      particle.x = particle.segStartX + dx;

      if (u >= 1) {
        particle.segStartX = particle.x;
        assignNewDriftSegment(particle, spec, globalWindBias);
      }

      if (particle.y > internalH + margin) {
        particle.y = -margin;
        particle.x = randRange(0, internalW);
        particle.prevX = particle.x;
        particle.prevY = particle.y;
        particle.phase = randRange(0, Math.PI * 2);
        particle.driftSeed = Math.random();
        assignNewDriftSegment(particle, spec, globalWindBias);
      }

      if (particle.x < 0) particle.x += internalW;
      if (particle.x >= internalW) particle.x -= internalW;
    }
  }
}

function stopBodySnowLoop(state) {
  if (!state) return;
  if (state.rafId != null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

function setupBodySnowCanvas(state) {
  const cfg = getBodySnowRuntimeConfig();
  state.reduceMotion = cfg.reduceMotion;
  state.perfMode = cfg.perfMode;
  state.scale = cfg.scale;
  state.densityMul = cfg.densityMul;

  const viewW = Math.max(1, window.innerWidth);
  const viewH = Math.max(1, window.innerHeight);
  state.internalW = Math.max(80, Math.floor(viewW / state.scale));
  state.internalH = Math.max(50, Math.floor(viewH / state.scale));

  state.canvas.width = state.internalW;
  state.canvas.height = state.internalH;
  state.canvas.style.width = `${viewW}px`;
  state.canvas.style.height = `${viewH}px`;

  state.ctx.imageSmoothingEnabled = false;
  recreateBodySnowParticles(state, true);
  drawBodySnowFrame(state, 1);
}

function startBodySnowLoop(state) {
  stopBodySnowLoop(state);
  state.lastTs = null;
  state.accum = 0;
  const stepSec = 1 / 45;
  const stepMs = stepSec * 1000;

  const tick = (ts) => {
    if (!_bodySnowState || _bodySnowState !== state) return;
    if (state.lastTs == null) state.lastTs = ts;
    const deltaMs = Math.max(0, ts - state.lastTs);
    state.lastTs = ts;
    state.accum = Math.min(250, state.accum + deltaMs);

    while (state.accum >= stepMs) {
      stepBodySnow(state, stepSec, ts);
      state.accum -= stepMs;
    }

    const alpha = state.accum / stepMs;
    drawBodySnowFrame(state, alpha);
    state.rafId = requestAnimationFrame(tick);
  };

  state.rafId = requestAnimationFrame(tick);
}

function destroyBodySnow(reason = "destroy") {
  if (!_bodySnowState) {
    _bodySnowLastStopReason = reason;
    return;
  }

  stopBodySnowLoop(_bodySnowState);
  if (typeof _bodySnowState.resizeHandler === "function") {
    window.removeEventListener("resize", _bodySnowState.resizeHandler);
  }
  if (_bodySnowState.canvas && _bodySnowState.canvas.parentNode) {
    _bodySnowState.canvas.parentNode.removeChild(_bodySnowState.canvas);
  }
  _bodySnowState = null;
  _bodySnowLastStopReason = reason;
}

function ensureBodySnowRuntime(request = {}) {
  const host = document.body;
  if (!host) return null;

  const cfg = getBodySnowRuntimeConfig();
  const profileId = String(request.profileId || "default").trim().toLowerCase() || "default";
  const activeMapId = String(request.activeMapId || "").trim() || null;
  const activeSurfaceKey = String(request.surfaceKey || "default").trim().toLowerCase() || "default";

  if (!_bodySnowState) {
    const canvas = document.createElement("canvas");
    canvas.id = BODY_SNOW_CANVAS_ID;
    host.appendChild(canvas);

    _bodySnowState = {
      canvas,
      ctx: canvas.getContext("2d", { alpha: true }),
      layers: [],
      rafId: null,
      lastTs: null,
      accum: 0,
      internalW: 0,
      internalH: 0,
      scale: cfg.scale,
      perfMode: cfg.perfMode,
      densityMul: cfg.densityMul,
      reduceMotion: cfg.reduceMotion,
      resizeHandler: null,
      activeMapId,
      activeSurfaceKey,
      profileId
    };

    _bodySnowState.resizeHandler = () => {
      if (_bodySnowState) {
        setupBodySnowCanvas(_bodySnowState);
      }
    };
    window.addEventListener("resize", _bodySnowState.resizeHandler);
    setupBodySnowCanvas(_bodySnowState);
  }

  if (_bodySnowState.canvas.parentNode !== host) {
    host.appendChild(_bodySnowState.canvas);
  }

  const configChanged =
    _bodySnowState.scale !== cfg.scale
    || _bodySnowState.perfMode !== cfg.perfMode
    || _bodySnowState.densityMul !== cfg.densityMul
    || _bodySnowState.profileId !== profileId;

  if (configChanged || _bodySnowState.internalW <= 0 || _bodySnowState.internalH <= 0) {
    _bodySnowState.profileId = profileId;
    setupBodySnowCanvas(_bodySnowState);
  }

  _bodySnowState.reduceMotion = cfg.reduceMotion;
  _bodySnowState.activeMapId = activeMapId;
  _bodySnowState.activeSurfaceKey = activeSurfaceKey;
  _bodySnowState.profileId = profileId;
  _bodySnowLastStopReason = "running";

  if (_bodySnowState.reduceMotion) {
    stopBodySnowLoop(_bodySnowState);
    drawBodySnowFrame(_bodySnowState);
  } else if (_bodySnowState.rafId == null) {
    startBodySnowLoop(_bodySnowState);
  }

  return getBodySnowRuntimeSnapshot();
}

export function syncBodySnowRuntime(request = {}) {
  if (request?.shouldRun === true) {
    return ensureBodySnowRuntime(request);
  }

  const stopReason = String(request?.stopReason || "inactive-surface").trim() || "inactive-surface";
  destroyBodySnow(stopReason);
  return getBodySnowRuntimeSnapshot();
}

export function stopBodySnowRuntime(reason = "manual-stop") {
  destroyBodySnow(reason);
}

export function getBodySnowRuntimeSnapshot() {
  if (!_bodySnowState) {
    return {
      active: false,
      reason: _bodySnowLastStopReason,
      canvasId: BODY_SNOW_CANVAS_ID,
      parentTag: null,
      internalW: 0,
      internalH: 0,
      scale: null,
      perfMode: null,
      densityMul: null,
      reduceMotion: null,
      particleCounts: [],
      totalParticles: 0,
      activeMapId: null,
      activeSurfaceKey: null,
      profileId: null
    };
  }

  const particleCounts = _bodySnowState.layers.map((layer, index) => ({
    index,
    count: Array.isArray(layer?.particles) ? layer.particles.length : 0,
    layerId: layer?.spec?.id ?? null
  }));

  return {
    active: true,
    reason: _bodySnowLastStopReason,
    canvasId: BODY_SNOW_CANVAS_ID,
    parentTag: _bodySnowState.canvas?.parentElement?.tagName || null,
    internalW: _bodySnowState.internalW,
    internalH: _bodySnowState.internalH,
    scale: _bodySnowState.scale,
    perfMode: _bodySnowState.perfMode,
    densityMul: _bodySnowState.densityMul,
    reduceMotion: _bodySnowState.reduceMotion,
    particleCounts,
    totalParticles: particleCounts.reduce((sum, item) => sum + item.count, 0),
    activeMapId: _bodySnowState.activeMapId || null,
    activeSurfaceKey: _bodySnowState.activeSurfaceKey || null,
    profileId: _bodySnowState.profileId || null
  };
}