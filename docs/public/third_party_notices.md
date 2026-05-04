# Third-party components（发行包相关第三方说明）

本文件面向**玩家发行包**与仓库阅读者，概述与运行或开发相关的外部组件。完整授权以各项目官方条款为准。

## Windows 启动器内嵌 Node.js 运行时

若你通过 `npm run build`、`npm run release:pack` 或 `build:launcher-bundle` 在本地生成了 `launcher/runtime/node/node.exe`，该可执行文件来自 **Node.js** 官方发行版（版权归属 Node.js 贡献者与 Joyent 等，以 Node.js 项目许可证为准）。该二进制**仅用于**本仓库自带的本地静态服务启动器；本游戏业务逻辑不依赖 Node 运行时执行游戏本体（游戏在浏览器中运行）。

## 开发依赖（一般不在玩家 zip 中）

仓库的 `package.json` / `package-lock.json` 可能列出 **Playwright** 等仅用于自动化或开发机校验的依赖；默认玩家发行包（`release:pack`）**不包含** `node_modules/`，因此这些包通常不会随 zip 分发。若你自行安装开发依赖，请遵守对应 npm 包所声明的许可证。

## 浏览器与系统

游戏在浏览器中运行；浏览器、操作系统及其自带组件的许可由各自厂商提供，不在本仓库授权范围内。
