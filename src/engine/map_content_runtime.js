import { loadMap, loadMapContentIndex, loadMapContent } from "./loader.js";
import { initMedicalRuntime } from "./medical_runtime_entry.js";
import { gameState } from "./state.js";
import { getNpcPresenceSnapshot } from "./social/npc_presence_provider.js";
import { buildSocialRuntimeContext } from "./social/social_service.js";
import { getMargTransitionBlockerRuntimeContext } from "./marg_transition_blocker_provider.js";
import { buildRuntimeProviderSnapshot } from "./runtime_provider_context.js";
import { getWorldTimeContext } from "./time.js";
import { resolveIndustrialDispatchStatusFromContext } from "./industrial_dispatch_status.js";
import { buildStableCalendarDayKey, hashStableString } from "./stable_daily.js";
import { getStopById } from "./transit/transit_service.js";
import { evaluateRequires } from "./requires.js";

/** @type {Record<string, any>} */
let mapContentByMapId = {};

const STEEL_CROSS_PORT_MAP_ID = "steelcross_port";
const STEEL_CROSS_DOCK_PLACEHOLDER_MAP_ID = "steelcross_dock_placeholder";
const SHIP_TAG = "ship";
const STEEL_CROSS_SHIPPING_STATE_MAP_IDS = new Set([
  STEEL_CROSS_PORT_MAP_ID,
  STEEL_CROSS_DOCK_PLACEHOLDER_MAP_ID
]);

/** @type {Map<string, { id: string, tags: string[], sourceMapData: any }>} */
const mapMetaById = new Map();

const TRANSIT_STOP_DISPLAY_NAME_BY_ID = Object.freeze({
  stop_winddyke: "风堤街站牌",
  stop_heatcorridor: "热廊站牌",
  stop_industrial: "工业区站牌",
  stop_steelcross_port: "钢十字港口站",
  stop_outpost: "前哨"
});

const BUILTIN_RUNTIME_CONTENT = Object.freeze({
  west2_bus_onboard: Object.freeze({
    location_id: "west2_bus_onboard",
    RuntimeText: Object.freeze({
      mapTextByMapId: Object.freeze({
        west2_bus_onboard: Object.freeze({
          sceneId: "1.0",
          description: Object.freeze({
            base: "当前站：{currentStopName}\n车门合上后，外面的风声立刻闷了一层。暖风不强，玻璃边有一层薄雾；车身压过接缝时，会传来一记很短的震动。",
            lightVariants: Object.freeze({
              morning: "站牌和棚边在发雾的玻璃后，轮廓淡淡地贴着。",
              noon: "门边那块玻璃雾薄一些。站牌、围栏、压实雪面从窗外擦过去。",
              afternoon: "窗外门边灯亮着，围栏拐角被灯照着，路面是一层平的灰白。",
              evening: "车外的门边灯昏黄，站牌下沿的雪粉贴地掠过去。",
              midnight: "一截站牌和门边反光条亮着，后面的暗面贴在玻璃后。",
              dawn: "光还没立起来，门边那点灯照着站牌下沿和近处雪面。"
            }),
            weatherVariants: Object.freeze({
              highwind: "风顶得厉害时，车门一开，碎雪会先贴着踏板卷进来，在门边积出薄薄一线。",
              snowfall: "雪一直斜着擦过窗面，停靠时站牌和围栏边会先蒙上一层湿白。",
              whiteout: "白化压下来时，窗外的边界被磨成一层白，门边近处的站牌下沿和灯面还挂着硬边。"
            }),
            visibilityVariants: Object.freeze({
              low: "门边那一小段站牌、反光边和围栏线贴在窗外，远一点的轮廓已经散开。"
            })
          })
        })
      }),
      actionTextByMapId: Object.freeze({
        west2_bus_onboard: Object.freeze({
          sceneId: "1.0",
          actionTextByActionId: Object.freeze({
            west2_bus_get_off: Object.freeze({
              actionLabel: Object.freeze({
                base: "到站下车"
              }),
              actionFeedback: Object.freeze({
                base: "当前站：{currentStopName}\n车身轻轻一顿，门边的提示灯亮了；停稳之后，气密条里才慢慢钻进一点冷气。",
                lightVariants: Object.freeze({
                  morning: "站牌在薄雾里，棚边那点灯还没灭。",
                  noon: "门一开，站牌边的压实雪面和踏板外沿就在眼前。",
                  afternoon: "到了下午，门外那块亮面比白天更窄，站牌边的霜线先贴到门口。",
                  evening: "门外亮着站牌灯，踏板边的雪面反着光，一截围栏影子落在雪上。",
                  midnight: "深夜开门以后，外面的冷和暗一起压过来，站牌边的灯先落在脚边。",
                  dawn: "这时候下车像从暖壳退到硬雪面上，门外那点灯只照住站牌下沿和踏板外一截。"
                }),
                weatherVariants: Object.freeze({
                  highwind: "风一压上来，门边会立刻卷进一层碎雪，你得顺着车身那侧出去。",
                  snowfall: "踏板边很快又会覆上一层薄白，门不会开太久。",
                  whiteout: "离开车门以后，雪雾贴着门边翻过去，近处站牌下沿和踏板外那截硬边还留在眼前。"
                }),
                visibilityVariants: Object.freeze({
                  low: "门一开，站牌下沿和踏板旁那截反光边先贴到眼前，远处轮廓还散在白里。"
                })
              }),
              logLinesByIndex: Object.freeze({
                0: Object.freeze({
                  base: "你在{currentStopName}下了车。"
                })
              })
            }),
            west2_bus_continue: Object.freeze({
              actionLabel: Object.freeze({
                base: "留在车上"
              }),
              actionFeedback: Object.freeze({
                base: "当前站：{currentStopName}\n门重新合上后，车沿着压实线继续往前推，窗边那层雾又慢慢聚回来。",
                lightVariants: Object.freeze({
                  morning: "外面的灯和晨光一起往后退。",
                  noon: "白天行进时，站牌之间的空段一截截掠过窗边，压实雪面和围栏脚边的影子都拖得很长。",
                  afternoon: "灰光压下来以后，窗外留下来的主要是冷白的灯和反光边。",
                  evening: "夜里离站后，窗外退成门边灯、远处零星站牌和一段段反光边。",
                  midnight: "深夜继续前进时，外面的东西退得很快，亮点和黑面分得更硬。",
                  dawn: "灯亮，下一站的牌在暗里。"
                }),
                weatherVariants: Object.freeze({
                  highwind: "风压上来的时候，车身会比平时更实一点，过接缝那下也更硬。",
                  snowfall: "雪线一直斜擦着窗面，站与站之间的边界会被磨得更散。",
                  whiteout: "白化最重时，窗外的亮面和暗面几乎贴在一起，零星灯点在白里挪动。"
                }),
                visibilityVariants: Object.freeze({
                  low: "下一站露头时，先碰到窗边的是门灯和站牌下一截白边，后面的东西还压在雾里。"
                })
              }),
              logLinesByIndex: Object.freeze({
                0: Object.freeze({
                  base: "接驳车离开{currentStopName}，继续沿线路前进。"
                }),
                1: Object.freeze({
                  base: "车辆已到终点，方向改为返程。"
                })
              })
            })
          })
        })
      })
    })
  })
});

