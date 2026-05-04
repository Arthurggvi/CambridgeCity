# UI Multi-Step Guide Contract

## 1. 合同范围

本文定义当前多步 guide 的正式实现边界。它只描述已经落地的 session/controller 合同和两条现有业务 guide，不描述旧 renderer 私链，也不把未来候选当现状。

### 1.1 状态标记

- `已完成并已在当前代码中实现`
- `已调整，但仍需用户手测确认`
- `待修复 / 待确认`
- `已废弃口径`

当前正式 guide 样板只有两条：

- `profile_page_intro_guide`
- `winddyke_thermal_intro_guide`

## 2. 当前正式架构

多步 guide 当前采用两层结构：

1. `src/ui/transient/transient_guide_session_contract.js`
2. `src/ui/transient/transient_guide_session_controller.js`

这套结构的固定分工是：

- session/controller 负责会话编排。
- transient runtime 负责单步播放与 emphasis 生命周期。

因此，多步 guide 不是“runtime 自己懂多步业务”，而是“session/controller 把每一步表达成 runtime 能播放的单步 intent”。

## 3. guide session 最小字段合同

当前 session step descriptor 的正式字段如下：

- `guideId`
- `sessionId`
- `stepId`
- `stepIndex`
- `triggerSource`
- `anchor`
- `presentation`
- `priority`
- `blocking`
- `blockerBehavior`
- `resumePolicy`
- `payload`
- `timing`

当前正式枚举值如下：

- `triggerSource`
  - `route_enter`
  - `overlay_open`
  - `explicit_signal`
  - `commit_report`

- `anchor.kind`
  - `emphasis_target`

- `presentation`
  - `card_with_emphasis`
  - `emphasis_only`

- `blockerBehavior`
  - `pause_session`
  - `skip_step`
  - `cancel_session`

- `resumePolicy`
  - `none`
  - `from_start`
  - `next_pending_step`

## 4. 当前正式终止语义

当前 session 终止语义如下：

- `dismiss`
  - 退出当前会话，不等于完成。
  - 不应自动写 seen。

- `complete`
  - 正常完成最后一步。
  - 允许业务层写 seen。

- `skip`
  - 用户主动跳过剩余步骤。
  - 允许业务层写 seen。

- `clear`
  - 来自 runtime/route/load 的外部清场语义。
  - 不等于业务上的 complete。

## 5. 当前正式 blocker 语义

blocker 当前默认语义是 `pause_session`，而不是自动 complete。

当前合同中可归类的 blocker 原因有：

- `route_mismatch`
- `notice_dialog_open`
- `ui_modal_open`
- `ui_overlay_open`
- `guide_already_seen`
- `guide_surface_missing`
- `guide_anchor_missing`

注意：

- 是否 pause / skip / cancel，由业务 guide 决定。
- runtime 继续保留 notice dialog 播放阻塞，但不会替 guide 做业务层 blocker 决策。

## 6. 与 transient runtime 的正式边界

### 6.1 runtime 负责

- 单步 guide card 的播放
- guide step 对应 emphasis handle 的激活与清理
- card/toast 与其他 transient item 的并发规则
- clear/cancel
- reduced-motion timing
- notice dialog blocker wait

### 6.2 session/controller 负责

- `sessionId` 生命周期
- `stepIndex` 推进
- `nextStep`
- `dismissSession`
- `skipSession`
- `completeSession`
- blocker 决策
- seen flag 写入时机
- route leave / overlay close / critical-state yield 的业务终止语义

### 6.3 明确禁止

多步 guide 当前明确禁止：

- 新建 guide 专属 host
- 新建第二个 transient surface
- 新建私有 hint bar
- 新建私有 step timer
- 在 business guide 中直接查询 selector 决定动态锚点
- 让 guide session 负责 records 按钮常驻 attention
- 让 guide session 负责 records 面板正文切换或目录 hover

## 7. Profile Page Intro Guide

### 7.1 当前正式实现

- 文件：`src/ui/profile_page_intro_guide.js`
- guide id：`profile_page_intro_guide`
- trigger source：`commit_report`
- seen flag：`sceneTutorials.profile_page_intro`
- step 总数：4
- step 顺序：`overview -> core -> growth -> annotation`
- 每一步类型：`card + emphasis`
- `resumePolicy`：`none`

### 7.2 当前正式启动条件

只在以下条件同时满足时启动：

- `before.profileOpen !== true`
- `after.profileOpen === true`
- `after.profilePageIntroGuideSeen !== true`
- `after.criticalMode === NORMAL`

### 7.3 当前正式 blocker 规则

