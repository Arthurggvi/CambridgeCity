import { getDayIndexFromTotalMinutes, normalizeTotalMinutes } from "./daily_open_window.js";
import {
  MARG_FRONTDESK_DUTY_BANDS,
  resolveMargFrontdeskDutySnapshot
} from "./marg_frontdesk_duty_provider.js";
import { getSocialEntry } from "./social/social_state.js";

const GREETING_FLAG_ROOT = "world.flags.margFrontdeskGreeting";
const REPEAT_WINDOW_MINUTES = 60;

const GREETING_BANDS = Object.freeze({
  LOW: "marg_frontdesk_greeting_low",
  MID: "marg_frontdesk_greeting_mid",
  HIGH: "marg_frontdesk_greeting_high"
});

const REPEAT_BANDS = Object.freeze({
  NONE: "marg_frontdesk_repeat_none",
  WITHIN_WINDOW: "marg_frontdesk_repeat_within_window"
});

const TEXT_LOW =
  "她尴尬地笑了笑，像是刚从一串索引号里回过神，迟疑地回应了你的招呼。";
const TEXT_MID =
  "玛格从登记册后抬起头，认真地点了点头，像把你的问候妥善归进了某个熟人条目。";
const TEXT_HIGH =
  "玛格一看到你就露出明显轻快的神情，连手边的书目卡片都差点被她碰乱。";
const TEXT_REPEAT =
  "你又打了一次招呼，玛格愣了愣，像在确认这次寒暄是否需要单独编号归档。";

function normalizeFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getGreetingFlags(gameState) {
  const source = gameState?.world?.flags?.margFrontdeskGreeting;
  return source && typeof source === "object" ? source : {};
}

export function resolveGreetingBand(favorBeforeBonus) {
  const favor = Math.trunc(Number(favorBeforeBonus) || 0);
  if (favor >= 70) return GREETING_BANDS.HIGH;
  if (favor >= 30) return GREETING_BANDS.MID;
  return GREETING_BANDS.LOW;
}

function buildTierText(greetingBand) {
  switch (greetingBand) {
    case GREETING_BANDS.HIGH:
      return TEXT_HIGH;
    case GREETING_BANDS.MID:
      return TEXT_MID;
    default:
      return TEXT_LOW;
  }
}

export function resolveMargFrontdeskGreetingOutcome({ gameState, totalMinutes = null } = {}) {
  const resolvedTotalMinutes = normalizeTotalMinutes(totalMinutes ?? gameState?.time?.totalMinutes);
  const dutySnapshot = resolveMargFrontdeskDutySnapshot({ gameState, totalMinutes: resolvedTotalMinutes });
  const socialEntry = getSocialEntry(gameState?.player?.social, "npc_marg");
  const favorBeforeBonus = Math.trunc(Number(socialEntry?.favor || 0));
  const greetingFlags = getGreetingFlags(gameState);
  const lastGreetAtMinutes = normalizeFiniteNumber(greetingFlags.lastGreetAtMinutes);
  const lastRepeatWindowStartAt = normalizeFiniteNumber(greetingFlags.lastRepeatWindowStartAt, lastGreetAtMinutes);
  const repeatCountWithinHour = Math.max(0, Math.trunc(Number(greetingFlags.repeatCountWithinHour || 0)));
  const lastFavorBonusDayIndex = normalizeFiniteNumber(greetingFlags.lastFavorBonusDayIndex, -1);
  const currentDayIndex = getDayIndexFromTotalMinutes(resolvedTotalMinutes);
  const minutesSinceLastGreet =
    lastGreetAtMinutes == null ? null : Math.max(0, resolvedTotalMinutes - lastGreetAtMinutes);
  const withinRepeatWindow =
    Number.isFinite(minutesSinceLastGreet) && minutesSinceLastGreet < REPEAT_WINDOW_MINUTES;

  if (dutySnapshot.band !== MARG_FRONTDESK_DUTY_BANDS.ON_DUTY) {
    return Object.freeze({
      ok: false,
      greetingBand: null,
      repeatBand: REPEAT_BANDS.NONE,
      grantDailyFavorBonus: false,
      logLine: "借阅台前没人应声。",
      effects: Object.freeze([]),
      socialEffects: Object.freeze([])
    });
  }

  const greetingBand = resolveGreetingBand(favorBeforeBonus);
  const isRepeatedWindow = withinRepeatWindow === true;
  const repeatBand = isRepeatedWindow ? REPEAT_BANDS.WITHIN_WINDOW : REPEAT_BANDS.NONE;
  const grantDailyFavorBonus = !isRepeatedWindow && currentDayIndex !== lastFavorBonusDayIndex;
  const logLine = isRepeatedWindow ? TEXT_REPEAT : buildTierText(greetingBand);

  const nextRepeatWindowStartAt = isRepeatedWindow
    ? Number.isFinite(lastRepeatWindowStartAt) && resolvedTotalMinutes - lastRepeatWindowStartAt < REPEAT_WINDOW_MINUTES
      ? lastRepeatWindowStartAt
      : resolvedTotalMinutes
    : resolvedTotalMinutes;
  const nextRepeatCountWithinHour = isRepeatedWindow ? repeatCountWithinHour + 1 : 0;

  const effects = [
    { op: "push", path: "logLines", value: logLine },
    { op: "set", path: `${GREETING_FLAG_ROOT}.lastGreetAtMinutes`, value: resolvedTotalMinutes },
    { op: "set", path: `${GREETING_FLAG_ROOT}.lastRepeatWindowStartAt`, value: nextRepeatWindowStartAt },
    { op: "set", path: `${GREETING_FLAG_ROOT}.repeatCountWithinHour`, value: nextRepeatCountWithinHour }
  ];
  if (grantDailyFavorBonus) {
    effects.push({ op: "set", path: `${GREETING_FLAG_ROOT}.lastFavorBonusDayIndex`, value: currentDayIndex });
  }

  const socialEffects = grantDailyFavorBonus
    ? [{ type: "favor_delta", npcId: "npc_marg", delta: 2, reason: "marg_frontdesk_daily_greeting_bonus" }]
    : [];

  return Object.freeze({
    ok: true,
    greetingBand,
    repeatBand,
    grantDailyFavorBonus,
    logLine,
    effects: Object.freeze(effects),
    socialEffects: Object.freeze(socialEffects)
  });
}
