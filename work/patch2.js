// Applies the V2 gameplay patches to bundle.pretty.js (run once; every anchor must match exactly once).
const fs = require('fs');
const p = __dirname + '/bundle.pretty.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('function jmExtras(')) { console.error('already patched'); process.exit(1); }
let fails = 0;
function rep(a, b, label) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error('FAIL', label, 'matches=' + n); fails++; return; }
  s = s.replace(a, () => b);
  console.log('ok  ', label);
}

/* ---------- input: new actions ---------- */
rep(`            KeyQ: "alt",`, `            KeyQ: "alt",
            KeyG: "grenade",`, 'key map');
rep(`<button class="t-btn t-pause" data-a="pause" aria-label="暂停"><span>暂停</span></button>'`,
  `<button class="t-btn t-pause" data-a="pause" aria-label="暂停"><span>暂停</span></button><button class="t-btn t-nade" data-a="grenade" aria-label="手雷"><span>手雷</span></button><button class="t-btn t-melee" data-a="melee" aria-label="近战"><span>近战</span></button><button class="t-btn t-focus" data-a="alt" aria-label="专注"><span>专注</span></button>'`, 'touch html');
rep(`                        pause: V(".t-pause")
                    }`, `                        pause: V(".t-pause"),
                        grenade: V(".t-nade"),
                        melee: V(".t-melee"),
                        alt: V(".t-focus")
                    }`, 'touch btn map');
rep(`                3: "interact",
                5: "melee",`, `                3: "interact",
                4: "grenade",
                12: "alt",
                5: "melee",`, 'gamepad map');

/* ---------- main loop: time scale + extras update ---------- */
rep(`            i.dt && (p = +i.dt), t.time.dt = p, t.time.t += p, t.time.real = h / 1e3, t.time.frame++, u("input", p);`,
  `            i.dt && (p = +i.dt);
            let jmPl = t.playerScale > 0 ? t.playerScale : 1,
                jmWd = p * (t.timeScale > 0 ? t.timeScale : 1);
            t.time.dt = jmWd, t.time.t += jmWd, t.time.real = h / 1e3, t.time.frame++, u("input", p);`, 'loop dt');
rep(`            } else d && (u("player", p), u("weapon", p), u("enemies", p));`,
  `            } else d && (u("player", p * jmPl), u("weapon", p * jmPl), u("enemies", jmWd), u("extras", p));`, 'loop updates');
rep(`            t.game.state !== "paused" && (u("fx", p), u("ground", p), u("level", p), u("backdrop", p), u("mats", p)), u("audio", p), u("hud", p),`,
  `            t.game.state !== "paused" && (u("fx", jmWd), u("ground", jmWd), u("level", jmWd), u("backdrop", jmWd), u("mats", jmWd)), u("audio", p), u("hud", p),`, 'loop world');
rep(`await r("hud", "hud", () => hM(t)), t.game = mM(t)`,
  `await r("hud", "hud", () => hM(t)), t.extras = jmExtrasSafe(t), t.game = mM(t)`, 'boot extras');

/* ---------- extras module ---------- */
const extras = fs.readFileSync(__dirname + '/extras.js', 'utf8');
rep(`    var gM = {
        mats: qg,`, extras + `
    function jmExtrasSafe(i) {
        try {
            return jmExtras(i)
        } catch (e) {
            return console.error("[boot] extras failed: " + (e && e.stack || e)), null
        }
    }
    var gM = {
        mats: qg,`, 'extras module');

/* ---------- game flow ---------- */
rep(`            r = i.input,
            a = (P, V, ...Y) => {
                try {
                    if (P && typeof P[V] == "function") return P[V](...Y)`,
  `            r = i.input,
            jmMode = "story",
            a = (P, V, ...Y) => {
                try {
                    if (P && typeof P[V] == "function") return P[V](...Y)`, 'jmMode');
