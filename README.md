# 突发监听

欧美 + 国内公开/半公开突发线索桌面雷达（Electron）。应用内推送线索，3 小时自动丢弃，生成最小风险草稿，用户自行点开发送到 X。

## 快速启动

```bash
npm install
npm start
```

无图形界面时可只跑一轮采集：

```bash
npm run pipeline:once
```

## Linux 桌面图标

```bash
npm run install:desktop
```

会写入：

- `~/Desktop/tufa-jianting.desktop`
- `~/.local/share/applications/tufa-jianting.desktop`

若桌面图标显示「未信任」，在文件管理器中右键允许启动，或执行：

```bash
gio set ~/Desktop/tufa-jianting.desktop metadata::trusted true
```

## 配置

- `config/sources.json` — L1–L5 / 脏源、扫描间隔、开关
- `config/keywords.json` — 中英白名单 / 黑名单、明星种子
- `config/settings.json` — 热度门槛、静音默认等

## 说明

- 及时性优先于真实性；不做核实层与复盘。
- 脏源条目标「脏源」，草稿强制「网传」。
- L5 / 脏源可一键静音；TG/Discord/scanner/匿名板为配置占位，默认可关。
- 明星热度为本地启发式评分，可替换外部 API。

更完整的中文使用说明见项目协作文档 `docs/app-readme.md`（云端 Context）。