const CONTENT_TRACE_LIMIT = 60;

export function getMapContentByMapId() {
  return mapContentByMapId;
}

export function getCurrentMapContent(mapId) {
  return mapContentByMapId[mapId] || BUILTIN_RUNTIME_CONTENT[mapId] || null;
}

function buildRuntimeTemplateVars(mapId) {
  const vars = Object.create(null);
  if (String(mapId || "") === "west2_bus_onboard") {
    const ride = gameState?.player?.transit?.ride || null;
    const stop = getStopById(ride?.currentStopId || "");
    vars.currentStopName = String(
      stop?.displayName
      || TRANSIT_STOP_DISPLAY_NAME_BY_ID[String(stop?.stopId || ride?.currentStopId || "")]
      || stop?.name
      || "当前站"
    ).trim() || "当前站";
  }
  if (String(mapId || "").startsWith("rear_zone_lodging_")) {
    const roomPriceToday = Math.trunc(Number(gameState?.world?.flags?.rear_zone_room_price_today ?? NaN));
    if (Number.isFinite(roomPriceToday)) {
      vars.rear_zone_room_price_today = roomPriceToday;
    }
  }
  return vars;
}

function applyRuntimeTemplateVars(text, vars) {
  const source = String(text || "");
  if (!source) return "";
  return source.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    const value = vars?.[key];
    if (value == null) return match;
    return String(value);
  });
}

function getTraceStore() {
  const scope = typeof window !== "undefined" ? window : globalThis;
  if (!Array.isArray(scope.__CONTENT_SELECT_TRACE__)) {
    scope.__CONTENT_SELECT_TRACE__ = [];
  }
  return scope.__CONTENT_SELECT_TRACE__;
}

function pushContentTrace(entry) {
  const trace = getTraceStore();
  trace.push(entry);
  if (trace.length > CONTENT_TRACE_LIMIT) {
    trace.splice(0, trace.length - CONTENT_TRACE_LIMIT);
  }
  return entry;
}

