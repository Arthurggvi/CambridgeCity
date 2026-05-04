import { escapeHtml } from "./text_escape.js";
import { getCalendarViewFromTotalMinutes } from "../calendar_model.js";
import { PLAYER_DEFS } from "../player_defs.js";
import {
  PROFILE_DISPLAY_LEVEL_BANDS,
  PROFILE_WORLDVIEW_AXIS_MAX,
  PROFILE_WORLDVIEW_AXIS_MIN,
  getProfileDisplayLevelByXp,
  getProfileTotalXp,
  getXpThresholdForLevel,
  normalizeProfileDisplayLevelValue
} from "../profile/defs.js";
import { buildInstitutionalPortraitSvg, getDossierPortraitPlaceholder } from "../profile/profile_portrait_asset.js";
import {
  getProfileOverlayUiState,
  rememberProfileOverlayAnnotationScrollTop,
  setProfileOverlaySelectedAttrId,
  syncProfileOverlayWorldviewAxisMotion
} from "../profile_overlay_controller.js";

const ATTR_META = Object.freeze({
  physique: Object.freeze({
    label: "体格",
    icon: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M10.9 6.9h2.2M10.2 6.9 8 9.2 5.9 11.3 7.3 17h9.4l1.4-5.7L16 9.2l-2.2-2.3'/></svg>",
    levels: Object.freeze({
      EX: "我已能把寒冷、劳损与重压压回到身体之外。",
      "4": "我能拖着疲惫继续前进，代价开始变得可控。",
      "3": "血肉开始服从训练，体力不再只靠咬牙硬撑。",
      "2": "我正在学会让身体承担更久的消耗与负载。",
      "1": "我才刚开始适应这片土地对身体的索取。",
      "0": "我仍主要依赖本能去对抗疲惫与寒意。"
    })
  }),
  experience: Object.freeze({
    label: "阅历",
    icon: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M6 4.5h7.7L18 8.8V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V6A1.5 1.5 0 0 1 6 4.5zM13.6 4.6V8.7H18M8 11h7.8M8 14h7.8M8 17h4.6M16.8 16.1h1.7'/></svg>",
    levels: Object.freeze({
      EX: "我已能在规章、话术与利益之间迅速辨认真正的走向。",
      "4": "我能从一句客套话里，听出它真正打算拿走什么。",
      "3": "我开始懂得看清体面话背后的真实安排。",
      "2": "我正在从流程与沉默里辨认出局势的轮廓。",
      "1": "我才刚意识到，纸面规则和现实规则并不相同。",
      "0": "我仍容易把别人递来的话，当成表面上的意思。"
    })
  }),
  rationality: Object.freeze({
    label: "理性",
    icon: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 4.8c.8 0 1.5.7 1.5 1.5S12.8 7.8 12 7.8s-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zM12 7.8L8.4 18.9M12 7.8l3.6 11.1M8.4 18.9h2.3M15.6 18.9h-2.3M9.9 14.2h4.2M7 20h10'/></svg>",
    levels: Object.freeze({
      EX: "我已能在噪声与混乱里，稳住判断的骨架。",
      "4": "我能在压力下保持推断，不轻易被表象带偏。",
      "3": "我开始沿着因果追问，而不是停留在直觉。",
      "2": "我正在让判断脱离冲动，逐步变得可检验。",
      "1": "我才刚学会怀疑第一反应，并追问缘由。",
      "0": "我的理解仍像散点，尚未稳稳连成结构。"
    })
  }),
  faith: Object.freeze({
    label: "信仰",
    icon: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 4.4c1.7 1.4 2.7 2.9 2.7 4.8 0 1.6-1.2 2.9-2.7 2.9s-2.7-1.3-2.7-2.9c0-1.9 1-3.4 2.7-4.8zM12 12.3v5.6M9.2 19.4h5.6M10.2 8.9c.3-.9.9-1.7 1.8-2.3'/></svg>",
    levels: Object.freeze({
      EX: "我已能在长夜里维持内心秩序，不轻易向恐惧让步。",
      "4": "寒意还在，但我已能凭心里的誓言站稳。",
      "3": "我开始相信，有些路即便无人照明也值得走到底。",
      "2": "我正在守住一束火，免得意志先于身体熄灭。",
      "1": "我才刚把希望安放在某个名字之下。",
      "0": "我心中的光还很弱，只够照见眼前的短路。"
    })
  })
});

