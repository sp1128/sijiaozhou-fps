// One-shot patch: wires the multiplayer module (net.js) into bundle.pretty.js. Already applied — kept as history.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, 'bundle.pretty.js');
let src = fs.readFileSync(file, 'utf8');
if (src.includes('jmNetSafe')) { console.log('already applied'); process.exit(0); }
fs.writeFileSync(path.join(__dirname, 'bundle.pretty.pre-mp.js'), src);
const ws = s => s.replace(/\s+/g, ' ').trim();
/** whitespace-insensitive single replacement: every run of whitespace in `a` matches any run in the source */
function rep(a, b, label) {
  const re = new RegExp(ws(a).split(' ').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');
  const m = src.match(re);
  if (!m || m.length !== 1) throw new Error(`[${label}] expected 1 match, got ${m ? m.length : 0}`);
  src = src.replace(re, () => b);
}
// ---- boot + main loop
rep('t.extras = jmExtrasSafe(t), t.game = mM(t)', 't.extras = jmExtrasSafe(t), t.game = mM(t), t.net = jmNetSafe(t)', 'boot');
rep('d = t.game.update(p) !== !1 && t.game.state !== "title" && t.game.state !== "paused"',
    'd = t.game.update(p) !== !1 && t.game.state !== "title" && t.game.state !== "paused" || t.game.state === "paused" && !!(t.net && t.net.active)', 'loop-d');
rep('u("enemies", jmWd), u("extras", p));', 'u("enemies", jmWd), u("extras", p));\n            u("net", p);', 'loop-net');
rep('t.game.state !== "paused" && (u("fx", jmWd)', '(t.game.state !== "paused" || t.net && t.net.active) && (u("fx", jmWd)', 'loop-fx');
// ---- title menu button
rep('<button class="btn" data-act="survival">生存模式</button>', '<button class="btn" data-act="survival">生存模式</button>\n          <button class="btn" data-act="mp">多人对战</button>', 'menu-btn');
// ---- game flow
rep('menu() { jmToTitle() },', `menu() {
                    jmMode === "mp" && i.net ? i.net.quit() : jmToTitle()
                },
                mp() {
                    i.net ? i.net.open() : l.show("title")
                },`, 'cb-menu');
rep('update: B, debugCut() {', `update: B,
                mpStart() {
                    jmMode = "mp", a(i.audio, "resume");
                    try {
                        navigator.userActivation && navigator.userActivation.isActive && r.requestLock()
                    } catch {}
                    U({
                        skipIntro: !0
                    })
                },
                toTitle() {
                    jmToTitle(), jmMode = "story"
                },
                debugCut() {`, 'api');
rep('jmMode === "survival" && (c.relays = []), c.mode = jmMode', 'jmMode !== "story" && (c.relays = []), c.mode = jmMode', 'reset-relays');
rep('o.setRelays && o.setRelays(0, c.relays.length), jmMode === "survival" || ie()', 'o.setRelays && o.setRelays(0, c.relays.length), jmMode !== "story" || ie()', 'reset-patrol');
rep('if (c.mode === "survival") return c.waveState === "fight"', 'if (c.mode === "mp") return "";\n            if (c.mode === "survival") return c.waveState === "fight"', 'objective');
rep('if (c.mode === "survival") { o.setPrompt && o.setPrompt(null); return }', `if (c.mode !== "story") {
                o.setPrompt && o.setPrompt(null);
                return
            }`, 'interact');
rep('if (_.state !== "playing" && _.state !== "paused") return; let jmR = a(i.extras, "finish"',
    'if (_.state !== "playing" && _.state !== "paused" || c.mode === "mp") return;\n            let jmR = a(i.extras, "finish"', 'dead');
rep('r.exitLock(), a(i.audio, "setPaused", !0), l.setLookMode(', 'r.exitLock(), c.mode === "mp" || a(i.audio, "setPaused", !0), l.setLookMode(', 'pause-audio');
rep('_.state !== "title" || l.panelOpen || P.code !== "Enter"', '_.state !== "title" || l.screen !== "title" || l.panelOpen || P.code !== "Enter"', 'enter-guard');
rep('!c.lowSaid && n.alive && n.health < 30 && (', '!c.lowSaid && c.mode !== "mp" && n.alive && n.health < 30 && (', 'low-radio');
// ---- combat
rep('c = i.enemies.raycast(n, s, l ? l.dist : r); if (!c && jmA > 0) try {', `c = i.enemies.raycast(n, s, l ? l.dist : r);
                if (i.net && i.net.active) {
                    let jmP = i.net.raycast(n, s, c ? c.dist : l ? l.dist : r);
                    if (jmP) return e.hits++, i.net.shotHit(jmP, o, s, n)
                }
                if (!c && jmA > 0) try {`, 'shot');
rep('explode(n, s = 5, o = 80, r = "player") { for (let l of i.enemies.list) {', `explode(n, s = 5, o = 80, r = "player") {
                if (r === "player" && i.net && i.net.active) try {
                    i.net.explode(n, s, o)
                } catch (jmE) {
                    console.error("[combat] net explode threw", jmE)
                }
                for (let l of i.enemies.list) {`, 'explode');
rep('i.events.emit("weapon:fire", { origin: Ie, dir: ze, muzzle: We, ads: k.adsE });', `i.events.emit("weapon:fire", {
                origin: Ie,
                dir: ze,
                muzzle: We,
                end: Ne,
                ads: k.adsE
            });`, 'fire-event');
// ---- extras
rep('}), !t) return; v2.copy(t.pos), t.type === "hound" && (v2.y += .6), v3.copy(e.forward)', `}), !t) {
                try {
                    i.net && i.net.active && i.net.melee(e)
                } catch {}
                return
            }
            v2.copy(t.pos), t.type === "hound" && (v2.y += .6), v3.copy(e.forward)`, 'melee');
rep('for (let o = 0; o < 4; o++) { let r = new Qe(e, n), a = new Qe(t, s);', 'for (let o = 0; o < 10; o++) {\n                let r = new Qe(e, n),\n                    a = new Qe(t, s);', 'nade-pool');
rep('st.nadeCd = jmTune.nadeCd, st.grenades--, t.on = !0, t.t = 0, t.fuse = jmTune.nadeFuse, nadeLaunch(t.pos, t.vel);',
    'st.nadeCd = jmTune.nadeCd, st.grenades--, t.on = !0, t.ghost = !1, t.t = 0, t.fuse = jmTune.nadeFuse, nadeLaunch(t.pos, t.vel);\n            try {\n                i.net && i.net.active && i.net.nade(t.pos, t.vel)\n            } catch {}', 'nade-send');
rep('e.on = !1, e.mesh.position.set(0, -200, 0), v4.copy(e.pos), st.src = "grenade", st.multi = 0;',
    `e.on = !1, e.mesh.position.set(0, -200, 0), v4.copy(e.pos);
            if (e.ghost) {
                // thrown by another player: effects only, the thrower's client decides the damage
                try {
                    i.fx.explosion(v4, 1.3)
                } catch {}
                return
            }
            st.src = "grenade", st.multi = 0;`, 'nade-ghost');
rep('st.mode = e === "survival" ? "survival" : "story", st.score = 0,', 'st.mode = e === "survival" || e === "mp" ? e : "story", st.score = 0,', 'extras-mode');
rep('root.classList.toggle("jm-survival", st.mode === "survival")', 'root.classList.toggle("jm-survival", st.mode !== "story")', 'extras-class');
rep('resupply(e = 1) {', `ghostNade(e, t) {
                let n = nades.find(s => !s.on);
                n && (n.on = !0, n.ghost = !0, n.t = 0, n.fuse = jmTune.nadeFuse, n.pos.copy(e), n.vel.copy(t))
            },
            resupply(e = 1) {`, 'extras-ghost-api');
rep('n.pressed("alt") && tryFocus()', 'n.pressed("alt") && st.mode !== "mp" && tryFocus()', 'focus-off');
rep('function jmExtrasSafe(i) {', '/*@jm-net*/\n\n    function jmExtrasSafe(i) {', 'marker');
fs.writeFileSync(file, src);
console.log('patched ok');