function createTraceBase(sceneContext, meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    mapId: String(meta.mapId || sceneContext?.mapId || ""),
    actionId: String(meta.actionId || ""),
    contentKey: String(meta.contentKey || ""),
    sceneKey: String(meta.sceneKey || meta.sceneId || sceneContext?.sceneId || ""),
    slot: String(meta.slot || "description"),
    timePhase: sceneContext?.schedule?.phase || null,
    serviceBand: sceneContext?.schedule?.serviceBand || null,
    lightPhase: sceneContext?.light?.lightPhase || null,
    visibilityBand: sceneContext?.light?.visibilityBand || null,
    legacyDayNight: sceneContext?.schedule?.legacyDayNight || null,
    usedLegacyDayNightCompat: false,
    usedLegacyFallback: false,
    finalTextSource: meta.finalTextSource || "content_runtime",
    legacyFallbackKind: null,
    layers: []
  };
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function normalizeSceneTags(tags) {
  if (!Array.isArray(tags)) return [];
  const normalized = [];
  const seen = new Set();
  for (const tag of tags) {
    if (!tag || typeof tag !== "object") continue;
    const tagId = String(tag.tagId || tag.id || "").trim();
    const label = String(tag.label || "").trim();
    const visibility = String(tag.visibility || "internal").trim().toLowerCase() === "player"
      ? "player"
      : "internal";
    if (!tagId || !label) continue;
    const dedupeKey = `${tagId}:${label}:${visibility}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(Object.freeze({ tagId, label, visibility }));
  }
  return normalized;
}

function registerMapMeta(mapData) {
  const mapId = String(mapData?.id || "").trim();
  if (!mapId) return null;
  const meta = Object.freeze({
    id: mapId,
    tags: Object.freeze(normalizeStringArray(mapData?.tags)),
    sourceMapData: mapData || null
  });
  mapMetaById.set(mapId, meta);
  return meta;
}

function getRegisteredMapMeta(mapId) {
  return mapMetaById.get(String(mapId || "").trim()) || null;
}

function collectTransitionTargetMapIds(mapData) {
  const targetIds = new Set();

  for (const action of Array.isArray(mapData?.actions) ? mapData.actions : []) {
    if (String(action?.kind || "").trim() !== "TRANSITION") continue;
    const targetMapId = String(action?.payload?.toMapId || action?.targetMapId || "").trim();
    if (targetMapId) targetIds.add(targetMapId);
  }

  for (const transition of Array.isArray(mapData?.link?.transitions) ? mapData.link.transitions : []) {
    const targetMapId = String(transition?.toMapId || "").trim();
    if (targetMapId) targetIds.add(targetMapId);
  }

  for (const edge of Array.isArray(mapData?.edges) ? mapData.edges : []) {
    const targetMapId = String(edge?.toMapId || "").trim();
    if (targetMapId) targetIds.add(targetMapId);
  }

  return Array.from(targetIds);
}

async function primeSteelCrossPortMapMeta() {
  const portMap = await loadMap(STEEL_CROSS_PORT_MAP_ID);
  if (!portMap) return;
  registerMapMeta(portMap);

  const targetMapIds = collectTransitionTargetMapIds(portMap);
  for (const targetMapId of targetMapIds) {
    const targetMap = await loadMap(targetMapId);
    if (targetMap) {
      registerMapMeta(targetMap);
    }
  }
}

function normalizeServiceBands(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }
  const single = String(value || "").trim();
  return single ? [single] : [];
}

function resolveActionServiceBands(action) {
  const candidates = [
    ...(normalizeServiceBands(action?.serviceBands)),
    ...(normalizeServiceBands(action?.serviceBand)),
    ...(normalizeServiceBands(action?.ui?.serviceBands)),
    ...(normalizeServiceBands(action?.ui?.serviceBand))
  ];
  return Array.from(new Set(candidates));
}

function isActionOpenForState(action, state, sceneContext) {
  if (!action || typeof action !== "object") return false;

  if (action.requires) {
    const requireResult = evaluateRequires(state, action.requires);
    if (!requireResult.ok) {
      return false;
    }
  }

  if (action?.ui?.disabledRequires) {
    const disabledResult = evaluateRequires(state, action.ui.disabledRequires);
    if (disabledResult.ok) {
      return false;
    }
  }

  const allowedBands = resolveActionServiceBands(action);
  if (allowedBands.length > 0) {
    const currentBand = String(sceneContext?.schedule?.serviceBand || "").trim();
    if (!currentBand || !allowedBands.includes(currentBand)) {
      return false;
    }
  }

  return true;
}

export function getSteelCrossPortClosureState(calendarView) {
  const month = Number(calendarView?.month);
  const day = Number(calendarView?.day);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month > 3 && month < 11) return true;
  if (month === 3 && day >= 14) return true;
  if (month === 10) return true;
  return false;
}

export function hasOpenShipTaggedMapFromSteelCrossPort(ctx) {
  const mapId = String(ctx?.mapId || ctx?.mapData?.id || ctx?.map?.id || "").trim();
  if (!STEEL_CROSS_SHIPPING_STATE_MAP_IDS.has(mapId)) return false;

  const state = ctx?.state || gameState;
  const sceneContext = ctx?.sceneContext || ctx || {};
  const mapData = getRegisteredMapMeta(STEEL_CROSS_PORT_MAP_ID)?.sourceMapData || ctx?.mapData || ctx?.map || gameState.currentMap || null;
  const actions = Array.isArray(mapData?.actions) ? mapData.actions : [];

  for (const action of actions) {
    if (String(action?.kind || "").trim() !== "TRANSITION") continue;
    if (!isActionOpenForState(action, state, sceneContext)) continue;

    const targetMapId = String(action?.payload?.toMapId || action?.targetMapId || "").trim();
    if (!targetMapId) continue;

    const targetMeta = getRegisteredMapMeta(targetMapId);
    const tags = normalizeStringArray(targetMeta?.tags);
    if (tags.includes(SHIP_TAG)) {
      return true;
    }
  }

  return false;
}

export function getSteelCrossPortShippingState(ctx) {
  const mapId = String(ctx?.mapId || ctx?.mapData?.id || ctx?.map?.id || "").trim();
  if (!STEEL_CROSS_SHIPPING_STATE_MAP_IDS.has(mapId)) return null;

  const calendarView = ctx?.calendarView || ctx?.calendar || {};
  if (getSteelCrossPortClosureState(calendarView)) {
    return "closure";
  }

  if (!hasOpenShipTaggedMapFromSteelCrossPort(ctx)) {
    return "no_ship";
  }

  return "ship_docked";
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function toLowerKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePoolStrings(pool) {
  if (!Array.isArray(pool)) {
    return { items: [], invalidCount: 0 };
  }

  const items = [];
  let invalidCount = 0;
  for (const entry of pool) {
    if (typeof entry !== "string") {
      invalidCount += 1;
      continue;
    }
    const text = entry.trim();
    if (!text) continue;
    items.push(text);
  }

  return { items, invalidCount };
}

function buildPoolStableSalt(meta = {}, layerName = "", matchToken = "") {
  return [
    String(meta?.mapId || ""),
    String(meta?.sceneKey || meta?.sceneId || ""),
    String(meta?.contentKey || ""),
    String(layerName || ""),
    String(matchToken || "")
  ].join(":");
}

function pickRandomPoolEntry(pool, options = {}) {
  const normalized = normalizePoolStrings(pool);
  if (!normalized.items.length) {
    return {
      text: "",
      index: -1,
      count: 0,
      invalidCount: normalized.invalidCount,
      usedPool: true
    };
  }

  const stableSalt = String(options?.stableSalt || "").trim();
  const stableKey = String(options?.stableKey || "").trim();
  const index = stableSalt && stableKey
    ? hashStableString(`${stableSalt}:${stableKey}`) % normalized.items.length
    : Math.floor(Math.random() * normalized.items.length);
  return {
    text: normalized.items[index] || "",
    index,
    count: normalized.items.length,
    invalidCount: normalized.invalidCount,
    usedPool: true
  };
}

function resolveWeatherVariantKey(sceneContext) {
  const lightPhase = toLowerKey(sceneContext?.light?.lightPhase);
  if (lightPhase === "whiteout") return "whiteout";

  const isSnowing = sceneContext?.weather?.isSnowing === true;
  if (isSnowing) return "snowfall";

  const windSpeedLocal = Number(sceneContext?.weather?.windSpeedLocal || 0);
  const stormIntensity = Number(sceneContext?.weather?.stormIntensity || 0);
  if (windSpeedLocal >= 12 || stormIntensity >= 0.62) return "highwind";

  return "normal";
}

function resolveVisibilityVariantKey(sceneContext) {
  const visibilityBand = toLowerKey(sceneContext?.light?.visibilityBand);
  if (visibilityBand === "clear") return "clear";
  if (visibilityBand === "hazard") return "low";
  return visibilityBand || "low";
}

export function resolveBinaryDayNightBucket(sceneContext) {
  const rawMinuteOfDay = Number(sceneContext?.clock?.minuteOfDay);
  const minuteOfDay = Number.isFinite(rawMinuteOfDay)
    ? ((rawMinuteOfDay % 1440) + 1440) % 1440
    : NaN;
  if (Number.isFinite(minuteOfDay) && minuteOfDay >= 360 && minuteOfDay < 1080) {
    return "day";
  }
  return "night";
}

function isBinaryDayNightSegment(value) {
  return typeof value === "string" || (isPlainObject(value) && !Array.isArray(value));
}

function resolveBinaryDayNightVariantResult(sceneContext, textSpec, trace, meta = {}) {
  if (meta.slot !== "description" || textSpec?.useBinaryDayNight !== true) {
    return null;
  }

  const variants = textSpec?.binaryDayNightVariants;
  const hasDay = Object.prototype.hasOwnProperty.call(variants || {}, "day");
  const hasNight = Object.prototype.hasOwnProperty.call(variants || {}, "night");
  const isValid = isPlainObject(variants)
    && hasDay
    && hasNight
    && isBinaryDayNightSegment(variants.day)
    && isBinaryDayNightSegment(variants.night);

  if (!isValid) {
    trace.layers.push({
      layer: "binaryDayNightVariants",
      hit: false,
      matchedWhen: { invalid: true }
    });
    console.error("[ContentSelectError] layer=binaryDayNightVariants invalid spec", {
      textSpec,
      sceneContext,
      meta,
      trace
    });
    return null;
  }

  const bucket = resolveBinaryDayNightBucket(sceneContext);
  const segment = coerceSegmentText(variants[bucket], "append", {
    stableSalt: buildPoolStableSalt(meta, "binaryDayNightVariants", bucket),
    stableKey: sceneContext?.clock?.minuteOfDay
  });
  const text = String(segment.text || "").trim();

  trace.layers.push({
    layer: "binaryDayNightVariants",
    hit: !!text,
    matchedWhen: { bucket }
  });

  return {
    bucket,
    mode: segment.mode,
    text
  };
}

function pickShorthandVariant(layerName, variants, sceneContext, trace, meta = {}) {
  if (!isPlainObject(variants)) {
    trace.layers.push({
      layer: layerName,
      hit: false,
      matchedWhen: null
    });
    return null;
  }

  const keys = [];
  const timePhaseKey = toLowerKey(sceneContext?.schedule?.phase);
  const lightPhaseKey = toLowerKey(sceneContext?.light?.lightPhase);

  if (layerName === "moodVariants" || layerName === "scheduleVariants") {
    if (timePhaseKey) keys.push(timePhaseKey);
  } else if (layerName === "lightVariants") {
    const hasTimePhaseShorthand = ["dawn", "morning", "noon", "afternoon", "evening", "midnight"]
      .some((key) => Object.prototype.hasOwnProperty.call(variants, key));
    if (hasTimePhaseShorthand && timePhaseKey) {
      keys.push(timePhaseKey);
    }
    if (lightPhaseKey) {
      keys.push(lightPhaseKey);
    }
  } else if (layerName === "weatherVariants") {
    keys.push(resolveWeatherVariantKey(sceneContext));
  } else if (layerName === "visibilityVariants") {
    keys.push(resolveVisibilityVariantKey(sceneContext));
  }

  const normalizedKeys = Array.from(new Set(keys.filter(Boolean)));
  for (const key of normalizedKeys) {
    if (!Object.prototype.hasOwnProperty.call(variants, key)) continue;
    const hit = coerceSegmentText(variants[key], "append", {
      stableSalt: buildPoolStableSalt(meta, layerName, key),
      stableKey: sceneContext?.clock?.minuteOfDay
    });
    trace.layers.push({
      layer: layerName,
      hit: true,
      matchedWhen: {
        shorthandKey: key,
        ...(hit.poolMeta?.usedPool ? {
          poolIndex: hit.poolMeta.index,
          poolCount: hit.poolMeta.count,
          invalidPoolItems: hit.poolMeta.invalidCount
        } : {})
      }
    });
    return {
      when: { shorthandKey: key },
      mode: hit.mode,
      text: hit.text
    };
  }

  if (layerName === "scheduleVariants") {
    const rows = Object.entries(variants)
      .map(([label, value]) => ({ label, value }))
      .filter((row) => isPlainObject(row.value) && isPlainObject(row.value.when));
    const hits = rows.filter((row) => matchesWhen(sceneContext, row.value.when));

    if (hits.length > 1) {
      console.error(`[ContentSelectError] layer=${layerName} multiple explicit schedule matches`, { layerName, hits, sceneContext, trace });
    }

    const hit = hits[0] || null;
    if (hit) {
      const segment = coerceSegmentText(hit.value, "append", {
        stableSalt: buildPoolStableSalt(meta, layerName, hit.label),
        stableKey: sceneContext?.clock?.minuteOfDay
      });
      trace.layers.push({
        layer: layerName,
        hit: true,
        matchedWhen: {
          label: hit.label,
          ...hit.value.when,
          ...(segment.poolMeta?.usedPool ? {
            poolIndex: segment.poolMeta.index,
            poolCount: segment.poolMeta.count,
            invalidPoolItems: segment.poolMeta.invalidCount
          } : {})
        }
      });
      return {
        when: { label: hit.label, ...hit.value.when },
        mode: segment.mode,
        text: segment.text
      };
    }
  }

  trace.layers.push({
    layer: layerName,
    hit: false,
    matchedWhen: null
  });
  return null;
}

function matchesValue(actual, expected) {
  if (Array.isArray(expected)) {
    return expected.some(item => matchesValue(actual, item));
  }
  if (expected && typeof expected === "object") {
    if (Array.isArray(expected.anyOf)) {
      return expected.anyOf.some(item => matchesValue(actual, item));
    }
    if (Object.prototype.hasOwnProperty.call(expected, "eq")) {
      return matchesValue(actual, expected.eq);
    }
    if (Object.prototype.hasOwnProperty.call(expected, "neq")) {
      return !matchesValue(actual, expected.neq);
    }
  }
  return actual === expected;
}

function matchesWhen(sceneContext, when = {}) {
  if (!when || typeof when !== "object") return true;

  const checks = [
    [sceneContext?.schedule?.phase, when.timePhase],
    [sceneContext?.schedule?.serviceBand, when.serviceBand],
    [sceneContext?.service?.shippingState, when.shippingState],
    [sceneContext?.schedule?.industrialManifestStatus, when.industrialManifestStatus],
    [sceneContext?.schedule?.industrialSubsidyTagStatus, when.industrialSubsidyTagStatus],
    [sceneContext?.blocker?.transitionKey, when.transitionKey],
    [sceneContext?.light?.lightPhase, when.lightPhase],
    [sceneContext?.light?.visibilityBand, when.visibilityBand],
    [sceneContext?.weather?.cloudType, when.cloudType],
    [sceneContext?.weather?.isSnowing, when.isSnowing],
    [sceneContext?.schedule?.legacyDayNight, when.dayNight],
    [sceneContext?.scene?.space, when.space]
  ];

  for (const [actual, expected] of checks) {
    if (expected === undefined) continue;
    if (!matchesValue(actual, expected)) return false;
  }

  if (when.minuteOfDay !== undefined) {
    const minuteOfDay = Number(sceneContext?.clock?.minuteOfDay);
    const expected = when.minuteOfDay;
    if (!Number.isFinite(minuteOfDay)) return false;
    if (typeof expected === "number") {
      if (minuteOfDay !== expected) return false;
    } else if (isPlainObject(expected)) {
      if (expected.gte !== undefined && !(minuteOfDay >= Number(expected.gte))) return false;
      if (expected.gt !== undefined && !(minuteOfDay > Number(expected.gt))) return false;
      if (expected.lte !== undefined && !(minuteOfDay <= Number(expected.lte))) return false;
      if (expected.lt !== undefined && !(minuteOfDay < Number(expected.lt))) return false;
    } else {
      return false;
    }
  }

  if (isPlainObject(when.providerBands)) {
    for (const [providerId, expected] of Object.entries(when.providerBands)) {
      const actual = sceneContext?.service?.providerBands?.[providerId];
      if (!matchesValue(actual, expected)) return false;
    }
  }

  return true;
}

function coerceSegmentText(segment, defaultMode = "append", options = {}) {
  if (typeof segment === "string") {
    return { mode: defaultMode, text: segment, poolMeta: null, sceneTags: [] };
  }
  if (!segment || typeof segment !== "object") {
    return { mode: defaultMode, text: "", poolMeta: null, sceneTags: [] };
  }

  const poolMeta = Array.isArray(segment.pool)
    ? pickRandomPoolEntry(segment.pool, options)
    : null;
  const resolvedText = poolMeta?.usedPool
    ? String(poolMeta.text || "")
    : String(segment.text || "");

  return {
    mode: segment.mode === "replace" ? "replace" : defaultMode,
    text: resolvedText,
    poolMeta,
    sceneTags: normalizeSceneTags(segment.sceneTags)
  };
}

function pickLayerVariant(layerName, variants, sceneContext, trace, meta = {}) {
  if (!Array.isArray(variants)) {
    return pickShorthandVariant(layerName, variants, sceneContext, trace, meta);
  }

  const rows = Array.isArray(variants) ? variants : [];
  const hits = rows.filter(row => matchesWhen(sceneContext, row?.when));

  if (hits.length > 1) {
    console.error(`[ContentSelectError] layer=${layerName} multiple matches`, { layerName, hits, sceneContext, trace });
  }

  const hit = hits[0] || null;
  trace.layers.push({
    layer: layerName,
    hit: !!hit,
    matchedWhen: hit?.when || null
  });
  return hit;
}

function selectTextVariantsResult(sceneContext, textSpec, meta = {}) {
  if (!textSpec || typeof textSpec !== "object") return null;

  const dailyNoticeBoardResult = resolveDailyNoticeBoardTextSpec(textSpec.dailyNoticeBoard, sceneContext, meta);
  if (dailyNoticeBoardResult) {
    return {
      text: dailyNoticeBoardResult.text || null,
      model: dailyNoticeBoardResult.model || null,
      trace: dailyNoticeBoardResult.trace
    };
  }

  const trace = createTraceBase(sceneContext, meta);

  const base = coerceSegmentText(textSpec.base, "replace", {
    stableSalt: buildPoolStableSalt(meta, "base", "base"),
    stableKey: sceneContext?.clock?.minuteOfDay
  });
  let resultText = String(base.text || "").trim();
  let resultSceneTags = normalizeSceneTags(textSpec.sceneTags);
  trace.layers.push({
    layer: "base",
    hit: !!resultText,
    matchedWhen: null
  });

  const binaryDayNight = resolveBinaryDayNightVariantResult(sceneContext, textSpec, trace, meta);
  if (binaryDayNight?.text) {
    if (binaryDayNight.mode === "replace") {
      resultText = binaryDayNight.text;
    } else {
      resultText = [resultText, binaryDayNight.text].filter(Boolean).join(" ");
    }
  }

  const layerOrder = [
    ["scheduleVariants", textSpec.scheduleVariants],
    ["moodVariants", textSpec.moodVariants],
    ["serviceVariants", textSpec.serviceVariants],
    ["lightVariants", textSpec.lightVariants],
    ["weatherVariants", textSpec.weatherVariants],
    ["visibilityVariants", textSpec.visibilityVariants],
    ["legacyDayNightVariants", textSpec.legacyDayNightVariants]
  ];

  for (const [layerName, rows] of layerOrder) {
    const hit = pickLayerVariant(layerName, rows, sceneContext, trace, meta);
    if (!hit) continue;

    if (layerName === "legacyDayNightVariants") {
      trace.usedLegacyDayNightCompat = true;
    }

    const segment = coerceSegmentText(hit, "append", {
      stableSalt: buildPoolStableSalt(meta, layerName, JSON.stringify(hit?.when || {})),
      stableKey: sceneContext?.clock?.minuteOfDay
    });
    const text = String(segment.text || "").trim();
    if (!text) continue;

    if (segment.mode === "replace") {
      resultText = text;
    } else {
      resultText = [resultText, text].filter(Boolean).join(" ");
    }

    if (segment.sceneTags.length > 0 || hit?.clearSceneTags === true) {
      resultSceneTags = hit?.clearSceneTags === true ? [] : segment.sceneTags;
    }
  }

  trace.resultText = resultText;
  pushContentTrace(trace);

  return {
    text: resultText || null,
    sceneTags: Object.freeze(resultSceneTags),
    trace
  };
}

function pickStableDailyBoardEntry(pool, sceneContext, salt) {
  const items = Array.isArray(pool)
    ? pool.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (!items.length) {
    return { text: "", index: -1, count: 0 };
  }

  const dayKey = buildStableCalendarDayKey(sceneContext?.calendar || {});
  const index = hashStableString(`${salt}:${dayKey}`) % items.length;
  return {
    text: items[index],
    index,
    count: items.length
  };
}

function resolveDailyNoticeBoardTextSpec(boardSpec, sceneContext, meta = {}) {
  if (!boardSpec || typeof boardSpec !== "object") return null;

  const sticky = String(boardSpec.sticky || "").trim();
  const formal = pickStableDailyBoardEntry(
    boardSpec.formalNoticePool,
    sceneContext,
    `${String(meta.mapId || "")}:${String(meta.actionId || "")}:formal`
  );
  const handwritten = pickStableDailyBoardEntry(
    boardSpec.handwrittenNotePool,
    sceneContext,
    `${String(meta.mapId || "")}:${String(meta.actionId || "")}:handwritten`
  );
  const oldFragment = pickStableDailyBoardEntry(
    boardSpec.oldNoticeFragmentPool,
    sceneContext,
    `${String(meta.mapId || "")}:${String(meta.actionId || "")}:old`
  );

  const text = [sticky, formal.text, handwritten.text, oldFragment.text]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!text) return null;

  const trace = createTraceBase(sceneContext, {
    ...meta,
    finalTextSource: "content_runtime.daily_notice_board"
  });
  trace.layers.push({
    layer: "dailyNoticeBoard.sticky",
    hit: !!sticky,
    matchedWhen: sticky ? { fixed: true } : null
  });
  trace.layers.push({
    layer: "dailyNoticeBoard.formalNoticePool",
    hit: !!formal.text,
    matchedWhen: formal.index >= 0 ? { dayKey: buildStableCalendarDayKey(sceneContext?.calendar || {}), index: formal.index, count: formal.count } : null
  });
  trace.layers.push({
    layer: "dailyNoticeBoard.handwrittenNotePool",
    hit: !!handwritten.text,
    matchedWhen: handwritten.index >= 0 ? { dayKey: buildStableCalendarDayKey(sceneContext?.calendar || {}), index: handwritten.index, count: handwritten.count } : null
  });
  trace.layers.push({
    layer: "dailyNoticeBoard.oldNoticeFragmentPool",
    hit: !!oldFragment.text,
    matchedWhen: oldFragment.index >= 0 ? { dayKey: buildStableCalendarDayKey(sceneContext?.calendar || {}), index: oldFragment.index, count: oldFragment.count } : null
  });
  trace.resultText = text;
  pushContentTrace(trace);

  const model = {
    title: "前廊告示板",
    meta: "当日张贴 / 前廊",
    stickyNotice: sticky,
    formalNotice: formal.text,
    handwrittenNote: handwritten.text,
    oldNoticeFragment: oldFragment.text
  };

  return {
    text,
    model,
    finalTextSource: "content_runtime.daily_notice_board",
    usedLegacyFallback: false,
    contentKey: meta.contentKey || "",
    sceneKey: meta.sceneKey || sceneContext?.sceneId || null,
    trace
  };
}

export function buildSceneContext(mapId, mapData = null) {
  const map = mapData || gameState.currentMap || null;
  const worldTimeContext = getWorldTimeContext();
  const weather = gameState.world?.weather || {};
  const placeProfile = map?.placeProfile || {};
  const exposureLevel = String(map?.environment?.exposureLevel || placeProfile?.exposureLevel || "Open");
  const space = String(placeProfile?.space || (exposureLevel === "Sheltered" ? "indoor" : "outdoor"));
  const activeSceneId = String(
    String(map?.id || "") === String(mapId || "")
      ? (gameState?.currentScene?.id || gameState?.currentSceneId || "")
      : ""
  ).trim() || null;
  const sceneRuntime = resolveRuntimeSceneDefinition(mapId, activeSceneId);
  const industrialDispatchStatus = resolveIndustrialDispatchStatusFromContext({
    minuteOfDay: worldTimeContext.clock.minuteOfDay,
    visibilityBand: worldTimeContext.illumination.visibilityBand,
    weather: {
      cloudType: String(weather.cloudType || "Clear"),
      isSnowing: weather.isSnowing === true,
      snowfallRate: Number(weather.snowfallRate || 0),
      stormIntensity: Number(weather.stormIntensity || 0),
      windSpeedLocal: Number(weather.windSpeed_local || weather.windSpeedLocal || 0)
    }
  });
  const runtimeProviderSnapshot = buildRuntimeProviderSnapshot(gameState, gameState?.time?.totalMinutes);

  const sceneContext = {
    mapId: String(mapId || map?.id || ""),
    sceneId: activeSceneId || sceneRuntime?.sceneId || null,
    clock: worldTimeContext.clock,
    calendar: {
      year: worldTimeContext.calendar.year,
      month: worldTimeContext.calendar.month,
      day: worldTimeContext.calendar.day,
      dayOfYear: worldTimeContext.calendar.dayOfYear,
      season: worldTimeContext.calendar.season,
      seasonSubphase: worldTimeContext.calendar.seasonSubphase,
      isClosureSeason: worldTimeContext.calendar.isClosureSeason,
      closureSeverity01: worldTimeContext.calendar.closureSeverity01
    },
    schedule: {
      phase: worldTimeContext.timePhase,
      serviceBand: worldTimeContext.serviceBand,
      legacyDayNight: worldTimeContext.legacyDayNight,
      industrialManifestStatus: industrialDispatchStatus.manifest,
      industrialSubsidyTagStatus: industrialDispatchStatus.subsidyTag
    },
    light: {
      lightPhase: worldTimeContext.illumination.lightPhase,
      sunLevel: worldTimeContext.illumination.sunLevel,
      visibilityBand: worldTimeContext.illumination.visibilityBand,
      isDarkLike: worldTimeContext.illumination.isDarkLike
    },
    weather: {
      cloudType: String(weather.cloudType || "Clear"),
      isSnowing: weather.isSnowing === true,
      snowfallRate: Number(weather.snowfallRate || 0),
      stormIntensity: Number(weather.stormIntensity || 0),
      windSpeedLocal: Number(weather.windSpeed_local || weather.windSpeedLocal || 0)
    },
    scene: {
      indoor: space === "indoor",
      sheltered: exposureLevel === "Sheltered" || exposureLevel === "SemiSheltered",
      windowed: space !== "outdoor",
      exposureLevel,
      space
    }
  };

  sceneContext.presence = getNpcPresenceSnapshot({
    gameState,
    calendar: sceneContext.calendar,
    time: {
      serviceBand: worldTimeContext.serviceBand
    },
    mapId: sceneContext.mapId,
    sceneId: sceneContext.sceneId,
    serviceBand: sceneContext.schedule.serviceBand,
    runtimeProviderSnapshot
  });
  sceneContext.social = buildSocialRuntimeContext(gameState);
  sceneContext.blocker = getMargTransitionBlockerRuntimeContext(gameState);

  sceneContext.service = {
    providerBands: runtimeProviderSnapshot.providerBands,
    shippingState: getSteelCrossPortShippingState({
      ...sceneContext,
      mapData: map,
      state: gameState
    })
  };

  return sceneContext;
}

export function selectTextVariants(sceneContext, textSpec, meta = {}) {
  return selectTextVariantsResult(sceneContext, textSpec, meta)?.text || null;
}

function resolveRuntimeSceneDefinition(mapId, sceneId = null) {
  const content = getCurrentMapContent(mapId);
  const runtimeText = content?.RuntimeText;
  if (!runtimeText || typeof runtimeText !== "object") return null;

  const mapTextSpec = runtimeText?.mapTextByMapId;
  if (mapTextSpec && typeof mapTextSpec === "object") {
    const sceneRuntimeKey = sceneId ? `${String(mapId || "")}#${String(sceneId || "")}` : "";
    if (sceneRuntimeKey && mapTextSpec[sceneRuntimeKey]) {
      return {
        ...mapTextSpec[sceneRuntimeKey],
        __runtimeKey: sceneRuntimeKey
      };
    }
    if (mapTextSpec[String(mapId || "")]) {
      return {
        ...mapTextSpec[String(mapId || "")],
        __runtimeKey: String(mapId || "")
      };
    }
  }

  const actionTextSpec = runtimeText?.actionTextByMapId;
  if (actionTextSpec && typeof actionTextSpec === "object" && actionTextSpec[String(mapId || "")]) {
    return {
      ...actionTextSpec[String(mapId || "")],
      __runtimeKey: String(mapId || "")
    };
  }

  return null;
}

