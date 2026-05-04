function fail(path, message) {
  throw new Error(`Record validation failed at ${path}: ${message}`);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, "must be a non-empty string");
  }
}

function assertStringArray(value, path) {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  for (let index = 0; index < value.length; index += 1) {
    assertNonEmptyString(value[index], `${path}[${index}]`);
  }
}

function assertSources(value, path) {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  for (let index = 0; index < value.length; index += 1) {
    const source = value[index];
    const sourcePath = `${path}[${index}]`;
    if (!isPlainObject(source)) {
      fail(sourcePath, "must be an object");
    }
    assertNonEmptyString(source.label, `${sourcePath}.label`);
    if (source.org != null && typeof source.org !== "string") {
      fail(`${sourcePath}.org`, "must be a string when provided");
    }
    if (source.type != null && typeof source.type !== "string") {
      fail(`${sourcePath}.type`, "must be a string when provided");
    }
    if (source.note != null && typeof source.note !== "string") {
      fail(`${sourcePath}.note`, "must be a string when provided");
    }
    if (source.url != null && typeof source.url !== "string") {
      fail(`${sourcePath}.url`, "must be a string when provided");
    }
  }
}

function assertReward(value, path) {
  if (!isPlainObject(value)) {
    fail(path, "must be an object");
  }
  if (!isPlainObject(value.firstUnlock)) {
    fail(`${path}.firstUnlock`, "must be an object");
  }
  const socialExp = value.firstUnlock.socialExp;
  if (typeof socialExp !== "number" || Number.isNaN(socialExp)) {
    fail(`${path}.firstUnlock.socialExp`, "must be a number");
  }
}

function assertUiMeta(value, path) {
  if (!isPlainObject(value)) {
    fail(path, "must be an object");
  }
}

export function validateRecordDefinition(record, sourcePath = "record") {
  if (!isPlainObject(record)) {
    fail(sourcePath, "must be a plain object");
  }

  assertNonEmptyString(record.id, `${sourcePath}.id`);
  assertNonEmptyString(record.title, `${sourcePath}.title`);
  assertNonEmptyString(record.category, `${sourcePath}.category`);
  assertStringArray(record.tags, `${sourcePath}.tags`);
  assertNonEmptyString(record.summary, `${sourcePath}.summary`);
  assertNonEmptyString(record.body, `${sourcePath}.body`);
  assertNonEmptyString(record.scienceTitle, `${sourcePath}.scienceTitle`);
  assertNonEmptyString(record.scienceBody, `${sourcePath}.scienceBody`);
  assertSources(record.sources, `${sourcePath}.sources`);
  assertReward(record.reward, `${sourcePath}.reward`);
  assertNonEmptyString(record.unlockToast, `${sourcePath}.unlockToast`);
  assertUiMeta(record.uiMeta, `${sourcePath}.uiMeta`);

  return record;
}

export function validateRecordDefinitions(records, sourcePath = "recordDefinitions") {
  if (!Array.isArray(records)) {
    fail(sourcePath, "must be an array");
  }

  const seenIds = new Set();
  const validated = [];

  for (let index = 0; index < records.length; index += 1) {
    const recordPath = `${sourcePath}[${index}]`;
    const record = validateRecordDefinition(records[index], recordPath);
    if (seenIds.has(record.id)) {
      fail(`${recordPath}.id`, `duplicate id: ${record.id}`);
    }
    seenIds.add(record.id);
    validated.push(record);
  }

  return Object.freeze(validated.slice());
}