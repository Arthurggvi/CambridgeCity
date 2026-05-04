# Achievement Profile Persistence Contract

## 1. Authoritative Truth

- Achievements 的唯一正式真相源是 profile store，本地键名固定为 `CambridgeCity_Profile_Achievements`。
- 运行时 `gameState.player.achievements` 只是 compatibility mirror，用于兼容旧运行态读口与旧链路收尾，不是 authoritative truth。
- slot 内 `snapshot.player.achievements` 不再是新存档写入目标，也不再是正常运行时真相源。

## 2. Profile Key And Migration Marker

- Profile key：`CambridgeCity_Profile_Achievements`
- Migration marker：`CambridgeCity_Profile_Achievements_Migrated_v1`

## 3. Migration Rules

- 无 marker 时，允许进入 migration phase，并从以下 legacy 来源合并迁移：
  - runtime legacy mirror：`gameState.player.achievements`
  - legacy slot achievements：旧存档中的 `snapshot.player.achievements`
- legacy slot achievements 扫描是 migration-only helper 的职责，不进入正常读路径。
- legacy slot 扫描支持 `slotMain -> slotBackup` 兜底。主档缺失或解析失败时，允许读取对应 backup 作为迁移输入。
- marker 存在且 profile key 可读时，正常路径只读 profile store，禁止再扫 slot。
- 只有 profile key 缺失或损坏时，才允许重新进入 migration phase。

## 4. Save Schema Contract

- 新存档默认不再写 `snapshot.player.achievements`。
- 旧档若带 `snapshot.player.achievements`，schema 仍允许 sanitize / validate。
- `snapshot.player.achievements` 在当前合同中是 legacy optional field，不是必填字段。
- 旧档兼容字段的存在仅用于迁移与旧档读取兼容，不得被文档表述为“slot 真相”或“存档真相”。

## 5. Entry Points And Consumers

- app bootstrap 会显式初始化 achievement store。
- `NEW_GAME` 完成后，会用 profile truth 覆盖 runtime mirror。
- `LOAD_SLOT` 完成后，会用 profile truth 覆盖 runtime mirror。
- legacy `loadFromSlot` 完成后，也会用 profile truth 覆盖 runtime mirror。
- achievement 菜单默认读取走 achievement store。
- debug 成就操作走 achievement store API。
- 解锁逻辑走 achievement store，不再把 slot 或 runtime mirror 当真相源。

## 6. Compatibility Terms

- authoritative truth：profile store 中的 achievements 状态。
- compatibility mirror：运行时 `gameState.player.achievements`。
- legacy optional field：旧档中的 `snapshot.player.achievements`。
- migration-only helper：只在 migration phase 扫描 legacy slot achievements 的 helper，不进入正常读路径。

## 7. Acceptance Results

- 新游戏后，已获得成就仍保留。
- 切换存档不回退成就。
- 删除单个存档不影响本机成就。
- 主菜单未载入旧档时，成就页可显示本机已解锁成就。
- 主档损坏、backup 存活时，旧成就仍可迁入 profile store。

## 8. Test Note

- 当前仓库已有 3 条正式成就定义：`远冬别离`、`腰缠万贯`、`春回大地`。
- 本轮跨档手测的核心验证仍是“空槽位 vs 已解锁槽位”这一类 profile truth 持久化行为，不是逐条成就触发链回归。