function resolveActionRuntimeDefinition(mapId, actionId) {
  const content = getCurrentMapContent(mapId);
  const spec = content?.RuntimeText?.actionTextByMapId;
  if (!spec || typeof spec !== "object") return null;

  const mapRuntime = spec[String(mapId || "")];
  if (!mapRuntime || typeof mapRuntime !== "object") return null;

  const actionTextByActionId = mapRuntime.actionTextByActionId;
  if (!actionTextByActionId || typeof actionTextByActionId !== "object") return null;

  return actionTextByActionId[String(actionId || "")] || null;
}

function resolveLegacyActionTextFallback(sceneContext, fallbackText, meta = {}, legacyFallbackKind = "action.text") {
  const text = String(fallbackText || "").trim();
  if (!text) return null;

  const trace = createTraceBase(sceneContext, {
    ...meta,
    finalTextSource: "legacy_action_field"
  });
  trace.usedLegacyFallback = true;
  trace.legacyFallbackKind = legacyFallbackKind;
  trace.layers.push({
    layer: `legacy.${legacyFallbackKind}`,
    hit: true,
    matchedWhen: null
  });
  trace.resultText = text;
  pushContentTrace(trace);

  return {
    text,
    finalTextSource: "legacy_action_field",
    usedLegacyFallback: true,
    contentKey: meta.contentKey || "",
    sceneKey: meta.sceneKey || sceneContext?.sceneId || null,
    trace
  };
}

