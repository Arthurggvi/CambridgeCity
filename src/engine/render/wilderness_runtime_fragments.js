function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent != null && textContent !== "") node.textContent = String(textContent);
  return node;
}

function fieldRow(label, value) {
  const row = el("div", "wilderness-runtime__row");
  row.appendChild(el("span", "wilderness-runtime__k", label));
  row.appendChild(el("span", "wilderness-runtime__v", value));
  return row;
}

function buildDom(vm) {
  const root = el("div", "wilderness-runtime");
  const head = el("div", "wilderness-runtime__head");
  head.appendChild(el("h1", "wilderness-runtime__title", vm.title || "野外"));
  const sub = el("div", "wilderness-runtime__subtitle");
  if (vm.session) {
    sub.textContent = `${String(vm.session.regionLabel || "")} · ${String(vm.session.regionId || "")}`;
  }
  head.appendChild(sub);
  root.appendChild(head);

  const desc = vm.description && typeof vm.description === "object" ? vm.description : {};
  const descBlock = el("section", "wilderness-runtime__desc");
  descBlock.appendChild(el("h2", "wilderness-runtime__desc-title", desc.title || ""));
  const body = el("p", "wilderness-runtime__desc-body");
  body.textContent = String(desc.body || "");
  descBlock.appendChild(body);
  root.appendChild(descBlock);

  if (vm.session) {
    const s = vm.session;
    const meta = el("section", "wilderness-runtime__meta");
    meta.appendChild(fieldRow("坐标", `${s.x}, ${s.y}`));
    meta.appendChild(fieldRow("朝向", s.heading));
    meta.appendChild(fieldRow("会话状态", s.state));
    root.appendChild(meta);
  }

  if (vm.terrain && vm.terrain.label) {
    const t = vm.terrain;
    const card = el("section", "wilderness-runtime__card");
    card.appendChild(el("h3", "wilderness-runtime__card-title", "当前地貌"));
    card.appendChild(fieldRow("名称", t.label));
    if (t.passability) {
      card.appendChild(fieldRow("步行", t.passability.foot));
      card.appendChild(fieldRow("载具", t.passability.vehicle));
    }
    if (t.move) {
      card.appendChild(fieldRow("移动耗时倍率", String(t.move.moveTimeMult)));
      card.appendChild(fieldRow("体力消耗倍率", String(t.move.staminaCostMult)));
    }
    root.appendChild(card);
  }

  if (vm.climate) {
    const c = vm.climate;
    const card = el("section", "wilderness-runtime__card");
    card.appendChild(el("h3", "wilderness-runtime__card-title", "区域气候基线"));
    card.appendChild(fieldRow("T_base", String(c.T_base)));
    card.appendChild(fieldRow("WindBase", String(c.WindBase)));
    card.appendChild(fieldRow("盛行风向", String(c.WindDir_prevailing)));
    card.appendChild(fieldRow("MoistureIndex", String(c.MoistureIndex)));
    root.appendChild(card);
  }

  if (vm.surface && typeof vm.surface === "object") {
    const s = vm.surface;
    const card = el("section", "wilderness-runtime__card");
    card.appendChild(el("h3", "wilderness-runtime__card-title", "地表运行态"));
    card.appendChild(fieldRow("能见度等级", String(s.visibilityLevel ?? "")));
    card.appendChild(fieldRow("雪深(cm)", String(s.snowDepthCm ?? "")));
    card.appendChild(fieldRow("轨迹保留", String(s.trailRetention ?? "")));
    card.appendChild(fieldRow("探读置信倍率", String(s.probeConfidenceMult ?? "")));
    root.appendChild(card);
  }

  if (vm.weatherForecast && typeof vm.weatherForecast === "object") {
    const f = vm.weatherForecast;
    const card = el("section", "wilderness-runtime__card");
    card.appendChild(el("h3", "wilderness-runtime__card-title", "天气预报（只读推演）"));
    const sn = f.shortNowcast30m && typeof f.shortNowcast30m === "object" ? f.shortNowcast30m : {};
    const df = f.dailyForecast24h && typeof f.dailyForecast24h === "object" ? f.dailyForecast24h : {};
    const ex = f.extremeOutlook72h && typeof f.extremeOutlook72h === "object" ? f.extremeOutlook72h : {};
    const ep = f.exposure && typeof f.exposure === "object" ? f.exposure : {};
    card.appendChild(fieldRow("30分钟", String(sn.text || "")));
    card.appendChild(fieldRow("24小时", String(df.text || "")));
    card.appendChild(fieldRow("72小时", String(ex.text || "")));
    card.appendChild(fieldRow("风险提示", String(ep.summary || "")));
    root.appendChild(card);
  }

  const note = el("p", "wilderness-runtime__note");
  note.textContent = "野外八向移动与探读预览已接入（探读只读，不代替 resolve/commit）。";
  root.appendChild(note);

  if (Array.isArray(vm.actions)) {
    const actionsHost = el("div", "wilderness-runtime__actions");
    for (const a of vm.actions) {
      const wrap = el("div", null);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wilderness-runtime__action";
      btn.disabled = a.disabled === true;
      btn.textContent = String(a.label || "");
      if (a.reason) btn.title = String(a.reason);
      if (a.id) btn.setAttribute("data-action-id", String(a.id));
      wrap.appendChild(btn);
      const pr = a.probe && typeof a.probe === "object" ? a.probe : null;
      if (pr) {
        const sub = el("div", "wilderness-runtime__subtitle");
        sub.style.marginTop = "2px";
        const t = pr.timeCostPreview === Infinity ? "∞" : String(pr.timeCostPreview ?? "");
        const s = pr.staminaCostPreview === Infinity ? "∞" : String(pr.staminaCostPreview ?? "");
        sub.textContent = `${String(pr.text || "")} · 置信${String(pr.confidence ?? "")} · 时间${t} · 体力${s}`;
        wrap.appendChild(sub);
      }
      actionsHost.appendChild(wrap);
    }
    root.appendChild(actionsHost);
  }

  if (Array.isArray(vm.warnings) && vm.warnings.length > 0) {
    const w = el("div", "wilderness-runtime__warnings");
    w.textContent = `提示：${vm.warnings.map((x) => String(x)).join(" · ")}`;
    root.appendChild(w);
  }

  return root;
}

export function renderWildernessRuntime(vm) {
  if (typeof document === "undefined") {
    return { __wildernessRuntimeHeadlessStub: true, status: vm?.status || null };
  }
  return buildDom(vm || {});
}
