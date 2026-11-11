// One-shot patch #3 for bundle.pretty.js: input feel, aiming, grenade aim + throw animation.
// Every replacement must match exactly once (whitespace-insensitive); the script refuses to run twice.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, 'bundle.pretty.js');
let src = fs.readFileSync(file, 'utf8');
if (src.includes('jmAssist')) { console.error('patch3 already applied'); process.exit(1); }
fs.writeFileSync(path.join(__dirname, 'bundle.pretty.pre-patch3.js'), src);

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function rep(oldS, newS, label) {
  const re = new RegExp(oldS.trim().split(/\s+/).map(esc).join('\\s+'), 'g');
  const m = src.match(re);
  if (!m || m.length !== 1) throw new Error(`[${label}] expected 1 match, got ${m ? m.length : 0}`);
  src = src.replace(re, () => newS);
}
function cut(startS, endS, newS, label) {
  const a = src.indexOf(startS), b = src.indexOf(endS, a);
  if (a < 0 || b < 0 || src.indexOf(startS, a + 1) >= 0) throw new Error(`[${label}] anchors not unique/found`);
  src = src.slice(0, a) + newS + src.slice(b);
}

/* ------------------------------------------------------------------ input feel */
// Base mouse sensitivity: 0.12 deg/count was ~2x a typical shooter default.
rep('f_ = .0021,', 'f_ = .0016,', 'sens');
// Fast flicks were thrown away entirely (anything above 400 counts in one frame).
rep('if (Math.abs(V) > 400 || Math.abs(Y) > 400) return;', 'if (Math.abs(V) > 2400 || Math.abs(Y) > 2400) return;', 'spike');
// Raw mouse input (no OS pointer acceleration) where the browser supports it.
rep('let x = .5, y = .5, b = !1;', 'let x = .5, y = .5, b = !1, jmRaw = !0;', 'rawflag');
rep(`l = performance.now();
     let P = e.requestPointerLock();
     P && P.catch && P.catch(() => m())`,
`l = performance.now();
                    let P, jmAsked = !1;
                    if (jmRaw) try {
                        P = e.requestPointerLock({
                            unadjustedMovement: !0
                        }), jmAsked = !0
                    } catch {
                        jmRaw = !1
                    }
                    jmAsked || (P = e.requestPointerLock());
                    P && P.catch && P.catch(jmE => {
                        if (jmAsked && jmRaw && jmE && jmE.name === "NotSupportedError") {
                            jmRaw = !1, l = performance.now();
                            try {
                                let jmP = e.requestPointerLock();
                                jmP && jmP.catch && jmP.catch(() => m())
                            } catch {
                                m()
                            }
                        } else m()
                    })`, 'rawlock');
// Frame delta from the vsync-aligned rAF timestamp instead of performance.now() jitter.
rep(`t.renderer.setAnimationLoop(() => {
        let h = performance.now(),
            f = (h - l) / 1e3;`,
`t.renderer.setAnimationLoop(jmTs => {
            let h = typeof jmTs == "number" && jmTs > 0 ? jmTs : performance.now(),
                f = Math.max(0, (h - l) / 1e3);`, 'rafdt');
// Snappier start/stop.
rep('accelGround: 34,', 'accelGround: 46,', 'accel');
rep('decelGround: 26,', 'decelGround: 38,', 'decel');
// Less view shake per shot, tighter viewmodel sway (the gun trailed the view noticeably).
rep('Me.addShake(.12 * bt)', 'Me.addShake(.065 * bt)', 'fireshake');
rep('* 3.2 * pe, k.swP.v', '* 1.7 * pe, k.swP.v', 'swayY');
rep('* 2.6 * pe, ma(k.swY', '* 1.4 * pe, ma(k.swY', 'swayP');
rep('swY: pa(110, 15),', 'swY: pa(160, 20),', 'swYs');
rep('swP: pa(110, 15),', 'swP: pa(160, 20),', 'swPs');

/* ------------------------------------------------------------------ aiming */
// Tighter hip fire.
rep('ho = bi(.0125, .0012, k.adsE) + Ti * bi(.013, .004, k.adsE) + k.bloom * bi(.0065, .0022, k.adsE) + (we.onGround === !1 ? .022 : 0)',
    'ho = bi(.0082, .001, k.adsE) + Ti * bi(.0075, .003, k.adsE) + k.bloom * bi(.0052, .002, k.adsE) + (we.onGround === !1 ? .015 : 0)', 'spread');
