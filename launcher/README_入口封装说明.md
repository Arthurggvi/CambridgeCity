# 寒武新纪入口封装说明

## 文件分层

- `启动寒武新纪.bat`：Windows 用户入口，只负责进入仓库根目录并调用 PowerShell 启动器。
- `关闭寒武新纪.bat`：Windows 手动回收入口，只负责调用 PowerShell 启动器的 `-Shutdown`。
- `launcher/CambrianLauncher.ps1`：启动与回收总控，负责内置 runtime 解析、配置读取、会话文件、浏览器打开与回收。
- `launcher/cambrian_static_server.js`：Node 原生模块静态服务，仓库根目录为 web root。
- `launcher/launcher.config.json`：固定端口、入口页、浏览器偏好、窗口模式配置。
- `launcher/runtime/node/node.exe`：玩家版优先使用的内置 Node Runtime。
- `.launcher_runtime/`：运行期目录，保存会话、锁文件、浏览器隔离 profile、launcher 日志和 server 日志。

## 启动链

1. 双击 `启动寒武新纪.bat`。
2. bat 进入仓库根目录，调用 `launcher/CambrianLauncher.ps1`。
3. PowerShell 启动器先按相对路径解析 `launcher/runtime/node/node.exe`；只有开发机缺少内置 runtime 时，才允许 fallback 到系统 PATH 上的 `node`。
4. 若内置 runtime 和开发机 fallback 都不存在，直接报“发布包缺少内置运行时 / launcher runtime 不完整”，不会要求玩家安装 Node。
5. 启动器读取 `launcher.config.json`，拉起 `launcher/cambrian_static_server.js`，固定绑定 `http://127.0.0.1:<port>/`。
6. 端口就绪后打开 `http://127.0.0.1:<port>/<entryPage>`，不允许退回 `file://`。
7. 若找到 Edge/Chrome 且 `windowMode=app`，使用 `--app=` 独立窗口与隔离 profile 启动，并在窗口关闭后自动结束本次 server。
8. 若只能退回普通标签页或默认浏览器，server 保持运行，并提示用户双击 `关闭寒武新纪.bat` 回收。

## 配置项

```json
{
  "port": 5511,
  "entryPage": "index.html",
  "preferredBrowser": "auto",
  "windowMode": "app"
}
```

- `port`：固定端口。被占用时直接失败，不自动漂移。
- `entryPage`：默认 `index.html`。
- `preferredBrowser`：`edge` / `chrome` / `auto`。
- `windowMode`：`app` / `tab`。

## 开发入口规则

- `launcher`：固定使用 `http://127.0.0.1:5511/index.html`。它是日常开发与主链自检入口，用来观察项目自带静态服下的真实表现。
- `Live Server`：固定使用 `http://127.0.0.1:5500/index.html`。它只用于对比验证 VS Code Live Server 宿主差异，不替代 launcher 作为默认开发入口。
- 禁止两个宿主同时在线后再看同一个页面；做对比时必须先停掉另一侧，再访问对应 URL。
- 失败页取证时，必须把截图中的宿主标记、完整 URL 和端口一起记录，避免把 `127.0.0.1:5511`、`127.0.0.1:5500`、`localhost:5500` 混成同一宿主。

## 开发态宿主标记

- 本地开发页右下角会显示只读宿主标记，内容包含：宿主类型、当前 URL、`document.baseURI` 和当前端口。
- 该标记仅用于开发排障，不写入存档、不参与 dispatch / commit、不改变页面主体结构。

## 版本化模块桥接约定

- 业务模块禁止直接引用带 `?v=` 的运行时模块。
- 如需切换运行时模块身份，统一通过 `*_entry.js` 桥接文件收口处理。

## 回收规则

- 自动回收：仅在 `--app=` 独立窗口模式下启用。关闭独立窗口后，启动器会结束本次 server 并清理会话文件。
- 手动回收：双击 `关闭寒武新纪.bat`。该入口只处理会话文件中记录的本次 PID，不会扫杀系统里的所有 `node.exe`。
- 日志位置：`.launcher_runtime/launcher.log`、`.launcher_runtime/server.stdout.log` 和 `.launcher_runtime/server.stderr.log`。

## 打包

- 构建命令：`npm run build:launcher-bundle` 或直接执行 `scripts/build_launcher_bundle.ps1`。
- 输出目录：`dist/launcher_bundle/`。
- 打包脚本会确保 `launcher/runtime/node/node.exe` 存在，再把玩家入口 bat、web 资源、launcher 与内置 runtime 一起复制到发布目录。
- 玩家拿到 `dist/launcher_bundle/` 后，只需要双击其中的 `启动寒武新纪.bat`。
