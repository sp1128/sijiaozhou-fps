    /* =====================================================================================================
       Multiplayer — rooms · remote players · PvP hits · scoreboard.
       This file is injected into bundle.pretty.js by build.js at the @jm-net marker, so it lives inside the
       bundle's IIFE and can use its minified names (W = Vector3, Qe = Mesh, wt = Group, un/ls/Ys = geometries).
       Model: the server only relays and keeps score. Each client simulates its own player, decides the hits
       of its own shots against the remote players it sees, and reports its own death.
       ===================================================================================================== */
    function jmNet(i) {
        let hud = i.hud || {},
            hroot = hud.root || document.createElement("div"),
            menus = i.game.menus,
            mroot = menus.root,
            KEY = "sijiaozhou.mp.v1",
            TAU = Math.PI * 2,
            cfg = {
                name: "",
                server: ""
            },
            esc = e => String(e == null ? "" : e).replace(/[&<>"']/g, t => "&#" + t.charCodeAt(0) + ";"),
            r2 = e => Math.round(e * 100) / 100,
            r3 = e => [r2(e.x), r2(e.y), r2(e.z)],
            now = () => performance.now() / 1e3,
            ws = null,
            wsOpen = !1,
            pending = null,
            myId = 0,
            room = null,
            players = new Map,
            remotes = new Map,
            active = !1,
            endAt = 0,
            deadT = -1,
            protT = 0,
            sendT = 0,
            hudT = 0,
            pingT = 0,
            listT = 0,
            ping = 0,
            curHit = null,
            lastHit = null,
            deathPos = new W(1e4, 0, 1e4),
            killer = "",
            boardOn = !1,
            shotN = 0,
            pts = null,
            topKey = "",
            listKey = "",
            respawnKey = "",
            v1 = new W,
            v2 = new W,
            v3 = new W,
            v4 = new W;
        try {
            let e = JSON.parse(localStorage.getItem(KEY) || "null");
            e && typeof e == "object" && (cfg.name = String(e.name || "").slice(0, 12), cfg.server = String(e.server || "").slice(0, 120))
        } catch {}
        i.params && i.params.server && (cfg.server = String(i.params.server));
        i.params && i.params.name && (cfg.name = String(i.params.name).slice(0, 12));
        cfg.name || (cfg.name = "队员" + (100 + Math.floor(Math.random() * 900)));

        function save() {
            try {
                localStorage.setItem(KEY, JSON.stringify(cfg))
            } catch {}
        }

        /* ---------------- menu screens ---------------- */
        mroot.insertAdjacentHTML("beforeend", `
    <section class="m-screen m-card m-mp" data-s="mp" aria-label="多人对战">
      <div class="m-k">联机 · 房间对战</div>
      <h2 class="m-h">多人对战</h2>
      <div class="mp-form">
        <label><span>昵称</span><input data-mp="name" maxlength="12" autocomplete="off" spellcheck="false"></label>
        <label><span>服务器</span><input data-mp="server" placeholder="留空 = 当前网站" autocomplete="off" spellcheck="false"></label>
      </div>
      <p class="m-line mp-status" data-mp="status"></p>
      <div class="mp-join"><input data-mp="code" inputmode="numeric" maxlength="4" placeholder="房间号" autocomplete="off"><button class="btn" data-mp-act="join">加入房间</button></div>
      <div class="mp-list" data-mp="list"></div>
      <div class="m-actions col"><button class="btn primary" data-mp-act="create">创建房间</button><button class="btn" data-mp-act="refresh">刷新房间列表</button><button class="btn" data-mp-act="back">返回主菜单</button></div>
    </section>
    <section class="m-screen m-card m-mp" data-s="mp-room" aria-label="房间">
      <div class="m-k">房间号 · 把它告诉队友</div>
      <h2 class="m-h" data-mp="rcode">0000</h2>
      <p class="m-line mp-status" data-mp="rinfo"></p>
      <div class="mp-opts">
        <div class="mp-opt"><span>模式</span><div class="mp-seg" data-mp-opt="mode"><button data-v="ffa">个人乱斗</button><button data-v="tdm">团队竞技</button></div></div>
        <div class="mp-opt"><span>目标击杀</span><div class="mp-seg" data-mp-opt="goal"><button data-v="10">10</button><button data-v="20">20</button><button data-v="30">30</button><button data-v="50">50</button></div></div>
        <div class="mp-opt"><span>时长</span><div class="mp-seg" data-mp-opt="mins"><button data-v="5">5 分</button><button data-v="8">8 分</button><button data-v="12">12 分</button><button data-v="20">20 分</button></div></div>
      </div>
      <div class="mp-players" data-mp="players"></div>
      <div class="m-actions col"><button class="btn primary" data-mp-act="start">开始对局</button><button class="btn" data-mp-act="swap">更换队伍</button><button class="btn" data-mp-act="leave">离开房间</button></div>
    </section>
    <section class="m-screen m-card m-mp" data-s="mp-end" aria-label="对局结束">
      <div class="m-k" data-mp="ek">对局结束</div>
      <h2 class="m-h" data-mp="eh">胜利</h2>
      <p class="m-line mp-status" data-mp="einfo"></p>
      <div class="mp-players" data-mp="eboard"></div>
      <div class="m-actions col"><button class="btn" data-mp-act="leave">离开房间</button></div>
    </section>`);
        let q = e => mroot.querySelector(`[data-mp="${e}"]`),
            act = e => mroot.querySelector(`[data-s="mp-room"] [data-mp-act="${e}"]`),
            inName = q("name"),
            inServer = q("server"),
            inCode = q("code"),
            pauseK = mroot.querySelector('[data-s="paused"] .m-k'),
            pauseH = mroot.querySelector('[data-s="paused"] .m-h'),
            pauseMenu = mroot.querySelector('[data-s="paused"] [data-act="menu"]'),
            pauseTxt = [pauseK && pauseK.textContent, pauseH && pauseH.textContent, pauseMenu && pauseMenu.textContent];

        function status(e) {
            q("status").textContent = e || ""
        }

        function setPauseText(e) {
            pauseK && (pauseK.textContent = e ? "联机对战 · 对局不会暂停" : pauseTxt[0]), pauseH && (pauseH.textContent = e ? "菜单" : pauseTxt[1]), pauseMenu && (pauseMenu.textContent = e ? "离开对局" : pauseTxt[2])
        }

        function drawList(e) {
            let t = e.length ? e.map(n => `<button class="mp-item" data-mp-code="${esc(n.code)}"><b>${esc(n.code)}</b><span>${esc(n.title)}</span><i>${n.mode==="tdm"?"团队竞技":"个人乱斗"}</i><em>${n.n|0}/${n.max|0}${n.state==="lobby"?"":" · 对局中"}</em></button>`).join("") : '<p class="mp-empty">暂无房间 · 创建一个，把房间号发给朋友</p>';
            t !== listKey && (listKey = t, q("list").innerHTML = t)
        }

        function drawRoom() {
            if (!room) return;
            let e = room.host === myId,
                t = room.opts.mode === "tdm",
                n = room.state === "lobby";
            q("rcode").textContent = room.code, q("rinfo").textContent = (e ? "你是房主 · " : "") + `${room.players.length}/${room.opts.max} 人` + (n ? e ? " · 人齐后点击开始，也可以中途加入" : " · 等待房主开始" : " · 对局结算中");
            for (let o of mroot.querySelectorAll("[data-mp-opt]")) {
                let r = String(room.opts[o.dataset.mpOpt]);
                for (let a of o.children) a.setAttribute("aria-pressed", String(a.dataset.v === r)), a.disabled = !e || !n
            }
            let s = o => `<div class="mp-p${o.id===myId?" me":""}"><b>${esc(o.name)}</b>${o.id===room.host?"<i>房主</i>":""}${o.id===myId?"<i>你</i>":""}</div>`;
            q("players").innerHTML = t ? [0, 1].map(o => `<div class="mp-team t${o}"><h4>${o?"蓝队":"红队"}</h4>${room.players.filter(r=>r.team===o).map(s).join("")||'<div class="mp-p none">—</div>'}</div>`).join("") : `<div class="mp-team">${room.players.map(s).join("")}</div>`, q("players").classList.toggle("two", t);
            let o = act("start");
            o.disabled = !e || !n, o.textContent = e ? "开始对局" : "等待房主开始", act("swap").hidden = !t || !n
        }

        function boardHtml() {
            if (!room) return "";
            let e = room.opts.mode === "tdm",
                t = [...players.values()].sort((o, r) => r.k - o.k || o.d - r.d),
                n = o => `<div class="mp-r${o.id===myId?" me":""}"><b>${esc(o.name)}</b><span>${o.k|0}</span><span>${o.d|0}</span></div>`,
                s = o => `<div class="mp-r hd"><b>${o}</b><span>击杀</span><span>阵亡</span></div>`;
            return e ? [0, 1].map(o => `<div class="mp-team t${o}">${s((o?"蓝队 · ":"红队 · ")+(room.ts[o]|0))}${t.filter(r=>r.team===o).map(n).join("")}</div>`).join("") : `<div class="mp-team">${s("队员")}${t.map(n).join("")}</div>`
        }

        function drawEnd(e) {
            if (!room) return;
            let t = room.opts.mode === "tdm",
                n = players.get(myId),
                s, o;
            t ? (s = e === 0 ? "红队获胜" : e === 1 ? "蓝队获胜" : "平局", o = e < 0 ? "平局" : n && n.team === e ? "胜利" : "失败") : (s = e > 0 && players.get(e) ? players.get(e).name + " 获胜" : "平局", o = e === myId ? "胜利" : e > 0 ? "失败" : "平局");
            q("ek").textContent = "对局结束 · " + s, q("eh").textContent = o, q("einfo").textContent = n ? `你的战绩：击杀 ${n.k} · 阵亡 ${n.d} · 即将返回房间` : "即将返回房间";
            let r = q("eboard");
            r.innerHTML = boardHtml(), r.classList.toggle("two", t)
        }

        /* ---------------- in-match HUD ---------------- */
        let ui = {
            top: li("div", "h-mp", '<div class="h-k"></div><b class="h-mp-t">00:00</b><div class="h-mp-s"></div><div class="h-mp-p"></div>'),
            board: li("div", "h-board", '<div class="h-k">战绩</div><div class="mp-players"></div><div class="h-board-f">松开 TAB 关闭 · ESC 打开菜单</div>'),
            respawn: li("div", "h-respawn", "<b></b><span></span>"),
            tags: li("div", "h-tags")
        };
        hroot.append(ui.tags, ui.top, ui.board, ui.respawn), ui.topK = ui.top.querySelector(".h-k"), ui.topT = ui.top.querySelector(".h-mp-t"), ui.topS = ui.top.querySelector(".h-mp-s"), ui.topP = ui.top.querySelector(".h-mp-p"), ui.boardB = ui.board.querySelector(".mp-players"), ui.respawnB = ui.respawn.querySelector("b"), ui.respawnS = ui.respawn.querySelector("span");

        function drawTop(e) {
            if (!room) return;
            let t = Math.max(0, Math.ceil(endAt - now())),
                n = room.opts.mode === "tdm",
                s = players.get(myId) || {
                    k: 0,
                    d: 0
                },
                o;
            if (n) o = `<i class="t0">红 ${room.ts[0]|0}</i><i class="t1">蓝 ${room.ts[1]|0}</i>`;
            else {
                let a = 0;
                for (let l of players.values()) l.id !== myId && l.k > a && (a = l.k);
                o = `<i>你 ${s.k|0}</i><i class="dim">对手最高 ${a}</i>`
            }
            let r = t + "|" + o + "|" + s.d + "|" + ping;
            r === topKey && !e || (topKey = r, ui.topK.textContent = (n ? "团队竞技" : "个人乱斗") + " · 目标 " + room.opts.goal, ui.topT.textContent = menus.fmtTime(t), ui.topT.classList.toggle("low", t <= 30), ui.topS.innerHTML = o, ui.topP.textContent = `击杀 ${s.k|0} · 阵亡 ${s.d|0} · ${ping} ms`)
        }

        function drawBoard() {
            ui.boardB.innerHTML = boardHtml(), ui.boardB.classList.toggle("two", !!room && room.opts.mode === "tdm")
        }

        function setBoard(e) {
            boardOn = !!e, ui.board.classList.toggle("on", boardOn), boardOn && drawBoard()
        }

        function drawRespawn() {
            let e = (killer ? "被 " + killer + " 击杀" : "阵亡") + "|" + Math.max(1, Math.ceil(deadT));
            e !== respawnKey && (respawnKey = e, ui.respawnB.textContent = killer ? "被 " + killer + " 击杀" : "阵亡", ui.respawnS.textContent = Math.max(1, Math.ceil(deadT)) + " 秒后重新部署")
        }
        addEventListener("keydown", e => {
            e.code === "Tab" && active && i.game.state === "playing" && (e.preventDefault(), boardOn || setBoard(!0))
        }), addEventListener("keyup", e => {
            e.code === "Tab" && boardOn && setBoard(!1)
        }), addEventListener("blur", () => {
            boardOn && setBoard(!1)
        });

        /* ---------------- connection ---------------- */
        function wsUrl() {
            let e = (cfg.server || "").trim(),
                t = location.protocol === "https:" ? "wss://" : "ws://";
            if (!e) return location.protocol === "http:" || location.protocol === "https:" ? t + location.host + "/ws" : null;
            /^https:\/\//i.test(e) ? e = "wss://" + e.slice(8) : /^http:\/\//i.test(e) ? e = "ws://" + e.slice(7) : /^wss?:\/\//i.test(e) || (e = t + e);
            e = e.replace(/\/+$/, "");
            return /\/ws$/i.test(e) ? e : e + "/ws"
        }

        function tx(e) {
            if (ws && wsOpen) try {
                ws.send(JSON.stringify(e))
            } catch {}
        }

        function drop() {
            let e = ws;
            ws = null, wsOpen = !1, pending = null;
            if (e) try {
                e.close()
            } catch {}
        }

        function connect(e) {
            if (ws && wsOpen) {
                e && e();
                return
            }
            if (e && (pending = e), ws) return;
            let t = wsUrl();
            if (!t) {
                pending = null, status("本地文件无法自动找到服务器 · 请在“服务器”里填写地址，例如 1.2.3.4:8080");
                return
            }
            status("正在连接服务器…");
            let n;
            try {
                n = new WebSocket(t)
            } catch {
                pending = null, status("服务器地址无效");
                return
            }
            ws = n, n.onopen = () => {
                ws === n && (wsOpen = !0, tx({
                    t: "hello",
                    name: cfg.name
                }))
            }, n.onmessage = s => {
                if (ws !== n) return;
                let o;
                try {
                    o = JSON.parse(s.data)
                } catch {
                    return
                }
                try {
                    onMsg(o)
                } catch (r) {
                    console.error("[net] message handler threw: " + (r && r.stack || r))
                }
            }, n.onclose = () => {
                if (ws !== n) return;
                let s = wsOpen;
                ws = null, wsOpen = !1, pending = null, myId = 0;
                let o = s ? "与服务器的连接已断开" : "无法连接服务器 · 请检查地址，并确认服务器已启动";
                room || active ? quit(o) : status(o)
            }, n.onerror = () => {}
        }

        function onMsg(e) {
            switch (e.t) {
                case "s":
                    onState(e.i, e.d);
                    break;
                case "f":
                    onFire(e);
                    break;
                case "h":
                    onHit(e);
                    break;
                case "k":
                    onKill(e);
                    break;
                case "n":
                    onNade(e);
                    break;
                case "pong":
                    ping = Math.max(0, Math.round((now() - e.c) * 1e3));
                    break;
                case "welcome": {
                    myId = e.id, e.name && (cfg.name = e.name, inName.value = cfg.name), status("已连接服务器 · " + cfg.name);
                    let t = pending;
                    pending = null, t && t();
                    break
                }
                case "rooms":
                    drawList(e.list || []);
                    break;
                case "room":
                case "start":
                    applyRoom(e.room);
                    break;
                case "end":
                    applyRoom(e.room, e.win);
                    break;
                case "err":
                    status(e.msg || "操作失败");
                    break
            }
        }

        function applyRoom(e, t) {
            if (!e || !Array.isArray(e.players)) return;
            room = e, players.clear();
            for (let n of e.players) players.set(n.id, n);
            for (let n of [...remotes.values()]) players.has(n.id) || dropRemote(n);
            e.state === "playing" ? (endAt = now() + (e.left || 0), active ? drawTop(!0) : enterMatch()) : e.state === "ended" ? active ? (exitMatch(), drawEnd(t), menus.show("mp-end")) : menus.screen !== "mp-end" && menus.show("mp-room") : (active && exitMatch(), menus.show("mp-room"));
            drawRoom(), boardOn && drawBoard()
        }

        function enterMatch() {
            active = !0, deadT = -1, protT = 0, lastHit = curHit = null, killer = "", topKey = "", deathPos.set(1e4, 0, 1e4);
            for (let e of [...remotes.values()]) dropRemote(e);
            mroot.classList.add("jm-mp"), hroot.classList.add("jm-mp"), setPauseText(!0), ui.respawn.classList.remove("on"), setBoard(!1);
            i.game.mpStart(), spawnMe(!0), drawTop(!0);
            try {
                hud.feed && hud.feed(`<b>${room.opts.mode==="tdm"?"团队竞技":"个人乱斗"}</b> 先到 ${room.opts.goal} 次击杀获胜`), hud.feed && hud.feed("<b>TAB</b> 查看战绩")
            } catch {}
        }

        function exitMatch() {
            active = !1, deadT = -1, protT = 0;
            for (let e of [...remotes.values()]) dropRemote(e);
            mroot.classList.remove("jm-mp"), hroot.classList.remove("jm-mp"), setPauseText(!1), ui.respawn.classList.remove("on"), setBoard(!1);
            try {
                i.player.invulnerable = !1
            } catch {}
            i.game.toTitle()
        }

        function quit(e) {
            wsOpen && room && tx({
                t: "leave"
            }), room = null, players.clear(), active && exitMatch(), menus.show("mp"), status(e || (wsOpen ? "已连接服务器 · " + cfg.name : "")), listT = 0
        }

        function readForm() {
            let e = inName.value.replace(/[<>&"'`\\]/g, "").trim().slice(0, 12),
                t = inServer.value.trim().slice(0, 120);
            e && e !== cfg.name && (cfg.name = e, wsOpen && tx({
                t: "hello",
                name: e
            })), inName.value = cfg.name, t !== cfg.server && (cfg.server = t, drop()), save()
        }
        inName.addEventListener("change", readForm), inServer.addEventListener("change", () => {
            readForm(), connect(() => tx({
                t: "list"
            }))
        }), inCode.addEventListener("keydown", e => {
            e.code !== "Enter" && e.code !== "NumpadEnter" || (e.preventDefault(), join(inCode.value))
        });

        function join(e) {
            e = String(e || "").trim();
            if (!/^\d{4}$/.test(e)) {
                status("请输入 4 位房间号");
                return
            }
            readForm(), connect(() => tx({
                t: "join",
                code: e
            }))
        }
        mroot.addEventListener("click", e => {
            let t = e.target.closest("button");
            if (!t || !mroot.contains(t) || t.disabled) return;
            if (t.dataset.mpCode) {
                join(t.dataset.mpCode);
                return
            }
            let n = t.parentElement && t.parentElement.dataset.mpOpt;
            if (n && room && room.host === myId) {
                tx({
                    t: "opts",
                    opts: {
                        [n]: n === "mode" ? t.dataset.v : +t.dataset.v
                    }
                });
                return
            }
            switch (t.dataset.mpAct) {
                case "create":
                    readForm(), connect(() => tx({
                        t: "create",
                        opts: {
                            mode: "ffa",
                            goal: 20,
                            mins: 8,
                            max: 8
                        }
                    }));
                    break;
                case "join":
                    join(inCode.value);
                    break;
                case "refresh":
                    readForm(), listKey = "", connect(() => tx({
                        t: "list"
                    }));
                    break;
                case "back":
                    menus.show("title");
                    break;
                case "start":
                    tx({
                        t: "start"
                    });
                    break;
                case "swap": {
                    let s = players.get(myId);
                    tx({
                        t: "team",
                        team: s && s.team === 0 ? 1 : 0
                    });
                    break
                }
                case "leave":
                    quit();
                    break
            }
        });

        /* ---------------- remote players ---------------- */
        let geo = null;

        function geos() {
            return geo || (geo = {
                leg: new un(.15, .86, .18),
                torso: new un(.4, .56, .23),
                vest: new un(.44, .36, .27),
                pack: new un(.3, .34, .12),
                head: new ls(.115, 12, 9),
                helmet: new ls(.137, 12, 6, 0, TAU, 0, Math.PI * .43),
                neck: new Ys(.05, .062, .12, 8),
                arm: new un(.1, .1, .46),
                gun: new un(.055, .11, .62),
                barrel: new Ys(.016, .016, .3, 8)
            })
        }
        let isFoe = e => !room || room.opts.mode !== "tdm" || !players.get(myId) || e.team !== players.get(myId).team;

        function mkRemote(e) {
            let t = geos(),
                n = i.mats,
                s = room && room.opts.mode === "tdm" ? n.get(e.team === 1 ? "paint_blue" : "paint_red") : n.get("armor_orange"),
                o = new wt,
                r = new wt,
                a = new wt,
                l = new wt,
                c = new wt,
                u = new wt,
                h = new wt,
                f = (y, b, m, A, _, M, E) => {
                    let w = new Qe(y, b);
                    return w.position.set(A, _, M), w.castShadow = !!E, w.receiveShadow = !1, m.add(w), w
                },
                p = n.get("plastic_grey"),
                d = n.get("polymer_tan"),
                v = n.get("polymer_tan");
            r.position.y = .86, c.position.x = -.1, u.position.x = .1, f(t.leg, p, c, 0, -.43, 0, !0), f(t.leg, p, u, 0, -.43, 0, !0);
            f(t.torso, d, a, 0, .3, 0, !0), f(t.vest, s, a, 0, .34, 0, !1), f(t.pack, n.get("polymer_black"), a, 0, .34, .18, !1);
            h.position.set(0, .76, 0), f(t.head, v, h, 0, 0, 0, !1), f(t.helmet, s, h, 0, .012, 0, !0), f(t.neck, v, a, 0, .62, 0, !1);
            l.position.set(0, .5, 0), f(t.arm, d, l, -.05, -.03, -.3, !1).rotation.y = -.46, f(t.arm, d, l, .16, -.05, -.17, !1).rotation.y = .3, f(t.gun, n.get("gunmetal"), l, .1, -.02, -.45, !1), f(t.barrel, n.get("steel_dark"), l, .1, 0, -.88, !1).rotation.x = Math.PI / 2;
            a.add(h, l), r.add(c, u, a), o.add(r), o.name = "jm-remote", o.visible = !1, i.scene.add(o);
            let g = isFoe(e),
                x = li("div", "h-tag " + (g ? "foe" : "mate"), "<b></b><i><u></u></i>");
            x.querySelector("b").textContent = e.name, ui.tags.appendChild(x);
            let y = {
                id: e.id,
                name: e.name,
                team: e.team,
                foe: g,
                g: o,
                hips: r,
                upper: a,
                aim: l,
                headG: h,
                legL: c,
                legR: u,
                buf: [],
                pos: new W,
                yaw: 0,
                pitch: 0,
                ck: 0,
                speed: 0,
                phase: 0,
                alive: !0,
                deadK: 0,
                deadT: 0,
                hp: 100,
                hpShown: -1,
                flags: 0,
                tag: x,
                tagBar: x.querySelector("u"),
                tagOn: !1,
                tagK: "",
                los: !0,
                losT: Math.random() * .2
            };
            return remotes.set(e.id, y), y
        }

        function dropRemote(e) {
            try {
                i.scene.remove(e.g)
            } catch {}
            e.tag.remove(), remotes.delete(e.id)
        }

        function onState(e, t) {
            if (!active || e === myId) return;
            let n = players.get(e);
            if (!n) return;
            let s = remotes.get(e) || mkRemote(n),
                o = !(t[5] & 2);
            o !== s.alive && (s.alive = o, o && (s.buf.length = 0, s.deadK = 0, s.deadT = 0)), s.buf.push({
                t: now(),
                x: t[0],
                y: t[1],
                z: t[2],
                yaw: t[3],
                pitch: t[4],
                f: t[5]
            }), s.buf.length > 24 && s.buf.shift(), s.flags = t[5], s.hp = t[6] | 0
        }

        function stepRemote(e, t, n, s) {
            let o = e.buf,
                r = o.length;
            if (!r) return;
            let a = o[0],
                l = o[r - 1],
                c = n - .1,
                u = 0;
            if (c >= l.t) a = l;
            else if (c > a.t) {
                for (let g = r - 2; g >= 0; g--)
                    if (o[g].t <= c) {
                        a = o[g], l = o[g + 1];
                        break
                    } let g = l.t - a.t;
                u = g > 1e-4 ? Zn((c - a.t) / g, 0, 1) : 1
            } else l = a;
            let h = l.x - a.x,
                f = l.y - a.y,
                p = l.z - a.z,
                d = l.t - a.t,
                v = a !== l && d > 1e-4 ? Math.hypot(h, p) / d : 0;
            h * h + f * f + p * p > 36 && (u = 1, v = 0);
            let g = l.yaw - a.yaw;
            g -= Math.round(g / TAU) * TAU, e.pos.set(a.x + h * u, a.y + f * u, a.z + p * u), e.yaw = a.yaw + g * u, e.pitch = a.pitch + (l.pitch - a.pitch) * u;
            let x = e.alive;
            e.ck = kn(e.ck, l.f & 1 && x ? 1 : 0, 12, t), e.speed = kn(e.speed, x ? Math.min(v, 9) : 0, 10, t), e.phase += e.speed * t * 2.4;
            x ? (e.deadK = 0, e.deadT = 0) : (e.deadK = Math.min(1, e.deadK + t / .45), e.deadT += t);
            let y = e.g,
                b = x || e.deadT < 4;
            if (y.visible !== b && (y.visible = b), b) {
                let m = e.ck,
                    A = Math.sin(e.phase) * Math.min(.75, e.speed * .13),
                    _ = e.deadK * e.deadK * (3 - 2 * e.deadK);
                y.position.copy(e.pos), y.rotation.set(1.5 * _, e.yaw, 0, "YXZ"), e.hips.position.y = .86 - .5 * m, e.legL.scale.y = e.legR.scale.y = 1 - .58 * m, e.legL.rotation.x = A, e.legR.rotation.x = -A;
                let M = x ? e.pitch : 0;
                e.upper.rotation.x = M * .3 - .15 * m, e.aim.rotation.x = M * .7 + .15 * m, e.headG.rotation.x = M * .5
            }
            let m = !1;
            if (x) {
                v1.set(e.pos.x, e.pos.y + 1.94 - .5 * e.ck, e.pos.z);
                let A = v1.distanceTo(s.position);
                if (v2.copy(v1).project(s), v2.z < 1 && Math.abs(v2.x) < 1.02 && Math.abs(v2.y) < 1.02) {
                    if (e.losT -= t, e.losT <= 0) {
                        e.losT = .22, v3.set(e.pos.x, e.pos.y + 1.5 - .5 * e.ck, e.pos.z);
                        try {
                            e.los = i.physics.lineOfSight(s.position, v3)
                        } catch {
                            e.los = !0
                        }
                    }
                    if (m = e.foe ? e.los && A < 70 && Math.hypot(v2.x, v2.y * .6) < .13 : A < 90) {
                        let _ = Math.round((v2.x * .5 + .5) * innerWidth),
                            M = Math.round((-v2.y * .5 + .5) * innerHeight),
                            E = _ + "," + M;
                        E !== e.tagK && (e.tagK = E, e.tag.style.transform = `translate3d(${_}px,${M}px,0)`), !e.foe && e.hp !== e.hpShown && (e.hpShown = e.hp, e.tagBar.style.transform = `scaleX(${Zn(e.hp/100,0,1).toFixed(2)})`)
                    }
                }
            }
            m !== e.tagOn && (e.tagOn = m, e.tag.classList.toggle("on", m))
        }

        /* ---------------- hit shapes ---------------- */
        function hitSphere(e, t, n, s, o, r, a) {
            let l = n - e.x,
                c = s - e.y,
                u = o - e.z,
                h = l * t.x + c * t.y + u * t.z,
                f = l * l + c * c + u * u - r * r,
                p = h * h - f;
            if (p < 0) return -1;
            let d = h - Math.sqrt(p);
            return d < 0 ? f < 0 ? 0 : -1 : d <= a ? d : -1
        }

        function hitCapsule(e, t, n, s, o, r, a, l) {
            let c = e.x - n,
                u = e.z - s,
                h = t.x * t.x + t.z * t.z,
                f = c * c + u * u - a * a;
            if (h > 1e-9) {
                let v = c * t.x + u * t.z,
                    g = v * v - h * f;
                if (g < 0) return -1;
                let x = (-v - Math.sqrt(g)) / h;
                if (x < 0 && f < 0 && (x = 0), x >= 0) {
                    let y = e.y + t.y * x;
                    if (y >= o && y <= r) return x <= l ? x : -1
                }
            } else if (f > 0) return -1;
            let p = hitSphere(e, t, n, o, s, a, l),
                d = hitSphere(e, t, n, r, s, a, l);
            return p >= 0 && (d < 0 || p < d) ? p : d
        }

        /* ---------------- events from other players ---------------- */
        function onFire(e) {
            if (!active || !e.o || !e.e) return;
            v1.fromArray(e.o), v2.fromArray(e.e), v3.subVectors(v2, v1);
            let t = v3.length();
            if (t < .05) return;
            v3.multiplyScalar(1 / t);
            try {
                let n = i.fx;
                n && (n.muzzleFlash && n.muzzleFlash(v1, v3, {
                    scale: 1
                }), n.tracer && n.tracer(v1, v2, {})), i.render && i.render.lightPool && i.render.lightPool.flash(v1, 16756832, 30, 8, .05), i.audio && i.audio.play && i.audio.play("hound_fire", {
                    pos: v1.clone(),
                    gain: 1,
                    pitch: 1.12,
                    variant: shotN = shotN + 1 & 1,
                    jitter: .03
                });
                let s = i.physics.raycast(v1, v3, t + .3);
                s && s.dist > t - .8 && i.events.emit("impact", {
                    point: s.point,
                    normal: s.normal,
                    dist: s.dist,
                    surface: s.surface,
                    enemy: null,
                    dir: v3.clone(),
                    from: "enemy"
                })
            } catch (n) {
                console.error("[net] remote shot fx threw", n)
            }
        }

        function onNade(e) {
            if (!active || !e.p || !e.v) return;
            try {
                i.extras && i.extras.ghostNade && i.extras.ghostNade(v1.fromArray(e.p), v2.fromArray(e.v))
            } catch (t) {
                console.error("[net] remote grenade threw", t)
            }
        }

        function onHit(e) {
            let t = i.player;
            if (!active || !t.alive || protT > 0) return;
            let n = e.p ? new W().fromArray(e.p) : null;
            curHit = lastHit = {
                by: e.by,
                k: e.k | 0,
                t: now()
            };
            try {
                t.damage(+e.dmg || 0, n)
            } finally {
                curHit = null
            }
        }

        function onKill(e) {
            for (let o of e.sc || []) {
                let r = players.get(o[0]);
                r && (r.k = o[1], r.d = o[2])
            }
            room && Array.isArray(e.ts) && (room.ts = e.ts);
            let t = players.get(e.by),
                n = players.get(e.to),
                s = remotes.get(e.to);
            if (s && (s.alive = !1), active && n) {
                let o = ["", "爆头", "手雷", "近战", ""][e.k] || "";
                try {
                    hud.feed && hud.feed(e.by === e.to || !t ? `<b>${esc(n.name)}</b> 阵亡` : `<b>${esc(t.name)}</b> 击杀 <b>${esc(n.name)}</b>` + (o ? `<em>${o}</em>` : "")), e.by === myId && e.to !== myId && (hud.hitmarker && hud.hitmarker("kill"), hud.message && hud.message("击杀 " + n.name + (o ? " · " + o : ""), 1.8), i.audio && i.audio.play && i.audio.play("objective", {
                        gain: .5,
                        pitch: 1.3
                    }))
                } catch {}
            }
            active && drawTop(!0), boardOn && drawBoard()
        }

        /* ---------------- my own player ---------------- */
        function spawnPts() {
            if (pts) return pts;
            pts = [];
            let e = i.level || {},
                t = (n, s) => {
                    try {
                        if (i.physics.nav && i.physics.nav.isWalkable && !i.physics.nav.isWalkable(n.x, n.z)) return
                    } catch {}
                    for (let o of pts)
                        if (Math.hypot(o.x - n.x, o.z - n.z) < 3) return;
                    pts.push(new W(n.x, s, n.z))
                };
            for (let n of e.enemySpawns || []) n.type === "ground" && n.pos && t(n.pos, Math.max(0, n.pos.y || 0));
            return e.playerStart && e.playerStart.pos && t(e.playerStart.pos, Math.max(0, e.playerStart.pos.y || 0)), pts.length || pts.push(new W(0, 0, 0)), pts.sort((n, s) => n.x - s.x || n.z - s.z), pts
        }

        function pickSpawn(e) {
            let t = spawnPts(),
                n = room && room.opts.mode === "tdm",
                s = players.get(myId) || {
                    team: 0
                },
                o = t;
            if (n) {
                let a = Math.max(3, Math.ceil(t.length * .4));
                o = s.team === 0 ? t.slice(0, a) : t.slice(-a)
            }
            if (e) {
                let a = [...players.values()].filter(u => !n || u.team === s.team).map(u => u.id).sort((u, h) => u - h),
                    l = Math.max(0, a.indexOf(myId)),
                    c = Math.max(1, Math.floor(o.length / Math.max(1, a.length)));
                return o[(l * c + (room && room.seed | 0)) % o.length]
            }
            let r = o.map(a => {
                let l = 1e9;
                for (let c of remotes.values()) c.alive && c.foe && c.buf.length && (l = Math.min(l, Math.hypot(c.pos.x - a.x, c.pos.z - a.z)));
                return {
                    p: a,
                    s: Math.min(l, 40) + Math.min(12, Math.hypot(deathPos.x - a.x, deathPos.z - a.z)) * .5 + Math.random() * 6
                }
            }).sort((a, l) => l.s - a.s);
            return r[Math.floor(Math.random() * Math.min(3, r.length))].p
        }

        function spawnMe(e) {
            let t = pickSpawn(e),
                n = i.player;
            n.reset({
                pos: t,
                yaw: Math.atan2(t.x, t.z)
            });
            try {
                i.weapon.reset(), i.weapon.lower = 0, i.weapon.setVisible(!0)
            } catch {}
            try {
                let s = i.extras.state;
                s.grenades = 2, s.nadePhase = 0, s.nadeCd = 0, s.meleeCd = 0
            } catch {}
            n.invulnerable = !0, protT = 2.5, deadT = -1, killer = "", lastHit = null, ui.respawn.classList.remove("on"), sendState()
        }

        function sendState() {
            let e = i.player,
                t = e.yaw % TAU,
                n = (e.crouching ? 1 : 0) | (e.alive ? 0 : 2) | (protT > 0 ? 4 : 0) | (e.ads > .5 ? 8 : 0) | (e.onGround ? 16 : 0);
            tx({
                t: "s",
                d: [r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), Math.round(t * 1e3) / 1e3, Math.round(e.pitch * 1e3) / 1e3, n, Math.max(0, Math.ceil(e.health))]
            })
        }
        i.events.on("weapon:fire", e => {
            !active || !e || !e.muzzle || !e.end || (protT > 0 && (protT = 0, i.player.invulnerable = !1), tx({
                t: "f",
                o: r3(e.muzzle),
                e: r3(e.end)
            }))
        }), i.events.on("player:dead", () => {
            if (!active) return;
            let e = curHit || (lastHit && now() - lastHit.t < 5 ? lastHit : null),
                t = e ? e.by : myId,
                n = players.get(t);
            tx({
                t: "d",
                by: t,
                k: e ? e.k : 4
            }), sendState(), deadT = 3.2, deathPos.copy(i.player.pos), lastHit = null, killer = t !== myId && n ? n.name : "", respawnKey = "";
            try {
                i.weapon.setVisible(!1)
            } catch {}
            drawRespawn(), ui.respawn.classList.add("on")
        });

        let api = {
            get active() {
                return active
            },
            get id() {
                return myId
            },
            open() {
                inName.value = cfg.name, inServer.value = cfg.server, menus.show("mp"), listT = 4, connect(() => tx({
                    t: "list"
                }))
            },
            quit,
            /** nearest enemy player hit by a ray, or null */
            raycast(e, t, n) {
                let s = null,
                    o = n,
                    r = "body";
                for (let a of remotes.values()) {
                    if (!a.alive || !a.foe || !a.buf.length) continue;
                    let l = a.pos.x,
                        c = a.pos.y,
                        u = a.pos.z,
                        h = a.ck,
                        f = l - e.x,
                        p = c + .9 - e.y,
                        d = u - e.z,
                        v = f * t.x + p * t.y + d * t.z;
                    if (v < -1.3 || v > o + 1.3 || f * f + p * p + d * d - v * v > 1.7) continue;
                    let g = hitSphere(e, t, l, c + 1.62 - .52 * h, u, .17, o),
                        x = hitCapsule(e, t, l, u, c + .3, c + 1.25 - .5 * h, .28, o),
                        y = -1,
                        b = "body";
                    g >= 0 && (x < 0 || g <= x + .12) ? (y = g, b = "head") : x >= 0 && (y = x), y >= 0 && y < o && (o = y, s = a, r = b)
                }
                return s ? {
                    remote: s,
                    id: s.id,
                    part: r,
                    dist: o,
                    point: new W().copy(e).addScaledVector(t, o)
                } : null
            },
            /** apply one of my bullets to the player it hit; returns the impact record playerShot hands back */
            shotHit(e, t, n, s) {
                let o = e.part === "head",
                    r = !!(e.remote.flags & 4);
                r || tx({
                    t: "h",
                    to: e.id,
                    dmg: Math.round(t * (o ? 1.8 : 1)),
                    k: o ? 1 : 0,
                    p: r3(s)
                });
                try {
                    r || hud.hitmarker && hud.hitmarker(o ? "weak" : "hit")
                } catch {}
                let a = {
                    point: e.point,
                    normal: n.clone().negate(),
                    dist: e.dist,
                    surface: "enemy",
                    enemy: e.remote,
                    part: o ? "weak" : "body",
                    dir: n,
                    from: "player",
                    killed: !1
                };
                return i.events.emit("impact", a), a
            },
            explode(e, t, n) {
                let s = 0;
                for (let o of remotes.values()) {
                    if (!o.alive || !o.foe || !o.buf.length || o.flags & 4) continue;
                    v1.set(o.pos.x, o.pos.y + 1 - .4 * o.ck, o.pos.z);
                    let r = v1.distanceTo(e);
                    if (r >= t) continue;
                    let a = !0;
                    try {
                        a = i.physics.lineOfSight(e, v1)
                    } catch {}
                    if (!a) continue;
                    let l = Math.round(n * .6 * (1 - r / t));
                    l > 0 && (s++, tx({
                        t: "h",
                        to: o.id,
                        dmg: l,
                        k: 2,
                        p: r3(e)
                    }))
                }
                if (s) try {
                    hud.hitmarker && hud.hitmarker("hit")
                } catch {}
            },
            melee(e) {
                let t = null,
                    n = 1e9;
                for (let s of remotes.values()) {
                    if (!s.alive || !s.foe || !s.buf.length) continue;
                    v1.set(s.pos.x, s.pos.y + 1.1 - .4 * s.ck, s.pos.z).sub(e.eye);
                    let o = v1.length();
                    o > jmTune.meleeRange + .2 || o > .9 && v1.dot(e.forward) / o < jmTune.meleeCone || o < n && (n = o, t = s)
                }
                if (!t) return !1;
                v2.set(t.pos.x, t.pos.y + 1.1 - .4 * t.ck, t.pos.z), t.flags & 4 || tx({
                    t: "h",
                    to: t.id,
                    dmg: 60,
                    k: 3,
                    p: r3(e.eye)
                });
                try {
                    hud.hitmarker && hud.hitmarker("hit"), e.addShake(.2), i.fx && i.fx.sparks && i.fx.sparks(v2, v4.copy(e.forward).negate(), 8)
                } catch {}
                return !0
            },
            nade(e, t) {
                tx({
                    t: "n",
                    p: r3(e),
                    v: r3(t)
                })
            },
            update(e) {
                let t = now();
                if (wsOpen && (pingT -= e, pingT <= 0 && (pingT = 2, tx({
                        t: "ping",
                        c: t
                    })), !active && !room && menus.screen === "mp" && (listT -= e, listT <= 0 && (listT = 4, tx({
                        t: "list"
                    })))), !active) return;
                let n = i.player,
                    s = i.camera;
                protT > 0 && (protT -= e, protT <= 0 && (protT = 0, n.invulnerable = !1));
                deadT >= 0 && (deadT -= e, deadT <= 0 ? spawnMe(!1) : drawRespawn());
                sendT += e, sendT >= .05 && (sendT = Math.min(sendT - .05, .05), sendState());
                s.updateMatrixWorld(), s.matrixWorldInverse.copy(s.matrixWorld).invert();
                for (let o of remotes.values()) stepRemote(o, e, t, s);
                hudT -= e, hudT <= 0 && (hudT = .25, drawTop(!1))
            },
            debug: {
                remotes,
                players,
                cfg,
                tx,
                get room() {
                    return room
                },
                get open() {
                    return wsOpen
                },
                get ping() {
                    return ping
                },
                spawnPts
            }
        };
        return api
    }

    function jmNetSafe(i) {
        try {
            return jmNet(i)
        } catch (e) {
            return console.error("[boot] net failed: " + (e && e.stack || e)), null
        }
    }