// Bullet magnetism: a near miss within a small cone is bent onto the target.
rep(`playerShot(n, s, {
        damage: o = 28,
        range: r = 300,
        impulse: a = 1
     } = {}) {
        e.shots++;
        let l = i.physics.raycast(n, s, r),
            c = i.enemies.raycast(n, s, l ? l.dist : r);`,
`playerShot(n, s, {
                damage: o = 28,
                range: r = 300,
                impulse: a = 1,
                assist: jmA = 0
            } = {}) {
                e.shots++;
                let l = i.physics.raycast(n, s, r),
                    c = i.enemies.raycast(n, s, l ? l.dist : r);
                if (!c && jmA > 0) try {
                    let jmR = jmAssist(i, n, s, jmA, r);
                    jmR && (c = jmR.hit, l = jmR.wall, s.copy(jmR.dir))
                } catch (jmE) {
                    console.error("[combat] assist threw", jmE)
                }`, 'shot');
rep('function zv(i) {',
`var jmAv = new W,
        jmAp = new W,
        jmAd = new W,
        jmAr = {
            hit: null,
            wall: null,
            dir: jmAd
        };

    function jmAssist(i, origin, dir, tol, range) {
        let best = null,
            bestS = 1e9,
            bestF = 0,
            bestP = 0,
            bestR = 0;
        for (let en of i.enemies.list) {
            if (!en || !en.alive) continue;
            let hound = en.type === "hound",
                R = hound ? .42 : .4;
            jmAv.copy(en.pos), hound && (jmAv.y += .6), jmAv.sub(origin);
            let F = jmAv.dot(dir);
            if (F < 1.5 || F > range) continue;
            let P = Math.sqrt(Math.max(0, jmAv.lengthSq() - F * F)),
                S = P - R;
            S > Math.min(.6, F * tol) || S < bestS && (bestS = S, best = en, bestF = F, bestP = P, bestR = R)
        }
        if (!best) return null;
        let hound = best.type === "hound";
        for (let pass = 0; pass < 2; pass++) {
            jmAp.copy(best.pos), hound && (jmAp.y += .6);
            if (pass === 0 && bestP > 1e-4) {
                // keep the shot on the side the player missed on, but inside the silhouette
                jmAv.copy(origin).addScaledVector(dir, bestF).sub(jmAp);
                let k = Math.min(bestP, bestR * .45) / bestP;
                jmAp.x += jmAv.x * k, jmAp.z += jmAv.z * k, jmAp.y += Math.max(-.1, Math.min(.1, jmAv.y * k))
            }
            jmAd.copy(jmAp).sub(origin).normalize();
            let wall = i.physics.raycast(origin, jmAd, range),
                hit = i.enemies.raycast(origin, jmAd, wall ? wall.dist : range);
            if (hit) return jmAr.hit = hit, jmAr.wall = wall, jmAr
        }
        return null
    }

    function zv(i) {`, 'assistfn');
rep(`ut = i.combat.playerShot(Ie, ze, {
        damage: H_,
        range: V_
     })`,
`ut = i.combat.playerShot(Ie, ze, {
                    damage: H_,
                    range: V_,
                    assist: bi(.011, .006, k.adsE)
                })`, 'shotcall');

/* ------------------------------------------------------------------ weapon hooks for the grenade / melee animation */
rep('muzzleWorld: Re,',
`muzzleWorld: Re,
                lower: 0,
                jab() {
                    k.kZ.v -= 3, k.kY.v += 1.4, k.kR.v += 2.4, k.kP.v -= .8
                },`, 'weaponapi');
rep('let Oe = !!be.fire && e.visible && !ce.noFire,', 'let Oe = !!be.fire && e.visible && !ce.noFire && !(ve.lower > .25),', 'nofire');
rep('let Os = !!be.ads && !k.reload && k.sprintT < .35;', 'let Os = !!be.ads && !k.reload && k.sprintT < .35 && !(ve.lower > .05);', 'noads');
rep('e.position.set(it, gt, Ot), e.rotation.set(xn, $t, Ht, "YXZ")',
`let jmL = ve.lower > 0 ? ve.lower : 0;
            e.position.set(it - .04 * jmL, gt - .3 * jmL, Ot + .04 * jmL), e.rotation.set(xn - .7 * jmL, $t + .3 * jmL, Ht + .2 * jmL, "YXZ")`, 'weaponpose');

/* ------------------------------------------------------------------ extras: grenade aim, throw animation */
rep('multi: 0, hinted: !1 },', 'multi: 0, hinted: !1, nadePhase: 0, nadeT: 0, nadeLow: 0, nadeThrown: !1, nadeHinted: !1 },', 'ststate');

