# 野外向量地图预览器（离线只读）

## 这是什么
- 野外向量地图预览器。
- 用来看 **West2 · 旧标记杆巡查线**。
- 是 **离线作者工具**：**底图只读**；矢量模式下可启用 **蓝图层** 做草案绘制、JSON 导入与补丁脚本（仍不写回仓库数据、不接游戏 runtime）。
- **不是玩家小地图**。

## 0.1 最高优先级：执行蓝图代码 DSL 语法

“执行蓝图代码”输入框使用的是**逐行 DSL 命令**，不是 JSON，不是 JavaScript，也不是蓝图导出对象。

必须明确：

- `wilderness_blueprint_delta` 是导出 / 导入数据合同。
- `blueprintState.cells` 是内部状态合同。
- “执行蓝图代码”输入框有自己独立的 DSL。
- 三者不能混用。

乱编死个妈。

### 0.1.1 正确命令

#### 1. 设置地貌

```txt
set <terrainId> (<x>,<y>)

示例：

set wind_packed_snow (-6,-6)
set flagged_marker_line (-7,1)
set ice_shelf_surface (6,3)

效果：

blueprintState.cells["x,y"] = { kind: "terrain_add", terrainId: "<terrainId>" }
```

#### 2. 清除蓝图格

```txt
clear (<x>,<y>)

示例：

clear (-6,-6)

效果：移除该坐标上的蓝图覆盖。
```

#### 3. 减法格

```txt
subtract (<x>,<y>)

示例：

subtract (3,0)

效果：

blueprintState.cells["x,y"] = { kind: "cell_subtract" }
```

#### 4. 特殊地图格

```txt
special <mapId> <label> (<x>,<y>)

示例：

special west2_maintenance_corridor_entry 维修通道入口 (4,1)

效果：

blueprintState.cells["x,y"] = {
  kind: "special_map_cell",
  mapId: "<mapId>",
  label: "<label>"
}
```

### 0.1.2 禁止误用

以下写法不能贴进“执行蓝图代码”输入框：

```json
{
  "schemaVersion": 1,
  "kind": "wilderness_blueprint_delta",
  "ops": []
}
```

原因：这是导出 / 导入 JSON 合同，不是代码框 DSL。

以下写法也不能使用：

```txt
terrain_add -6 -6 wind_packed_snow
```

原因：terrain_add 是蓝图内部工具 / 状态语义，不是代码框命令名。

以下写法也不能使用：

```txt
blueprintState.cells["-6,-6"] = { kind: "terrain_add", terrainId: "wind_packed_snow" }
```

原因：代码框不是 JavaScript 执行器。

### 0.1.3 一次性可执行样例

```txt
set wind_packed_snow (-6,-6)
set flagged_marker_line (-7,1)
set ice_shelf_surface (6,3)
subtract (3,0)
special west2_maintenance_corridor_entry 维修通道入口 (4,1)
```

## 怎么打开
方式 A（推荐）：Windows 下双击（仓库根目录）  
`启动野外地图编辑器.cmd`

方式 B：命令行运行（推荐入口）  
`npm run wilderness:area-preview` 或短命令 `npm run wmap`

方式 C：直接双击（只适合查看/导入/导出，不适合一键覆盖）  
`tools/wilderness_area_preview/index.html`

## 怎么刷新
方式 A：Windows 下双击  
`tools/wilderness_area_preview/刷新并打开预览器.cmd`

方式 B：命令行运行  
`node scripts/wilderness_area_preview_export.mjs west2_old_marker_patrol_line`

说明：
- `tools/wilderness_area_preview/刷新并打开预览器.cmd` 与 `tools/wilderness_area_preview/启动野外地图预览器.cmd` **已统一升级为作者服务启动入口**：它们会调用 `npm run wilderness:area-preview`，不再直接打开 `file:// index.html`。
- 禁止维护者新增“只打开 index.html”的脚本；一键覆盖/快照/日志都依赖作者服务页面。

