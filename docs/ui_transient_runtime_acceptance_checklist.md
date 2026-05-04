# UI Transient Runtime Acceptance Checklist

## 1. 使用方式

本文是当前 transient runtime 与多步 guide 的最小现场验收单。它只验证当前已经落地的六个对象和 runtime 基础规则，不扩写未来候选功能。

当前建议按以下顺序手测：

1. 四个单步 feedback
2. 两条多步 guide
3. lane 并发、阻塞与清理
4. records 相邻 UI（attention / 左下角消息 / 面板）

## 2. 单步 feedback

### 2.1 Record Unlock

- 状态：`已完成并已在当前代码中实现`

步骤：

1. 执行一次会首次解锁 record 且发放阅历的 action。
2. 等待本次 `dispatch -> commit -> render` 完成。
3. 观察中心 card。

期望：

- 只出现一张 `record_unlock` card。
- 卡片完整走完 `is-in -> is-hold -> is-out`。
- 不出现第二个 transient host、私有 queue、私有 timer。

说明：

- records 按钮常驻 attention 不再以本条 card 生命周期作为正式验收口径。
- 当前产品验收里，records attention 需要单列验证。

### 2.2 Record Unlock Toast

- 状态：`已完成并已在当前代码中实现`

步骤：

1. 执行一次会首次解锁 record 且发放阅历的 action。
2. 观察左下 toast lane。

期望：

- 出现一条沿用既有 `data_delta_toast` presenter 的 toast。
- 文案为 `社会阅历+{grantedExpAmount}，新纪录解锁！`，其中真实 `grantedExpAmount` 优先，缺失时 fallback 为 `10`。
- 只有该类新纪录 toast 带暖黄色高光，普通“状态更新”toast 不变。

### 2.3 Delta Toast

步骤：

1. 执行一次只造成 `report.before/after` 数值变化、不会触发 record unlock 或 critical state 的 action。
2. 观察左下 toast lane。

期望：

- 只出现 `data_delta_toast`。
- toast 固定出现在左下堆叠区，而不是主内容区中部或右侧。
- 文案只来自 `report.before/after` 差异。
- 不创建第二个 transient host。

### 2.4 Critical State Notice

步骤：

1. 分别触发一次 `after.criticalMode === "COLLAPSE"` 和一次 `after.criticalMode === "DEAD"`。
2. 观察中心高优先级 card。

期望：

- 两种模式都只出现一张 `critical_state_notice` card。
- 内容分别对应昏迷与死亡提示。
- 仍由 transient runtime 播放，不经过 renderer 私有 host/timer。

### 2.5 Dossier Attention

步骤：

1. 触发一次 `dossierNeedsAttention: false -> true` 的 action。
2. 观察中心轻卡片与 dossier 入口强调。

期望：

- 出现一张 `dossier_attention_guide` card。
- dossier 入口被强调，并随 runtime 生命周期清理。
- 不创建额外 transient host。

## 3. 多步 guide

### 3.1 Profile Page Intro Guide

步骤：

1. 在未 seen 的状态下首次打开 profile。
2. 验证四步顺序。
3. 另做一次 dismiss 路径验证。
4. 另做一次在引导期间触发 critical state 的路径验证。

期望：

- 只在 `profileOpen: false -> true` 且未 seen 时启动。
- 顺序保持 `overview -> core -> growth -> annotation`。
- 每一步仍为 `card + emphasis`，且不创建 guide 专属 host。
- dismiss 不写 seen；complete 才写 seen。
- 遇到 critical state 时会话让位；后续是否重新启动，仍按当前 commit report 和 seen 状态决定。

### 3.2 Winddyke Thermal Intro Guide

步骤：

1. 在未 seen 的状态下进入 `winddyke_street_clinic_segment`。
2. 逐步验证三步流程。
3. 另做一次 skip 路径验证。
4. 另做一次缺少第二步锚点的路径验证。

期望：

