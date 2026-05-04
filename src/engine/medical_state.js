function toNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

function toBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function clonePlain(value, fallback) {
  if (value == null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function normalizePendingBlocker(rawBlocker) {
  if (!rawBlocker || typeof rawBlocker !== "object" || Array.isArray(rawBlocker)) {
    return null;
  }
  return clonePlain(rawBlocker, null);
}

export function createDefaultMedicalState() {
  return {
    bills: {
      obsCents: 0,
      wardCents: 0
    },
    pendingBlocker: null,
    sessions: {
      obs: {
        active: false,
        endTimeMinutes: null,
        hpCap: 50,
        healTickMinutes: 30,
        healProgressMinutes: 0,
        priceCentsPerHour: 2500,
        billingNumerator: 0,
        billedCents: 0,
        hardStopTriggered: false
      },
      ward: {
        active: false,
        wardMinutesTotal: 0,
        healProgressMinutes: 0,
        alreadyChargedDays: 0,
        billedCents: 0,
        healthPerDay: 20,
        costPerDayCents: 20000,
        dischargeThresholdHealth: 80
      }
    }
  };
}

export function normalizeMedicalState(rawMedical) {
  const defaults = createDefaultMedicalState();
  const source = rawMedical && typeof rawMedical === "object" && !Array.isArray(rawMedical)
    ? rawMedical
    : {};
  const bills = source.bills && typeof source.bills === "object" && !Array.isArray(source.bills)
    ? source.bills
    : {};
  const sessions = source.sessions && typeof source.sessions === "object" && !Array.isArray(source.sessions)
    ? source.sessions
    : {};
  const obs = sessions.obs && typeof sessions.obs === "object" && !Array.isArray(sessions.obs)
    ? sessions.obs
    : {};
  const ward = sessions.ward && typeof sessions.ward === "object" && !Array.isArray(sessions.ward)
    ? sessions.ward
    : {};

  return {
    bills: {
      obsCents: toNonNegativeInt(bills.obsCents, defaults.bills.obsCents),
      wardCents: toNonNegativeInt(bills.wardCents, defaults.bills.wardCents)
    },
    pendingBlocker: normalizePendingBlocker(source.pendingBlocker),
    sessions: {
      obs: {
        active: toBoolean(obs.active, defaults.sessions.obs.active),
        endTimeMinutes: Number.isInteger(Number(obs.endTimeMinutes)) ? Math.trunc(Number(obs.endTimeMinutes)) : defaults.sessions.obs.endTimeMinutes,
        hpCap: toNonNegativeInt(obs.hpCap, defaults.sessions.obs.hpCap),
        healTickMinutes: Math.max(1, toNonNegativeInt(obs.healTickMinutes, defaults.sessions.obs.healTickMinutes)),
        healProgressMinutes: toNonNegativeInt(obs.healProgressMinutes, defaults.sessions.obs.healProgressMinutes),
        priceCentsPerHour: toNonNegativeInt(obs.priceCentsPerHour, defaults.sessions.obs.priceCentsPerHour),
        billingNumerator: toNonNegativeInt(obs.billingNumerator, defaults.sessions.obs.billingNumerator),
        billedCents: toNonNegativeInt(obs.billedCents, defaults.sessions.obs.billedCents),
        hardStopTriggered: toBoolean(obs.hardStopTriggered, defaults.sessions.obs.hardStopTriggered)
      },
      ward: {
        active: toBoolean(ward.active, defaults.sessions.ward.active),
        wardMinutesTotal: toNonNegativeInt(ward.wardMinutesTotal, defaults.sessions.ward.wardMinutesTotal),
        healProgressMinutes: toNonNegativeInt(ward.healProgressMinutes, defaults.sessions.ward.healProgressMinutes),
        alreadyChargedDays: toNonNegativeInt(ward.alreadyChargedDays, defaults.sessions.ward.alreadyChargedDays),
        billedCents: toNonNegativeInt(ward.billedCents, defaults.sessions.ward.billedCents),
        healthPerDay: toNonNegativeInt(ward.healthPerDay, defaults.sessions.ward.healthPerDay),
        costPerDayCents: toNonNegativeInt(ward.costPerDayCents, defaults.sessions.ward.costPerDayCents),
        dischargeThresholdHealth: toNonNegativeInt(ward.dischargeThresholdHealth, defaults.sessions.ward.dischargeThresholdHealth)
      }
    }
  };
}

export function cloneMedicalState(rawMedical) {
  return normalizeMedicalState(rawMedical);
}