## 当前能看什么
- 区域档案（在右栏“蓝图”页折叠区）
- 坐标网格
- 不同地貌表现
- 点击格子查看简明详情
- 区域语义层
- 围栏式填色
- 漂浮中文标签
- 已实装地点 / 区域语义 / 通用段区分
- 图层开关（地貌层/区域语义层/地标层/风险层）
- 坐标搜索
- 地标搜索
- 地貌搜索
- 字段名搜索
- 字段值搜索
- 审计面板（红 / 黄 / 灰分级）
- 打开后第一屏以地图为中心（地图工作台布局）
- 右侧栏可折叠（收起后地图区域更宽）
- 合同状态与取证摘要在底部附录（默认收起）
- 搜索在顶部工具栏

右侧栏（档案式三页）：
- **当前格**：只显示当前格/地标详情与搜索结果（不显示蓝图/文件按钮）
- **蓝图**：只显示蓝图绘制与图层查看相关内容（不显示 apply / snapshots / logs）
- **文件**：集中放导入/导出/覆盖/快照/日志与作者服务状态

## 当前不能做什么
- **不能**改动正式区域数据文件（尤其 `data/wilderness/**`）
- **不能**写 `world.wilderness`，**不进入** save/load
- **不参与** movement / weather / player state / settlement 等 runtime **真值链**
- 蓝图层内的绘制、JSON 导入、蓝图代码补丁 **仅存在于预览页蓝图状态**，除非你再人工把草案落到正式规格流程
- 不能作为玩家小地图
- 不能代表游戏 runtime

## 蓝图绘制 / Blueprint Editor

### 编辑器定位（务必读完）
- **离线作者工具**：浏览器内草案，不替代游戏内 truth。
- **不写回** `data/wilderness/**`，不写 **`world.wilderness`**，**不进入** save/load。
- **不参与** movement / weather / player state / settlement 真值链；预览页展示的仍为导出时的静态快照与蓝图叠加。
- 凡「导入 JSON」「执行蓝图代码补丁」、鼠标绘制产生的结果，**一律只写入蓝图层** `blueprintState.cells`，不修改底图 `areaSpec`、不写磁盘。注意：这是内部状态结构，不是“执行蓝图代码”的输入语法。代码框语法见 §0.1。

### 一键覆盖地图（作者服务 apply）维护合同（短版）

- **默认不扩边界**：第一次点击「一键覆盖地图」会先 `dry-run` 预检；若检测到越界坐标，会走 **HTTP 200 的二段确认分支**（不会写 formal compact、不会 compile_write）。
- **需要明确确认**：只有用户点击「允许扩展边界并覆盖」后，第二次 apply 才会显式传 `allowExpandBounds=true`；服务端 `compile_write` 仅在此时才会追加 `--allow-expand-bounds`。
- **specialMapCells 落地为正式节点**：若蓝图包含 `specialMapCells`，一键覆盖会先校验 `mapId` 是否为**真实存在的地图 id**（对应 `data/maps/<mapId>.json` 或 `data/maps/<mapId>.js`）。校验通过才会在 `compile_write` 自动追加 `--emit-landmarks` 生成正式 landmarks；若 `mapId` 为 `"1"` 等占位值或不存在，则会返回 `decision="requires_special_map_validation"`，提示先改成正式 mapId 再覆盖，禁止静默丢弃。
- **错误不要误判为断线**：`out_of_bounds / compile_write_failed / static_contract_failed` 都是 apply 业务结果，不代表作者服务未连接。
- **优先看 debugId**：出错/失败先看页面与服务端返回的 `debugId`，再到 `temp/wilderness_blueprint_apply_debug/<debugId>/` 查看样本（`request/compact/dry_report/response/exception/static_*` 等）。
- **必须用作者服务页面**：不要用普通 live-server 端口或 `file://` 页面执行一键覆盖；一键覆盖/快照/日志都依赖作者服务。

### `index.html` 如何生成（禁止手改）
- `tools/wilderness_area_preview/index.html` **只能**由导出脚本生成，勿直接在仓库里手改 HTML。
- 重生成：  
  `node scripts/wilderness_area_preview_export.mjs west2_old_marker_patrol_line`
- 蓝图交互脚本来自 `scripts/wilderness_area_preview_blueprint_fragments.mjs` 中的 `renderBlueprintRuntimeScript()`，再被 exporter 拼接进页面。

