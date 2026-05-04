# Status Effect Contract

## 1. 文档定位

本文只描述当前已经落地的状态效果正式合同，不写历史方案。

## 2. 正式真值

- 当前正式持续效果真值是 `player.meta.statusEffects.active[]`。
- 单个 status effect instance 当前最小结构为：`sourceItemId`、`stackPolicy`、`durationMinutes`、`remainingMinutes`、`effects[]`。
- `effects[]` 当前只保留结算字段：
  - `modifier`：`kind / effectKey / multiplier`
  - `periodic`：`kind / effectKey / delta / everyMinutes / carryMinutes`
- `player.meta.timedModifiers` 与 `activeFoodEffect` 只作为旧存档迁移输入，由 `src/engine/state.js` 与 `src/engine/status_effect_runtime.js` 读取；迁移后删除旧分支，正式运行态不再写回旧结构。

## 3. 正式运行时

- consumable 的即时效果与持续效果当前统一走 `resolve -> commit -> applyConsumableEffectsToPlayer()` 主链。
- `src/engine/player.js` 中的 `applyFoodIntakeToPlayer()` 只保留兼容壳身份，不再代表正式状态效果语义。
- `src/engine/status_effect_runtime.js` 当前负责：`applyConsumableStatusEffects(...)`、`resolveStatusEffectModifier(...)`、`resolveStatusEffectPeriodicDeltas(...)`、`consumeStatusEffectsForTick(...)`、`getStatusEffectRemainingMinutesBySource(...)`。
- 时间推进阶段由 `applyTimeToPlayer()` 配合 `src/engine/status_effect_runtime.js` 消费 `modifier`、`periodic`、`remainingMinutes`，并在到期时移除实例。

## 4. 正式展示链

- 当前正式 tooltip VM builder 是 `src/engine/status_effect_view_models.js` 的 `buildStatusEffectTooltipVm(state, bucket)`。
- 当前正式 tooltip presenter 是 `src/engine/renderer.js` 的 `renderStatusEffectTooltip(tooltipVm)`。
- `src/engine/render/view_models.js` 当前按 bucket 接线：`STATUS_EFFECT_BUCKETS.HEALTH` 与 `STATUS_EFFECT_BUCKETS.SATIETY`。
- truth 不保存 `bucket`、展示名称或行文本；这些展示语义由 VM / presenter 决定。

## 5. effectKey 映射

- 当前 `effectKey -> bucket / formatter / tooltipVisible` 集中维护在 `src/engine/status_effect_view_models.js` 的 `STATUS_EFFECT_PRESENTATION_BY_KEY`。
- bucket 使用 `resolveStatusEffectBucket(effectKey)` 统一解析。
- 行文本格式使用 `formatStatusEffectPresentationLine(effect)` 统一生成。
- 新增 effectKey 时不得散写到多个 `if/else`。

## 6. 兼容桥

- 旧 `timedModifiers` 当前只保留 load/migrate 兼容桥身份。
- 旧 `effectType / multiplier` 与旧 `deltaPerHour` 当前只用于迁移旧 `activeFoodEffect` 输入。
- 兼容桥读取完成后立即写入 `player.meta.statusEffects`，并删除旧分支。

## 7. 验收口径

- `scripts/status_effect_governance_regression.mjs` 是状态效果治理回归口径。
- `scripts/status_effect_signoff_audit.mjs` 是最终签字审计口径；当前签字以 whole-repo residual、save/load/save roundtrip persistence、effectKey 映射覆盖为准。
- `scripts/overlay_smoke.mjs` 当前把 overlay 违例结果收口为 `expectedDirtyPreconditionViolations` 与 `unexpectedViolations`；签字口径要求 expected 受控、unexpected 为零。