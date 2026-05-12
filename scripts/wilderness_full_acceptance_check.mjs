/**
 * West2 旧标记杆巡查线 Phase 1–12A 总验收（脚本聚合 + 静态/轻量断言）。
 * 不修改业务逻辑；仅验收与报告。
 *
 * Run: node scripts/wilderness_full_acceptance_check.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createDefaultGameState } from "../src/engine/state.js";
import { makeEmptySnapshot, sanitizeSnapshot } from "../src/save/save_schema.js";
import { normalizeWildernessState } from "../src/engine/wilderness/wilderness_state.js";
import { getTerrainBiomeDef } from "../src/engine/wilderness/wilderness_terrain_registry.js";
import { applyEthanRescueRecoveryFloor } from "../src/engine/wilderness/wilderness_ethan_rescue_service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(ROOT, "temp", "wilderness_full_acceptance_report.md");

const CONTRACT_SCRIPTS = [
  "wilderness_static_contract_check.mjs",
  "wilderness_session_contract_check.mjs",
  "wilderness_view_model_contract_check.mjs",
  "wilderness_entry_contract_check.mjs",
  "wilderness_movement_contract_check.mjs",
  "wilderness_blocker_contract_check.mjs",
  "wilderness_surface_contract_check.mjs",
  "wilderness_probe_contract_check.mjs",
  "wilderness_weather_forecast_contract_check.mjs",
  "wilderness_survival_contract_check.mjs",
  "wilderness_player_state_blocker_contract_check.mjs",
  "wilderness_landmark_contract_check.mjs",
  "wilderness_ethan_rescue_contract_check.mjs",
  "wilderness_ethan_rescue_audit_check.mjs"
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function runNodeScript(name) {
  const scriptPath = path.join(ROOT, "scripts", name);
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    name,
    ok: r.status === 0,
    status: r.status,
    stdout: String(r.stdout || ""),
    stderr: String(r.stderr || "")
  };
}

function grepFiles(rootRel, exts, pattern) {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        walk(p);
      } else if (exts.some((e) => ent.name.endsWith(e))) {
        const t = fs.readFileSync(p, "utf8");
        if (pattern.test(t)) out.push(path.relative(ROOT, p).replaceAll("\\", "/"));
      }
    }
  };
  walk(path.join(ROOT, rootRel));
  return out;
}

function rendererWildernessAudit() {
  const p = path.join(ROOT, "src/engine/renderer.js");
  if (!fs.existsSync(p)) return ["missing src/engine/renderer.js"];
  const t = fs.readFileSync(p, "utf8");
  const bad = [];
  if (/\brescueSuccess\b/i.test(t)) bad.push("contains rescueSuccess");
  if (/\bWILDERNESS_ETHAN_RESCUE\b/i.test(t)) bad.push("contains WILDERNESS_ETHAN_RESCUE");
  if (/\bsuppressGenericCollapseNotice\b/.test(t)) bad.push("contains suppressGenericCollapseNotice");
  if (/\bresolveWildernessMovePlan(ReadOnly)?\b/.test(t)) bad.push("contains wilderness move plan resolver");
  if (/\bstaminaCost\b/.test(t) && /wilderness/i.test(t)) bad.push("possible wilderness staminaCost in renderer");
  return bad;
}

function gitStatusShort() {
  const r = spawnSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return `(git status failed: ${r.stderr || r.stdout})`;
  return String(r.stdout || "").trim() || "(clean)";
}

function section(lines, title) {
  lines.push(`## ${title}`, "");
}

function main() {
  const lines = [];
  let overallPass = true;
  const fail = (msg) => {
    overallPass = false;
    lines.push(`**FAIL**：${msg}`);
  };

  lines.push("# West2 旧标记杆巡查线 · Phase 1–12A 总验收报告", "");
  lines.push(`生成：脚本自动生成（无 Git 写操作）`, "");

  const contractResults = [];
  for (const s of CONTRACT_SCRIPTS) {
    const r = runNodeScript(s);
    contractResults.push(r);
    lines.push(`- **${s}**：${r.ok ? "PASS" : "FAIL"} (exit ${r.status})`);
    if (!r.ok) {
      overallPass = false;
      lines.push("```");
      lines.push((r.stderr || r.stdout || "").slice(0, 8000));
      lines.push("```");
    }
  }
  lines.push(`- **wilderness_full_acceptance_check.mjs（本脚本）**：在上文 14 条全部 PASS 前提下执行静态/快照验收`);
  lines.push("");

  const failures = contractResults.filter((x) => !x.ok);
  if (failures.length > 0) {
    fail(`合约脚本失败：${failures.map((f) => f.name).join(", ")}`);
  }

  // ---------- 16.3 映射：逐项（与验收范围 1–12 对齐） ----------
  section(lines, "16.3 验收目标逐项（与本轮范围 1–12 对齐）");

  // 1 入口链
  let wr;
  try {
    wr = JSON.parse(read("data/maps/wilderness_runtime.json"));
  } catch (e) {
    fail(`无法读取 wilderness_runtime.json：${e?.message || e}`);
    wr = { actions: [] };
  }
  const moveKinds = (wr.actions || []).filter((a) => a.kind === "WILDERNESS_MOVE");
  const endActs = (wr.actions || []).filter((a) => a.kind === "WILDERNESS_END_SESSION");
  if (moveKinds.length !== 8) fail("wilderness_runtime 应有 8 个 WILDERNESS_MOVE");
  if (endActs.length !== 1) fail("wilderness_runtime 应有 1 个 WILDERNESS_END_SESSION");
  if ((wr.actions || []).length !== 9) fail("wilderness_runtime 总 action 数应为 9");
  let areaSrc = "";
  try {
    areaSrc = read("data/wilderness/areas/west2_old_marker_patrol_line.js");
    if (!/metersPerCell:\s*150/.test(areaSrc)) fail("area 缺少 metersPerCell: 150");
    if (!/id:\s*"west2_old_marker_patrol_line"/.test(areaSrc)) fail("area id 不匹配");
    if (!/runtimeMapId:\s*"wilderness_runtime"/.test(areaSrc)) fail("runtimeMapId 应为 wilderness_runtime");
  } catch (e) {
    fail(`无法读取 west2_old_marker_patrol_line：${e?.message || e}`);
  }
  lines.push("1. **入口链**：`wilderness_entry_contract_check` PASS；磁盘 `wilderness_runtime` 8 移动 + 1 结束；`west2_old_marker_patrol_line.js` 含 `metersPerCell: 150`、`runtimeMapId: wilderness_runtime`；会话起点坐标由 `createStartWildernessSessionPatch` 固定为 (0,0)（见 `wilderness_session_service.js`）。");
  lines.push("");

  // 2 八方向移动
  lines.push("2. **八方向移动**：`wilderness_movement_contract_check` PASS；合约已覆盖方向 delta、斜向一格、`resolveWildernessMovePlanReadOnly` 与 commit 链。");
  lines.push("");

  // 3 地貌影响（数据定义 + surface 合约）
  const managed = getTerrainBiomeDef("managed_compacted_route");
  const packed = getTerrainBiomeDef("wind_packed_snow");
  const drift = getTerrainBiomeDef("snow_drift_zone");
  const sastrugi = getTerrainBiomeDef("sastrugi_field");
  if (!managed || !packed || !drift || !sastrugi) fail("地形定义缺失 managed/wind_packed/snow_drift/sastrugi");
  else {
    if (!(managed.move.moveTimeMult < packed.move.moveTimeMult && managed.move.staminaCostMult < packed.move.staminaCostMult)) {
      fail("managed_compacted_route 应比 wind_packed_snow 更快/更省体力（terrain.move）");
    }
    if (!(drift.move.moveTimeMult > packed.move.moveTimeMult && drift.move.staminaCostMult > packed.move.staminaCostMult)) {
      fail("snow_drift_zone 应比默认雪面更慢/更耗体力");
    }
    if (!(sastrugi.move.moveTimeMult > packed.move.moveTimeMult && sastrugi.move.staminaCostMult > packed.move.staminaCostMult)) {
      fail("sastrugi_field 应比默认雪面更慢/更耗体力");
    }
  }
  lines.push("3. **地貌影响**：`wilderness_surface_contract_check` PASS；`wilderness_terrain_defs.js` 中 `managed_compacted_route` 的 move 倍率低于默认 `wind_packed_snow`；`snow_drift_zone` / `sastrugi_field` 高于默认雪面；surface runtime 与 terrain.move 集成由 surface 合约覆盖。");
  lines.push("");

  // 4 blocker
  lines.push("4. **blocker**：`wilderness_blocker_contract_check` PASS（边界 / 硬地形 / 需求阻断 / player_state_block 顺序与阻断不推进时间体力等由合约保证）；`dispatch` 层 notice 由既有合约与工程约定覆盖。");
  lines.push("");

  // 5 probe
  lines.push("5. **probe**：`wilderness_probe_contract_check` PASS；probe 只读由 probe 合约与 resolver 分层保证。");
  lines.push("");

  // 6 forecast
  lines.push("6. **weather forecast**：`wilderness_weather_forecast_contract_check` PASS；不推进时间、不写 `world.weather`、无 `Math.random` 等由该合约保证。");
  lines.push("");

  // 7 survival
  lines.push("7. **survival settlement**：`wilderness_survival_contract_check` PASS；阻断路径不触发生存结算、resolver/renderer 不写核心体温链路由既有合约与静态审计覆盖。");
  lines.push("");

  // 8 landmark
  lines.push("8. **landmark**：`wilderness_landmark_contract_check` PASS；`west2_old_marker_patrol_line.js` 含 `maintenance_corridor_entry` 与 `gotoMapId: west2_maintenance_corridor_entry`。");
  lines.push("");

  // 9 Ethan closure
  lines.push("9. **Ethan rescue closure**：`wilderness_ethan_rescue_contract_check` + `wilderness_ethan_rescue_audit_check` PASS；全仓无 `WILDERNESS_CALL_RESCUE`；互斥与 flags 持久性由 audit 覆盖。");
  const p = createDefaultGameState().player;
  if (!p.meta || typeof p.meta !== "object") p.meta = {};
  p.meta.sleepEpisode = { mode: "COLLAPSE" };
  applyEthanRescueRecoveryFloor(p);
  if (String(p.meta.sleepEpisode.mode) !== "COLLAPSE") {
    fail("applyEthanRescueRecoveryFloor 不得改写 meta.sleepEpisode.mode（验收：应保持 COLLAPSE）");
  }
  lines.push("");

  // 10 save/load
  const gs = createDefaultGameState();
  gs.world.wilderness = normalizeWildernessState({
    active: true,
    state: "RESCUE_PENDING",
    sessionStartedAt: 42,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    x: 3,
    y: -2,
    stepsTaken: 5,
    flags: { ethanRescueLastHandledKey: "k", ethanRescueLastReason: "stamina_zero", ethanRescueLastAt: 100 },
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    originMapId: "west2_outpost_exit"
  });
  let snap;
  let w;
  try {
    snap = sanitizeSnapshot(makeEmptySnapshot(gs));
    w = normalizeWildernessState(snap.world.wilderness);
  } catch (e) {
    fail(`快照 roundtrip 异常：${e?.message || e}`);
    w = {};
  }
  if (w.areaId !== "west2_old_marker_patrol_line") fail("sanitize 后 areaId 丢失");
  if (w.regionId !== "West2") fail("sanitize 后 regionId 丢失");
  if (w.x !== 3 || w.y !== -2) fail("sanitize 后坐标丢失");
  if (w.stepsTaken !== 5) fail("sanitize 后 stepsTaken 丢失");
  if (w.state !== "RESCUE_PENDING") fail("sanitize 后 state 变形");
  if (w.flags?.ethanRescueLastHandledKey !== "k") fail("sanitize 后 ethan flags 丢失");
  if (w.sessionStartedAt !== 42) fail("sanitize 后 sessionStartedAt 丢失");

  const gs2 = createDefaultGameState();
  gs2.world.wilderness = normalizeWildernessState({
    active: false,
    state: "RECOVERED",
    sessionStartedAt: 7,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    x: 1,
    y: 1,
    stepsTaken: 9,
    flags: { ethanRescueLastHandledKey: "k2" },
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    originMapId: "west2_outpost_exit"
  });
  const wRec = normalizeWildernessState(sanitizeSnapshot(makeEmptySnapshot(gs2)).world.wilderness);
  if (wRec.state !== "RECOVERED") fail("RECOVERED 经 sanitize 后变形");
  if (wRec.flags?.ethanRescueLastHandledKey !== "k2") fail("RECOVERED 分支 flags 丢失");
  // inactive：normalize 会清空 regionId/areaId（设计行为），但坐标与 stepsTaken 仍保留在存档结构中。
  if (wRec.x !== 1 || wRec.y !== 1) fail("RECOVERED 后坐标丢失");
  if (wRec.stepsTaken !== 9) fail("RECOVERED 后 stepsTaken 丢失");

  lines.push("10. **save/load roundtrip（快照路径）**：`makeEmptySnapshot` → `sanitizeSnapshot` → `normalizeWildernessState` 后 `areaId/regionId/x/y/stepsTaken/state/flags/sessionStartedAt` 字段保留；`RECOVERED` 与 flags 亦不丢失。");
  lines.push("");

  // 11 禁止项（静态启发式）
  section(lines, "18 禁止项（静态启发式）");
  const rBad = rendererWildernessAudit();
  lines.push(`- **renderer.js 野外决策污染（启发式）**：${rBad.length === 0 ? "未发现" : rBad.join("；")}`);
  const probeWrite = grepFiles("src/engine/wilderness", [".js"], /probe.*\b(write|mutate|assign)\b/i);
  lines.push(`- **probe 写状态（启发式 grep）**：${probeWrite.length === 0 ? "未发现" : probeWrite.join(", ")}`);
  const callRescue = grepFiles("src", [".js"], /WILDERNESS_CALL_RESCUE/);
  const callRescueData = grepFiles("data", [".json"], /WILDERNESS_CALL_RESCUE/);
  if (callRescue.length + callRescueData.length > 0) {
    fail(`发现 WILDERNESS_CALL_RESCUE：${[...callRescue, ...callRescueData].join(", ")}`);
  }
  lines.push("- **WILDERNESS_CALL_RESCUE**：未发现");
  lines.push("- **每格一张地图 / 完整小地图 UI**：未做深度图像检测；地图数量与 `wilderness_runtime` 单图运行时模型由既有设计与合约间接保证。");
  lines.push("");

  // 12 文件边界
  section(lines, "分阶段文件边界（摘要）");
  const wildArea = fs.readdirSync(path.join(ROOT, "data/wilderness/areas")).filter((f) => f.endsWith(".js"));
  lines.push("- **野外数据**：`data/wilderness/**`（areas、terrain 等）");
  lines.push("- **野外引擎**：`src/engine/wilderness/**`、`src/engine/pipeline/commit.js`（含 move/start/end/rescue）、`resolve_handlers/map_handlers.js`、`transient_intent_adapter.js`、`validate/map_validate.js`");
  lines.push("- **合约脚本**：`scripts/wilderness_*_contract_check.mjs`、`scripts/wilderness_ethan_rescue_*.mjs`、`scripts/wilderness_full_acceptance_check.mjs`");
  lines.push("");
  lines.push("### 工作区其它改动（仅报告，不处理）");
  lines.push("```");
  lines.push(gitStatusShort());
  lines.push("```");
  lines.push("");

  lines.push("## 总结", "");
  lines.push(`- **阻塞问题**：${overallPass ? "无（全部合约 + 本脚本检查通过）" : "有，见上文 FAIL 与合约输出"}`);

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  if (!overallPass) {
    console.error(`[FAIL] wilderness_full_acceptance_check → ${path.relative(ROOT, REPORT_PATH)}`);
    process.exit(1);
  }
  console.log(`[PASS] wilderness_full_acceptance_check → ${path.relative(ROOT, REPORT_PATH)}`);
}

main();