function applyRuntimeTemplateVarsToBoardModel(model, vars) {
  if (!model || typeof model !== "object") return null;

  const next = { ...model };
  for (const key of ["title", "meta", "stickyNotice", "formalNotice", "handwrittenNote", "oldNoticeFragment"]) {
    if (typeof next[key] === "string" && next[key].trim()) {
      next[key] = applyRuntimeTemplateVars(next[key], vars);
    }
  }
  return next;
}

export function resolveActionRuntimeTextResult(mapId, actionId, textType, options = {}) {
  const actionDef = resolveActionRuntimeDefinition(mapId, actionId);
  const sceneContext = buildSceneContext(mapId, options.mapData || null);
  const sceneKey = resolveRuntimeSceneDefinition(mapId, sceneContext.sceneId)?.sceneId || sceneContext.sceneId;
  const slot = String(textType || "actionLabel");
  const actionKey = `RuntimeText.actionTextByMapId.${String(mapId || "")}.actionTextByActionId.${String(actionId || "")}`;

  let textSpec = null;
  let contentKey = `${actionKey}.${slot}`;
  if (actionDef && typeof actionDef === "object") {
    if (slot === "logLine") {
      const logLinesByIndex = actionDef.logLinesByIndex;
      const logLineIndex = Number(options.logLineIndex || 0);
      if (logLinesByIndex && typeof logLinesByIndex === "object") {
        textSpec = logLinesByIndex[String(logLineIndex)] || null;
        contentKey = `${actionKey}.logLinesByIndex.${String(logLineIndex)}`;
      }
    } else {
      textSpec = actionDef[slot] || null;
    }
  }

  if (textSpec && typeof textSpec === "object") {
    const runtimeText = selectTextVariantsResult(sceneContext, textSpec, {
      mapId,
      sceneId: sceneKey,
      sceneKey,
      actionId,
      contentKey,
      slot,
      finalTextSource: "content_runtime"
    });
    if (typeof runtimeText?.text === "string" && runtimeText.text.trim()) {
      const vars = buildRuntimeTemplateVars(mapId);
      return {
        text: applyRuntimeTemplateVars(runtimeText.text, vars),
        model: applyRuntimeTemplateVarsToBoardModel(runtimeText.model, vars),
        finalTextSource: "content_runtime",
        usedLegacyFallback: false,
        contentKey,
        sceneKey,
        trace: runtimeText.trace
      };
    }
  }

  return resolveLegacyActionTextFallback(sceneContext, options.legacyFallbackText, {
    mapId,
    sceneId: sceneKey,
    sceneKey,
    actionId,
    contentKey,
    slot
  }, options.legacyFallbackKind || slot);
}

