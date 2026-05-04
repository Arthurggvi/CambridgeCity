# 公开仓库说明（Publishing）

本目录仅收录面向贡献者与玩家的公开说明。

以下内容**不会**出现在公开 GitHub 仓库中，仅保留在本地或私有资料库：

- `运维/` 内部运维笔记
- `docs/debug/`、`docs/internal/`（若存在）
- `debug/` 目录下的调试材料（若存在）
- `IMPLEMENTATION_REPORT.md` 与各类探针输出
- `temp/**`、`temp_*`：本地审计/验证/阶段输出隔离区（非无价值垃圾；见 [release_file_policy.md](./release_file_policy.md)）
- `.edge-live-audit/` 等浏览器配置审计目录
- 本地启动器状态目录 `.launcher_runtime/`（会话、日志、浏览器 profile）
- `node_modules/`、`.env*`、构建产物与 release zip

发行包请通过 `npm run release:pack` 生成，并将 zip 上传到 **GitHub Releases**，而非提交到 git。