当前 blocker 判定如下：

- `profileOpen !== true` -> `route_mismatch` + `cancel_session`
- `gameState.ui.modal` -> `ui_modal_open` + `pause_session`
- notice dialog 打开 -> `notice_dialog_open` + `pause_session`
- profile surface 不存在 -> `guide_surface_missing` + `pause_session`
- emphasis anchor 缺失 -> `guide_anchor_missing` + `cancel_session`

### 7.4 当前正式终止与 seen 规则

- `complete` 写 seen
- `skip` 写 seen
- `dismiss` 不写 seen
- 因 profile 关闭或 critical state 让位导致的 dismiss，也不写 seen

## 8. Winddyke Thermal Intro Guide

### 8.1 当前正式实现

- 文件：`src/ui/winddyke_thermal_intro_guide.js`
- guide id：`winddyke_thermal_intro_guide`
- trigger source：`route_enter`
- seen flag：`sceneTutorials.winddyke_clinic_segment_thermal_intro`
- 目标地图：`winddyke_street_clinic_segment`
- step 总数：3
- `resumePolicy`：`none`

### 8.2 当前正式步骤

- `thermal_overview`
  - 锚到 `thermal-card`
  - mandatory

- `recovery_action`
  - 锚到 recovery action
  - optional
  - 动态锚点解析下沉到 `src/ui/transient/winddyke_thermal_guide_emphasis.js`

- `detail_entry`
  - 锚到 `thermal-card-detail-entry` 与 `sidebar-inventory-entry`
  - mandatory

### 8.3 当前正式 blocker 规则

当前 blocker 判定如下：

- `currentMapId !== winddyke_street_clinic_segment` -> `route_mismatch` + `cancel_session`
- UI overlay / modal 打开 -> `pause_session`
- anchor 缺失时：
  - optional step -> `skip_step`
  - mandatory step -> `pause_session`

### 8.4 当前正式终止与 final hint 规则

- `complete` 写 seen，并 enqueue runtime toast 版 final hint
- `skip` 写 seen，并 enqueue runtime toast 版 final hint
- route leave 导致 dismiss，不写 seen
- 为 critical-state-notice 让位导致 dismiss，不写 seen

当前 final hint 已经是 runtime toast，不再存在第二 host 或私有 `hintTimerId` 合同。

## 9. 当前共同结构结论

两条 guide 的共同合同如下：

- guide 业务层保留 seen flag 与产品语义判断。
- session/controller 保留编排权。
- transient runtime 保留单步播放权。
- emphasis resolver 保留锚点解析权。
- guide completion 后如需补提示，只能表达成 runtime 能理解的正式 intent。

## 9.1 Records 不属于 guide owner

- records 按钮常驻黄色 attention
  - 状态：`已完成并已在当前代码中实现`
  - owner：`dispatch post-commit + records_attention_controller`
  - 不是 guide session 的职责

- 左下角“社会阅历+X，新纪录解锁！”消息
  - 状态：`已完成并已在当前代码中实现`
  - owner：`dispatch post-commit + data_delta_toast presenter`
  - 不是 guide final hint

- records 面板与正文切换
  - 状态：`已调整，但仍需用户手测确认`
  - owner：records overlay controller / records overlay page
  - 不是 guide surface，也不是 guide step 播放链

## 10. 当前保留的兼容壳

以下内容仍保留，但身份必须写清：

- `sceneTutorials.*` seen flag
  - 当前 guide 已读状态的保留写入口。

- runtime 的 notice dialog blocker wait
  - 当前正式播放阻塞行为，不是 guide 私有补丁。

## 11. 已废弃且禁止回写的旧口径

以下内容不得再写回 guide 文档或实现：

- renderer 私有 guide 播放链
- `scene-guide-overlay-root`
- `scene-guide-hint-bar`
- guide 私有 host
- guide 私有 timer
- business guide 直接 query DOM selector 决定动态 action 锚点
- 把 records attention / records panel 动画写成 guide 体系的一部分

## 12. 用户手测需确认的产品语义点

- `profile_page_intro_guide` 仍只在 profile 首次打开且未 seen 时启动。
- `profile_page_intro_guide` 的 dismiss 与 complete seen 语义保持当前产品口径。
- `winddyke_thermal_intro_guide` 仍只在首次进入目标地图且未 seen 时启动。
- winddyke 第二步仍优先命中“返回室内”，其次 shelter，再其次 heat source。
- winddyke 第二步缺锚点时仍跳过，不会卡死整个会话。
- winddyke `complete/skip` 后仍出现 runtime toast 版 final hint。