function getActionLegacyTextState(action) {
  if (!action || typeof action !== "object") return null;
  const state = {
    actionLabel: String(action.text || ""),
    logLinesByIndex: []
  };

  let logLineIndex = 0;
  for (const effect of Array.isArray(action.effects) ? action.effects : []) {
    if (effect?.op !== "push" || effect?.path !== "logLines") continue;
    state.logLinesByIndex[logLineIndex] = String(effect?.value || "");
    logLineIndex += 1;
  }

  return state;
}

function cloneInteractionEffectsWithRuntimeText(mapId, interaction, mapData, legacyState) {
  const effects = Array.isArray(interaction?.effects)
    ? interaction.effects.map((effect) => (effect && typeof effect === "object" ? { ...effect } : effect))
    : interaction?.effects;
  let logLineIndex = 0;
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (effect?.op !== "push" || effect?.path !== "logLines") continue;

    const logLineResult = resolveActionRuntimeTextResult(mapId, interaction.id, "logLine", {
      mapData,
      logLineIndex,
      legacyFallbackText: legacyState?.logLinesByIndex?.[logLineIndex] || "",
      legacyFallbackKind: `logLine.${String(logLineIndex)}`
    });

    if (typeof logLineResult?.text === "string" && logLineResult.text.trim()) {
      effect.value = logLineResult.text;
    }
    logLineIndex += 1;
  }
  return effects;
}

