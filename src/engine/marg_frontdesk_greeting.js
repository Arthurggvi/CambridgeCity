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
  FIRST: "marg_frontdesk_repeat_first",
  REPEATED: "marg_frontdesk_repeat_repeated",
  NONE: "marg_frontdesk_repeat_none"
});

function normalizeFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getGreetingFlags(gameState) {
  const source = gameState?.world?.flags?.margFrontdeskGreeting;
  return source && typeof source === "object" ? source : {};
}

function resolveGreetingBand(favorBeforeBonus) {
  const favor = Math.trunc(Number(favorBeforeBonus) || 0);
  if (favor >= 10) return GREETING_BANDS.HIGH;
  if (favor >= 4) return GREETING_BANDS.MID;
  return GREETING_BANDS.LOW;
}

function buildGreetingText(greetingBand) {
  switch (greetingBand) {
    case GREETING_BANDS.HIGH:
      return "你朝柜台那边点了点头。玛格立刻把手里的登记册合上，冲你露出一个很熟的笑：\"你来啦？今天要查书，还是随便看看？\"";
    case GREETING_BANDS.MID:
      return "你先抬手和她打了个招呼。玛格扶着高凳边沿坐直了一点，卷发轻轻一晃：\"你好。借阅台这边现在有空，要查什么可以直接问我。\"";
    default:
      return "你朝借阅台打了个招呼。玛格像是才从账册里回过神，赶紧把章和登记册拢好：\"你好，这里是借阅台。要登记、找书，或者不清楚规矩的话，都可以先问我。\"";
  }
}

function buildRepeatText(repeatBand) {
  if (repeatBand === REPEAT_BANDS.FIRST) {
    return "你刚离开没多久又折了回来。玛格愣了一下，随即抿着笑：\"怎么啦，还有别的事？\"";
  }
  return "你又在借阅台前停下。玛格把下巴往柜台上一搁，声音放得很轻：\"嗯，我还在。你慢慢说。\"";
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
  const minutesSinceLastGreet = lastGreetAtMinutes == null ? null : Math.max(0, resolvedTotalMinutes - lastGreetAtMinutes);
  const withinRepeatWindow = Number.isFinite(minutesSinceLastGreet) && minutesSinceLastGreet < REPEAT_WINDOW_MINUTES;

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
  const repeatBand = !isRepeatedWindow
    ? REPEAT_BANDS.NONE
    : (repeatCountWithinHour <= 0 || !Number.isFinite(lastRepeatWindowStartAt) || resolvedTotalMinutes - lastRepeatWindowStartAt >= REPEAT_WINDOW_MINUTES)
      ? REPEAT_BANDS.FIRST
      : REPEAT_BANDS.REPEATED;
  const grantDailyFavorBonus = !isRepeatedWindow && currentDayIndex !== lastFavorBonusDayIndex;
  const logLine = isRepeatedWindow ? buildRepeatText(repeatBand) : buildGreetingText(greetingBand);
  const nextRepeatWindowStartAt = isRepeatedWindow
    ? (Number.isFinite(lastRepeatWindowStartAt) && resolvedTotalMinutes - lastRepeatWindowStartAt < REPEAT_WINDOW_MINUTES
        ? lastRepeatWindowStartAt
        : resolvedTotalMinutes)
    : resolvedTotalMinutes;
  const nextRepeatCountWithinHour = !isRepeatedWindow
    ? 0
    : (repeatBand === REPEAT_BANDS.FIRST ? 1 : repeatCountWithinHour + 1);

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