    /* =====================================================================================================
       V2 extras — melee · grenades · focus (bullet time) · supply drops · score / combo · records.
       Lives beside the game-flow module; it only talks to the public module APIs (events, player, enemies, fx).
       ===================================================================================================== */
    var jmBestKey = "saltline.best.v2",
        jmTune = {
            meleeRange: 2.7,
            meleeCone: .5,
            meleeDamage: 95,
            meleeCd: .55,
            nadeMax: 4,
            nadeStart: 3,
            nadeSpeed: 13.5,
            nadeLift: 2.4,
            nadeFuse: 1.7,
            nadeRadius: 7.5,
            nadeDamage: 230,
            nadeCd: .9,
            nadeGravity: 17,
            focusSecs: 5,
            focusWorld: .35,
            focusPlayer: .85,
            focusRegen: 1.3,
            focusPerKill: 22,
            comboSecs: 4.5,
            comboMax: 5,
            dropChance: .5,
            pickupTtl: 40,
            pickupRadius: 1.45,
            ammoGain: 30,
            medGain: 40
        };

    function jmLoadBest() {
        let i = {
            story: 0,
            survival: 0,
            wave: 0
        };
        try {
            let e = JSON.parse(localStorage.getItem(jmBestKey) || "null");
            e && typeof e == "object" && (i.story = Math.max(0, +e.story || 0), i.survival = Math.max(0, +e.survival || 0), i.wave = Math.max(0, +e.wave || 0))
        } catch {}
        return i
    }

    function jmExtras(i) {
        let hud = i.hud || {},
            root = hud.root || null,
            best = jmLoadBest(),
            basePost = i.render && i.render.post || {},
            baseSat = typeof basePost.saturation == "number" ? basePost.saturation : 1,
            v1 = new W,
            v2 = new W,
            v3 = new W,
            v4 = new W,
            st = {
                mode: "story",
                score: 0,
                kills: 0,
                combo: 0,
                comboT: 0,
                bestCombo: 0,
                grenades: jmTune.nadeStart,
                focus: 100,
                focusOn: 0,
                focusK: 0,
                meleeCd: 0,
                nadeCd: 0,
                src: "",
                multi: 0,
                hinted: !1
            },
            say = (e, t) => {
                try {
                    hud.message && hud.message(e, t)
                } catch {}
            },
            feed = e => {
                try {
                    hud.feed && hud.feed(e)
                } catch {}
            },
            sfx = (e, t) => {
                try {
                    i.audio && i.audio.play && i.audio.play(e, t)
                } catch {}
            };
        i.timeScale = 1, i.playerScale = 1;

        /* ---------------- HUD ---------------- */
        let ui = null;
        if (root) {
            let e = li("div", "h-score", '<div class="h-k">得分</div><b class="h-score-n">0</b><div class="h-combo"><span></span><i><u></u></i></div>'),
                t = li("div", "h-gear", '<div class="h-g h-g-nade"><kbd>G</kbd><span>手雷</span><b>0</b></div><div class="h-g h-g-focus"><kbd>Q</kbd><span>专注</span><i><u></u></i></div>'),
                n = li("div", "h-slash");
            root.append(e, t, n), ui = {
                score: e,
                scoreN: e.querySelector(".h-score-n"),
                combo: e.querySelector(".h-combo"),
                comboN: e.querySelector(".h-combo span"),
                comboBar: e.querySelector(".h-combo u"),
                nade: t.querySelector(".h-g-nade"),
                nadeN: t.querySelector(".h-g-nade b"),
                focus: t.querySelector(".h-g-focus"),
                focusBar: t.querySelector(".h-g-focus u"),
                slash: n,
                last: {
                    score: -1,
                    combo: -1,
                    comboW: -1,
                    nade: -1,
                    focusW: -1,
                    focusState: ""
                },
                shown: 0
            }
        }

        function drawHud(e) {
            if (!ui) return;
            let t = ui.last;
            if (ui.shown !== st.score) {
                let n = st.score - ui.shown;
                ui.shown = Math.abs(n) < 2 ? st.score : ui.shown + n * Math.min(1, e * 9)
            }
            let n = Math.round(ui.shown);
            n !== t.score && (t.score = n, ui.scoreN.textContent = String(n));
            let s = st.comboT > 0 && st.combo > 1 ? Math.min(jmTune.comboMax, st.combo) : 0;
            s !== t.combo && (t.combo = s, ui.comboN.textContent = s ? "\xD7" + s + " 连杀" : "", ui.combo.classList.toggle("on", !!s));
            let o = s ? Math.round(st.comboT / jmTune.comboSecs * 40) : 0;
            o !== t.comboW && (t.comboW = o, ui.comboBar.style.transform = `scaleX(${(o/40).toFixed(3)})`);
            st.grenades !== t.nade && (t.nade = st.grenades, ui.nadeN.textContent = String(st.grenades), ui.nade.classList.toggle("empty", st.grenades <= 0));
            let r = Math.round(st.focus / 100 * 50);
            r !== t.focusW && (t.focusW = r, ui.focusBar.style.transform = `scaleX(${(r/50).toFixed(3)})`);
            let a = st.focusOn > 0 ? "active" : st.focus >= 100 ? "ready" : "";
            a !== t.focusState && (t.focusState = a, ui.focus.classList.toggle("active", a === "active"), ui.focus.classList.toggle("ready", a === "ready"), root.classList.toggle("jm-focus", a === "active"))
        }

        function bump() {
            if (ui) try {
                ui.scoreN.animate([{
                    transform: "scale(1.22)",
                    color: "#ffc977"
                }, {
                    transform: "scale(1)"
                }], {
                    duration: 260,
                    easing: "ease-out"
                })
            } catch {}
        }

        function addScore(e) {
            e = Math.round(e), e > 0 && (st.score += e, bump())
        }

        /* ---------------- melee ---------------- */
        function melee() {
            let e = i.player;
            st.meleeCd = jmTune.meleeCd;
            let t = null,
                n = 1e9;
            for (let s of i.enemies.list) {
                if (!s || !s.alive) continue;
                v1.copy(s.pos), s.type === "hound" && (v1.y += .6), v1.sub(e.eye);
                let o = v1.length();
                if (o > jmTune.meleeRange + (s.type === "hound" ? .3 : 0)) continue;
                o > .9 && v1.dot(e.forward) / o < jmTune.meleeCone || o < n && (n = o, t = s)
            }
            try {
                e.addRecoil(-.03, (Math.random() - .5) * .06), e.addShake(.1)
            } catch {}
            if (ui) try {
                ui.slash.animate([{
                    opacity: 0,
                    transform: "translate(-50%,-50%) rotate(-24deg) scaleX(.2)"
                }, {
                    opacity: .9,
                    transform: "translate(-50%,-50%) rotate(-24deg) scaleX(1)",
                    offset: .3
                }, {
                    opacity: 0,
                    transform: "translate(-46%,-44%) rotate(-24deg) scaleX(1.25)"
                }], {
                    duration: 190,
                    easing: "ease-out"
                })
            } catch {}
            if (sfx("whiz", {
                    gain: .45,
                    pitch: .62,
                    jitter: .08
                }), !t) return;
            v2.copy(t.pos), t.type === "hound" && (v2.y += .6), v3.copy(e.forward), v3.y *= .3, v3.normalize();
            let s = !1;
            st.src = "melee";
            try {
                s = t.damage(jmTune.meleeDamage, v2, v3, "body") === !0
            } catch (o) {
                console.error("[extras] melee damage threw", o)
            } finally {
                st.src = ""
            }
            i.events.emit("impact", {
                point: v2.clone(),
                normal: v3.clone().negate(),
                dist: n,
                surface: "enemy",
                enemy: t,
                part: "body",
                dir: v3.clone(),
                from: "player",
                killed: s
            }), i.events.emit("player:hitEnemy", {
                enemy: t,
                part: "body",
                killed: s,
                weak: !1
            });
            try {
                e.addShake(.2), i.fx && i.fx.sparks && i.fx.sparks(v2, v4.copy(v3).negate(), 10)
            } catch {}
        }

        /* ---------------- grenades ---------------- */
        let nades = [],
            nadeGroup = new wt;
        nadeGroup.name = "jm-extras", i.scene.add(nadeGroup);
        try {
            let e = new ls(.062, 12, 8),
                t = new ls(.02, 6, 5),
                n = i.mats.get("steel_dark"),
                s = i.mats.emissive(16726560, 26);
            for (let o = 0; o < 4; o++) {
                let r = new Qe(e, n),
                    a = new Qe(t, s);
                a.position.y = .058, r.add(a), r.castShadow = !0, r.position.set(0, -200, 0), nadeGroup.add(r), nades.push({
                    on: !1,
                    pos: new W,
                    vel: new W,
                    fuse: 0,
                    t: 0,
                    mesh: r,
                    lamp: a
                })
            }
        } catch (e) {
            console.error("[extras] grenade meshes failed", e)
        }

        function throwNade() {
            let e = i.player;
            if (st.grenades <= 0) {
                st.nadeCd = .5, say("手雷已用完 · 击毁敌人有机会掉落", 1.8);
                return
            }
            let t = nades.find(n => !n.on);
            if (!t) return;
            st.nadeCd = jmTune.nadeCd, st.grenades--, t.on = !0, t.t = 0, t.fuse = jmTune.nadeFuse, t.pos.copy(e.eye).addScaledVector(e.forward, .45), t.pos.y -= .1, t.vel.copy(e.forward).multiplyScalar(jmTune.nadeSpeed), t.vel.y += jmTune.nadeLift, e.vel && (t.vel.x += e.vel.x * .6, t.vel.z += e.vel.z * .6);
            try {
                e.addRecoil(.02, 0)
            } catch {}
            sfx("whiz", {
                gain: .35,
                pitch: .5
            })
        }

        function stepNade(e, t) {
            e.t += t, e.fuse -= t, e.vel.y -= jmTune.nadeGravity * t;
            let n = e.vel.length(),
                s = n * t,
                o = i.physics;
            if (s > 1e-5) {
                v1.copy(e.vel).multiplyScalar(1 / n);
                let r = null;
                try {
                    r = o.raycast(e.pos, v1, s + .07)
                } catch {}
                if (r && r.normal) {
                    v2.copy(r.normal);
                    let a = e.vel.dot(v2);
                    e.pos.copy(r.point).addScaledVector(v2, .07), a < 0 && (e.vel.addScaledVector(v2, -1.38 * a), e.vel.multiplyScalar(.72), a < -2.2 && sfx(r.surface === "metal" ? "impact_metal" : "shell_bounce", {
                        pos: e.pos,
                        gain: .7,
                        pitch: .55,
                        jitter: .1
                    }))
                } else e.pos.addScaledVector(e.vel, t)
            }
            let r = -50;
            try {
                r = o.groundHeight(e.pos.x, e.pos.z, e.pos.y + .4)
            } catch {}
            if (Number.isFinite(r) && e.pos.y < r + .065 && e.pos.y > r - 1.2 && (e.pos.y = r + .065, e.vel.y < 0 && (e.vel.y = Math.abs(e.vel.y) > 1.6 ? -e.vel.y * .34 : 0), e.vel.x *= Math.exp(-5 * t), e.vel.z *= Math.exp(-5 * t)), e.pos.y < oi.seaY - .6) {
                try {
                    i.fx.splash && i.fx.splash(v1.set(e.pos.x, oi.seaY, e.pos.z), 1.2)
                } catch {}
                e.on = !1, e.mesh.position.set(0, -200, 0);
                return
            }
            if (e.t > .12)
                for (let a of i.enemies.list) {
                    if (!a || !a.alive) continue;
                    v1.copy(a.pos), a.type === "hound" && (v1.y += .55);
                    if (v1.distanceToSquared(e.pos) < (a.type === "hound" ? 2.4 : 1.7)) {
                        e.fuse = 0;
                        break
                    }
                }
            if (e.fuse <= 0) {
                boom(e);
                return
            }
            e.mesh.position.copy(e.pos), e.mesh.rotation.x += t * 9, e.mesh.rotation.z += t * 6;
            let a = e.fuse < .6 ? 18 : 7;
            e.lamp.visible = Math.sin(e.t * a * Math.PI) > -.2
        }

        function boom(e) {
            e.on = !1, e.mesh.position.set(0, -200, 0), v4.copy(e.pos), st.src = "grenade", st.multi = 0;
            try {
                i.fx.explosion(v4, 1.3), i.combat.explode(v4, jmTune.nadeRadius, jmTune.nadeDamage, "player")
            } catch (t) {
                console.error("[extras] grenade explosion threw", t)
            } finally {
                st.src = ""
            }
            if (st.multi > 0) try {
                hud.hitmarker && hud.hitmarker("kill")
            } catch {}
            if (st.multi >= 2) {
                let t = 100 * (st.multi - 1) * Math.min(jmTune.comboMax, Math.max(1, st.combo));
                addScore(t), feed(`<b>多重击杀 \xD7${st.multi}</b><em>+${t}</em>`)
            }
        }

        /* ---------------- supply drops ---------------- */
        let kinds = {
                ammo: {
                    color: 16757575,
                    size: [.3, .17, .2]
                },
                med: {
                    color: 5111706,
                    size: [.26, .2, .26]
                },
                nade: {
                    color: 16734784,
                    size: [.18, .24, .18]
                }
            },
            picks = [];
        try {
            for (let e in kinds) {
                let t = kinds[e],
                    n = new un(t.size[0], t.size[1], t.size[2]),
                    s = i.mats.emissive(t.color, 5);
                for (let o = 0; o < 4; o++) {
                    let r = new Qe(n, s);
                    r.position.set(0, -200, 0), nadeGroup.add(r), picks.push({
                        on: !1,
                        kind: e,
                        pos: new W,
                        ttl: 0,
                        t: 0,
                        mesh: r
                    })
                }
            }
        } catch (e) {
            console.error("[extras] pickup meshes failed", e)
        }

        function drop(e, t) {
            let n = picks.find(a => !a.on && a.kind === e);
            if (!n) return !1;
            let s = t.x,
                o = t.z,
                r = i.physics,
                a = i.player;
            try {
                if (r.nav && r.nav.isWalkable && !r.nav.isWalkable(s, o)) {
                    let l = !1;
                    for (let c = 1; c <= 4 && !l; c++) {
                        let u = c / 5,
                            h = s + (a.pos.x - s) * u,
                            f = o + (a.pos.z - o) * u;
                        r.nav.isWalkable(h, f) && (s = h, o = f, l = !0)
                    }
                    if (!l) return !1
                }
            } catch {}
            let l = 0;
            try {
                l = r.groundHeight(s, o, Math.min(t.y + 1, a.pos.y + 2.2))
            } catch {}
            return Number.isFinite(l) || (l = 0), n.on = !0, n.t = Math.random() * 6, n.ttl = jmTune.pickupTtl, n.pos.set(s, l + .42, o), n.mesh.position.copy(n.pos), n.mesh.visible = !0, !0
        }

        function maybeDrop(e) {
            if (!e || Math.random() > jmTune.dropChance) return;
            let t = i.player,
                n = i.weapon || {},
                s = (n.reserve | 0) < 60 ? 3 : (n.reserve | 0) < 120 ? 1.4 : .6,
                o = t.health < 55 ? 3.2 : t.health < 95 ? 1.2 : .25,
                r = st.grenades >= jmTune.nadeMax ? 0 : st.grenades < 2 ? 1.5 : .7,
                a = Math.random() * (s + o + r);
            drop(a < s ? "ammo" : a < s + o ? "med" : "nade", e)
        }

        function collect(e) {
            let t = i.player;
            if (e.kind === "ammo") {
                try {
                    i.weapon.addAmmo(jmTune.ammoGain)
                } catch {}
                feed(`<b>弹药补给</b><em>+${jmTune.ammoGain}</em>`), sfx("reload_magin", {
                    gain: .8
                })
            } else if (e.kind === "med") {
                if (t.health >= t.maxHealth - .5) return !1;
                t.heal(jmTune.medGain), feed(`<b>急救包</b><em>+${jmTune.medGain} 生命</em>`), sfx("objective", {
                    gain: .45,
                    pitch: 1.5
                })
            } else {
                if (st.grenades >= jmTune.nadeMax) return !1;
                st.grenades++, feed("<b>手雷</b><em>+1</em>"), sfx("reload_magin", {
                    gain: .8,
                    pitch: .8
                })
            }
            return !0
        }

        function stepPicks(e) {
            let t = i.player,
                n = jmTune.pickupRadius * jmTune.pickupRadius;
            for (let s of picks) {
                if (!s.on) continue;
                s.t += e, s.ttl -= e;
                let o = s.pos.x - t.pos.x,
                    r = s.pos.z - t.pos.z;
                if (s.ttl <= 0 || t.alive && o * o + r * r < n && Math.abs(s.pos.y - t.pos.y - .6) < 2.2 && collect(s)) {
                    s.on = !1, s.mesh.position.set(0, -200, 0);
                    continue
                }
                s.mesh.position.set(s.pos.x, s.pos.y + Math.sin(s.t * 2.6) * .07, s.pos.z), s.mesh.rotation.y = s.t * 1.7, s.mesh.visible = s.ttl > 6 || Math.sin(s.t * 14) > -.3
            }
        }

        /* ---------------- focus (bullet time) ---------------- */
        function tryFocus() {
            if (st.focusOn > 0) return;
            if (st.focus < 100) {
                say("专注尚未充能 · 击毁敌人可加速充能", 1.6);
                return
            }
            st.focusOn = jmTune.focusSecs, sfx("telegraph", {
                gain: .55,
                pitch: .5
            })
        }

        function stepFocus(e) {
            let t = i.game && i.game.state === "playing" && i.player.alive;
            t || (st.focusOn = 0), st.focusOn > 0 ? (st.focusOn -= e, st.focus = 100 * Math.max(0, st.focusOn / jmTune.focusSecs), st.focusOn <= 0 && (st.focusOn = 0, st.focus = 0)) : t && st.focus < 100 && (st.focus = Math.min(100, st.focus + jmTune.focusRegen * e), st.focus >= 100 && !st.hinted && (st.hinted = !0, say(i.input.touch ? "专注已就绪 · 点击“专注”进入子弹时间" : "专注已就绪 · 按 Q 进入子弹时间", 2.6)));
            let n = st.focusOn > 0 ? 1 : 0,
                s = st.focusK;
            st.focusK = kn(st.focusK, n, n ? 14 : 7, e), st.focusK < .002 && (st.focusK = 0), i.timeScale = bi(1, jmTune.focusWorld, st.focusK), i.playerScale = bi(1, jmTune.focusPlayer, st.focusK), t && (st.focusK > 0 || s > 0) && (basePost.saturation = baseSat * (1 - .55 * st.focusK))
        }

        /* ---------------- scoring ---------------- */
        i.events.on("enemy:killed", e => {
            if (!i.game || i.game.state !== "playing") return;
            st.kills++, st.combo = st.comboT > 0 ? st.combo + 1 : 1, st.comboT = jmTune.comboSecs, st.bestCombo = Math.max(st.bestCombo, st.combo);
            let t = Math.min(jmTune.comboMax, st.combo),
                n = e && (e.type || e.enemy && e.enemy.type),
                s = n === "hound" ? 150 : 100;
            e && e.enemy && e.enemy.jmElite && (s = Math.round(s * 1.5)), st.src === "melee" && (s += 100), st.src === "grenade" && st.multi++, addScore(s * t), st.focusOn > 0 || (st.focus = Math.min(100, st.focus + jmTune.focusPerKill)), e && e.pos && maybeDrop(e.pos)
        }), i.events.on("player:hitEnemy", e => {
            e && e.killed && e.weak && i.game && i.game.state === "playing" && (addScore(50 * Math.min(jmTune.comboMax, Math.max(1, st.combo))), st.focusOn > 0 || (st.focus = Math.min(100, st.focus + 8)))
        }), i.events.on("player:dead", () => {
            st.focusOn = 0, st.focusK = 0, i.timeScale = 1, i.playerScale = 1
        }), i.events.on("game:state", e => {
            e && e.state !== "playing" && e.state !== "dead" && (i.timeScale = 1, i.playerScale = 1)
        });

        function saveBest() {
            try {
                localStorage.setItem(jmBestKey, JSON.stringify(best))
            } catch {}
        }
        let api = {
            state: st,
            tune: jmTune,
            best,
            addScore,
            reset(e) {
                st.mode = e === "survival" ? "survival" : "story", st.score = 0, st.kills = 0, st.combo = 0, st.comboT = 0, st.bestCombo = 0, st.grenades = jmTune.nadeStart, st.focus = 100, st.focusOn = 0, st.focusK = 0, st.meleeCd = 0, st.nadeCd = 0, st.src = "", st.multi = 0, i.timeScale = 1, i.playerScale = 1;
                for (let t of nades) t.on = !1, t.mesh.position.set(0, -200, 0);
                for (let t of picks) t.on = !1, t.mesh.position.set(0, -200, 0);
                ui && (ui.shown = 0), root && (root.classList.toggle("jm-survival", st.mode === "survival"), root.classList.remove("jm-focus")), drawHud(0)
            },
            resupply(e = 1) {
                st.grenades = Math.min(jmTune.nadeMax, st.grenades + e);
                try {
                    i.weapon.addAmmo(jmTune.ammoGain * 2), i.player.heal(25)
                } catch {}
            },
            finish(e, t = {}) {
                let n = 0;
                e === "story" && (n = 1e3 + Math.max(0, Math.round((300 - (t.time || 0)) * 4)) + (t.retries ? 0 : 500), st.score += n);
                let s = e === "survival" ? "survival" : "story",
                    o = best[s] || 0,
                    r = st.score > o && st.score > 0;
                return r && (best[s] = st.score), e === "survival" && (t.wave | 0) > best.wave && (best.wave = t.wave | 0), saveBest(), {
                    score: st.score,
                    bonus: n,
                    best: best[s],
                    isBest: r,
                    bestWave: best.wave,
                    bestCombo: st.bestCombo,
                    kills: st.kills
                }
            },
            update(e) {
                if (!(e > 0)) return;
                let t = i.player,
                    n = i.input,
                    s = i.timeScale || 1;
                st.meleeCd -= e, st.nadeCd -= e;
                if (i.game && i.game.state === "playing" && t.alive && t.enabled) {
                    n.pressed("melee") && st.meleeCd <= 0 && melee(), n.pressed("grenade") && st.nadeCd <= 0 && throwNade(), n.pressed("alt") && tryFocus()
                }
                stepFocus(e), st.comboT > 0 && (st.comboT -= e, st.comboT <= 0 && (st.combo = 0));
                let o = e * s;
                for (let r of nades)
                    if (r.on) {
                        let a = Math.max(1, Math.ceil(o / .012));
                        for (let l = 0; l < a && r.on; l++) stepNade(r, o / a)
                    } stepPicks(o), drawHud(e)
            }
        };
        return api.reset("story"), api
    }