function resolveInteractionFeedbackResult(mapId, interaction, mapData = null) {
  const fallbackText = String(interaction?.ui?.feedback?.message || interaction?.uiFeedback?.message || "").trim();
  return resolveActionRuntimeTextResult(mapId, interaction?.id, "actionFeedback", {
    mapData,
    legacyFallbackText: fallbackText,
    legacyFallbackKind: "actionFeedback"
  });
}

export function buildInteractionUiFeedback(mapId, interaction, mapData = null) {
  if (!interaction || typeof interaction !== "object" || !interaction.id) return null;
  const labelResult = resolveActionRuntimeTextResult(mapId, interaction.id, "actionLabel", {
    mapData,
    legacyFallbackText: String(interaction.text || ""),
    legacyFallbackKind: "actionLabel"
  });
  const feedbackResult = resolveInteractionFeedbackResult(mapId, interaction, mapData);
  const interactionUi = interaction.ui && typeof interaction.ui === "object" ? interaction.ui : {};
  const declarativeFeedback = interactionUi.feedback && typeof interactionUi.feedback === "object"
    ? interactionUi.feedback
    : (interaction.uiFeedback && typeof interaction.uiFeedback === "object" ? interaction.uiFeedback : {});
  const message = typeof feedbackResult?.text === "string" && feedbackResult.text.trim()
    ? feedbackResult.text
    : String(declarativeFeedback.message || "").trim();
  if (!message) return null;
  const title = String(
    declarativeFeedback.title
    || labelResult?.text
    || interaction.text
    || interaction.id
  ).trim();
  const resolvedModel = feedbackResult?.model && typeof feedbackResult.model === "object"
    ? { ...feedbackResult.model }
    : (declarativeFeedback.model && typeof declarativeFeedback.model === "object" ? { ...declarativeFeedback.model } : null);
  let resolvedVariant = String(declarativeFeedback.variant || interactionUi.feedbackVariant || "").trim() || null;
  if (!resolvedVariant && interaction.id === "front_hall_check_notice_board" && resolvedModel) {
    resolvedVariant = "front-hall-board";
  }
  return {
    title: title || "通知",
    message,
    model: resolvedModel,
    illustrationKey: String(declarativeFeedback.illustrationKey || interactionUi.illustrationKey || "").trim() || null,
    variant: resolvedVariant
  };
}

