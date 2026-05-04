export const DISPATCH_JOB_STATUS = Object.freeze({
  OPEN: "open",
  CLOSING: "closing",
  FULL: "full",
  WEATHER_SUSPENDED: "weather_suspended",
  VISIBILITY_SUSPENDED: "visibility_suspended",
  NIGHT_CLOSED: "night_closed"
});

function toMinuteOfDay(totalMinutes) {
  const n = Math.max(0, Math.floor(Number(totalMinutes || 0)));
  return n % 1440;
}

export function resolveIndustrialDispatchStatusFromMinute(minuteOfDay) {
  const m = Math.max(0, Math.min(1439, Math.floor(Number(minuteOfDay || 0))));

  if (m >= 1080 || m <= 359) {
    return {
      manifest: DISPATCH_JOB_STATUS.NIGHT_CLOSED,
      subsidyTag: DISPATCH_JOB_STATUS.NIGHT_CLOSED
    };
  }

  // Day service with deterministic cutoff windows.
  if (m >= 1050) {
    return {
      manifest: DISPATCH_JOB_STATUS.FULL,
      subsidyTag: DISPATCH_JOB_STATUS.FULL
    };
  }

  if (m >= 1020) {
    return {
      manifest: DISPATCH_JOB_STATUS.CLOSING,
      subsidyTag: DISPATCH_JOB_STATUS.FULL
    };
  }

  if (m >= 960) {
    return {
      manifest: DISPATCH_JOB_STATUS.OPEN,
      subsidyTag: DISPATCH_JOB_STATUS.CLOSING
    };
  }

  return {
    manifest: DISPATCH_JOB_STATUS.OPEN,
    subsidyTag: DISPATCH_JOB_STATUS.OPEN
  };
}

function normalizeWeather(weather = {}) {
  return {
    isSnowing: weather?.isSnowing === true,
    snowfallRate: Number(weather?.snowfallRate || 0),
    stormIntensity: Number(weather?.stormIntensity || 0),
    windSpeedLocal: Number(weather?.windSpeedLocal ?? weather?.windSpeed_local ?? 0)
  };
}

function applyWeatherAndVisibility(baseStatus, inputs = {}) {
  const safeBase = {
    manifest: baseStatus?.manifest || DISPATCH_JOB_STATUS.OPEN,
    subsidyTag: baseStatus?.subsidyTag || DISPATCH_JOB_STATUS.OPEN
  };

  if (
    safeBase.manifest === DISPATCH_JOB_STATUS.NIGHT_CLOSED
    || safeBase.subsidyTag === DISPATCH_JOB_STATUS.NIGHT_CLOSED
  ) {
    return {
      manifest: DISPATCH_JOB_STATUS.NIGHT_CLOSED,
      subsidyTag: DISPATCH_JOB_STATUS.NIGHT_CLOSED
    };
  }

  const visibilityBand = String(inputs?.visibilityBand || "clear");
  const weather = normalizeWeather(inputs?.weather || {});

  const severeWeather =
    (weather.isSnowing && weather.snowfallRate >= 0.7)
    || weather.stormIntensity >= 0.62;

  const strongWind = weather.windSpeedLocal >= 12;

  if (severeWeather) {
    return {
      manifest: DISPATCH_JOB_STATUS.WEATHER_SUSPENDED,
      subsidyTag: DISPATCH_JOB_STATUS.WEATHER_SUSPENDED
    };
  }

  if (visibilityBand === "hazard") {
    return {
      manifest: DISPATCH_JOB_STATUS.VISIBILITY_SUSPENDED,
      subsidyTag: DISPATCH_JOB_STATUS.VISIBILITY_SUSPENDED
    };
  }

  if (strongWind) {
    return {
      manifest: safeBase.manifest === DISPATCH_JOB_STATUS.FULL
        ? DISPATCH_JOB_STATUS.FULL
        : DISPATCH_JOB_STATUS.CLOSING,
      subsidyTag: DISPATCH_JOB_STATUS.WEATHER_SUSPENDED
    };
  }

  return safeBase;
}

export function resolveIndustrialDispatchStatusFromContext(ctx = {}) {
  const minuteOfDay = Number(ctx?.minuteOfDay ?? 0);
  const byTime = resolveIndustrialDispatchStatusFromMinute(minuteOfDay);
  return applyWeatherAndVisibility(byTime, {
    visibilityBand: ctx?.visibilityBand,
    weather: ctx?.weather
  });
}

export function resolveIndustrialDispatchStatus(worldOrState) {
  const totalMinutes = Number(worldOrState?.time?.totalMinutes ?? worldOrState?.totalMinutes ?? 0);
  const minuteOfDay = toMinuteOfDay(totalMinutes);
  return resolveIndustrialDispatchStatusFromContext({
    minuteOfDay,
    visibilityBand: worldOrState?.visibilityBand,
    weather: worldOrState?.weather ?? worldOrState?.world?.weather
  });
}

export function canAcceptDispatchJob(status) {
  return status === DISPATCH_JOB_STATUS.OPEN || status === DISPATCH_JOB_STATUS.CLOSING;
}