rep(`                deploy() {
                    a(i.audio, "resume"), r.requestLock(), U({})
                },`, `                deploy() {
                    jmMode = "story", a(i.audio, "resume"), r.requestLock(), U({})
                },
                survival() {
                    jmMode = "survival", a(i.audio, "resume"), r.requestLock(), U({})
                },
                menu() {
                    jmToTitle()
                },`, 'menu callbacks');
rep(`                intensity: .15,
                used: new Map
            },`, `                intensity: .15,
                used: new Map,
                mode: "story",
                wave: 0,
                waveState: "rest",
                waveT: 0,
                waveAt: 0
            },`, 'run state');
rep(`            }), n.reset(s.playerStart), o.reset && o.reset(), e.saturation = t, e.flash = 0, q(), o.setRelays && o.setRelays(0, c.relays.length), ie()
        }`, `            }), jmMode === "survival" && (c.relays = []), c.mode = jmMode, c.wave = 0, c.waveState = "rest", c.waveT = 4.5, c.waveAt = 0, n.reset(s.playerStart), o.reset && o.reset(), a(i.extras, "reset", jmMode), e.saturation = t, e.flash = 0, q(), o.setRelays && o.setRelays(0, c.relays.length), jmMode === "survival" || ie()
        }

        function jmToTitle() {
            r.setGameplay && r.setGameplay(!1), r.exitLock(), a(i.audio, "setPaused", !1), a(i.audio, "setIntensity", .15), a(i.enemies, "clear"), a(i.fx, "clear"), a(i.extras, "reset", jmMode), n.reset(s.playerStart), n.enabled = !1, o.setPrompt && o.setPrompt(null), o.show(!1), o.clearRadio && o.clearRadio(), a(i.weapon, "setVisible", !1), e.saturation = t, e.fade = 1, e.flash = 0, E.t = 0, g = !1, l.locationCard(!1), M("title"), l.show("title")
        }

        function jmMaxAlive() {
            return c.mode === "survival" ? Math.min(11, 7 + c.wave) : Yi.maxAlive
        }

        function jmStartWave() {
            c.wave++, c.waveState = "fight", c.waveAt = c.time;
            let P = c.wave,
                V = Math.min(10, 2 + Math.round(P * .8)),
                Y = Math.min(7, Math.round(.5 + P * .6)),
                L = Math.min(2.2, 1 + Math.max(0, P - 3) * .12),
                Z = [];
            for (let R = 0; R < V; R++) Z.push("gull");
            for (let R = 0; R < Y; R++) Z.splice(Math.min(Z.length, 1 + R * 2), 0, "hound");
            let J = 0,
                oe = 0;
            Z.forEach((R, I) => {
                let se = Q(R),
                    ae = P >= 4 && I % 4 === 3;
                J += se.x - n.pos.x, oe += se.z - n.pos.z, c.queue.push({
                    type: R,
                    pos: se,
                    at: c.time + 1.2 + I * Math.max(.45, Yi.spawnStagger - P * .03),
                    hp: L * (ae ? 1.7 : 1),
                    elite: ae
                })
            }), c.waveHot = 30;
            let fe = (Math.atan2(J, -oe) * 180 / Math.PI + 360) % 360;
            o.warn && o.warn("第 " + P + " 波 · 敌袭 · " + jC[Math.round(fe / 45) % 8], 3.4), o.setObjective(D()), P === 1 ? o.radio && o.radio(jmTxt.first, 3.4) : P === 4 ? o.radio && o.radio(jmTxt.elite, 3.6) : P % 5 === 0 && o.radio && o.radio(jmTxt.deep, 3.4)
        }

        function jmSurvive(P) {
            if (c.mode !== "survival") return;
            if (c.waveState === "rest") {
                c.waveT -= P, c.waveT <= 0 && jmStartWave();
                return
            }
            if (!c.queue.length && ne() === 0 && c.time > c.waveAt + 2.5) {
                let V = 250 * c.wave;
                a(i.extras, "addScore", V), a(i.extras, "resupply", 1), c.waveState = "rest", c.waveT = 7, c.waveHot = 0, o.message("第 " + c.wave + " 波已清除 · 奖励 +" + V + " · 补给已送达", 3.8), a(i.audio, "play", "objective", {
                    gain: .8
                }), o.setObjective(D())
            }
        }`, 'reset + survival fns');
