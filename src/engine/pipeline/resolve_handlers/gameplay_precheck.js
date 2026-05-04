function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isGameplayProgressionPlan(plan) {
  if (!plan || typeof plan !== "object") return false;

  const sysCalls = Array.isArray(plan.sysCalls) ? plan.sysCalls : [];
  for (const row of sysCalls) {
    const type = String(row?.type || "").trim();
    if (type === "ADVANCE_TIME" || type === "LOAD_MAP" || type === "LOAD_EVENT") {
      return true;
    }
  }

  const effects = Array.isArray(plan.effects) ? plan.effects : [];
  for (const effect of effects) {
    const path = String(effect?.path || "").trim();
    if (!path) continue;
    if (path === "logLines") continue;
    if (path.startsWith("player.") || path.startsWith("world.")) {
      return true;
    }
  }

  return false;
}

export function predictStaminaAfterPlan(state, plan) {
  const effects = Array.isArray(plan?.effects) ? plan.effects : [];
  let stamina = toFiniteNumber(state?.player?.physio?.stamina, 0);

  for (const effect of effects) {
    if (!effect || typeof effect !== "object") continue;
    if (String(effect.path || "") !== "player.physio.stamina") continue;

    switch (effect.op) {
      case "set":
        stamina = effect.value;
        break;
      case "add":
        if (typeof stamina === "number") {
          stamina = stamina + effect.value;
        }
        break;
      case "mul":
        if (typeof stamina === "number") {
          stamina = stamina * effect.value;
        }
        break;
      case "clamp":
        if (typeof stamina === "number") {
          stamina = Math.max(effect.min, Math.min(effect.max, stamina));
        }
        break;
      default:
        break;
    }
  }

  const predictedStamina = Number(stamina);
  return {
    predictedStamina,
    hasFinitePrediction: Number.isFinite(predictedStamina)
  };
}

export function shouldRejectGameplayAction(state, plan) {
  if (!isGameplayProgressionPlan(plan)) return null;

  if (state?.player?.exposure?.dead === true) {
    return {
      source: "gameplay_guard",
      code: "PLAYER_DEAD_BLOCKED",
      reason: "player.exposure.dead",
      reasons: ["player.exposure.dead == true"]
    };
  }

  const staminaResult = predictStaminaAfterPlan(state, plan);
  if (staminaResult.hasFinitePrediction && staminaResult.predictedStamina < 0) {
    return {
      source: "gameplay_guard",
      code: "STAMINA_PREDICTED_NEGATIVE",
      reason: "predictedStamina<0",
      reasons: [`predictedStamina=${staminaResult.predictedStamina}`]
    };
  }

  return null;
}