### 维护 fragments：外层模板字符串转义规则
`renderBlueprintRuntimeScript()` **返回一整段字符串**，而该字符串在 `wilderness_area_preview_export.mjs` 里又被放进**另一层**模板字面量拼接。内侧若要生成合法的浏览器端 JS：
- **正则字面量**：在 fragments 源码里写成 `\\s`、`\\d`、`\\(` …，这样落到 **生成后的 `index.html` 内联脚本** 才是 `\s`、`\d`、`(`。
- **字符串里的反斜杠**：若生成代码里需要 **一个** 反斜杠字符，在 fragments 里往往要写 **`"\\\\"`**（四层）才能让最终 HTML 里是 **`"\\"`**（一层转义出一个 `\`）。
- **典型事故**：漏写双反斜杠会导致 `/\s/` 变成 `/s/`、`split(/\r?\n/)` 断裂、`"\""` / 反斜杠比较写炸 → **整页脚本报错空白**。改 DSL 解析或字符串处理时务必对照生成后的 `<script>` 用 `new Function(...)` 做一次语法冒烟。

怎么用（概览）：
- 打开 `tools/wilderness_area_preview/index.html`。
- 保持在**矢量**模式后，点击顶部按钮“蓝图”开启（格点模式不可用/会自动退出）。
- 选择工具：`terrain_add / cell_subtract / special_map_cell`。
- `terrain_add` 的地貌列表来自 terrain defs（展示层符号 registry 不替代真值来源）。
- 默认导出：**导出紧凑蓝图**（`wilderness_blueprint_compact`）；另有合并预览导出与「导出旧版增量」兼容入口。

### 蓝图代码补丁（批量改坐标）

- 在右栏 textarea 中编写文本脚本，点击 **「执行蓝图代码」**。
- **若内容为 JSON**（紧凑/合并预览/旧增量三种 kind），请用 **「导入为蓝图层」**，不要用执行按钮。
- 脚本**只修改蓝图层** `blueprintState.cells`，不改底图、不写 `data/`、不写 `world`、不接 runtime。
- 限制：脚本文本 ≤ **1MB**、≤ **1000** 行；展开格子总计 ≤ **20000**；单条 selector ≤ **5000** 格。
- 整次执行记为 **一步 Ctrl+Z 撤销**（与单次绘制撤销栈一致）。
- 注释：`#` 与 `//`（引号内除外）；空行与纯注释行计入状态栏「跳过」计数。

语法示例：

```txt
set wind_packed_snow (-7,-2) (-7,-1) (-7,0)
set blue_ice_area rect(3,-4,4,-3)
set ice_shelf_edge line(8,-6,11,2)
clear (-7,-2)
subtract rect(3,2,4,3)
special (-7,1) "1" "前哨出入口"
```

选择器：`(...)` 单格、`rect(...)` 矩形（含端点）、`h(x,y,len)`、`v(x,y,len)`、`d(x,y,dx,dy,len)`、`line(x1,y1,x2,y2)`（仅横、竖或 45° 对角）。

### 虚拟无限画布（作者工具）
- **logical grid**：蓝图格子坐标允许任意整数 \(x/y\)，可在原始 `areaSpec.bounds` 外继续绘制扩展草案。
- **rendered grid**：网格仅按当前 viewport 的可见范围渲染，并带少量 buffer；单次渲染上限为 **160×160**，避免缩放/平移到极远处导致 SVG/DOM 爆炸。
- **blueprint cells**：仅保存用户实际绘制过的格子（key 为 `"x,y"`），禁止保存 screen/svg/client 坐标。
- **export**：只导出实际绘制过的 cells；导出 JSON **允许包含 bounds 外坐标**（不会裁剪）。

### 安全限制（避免一次性生成海量格子）
- **格子数量提示**：超过 **5000** 格会在状态栏提示“建议分区导出”。
- **格子数量硬上限**：超过 **20000** 格会停止继续批量绘制（仍允许单格删除、清空、导出）。
- **涂抹插值上限**：单次 pointermove 插值补格最多 **256**，超出会截断并提示。

### 导入 JSON（从 textarea 导入为蓝图层）
- 在右栏蓝图面板的 textarea 中粘贴 JSON，然后点击 **“导入为蓝图层”**。
- **支持格式**：
  - `kind: "wilderness_blueprint_delta"`（读取 `ops[]`）
  - `kind: "wilderness_area_merge_preview"`（读取 `terrainOverrides[] / subtractMask[] / specialMapCells[]`）
  - `kind: "wilderness_blueprint_compact"`（推荐默认格式：读取 `terrainRuns / terrainCells / subtractCells / specialMapCells`）