cut('        function throwNade() {', '        function stepNade(e, t) {',
`        let vUp = new W(0, 1, 0);

        function nadeLaunch(e, t) {
            let n = i.player,
                s = Math.cos(n.yaw),
                o = Math.sin(n.yaw);
            e.copy(n.eye).addScaledVector(n.forward, .45), e.x += s * .1, e.z -= o * .1, e.y -= .08, t.copy(n.forward).multiplyScalar(jmTune.nadeSpeed), t.y += jmTune.nadeLift, n.vel && (t.x += n.vel.x * .6, t.z += n.vel.z * .6)
        }

        function throwNade() {
            let e = i.player;
            if (st.grenades <= 0) return;
            let t = nades.find(n => !n.on);
            if (!t) return;
            st.nadeCd = jmTune.nadeCd, st.grenades--, t.on = !0, t.t = 0, t.fuse = jmTune.nadeFuse, nadeLaunch(t.pos, t.vel);
            try {
                e.addRecoil(.014, 0), e.addShake(.1)
            } catch {}
            sfx("whiz", {
                gain: .4,
                pitch: .5
            })
        }

        /* hold to aim (arc + landing ring), release to throw; the rifle drops and a hand does the throwing */
        function nadeStart() {
            if (st.grenades <= 0) {
                st.nadeCd = .5, say("手雷已用完 · 击毁敌人有机会掉落", 1.8);
                return
            }
            if (!nades.some(e => !e.on)) return;
            st.nadePhase = 1, st.nadeT = 0, st.nadeThrown = !1, st.nadeHinted || (st.nadeHinted = !0, say(i.input.touch ? "按住手雷键瞄准落点 · 松开投掷" : "按住 G 瞄准落点 · 松开投掷 · 右键取消", 3))
        }

        function nadeStep(e, t) {
            let n = i.input;
            st.nadePhase && !t && (st.nadePhase = 0);
            if (st.nadePhase === 1) {
                st.nadeT += e;
                n.pressed("ads") ? (st.nadePhase = 0, st.nadeCd = .25) : !n.down("grenade") && st.nadeT > .14 && (st.nadePhase = 2, st.nadeT = 0, st.nadeThrown = !1)
            } else st.nadePhase === 2 && (st.nadeT += e, !st.nadeThrown && st.nadeT >= .13 && (st.nadeThrown = !0, throwNade()), st.nadeT >= .46 && (st.nadePhase = 0));
            st.nadeLow = kn(st.nadeLow, st.nadePhase ? 1 : 0, st.nadePhase ? 18 : 11, e), st.nadeLow < .003 && (st.nadeLow = 0);
            try {
                i.weapon.lower = st.nadeLow
            } catch {}
            drawHand(e), drawArc()
        }

        let hand = null,
            handK = 0,
            hq = [0, 0, 0, 0, 0, 0],
            K0 = [.27, -.38, -.2, .3, -.75, .58],
            K1 = [.2, -.08, -.3, .28, -.72, .63],
            K2 = [.23, -.03, -.24, .2, -.55, .8],
            K3 = [.06, .02, -.52, .3, -.35, .88],
            K4 = [-.03, -.21, -.5, .55, -.15, .82],
            K5 = [.1, -.45, -.3, .5, -.3, .8],
            ease = e => (e = e < 0 ? 0 : e > 1 ? 1 : e, e * e * (3 - 2 * e)),
            mixK = (e, t, n) => {
                for (let s = 0; s < 6; s++) hq[s] = e[s] + (t[s] - e[s]) * n
            };
        try {
            let e = new wt,
                t = i.mats.get("glove_fabric"),
                n = new Qe(new ls(.036, 12, 9), t),
                s = new Qe(new Ys(.03, .042, .36, 10), t),
                o = new Qe(new ls(.03, 12, 8), i.mats.get("steel_dark")),
                r = new Qe(new ls(.009, 6, 5), i.mats.emissive(16726560, 26));
            n.scale.set(1.05, .92, 1.2), s.position.y = -.2, o.position.set(-.014, .034, -.026), r.position.y = .03, o.add(r), e.add(n, s, o), e.name = "jm-hand", e.traverse(a => {
                a.layers.set(zc), a.castShadow = !1, a.frustumCulled = !1
            }), e.visible = !1, i.camera.add(e), hand = {
                g: e,
                nade: o
            }
        } catch (e) {
            console.error("[extras] hand viewmodel failed", e)
        }

        function drawHand(e) {
            if (!hand) return;
            let t = st.nadePhase,
                n = st.nadeT,
                s = !0,
                o = !0;
            if (t === 1) handK = ease(n / .14), mixK(K0, K1, handK);
            else if (t === 2) {
                handK = 0;
                if (n < .06) mixK(K1, K2, ease(n / .06));
                else if (n < .13) {
                    let r = (n - .06) / .07;
                    mixK(K2, K3, r * r)
                } else n < .26 ? mixK(K3, K4, ease((n - .13) / .13)) : mixK(K4, K5, ease((n - .26) / .2));
                o = !st.nadeThrown
            } else handK > .02 ? (handK = kn(handK, 0, 16, e), mixK(K0, K1, handK)) : (handK = 0, s = !1);
            hand.g.visible !== s && (hand.g.visible = s);
            if (!s) return;
            hand.nade.visible = o, hand.g.position.set(hq[0], hq[1] + (t === 1 ? Math.sin(n * 5) * .004 : 0), hq[2]), v1.set(-hq[3], -hq[4], -hq[5]).normalize(), hand.g.quaternion.setFromUnitVectors(vUp, v1)
        }

        let arc = null;
        try {
            let e = i.mats.emissive(16757575, 5),
                t = new ls(.03, 6, 4),
                n = [];
            for (let o = 0; o < 34; o++) {
                let r = new Qe(t, e);
                r.visible = !1, nadeGroup.add(r), n.push(r)
            }
            let s = new O0(.34, .46, 30);
            s.rotateX(-Math.PI / 2);
            let o = new Qe(s, i.mats.emissive(16734784, 7));
            o.visible = !1, nadeGroup.add(o), arc = {
                dots: n,
                ring: o,
                on: !1
            }
        } catch (e) {
            console.error("[extras] grenade arc failed", e)
        }

        function drawArc() {
            if (!arc) return;
            if (!(st.nadePhase === 1 && st.nadeT > .1)) {
                if (arc.on) {
                    arc.on = !1, arc.ring.visible = !1;
                    for (let c of arc.dots) c.visible = !1
                }
                return
            }
            arc.on = !0, nadeLaunch(v1, v2);
            let e = i.physics,
                t = i.player.eye,
                n = 0,
                s = !1,
                o = .04,
                r = jmTune.nadeGravity;
            for (let a = 0; a * o < jmTune.nadeFuse && !s; a++) {
                // exact parabola per segment: travel with the mid-step velocity
                v2.y -= r * o * .5, v3.copy(v2);
                let l = v3.length(),
                    c = null;
                v3.multiplyScalar(1 / l);
                try {
                    c = e.raycast(v1, v3, l * o + .07)
                } catch {}
                if (c && c.normal) v1.copy(c.point), v4.copy(c.normal), s = !0;
                else {
                    v1.addScaledVector(v2, o);
                    let u = -50;
                    try {
                        u = e.groundHeight(v1.x, v1.z, v1.y + .4)
                    } catch {}
                    Number.isFinite(u) && v1.y < u + .065 && v1.y > u - 1.2 ? (v1.y = u, v4.set(0, 1, 0), s = !0) : v1.y < oi.seaY && (v1.y = oi.seaY, v4.set(0, 1, 0), s = !0)
                }
                v2.y -= r * o * .5;
                if (!s && a >= 1 && n < arc.dots.length) {
                    let u = arc.dots[n++];
                    u.position.copy(v1), u.scale.setScalar(Math.max(1, v1.distanceTo(t) * .13)), u.visible = !0
                }
            }
            for (; n < arc.dots.length; n++) arc.dots[n].visible = !1;
            arc.ring.visible = s, s && (arc.ring.position.copy(v1).addScaledVector(v4, .04), arc.ring.quaternion.setFromUnitVectors(vUp, v4), arc.ring.scale.setScalar(Math.max(1, v1.distanceTo(t) * .07)))
        }

`, 'nadeblock');

