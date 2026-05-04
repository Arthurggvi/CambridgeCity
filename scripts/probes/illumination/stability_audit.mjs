const nativeFetch = global.fetch;
global.fetch = (input, init) => {
  const base = 'http://127.0.0.1:5500/';
  const url = typeof input === 'string' ? new URL(input, base) : new URL(input.url, base);
  return nativeFetch(url, init);
};
const { initMapContentRuntime, buildRuntimeActionViewModel } = await import('./src/engine/map_content_runtime.js');
const { loadMap } = await import('./src/engine/loader.js');
await initMapContentRuntime();
const map = await loadMap('bayport_clinic');
const action = Array.isArray(map.actions) ? map.actions.find((row) => String(row?.id || '').trim() !== '') : null;
if (!action) {
  throw new Error('no action found');
}
const before = JSON.stringify(action);
const resolved = buildRuntimeActionViewModel(String(map.id || ''), action, map);
const after = JSON.stringify(action);
const payload = {
  mapId: map.id,
  actionId: action.id,
  mutated: before !== after,
  resolvedDiffers: JSON.stringify(resolved) !== before,
  originalText: action.text,
  resolvedText: resolved?.text || ''
};
console.log(JSON.stringify(payload, null, 2));