- 注意：本节描述的是导出 / 导入数据合同，不适用于“执行蓝图代码”输入框。代码框语法见 §0.1。
- **导入行为**：
  - 只写入蓝图层（顶层编辑层），**不修改底图**、不修改 `areaSpec`、不写回 `data/`，不接入任何 runtime 真值链。
  - 若蓝图层已有内容，默认 **替换当前蓝图层**（不弹确认框）。
  - 导入后可继续绘制覆盖、右键删除、清空、导出。
  - 坐标允许超出 `base bounds`；导出也不会裁剪 bounds 外坐标（会以 warning 提示“包含 bounds 外坐标”）。

### 默认推荐导出：`wilderness_blueprint_compact`（紧凑快照）
- `schemaVersion`：**2**；`kind`：**`wilderness_blueprint_compact`**。
- 语义：**状态快照**（按地貌分组 + run 压缩），不是逐格操作日志。
- `terrainRuns`：按 `terrainId` 分组的 run 列表；每条 run 为 `["h"|"v"|"d", x0, y0, len]`（导出侧主要产出 **h/v**；导入侧也接受对角 **d**）。
- `terrainCells`：按 `terrainId` 分组的碎点 `[[x,y], ...]`。
- `subtractCells`：`cell_subtract` 坐标 `[[x,y], ...]`。
- `specialMapCells`：短数组 `[x, y, mapId, label]`。

示例（可直接配合「导入为蓝图层」粘贴）：

```json
{
  "schemaVersion": 2,
  "kind": "wilderness_blueprint_compact",
  "sourceAreaId": "west2_old_marker_patrol_line",
  "metersPerCell": 150,
  "terrainRuns": {
    "wind_packed_snow": [
      ["h", -7, -5, 6],
      ["v", -7, -2, 3]
    ]
  },
  "terrainCells": {
    "snow_drift_zone": [[-1, 4], [0, 4]]
  },
  "subtractCells": [[3, 2]],
  "specialMapCells": [[-7, 1, "1", "前哨出入口"]]
}
```

- 导入/导出都**只作用于蓝图层**，不修改底图、不写回 `data/`，正式落地仍需人工审查并进入 `WildernessAreaSpec` 修改流程。

刷新入口（重生成页面）：
- `node scripts/wilderness_area_preview_export.mjs west2_old_marker_patrol_line`

静态检查：
- `npm run test:wilderness:blueprint-preview`

## 蓝图导出到游戏数据的隔离管线（编译器）

### 定位
- 预览器导出的 `wilderness_blueprint_compact` 是 **authoring 草案**（`tools/` 下的 JSON），**游戏 runtime 不读取**。
- 通过编译脚本把 compact JSON 转成 `data/wilderness/areas/generated/` 下的 **generated** 模块（`terrainZones` / `landmarks`）。
- 正式 `WildernessAreaSpec` 只 import generated 模块；movement / query / validate 继续走现有主链，不引入 runtime 贴皮逻辑。

### 目录

```text
tools/wilderness_area_preview/blueprints/
  west2_old_marker_patrol_line.compact.json

data/wilderness/areas/generated/
  west2_old_marker_patrol_line.generated_terrain_zones.js
```

### 命令

```bash
# 只校验与预览（不写 data/）
node scripts/wilderness_blueprint_compile_area_spec.mjs \
  --area west2_old_marker_patrol_line \
  --input tools/wilderness_area_preview/blueprints/west2_old_marker_patrol_line.compact.json \
  --dry-run

# 写入 generated 模块（写 data/wilderness/areas/generated/）
node scripts/wilderness_blueprint_compile_area_spec.mjs \
  --area west2_old_marker_patrol_line \
  --input tools/wilderness_area_preview/blueprints/west2_old_marker_patrol_line.compact.json \
  --write

# 写入后建议跑静态合同
node scripts/wilderness_static_contract_check.mjs
```

