# CambridgeCity / 寒武新纪

面向网页的**文字生存模拟**游戏：在寒武新纪的世界中探索、决策与生存。

## 本地运行（开发）

1. 安装 [Node.js](https://nodejs.org/)（用于本地静态服务或可选脚本）。
2. 克隆仓库后，在项目根目录用任意静态文件服务器以 **http** 方式打开站点（不要直接用 `file://` 打开 `index.html`，否则资源加载会失败）。

示例（任选其一）：

```bash
npx --yes serve -l 3000 .
```

然后在浏览器访问终端里提示的本地 URL，打开入口页即可。

Windows 玩家若使用仓库内的启动器与批处理，请参阅根目录的 `README_PLAY.txt`。

## 构建

本项目前端为静态资源，无传统打包编译步骤。`build` 脚本会在 `dist/release/CambridgeCity/` 下生成**与发行包一致的玩家文件树**（含启动器目录结构，并从当前 Node 可执行文件复制一份嵌入 `launcher/runtime/node/node.exe` 供 Windows 启动器使用）。该嵌入 `node.exe` **不会**提交到本仓库；克隆后若需完整 Windows 启动器包，请在本机执行 `npm run build` 或 `npm run release:pack`（或 `npm run build:launcher-bundle`）以生成本地副本。

```bash
npm run build
```

## 发行包（GitHub Releases）

生成面向玩家的 zip（**不包含** `node_modules`、`运维/`、内部 debug 文档、`temp/`（本地审计/验证隔离区，见下）、本地存档与浏览器审计目录等）：

```bash
npm run release:pack
```

产物默认位于：

- 目录：`dist/release/CambridgeCity/`
- Zip：`dist/CambridgeCity_windows_player.zip`

**下载方式：** 请前往 [GitHub Releases](https://github.com/Arthurggvi/CambridgeCity/releases) 获取最新已上传的发行 zip。

## License / 授权说明

This project is source-available, not open-source.

You may view the code, study the implementation, and download official releases to play the game.

You may not copy, redistribute, reskin, commercially use, or republish the source code, assets, writing, data files, or project structure without explicit written permission.

本项目允许公开查看代码与下载游玩发行版，但不允许未经许可复制、再分发、换皮发布、商用使用或作为自己的项目重新发布。

完整条款见 [`LICENSE.md`](./LICENSE.md)。发行包内另附 [`docs/public/third_party_notices.md`](./docs/public/third_party_notices.md)（打包为 `THIRD_PARTY_NOTICES.md`）。

## Public release file policy

`temp/` 用于存放**本地审计、验证、合同检查与阶段输出**；默认不进入 git、也不进入玩家发行包。若要把其中某份结果升格为正式基线，须迁入 `qa/**`、`validation/baselines/**` 或 `docs/public/**` 等明确路径并更新引用。完整说明见 [`docs/public/release_file_policy.md`](./docs/public/release_file_policy.md)。

## 公开范围说明

本仓库仅包含可公开的源码与面向玩家/贡献者的文档。以下内容**刻意不随公开仓库发布**（通过 `.gitignore` 与发布脚本排除），可能仍存在于你的本地工作区：

- 内部运维文档（`运维/` 等）
- Debug / 内部说明（如 `docs/debug/`、`docs/internal/`、`IMPLEMENTATION_REPORT.md`）
- 本地审计与验证隔离区 `temp/**`（见 [release_file_policy.md](./docs/public/release_file_policy.md)）
- 临时探针、审计与浏览器配置副本（如 `.edge-live-audit/`）
- 环境变量文件（`.env`、`.env.*`）
- 依赖目录 `node_modules/`、构建与 release zip 产物、常见日志与测试导出

详见 [`docs/public/PUBLISHING.md`](./docs/public/PUBLISHING.md)。
