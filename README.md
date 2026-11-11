# 四角洲 · 国产 3A 大作

一个单文件的网页第一人称射击游戏（three.js），带单机剧情、生存模式和**房间制多人对战**。

## 直接玩

- **单机**：下载 `四角洲国产3A大作_V2.html`，用 Chrome / Edge 双击打开即可。
- **联机**：需要先启动房间服务器（见下），然后所有人用浏览器打开服务器地址，主菜单点“多人对战”。

## 玩法

| 模式 | 说明 |
| --- | --- |
| 开始行动 | 剧情模式：切断三处中继，登船撤离 |
| 生存模式 | 一波波机械守卫，看能撑到第几波 |
| 多人对战 | 开房间 / 输入 4 位房间号加入；个人乱斗或团队竞技，先到目标击杀数获胜 |

操作：`WASD` 移动 · 鼠标瞄准 · 左键开火 · 右键瞄准 · `R` 换弹 · 按住 `G` 瞄准手雷、松开投掷 · `F` 近战 ·
`Q` 专注（仅单机） · `Shift` 冲刺 · `C` 蹲伏 · `TAB` 战绩（联机） · `Esc` 菜单。

## 启动联机服务器

需要 Node.js 16+。

```bash
cd server
npm install
node server.js --port=8080
```

浏览器打开 `http://服务器IP:8080/`。后台常驻、HTTPS 反向代理等见 [server/README.md](server/README.md)。

服务器只负责房间、计分和消息转发，命中由开枪一方的客户端判定，**不防作弊**，适合朋友之间玩。

## 目录

```
四角洲国产3A大作_V2.html   构建产物：完整游戏（单文件）
server/                    房间服务器 + 它提供的游戏页面 public/index.html
work/
  shell.html               页面外壳（HTML 结构和基础样式，留有脚本插槽）
  bundle.pretty.js         游戏主体（格式化后的打包文件，在这里改）
  net.js                   联机模块（构建时注入主体）
  extra.css                追加样式
  build.js                 构建脚本
  extras.js, patch*.js     已经应用过的一次性补丁，仅作记录
```

## 修改与构建

改 `work/bundle.pretty.js`、`work/net.js` 或 `work/extra.css`，然后：

```bash
node work/build.js
```

会重新生成 `四角洲国产3A大作_V2.html` 和 `server/public/index.html`（首次运行会通过 npx 下载 esbuild）。