### 关键校验（编译器会拒绝）
- `kind` 必须为 `wilderness_blueprint_compact`（拒绝 delta 直接写正式数据）。
- `sourceAreaId` / `metersPerCell` 必须匹配目标 AreaSpec。
- terrainId 必须已注册于 `data/wilderness/terrain/wilderness_terrain_defs.js`。
- 坐标必须是 finite safe integer；默认要求在 bounds 内。
- `subtractCells` 本轮不写入正式 spec；write 模式默认拒绝（除非 `--allow-subtract-ignored`）。
- `specialMapCells` 默认只做提示；如需生成 landmarks 需 `--emit-landmarks`，且禁止 placeholder mapId（例如 `"1"` / `"todo"`）。

## 一键覆盖地图与旧快照（本地作者服务）

### 定位（务必读完）
- **浏览器预览器不直接写仓库**；“一键覆盖地图”必须通过本地 Node 作者服务完成写入与校验。
- **快照严格隔离**：只保存 compact JSON，不保存 generated JS，不进入 `data/wilderness/**`，并被 `.gitignore` 忽略。
- **恢复旧图**：先在“查看旧快照”里把某个快照载入蓝图层，再点击“一键覆盖地图”（仍会走 dry-run / write / static contract）。

### 启动服务

```bash
npm run wilderness:area-preview
```

访问：`http://127.0.0.1:5588/`（服务会返回 `tools/wilderness_area_preview/index.html`）

### 行为级验收（不跑浏览器）

```bash
node scripts/wilderness_blueprint_dev_server_contract_check.mjs
npm run test:wilderness:blueprint-dev-server-apply
```

## 日志查看（作者工具排错）

定位：
- **查看日志**用于排查「一键覆盖地图 / 快照读取 / 导入 / 编译 / 失败回滚」等流程问题。
- 日志严格属于 **作者工具**：不进入游戏 runtime，不写 `data/`，不写 generated，不进 save/load。

两层日志：
- **当前页面日志**：仅当前页面会话内存环形缓冲（最多 300 条），记录按钮点击、导入/导出、蓝图代码执行、fetch 失败等。
- **本地作者服务日志**：dev server **内存**环形缓冲（最多 500 条），记录 `/apply`、`/snapshots`、`/snapshot`、编译 dry-run/write、static check、rollback、snapshot commit 等；**服务重启后会清空**。

重要约束：
- 不记录 **全量 compact JSON**、不记录 **全量 generated JS**；失败时只保留 child_process stdout/stderr 的 **tail**（最多 2000 字符）用于定位。
- 清空日志只清内存，不删除任何 compact / snapshot / generated 文件。

服务未启动时：
- 只能查看「当前页面日志」；
- 切到「本地作者服务」会显示启动提示：`npm run wilderness:area-preview`。

## 本地作者服务自动发现

目标：
- 编辑器 **不硬编码**服务端口；一键覆盖 / 快照 / 日志都会先自动发现可用的本地作者服务，再发请求。
- area 参数从当前预览器的 `areaId` 推导（后续扩展新 area 时不在前端硬编码）。

服务端口策略：
- 推荐启动：`npm run wilderness:area-preview`（会自动 export + 启动作者服务 + 自动打开页面）
- 短命令：`npm run wmap`
- 服务默认尝试 `5588`；若占用则依次尝试 `5589`–`5592`（固定小范围，不做系统进程扫描、不扫全端口）。

前端发现策略（按优先级）：
- 若页面以 `http://127.0.0.1:<port>/` 打开：优先使用当前 origin
- localStorage 中上一次成功的服务地址
- 固定候选：`http://127.0.0.1:5588` … `http://127.0.0.1:5592`

未启动服务时：
- 编辑器不会写文件；相关按钮只会提示：`未发现本地作者服务：请运行 npm run wilderness:area-preview`

### 服务会做什么
- `POST /api/wilderness-blueprint/apply`：
  - 先把请求 compact 写入 `.pending/` 并跑编译 dry-run（失败直接拒绝）
  - 快照旧 compact（最多 20 个，按 hash 去重）
  - 覆盖 `tools/wilderness_area_preview/blueprints/<area>.compact.json`
  - 运行编译 write + `node scripts/wilderness_static_contract_check.mjs`
  - 任一步失败会回滚 compact 与 generated 文件
  - **apply 自身不重新生成预览页 HTML**：成功响应里 `previewRegenerated:false` 是契约语义，表示
    `tools/wilderness_area_preview/index.html` 仍是旧内容；前端会提示用户点击「从游戏文件重载预览」。