const WORLDVIEW_AXIS_MIN = PROFILE_WORLDVIEW_AXIS_MIN;
const WORLDVIEW_AXIS_MAX = PROFILE_WORLDVIEW_AXIS_MAX;
const WORLDVIEW_LABELS = Object.freeze({
  rational: "理性",
  faith: "信仰",
  neutral: "中轴"
});

const PROFILE_EFFECT_META = Object.freeze({
  staminaDecayModifier: Object.freeze({ label: "体力衰减倍率", direction: "lower-better" }),
  satietyDecayModifier: Object.freeze({ label: "饱腹衰减倍率", direction: "lower-better" }),
  hpDrainModifier: Object.freeze({ label: "健康流失倍率", direction: "lower-better" }),
  thermoLossModifier: Object.freeze({ label: "体温流失倍率", direction: "lower-better" }),
  negotiationSkillModifier: Object.freeze({ label: "交涉修正倍率", direction: "higher-better" }),
  specialCostModifier: Object.freeze({ label: "特殊消耗倍率", direction: "lower-better" }),
  canLearnNegotiationEvents: Object.freeze({ label: "交涉习得事件", booleanText: "已开放", direction: "positive" })
});

function getDisplayLevelText(displayLevel) {
  return displayLevel === "EX" ? "Lv.EX" : `Lv.${displayLevel}`;
}

function formatModifierMultiplier(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `x${numeric.toFixed(2)}`;
}