rep(`        function D() {
            if (c.allCut) return "前往撤离艇";`, `        function D() {
            if (c.mode === "survival") return c.waveState === "fight" ? "第 " + c.wave + " 波 · 歼灭全部机械守卫" : c.wave ? "第 " + c.wave + " 波已清除 · 准备迎击下一波" : "生存模式 · 守住四号泊位";
            if (c.allCut) return "前往撤离艇";`, 'objective text');
rep(`                if (V >= Yi.maxAlive) {
                    L.at = c.time + 1;
                    continue
                }
                if (!K(L.type, L.pos, {
                        state: "alert",
                        target: n.pos
                    }) && !i.enemies.stub && (L.tries = (L.tries || 0) + 1) < 6) {
                    L.at = c.time + 1.5;
                    continue
                }`, `                if (V >= jmMaxAlive()) {
                    L.at = c.time + 1;
                    continue
                }
                let jmE = K(L.type, L.pos, {
                    state: "alert",
                    target: n.pos
                });
                if (!jmE && !i.enemies.stub && (L.tries = (L.tries || 0) + 1) < 6) {
                    L.at = c.time + 1.5;
                    continue
                }
                jmE && (jmE.jmElite = !!L.elite, L.hp > 1 && (jmE.hp *= L.hp));`, 'spawn queue');
rep(`        function ue(P) {
            let V = n.alive ? $() : null;`, `        function ue(P) {
            if (c.mode === "survival") {
                o.setPrompt && o.setPrompt(null);
                return
            }
            let V = n.alive ? $() : null;`, 'no relays in survival');
rep(`            }), o.setRelays && o.setRelays(c.cut, V), o.setPrompt && o.setPrompt(null), n.addShake(.18), F(c.cut - 1),`,
  `            }), a(i.extras, "addScore", 500), o.setRelays && o.setRelays(c.cut, V), o.setPrompt && o.setPrompt(null), n.addShake(.18), F(c.cut - 1),`, 'relay score');
rep(`            _.state !== "playing" && _.state !== "paused" || (r.setGameplay && r.setGameplay(!1), r.exitLock(), o.setPrompt && o.setPrompt(null), o.show(!1), o.clearRadio && o.clearRadio(), l.setDead({
                time: c.time,
                relays: c.cut,
                total: c.relays.length
            }), M("dead"))`, `            if (_.state !== "playing" && _.state !== "paused") return;
            let jmR = a(i.extras, "finish", c.mode === "survival" ? "survival" : "dead", {
                wave: c.wave
            }) || {};
            r.setGameplay && r.setGameplay(!1), r.exitLock(), o.setPrompt && o.setPrompt(null), o.show(!1), o.clearRadio && o.clearRadio(), l.setDead({
                time: c.time,
                relays: c.cut,
                total: c.relays.length,
                mode: c.mode,
                wave: c.wave,
                score: jmR.score,
                best: jmR.best,
                bestWave: jmR.bestWave,
                isBest: jmR.isBest
            }), M("dead")`, 'dead stats');
rep(`                L = ["险象环生", "火力全开", "稳扎稳打", "干净利落", "精准果断", "完美突击"][Y];
            l.setDebrief({
                time: c.time,
                accuracy: V,
                kills: P.kills || 0,
                retries: c.retries,
                rating: L
            }), M("complete")`, `                L = ["险象环生", "火力全开", "稳扎稳打", "干净利落", "精准果断", "完美突击"][Y],
                jmR = a(i.extras, "finish", "story", {
                    time: c.time,
                    retries: c.retries
                }) || {};
            l.setDebrief({
                time: c.time,
                accuracy: V,
                kills: P.kills || 0,
                retries: c.retries,
                rating: L,
                score: jmR.score,
                best: jmR.best,
                isBest: jmR.isBest
            }), M("complete")`, 'debrief score');