- `POST /api/wilderness-blueprint/refresh-preview`：见下面「从游戏文件重载预览」章节。

### 从游戏文件重载预览（强制刷新预览页）

定位：
- 「文件」页 → **写入与刷新** 分组下的按钮：**「从游戏文件重载预览」**。
- 唯一作用是 **重新运行 exporter** 并把当前 tab 用 `location.replace()` 刷新到带 cache-bust 参数的同一页面；不打开新页签，不读取 textarea / blueprintState / localStorage / 任何前端内存状态。
- 不替代「一键覆盖地图」：本按钮 **不写游戏数据**，只重生成预览页 HTML。

什么时候用：
- 一键覆盖成功后状态栏出现「（预览页未自动重生成，可点击"从游戏文件重载预览"。）」时。
- 直接修改了 `data/wilderness/**`（AreaSpec、generated terrain zones、terrain defs 等）后，需要让预览页 gridVm 与坐标轴跟磁盘真实数据对齐。
- 怀疑预览页显示与磁盘 AreaSpec 不一致时。

接口：
- `POST /api/wilderness-blueprint/refresh-preview`
- 请求体：可选 `{ "area": "<areaId>" }`；缺省/非法时回退到当前作者服务的主 area。
- 服务行为：
  - 调用 `runExporter(areaId)`（即 `node scripts/wilderness_area_preview_export.mjs <areaId>`）。
  - exporter 仅从磁盘读取 `data/wilderness/areas/*`、`data/wilderness/areas/generated/*`、`data/wilderness/terrain/*` 与 registry/query 所需文件；**不读取**页面 textarea、`blueprintState`、`localStorage`、当前前端 VM、旧快照。
  - 不写游戏数据，不动 compact 文件，不动快照；只重写 `tools/wilderness_area_preview/index.html`（exporter 同步也写一份到 `temp/wilderness_area_preview_<area>.html`）。
- 成功响应（HTTP 200）：
  ```json
  {
    "ok": true,
    "area": "west2_old_marker_patrol_line",
    "previewRegenerated": true,
    "reloadToken": "<timestamp-or-debugId>",
    "url": "http://127.0.0.1:<port>/?reload=<token>",
    "source": "game_files"
  }
  ```
- 失败响应（HTTP 500）：
  ```json
  {
    "ok": false,
    "error": "refresh_preview_failed",
    "stage": "export_preview",
    "details": { "exitCode": 1, "stdoutTail": "...", "stderrTail": "..." }
  }
  ```
- 服务日志会出现成对的 `refresh preview requested` / `refresh preview passed`（或 `refresh preview failed`，附 `exitCode` 与 `stdout/stderr` tail）。

刷新后页面行为：
- 前端在请求成功后写入 `sessionStorage`：`wilderness_area_preview_next_mode = "grid"`、`wilderness_area_preview_last_apply_status = "已从游戏文件重载预览。"`，再 `location.replace(response.url)`。
- 新载入的页面在初始化时读取这两个 key 并立即 **清除**（一次性，不会永久锁死模式）；页面默认进入 **格点地貌（grid）模式**，并在状态栏显示「已从游戏文件重载预览。」。
- 顶部 bounds 显示磁盘 AreaSpec 真实 bounds（含 `--allow-expand-bounds` 后的扩展，如 `x:[-8,11], y:[-8,8]`）。

边界 / 限制：
- **不写游戏数据**：不会触碰 `data/wilderness/**`、`generated terrain zones`、`world.wilderness`、save/load。
- **不读 textarea**：刷新输入完全来自磁盘正式文件，与当前蓝图层、当前 textarea、旧快照、前端 VM 完全无关。
- **不开新 tab**：始终 `location.replace`（或 `location.href`）刷新当前页签。
- **不是 apply 的别名**：apply 失败、refresh-preview 失败、static contract 失败是三个独立阶段；refresh-preview 失败不会回滚游戏数据，apply 失败也不会触发 refresh-preview。
- `index.html` 仍是 exporter 生成物，**禁止手改**；本按钮也只是触发 exporter，不会以任何形式注入用户编辑。

### 快照目录

```text
tools/wilderness_area_preview/snapshots/
  west2_old_marker_patrol_line/
    manifest.json
    <snapshotId>.compact.json
```