function resolveEffectTone(meta, value) {
  if (typeof value === "boolean") {
    return value ? "positive" : "neutral";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "neutral";
  if (meta?.direction === "lower-better") {
    if (numeric < 1) return "positive";
    if (numeric > 1) return "negative";
    return "neutral";
  }
  if (meta?.direction === "higher-better") {
    if (numeric > 1) return "positive";
    if (numeric < 1) return "negative";
    return "neutral";
  }
  return "neutral";
}

function buildEffectEntry(key, value) {
  const meta = PROFILE_EFFECT_META[key] || null;
  if (!meta) return null;
  if (typeof value === "boolean") {
    if (value !== true) return null;
    return {
      key,
      label: meta.label,
      valueText: meta.booleanText || "生效中",
      tone: resolveEffectTone(meta, value)
    };
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 1) return null;
  return {
    key,
    label: meta.label,
    valueText: formatModifierMultiplier(numeric),
    tone: resolveEffectTone(meta, numeric)
  };
}

function buildCurrentEffectsVm(row, emptyText) {
  const items = [];
  const source = row && typeof row === "object" ? row : null;
  if (source) {
    for (const [key, value] of Object.entries(source)) {
      const entry = buildEffectEntry(key, value);
      if (entry) items.push(entry);
    }
  }
  return {
    title: "当前生效",
    emptyText,
    items
  };
}

function resolveProfileModifierRow(groupKey, displayLevel) {
  const normalizedLevel = normalizeProfileDisplayLevelValue(displayLevel);
  if (normalizedLevel === null) return null;
  return PLAYER_DEFS?.profileModifiers?.[groupKey]?.[normalizedLevel] || null;
}

function clampRatio(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function buildProfileLevelProgressVm(profile, key, displayLevel) {
  const level = String(displayLevel || "0").trim().toUpperCase();
  const xp = Math.max(0, Math.trunc(Number(profile?.[key]?.xp || 0)));
  if (level === "EX") {
    const totalXp = getProfileTotalXp(key, profile?.[key]?.level, profile?.[key]?.xp);
    return {
      currentExp: Math.max(0, Math.trunc(Number(totalXp) || 0)),
      nextLevelExp: null,
      ratio: 1,
      isMaxLevel: true,
      level
    };
  }

  const currentLevel = Math.max(0, Math.trunc(Number(profile?.[key]?.level || 0)));
  const nextLevelExp = Math.max(1, Math.trunc(Number(getXpThresholdForLevel(key, currentLevel) || 1)));
  return {
    currentExp: xp,
    nextLevelExp,
    ratio: clampRatio(xp / nextLevelExp),
    isMaxLevel: false,
    level
  };
}

function getNextWorldviewThreshold(axisAbs) {
  const nextBand = PROFILE_DISPLAY_LEVEL_BANDS.find((row) => {
    const minXp = Math.max(0, Math.trunc(Number(row?.minXp) || 0));
    return minXp > axisAbs && minXp <= WORLDVIEW_AXIS_MAX;
  });
  return nextBand ? Math.max(0, Math.trunc(Number(nextBand.minXp) || 0)) : null;
}

function buildWorldviewProgressVm(axisAbs, displayLevel) {
  const nextLevelExp = getNextWorldviewThreshold(axisAbs);
  return {
    currentExp: axisAbs,
    nextLevelExp,
    ratio: nextLevelExp == null ? 1 : clampRatio(axisAbs / nextLevelExp),
    isMaxLevel: nextLevelExp == null,
    level: String(displayLevel || "0").trim().toUpperCase()
  };
}

function buildWorldviewAxisThresholds() {
  return PROFILE_DISPLAY_LEVEL_BANDS.map((row) => ({
    level: String(row?.label || "0").trim().toUpperCase(),
    threshold: Math.max(0, Math.trunc(Number(row?.minXp) || 0)),
    label: getDisplayLevelText(String(row?.label || "0").trim().toUpperCase())
  }));
}

function getWorldviewAxisScaleMaxThreshold() {
  const thresholds = PROFILE_DISPLAY_LEVEL_BANDS
    .map((row) => Math.max(0, Math.trunc(Number(row?.minXp) || 0)))
    .filter((value) => value > 0);
  return thresholds.length > 0 ? Math.max(...thresholds) : Math.max(1, WORLDVIEW_AXIS_MAX);
}

function normalizeWorldviewAxisScalePosition(value, scaleMax) {
  const numeric = Math.max(0, Number(value) || 0);
  const max = Math.max(1, Number(scaleMax) || 1);
  return clampRatio(numeric / max);
}

function buildWorldviewAxisScaleVm({ currentAxis = 0, currentLevel = "0" } = {}) {
  const extremeLabelInsetPx = 12;
  const thresholds = buildWorldviewAxisThresholds();
  const scaleMax = getWorldviewAxisScaleMaxThreshold();
  const axis = clampWorldviewAxis(currentAxis);
  const absAxis = Math.abs(axis);
  const currentMagnitudePosition = normalizeWorldviewAxisScalePosition(absAxis, scaleMax);
  const currentPosition01 = axis < 0
    ? 0.5 - (currentMagnitudePosition * 0.5)
    : 0.5 + (currentMagnitudePosition * 0.5);

  const ticks = [];
  for (const row of thresholds) {
    const level = row.level;
    const threshold = row.threshold;
    const magnitudePosition = normalizeWorldviewAxisScalePosition(threshold, scaleMax);
    const isCenter = threshold === 0;
    const isMajor = isCenter || level === "EX" || level === "2" || level === "4";
    const showLabel = isMajor;

    if (isCenter) {
      ticks.push({
        level,
        threshold,
        side: "center",
        position01: 0.5,
        isMajor,
        showLabel,
        label: row.label
      });
      continue;
    }

    for (const side of ["faith", "rational"]) {
      const isEndCap = level === "EX";
      ticks.push({
        level,
        threshold,
        side,
        position01: side === "faith"
          ? 0.5 - (magnitudePosition * 0.5)
          : 0.5 + (magnitudePosition * 0.5),
        isMajor,
        showLabel,
        label: row.label,
        isEndCap,
        labelOffsetPx: isEndCap
          ? (side === "faith" ? extremeLabelInsetPx : extremeLabelInsetPx * -1)
          : 0
      });
    }
  }

  return {
    thresholds,
    ticks,
    currentPosition01,
    zeroPosition01: 0.5,
    currentAxis,
    currentLevel: String(currentLevel || "0")
  };
}

function buildWorldviewAxisVm(axis, displayLevel) {
  const scaleVm = buildWorldviewAxisScaleVm({ currentAxis: axis, currentLevel: displayLevel });
  return {
    currentAxis: axis,
    currentLevel: String(displayLevel || "0"),
    thresholds: scaleVm.thresholds,
    ticks: scaleVm.ticks,
    currentPosition01: scaleVm.currentPosition01,
    zeroPosition01: scaleVm.zeroPosition01,
    currentAxisLabel: axis > 0 ? `Axis +${axis}` : `Axis ${axis}`,
    sideLabels: {
      left: WORLDVIEW_LABELS.faith,
      right: WORLDVIEW_LABELS.rational
    },
    zeroLabel: "0"
  };
}

function resolveAttrDisplayLevel(profile, key) {
  if (key === "physique") {
    return getProfileDisplayLevelByXp(getProfileTotalXp("physique", profile?.physique?.level, profile?.physique?.xp));
  }
  if (key === "experience") {
    return getProfileDisplayLevelByXp(getProfileTotalXp("experience", profile?.experience?.level, profile?.experience?.xp));
  }
  if (key === "rationality") {
    return getProfileDisplayLevelByXp(Number(profile?.rationalityDisplay || 0));
  }
  if (key === "faith") {
    return getProfileDisplayLevelByXp(Number(profile?.faithDisplay || 0));
  }
  return "0";
}

function clampWorldviewAxis(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(WORLDVIEW_AXIS_MIN, Math.min(WORLDVIEW_AXIS_MAX, Math.trunc(n)));
}

function resolveWorldviewSide(axis) {
  if (axis > 0) return "rational";
  if (axis < 0) return "faith";
  return "neutral";
}

function resolveWorldviewKey(side) {
  if (side === "rational") return "rationality";
  if (side === "faith") return "faith";
  return null;
}

function toDisplayLevelText(displayLevel) {
  return displayLevel === "EX" ? "EX" : `Lv.${displayLevel}`;
}

function getAttrValueHint(profile, key) {
  if (key === "physique") return `经验 ${Math.max(0, Number(profile?.physique?.xp || 0))}`;
  if (key === "experience") return `经验 ${Math.max(0, Number(profile?.experience?.xp || 0))}`;
  const axis = Math.max(0, Number(key === "rationality" ? profile?.rationalityDisplay : profile?.faithDisplay) || 0);
  return `轴向 ${axis}`;
}

function resolveAttrDescription(key, displayLevel) {
  const meta = ATTR_META[key] || null;
  if (!meta) return "";
  return String(meta.levels?.[displayLevel] || meta.levels?.["0"] || "");
}

function resolveIdentityText(worldFlags = {}) {
  if (worldFlags.govHallHasCitizenId === true) return "公民身份证明";
  if (worldFlags.govHallHasTempId === true || worldFlags.dossierUnlocked === true) return "临时身份证明";
  return "身份未记载";
}

function formatDossierCreatedAt(totalMinutes, world = {}) {
  const n = Number(totalMinutes);
  if (!Number.isFinite(n)) return null;
  const calendarView = getCalendarViewFromTotalMinutes(n, world);
  const minuteOfDay = Math.max(0, Number(calendarView?.minuteOfDay || 0));
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return `第${calendarView.year}年 ${calendarView.month}月${calendarView.day}日 ${hh}:${mm}`;
}

function buildAttributeAnnotation(attribute, currentEffectsVm) {
  return {
    title: attribute.label,
    status: attribute.valueText,
    body: [attribute.description].filter(Boolean),
    currentEffectsVm
  };
}

function buildAttributeViewModel(profile, key) {
  const meta = ATTR_META[key];
  const displayLevel = resolveAttrDisplayLevel(profile, key);
  const valueText = toDisplayLevelText(displayLevel);
  const valueHint = getAttrValueHint(profile, key);
  const description = resolveAttrDescription(key, displayLevel);
  const modifierGroupKey = key === "physique" ? "staminaLevelModifiers" : "experienceLevelModifiers";
  const currentEffectsVm = buildCurrentEffectsVm(
    resolveProfileModifierRow(modifierGroupKey, displayLevel),
    "当前等级暂无直接效果"
  );
  const attribute = {
    id: key,
    label: meta.label,
    icon: meta.icon,
    valueText,
    valueHint,
    description,
    annotationProgressVm: buildProfileLevelProgressVm(profile, key, displayLevel)
  };
  attribute.annotationView = buildAttributeAnnotation(attribute, currentEffectsVm);
  return attribute;
}

function buildWorldviewAxisViewModel(profile) {
  const axis = clampWorldviewAxis(profile?.worldview?.axis);
  const side = resolveWorldviewSide(axis);
  const axisAbs = Math.abs(axis);
  const worldviewKey = resolveWorldviewKey(side);
  const displayLevel = side === "neutral"
    ? "0"
    : getProfileDisplayLevelByXp(axisAbs);
  const valueText = toDisplayLevelText(displayLevel);
  const activeTitle = worldviewKey ? ATTR_META[worldviewKey].label : "";
  const activeSummary = worldviewKey ? resolveAttrDescription(worldviewKey, displayLevel) : "";
  const axisText = axis > 0 ? `+${axis}` : `${axis}`;
  const levelAndAxisText = side === "neutral"
    ? "中轴 0"
    : `${valueText} · Axis ${axisText}`;
  const axisVm = buildWorldviewAxisVm(axis, displayLevel);
  const currentEffectsVm = buildCurrentEffectsVm(
    resolveProfileModifierRow("rationalFaithSharedModifiers", displayLevel),
    "当前轴位暂无直接效果"
  );

  return {
    id: "worldview_axis",
    kind: "worldview-axis",
    label: "世界观轴",
    title: "世界观轴",
    valueText,
    worldviewAxisValue: axis,
    worldviewAxisAbs: axisAbs,
    worldviewSide: side,
    worldviewLevel: displayLevel,
    worldviewActiveTitle: activeTitle,
    worldviewActiveSummary: activeSummary,
    worldviewIndicatorPercent: ((axis - WORLDVIEW_AXIS_MIN) / (WORLDVIEW_AXIS_MAX - WORLDVIEW_AXIS_MIN)) * 100,
    worldviewAxisVm: axisVm,
    worldviewReadout: levelAndAxisText,
    description: side === "neutral" ? "" : activeSummary,
    annotationProgressVm: buildWorldviewProgressVm(axisAbs, displayLevel),
    annotationView: {
      title: side === "neutral" ? "世界观轴" : activeTitle,
      status: side === "neutral" ? levelAndAxisText : valueText,
      body: [activeSummary].filter(Boolean),
      currentEffectsVm
    }
  };
}

export function buildProfileOverlayViewModel(input = {}) {
  const profile = input?.profileViewModel && typeof input.profileViewModel === "object"
    ? input.profileViewModel
    : {
      physique: { level: 0, xp: 0 },
      experience: { level: 0, xp: 0 },
      worldview: { axis: 0 },
      rationalityDisplay: 0,
      faithDisplay: 0,
      unlocks: { nodes: [], flags: [] }
    };
  const worldFlags = input?.worldFlags && typeof input.worldFlags === "object" ? input.worldFlags : {};
  const createdAtText = formatDossierCreatedAt(profile?.dossierCreatedAtMinutes, input?.world || {});

  return {
    kind: "profile-page",
    mapName: String(input?.mapName || "当前区域"),
    portraitPlaceholder: getDossierPortraitPlaceholder(),
    header: {
      title: "角色档案",
      identity: resolveIdentityText(worldFlags),
      dossierCreatedAtMinutes: profile?.dossierCreatedAtMinutes ?? null,
      createdAtText,
      titleMetaText: `建档时间：${createdAtText || "——"}`
    },
    attributes: [
      buildAttributeViewModel(profile, "physique"),
      buildAttributeViewModel(profile, "experience"),
      buildWorldviewAxisViewModel(profile)
    ],
    annotation: {
      title: "批注页",
      emptyTitle: "暂无批注",
      emptyText: "选择一张属性卡，以查看当前档案批注。"
    }
  };
}

function renderAnnotationMarkup(viewModel, selectedAttrId) {
  const selected = viewModel.attributes.find((row) => row.id === selectedAttrId) || null;
  if (!selected) {
    return `
      <div class="profile-page-annotation-empty">
        <h3 class="profile-page-annotation-empty-title">${escapeHtml(viewModel.annotation.emptyTitle)}</h3>
        <p class="profile-page-annotation-empty-copy">${escapeHtml(viewModel.annotation.emptyText)}</p>
      </div>
    `;
  }

  const note = selected.annotationView;
  if (note?.blank === true) {
    return "";
  }
  const progressMarkup = renderAnnotationProgressMarkup(selected.annotationProgressVm);
  const currentEffectsMarkup = renderAnnotationCurrentEffectsMarkup(note.currentEffectsVm);
  return `
    <div class="profile-page-annotation-copy">
      <div class="profile-page-annotation-status">${escapeHtml(note.status)}</div>
      <h3 class="profile-page-annotation-title">${escapeHtml(note.title)}</h3>
      ${note.body.map((paragraph) => `<p class="profile-page-annotation-paragraph">${escapeHtml(paragraph)}</p>`).join("")}
      ${progressMarkup}
      ${currentEffectsMarkup}
    </div>
  `;
}

function renderAnnotationProgressMarkup(progressVm) {
  if (!progressVm || typeof progressVm !== "object") return "";
  const ratio = clampRatio(progressVm.ratio) * 100;
  const currentExp = Math.max(0, Math.trunc(Number(progressVm.currentExp) || 0));
  const nextLevelExp = progressVm.nextLevelExp == null ? null : Math.max(0, Math.trunc(Number(progressVm.nextLevelExp) || 0));
  const maxLabel = progressVm.isMaxLevel === true ? "已满级" : String(nextLevelExp || 0);
  return `
    <section class="profile-page-annotation-progress" aria-label="进度">
      <div class="profile-page-annotation-progress-label">进度</div>
      <div class="profile-page-annotation-progress-track" aria-hidden="true" style="--profile-annotation-progress:${ratio.toFixed(2)}%;">
        <span class="profile-page-annotation-progress-track-base"></span>
        <span class="profile-page-annotation-progress-track-fill"></span>
        <span class="profile-page-annotation-progress-track-marker"></span>
      </div>
      <div class="profile-page-annotation-progress-readout">
        <span class="profile-page-annotation-progress-current">${escapeHtml(String(currentExp))}</span>
        <span class="profile-page-annotation-progress-sep">/</span>
        <span class="profile-page-annotation-progress-next">${escapeHtml(maxLabel)}</span>
      </div>
    </section>
  `;
}

function renderAnnotationCurrentEffectsMarkup(currentEffectsVm) {
  if (!currentEffectsVm || typeof currentEffectsVm !== "object") return "";
  const items = Array.isArray(currentEffectsVm.items) ? currentEffectsVm.items : [];
  const bodyMarkup = items.length > 0
    ? `<div class="profile-page-annotation-effects-list" role="list">${items.map((item) => `
        <div class="profile-page-annotation-effects-item is-${escapeHtml(item.tone || "neutral")}" role="listitem">
          <span class="profile-page-annotation-effects-item-label">${escapeHtml(item.label)}</span>
          <span class="profile-page-annotation-effects-item-value">${escapeHtml(item.valueText)}</span>
        </div>
      `).join("")}</div>`
    : `<div class="profile-page-annotation-effects-empty">${escapeHtml(String(currentEffectsVm.emptyText || ""))}</div>`;
  return `
    <section class="profile-page-annotation-effects" aria-label="当前生效">
      <div class="profile-page-annotation-effects-title">${escapeHtml(String(currentEffectsVm.title || "当前生效"))}</div>
      ${bodyMarkup}
    </section>
  `;
}

function applyAnnotationState(page, viewModel, hostContainer) {
  const state = getProfileOverlayUiState(hostContainer);
  const selectedAttrId = viewModel.attributes.some((row) => row.id === state.selectedAttrId)
    ? state.selectedAttrId
    : null;
  const annotationBody = page.querySelector("[data-profile-annotation-body]");
  const annotationPane = page.querySelector("[data-profile-annotation-pane]");
  if (annotationBody) {
    annotationBody.innerHTML = renderAnnotationMarkup(viewModel, selectedAttrId);
  }
  page.querySelectorAll("[data-profile-attr-id]").forEach((node) => {
    const isSelected = String(node.getAttribute("data-profile-attr-id") || "") === selectedAttrId;
    node.classList.toggle("is-selected", isSelected);
    node.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
  if (annotationPane) {
    annotationPane.scrollTop = Math.max(0, Number(state.annotationScrollTop || 0));
  }
}

function bindProfilePageInteractions(page, viewModel, hostContainer) {
  page.addEventListener("click", (event) => {
    const attrCard = event.target.closest("[data-profile-attr-id]");
    if (!attrCard || !page.contains(attrCard)) return;
    const attrId = String(attrCard.getAttribute("data-profile-attr-id") || "").trim();
    if (!attrId) return;
    setProfileOverlaySelectedAttrId(hostContainer, attrId);
    applyAnnotationState(page, viewModel, hostContainer);
  });

  const annotationPane = page.querySelector("[data-profile-annotation-pane]");
  if (annotationPane) {
    annotationPane.addEventListener("scroll", () => {
      rememberProfileOverlayAnnotationScrollTop(hostContainer, annotationPane.scrollTop);
    });
  }
}

function applyWorldviewAxisMotionState(page, viewModel, hostContainer) {
  const worldviewAttr = Array.isArray(viewModel?.attributes)
    ? viewModel.attributes.find((row) => row?.kind === "worldview-axis") || null
    : null;
  const axisNode = page.querySelector(".profile-page-worldview-card");
  if (!worldviewAttr || !axisNode) return;
  const motionState = syncProfileOverlayWorldviewAxisMotion(hostContainer, {
    currentAxis: worldviewAttr.worldviewAxisValue,
    currentLevel: worldviewAttr.worldviewLevel
  });
  axisNode.classList.toggle("is-axis-active", motionState.isActive === true && motionState.reducedMotion !== true);
  axisNode.classList.toggle("is-axis-pulsing", motionState.isPulsing === true && motionState.reducedMotion !== true);
  axisNode.classList.toggle("is-axis-reduced-motion", motionState.reducedMotion === true);
}

function renderHeaderCard(viewModel) {
  const portraitPlaceholder = viewModel?.portraitPlaceholder && typeof viewModel.portraitPlaceholder === "object"
    ? viewModel.portraitPlaceholder
    : getDossierPortraitPlaceholder();
  return `
    <section class="profile-page-header-card" data-guide-target="profile-overview-card">
      <div class="profile-page-header-main">
        <div class="profile-page-header-main-copy">
          <p class="profile-page-header-eyebrow">档案首页</p>
          <div class="profile-page-title-row">
            <h2 class="profile-page-title">${escapeHtml(viewModel.header.title)}</h2>
            <span class="profile-page-title-meta">${escapeHtml(viewModel.header.titleMetaText)}</span>
          </div>
          <div class="profile-page-header-identity-block">
            <span class="profile-page-header-info-label">人物身份</span>
            <strong class="profile-page-header-info-value">${escapeHtml(viewModel.header.identity)}</strong>
          </div>
        </div>
        <div class="profile-page-portrait-slot" aria-hidden="true">
          <div class="dossier-portrait-shell">
            ${buildInstitutionalPortraitSvg(portraitPlaceholder)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderWorldviewAxisCard(attribute) {
  const side = String(attribute.worldviewSide || "neutral");
  const axisValue = Number(attribute.worldviewAxisValue || 0);
  const axisText = axisValue > 0 ? `+${axisValue}` : `${axisValue}`;
  const axisVm = attribute.worldviewAxisVm && typeof attribute.worldviewAxisVm === "object"
    ? attribute.worldviewAxisVm
    : buildWorldviewAxisVm(axisValue, attribute.worldviewLevel);
  const descriptionMarkup = attribute.description
    ? `<div class="profile-page-worldview-card-desc">${escapeHtml(attribute.description)}</div>`
    : "";
  const tickMarkup = Array.isArray(axisVm.ticks)
    ? axisVm.ticks.map((row) => `
      <span
        class="profile-page-worldview-card-tick${row.isMajor ? " is-major" : " is-minor"}${row.showLabel ? " has-label" : ""}${row.isEndCap ? " is-end-cap" : ""}"
        data-worldview-tick-side="${escapeHtml(row.side)}"
        style="left:${(Number(row.position01 || 0) * 100).toFixed(2)}%;--profile-worldview-label-offset:${Number(row.labelOffsetPx || 0)}px;"
        aria-hidden="true"
      >
        <span class="profile-page-worldview-card-tick-line"></span>
        ${row.showLabel ? `<span class="profile-page-worldview-card-tick-label">${escapeHtml(row.label)}</span>` : ""}
      </span>
    `).join("")
    : "";

  return `
    <button
      type="button"
      class="profile-page-attr-card profile-page-worldview-card"
      data-profile-attr-id="${escapeHtml(attribute.id)}"
      data-worldview-side="${escapeHtml(side)}"
      aria-pressed="false"
      style="--profile-worldview-indicator:${(Number(axisVm.currentPosition01 || 0.5) * 100).toFixed(2)}%;--profile-worldview-zero:${(Number(axisVm.zeroPosition01 || 0.5) * 100).toFixed(2)}%;"
    >
      <div class="profile-page-worldview-card-header">
        <span class="profile-page-worldview-card-title">${escapeHtml(attribute.title)}</span>
        <span class="profile-page-worldview-card-readout">${escapeHtml(attribute.valueText)} · Axis ${escapeHtml(axisText)}</span>
      </div>
      <div class="profile-page-worldview-card-axis-block">
        <div class="profile-page-worldview-card-track" aria-hidden="true">
          <span class="profile-page-worldview-card-track-line"></span>
          <span class="profile-page-worldview-card-track-active-segment"></span>
          ${tickMarkup}
          <span class="profile-page-worldview-card-track-zero"></span>
          <span class="profile-page-worldview-card-track-indicator">
            <span class="profile-page-worldview-card-track-indicator-halo"></span>
            <span class="profile-page-worldview-card-track-indicator-dot"></span>
          </span>
          <span class="profile-page-worldview-card-track-axis-label">${escapeHtml(axisVm.currentAxisLabel || `Axis ${axisText}`)}</span>
        </div>
        <div class="profile-page-worldview-card-labels" aria-hidden="true">
          <span class="profile-page-worldview-card-label profile-page-worldview-card-label-faith">${escapeHtml(axisVm.sideLabels?.left || WORLDVIEW_LABELS.faith)}</span>
          <span class="profile-page-worldview-card-label profile-page-worldview-card-label-center">${escapeHtml(axisVm.zeroLabel || "0")}</span>
          <span class="profile-page-worldview-card-label profile-page-worldview-card-label-rational">${escapeHtml(axisVm.sideLabels?.right || WORLDVIEW_LABELS.rational)}</span>
        </div>
      </div>
      ${descriptionMarkup}
    </button>
  `;
}

function renderStandardAttributeCard(attribute) {
  return `
    <button
      type="button"
      class="profile-page-attr-card"
      data-profile-attr-id="${escapeHtml(attribute.id)}"
      aria-pressed="false"
    >
      <span class="profile-page-attr-card-icon">${attribute.icon}</span>
      <span class="profile-page-attr-card-body">
        <span class="profile-page-attr-card-name">${escapeHtml(attribute.label)}</span>
        <span class="profile-page-attr-card-value">${escapeHtml(attribute.valueText)}</span>
      </span>
      <span class="profile-page-attr-card-desc">${escapeHtml(attribute.description)}</span>
    </button>
  `;
}

function renderAttributeGrid(viewModel) {
  return viewModel.attributes.map((attribute) => {
    if (attribute.kind === "worldview-axis") {
      return renderWorldviewAxisCard(attribute);
    }
    return renderStandardAttributeCard(attribute);
  }).join("");
}

export function renderProfileOverlayPage(viewModel, hostContainer) {
  const safeViewModel = viewModel && typeof viewModel === "object"
    ? viewModel
    : buildProfileOverlayViewModel();

  hostContainer.setAttribute("aria-hidden", "false");
  hostContainer.hidden = false;

  const overlay = document.createElement("div");
  overlay.className = "profile-page-overlay";

  const backdrop = document.createElement("div");
  backdrop.className = "profile-page-backdrop";
  overlay.appendChild(backdrop);

  const page = document.createElement("section");
  page.className = "profile-page-dialog profile-page-shell";
  page.setAttribute("role", "dialog");
  page.setAttribute("aria-modal", "true");
  page.innerHTML = `
    <header class="profile-page-topbar">
      <div class="profile-page-topbar-copy">
        <div class="profile-page-topbar-title">角色档案</div>
        <div class="profile-page-topbar-location">${escapeHtml(safeViewModel.mapName)}</div>
      </div>
      <button type="button" class="profile-page-close" data-action-id="ui_profile_close" aria-label="关闭档案页">×</button>
    </header>
    ${renderHeaderCard(safeViewModel)}
    <div class="profile-page-body">
      <main class="profile-page-main">
        <section class="profile-page-attribute-section" data-guide-target="profile-core-attrs">
          <div class="profile-page-section-title">核心属性区</div>
          <div class="profile-page-attr-grid">${renderAttributeGrid(safeViewModel)}</div>
        </section>
      </main>
      <aside class="profile-page-annotation-pane" data-guide-target="profile-annotation-pane" data-profile-annotation-pane>
        <div class="profile-page-section-title">${escapeHtml(safeViewModel.annotation.title)}</div>
        <div class="profile-page-annotation-body" data-profile-annotation-body></div>
      </aside>
    </div>
  `;

  bindProfilePageInteractions(page, safeViewModel, hostContainer);
  applyAnnotationState(page, safeViewModel, hostContainer);
  applyWorldviewAxisMotionState(page, safeViewModel, hostContainer);
  overlay.appendChild(page);
  hostContainer.appendChild(overlay);
}