rep(`!p && u > 1.3 && (p = !0, o.radio && o.radio(_l.intro, 4.2))`, `!p && u > 1.3 && (p = !0, o.radio && o.radio(c.mode === "survival" ? jmTxt.intro : _l.intro, 4.2))`, 'intro radio');
rep(`                    X(P), c.alertT = Math.max(0, c.alertT - P), c.waveHot = Math.max(0, c.waveHot - P);`,
  `                    X(P), jmSurvive(P), c.alertT = Math.max(0, c.alertT - P), c.waveHot = Math.max(0, c.waveHot - P);`, 'survive tick');
rep(`            _.state !== "title" || l.panelOpen || P.code !== "Enter" && P.code !== "NumpadEnter" || P.target && P.target.tagName === "BUTTON" || (a(i.audio, "resume"), r.requestLock(), U({}))`,
  `            _.state !== "title" || l.panelOpen || P.code !== "Enter" && P.code !== "NumpadEnter" || P.target && P.target.tagName === "BUTTON" || (jmMode = "story", a(i.audio, "resume"), r.requestLock(), U({}))`, 'enter = story');
rep(`        jC = ["北方", "东北方", "东方", "东南方", "南方", "西南方", "西方", "西北方"],`, `        jC = ["北方", "东北方", "东方", "东南方", "南方", "西南方", "西方", "西北方"],
        jmTxt = {
            intro: "几猫队员，港区主控已全面激活，撤离艇暂时无法靠岸。守住四号泊位，能撑多久撑多久。",
            first: "第一波机械守卫已出动。善用手雷和专注，击毁它们会掉落补给。",
            elite: "侦测到强化型号，装甲更厚。集中火力，优先打弱点。",
            deep: "你已经打出了纪录级的战绩。港区主控正在投入全部兵力。"
        },`, 'survival text');

/* ---------- menus ---------- */
rep(`          <button class="btn primary" data-act="deploy">开始行动</button>
          <button class="btn" data-act="settings">设置</button>`, `          <button class="btn primary" data-act="deploy">开始行动</button>
          <button class="btn" data-act="survival">生存模式</button>
          <button class="btn" data-act="settings">设置</button>`, 'title survival btn');
rep(`<span><kbd>R</kbd> 换弹</span></div>
        <div><span><kbd>E</kbd> 切断中继</span>`, `<span><kbd>R</kbd> 换弹</span></div>
        <div><span><kbd>G</kbd> 手雷</span><span><kbd>F</kbd> 近战</span><span><kbd>Q</kbd> 专注 · 子弹时间</span></div>
        <div><span><kbd>E</kbd> 切断中继</span>`, 'legend');
rep(`<span>屏幕按钮：开火 · 瞄准 · 换弹 · 跳跃</span>`, `<span>屏幕按钮：开火 · 瞄准 · 换弹 · 跳跃 · 手雷 · 近战 · 专注</span>`, 'legend touch');
rep(`        <button class="btn" data-act="restart">重新开始任务</button>
      </div>`, `        <button class="btn" data-act="restart">重新开始任务</button>
        <button class="btn" data-act="menu">返回主菜单</button>
      </div>`, 'pause menu btn');
rep(`<dl class="m-stats"><div><dt>生存时间</dt><dd data-f="dead-time">00:00</dd></div><div><dt>已切断中继</dt><dd data-f="dead-relays">0/3</dd></div></dl>
      <div class="m-actions col"><button class="btn primary" data-act="retry">重试</button></div>`,
  `<dl class="m-stats"><div><dt>生存时间</dt><dd data-f="dead-time">00:00</dd></div><div><dt data-f="dead-k2">已切断中继</dt><dd data-f="dead-relays">0/3</dd></div><div><dt>得分</dt><dd data-f="dead-score">0</dd></div><div data-f="dead-best-row"><dt>最高纪录</dt><dd data-f="dead-best">0</dd></div></dl>
      <div class="m-actions col"><button class="btn primary" data-act="retry">重试</button><button class="btn" data-act="menu">返回主菜单</button></div>`, 'dead screen');
