# UI Transient Runtime Contract

## 1. 合同范围

本文只定义当前代码中已经正式成立的 transient runtime 合同，不覆盖旧私有 host，也不覆盖未来候选方案。

### 1.1 状态标记

- `已完成并已在当前代码中实现`
- `已调整，但仍需用户手测确认`
- `待修复 / 待确认`
- `已废弃口径`

当前 runtime 涉及三类对象：

- `card`：中心卡片，串行播放。
- `toast`：左下堆叠轻提示，允许并发，当前栈上限为 4。
- `emphasis`：抽象强调目标，无独立 lane，在 item 生命周期内由 runtime 激活与清理。

## 2. 唯一 owner 与唯一宿主

当前正式 owner 与宿主如下：

- owner：`runtime/transient_runtime`
- host id：`#transient-runtime-host`
- host class：`.transient-runtime-host`

当前真实 DOM 结构如下：

`body -> #transient-runtime-host -> .transient-runtime-layer -> .transient-runtime-card-layer/.transient-runtime-toast-layer -> .transient-runtime-card-lane/.transient-runtime-toast-lane`

关键限制：

- host 当前必须挂在 `body` 下。
- 不允许把 host 挂回 `#game-root` 下。
- `card lane` 与 `toast lane` 必须保留分层结构。
- `emphasis` 不允许创建独立 DOM host。

## 3. 与样式定位的正式关系

当前样式合同必须满足：

- `.transient-runtime-host` 是 fixed 全屏宿主。
- `.transient-runtime-card-layer` 负责中心卡片定位。
- `.transient-runtime-toast-layer` 负责 toast 定位。
- `.transient-runtime-toast-lane` 当前锚在左下角，`left: 20px; bottom: 20px;`。

host 之所以在 `body` 下，是因为 `#game-root` 在 `body.settings-ui-scale` 下存在 `transform: scale(var(--ui-scale-factor))`。如果 host 放在 `#game-root` 下，fixed toast 会被祖先 transform 污染，失去 viewport 锚定。

## 4. 当前正式入口

当前对外正式 API 如下：

- `enqueueTransientIntent(intent)`
- `enqueueTransientIntents(intents)`
- `clearTransientRuntime(reason)`
- `cancelTransientIntent(id, reason)`
- `registerTransientPresenter(type, presenter)`
- `registerTransientEmphasisTarget(key, resolver)`
- `getTransientRuntimeSnapshot()`

任何新增短时反馈都必须按以下顺序进入系统：

1. 先得到 authoritative UI 事实
2. 翻译成 transient intent
3. 注册 presenter
4. 如需强调，再注册 emphasis target

禁止做法：

- 新建私有 transient host
- 新建私有 transient queue
- 在业务层自管 lifecycle timer
- 在业务层直接查 DOM selector 决定宿主或生命周期
- 用点名式 cleanup 补旧链

## 5. 当前正式翻译入口

当前正式翻译入口分两类。

### 5.1 单步 feedback

由 `src/engine/pipeline/transient_intent_adapter.js` 基于 commit report 直接产出：

- `record_unlock`
- `data_delta_toast`
- `critical_state_notice`
- `dossier_attention_guide`

records 相关说明必须额外分清：

- `record_unlock`
  - 状态：`已完成并已在当前代码中实现`
  - owner：runtime card lane
  - 事实源：`commit report.records.results`
  - 作用：播放中心卡片；当前仍可携带 `records_entry` emphasis target 作为卡片生命周期内的兼容强调

- `record_unlock toast`
  - 状态：`已完成并已在当前代码中实现`
  - owner：runtime toast lane
  - 事实源：`commit report.records.results`
  - 接入层：`dispatch post-commit` 将 payload 送入 `data_delta_toast` presenter
  - 专属标记：`payload.variant = "record-unlock"`

- records 按钮常驻 attention
  - 状态：`已完成并已在当前代码中实现`
  - owner：不属于 transient runtime
  - 正式 owner：`src/ui/records_attention_controller.js`
  - 结论：不得再把 records 按钮 attention 写成 runtime card lane 的正式职责

### 5.2 多步 guide 的单步播放

由业务 guide + session/controller 产出 step intent 或 completion hint intent：

- `profile_page_intro_guide_step`
- `winddyke_thermal_intro_guide_step`
- `winddyke_thermal_intro_guide_hint`

因此必须区分：