export function buildRuntimeInteractionViewModel(mapId, interaction, mapData = null) {
  if (!interaction || typeof interaction !== "object" || !interaction.id) return null;

  const legacyState = getActionLegacyTextState(interaction) || {
    actionLabel: String(interaction.text || ""),
    logLinesByIndex: []
  };
  const resolvedInteraction = {
    ...interaction,
    ui: interaction.ui && typeof interaction.ui === "object" ? { ...interaction.ui } : { type: "button" },
    effects: cloneInteractionEffectsWithRuntimeText(mapId, interaction, mapData, legacyState)
  };

  const labelResult = resolveActionRuntimeTextResult(mapId, interaction.id, "actionLabel", {
    mapData,
    legacyFallbackText: legacyState.actionLabel,
    legacyFallbackKind: "actionLabel"
  });
  if (typeof labelResult?.text === "string" && labelResult.text.trim()) {
    resolvedInteraction.text = labelResult.text;
  }

  return resolvedInteraction;
}

export function buildRuntimeActionViewModel(mapId, action, mapData = null) {
  if (!action || typeof action !== "object" || !action.id) return null;

  const legacyState = getActionLegacyTextState(action);
  if (!legacyState) return null;

  const resolvedAction = {
    ...action,
    ui: action.ui && typeof action.ui === "object" ? { ...action.ui } : { type: "button" },
    effects: Array.isArray(action.effects)
      ? action.effects.map((effect) => (effect && typeof effect === "object" ? { ...effect } : effect))
      : action.effects
  };

  const labelResult = resolveActionRuntimeTextResult(mapId, action.id, "actionLabel", {
    mapData,
    legacyFallbackText: legacyState.actionLabel,
    legacyFallbackKind: "actionLabel"
  });
  if (typeof labelResult?.text === "string" && labelResult.text.trim()) {
    resolvedAction.text = labelResult.text;
  }

  const feedbackResult = resolveActionRuntimeTextResult(mapId, action.id, "actionFeedback", {
    mapData,
    legacyFallbackText: "",
    legacyFallbackKind: "actionFeedback"
  });
  resolvedAction.ui.runtimeActionFeedback = typeof feedbackResult?.text === "string" && feedbackResult.text.trim()
    ? feedbackResult.text
    : "";
  resolvedAction.ui.legacyDatasetFeedback = true;
  resolvedAction.ui.runtimeActionFeedbackModel = feedbackResult?.model && typeof feedbackResult.model === "object"
    ? { ...feedbackResult.model }
    : null;
  resolvedAction.effects = cloneInteractionEffectsWithRuntimeText(mapId, action, mapData, legacyState);

  return resolvedAction;
}

export function applyRuntimeActionTextToAction(mapId, action, mapData = null) {
  return buildRuntimeActionViewModel(mapId, action, mapData) || action;
}

function resolveLegacyMinuteOfDayDescription(map, sceneContext, meta = {}) {
  if (!map || !Array.isArray(map.descriptionByMinuteOfDay)) {
    return null;
  }

  const minuteOfDay = Number(sceneContext?.clock?.minuteOfDay ?? 0);
  for (const it of map.descriptionByMinuteOfDay) {
    const start = Number(it?.start);
    const end = Number(it?.end);
    const text = String(it?.text ?? "").trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;

    const hit = start <= end
      ? (minuteOfDay >= start && minuteOfDay <= end)
      : (minuteOfDay >= start || minuteOfDay <= end);

    if (!hit) continue;

    const trace = createTraceBase(sceneContext, {
      ...meta,
      finalTextSource: "legacy_map_field"
    });
    trace.usedLegacyFallback = true;
    trace.legacyFallbackKind = "descriptionByMinuteOfDay";
    trace.layers.push({
      layer: "legacy.descriptionByMinuteOfDay",
      hit: true,
      matchedWhen: { start, end }
    });
    trace.resultText = text;
    pushContentTrace(trace);
    return text;
  }

  return null;
}

export function resolveMapRuntimeDescriptionResult(mapId, mapData = null) {
  const sceneContext = buildSceneContext(mapId, mapData);
  const sceneDef = resolveRuntimeSceneDefinition(mapId, sceneContext.sceneId);
  if (!sceneDef) return null;

  const contentKey = `RuntimeText.mapTextByMapId.${String(sceneDef.__runtimeKey || mapId || "")}.description`;
  const sceneKey = sceneDef?.sceneId || sceneContext.sceneId;
  const textSpec = sceneDef?.description;

  if (textSpec && typeof textSpec === "object") {
    const runtimeResult = selectTextVariantsResult(sceneContext, textSpec, {
      mapId,
      sceneId: sceneKey,
      sceneKey,
      contentKey,
      slot: "description",
      finalTextSource: "content_runtime"
    });
    const runtimeText = typeof runtimeResult?.text === "string"
      ? runtimeResult.text
      : "";
    if (typeof runtimeText === "string" && runtimeText.trim()) {
      const vars = buildRuntimeTemplateVars(mapId);
      return {
        text: applyRuntimeTemplateVars(runtimeText, vars),
        sceneTags: Array.isArray(runtimeResult?.sceneTags) ? runtimeResult.sceneTags : Object.freeze([]),
        finalTextSource: "content_runtime",
        usedLegacyFallback: false,
        contentKey,
        sceneKey
      };
    }
  }

  const legacyText = resolveLegacyMinuteOfDayDescription(mapData, sceneContext, {
    mapId,
    sceneId: sceneKey,
    sceneKey,
    contentKey: "map.descriptionByMinuteOfDay",
    slot: "description"
  });
  if (typeof legacyText === "string" && legacyText.trim()) {
    return {
      text: legacyText,
      finalTextSource: "legacy_map_field",
      usedLegacyFallback: true,
      contentKey: "map.descriptionByMinuteOfDay",
      sceneKey
    };
  }

  return null;
}

export function resolveMapRuntimeDescription(mapId, mapData = null) {
  return resolveMapRuntimeDescriptionResult(mapId, mapData)?.text || null;
}

export async function initMapContentRuntime() {
  await primeSteelCrossPortMapMeta();

  const index = await loadMapContentIndex();
  if (!index || !index.entries || typeof index.entries !== "object") {
    console.warn("[MapContent] 索引加载失败，跳过结构化地点运行时");
    initMedicalRuntime({});
    return false;
  }

  const ids = Object.keys(index.entries);
  const loaded = {};

  for (const id of ids) {
    const content = await loadMapContent(id);
    if (content) loaded[id] = content;
  }

  mapContentByMapId = loaded;
  initMedicalRuntime(mapContentByMapId);

  console.log(`[MapContent] 已加载 ${Object.keys(mapContentByMapId).length} 个结构化地点`);
  return true;
}