rep(`        <div><dt>重试次数</dt><dd data-f="retries">0</dd></div>
      </dl>
      <div class="m-actions col"><button class="btn primary" data-act="redeploy">再次出击</button></div>`,
  `        <div><dt>重试次数</dt><dd data-f="retries">0</dd></div>
        <div><dt>行动得分</dt><dd data-f="score">0</dd></div>
        <div><dt>最高纪录</dt><dd data-f="best">0</dd></div>
      </dl>
      <div class="m-actions col"><button class="btn primary" data-act="redeploy">再次出击</button><button class="btn" data-act="menu">返回主菜单</button></div>`, 'debrief screen');
rep(`                setDead({
                    time: U,
                    relays: T,
                    total: D
                }) {
                    c("dead-time").textContent = O(U), c("dead-relays").textContent = \`\${T}/\${D}\`
                },`, `                setDead({
                    time: U,
                    relays: T,
                    total: D,
                    mode: C,
                    wave: G,
                    score: j,
                    best: N,
                    bestWave: Q,
                    isBest: K
                }) {
                    let ie = C === "survival";
                    c("dead-time").textContent = O(U), c("dead-k2").textContent = ie ? "坚持波次" : "已切断中继", c("dead-relays").textContent = ie ? \`第 \${G|0} 波\` : \`\${T}/\${D}\`, c("dead-score").textContent = String(j | 0), c("dead-best-row").hidden = !ie, c("dead-best").textContent = \`\${N|0} 分 · 第 \${Q|0} 波\` + (K ? " · 新纪录" : "")
                },`, 'setDead');
rep(`                    retries: C,
                    rating: G
                }) {
                    c("time").textContent = O(U), c("acc").textContent = T == null ? "\\u2014" : Math.round(T * 100) + "%", c("kills").textContent = String(D), c("retries").textContent = String(C), c("rating").textContent = G
                },`, `                    retries: C,
                    rating: G,
                    score: j,
                    best: N,
                    isBest: Q
                }) {
                    c("time").textContent = O(U), c("acc").textContent = T == null ? "\\u2014" : Math.round(T * 100) + "%", c("kills").textContent = String(D), c("retries").textContent = String(C), c("rating").textContent = G, c("score").textContent = String(j | 0), c("best").textContent = String(N | 0) + (Q ? " · 新纪录" : "")
                },`, 'setDebrief');
rep(`    <div><dt>近战</dt><dd><kbd>F</kbd></dd></div>`, `    <div><dt>近战</dt><dd><kbd>F</kbd> 或鼠标中键</dd></div>
    <div><dt>手雷</dt><dd><kbd>G</kbd></dd></div>
    <div><dt>专注 · 子弹时间</dt><dd><kbd>Q</kbd>（击毁敌人充能）</dd></div>`, 'help keys');
rep(`    <div><dt>冲刺</dt><dd>将摇杆推到最前方</dd></div>`, `    <div><dt>冲刺</dt><dd>将摇杆推到最前方</dd></div>
    <div><dt>手雷 · 近战 · 专注</dt><dd>右侧对应按钮</dd></div>`, 'help touch');
rep(`RT 开火 · LT 瞄准 · A 跳跃 · B 蹲伏 · X 换弹 · Y 切断中继 · L3 冲刺 · Start 暂停。`, `RT 开火 · LT 瞄准 · A 跳跃 · B 蹲伏 · X 换弹 · Y 切断中继 · LB 手雷 · RB 近战 · 十字键上 专注 · L3 冲刺 · Start 暂停。`, 'help pad');

if (fails) { console.error(fails + ' patch(es) failed; file not written'); process.exit(1); }
fs.writeFileSync(p, s);
console.log('patched');
