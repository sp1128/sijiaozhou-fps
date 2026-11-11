# 四角洲 · 多人对战服务器部署说明

这个文件夹就是要放到服务器上的全部内容：

```
server/
  server.js          房间服务器（HTTP 页面 + WebSocket，同一个端口）
  package.json
  node_modules/      依赖（只有 ws，纯 JS，可以直接连同文件夹一起上传）
  public/index.html  游戏页面（每次运行 work/build.js 会自动更新这里）
```

## 1. 启动

服务器上需要 Node.js 16 或更高版本。

```bash
cd server
npm install        # 如果连 node_modules 一起上传了，这步可以跳过
node server.js     # 默认监听 0.0.0.0:8080
```

换端口：`node server.js --port=9000`，或者设置环境变量 `PORT=9000`。

启动后在浏览器打开 `http://服务器IP:8080/`，主菜单点 **多人对战** 即可。
记得在云服务器的安全组 / 防火墙里放行这个端口（TCP）。

`http://服务器IP:8080/health` 可以看当前房间数和在线人数。

## 2. 常驻后台（推荐 pm2）

```bash
npm install -g pm2
pm2 start server.js --name sijiaozhou -- --port=8080
pm2 save
pm2 startup     # 按提示执行，开机自启
```

看日志：`pm2 logs sijiaozhou`　重启：`pm2 restart sijiaozhou`

## 3. 用域名 + HTTPS（可选）

直接用 `http://IP:端口` 就能玩；想用域名和 HTTPS 的话，页面走 HTTPS 时游戏会自动改用 `wss://`，
只需要让反向代理把 `/ws` 也转发过去。

Nginx 反向代理示例（关键是 `/ws` 要带 Upgrade 头）：

```nginx
server {
    listen 443 ssl;
    server_name game.example.com;
    ssl_certificate     /path/fullchain.pem;
    ssl_certificate_key /path/privkey.pem;

    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
    }
}
```

## 4. 更新游戏

改完游戏后在本机运行 `node work/build.js`，它会重新生成 `server/public/index.html`。
把这个文件覆盖到服务器上即可，**不需要重启**（服务器会按文件修改时间自动重新加载页面）。
只有改了 `server.js` 才需要重启。

## 5. 玩法与规则

- 主菜单 → 多人对战 → 填昵称 → **创建房间**，把 4 位房间号发给朋友；朋友输入房间号或在列表里点房间加入。
- 房主可以选模式（个人乱斗 / 团队竞技）、目标击杀数、对局时长，然后点开始。对局进行中也可以加入。
- 先达到目标击杀数的人（或队伍）获胜，时间到则按当前比分结算；结算 12 秒后自动回到房间。
- 对局内：`TAB` 看战绩，`ESC` 打开菜单（联机时对局不会暂停），阵亡 3 秒后自动重生，重生后 2.5 秒无敌（开枪即取消）。
- 身体 4 枪、爆头伤害 ×1.8；手雷每条命 2 颗；近战 60 伤害。团队模式没有友军伤害。
- “服务器”一栏留空表示使用当前打开的这个网站；如果是双击本地 html 文件打开的游戏，需要在这里填 `IP:端口`。

## 6. 已知限制

- 服务器只负责房间、计分和转发，**命中由开枪一方的客户端判定，不防作弊**，适合朋友之间玩。
- 每个房间最多 10 人（默认 8 人）；所有人用的是同一张地图。
- 单机模式里的“专注（子弹时间）”和机械敌人在联机对战里是关闭的。
- 手机触屏可以进对局，但没有做查看战绩的按钮。
