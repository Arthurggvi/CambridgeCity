CambridgeCity 朋友游玩说明（Windows）
1) 直接双击 启动寒武新纪.bat
2) 会自动拉起本地 same-origin 服务，并打开游戏入口页
3) 不要直接双击 index.html（file:// 会导致数据读取失败）
4) launcher 默认固定使用 5511 端口；若端口被占用，启动器会直接报错，不会偷偷换端口
5) 若以独立应用窗口打开，关闭该窗口后会自动回收本次本地服务
6) 若退回普通浏览器模式，服务会继续保留；请双击 关闭寒武新纪.bat 手动回收
7) 玩家发布包自带运行时，不需要额外安装 Node、不需要改 PATH、不需要手动起 server
8) 若启动时报“发布包缺少内置运行时”或“launcher runtime 不完整”，说明拿到的发布包缺文件，请重新获取完整包
9) 若开发机需要对比 VS Code Live Server，请固定让 Live Server 使用 5500，且不要和 launcher 同时在线
10) 启动与回收说明见 launcher/README_入口封装说明.md
    