- 只在 route enter 且未 seen 时启动。
- 第一步锚到 `thermal-card`。
- 第二步优先锚到“返回室内” action，其次 shelter，再其次 heat source。
- 第二步若无合格锚点，会 `skip_step`，不会卡死整个 guide。
- 第三步同时锚到 `thermal-card-detail-entry` 与 `sidebar-inventory-entry`。
- `complete/skip` 后出现 runtime toast 版 final hint，不再出现旧 hint bar。

## 4. 并发、阻塞与清理

### 4.1 Lane 并发

步骤：

1. 制造一次 `record_unlock + data_delta_toast` 同次出现。
2. 在 toast 仍可见时触发 `critical_state_notice`。

期望：

- `record_unlock` 走中心 card lane。
- `data_delta_toast` 走左下 toast lane。
- 两者允许并存。
- `critical_state_notice` 不抢断 active card，但会在后续 card 出队时优先于普通 card。

### 4.2 Notice Dialog Blocker

步骤：

1. 打开 notice dialog。
2. 在 dialog 打开期间制造一次 transient feedback。
3. 关闭 notice dialog。

期望：

- dialog 打开期间 transient 播放会等待，而不是和 dialog 重叠覆盖。
- 关闭 dialog 后 runtime 再继续正常播放。

### 4.3 Clear 与残留

步骤：

1. 在 guide 或 card 播放期间切图。
2. 在 toast 存活期间读档。
3. 在播放期间刷新页面或触发 hard reset 等价路径。

期望：

- `clearTransientRuntime` 会同时清理 card、toast、emphasis handle。
- route change / load / refresh 后无残留可见态 `#transient-runtime-host`。
- 无残留 transient item。
- 无旧 guide overlay root / hint bar 正式入口回流。

## 5. 静态审计回填

## 5.1 Records Attention（非 transient owner）

- 状态：`已完成并已在当前代码中实现`

步骤：

1. 触发一次真实 `first_unlock + rewardGrantedAfterCommit=true` 的 records 结果。
2. 不打开 records 面板，观察侧栏 records 按钮。
3. 再打开 records 面板。

期望：

- records 按钮出现常驻黄色高亮。
- 该高亮来源于 `commit report.records.results`，与 card lane / guide / 具体 action 解耦。
- 打开 records 面板后高亮清除。

## 5.2 Records 面板当前结构

- 状态：`已完成并已在当前代码中实现`

期望：

- 顶栏只保留“记录”和关闭按钮。
- 左侧是父级/子级目录树，未解锁父级不显示。
- 浏览器白色滚动条已被项目内置滚动条替换。
- 子级 hover 是轻微向右抽出，目录整体保持方框档案感。
- 正文不再显示奖励入账行；“现实附页”与“资料来源”统一显示为“参考”。

## 5.3 Records 面板切换手测确认

- 状态：`已调整，但仍需用户手测确认`

步骤：

1. 首次打开 records 面板。
2. 点击左侧不同子级。

期望：

- 首次打开时右侧正文立即出现。
- 点击左侧子级时，左侧目录稳定，不重播整窗 overlay 打开动画。
- 右侧正文局部切换，使用 detail content 层的局部进入动画。

当前低耗静态审计结论如下：

- 已确认 `src/**` 中不存在新的私有 transient host 正式入口。
- 已确认 `ui_surface_registry` 中正式 transient surface 仍只有 `transient_runtime`。
- 已确认已迁 feedback 业务文件与 guide 样板文件中不存在 runtime 外部 lifecycle timer。
- 已确认 `src/**` 中不存在旧 guide renderer-side playback chain 正式入口。
- 已确认 `src/**` 中不存在旧 `scene-guide-overlay-root` / `scene-guide-hint-bar` 正式入口。
- 已确认 runtime contract、guide contract、总手册当前口径一致。

## 6. 本清单不覆盖的内容

以下内容不属于本文验收范围：

- 是否继续清退 `ui.toast` legacy state
- 是否重做 notice dialog owner 合同
- 是否新增更多 guide 迁移对象

这些属于后续候选，不是当前验收失败项。