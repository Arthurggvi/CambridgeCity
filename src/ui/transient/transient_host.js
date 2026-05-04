import {
  TRANSIENT_RUNTIME_CARD_LANE_CLASS,
  TRANSIENT_RUNTIME_CARD_LAYER_CLASS,
  TRANSIENT_RUNTIME_HOST_CLASS,
  TRANSIENT_RUNTIME_HOST_ID,
  TRANSIENT_RUNTIME_LAYER_CLASS,
  TRANSIENT_RUNTIME_TOAST_LAYER_CLASS,
  TRANSIENT_RUNTIME_TOAST_LANE_CLASS
} from "./transient_contract.js";

function getDocumentRoot(documentRoot = null) {
  return documentRoot || (typeof document !== "undefined" ? document : null);
}

function resolveHostParent(doc) {
  return doc?.body || null;
}

function ensureTransientRuntimeLayer(host, doc) {
  let layer = host.querySelector(`:scope > .${TRANSIENT_RUNTIME_LAYER_CLASS}`);
  if (!layer) {
    layer = doc.createElement("div");
    layer.className = TRANSIENT_RUNTIME_LAYER_CLASS;
    host.appendChild(layer);
  }
  return layer;
}

function ensureTransientRuntimeSubLayer(layer, layerClass, doc) {
  let subLayer = layer.querySelector(`:scope > .${layerClass}`);
  if (!subLayer) {
    subLayer = doc.createElement("div");
    subLayer.className = layerClass;
    layer.appendChild(subLayer);
  }
  return subLayer;
}

function ensureTransientLane(layer, laneClass, doc) {
  let lane = layer.querySelector(`:scope > .${laneClass}`);
  if (!lane) {
    lane = doc.createElement("div");
    lane.className = laneClass;
    layer.appendChild(lane);
  }
  return lane;
}

export function ensureTransientRuntimeHost({ documentRoot = null } = {}) {
  const doc = getDocumentRoot(documentRoot);
  if (!doc) {
    return {
      host: null,
      layer: null,
      parent: null
    };
  }

  const parent = resolveHostParent(doc);
  if (!parent) {
    return {
      host: null,
      layer: null,
      parent: null
    };
  }

  let host = doc.getElementById(TRANSIENT_RUNTIME_HOST_ID);
  if (!host) {
    host = doc.createElement("div");
    host.id = TRANSIENT_RUNTIME_HOST_ID;
    host.className = TRANSIENT_RUNTIME_HOST_CLASS;
    host.setAttribute("aria-hidden", "true");
    parent.appendChild(host);
  } else if (host.parentElement !== parent) {
    parent.appendChild(host);
  }

  const layer = ensureTransientRuntimeLayer(host, doc);
  const cardLayer = ensureTransientRuntimeSubLayer(layer, TRANSIENT_RUNTIME_CARD_LAYER_CLASS, doc);
  const toastLayer = ensureTransientRuntimeSubLayer(layer, TRANSIENT_RUNTIME_TOAST_LAYER_CLASS, doc);
  const cardLane = ensureTransientLane(cardLayer, TRANSIENT_RUNTIME_CARD_LANE_CLASS, doc);
  const toastLane = ensureTransientLane(toastLayer, TRANSIENT_RUNTIME_TOAST_LANE_CLASS, doc);
  return { host, layer, cardLayer, toastLayer, cardLane, toastLane, parent };
}

export function clearTransientRuntimeHost({ documentRoot = null, removeHost = false } = {}) {
  const doc = getDocumentRoot(documentRoot);
  const host = doc?.getElementById(TRANSIENT_RUNTIME_HOST_ID) || null;
  if (!host) return null;

  host.innerHTML = "";
  host.setAttribute("aria-hidden", "true");

  if (removeHost) {
    host.remove();
    return null;
  }

  return host;
}

export function getTransientRuntimeHostSnapshot({ documentRoot = null } = {}) {
  const doc = getDocumentRoot(documentRoot);
  const host = doc?.getElementById(TRANSIENT_RUNTIME_HOST_ID) || null;
  const layer = host?.querySelector(`:scope > .${TRANSIENT_RUNTIME_LAYER_CLASS}`) || null;
  const cardLayer = layer?.querySelector(`:scope > .${TRANSIENT_RUNTIME_CARD_LAYER_CLASS}`) || null;
  const toastLayer = layer?.querySelector(`:scope > .${TRANSIENT_RUNTIME_TOAST_LAYER_CLASS}`) || null;
  const cardLane = cardLayer?.querySelector(`:scope > .${TRANSIENT_RUNTIME_CARD_LANE_CLASS}`) || null;
  const toastLane = toastLayer?.querySelector(`:scope > .${TRANSIENT_RUNTIME_TOAST_LANE_CLASS}`) || null;
  const parent = host?.parentElement || null;
  return {
    hostId: host?.id || "",
    hostExists: !!host,
    hostConnected: !!host?.isConnected,
    layerExists: !!layer,
    cardLayerExists: !!cardLayer,
    toastLayerExists: !!toastLayer,
    cardLaneExists: !!cardLane,
    toastLaneExists: !!toastLane,
    itemCount: Number(host?.querySelectorAll(".transient-runtime-item").length || 0),
    parentId: parent?.id || "",
    parentTagName: parent?.tagName || ""
  };
}