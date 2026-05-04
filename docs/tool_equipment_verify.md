# Tool Equipment Verify

- 状态位置：`player.equippedTools`，每项为 `{ itemId, toolTag }`。
- 动作链：`inv_equip:*` / `inv_unequip_tool:*` 走现有 inventory resolve -> commit 链。
- 替换规则：同 `toolTag` 新工具会替换旧同标签工具，旧工具先回背包；不同 `toolTag` 可并存。
- 不进 `player.equipment`：服装九槽和热学聚合只读取 `player.equipment`，工具必须与其隔离。
- 运行验证：在仓库根目录执行 `node .\\scripts\\tool_equipment_verify.mjs`。