// melee: the rifle jabs forward
rep('st.meleeCd = jmTune.meleeCd;', `st.meleeCd = jmTune.meleeCd;
            try {
                i.weapon.jab && i.weapon.jab()
            } catch {}`, 'meleejab');

// update(): press starts the aim, the state machine does the rest
rep(`if (i.game && i.game.state === "playing" && t.alive && t.enabled) {
        n.pressed("melee") && st.meleeCd <= 0 && melee(), n.pressed("grenade") && st.nadeCd <= 0 && throwNade(), n.pressed("alt") && tryFocus()
     }`,
`let jmLive = !!(i.game && i.game.state === "playing" && t.alive && t.enabled);
                if (jmLive) {
                    n.pressed("melee") && st.meleeCd <= 0 && !st.nadePhase && melee(), n.pressed("grenade") && st.nadeCd <= 0 && !st.nadePhase && nadeStart(), n.pressed("alt") && tryFocus()
                }
                nadeStep(e, jmLive);`, 'update');

// reset(): clear the throw state
rep('st.meleeCd = 0, st.nadeCd = 0, st.src = "", st.multi = 0, i.timeScale = 1, i.playerScale = 1;',
`st.meleeCd = 0, st.nadeCd = 0, st.src = "", st.multi = 0, i.timeScale = 1, i.playerScale = 1, st.nadePhase = 0, st.nadeT = 0, st.nadeLow = 0, st.nadeThrown = !1, handK = 0;
                try {
                    i.weapon.lower = 0, hand && (hand.g.visible = !1), drawArc()
                } catch {}`, 'reset');

fs.writeFileSync(file, src);
console.log('patch3 applied');
