const MESSAGE_LEDGER_LIMIT = 512;

const messageLedger = [];

function normalizeLedgerLine(line) {
  return String(line || "").trim();
}

function normalizeLedgerEntry(entry = {}) {
  const gameTimeMinutes = Number(entry?.gameTimeMinutes);
  const createdAt = Number(entry?.createdAt);
  const lines = Array.isArray(entry?.lines)
    ? entry.lines.map(normalizeLedgerLine).filter(Boolean).slice(0, 5)
    : [];

  return {
    id: String(entry?.id || "").trim(),
    source: String(entry?.source || "toast").trim() || "toast",
    title: String(entry?.title || "状态更新").trim() || "状态更新",
    lines,
    variant: String(entry?.variant || "").trim().toLowerCase() || null,
    gameTimeMinutes: Number.isFinite(gameTimeMinutes) ? Math.trunc(gameTimeMinutes) : null,
    createdAt: Number.isFinite(createdAt) ? Math.trunc(createdAt) : Date.now()
  };
}

export function appendMessageLedgerEntries(entries = []) {
  const normalizedEntries = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalizedEntry = normalizeLedgerEntry(entry);
    if (!normalizedEntry.id || normalizedEntry.lines.length === 0) continue;
    normalizedEntries.push(normalizedEntry);
  }

  if (normalizedEntries.length === 0) {
    return {
      appendedCount: 0,
      size: messageLedger.length
    };
  }

  messageLedger.push(...normalizedEntries);
  if (messageLedger.length > MESSAGE_LEDGER_LIMIT) {
    messageLedger.splice(0, messageLedger.length - MESSAGE_LEDGER_LIMIT);
  }

  return {
    appendedCount: normalizedEntries.length,
    size: messageLedger.length
  };
}

export function getRecentMessageLedgerEntries({ nowTimeMinutes = null, windowMinutes = 24 * 60, limit = 64 } = {}) {
  const normalizedLimit = Math.max(1, Math.trunc(Number(limit) || 64));
  const normalizedNow = Number(nowTimeMinutes);
  const normalizedWindow = Math.max(1, Math.trunc(Number(windowMinutes) || 24 * 60));
  const source = Number.isFinite(normalizedNow)
    ? messageLedger.filter((entry) => Number.isFinite(entry.gameTimeMinutes) && entry.gameTimeMinutes >= normalizedNow - normalizedWindow && entry.gameTimeMinutes <= normalizedNow)
    : messageLedger.slice();

  return source.slice(-normalizedLimit).map((entry) => ({
    ...entry,
    lines: entry.lines.slice()
  }));
}

export function getMessageLedgerSnapshot() {
  return {
    size: messageLedger.length,
    entries: messageLedger.map((entry) => ({
      ...entry,
      lines: entry.lines.slice()
    }))
  };
}

export function clearMessageLedger() {
  const clearedCount = messageLedger.length;
  messageLedger.splice(0, messageLedger.length);
  return {
    clearedCount,
    size: messageLedger.length
  };
}