const TIME_READOUT_LEVEL_PRIORITY = Object.freeze({
	none: 0,
	watch: 1,
	satellite: 2
});

export function normalizeTimeReadoutLevel(value) {
	const normalized = String(value || "").trim().toLowerCase();
	if (normalized === "satellite") return "satellite";
	if (normalized === "watch") return "watch";
	return "none";
}

export function resolveTimeReadoutCapability(equippedTools, itemsById) {
	const safeItemsById = itemsById instanceof Map ? itemsById : null;
	const rows = Array.isArray(equippedTools) ? equippedTools : [];
	let bestLevel = "none";
	let bestSourceItemId = null;

	for (const row of rows) {
		const toolTag = String(row?.toolTag || "").trim();
		const itemId = String(row?.itemId || "").trim();
		if (toolTag !== "time" || !itemId || !safeItemsById) continue;

		const itemDef = safeItemsById.get(itemId);
		const level = normalizeTimeReadoutLevel(itemDef?.timeReadoutLevel);
		if (TIME_READOUT_LEVEL_PRIORITY[level] > TIME_READOUT_LEVEL_PRIORITY[bestLevel]) {
			bestLevel = level;
			bestSourceItemId = itemId;
		}
	}

	return {
		level: bestLevel,
		sourceItemId: bestSourceItemId
	};
}

export function resolveTimeSenseState(calendarView, illuminationView, timePhase = "") {
	void calendarView;
	const normalizedLightPhase = String(illuminationView?.lightPhase || "").trim().toLowerCase();
	const normalizedTimePhase = String(timePhase || "").trim();

	if (normalizedLightPhase === "polar_night" || normalizedTimePhase === "Midnight") {
		return "深夜";
	}

	if (normalizedLightPhase === "twilight") {
		if (normalizedTimePhase === "Dawn" || normalizedTimePhase === "Morning") {
			return "清晨";
		}
		return "傍晚";
	}

	if (normalizedTimePhase === "Dawn") return "清晨";
	if (normalizedTimePhase === "Evening") return "傍晚";
	return "白天";
}
