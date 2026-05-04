export const TASK_STATUSES = ["open", "done", "archived"];

export function createDefaultRefData() {
  return {
    accounts: {
      unpaidFinesCents: 0
    },
    places: {
      loc_gov_hall: {
        name: "政务大厅",
        openHours: "星期一到星期六 9:00-18:00",
        location: "风堤街-转角公告段",
        notes: "节假日以公告为准"
      }
    },
    ships: {
      theseus: {
        name: "忒修斯号",
        tooltip: "每年南半球夏季开航；11月至2月在南极沿岸执行接驳、补给与人员轮换；3月13号完成最后撤离；冬季封航，返南美母港整备"
      }
    }
  };
}

export function normalizeRefData(refData) {
  const defaults = createDefaultRefData();
  const source = refData && typeof refData === "object" ? refData : {};
  const accounts = source.accounts && typeof source.accounts === "object" ? source.accounts : {};
  const places = source.places && typeof source.places === "object" ? source.places : {};
  const ships = source.ships && typeof source.ships === "object" ? source.ships : {};

  return {
    ...defaults,
    ...source,
    accounts: {
      ...defaults.accounts,
      ...accounts,
      unpaidFinesCents: Number.isFinite(Number(accounts.unpaidFinesCents))
        ? Math.max(0, Math.trunc(Number(accounts.unpaidFinesCents)))
        : defaults.accounts.unpaidFinesCents
    },
    places: {
      ...defaults.places,
      ...places
    },
    ships: {
      ...defaults.ships,
      ...ships
    }
  };
}

export function createDefaultTaskEntries() {
  return [];
}

export function createGovHallTaskEntry(nowMin = 0) {
  const ts = Number.isFinite(Number(nowMin)) ? Math.max(0, Math.floor(Number(nowMin))) : 0;
  return {
    id: "task_gov_hall_id",
    title: "前往政务大厅办理身份证明",
    status: "open",
    createdAtMin: ts,
    updatedAtMin: ts,
    body: [
      { t: "text", v: "前往" },
      { t: "ref", refType: "place", refId: "loc_gov_hall", label: "政务大厅" },
      { t: "text", v: "一楼询问身份办理相关事宜。" }
    ],
    tags: ["待办事项"],
    pinned: false
  };
}

export function createTheseusBoardingTaskEntry(nowMin = 0) {
  const ts = Number.isFinite(Number(nowMin)) ? Math.max(0, Math.floor(Number(nowMin))) : 0;
  return {
    id: "task_theseus_boarding",
    title: "忒修斯号登船提醒",
    status: "open",
    createdAtMin: ts,
    updatedAtMin: ts,
    body: [
      { t: "text", v: "请向港口码头" },
      { t: "ref", refType: "ship", refId: "theseus", label: "忒修斯号" },
      { t: "text", v: "工作人员咨询情况使用船票" }
    ],
    tags: ["待办事项"],
    pinned: true
  };
}

export function normalizeTaskToken(token) {
  if (!token || typeof token !== "object") {
    return { t: "text", v: "" };
  }

  if (token.t === "ref") {
    const refType = String(token.refType || "").trim();
    const refId = String(token.refId || "").trim();
    const label = String(token.label || "").trim();
    if (!refType || !refId) {
      return { t: "text", v: label || "" };
    }
    return {
      t: "ref",
      refType,
      refId,
      label: label || refId
    };
  }

  return {
    t: "text",
    v: String(token.v || "")
  };
}

export function normalizeTaskBody(body) {
  if (!Array.isArray(body)) return [];
  return body.map(normalizeTaskToken);
}

export function normalizeTaskEntry(entry, index = 0) {
  const fallbackId = `task_auto_${index + 1}`;
  const id = String(entry?.id || fallbackId).trim() || fallbackId;
  const title = String(entry?.title || "未命名备忘").trim() || "未命名备忘";
  const status = TASK_STATUSES.includes(String(entry?.status || ""))
    ? String(entry.status)
    : "open";
  const createdAtMin = Number.isFinite(Number(entry?.createdAtMin))
    ? Math.max(0, Math.floor(Number(entry.createdAtMin)))
    : 0;
  const updatedAtMin = Number.isFinite(Number(entry?.updatedAtMin))
    ? Math.max(0, Math.floor(Number(entry.updatedAtMin)))
    : createdAtMin;

  const tags = Array.isArray(entry?.tags)
    ? entry.tags.map(x => String(x || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    id,
    title,
    status,
    createdAtMin,
    updatedAtMin,
    body: normalizeTaskBody(entry?.body),
    tags,
    pinned: !!entry?.pinned
  };
}

export function normalizeTaskList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const normalized = [];
  for (let i = 0; i < list.length; i++) {
    const row = normalizeTaskEntry(list[i], i);
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    normalized.push(row);
  }
  return normalized;
}

export function sortTaskEntries(list) {
  const statusRank = { open: 0, done: 1, archived: 2 };
  return [...normalizeTaskList(list)].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const sA = statusRank[a.status] ?? 9;
    const sB = statusRank[b.status] ?? 9;
    if (sA !== sB) return sA - sB;
    if (a.updatedAtMin !== b.updatedAtMin) return b.updatedAtMin - a.updatedAtMin;
    return String(a.title).localeCompare(String(b.title), "zh-CN");
  });
}

export function getTaskStatusLabel(status) {
  if (status === "done") return "done";
  if (status === "archived") return "archived";
  return "open";
}
