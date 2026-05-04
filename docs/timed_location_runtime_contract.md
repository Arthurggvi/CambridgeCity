# Timed Location Runtime Contract

## 1. 合同范围

本文只定义当前代码里已经正式落地的 timed-location / 限时地点机制，不覆盖未来候选扩展。

该机制用于处理两类问题：

- 入口门禁：某地点只在限定时间窗口内显示或允许进入。
- 关闭硬停：玩家已处在该地点链路内时，时间推进不得越过关闭时点。

当前机制本体不绑定具体业务对象，不把船名、地点名、剧情名写进核心层。

## 2. 当前正式接口

当前正式运行时入口位于 `src/engine/timed_location_runtime.js`，对外提供：

- `isTimedLocationWindowOpen(specId, totalMinutes, world)`
- `getMinutesToNextTimedLocationClosure(state, totalMinutes)`
- `triggerTimedLocationClosure(state, totalMinutes)`
- `applyTimedLocationClosureStep(stepContext, state)`
- `isTimedLocationClosureBlocker(blockedBy)`

当前正式职责边界：

- requires 层只通过 `time.windows.<id>.open` 读取窗口是否开放。
- time 主链只查询“最近的限时地点关闭点”并返回标准 blocker。
- dispatch 后置层只消费标准 blocker 结构，不感知具体业务对象。

## 3. Provider / Spec 接入方式

每个限时地点必须作为一个 provider/spec 接入，而不是把业务规则写进机制本体。

当前 provider/spec 的正式字段与方法为：

- `id`
- `matchesState(state)`
- `getWindowInfo(totalMinutes, world)`
- `buildClosureBlocker({ state, totalMinutes, windowInfo })`

语义要求：

- `id` 是稳定业务标识，用于 `time.windows.<id>.open` 与 blocker `specId`。
- `matchesState(state)` 只回答“当前玩家是否在该限时地点链路内”。
- `getWindowInfo(...)` 只输出窗口信息，不直接改状态。
- `buildClosureBlocker(...)` 只构造标准 blocker payload，不得要求 `time.js` / `dispatch.js` 为该业务写专属分支。

## 4. Window Info 合同

provider/spec 的 `getWindowInfo(...)` 当前至少需要返回：

- `isOpen`
- `closeAtMinutes`

可选返回：

- `activeWindow`
- `windows`
- 其他只读调试字段

约束：

- 时间窗口必须基于 canonical `totalMinutes + world calendar` 计算。
- 地图数据、renderer、debug tool 不得私自重算一套窗口真值。
- 同一个业务的入口显隐与 hard stop 必须共用同一份窗口来源，禁止复制日期表。

## 5. Blocker Payload 合同

当前 timed-location closure blocker 的正式结构为：

- `blockerId`
- `kind`，当前正式值为 `timed_location_closure`
- `specId`
- `atMinutes`
- `hardStop`
- `locationId`
- `notice`
- `fallback`
- `cleanup`

其中：

- `notice` 至少包含 `title`、`message`、`actions`
- `fallback` 当前正式字段为 `mapId`，可选 `sceneId`
- `cleanup` 当前正式字段为 `scopes`、`flags`

dispatch 对该 payload 的正式处理顺序为：

1. 识别 timed-location closure blocker
2. 弹出 `notice`
3. 执行 `cleanup`
4. 执行 `fallback`
5. 回到正式 render

## 6. Theseus 作为实例的接入方式

Theseus 当前只是该机制的一个实例，定义位于 `src/engine/theseus_schedule.js`。

Theseus provider/spec 负责：

- 维护 Theseus 的到港/离港日期表
- 计算当前窗口是否开放、何时关闭
- 在离港命中时返回 notice / fallback / cleanup 组成的标准 blocker payload

Theseus provider/spec 不负责：

- 改写 `time.js`
- 改写 `dispatch.js`
- 在核心层新增 Theseus 专属常量或业务分支
- 定义短工会话结构、奖励结算或 presenter UI

结论：

- Theseus 是 timed-location 机制的一个 provider/spec
- timed-location 机制不是 Theseus 机制
- 当前 Theseus 短工只是该窗口机制的一个消费者：job id 为 `theseus_luggage_shift`，正式挂载点是 `steelcross_port.json`，门禁使用 `time.windows.theseus.open`。
- `steelcross_port_theseus_docked` 当前仍只承担 ship placeholder / crew 占位语义，不作为短工正式挂载点。
- 钢十字港当前已纳入 `W2-Spine-0 港口外缘抵达区` 的实现范围，地图已接到港口入口层，并已成立最小 ship placeholder 与最小 ending 接线。
- 当前合同只覆盖限时地点窗口与 blocker 口径，不把 steelcross 港口 ship state、完整船表、常规到港循环、通用正式登船流程或更多船型写成 timed-location 机制的一部分；现状也不应被表述为完整航运系统。

## 7. 扩展约束

以后新增第二个限时地点时，正式做法只能是：

1. 新增自己的 schedule/spec 文件
2. 注册到 timed-location runtime
3. 在地图 requires 使用 `time.windows.<id>.open`

禁止做法：

- 再改 `src/engine/time.js` 增加某业务专属 hard stop 分支
- 再改 `src/engine/pipeline/dispatch.js` 增加某业务专属 notice / fallback 分支
- 在地图数据里复制窗口日期表并与 provider/spec 分叉