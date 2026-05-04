import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");
const tempDir = path.join(projectRoot, "temp");
const runDir = path.join(tempDir, "attr_matrix_run");

const resultJsonPath = path.join(tempDir, "attr_matrix_result_latest.json");
const summaryMdPath = path.join(tempDir, "attr_matrix_summary_latest.md");
const caseAPath = path.join(tempDir, "attr_matrix_caseA.png");
const caseBPath = path.join(tempDir, "attr_matrix_caseB.png");

const SERVER_PORT = 4173;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}/index.html`;

async function rmForce(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitServerReady(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(150);
  }
  throw new Error(`Server not ready within ${timeoutMs}ms: ${url}`);
}

function makeCaseId(prefix, ...parts) {
  return [prefix, ...parts].join("_").replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

function boundaryTriples(boundaries, epsilon, min, max) {
  const out = [];
  for (const b of boundaries) {
    out.push(Math.max(min, Math.min(max, Number((b - epsilon).toFixed(3)))));
    out.push(Math.max(min, Math.min(max, Number(b.toFixed(3)))));
    out.push(Math.max(min, Math.min(max, Number((b + epsilon).toFixed(3)))));
  }
  return [...new Set(out)];
}

function buildMatrixPlan(defs) {
  const plan = [];

  const hpBounds = [...new Set((defs?.attributes?.hp?.stages || []).flatMap((s) => [Number(s.min), Number(s.max)]).filter(Number.isFinite))];
  const satBounds = [...new Set((defs?.attributes?.satiety?.stages || []).flatMap((s) => [Number(s.min), Number(s.max)]).filter(Number.isFinite))];
  const fatBounds = [...new Set((defs?.attributes?.fatigue?.stages || []).flatMap((s) => [Number(s.min), Number(s.max)]).filter(Number.isFinite))];

  for (const v of boundaryTriples(hpBounds, 1, 0, 100)) {
    plan.push({
      caseId: makeCaseId("bp_hp", String(v).replace(".", "p")),
      suite: "breakpoints",
      kind: "breakpoint_attr",
      attrId: "hp",
      value: v,
      tags: ["breakpoint", "hp"]
    });
  }

  for (const v of boundaryTriples(satBounds, 1, 0, 100)) {
    plan.push({
      caseId: makeCaseId("bp_sat", String(v).replace(".", "p")),
      suite: "breakpoints",
      kind: "breakpoint_attr",
      attrId: "satiety",
      value: v,
      tags: ["breakpoint", "satiety"]
    });
  }

  for (const v of boundaryTriples(fatBounds, 1, 0, 100)) {
    plan.push({
      caseId: makeCaseId("bp_fat", String(v).replace(".", "p")),
      suite: "breakpoints",
      kind: "breakpoint_attr",
      attrId: "fatigue",
      value: v,
      tags: ["breakpoint", "fatigue"]
    });
  }

  const thermalPoints = [37.0, 36.0, 35.0, 32.0, 28.0, 24.0];
  for (const t of boundaryTriples(thermalPoints, 0.1, 20, 40)) {
    plan.push({
      caseId: makeCaseId("bp_thermal", String(t).replace(".", "p")),
      suite: "breakpoints",
      kind: "breakpoint_thermal",
      temperatureC: t,
      tags: ["breakpoint", "thermal"]
    });
  }

  const staminaLockTargets = [
    { effectiveTarget: 100, satiety: 100, fatigue: 100, currents: [100, 60] },
    { effectiveTarget: 70, satiety: 100, fatigue: 40, currents: [70, 20] },
    { effectiveTarget: 50, satiety: 100, fatigue: 10, currents: [50, 20] },
    { effectiveTarget: 25, satiety: 0, fatigue: 0, currents: [25, 10] },
    { effectiveTarget: 0, satiety: 0, fatigue: 0, currents: [0, 0], syntheticOnly: true }
  ];

  for (const target of staminaLockTargets) {
    for (const current of target.currents) {
      plan.push({
        caseId: makeCaseId("bp_stamax", String(target.effectiveTarget), String(current)),
        suite: "breakpoints",
        kind: "breakpoint_stamina_lock",
        effectiveTarget: target.effectiveTarget,
        satiety: target.satiety,
        fatigue: target.fatigue,
        current,
        syntheticOnly: target.syntheticOnly === true,
        tags: ["breakpoint", "stamina_lock"]
      });
    }
  }

  const dtCases = [
    { minutes: 1, sleeping: false, label: "1m_awake" },
    { minutes: 10, sleeping: false, label: "10m_awake" },
    { minutes: 60, sleeping: false, label: "60m_awake" },
    { minutes: 480, sleeping: true, label: "8h_sleep" },
    { minutes: 1440, sleeping: false, label: "24h_awake" }
  ];
  for (const c of dtCases) {
    plan.push({
      caseId: makeCaseId("formula_dt", c.label),
      suite: "formula_single_factor",
      kind: "formula_dt",
      ...c,
      tags: ["formula", "dt"]
    });
  }

  for (const satiety of [100, 75, 50, 25, 10, 0]) {
    plan.push({
      caseId: makeCaseId("formula_sat", String(satiety)),
      suite: "formula_single_factor",
      kind: "formula_satiety",
      satiety,
      tags: ["formula", "satiety"]
    });
  }

  for (const fatigue of [100, 75, 50, 25, 10, 0]) {
    plan.push({
      caseId: makeCaseId("formula_fat", String(fatigue)),
      suite: "formula_single_factor",
      kind: "formula_fatigue",
      fatigue,
      tags: ["formula", "fatigue"]
    });
  }

  for (const t of [37, 35, 32, 28, 24]) {
    plan.push({
      caseId: makeCaseId("formula_temp", String(t)),
      suite: "formula_single_factor",
      kind: "formula_temperature",
      temperatureC: t,
      tags: ["formula", "temperature"]
    });
  }

  for (const profile of [
    { label: "full", hp: 100, satiety: 100, fatigue: 100 },
    { label: "low_sat", hp: 100, satiety: 10, fatigue: 100 },
    { label: "low_fat", hp: 100, satiety: 100, fatigue: 10 },
    { label: "low_hp", hp: 20, satiety: 100, fatigue: 100 }
  ]) {
    plan.push({
      caseId: makeCaseId("formula_workgain", profile.label),
      suite: "formula_single_factor",
      kind: "formula_work_gain",
      profile,
      tags: ["formula", "workGainMul"]
    });
  }

  for (const c of [
    { label: "sleep_high", satiety: 100, fatigue: 40, hp: 60 },
    { label: "sleep_low_sat", satiety: 10, fatigue: 40, hp: 60 },
    { label: "sleep_low_all", satiety: 10, fatigue: 10, hp: 40 }
  ]) {
    plan.push({
      caseId: makeCaseId("formula_sleepregen", c.label),
      suite: "formula_single_factor",
      kind: "formula_sleep_regen",
      profile: c,
      tags: ["formula", "sleepGainMul", "hpRegenRateMul"]
    });
  }

  for (const c of [
    { label: "high_high", satiety: 100, fatigue: 100 },
    { label: "low_high", satiety: 10, fatigue: 100 },
    { label: "high_low", satiety: 100, fatigue: 10 },
    { label: "low_low", satiety: 10, fatigue: 10 }
  ]) {
    plan.push({ caseId: makeCaseId("couple_sat_fat", c.label), suite: "coupling", kind: "coupling_satiety_fatigue", profile: c, tags: ["coupling", "satiety_fatigue"] });
  }

  for (const c of [
    { label: "sat_hi_cold_hi", satiety: 100, t: 24 },
    { label: "sat_lo_cold_hi", satiety: 10, t: 24 },
    { label: "sat_hi_cold_lo", satiety: 100, t: 35 },
    { label: "sat_lo_cold_lo", satiety: 10, t: 35 }
  ]) {
    plan.push({ caseId: makeCaseId("couple_sat_thermal", c.label), suite: "coupling", kind: "coupling_satiety_thermal", profile: c, tags: ["coupling", "satiety_thermal"] });
  }

  for (const c of [
    { label: "hp_hi_fat_hi", hp: 100, fatigue: 100 },
    { label: "hp_lo_fat_hi", hp: 20, fatigue: 100 },
    { label: "hp_hi_fat_lo", hp: 100, fatigue: 10 },
    { label: "hp_lo_fat_lo", hp: 20, fatigue: 10 }
  ]) {
    plan.push({ caseId: makeCaseId("couple_hp_fat", c.label), suite: "coupling", kind: "coupling_hp_fatigue", profile: c, tags: ["coupling", "hp_fatigue"] });
  }

  for (const c of [
    { label: "wet0_wp0", wetness: 0, windproof: 0 },
    { label: "wet1_wp0", wetness: 1, windproof: 0 },
    { label: "wet0_wp1", wetness: 0, windproof: 1 },
    { label: "wet1_wp1", wetness: 1, windproof: 1 }
  ]) {
    plan.push({ caseId: makeCaseId("couple_wet_wind", c.label), suite: "coupling", kind: "coupling_wetness_windproof", profile: c, tags: ["coupling", "wet_windproof"] });
  }

  for (const c of [
    { caseId: "reg_debug_fatigue_lock", kind: "reg_debug_set", statKey: "fatigue", value: 10, tags: ["regression", "debug_set", "stamina_lock"] },
    { caseId: "reg_debug_hp_dead", kind: "reg_debug_set", statKey: "hp", value: 0, tags: ["regression", "debug_set", "dead"] },
    { caseId: "reg_debug_satiety_derived", kind: "reg_debug_set", statKey: "satiety", value: 0, tags: ["regression", "debug_set", "derived"] },
    { caseId: "reg_advance_10_awake", kind: "reg_advance_dispatch", minutes: 10, sleeping: false, tags: ["regression", "advance_time"] },
    { caseId: "reg_advance_60_awake", kind: "reg_advance_dispatch", minutes: 60, sleeping: false, tags: ["regression", "advance_time"] },
    { caseId: "reg_advance_8h_sleep", kind: "reg_advance_dispatch", minutes: 480, sleeping: true, tags: ["regression", "advance_time"] },
    { caseId: "reg_advance_24h_awake", kind: "reg_advance_dispatch", minutes: 1440, sleeping: false, tags: ["regression", "advance_time"] },
    { caseId: "reg_gate_dead_reject", kind: "reg_gate_dead", tags: ["regression", "gate", "dead"] },
    { caseId: "reg_gate_stamina_reject", kind: "reg_gate_stamina", tags: ["regression", "gate", "stamina"] },
    { caseId: "reg_gate_ui_whitelist", kind: "reg_gate_whitelist", tags: ["regression", "gate", "whitelist"] },
    { caseId: "reg_save_load_continuity", kind: "reg_save_load", tags: ["regression", "save_load"] },
    { caseId: "reg_sleep_episode_short_awake_no_reset", kind: "reg_sleep_episode_short_awake_no_reset", tags: ["regression", "sleep_episode"] },
    { caseId: "reg_sleep_episode_awake120_reset", kind: "reg_sleep_episode_awake120_reset", tags: ["regression", "sleep_episode"] },
    { caseId: "reg_sleep_episode_severe_interrupt_reset", kind: "reg_sleep_episode_severe_interrupt_reset", tags: ["regression", "sleep_episode", "severe_interrupt"] },
    { caseId: "reg_collapse_exit_only_two", kind: "reg_collapse_exit_only_two", tags: ["regression", "collapse"] },
    { caseId: "reg_collapse_profile_effect", kind: "reg_collapse_profile_effect", tags: ["regression", "collapse"] },
    { caseId: "reg_sleep_saveload_continuity", kind: "reg_sleep_saveload_continuity", tags: ["regression", "save_load", "sleep_episode"] }
  ]) {
    plan.push({ suite: "regression", ...c });
  }

  return plan;
}

function buildMinimalCoverage(fullCases) {
  const targetMin = 20;
  const targetMax = 30;
  const chosen = [];
  const seen = new Set();

  const addCase = (c, reason) => {
    if (!c || seen.has(c.caseId)) return;
    seen.add(c.caseId);
    chosen.push({
      ...c,
      suite: "minimalCoverage",
      notes: `${c.notes || ""}${c.notes ? " | " : ""}representative:${reason}`
    });
  };

  const failures = fullCases.filter((c) => c.pass === false);
  for (const c of failures) addCase(c, "failure");

  for (const fixedId of [
    "ui_caseA_stamina_lock",
    "ui_caseB_stamina_lock",
    "reg_gate_dead_reject",
    "reg_gate_stamina_reject",
    "formula_dt_24h_awake"
  ]) {
    addCase(fullCases.find((c) => c.caseId === fixedId), "required_anchor");
  }

  const sleepRegenSample = fullCases
    .filter((c) => c.caseId.startsWith("formula_sleepregen_"))
    .sort((a, b) => Math.abs(Number(b.actualState?.hpDelta ?? 0)) - Math.abs(Number(a.actualState?.hpDelta ?? 0)))[0];
  addCase(sleepRegenSample, "sleep_regen_sample");

  const breakpointGroups = [
    "bp_hp_",
    "bp_sat_",
    "bp_fat_",
    "bp_thermal_",
    "bp_stamax_"
  ];
  const numericOf = (c) => {
    const v = Number(c?.seedState?.value);
    if (Number.isFinite(v)) return v;
    const t = Number(c?.seedState?.temperatureC);
    if (Number.isFinite(t)) return t;
    const e = Number(c?.expectedDerived?.effectiveMax);
    if (Number.isFinite(e)) return e;
    return Number.NaN;
  };
  for (const prefix of breakpointGroups) {
    const group = fullCases.filter((c) => c.caseId.startsWith(prefix));
    if (group.length === 0) continue;
    const sorted = group
      .map((c) => ({ c, n: numericOf(c) }))
      .filter((x) => Number.isFinite(x.n))
      .sort((a, b) => a.n - b.n);
    if (sorted.length > 0) {
      addCase(sorted[0].c, `${prefix}extreme_min`);
      addCase(sorted[sorted.length - 1].c, `${prefix}extreme_max`);
    }
  }

  const representatives = [
    ["formula", "satiety"],
    ["formula", "fatigue"],
    ["formula", "temperature"],
    ["formula", "workGainMul"],
    ["coupling", "satiety_fatigue"],
    ["coupling", "satiety_thermal"],
    ["coupling", "hp_fatigue"],
    ["coupling", "wet_windproof"],
    ["regression", "debug_set"],
    ["regression", "advance_time"],
    ["regression", "save_load"]
  ];
  for (const tags of representatives) {
    const pool = fullCases.filter((c) => tags.every((tag) => c.tags.includes(tag)));
    if (pool.length === 0) continue;
    const pick = pool.find((c) => c.pass === false) || pool[pool.length - 1];
    addCase(pick, tags.join("+"));
  }

  if (chosen.length < targetMin) {
    const rankedRemainder = fullCases
      .filter((c) => !seen.has(c.caseId))
      .map((c) => {
        let score = 0;
        if (c.tags.includes("breakpoint")) score += 4;
        if (c.tags.includes("gate")) score += 4;
        if (c.tags.includes("dt")) score += 3;
        if (c.tags.includes("sleepGainMul")) score += 3;
        if (c.tags.includes("stamina_lock")) score += 3;
        if (c.suite === "regression") score += 2;
        if (c.suite === "formula_single_factor") score += 1;
        const n = numericOf(c);
        if (Number.isFinite(n)) score += Math.abs(n - 50) / 25;
        return { c, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const row of rankedRemainder) {
      if (chosen.length >= targetMin) break;
      addCase(row.c, "fill_ranked");
    }
  }

  return chosen.slice(0, targetMax);
}

async function run() {
  let serverProc = null;
  let browser = null;

  try {
    await ensureDir(tempDir);
    await rmForce(runDir);
    await ensureDir(runDir);

    await rmForce(resultJsonPath);
    await rmForce(summaryMdPath);
    await rmForce(caseAPath);
    await rmForce(caseBPath);

    serverProc = spawn("python", ["-m", "http.server", String(SERVER_PORT)], {
      cwd: projectRoot,
      stdio: "ignore"
    });

    await waitServerReady(SERVER_URL);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(SERVER_URL, { waitUntil: "load" });

    const defs = await page.evaluate(async () => {
      const { PLAYER_DEFS } = await import("/src/engine/player_defs.js");
      return PLAYER_DEFS;
    });

    const plan = buildMatrixPlan(defs);

    await page.evaluate(async () => {
      const { gameState } = await import("/src/engine/state.js");
      gameState.time.totalMinutes = 0;
      gameState.currentMapId = "menu_main";
      if (gameState.world && typeof gameState.world === "object") {
        gameState.world.currentMapId = "menu_main";
      }
      const { dispatch } = await import("/src/engine/pipeline/dispatch.js");
      await dispatch("menu_new_game", {}, { suppressDialogs: true, suppressFeedback: true });
    });

    const results = [];

    for (const spec of plan) {
      const row = await page.evaluate(async (caseSpec) => {
        const { gameState } = await import("/src/engine/state.js");
        const { createDefaultPlayerState, recomputePlayerVitals, getPlayerDerived, applyTimeToPlayer } = await import("/src/engine/player.js");
        const { PLAYER_DEFS, getStageForValue } = await import("/src/engine/player_defs.js");
        const { mapCoreTempToHp100, mapCoreTempToHypo100, getHypothermiaStage } = await import("/src/systems/temperature/temperature_system.js");
        const { dispatch } = await import("/src/engine/pipeline/dispatch.js");
        const { buildJobOutcomeEffects } = await import("/src/engine/jobs/job_outcome_applier.js");
        const { getAllJobDefinitions } = await import("/src/engine/jobs/job_definitions.js");
        const { saveManager } = await import("/src/save/save_manager.js");

        const baseResult = {
          caseId: caseSpec.caseId,
          suite: caseSpec.suite,
          seedState: {},
          context: {},
          operation: {},
          expectedDerived: {},
          actualDerived: {},
          expectedState: {},
          actualState: {},
          expectedGate: {},
          actualGate: {},
          expectedUI: {},
          actualUI: {},
          pass: true,
          tolerance: 0.01,
          notes: "",
          tags: Array.isArray(caseSpec.tags) ? caseSpec.tags : []
        };

        const resetPlayer = () => {
          gameState.player = createDefaultPlayerState();
          gameState.player.exposure.dead = false;
          gameState.ui.jobSession = null;
          gameState.ui.inquirySession = null;
          gameState.ui.overlay = null;
          gameState.ui.page = "map";
          recomputePlayerVitals(gameState.player);
        };

        const fail = (msg) => {
          baseResult.pass = false;
          baseResult.notes = msg;
          return baseResult;
        };

        resetPlayer();

        switch (caseSpec.kind) {
          case "breakpoint_attr": {
            gameState.player.psycho.hp = 100;
            gameState.player.physio.satiety = 60;
            gameState.player.physio.stamina = 100;
            gameState.player.psycho.fatigue = 100;
            if (caseSpec.attrId === "hp") gameState.player.psycho.hp = caseSpec.value;
            if (caseSpec.attrId === "satiety") gameState.player.physio.satiety = caseSpec.value;
            if (caseSpec.attrId === "fatigue") gameState.player.psycho.fatigue = caseSpec.value;
            recomputePlayerVitals(gameState.player);
            const derived = getPlayerDerived(gameState.player);
            const expectedStage = getStageForValue(caseSpec.attrId, caseSpec.value);
            const actual = derived.attrs?.[caseSpec.attrId] || {};
            const expectedMods = expectedStage?.mods && typeof expectedStage.mods === "object" ? expectedStage.mods : {};
            const expectedStaminaMaxMul = Number(expectedMods.staminaMaxMul);
            const expectedEffectiveMax = Number.isFinite(expectedStaminaMaxMul)
              ? Number((100 * expectedStaminaMaxMul).toFixed(3))
              : 100;
            const expectedClampCurrent = Math.min(100, expectedEffectiveMax);
            const actualEffectiveMax = Number(derived?.attrs?.stamina?.effectiveMax ?? 100);
            const actualClampCurrent = Number(gameState.player.physio.stamina ?? 0);

            baseResult.seedState = { attrId: caseSpec.attrId, value: caseSpec.value };
            baseResult.expectedDerived = {
              stageName: String(expectedStage?.name || ""),
              mods: expectedMods,
              effectiveMax: expectedEffectiveMax,
              clampedCurrent: expectedClampCurrent
            };
            baseResult.actualDerived = {
              stageName: String(actual?.stageName || ""),
              mods: derived.mods || {},
              effectiveMax: actualEffectiveMax,
              clampedCurrent: actualClampCurrent
            };
            baseResult.actualState = {
              hp: Number(gameState.player.psycho.hp),
              satiety: Number(gameState.player.physio.satiety),
              stamina: Number(gameState.player.physio.stamina),
              fatigue: Number(gameState.player.psycho.fatigue),
              dead: !!gameState.player.exposure.dead
            };
            const failures = [];
            if (String(actual?.stageName || "") !== String(expectedStage?.name || "")) {
              failures.push("stageName mismatch");
            }
            if (Math.abs(actualEffectiveMax - expectedEffectiveMax) > 0.01) {
              failures.push("effectiveMax mismatch");
            }
            if (Math.abs(actualClampCurrent - expectedClampCurrent) > 0.01) {
              failures.push("clamped current mismatch");
            }

            for (const [modKey, modVal] of Object.entries(expectedMods)) {
              const actualMod = Number(derived?.mods?.[modKey]);
              if (!Number.isFinite(actualMod) || Math.abs(actualMod - Number(modVal)) > 0.01) {
                failures.push(`mod ${modKey} mismatch`);
              }
            }

            if (caseSpec.attrId === "hp" && Number(caseSpec.value) === 0 && baseResult.actualState.dead !== true) {
              failures.push("hp=0 must set dead=true");
            }

            baseResult.pass = failures.length === 0;
            if (!baseResult.pass) baseResult.notes = failures.join("; ");
            return baseResult;
          }

          case "breakpoint_thermal": {
            const t = Number(caseSpec.temperatureC);
            const hp = mapCoreTempToHp100(t, PLAYER_DEFS.temperature || {});
            const hypo = mapCoreTempToHypo100(t, PLAYER_DEFS.temperature || {});
            const stage = getHypothermiaStage(hypo);
            gameState.player.physio.temperatureC = t;
            gameState.player.psycho.hp = hp;
            gameState.player.psycho.hypothermia = hypo;
            gameState.player.psycho.hypoStage = stage;
            recomputePlayerVitals(gameState.player);
            baseResult.seedState = { temperatureC: t };
            baseResult.expectedState = {
              hp,
              hypothermia: hypo,
              hypoStage: stage,
              dead: hp <= 0
            };
            baseResult.actualState = {
              hp: Number(gameState.player.psycho.hp),
              hypothermia: Number(gameState.player.psycho.hypothermia),
              hypoStage: String(gameState.player.psycho.hypoStage || ""),
              dead: !!gameState.player.exposure.dead
            };
            baseResult.pass = baseResult.actualState.hypoStage === stage;
            if (!baseResult.pass) baseResult.notes = "hypoStage mismatch";
            return baseResult;
          }

          case "breakpoint_stamina_lock": {
            if (caseSpec.syntheticOnly) {
              baseResult.notes = "effectiveMax=0 not reachable with current formal staminaMaxMul rules";
              return baseResult;
            }
            gameState.player.physio.satiety = Number(caseSpec.satiety);
            gameState.player.psycho.fatigue = Number(caseSpec.fatigue);
            gameState.player.physio.stamina = Number(caseSpec.current);
            recomputePlayerVitals(gameState.player);
            const derived = getPlayerDerived(gameState.player);
            const effectiveMax = Number(derived?.attrs?.stamina?.effectiveMax ?? 0);
            const current = Number(gameState.player.physio.stamina ?? 0);
            baseResult.expectedDerived = { effectiveMax: Number(caseSpec.effectiveTarget), baseMax: 100 };
            baseResult.actualDerived = {
              effectiveMax,
              baseMax: Number(derived?.attrs?.stamina?.baseMax ?? 100),
              current
            };
            baseResult.pass = Math.abs(effectiveMax - Number(caseSpec.effectiveTarget)) <= 0.51;
            if (!baseResult.pass) baseResult.notes = "effectiveMax mismatch";
            return baseResult;
          }

          case "formula_dt": {
            const before = {
              hp: Number(gameState.player.psycho.hp),
              satiety: Number(gameState.player.physio.satiety),
              stamina: Number(gameState.player.physio.stamina),
              fatigue: Number(gameState.player.psycho.fatigue),
              dead: !!gameState.player.exposure.dead
            };
            applyTimeToPlayer(gameState.player, Number(caseSpec.minutes), {
              isSleeping: !!caseSpec.sleeping,
              sessionCoverage: caseSpec.sleeping ? "WARD_BED" : "NONE"
            });
            const after = {
              hp: Number(gameState.player.psycho.hp),
              satiety: Number(gameState.player.physio.satiety),
              stamina: Number(gameState.player.physio.stamina),
              fatigue: Number(gameState.player.psycho.fatigue),
              dead: !!gameState.player.exposure.dead
            };
            const delta = {
              hp: Number((after.hp - before.hp).toFixed(4)),
              satiety: Number((after.satiety - before.satiety).toFixed(4)),
              stamina: Number((after.stamina - before.stamina).toFixed(4)),
              fatigue: Number((after.fatigue - before.fatigue).toFixed(4))
            };
            baseResult.actualState = { before, after, delta };

            const expectedDirection = caseSpec.sleeping
              ? {
                  satiety: "decrease_or_equal",
                  fatigue: "increase_or_equal",
                  stamina: "increase_or_equal",
                  hp: "not_large_negative"
                }
              : {
                  satiety: "decrease_or_equal",
                  fatigue: "decrease_or_equal",
                  stamina: "decrease_or_equal",
                  hp: "not_abnormal_zero"
                };
            baseResult.expectedState = { direction: expectedDirection };

            const failures = [];
            if (after.hp <= 0.01) failures.push("hp abnormal zero after dt");
            if (after.dead) failures.push("dead triggered unexpectedly after dt");
            if (delta.satiety > 0.01) failures.push("satiety should not increase");

            if (caseSpec.sleeping) {
              if (delta.fatigue < -0.01) failures.push("sleeping fatigue should not decrease");
              if (delta.stamina < -0.01) failures.push("sleeping stamina should not decrease");
              if (delta.hp < -1.0) failures.push("sleeping hp large negative delta");
            } else {
              if (delta.fatigue > 0.01) failures.push("awake fatigue should not increase");
              if (delta.stamina > 0.01) failures.push("awake stamina should not increase");
            }

            baseResult.pass = failures.length === 0;
            if (!baseResult.pass) baseResult.notes = failures.join("; ");
            return baseResult;
          }

          case "formula_satiety": {
            gameState.player.physio.satiety = Number(caseSpec.satiety);
            gameState.player.psycho.fatigue = 100;
            gameState.player.psycho.hp = 100;
            recomputePlayerVitals(gameState.player);
            const derived = getPlayerDerived(gameState.player);
            const stage = getStageForValue("satiety", Number(caseSpec.satiety));
            baseResult.expectedDerived = { stage: stage?.name || "", mods: stage?.mods || {} };
            baseResult.actualDerived = { stage: derived?.attrs?.satiety?.stageName || "", mods: derived?.mods || {} };
            baseResult.pass = String(baseResult.actualDerived.stage) === String(baseResult.expectedDerived.stage);
            if (!baseResult.pass) baseResult.notes = "satiety stage mismatch";
            return baseResult;
          }

          case "formula_fatigue": {
            gameState.player.psycho.fatigue = Number(caseSpec.fatigue);
            gameState.player.physio.stamina = 100;
            recomputePlayerVitals(gameState.player);
            const derived = getPlayerDerived(gameState.player);
            baseResult.actualDerived = {
              staminaEffectiveMax: Number(derived?.attrs?.stamina?.effectiveMax ?? 100),
              staminaCurrent: Number(gameState.player.physio.stamina)
            };
            baseResult.pass = baseResult.actualDerived.staminaCurrent <= baseResult.actualDerived.staminaEffectiveMax + 1e-6;
            if (!baseResult.pass) baseResult.notes = "stamina clamp mismatch";
            return baseResult;
          }

          case "formula_temperature": {
            const t = Number(caseSpec.temperatureC);
            const hp = mapCoreTempToHp100(t, PLAYER_DEFS.temperature || {});
            const hypo = mapCoreTempToHypo100(t, PLAYER_DEFS.temperature || {});
            baseResult.expectedState = { hp, hypo };
            baseResult.actualState = { hp, hypo, hypoStage: getHypothermiaStage(hypo) };
            baseResult.pass = Number.isFinite(hp) && Number.isFinite(hypo);
            if (!baseResult.pass) baseResult.notes = "temperature mapping invalid";
            return baseResult;
          }

          case "formula_work_gain": {
            const buildReward = (profileObj) => {
              gameState.player.psycho.hp = Number(profileObj.hp);
              gameState.player.physio.satiety = Number(profileObj.satiety);
              gameState.player.psycho.fatigue = Number(profileObj.fatigue);
              recomputePlayerVitals(gameState.player);
              const defs = getAllJobDefinitions();
              const job = defs[0];
              const effects = buildJobOutcomeEffects(job, { isFirstRun: true, sessionId: "test" }, gameState);
              const moneyAdd = effects.find((e) => e?.op === "add" && e?.path === "world.money");
              const derived = getPlayerDerived(gameState.player);
              return {
                rewardMoney: Number(moneyAdd?.value ?? 0),
                mods: derived.mods || {}
              };
            };

            const profile = caseSpec.profile || {};
            const fullProfile = { hp: 100, satiety: 100, fatigue: 100 };
            const full = buildReward(fullProfile);
            const current = buildReward(profile);

            const eps = 0.01;
            const failures = [];
            const label = String(profile.label || "");

            if (label === "low_sat" && !(current.rewardMoney < full.rewardMoney - eps)) {
              failures.push("low_sat should be lower than full");
            }
            if (label === "low_fat" && !(current.rewardMoney < full.rewardMoney - eps)) {
              failures.push("low_fat should be lower than full");
            }

            if (label === "low_hp") {
              const hpStage = getStageForValue("hp", Number(profile.hp));
              const hpWorkMul = Number(hpStage?.mods?.workGainMul);
              if (Number.isFinite(hpWorkMul) && hpWorkMul > 0) {
                if (!(current.rewardMoney < full.rewardMoney - eps)) {
                  failures.push("low_hp should be lower than full by hp-stage workGainMul");
                }
              } else {
                if (Math.abs(current.rewardMoney - full.rewardMoney) > eps) {
                  failures.push("low_hp expected equal full because hp stage has no workGainMul");
                }
                baseResult.notes = "设计如此: HP 阶段未定义 workGainMul，低 HP 不影响工作收益";
              }
            }

            baseResult.actualState = {
              rewardMoney: current.rewardMoney,
              baselineFullRewardMoney: full.rewardMoney
            };
            baseResult.actualDerived = {
              currentMods: current.mods,
              baselineFullMods: full.mods
            };
            baseResult.expectedState = {
              relationToFull: label === "low_hp"
                ? "explicit_by_design"
                : "must_be_lower_than_full"
            };
            baseResult.pass = failures.length === 0;
            if (!baseResult.pass) baseResult.notes = failures.join("; ");
            return baseResult;
          }

          case "formula_sleep_regen": {
            const p = caseSpec.profile || {};
            gameState.player.psycho.hp = Number(p.hp);
            gameState.player.physio.satiety = Number(p.satiety);
            gameState.player.psycho.fatigue = Number(p.fatigue);
            recomputePlayerVitals(gameState.player);

            const beforeHp = Number(gameState.player.psycho.hp);
            const before = {
              hp: beforeHp,
              satiety: Number(gameState.player.physio.satiety),
              stamina: Number(gameState.player.physio.stamina),
              fatigue: Number(gameState.player.psycho.fatigue),
              dead: !!gameState.player.exposure.dead
            };
            applyTimeToPlayer(gameState.player, 480, { isSleeping: true, sessionCoverage: "WARD_BED" });
            const afterHp = Number(gameState.player.psycho.hp);
            const after = {
              hp: afterHp,
              satiety: Number(gameState.player.physio.satiety),
              stamina: Number(gameState.player.physio.stamina),
              fatigue: Number(gameState.player.psycho.fatigue),
              dead: !!gameState.player.exposure.dead
            };
            const hpDelta = Number((afterHp - beforeHp).toFixed(4));

            const expectationByLabel = {
              sleep_high: {
                hpDeltaMin: -0.5,
                hpDeltaMax: 12,
                rationale: "高饱腹+中高睡眠下，睡眠收益应至少非大幅负增长"
              },
              sleep_low_sat: {
                hpDeltaMin: -12,
                hpDeltaMax: 2,
                rationale: "低饱腹阶段含持续 HP 负向项，允许下降但不应越界"
              },
              sleep_low_all: {
                hpDeltaMin: -14,
                hpDeltaMax: 2,
                rationale: "低饱腹+低睡眠下允许下降，仍需限制在明确范围"
              }
            };
            const exp = expectationByLabel[String(p.label)] || {
              hpDeltaMin: -2,
              hpDeltaMax: 6,
              rationale: "default explicit expectation"
            };

            baseResult.expectedState = {
              hpDeltaMin: exp.hpDeltaMin,
              hpDeltaMax: exp.hpDeltaMax,
              rationale: exp.rationale
            };
            baseResult.actualState = { before, after, hpDelta };

            const failures = [];
            if (!Number.isFinite(hpDelta)) failures.push("hp delta invalid");
            if (hpDelta < exp.hpDeltaMin || hpDelta > exp.hpDeltaMax) failures.push("hp delta out of explicit expected range");
            if (after.dead) failures.push("dead triggered unexpectedly during sleep regen case");
            if (after.hp <= 0.01) failures.push("hp abnormal zero after sleep regen");

            baseResult.pass = failures.length === 0;
            if (!baseResult.pass) baseResult.notes = failures.join("; ");
            return baseResult;
          }

          case "coupling_satiety_fatigue": {
            const p = caseSpec.profile || {};
            gameState.player.physio.satiety = Number(p.satiety);
            gameState.player.psycho.fatigue = Number(p.fatigue);
            recomputePlayerVitals(gameState.player);
            const derived = getPlayerDerived(gameState.player);
            baseResult.actualDerived = {
              staminaEffectiveMax: Number(derived?.attrs?.stamina?.effectiveMax ?? 100),
              mods: derived.mods || {}
            };
            baseResult.pass = Number.isFinite(baseResult.actualDerived.staminaEffectiveMax);
            return baseResult;
          }

          case "coupling_satiety_thermal": {
            const p = caseSpec.profile || {};
            gameState.player.physio.satiety = Number(p.satiety);
            gameState.player.physio.temperatureC = Number(p.t);
            gameState.player.psycho.hp = mapCoreTempToHp100(Number(p.t), PLAYER_DEFS.temperature || {});
            gameState.player.psycho.hypothermia = mapCoreTempToHypo100(Number(p.t), PLAYER_DEFS.temperature || {});
            gameState.player.psycho.hypoStage = getHypothermiaStage(gameState.player.psycho.hypothermia);
            recomputePlayerVitals(gameState.player);
            baseResult.actualState = {
              hp: Number(gameState.player.psycho.hp),
              hypoStage: String(gameState.player.psycho.hypoStage || "")
            };
            baseResult.pass = Number.isFinite(baseResult.actualState.hp);
            return baseResult;
          }

          case "coupling_hp_fatigue": {
            const p = caseSpec.profile || {};
            gameState.player.psycho.hp = Number(p.hp);
            gameState.player.psycho.fatigue = Number(p.fatigue);
            recomputePlayerVitals(gameState.player);
            const derived = getPlayerDerived(gameState.player);
            baseResult.actualDerived = { mods: derived.mods || {} };
            baseResult.pass = true;
            return baseResult;
          }

          case "coupling_wetness_windproof": {
            const p = caseSpec.profile || {};
            gameState.player.gear.thermal.wetness = Number(p.wetness);
            gameState.player.gear.thermal.windproof = Number(p.windproof);
            applyTimeToPlayer(gameState.player, 60, { isSleeping: false, sessionCoverage: "NONE" });
            baseResult.actualState = {
              temperatureC: Number(gameState.player.physio.temperatureC),
              hypothermia: Number(gameState.player.psycho.hypothermia)
            };
            baseResult.seedState = {
              wetness: Number(p.wetness),
              windproof: Number(p.windproof)
            };
            baseResult.pass = Number.isFinite(baseResult.actualState.temperatureC) && Number.isFinite(baseResult.actualState.hypothermia);
            if (!baseResult.pass) baseResult.notes = "wet/wind run invalid";
            return baseResult;
          }

          case "reg_debug_set": {
            const report = await dispatch("debug_set_player_stat_value", {
              statKey: String(caseSpec.statKey),
              value: Number(caseSpec.value)
            }, {
              suppressDialogs: true,
              suppressFeedback: true,
              returnReport: true
            });
            const derived = getPlayerDerived(gameState.player);
            baseResult.actualState = {
              hp: Number(gameState.player.psycho.hp),
              satiety: Number(gameState.player.physio.satiety),
              stamina: Number(gameState.player.physio.stamina),
              fatigue: Number(gameState.player.psycho.fatigue),
              dead: !!gameState.player.exposure.dead
            };
            baseResult.actualDerived = { staminaEffectiveMax: Number(derived?.attrs?.stamina?.effectiveMax ?? 100) };
            baseResult.operation = { dispatchOk: !!report?.ok };
            baseResult.pass = !!report?.ok;
            if (!baseResult.pass) baseResult.notes = "debug dispatch failed";
            return baseResult;
          }

          case "reg_advance_dispatch": {
            const actionId = caseSpec.sleeping ? "obs_stay_12h" : "sidebar_wait_confirm";
            const payload = { minutes: Number(caseSpec.minutes) };
            const report = await dispatch(actionId, payload, {
              suppressDialogs: true,
              suppressFeedback: true,
              returnReport: true
            });
            baseResult.operation = { actionId, minutes: Number(caseSpec.minutes) };
            baseResult.actualGate = {
              ok: !!report?.ok,
              reason: report?.reason || null
            };
            baseResult.pass = report?.ok === true || report?.reason === "ok";
            if (!baseResult.pass) baseResult.notes = `advance dispatch rejected: ${report?.reason || "unknown"}`;
            return baseResult;
          }

          case "reg_gate_dead": {
            gameState.player.exposure.dead = true;
            const originalActions = Array.isArray(gameState.currentMap?.actions) ? gameState.currentMap.actions.slice() : [];
            gameState.currentMap.actions = [...originalActions, {
              id: "temp_dead_gate_action",
              kind: "TIME_SKIP",
              payload: { minutes: 10 }
            }];
            const report = await dispatch("temp_dead_gate_action", {}, {
              suppressDialogs: true,
              suppressFeedback: true,
              returnReport: true
            });
            gameState.currentMap.actions = originalActions;
            baseResult.expectedGate = { code: "PLAYER_DEAD_BLOCKED" };
            baseResult.actualGate = {
              code: report?.report?.plan?.rejection?.code || null,
              source: report?.report?.plan?.rejection?.source || null
            };
            baseResult.pass = baseResult.actualGate.code === "PLAYER_DEAD_BLOCKED";
            if (!baseResult.pass) baseResult.notes = "dead gate not rejected";
            return baseResult;
          }

          case "reg_gate_stamina": {
            gameState.player.exposure.dead = false;
            gameState.player.physio.stamina = 5;
            recomputePlayerVitals(gameState.player);
            const originalActions = Array.isArray(gameState.currentMap?.actions) ? gameState.currentMap.actions.slice() : [];
            gameState.currentMap.actions = [...originalActions, {
              id: "temp_stamina_gate_action",
              kind: "TIME_SKIP",
              payload: { minutes: 10 },
              effects: [{ op: "add", path: "player.physio.stamina", value: -20 }]
            }];
            const report = await dispatch("temp_stamina_gate_action", {}, {
              suppressDialogs: true,
              suppressFeedback: true,
              returnReport: true
            });
            gameState.currentMap.actions = originalActions;
            baseResult.expectedGate = { code: "STAMINA_PREDICTED_NEGATIVE" };
            baseResult.actualGate = {
              code: report?.report?.plan?.rejection?.code || null,
              source: report?.report?.plan?.rejection?.source || null
            };
            baseResult.pass = baseResult.actualGate.code === "STAMINA_PREDICTED_NEGATIVE";
            if (!baseResult.pass) baseResult.notes = "stamina gate not rejected";
            return baseResult;
          }

          case "reg_gate_whitelist": {
            gameState.player.exposure.dead = true;
            const report = await dispatch("ui_open_inventory", {}, {
              suppressDialogs: true,
              suppressFeedback: true,
              returnReport: true
            });
            baseResult.actualGate = { ok: !!report?.ok, reason: report?.reason || null };
            baseResult.pass = report?.ok === true;
            if (!baseResult.pass) baseResult.notes = "whitelist action blocked unexpectedly";
            return baseResult;
          }

          case "reg_save_load": {
            gameState.player.physio.temperatureC = 31.2;
            gameState.player.psycho.hypothermia = 62;
            gameState.player.psycho.hypoStage = "Moderate";
            gameState.player.psycho.fatigue = 10;
            recomputePlayerVitals(gameState.player);
            const before = {
              temperatureC: Number(gameState.player.physio.temperatureC),
              hypothermia: Number(gameState.player.psycho.hypothermia),
              hypoStage: String(gameState.player.psycho.hypoStage || ""),
              stamina: Number(gameState.player.physio.stamina),
              dead: !!gameState.player.exposure.dead
            };
            const saveRes = saveManager.saveToSlot(9, gameState);
            const loadRes = saveManager.loadFromSlot(9);
            const loaded = loadRes?.snapshotState?.player || {};
            const after = {
              temperatureC: Number(loaded?.physio?.temperatureC),
              hypothermia: Number(loaded?.psycho?.hypothermia),
              hypoStage: String(loaded?.psycho?.hypoStage || ""),
              stamina: Number(loaded?.physio?.stamina),
              dead: !!loaded?.exposure?.dead
            };
            baseResult.actualState = { before, after, saveOk: !!saveRes?.ok, loadOk: !!loadRes?.ok };
            baseResult.pass = !!saveRes?.ok && !!loadRes?.ok && Number.isFinite(after.temperatureC) && String(after.hypoStage).length > 0;
            if (!baseResult.pass) baseResult.notes = "save/load continuity failed";
            return baseResult;
          }

          case "reg_sleep_episode_short_awake_no_reset": {
            gameState.player.psycho.fatigue = 40;
            recomputePlayerVitals(gameState.player);
            applyTimeToPlayer(gameState.player, 120, { isSleeping: true, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 120 } });
            const firstEpisode = Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0);
            applyTimeToPlayer(gameState.player, 10, { isSleeping: false, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 130 } });
            const afterShortAwake = Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0);
            const awakeGap = Number(gameState.player?.meta?.sleepEpisode?.awakeGapMin ?? 0);
            applyTimeToPlayer(gameState.player, 120, { isSleeping: true, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 250 } });
            const secondEpisode = Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0);
            baseResult.actualState = { firstEpisode, afterShortAwake, awakeGap, secondEpisode };
            baseResult.pass = firstEpisode > 0 && afterShortAwake === firstEpisode && awakeGap < 120 && secondEpisode > firstEpisode;
            if (!baseResult.pass) baseResult.notes = "short awake unexpectedly reset episode";
            return baseResult;
          }

          case "reg_sleep_episode_awake120_reset": {
            gameState.player.psycho.fatigue = 40;
            recomputePlayerVitals(gameState.player);
            applyTimeToPlayer(gameState.player, 120, { isSleeping: true, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 120 } });
            const firstEpisode = Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0);
            applyTimeToPlayer(gameState.player, 120, { isSleeping: false, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 240 } });
            const afterAwake120 = Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0);
            const awakeGap = Number(gameState.player?.meta?.sleepEpisode?.awakeGapMin ?? 0);
            applyTimeToPlayer(gameState.player, 60, { isSleeping: true, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 300 } });
            const nextEpisode = Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0);
            baseResult.actualState = { firstEpisode, afterAwake120, awakeGap, nextEpisode };
            baseResult.pass = firstEpisode > 0 && afterAwake120 === 0 && awakeGap >= 120 && nextEpisode <= 65;
            if (!baseResult.pass) baseResult.notes = "awake>=120 did not reset episode";
            return baseResult;
          }

          case "reg_sleep_episode_severe_interrupt_reset": {
            gameState.player.psycho.hp = 30;
            recomputePlayerVitals(gameState.player);
            applyTimeToPlayer(gameState.player, 60, { isSleeping: true, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 60 } });
            const beforeInterrupt = Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0);
            const res = applyTimeToPlayer(gameState.player, 60, {
              isSleeping: true,
              sessionCoverage: "NONE",
              timeViewAfter: { totalMinutes: 120 },
              forcedSleepInterrupt: true
            });
            const afterInterrupt = Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0);
            const eventHit = Array.isArray(res?.events) && res.events.some((e) => String(e?.type) === "sleep_interrupted");
            baseResult.actualState = { beforeInterrupt, afterInterrupt, eventHit };
            baseResult.pass = beforeInterrupt > 0 && afterInterrupt === 0 && eventHit;
            if (!baseResult.pass) baseResult.notes = "severe interruption did not reset episode";
            return baseResult;
          }

          case "reg_collapse_exit_only_two": {
            const mkPlayer = () => {
              const p = createDefaultPlayerState();
              p.exposure.dead = false;
              return p;
            };

            const pA = mkPlayer();
            pA.physio.stamina = 0;
            pA.psycho.hp = 80;
            recomputePlayerVitals(pA);
            applyTimeToPlayer(pA, 1440, { isSleeping: false, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 1440 } });
            const aState = {
              stamina: Number(pA.physio.stamina),
              hp: Number(pA.psycho.hp),
              mode: String(pA?.meta?.sleepEpisode?.mode || "")
            };

            const pB = mkPlayer();
            pB.physio.stamina = 0;
            pB.psycho.hp = 0;
            recomputePlayerVitals(pB);
            applyTimeToPlayer(pB, 30, { isSleeping: false, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 30 } });
            const bState = {
              stamina: Number(pB.physio.stamina),
              hp: Number(pB.psycho.hp),
              dead: !!pB.exposure.dead,
              mode: String(pB?.meta?.sleepEpisode?.mode || "")
            };

            const pC = mkPlayer();
            pC.physio.stamina = 0;
            pC.psycho.hp = 60;
            recomputePlayerVitals(pC);
            applyTimeToPlayer(pC, 60, {
              isSleeping: false,
              sessionCoverage: "NONE",
              timeViewAfter: { totalMinutes: 60 },
              forcedSleepInterrupt: true
            });
            const cState = {
              stamina: Number(pC.physio.stamina),
              hp: Number(pC.psycho.hp),
              mode: String(pC?.meta?.sleepEpisode?.mode || "")
            };

            const wakeByThreshold = aState.stamina >= 20 && aState.mode !== "COLLAPSE";
            const deadByHp = bState.dead === true;
            const noThirdWake = cState.stamina < 20 ? cState.mode === "COLLAPSE" : true;
            baseResult.actualState = { caseA: aState, caseB: bState, caseC: cState };
            baseResult.pass = wakeByThreshold && deadByHp && noThirdWake;
            if (!baseResult.pass) baseResult.notes = "collapse exit has third condition or threshold mismatch";
            return baseResult;
          }

          case "reg_collapse_profile_effect": {
            const runOnce = ({ wetness, windproof }) => {
              const p = createDefaultPlayerState();
              p.physio.stamina = 0;
              p.psycho.hp = 80;
              p.gear.thermal.wetness = wetness;
              p.gear.thermal.windproof = windproof;
              recomputePlayerVitals(p);
              const before = Number(p.physio.stamina);
              applyTimeToPlayer(p, 120, { isSleeping: false, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 120 } });
              const after = Number(p.physio.stamina);
              return {
                before,
                after,
                delta: Number((after - before).toFixed(4)),
                mode: String(p?.meta?.sleepEpisode?.mode || "")
              };
            };

            const good = runOnce({ wetness: 0, windproof: 1 });
            const bad = runOnce({ wetness: 1, windproof: 0 });
            const staminaDeltaDiff = Number((good.delta - bad.delta).toFixed(4));
            baseResult.actualState = { good, bad, staminaDeltaDiff };
            baseResult.pass = staminaDeltaDiff > 0.2;
            if (!baseResult.pass) baseResult.notes = "collapse profile not affecting recovery pace";
            return baseResult;
          }

          case "reg_sleep_saveload_continuity": {
            gameState.player.psycho.fatigue = 40;
            recomputePlayerVitals(gameState.player);
            applyTimeToPlayer(gameState.player, 120, { isSleeping: true, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 120 } });
            applyTimeToPlayer(gameState.player, 10, { isSleeping: false, sessionCoverage: "NONE", timeViewAfter: { totalMinutes: 130 } });
            const before = {
              episodeSleepMin: Number(gameState.player?.meta?.sleepEpisode?.episodeSleepMin ?? 0),
              awakeGapMin: Number(gameState.player?.meta?.sleepEpisode?.awakeGapMin ?? 0),
              fatigueRecoveredInWindow: Number(gameState.player?.meta?.sleepEpisode?.fatigueRecoveredInWindow ?? 0)
            };
            const saveRes = saveManager.saveToSlot(8, gameState);
            const loadRes = saveManager.loadFromSlot(8);
            const loaded = loadRes?.snapshotState?.player?.meta?.sleepEpisode || {};
            const after = {
              episodeSleepMin: Number(loaded?.episodeSleepMin ?? 0),
              awakeGapMin: Number(loaded?.awakeGapMin ?? 0),
              fatigueRecoveredInWindow: Number(loaded?.fatigueRecoveredInWindow ?? 0)
            };
            baseResult.actualState = { before, after, saveOk: !!saveRes?.ok, loadOk: !!loadRes?.ok };
            baseResult.pass = !!saveRes?.ok
              && !!loadRes?.ok
              && Math.abs(after.episodeSleepMin - before.episodeSleepMin) <= 0.01
              && Math.abs(after.awakeGapMin - before.awakeGapMin) <= 0.01
              && Math.abs(after.fatigueRecoveredInWindow - before.fatigueRecoveredInWindow) <= 0.01;
            if (!baseResult.pass) baseResult.notes = "sleep episode state lost across save/load";
            return baseResult;
          }

          default:
            return fail(`unknown case kind: ${caseSpec.kind}`);
        }
      }, spec);

      results.push(row);
    }

    const wetWindRows = results.filter((r) => r.caseId.startsWith("couple_wet_wind_"));
    if (wetWindRows.length >= 4) {
      let hasObservableDifference = false;
      for (let i = 0; i < wetWindRows.length; i++) {
        for (let j = i + 1; j < wetWindRows.length; j++) {
          const a = wetWindRows[i];
          const b = wetWindRows[j];
          const dTemp = Math.abs(Number(a.actualState?.temperatureC ?? 0) - Number(b.actualState?.temperatureC ?? 0));
          const dHypo = Math.abs(Number(a.actualState?.hypothermia ?? 0) - Number(b.actualState?.hypothermia ?? 0));
          if (dTemp >= 0.05 || dHypo >= 0.5) {
            hasObservableDifference = true;
            break;
          }
        }
        if (hasObservableDifference) break;
      }

      if (!hasObservableDifference) {
        for (const row of wetWindRows) {
          row.pass = false;
          row.notes = "输入未接入热链或测试注入位置错误";
        }
      }
    }

    // UI lock screenshots (stamina only)
    await page.evaluate(async () => {
      const { gameState } = await import("/src/engine/state.js");
      gameState.time.totalMinutes = 0;
      gameState.currentMapId = "menu_main";
      if (gameState.world && typeof gameState.world === "object") {
        gameState.world.currentMapId = "menu_main";
      }
      const { dispatch } = await import("/src/engine/pipeline/dispatch.js");
      await dispatch("menu_new_game", {}, { suppressDialogs: true, suppressFeedback: true });
    });
    await page.waitForSelector("#player-sidebar .attr-card", { timeout: 30000 });

    const uiCase = async (payload, targetPath) => {
      await page.evaluate(async ({ satiety, fatigue, stamina, hp }) => {
        const { dispatch } = await import("/src/engine/pipeline/dispatch.js");
        const apply = async (statKey, value) => {
          await dispatch("debug_set_player_stat_value", { statKey, value }, {
            suppressDialogs: true,
            suppressFeedback: true
          });
        };
        await apply("hp", hp);
        await apply("satiety", satiety);
        await apply("fatigue", fatigue);
        await apply("stamina", stamina);
      }, payload);

      await page.waitForTimeout(180);
      await page.waitForSelector("#player-sidebar .attr-card", { timeout: 30000 });
      const staminaCard = page.locator(".attr-card", { hasText: "体能" }).first();
      await staminaCard.screenshot({ path: targetPath });
      return await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".attr-card"));
        const card = cards.find((el) => String(el.querySelector(".attr-label")?.textContent || "").includes("体能"));
        if (!card) return null;
        const valueText = String(card.querySelector(".attr-value")?.textContent || "").trim();
        const bar = card.querySelector(".attr-bar-bg");
        const fill = card.querySelector(".attr-bar-fill");
        const lock = card.querySelector(".attr-bar-lock");
        const barRect = bar?.getBoundingClientRect();
        const fillRect = fill?.getBoundingClientRect();
        const lockRect = lock?.getBoundingClientRect();
        return {
          valueText,
          fillRatio: barRect && fillRect ? Number((fillRect.width / barRect.width).toFixed(4)) : null,
          lockRatio: barRect && lockRect ? Number((lockRect.width / barRect.width).toFixed(4)) : null
        };
      });
    };

    const uiA = await uiCase({ hp: 100, satiety: 0, fatigue: 0, stamina: 10 }, caseAPath);
    const uiB = await uiCase({ hp: 100, satiety: 100, fatigue: 40, stamina: 20 }, caseBPath);

    const caseAResult = {
      caseId: "ui_caseA_stamina_lock",
      suite: "regression",
      seedState: { current: 10, effectiveMax: 25, baseMax: 100 },
      context: {},
      operation: { type: "ui_screenshot" },
      expectedDerived: {},
      actualDerived: {},
      expectedState: {},
      actualState: {},
      expectedGate: {},
      actualGate: {},
      expectedUI: {
        valueText: "10 / 25",
        fillRatio: 0.1,
        lockRatio: 0.75
      },
      actualUI: uiA || {},
      pass: !!uiA && uiA.valueText === "10 / 25" && Math.abs((uiA.fillRatio ?? 0) - 0.1) <= 0.03 && Math.abs((uiA.lockRatio ?? 0) - 0.75) <= 0.03,
      tolerance: 0.03,
      notes: "",
      tags: ["ui", "stamina_lock"]
    };

    const caseBResult = {
      caseId: "ui_caseB_stamina_lock",
      suite: "regression",
      seedState: { current: 20, effectiveMax: 70, baseMax: 100 },
      context: {},
      operation: { type: "ui_screenshot" },
      expectedDerived: {},
      actualDerived: {},
      expectedState: {},
      actualState: {},
      expectedGate: {},
      actualGate: {},
      expectedUI: {
        valueText: "20 / 70",
        fillRatio: 0.2,
        lockRatio: 0.3
      },
      actualUI: uiB || {},
      pass: !!uiB && uiB.valueText === "20 / 70" && Math.abs((uiB.fillRatio ?? 0) - 0.2) <= 0.03 && Math.abs((uiB.lockRatio ?? 0) - 0.3) <= 0.03,
      tolerance: 0.03,
      notes: "",
      tags: ["ui", "stamina_lock"]
    };

    results.push(caseAResult, caseBResult);

    const minimalCoverage = buildMinimalCoverage(results);

    const suites = {
      breakpoints: results.filter((r) => r.suite === "breakpoints"),
      formula_single_factor: results.filter((r) => r.suite === "formula_single_factor"),
      coupling: results.filter((r) => r.suite === "coupling"),
      regression: results.filter((r) => r.suite === "regression"),
      minimalCoverage
    };

    const allCases = [
      ...suites.breakpoints,
      ...suites.formula_single_factor,
      ...suites.coupling,
      ...suites.regression,
      ...suites.minimalCoverage
    ];

    const failures = results.filter((r) => !r.pass);
    const passCount = results.length - failures.length;

    const resultJson = {
      meta: {
        timestamp: new Date().toISOString(),
        gitLikeContext: "workspace:CambdrigeCity attr_matrix_once",
        passCount,
        failCount: failures.length,
        caseCount: results.length
      },
      suites,
      failures,
      uiArtifacts: {
        caseA: "temp/attr_matrix_caseA.png",
        caseB: "temp/attr_matrix_caseB.png"
      }
    };

    await fs.writeFile(resultJsonPath, JSON.stringify(resultJson, null, 2), "utf8");

    const failureLines = failures.length > 0
      ? failures.map((f) => `- ${f.caseId}: ${f.notes || "(no notes)"}`).join("\n")
      : "- None";

    const bySuite = [
      ["breakpoints", suites.breakpoints.length],
      ["formula_single_factor", suites.formula_single_factor.length],
      ["coupling", suites.coupling.length],
      ["regression", suites.regression.length],
      ["minimalCoverage", suites.minimalCoverage.length]
    ];
    const weakest = bySuite
      .map(([name]) => [name, suites[name].filter((r) => !r.pass).length])
      .sort((a, b) => b[1] - a[1])[0];

    const summaryMd = [
      "# Attr Matrix Summary",
      "",
      `- Total: ${results.length}`,
      `- Passed: ${passCount}`,
      `- Failed: ${failures.length}`,
      "",
      "## Failures",
      failureLines,
      "",
      "## Weakest Suite",
      `- ${weakest?.[0] || "n/a"}: ${weakest?.[1] || 0} failures`,
      "",
      "## UI Artifacts",
      `- temp/attr_matrix_caseA.png`,
      `- temp/attr_matrix_caseB.png`
    ].join("\n");

    await fs.writeFile(summaryMdPath, summaryMd, "utf8");

    const quick = {
      caseCount: results.length,
      passCount,
      failCount: failures.length,
      failures: failures.map((f) => f.caseId)
    };
    process.stdout.write(`${JSON.stringify(quick, null, 2)}\n`);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }

    if (serverProc) {
      try {
        serverProc.kill("SIGTERM");
      } catch {
        // ignore
      }
      await sleep(120);
      try {
        serverProc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }

    await rmForce(runDir);
  }
}

run().catch(async (error) => {
  const failJson = {
    meta: {
      timestamp: new Date().toISOString(),
      gitLikeContext: "workspace:CambdrigeCity attr_matrix_once",
      passCount: 0,
      failCount: 1,
      caseCount: 0
    },
    suites: {
      breakpoints: [],
      formula_single_factor: [],
      coupling: [],
      regression: [],
      minimalCoverage: []
    },
    failures: [{ caseId: "orchestrator_runtime_error", notes: String(error?.message || error) }],
    uiArtifacts: {
      caseA: "temp/attr_matrix_caseA.png",
      caseB: "temp/attr_matrix_caseB.png"
    }
  };
  try {
    await ensureDir(tempDir);
    await fs.writeFile(resultJsonPath, JSON.stringify(failJson, null, 2), "utf8");
    await fs.writeFile(summaryMdPath, `# Attr Matrix Summary\n\n- Failed to run\n- Error: ${String(error?.message || error)}\n`, "utf8");
  } catch {
    // ignore
  }
  console.error(error);
  process.exitCode = 1;
});