- adapter 是单步 feedback 的正式翻译层。
- runtime 是单步播放层。
- guide session/controller 是多步会话编排层，不是第二个 runtime。

### 5.3 当前不归 transient runtime owner 的相邻 records 系统

- records 按钮常驻黄色高亮
  - 状态：`已完成并已在当前代码中实现`
  - owner：`dispatch post-commit + records_attention_controller`
  - 事实源：`report.records.results[*].reason === "first_unlock" && rewardGrantedAfterCommit === true`
  - 清除规则：`ui_records_open`、route/load/reset clear、`pagehide`、`beforeunload`

- records overlay / 面板正文 / 左侧目录 hover
  - 状态：`已完成并已在当前代码中实现`
  - owner：records overlay controller / records overlay render / records panel css
  - 结论：records 面板与 transient runtime 不是同一个 owner 域

## 6. 生命周期与并发合同

### 6.1 card

- 同一时间只允许一个 active card。
- `high` priority 只影响 card queue 的出队顺序。
- `high` priority 不会中途抢断正在播放的 active card。

### 6.2 toast

- toast 走独立 toast queue。
- toast 可与 card 并存。
- toast stack 当前上限为 4。

### 6.3 emphasis

- emphasis 没有独立 lane。
- emphasis 生命周期绑定具体 transient item。
- item clear、cancel、结束时必须同步清理 emphasis handle。

## 7. clear 合同

`clearTransientRuntime(reason)` 当前必须同时清理：

- card lane
- toast lane
- 活动 emphasis handle

当前正式 clear reason 只有：

- `cleared`
- `route_change`
- `load_snapshot`
- `hard_reset`

不允许重新扩散为“旧 host 名称 + 旧 class 名称 + 旧 timer 名称”的点名式 cleanup。

## 8. blocker 与让位合同

当前 runtime 仍保留 notice dialog blocker wait：

- blocker 对象：`#notice-dialog-host`
- 作用：避免 transient item 与 notice dialog 打开态互相覆盖
- 性质：当前正式行为，不是调试补丁

同时必须注意：

- `critical_state_notice` 不会抢断 active card。
- 所以 guide 若需要让位给 critical notice，必须由 guide session/controller 主动 dismiss 当前会话，而不是指望 runtime 中途抢断。

## 9. 与 guide session 的边界

runtime 负责：

- 单步 card/toast 播放
- emphasis handle 激活与清理
- card/toast 并发
- clear/cancel
- reduced-motion timing
- notice dialog blocker wait

guide session/controller 负责：

- `sessionId`
- 步骤推进
- dismiss / complete / skip / resume
- blocker 决策
- seen flag 写入

多步 guide 不允许：

- 创建 guide 专属 host
- 创建第二个 transient surface
- 自管 hint bar
- 自管 step timer

## 10. 当前保留的兼容壳

以下内容当前仍存在，但必须明确身份：

- notice dialog blocker wait
  - 属于当前正式 runtime 行为。

- `sceneTutorials.*` seen flag
  - 属于 guide 已读状态的保留写入口。

- `ui.toast` 相关 legacy state
  - 仍存在于若干 state/resolve/renderer 路径。
  - 但它不是 delta toast 当前正式播放 owner。

## 11. 已废弃且禁止回写的旧口径

以下内容当前不得再出现在新实现或新合同里：

- `#delta-toast-stack`
- `#critical-state-notice-host`
- `#scene-guide-overlay-root`
- `#scene-guide-hint-bar`
- renderer 私有 guide playback chain
- 私有 transient host / queue / timer
- `payload.variant` lane 推断
- records 按钮高亮正式依赖 `record_unlock` card lane 生命周期
- records 面板切换可以重播整窗 overlay 打开动画

## 12. 低耗静态审计结论

当前静态审计结论如下：

- `src/**` 中不存在新的私有 transient host 正式入口。
- `ui_surface_registry` 中正式 transient surface 仍只有 `transient_runtime`。
- 已迁 feedback 与两条 guide 业务文件中不存在 runtime 外部 lifecycle timer。
- `src/**` 中已无旧 guide renderer-side playback chain 正式入口。
- `src/**` 中已无旧 `scene-guide-overlay-root` / `scene-guide-hint-bar` 正式入口。

## 13. 后续候选，仅作候选

以下只可作为后续候选，不是现状合同：

- 移除 runtime 的 notice dialog blocker wait
- 继续清退 `ui.toast` legacy state
- 继续把更多 guide 迁入现有 session/controller 合同