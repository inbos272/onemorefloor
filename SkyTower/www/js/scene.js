// Turns simulation state into a frame: camera, character rig, environments, particles.
(function () {
  'use strict';
  const S = window.SKY;
  const C = S.CFG, M = S.MESH, T = S.PT, R = C.R;
  const COLUMN_R = 2.9;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const wrapAngle = (a) => {
    a = (a + Math.PI) % S.TAU;
    if (a < 0) a += S.TAU;
    return a - Math.PI;
  };
  const MILE = {};
  S.MILESTONES.forEach((m) => (MILE[m.floor] = 1));
  S.ENVS.forEach((e) => { if (e.from) MILE[e.from] = 1; });

  const TYPE_COL = [
    [0.95, 0.92, 0.82], [0.7, 0.93, 1], [0.5, 1, 0.45], [0.8, 0.65, 0.45], [0.45, 0.8, 1], [1, 0.45, 0.2],
  ];

  // ---------- particle pool ----------
  const PF = 16;
  class Particles {
    constructor(max) {
      this.max = max;
      this.a = new Float32Array(max * PF);
      this.out = new Float32Array(max * 8);
      this.n = 0;
      this.cursor = 0;
      this.budget = 1;
    }
    emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav, add, drag) {
      let i;
      if (this.n < this.max) i = this.n++;
      else { i = this.cursor; this.cursor = (this.cursor + 1) % this.max; }
      const o = i * PF, d = this.a;
      d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
      d[o + 6] = life; d[o + 7] = life; d[o + 8] = s0; d[o + 9] = s1;
      d[o + 10] = r; d[o + 11] = g; d[o + 12] = b; d[o + 13] = add ? -a : a;
      d[o + 14] = grav; d[o + 15] = drag || 0;
    }
    update(dt, oy) {
      const d = this.a;
      let i = 0, w = 0;
      while (i < this.n) {
        const o = i * PF;
        d[o + 6] -= dt;
        if (d[o + 6] <= 0) {
          this.n--;
          if (i !== this.n) d.copyWithin(o, this.n * PF, this.n * PF + PF);
          continue;
        }
        const dr = 1 - d[o + 15] * dt;
        d[o + 3] *= dr; d[o + 5] *= dr;
        d[o + 4] = d[o + 4] * dr - d[o + 14] * dt;
        d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
        const t = 1 - d[o + 6] / d[o + 7];
        const out = this.out;
        out[w++] = d[o]; out[w++] = d[o + 1] - oy; out[w++] = d[o + 2];
        out[w++] = d[o + 8] + (d[o + 9] - d[o + 8]) * t;
        out[w++] = d[o + 10]; out[w++] = d[o + 11]; out[w++] = d[o + 12];
        const fade = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
        out[w++] = d[o + 13] * fade;
        i++;
      }
      if (this.cursor >= this.n) this.cursor = 0;
      return this.n;
    }
    clear() { this.n = 0; this.cursor = 0; }
  }

  // ---------- transforms ----------
  const m = new Float32Array(12), B = new Float32Array(12), L = new Float32Array(12);
  function trs(o, px, py, pz, yaw, roll, sx, sy, sz) {
    const cy = Math.cos(yaw), sn = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
    o[0] = cy * cr * sx; o[1] = -cy * sr * sy; o[2] = sn * sz; o[3] = px;
    o[4] = sr * sx; o[5] = cr * sy; o[6] = 0; o[7] = py;
    o[8] = -sn * cr * sx; o[9] = sn * sr * sy; o[10] = cy * sz; o[11] = pz;
  }
  function mul(o, a, b) {
    for (let i = 0; i < 3; i++) {
      const k = i * 4;
      o[k] = a[k] * b[0] + a[k + 1] * b[4] + a[k + 2] * b[8];
      o[k + 1] = a[k] * b[1] + a[k + 1] * b[5] + a[k + 2] * b[9];
      o[k + 2] = a[k] * b[2] + a[k + 1] * b[6] + a[k + 2] * b[10];
      o[k + 3] = a[k] * b[3] + a[k + 1] * b[7] + a[k + 2] * b[11] + a[k + 3];
    }
  }

  // ---------- backgrounds ----------
  function buildDecor(envId) {
    const list = [], rng = S.mulberry(envId.length * 4177 + 13);
    const r = (a, b) => a + (b - a) * rng();
    const put = (mesh, x, y, z, sx, sy, sz, yaw, col, em, gl) =>
      list.push({ mesh, x, y, z, sx, sy, sz, yaw: yaw || 0, col, em: em || 0, gl: gl || 0 });
    const ring = (i, n, a0, a1) => {
      const a = (i / n) * S.TAU + r(-0.2, 0.2), rad = r(a0, a1);
      return [Math.sin(a) * rad, Math.cos(a) * rad];
    };
    const hx = S.hex;
    const clouds = (n, col, y0, y1, em) => {
      for (let i = 0; i < n; i++) {
        const [x, z] = ring(i, n, 62, 150), y = r(y0, y1), s = r(5, 11), yaw = r(0, 6);
        for (let k = 0; k < 5; k++) {
          const ox = (k - 2) * s * 0.62, ss = s * (1 - Math.abs(k - 2) * 0.22) * r(0.85, 1.1);
          const cy = Math.cos(yaw), sy = Math.sin(yaw);
          put(M.SPHERE, x + ox * cy, y + ss * 0.1, z - ox * sy, ss, ss * 0.56, ss, 0, col, em, 0);
        }
      }
    };
    if (envId === 'sky') {
      clouds(11, [1, 1, 1], -30, 28, 0.32);
      for (let i = 0; i < 9; i++) {
        const [x, z] = ring(i, 9, 58, 125), y = r(-32, 26), s = r(5, 11), yaw = r(0, 6);
        put(M.CONE, x, y - s * 0.12, z, s, -s * 1.15, s, yaw, hx(0x8b7355), 0.05);
        put(M.CYL, x, y, z, s * 1.02, s * 0.2, s * 1.02, yaw, hx(0x6fcf52), 0.08);
        const trees = 2 + Math.floor(r(0, 3));
        for (let k = 0; k < trees; k++) {
          const a = r(0, 6.28), d = r(0.15, 0.72) * s, tx = x + Math.sin(a) * d, tz = z + Math.cos(a) * d, h = r(0.7, 1.3);
          put(M.CYL, tx, y + 0.5 * h, tz, 0.28, h, 0.28, 0, hx(0x7b5230), 0);
          put(M.CONE, tx, y + 0.8 * h, tz, 1.1 * h, 2.6 * h, 1.1 * h, 0, hx(0x3fae55), 0.05);
        }
      }
    } else if (envId === 'desert') {
      for (let i = 0; i < 12; i++) {
        const [x, z] = ring(i, 12, 80, 165), s = r(14, 30), h = r(36, 80), y = -72 + h, yaw = r(0, 6);
        put(M.CYL, x, y - h * 0.5, z, s * 1.2, h, s * 1.2, yaw, hx(0xc98a53), 0.05);
        put(M.CYL, x, y + 2, z, s, 5, s, yaw, hx(0xe4ad70), 0.08);
        put(M.CYL, x, y - h * 0.36, z, s * 1.26, 2.2, s * 1.26, yaw, hx(0xa86c3f), 0);
      }
      for (let i = 0; i < 9; i++) {
        const [x, z] = ring(i, 9, 110, 200), s = r(45, 90);
        put(M.SPHERE, x, -74, z, s, r(10, 22), s, 0, hx(0xecc184), 0.08);
      }
      for (let i = 0; i < 10; i++) {
        const [x, z] = ring(i, 10, 55, 120), s = r(1.5, 4);
        put(M.GEM, x, r(-18, 26), z, s, s * 0.7, s, r(0, 6), hx(0xcf9960), 0.05);
      }
      clouds(4, [1, 0.93, 0.78], 14, 36, 0.3);
    } else if (envId === 'frozen') {
      for (let i = 0; i < 16; i++) {
        const [x, z] = ring(i, 16, 85, 175), w = r(32, 58), h = r(72, 135), base = -92, yaw = r(0, 6);
        put(M.CONE, x, base, z, w, h, w, yaw, hx(0x5b7ba6), 0.03);
        put(M.CONE, x, base + h * 0.62, z, w * 0.395, h * 0.395, w * 0.395, yaw, hx(0xf4fbff), 0.25);
      }
      for (let i = 0; i < 12; i++) {
        const [x, z] = ring(i, 12, 52, 110), s = r(1.5, 4.5);
        put(M.GEM, x, r(-26, 30), z, s * 0.7, s * 1.5, s * 0.7, r(0, 6), hx(0xa8e2ff), 0.35, 1);
      }
      clouds(5, [0.94, 0.97, 1], -44, -20, 0.2);
    } else if (envId === 'volcano') {
      for (let i = 0; i < 12; i++) {
        const [x, z] = ring(i, 12, 85, 170), w = r(34, 60), h = r(60, 110), base = -90, yaw = r(0, 6);
        put(M.CONE, x, base, z, w, h, w, yaw, hx(0x2c2024), 0);
        put(M.CONE, x, base + h * 0.85, z, w * 0.15, h * 0.15, w * 0.15, yaw, hx(0xff7a2a), 1.2);
        put(M.SPHERE, x, base + h * 0.97, z, w * 0.1, w * 0.09, w * 0.1, 0, hx(0xffb24a), 1.4);
      }
      for (let i = 0; i < 16; i++) {
        const [x, z] = ring(i, 16, 50, 115), s = r(1.2, 4.2);
        put(M.GEM, x, r(-26, 30), z, s, s * 0.8, s, r(0, 6), hx(0x3a2a2e), 0.03);
      }
    } else {
      const pcs = [0xd87a4a, 0x6ac0d8, 0xb18cf0, 0xe5c07b, 0x62d68f, 0xf28cb1];
      for (let i = 0; i < 6; i++) {
        const [x, z] = ring(i, 6, 105, 200), y = r(-40, 60), s = r(9, 26), c = hx(pcs[i % pcs.length]);
        put(M.SPHERE, x, y, z, s, s, s, 0, c, 0.28);
        if (i % 2 === 0) put(M.TORUS, x, y, z, s * 1.9, s * 0.5, s * 1.9, r(0, 3), [c[0] * 1.2, c[1] * 1.2, c[2] * 1.2], 0.4);
      }
      for (let i = 0; i < 26; i++) {
        const [x, z] = ring(i, 26, 48, 125), s = r(0.8, 3.4);
        put(M.GEM, x, r(-28, 34), z, s, s * 0.7, s, r(0, 6), hx(0x6a6a8c), 0.08);
      }
    }
    return list;
  }

  const CAM_MODES = {
    play: { D: 18, pitch: 0.235, yOff: 3.2, sway: 0, lookR: 0 },
    menu: { D: 11.5, pitch: 0.14, yOff: 0, sway: 0.14, lookR: 0 },
    custom: { D: 6.6, pitch: 0.09, yOff: -1.05, sway: 0, lookR: 0 },
    theme: { D: 10, pitch: 0.42, yOff: -3.1, sway: 0, lookR: 0 },
  };

  class Scene {
    constructor(renderer, sim) {
      this.r = renderer;
      this.sim = sim;
      this.fx = new Particles(640);
      this.decor = S.ENVS.map((e) => buildDecor(e.id));
      this.env = 0;
      this.prevEnv = 0;
      this.envT = 99;
      this.pal = {};
      this._copyPal(S.ENVS[0]);
      this.envFrom = this._snapshot();
      this.cam = { th: 0, y: 3, mode: 'menu', D: 11.5, pitch: 0.14, yOff: 1.1, sway: 0, shake: 0, kick: 0, floorY: 0 };
      this.view = { eye: [0, 0, 0], at: [0, 0, 0], tanV: 0.7, aspect: 1 };
      this.frame = {
        view: this.view, pal: this.pal, sunD: [0, 1, 0], skySun: [0.4, 0.5, 0.75], oy: 0, time: 0, lavaY: -100, lavaG: 0,
        heat: 0, lavaS: -1, warn: 0, flash: 0, flashC: [1, 1, 1], shadow: [0, 0, 0, 0], theme: S.THEMES[0], column: COLUMN_R,
        camDir: [0, 0, 1], lavaVisible: false,
      };
      this.time = 0;
      this.flash = 0;
      this.flashC = [1, 1, 1];
      this.skin = S.SKINS[0];
      this.theme = S.THEMES[0];
      this.quality = 1;
      this.anim = { sq: 0, sv: 0, phase: 0, yaw: 0, lean: 0, air: 0, blink: 3, blinkT: 0, deadT: 0, customYaw: 0 };
      this.ambT = 0;
      this.emberT = 0;
      this.bestScreen = null;
      this.shakeEnabled = true;
    }

    _copyPal(e) {
      for (const k of ['top', 'mid', 'hor', 'sun', 'fog', 'hemiS', 'hemiG', 'light', 'colA', 'colB', 'fogR'])
        this.pal[k] = e[k].slice();
      this.pal.stars = e.stars;
    }
    _snapshot() {
      const o = {};
      for (const k in this.pal) o[k] = Array.isArray(this.pal[k]) ? this.pal[k].slice() : this.pal[k];
      return o;
    }

    setEnv(i, instant) {
      if (i === this.env && !instant) return;
      this.prevEnv = this.env;
      this.env = i;
      if (instant) {
        this.prevEnv = i;
        this._copyPal(S.ENVS[i]);
        this.envT = 99;
        this.cam.floorY = this.cam.y;
      } else {
        this.envFrom = this._snapshot();
        this.envT = 0;
      }
    }

    resetRun() {
      this.fx.clear();
      this.setEnv(0, true);
      const p = this.sim.p;
      this.cam.th = p.x / R;
      this.cam.y = p.y + this.cam.yOff;
      this.cam.floorY = this.cam.y;
      this.anim.deadT = 0;
      this.anim.sq = 0;
      this.anim.sv = 0;
      this.flash = 0;
    }

    wp(x, y, rad) {
      const th = x / R, r = R + (rad || 0);
      return [Math.sin(th) * r, y, Math.cos(th) * r];
    }

    burst(x, y, n, speed, life, s0, s1, col, a, grav, add, rad) {
      n = Math.max(1, Math.round(n * this.quality));
      const th = x / R, sn = Math.sin(th), cs = Math.cos(th);
      const r = R + (rad || 0), px = sn * r, pz = cs * r;
      for (let i = 0; i < n; i++) {
        const u = Math.random() * S.TAU, v = Math.random() * 2 - 1, w = Math.sqrt(1 - v * v);
        const dx = Math.cos(u) * w, dz = Math.sin(u) * w, sp = speed * (0.45 + Math.random() * 0.75);
        const vt = dx * sp, vr = dz * sp;
        this.fx.emit(px, y, pz, cs * vt + sn * vr, v * sp + speed * 0.25, -sn * vt + cs * vr, life * (0.6 + Math.random() * 0.6),
          s0, s1, col[0], col[1], col[2], a, grav, add, 1.6);
      }
    }

    dust(x, y, n, col, speed) {
      n = Math.max(1, Math.round(n * this.quality));
      const th = x / R, sn = Math.sin(th), cs = Math.cos(th), px = sn * R, pz = cs * R;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * S.TAU + Math.random() * 0.4, vt = Math.cos(a) * speed, vr = Math.sin(a) * speed * 0.5;
        this.fx.emit(px + cs * Math.cos(a) * 0.4, y + 0.08, pz - sn * Math.cos(a) * 0.4, cs * vt + sn * vr, 0.9 + Math.random() * 1.2, -sn * vt + cs * vr,
          0.42 + Math.random() * 0.25, 0.42, 1.05, col[0], col[1], col[2], 0.72, 0.5, false, 4.5);
      }
    }

    onEvent(name, a, b) {
      const p = this.sim.p;
      const an = this.anim;
      switch (name) {
        case 'jump': an.sv += 13; this.dust(p.x, p.y, 7, [1, 1, 1], 3.2); break;
        case 'land': {
          const imp = clamp(b / 30, 0.15, 1);
          an.sv -= 8 + imp * 16;
          const col = a.type === 0 ? this.theme.a : TYPE_COL[a.type];
          this.dust(p.x, p.y, 7 + Math.round(imp * 8), col, 3 + imp * 5);
          if (a.type === T.ICE) this.burst(p.x, p.y + 0.1, 8, 4.5, 0.4, 0.2, 0.05, [0.85, 0.97, 1], 0.9, 12, true);
          if (imp > 0.75) this.cam.shake = Math.max(this.cam.shake, 0.18);
          break;
        }
        case 'coin': this.burst(a.x, a.y, 9, 5.2, 0.42, 0.34, 0.05, [1, 0.86, 0.3], 0.95, 7, true); break;
        case 'pad':
          an.sv += 18;
          this.burst(a.x, a.y + 0.2, 22, 8.4, 0.55, 0.42, 0.08, TYPE_COL[2], 0.95, 12, true);
          this.dust(p.x, p.y, 12, TYPE_COL[2], 8);
          break;
        case 'speed':
          this.burst(p.x, p.y + 0.4, 18, 8, 0.45, 0.4, 0.06, TYPE_COL[4], 0.95, 0, true);
          this.cam.kick = 1;
          break;
        case 'crumble': this.burst(a.x, a.y - 0.2, 10, 2.6, 0.5, 0.3, 0.1, TYPE_COL[3], 0.9, 16, false); break;
        case 'collapse':
          for (let i = 0; i < 6; i++) this.burst(a.x + (Math.random() - 0.5) * a.hw * 2, a.y - 0.4, 4, 3.6, 0.8, 0.5, 0.15, TYPE_COL[3], 0.95, 20, false);
          break;
        case 'boom': {
          this.burst(a.x, a.y - 0.1, 42, 15, 0.7, 1.3, 0.2, [1, 0.62, 0.15], 1, 5, true);
          this.burst(a.x, a.y - 0.1, 16, 7, 1, 1.8, 3.2, [0.25, 0.2, 0.22], 0.6, -2, false);
          this.cam.shake = Math.max(this.cam.shake, b ? 0.85 : 0.35);
          this.flash = Math.max(this.flash, b ? 0.42 : 0.14);
          this.flashC = [1, 0.75, 0.4];
          break;
        }
        case 'beacon':
          this.burst(a.x, a.y + 1.3, 34, 12, 0.8, 0.55, 0.08, [0.55, 0.92, 1], 1, 2, true);
          this.flash = Math.max(this.flash, 0.22);
          this.flashC = [0.7, 0.95, 1];
          break;
        case 'dead':
          this.burst(p.x, this.sim.lavaY + 0.3, 70, 16, 1, 1, 0.14, [1, 0.5, 0.1], 1, 18, true);
          this.flash = 0.6;
          this.flashC = [1, 0.55, 0.15];
          this.cam.shake = 1;
          break;
      }
    }

    celebrate(col) {
      const p = this.sim.p;
      for (let i = 0; i < 4; i++)
        this.burst(p.x + (i - 1.5) * 2.2, p.y + 1 + Math.random() * 3, 26, 11, 1.15, 0.5, 0.1, i % 2 ? col : [1, 0.93, 0.5], 1, 9, true);
      this.flash = Math.max(this.flash, 0.3);
      this.flashC = [1, 0.97, 0.82];
    }

    // ---------- character ----------
    _part(mesh, x, y, z, sx, sy, sz, c, em, gl, roll, yaw) {
      trs(L, x, y, z, yaw || 0, roll || 0, sx, sy, sz);
      mul(m, B, L);
      this.r.rigid(mesh, m, c[0], c[1], c[2], em || 0, gl || 0);
    }

    drawCharacter(skin, px, py, pz, yaw, st) {
      const sq = clamp(st.sq, -0.42, 0.5);
      const sy = (1 + sq) * 1.14, sxz = (1 - sq * 0.55) * 1.14;
      trs(B, px, py, pz, yaw, st.lean, sxz, sy, sxz);
      const shape = skin.shape;
      let mesh = M.SPHERE, rx = 0.58, ry = 0.62, rz = 0.56, cy = 0.68;
      if (shape === 'cube') { mesh = M.RBOX; rx = 0.56; ry = 0.58; rz = 0.54; cy = 0.66; }
      else if (shape === 'tall') { rx = 0.47; ry = 0.8; rz = 0.46; cy = 0.86; }
      else if (shape === 'blob') { rx = 0.7; ry = 0.5; rz = 0.66; cy = 0.54; }
      const top = cy + ry;
      const bc = skin.body, em = skin.em || 0, gl = skin.gloss ? 0.9 : 0.16;
      const dark = [bc[0] * 0.72, bc[1] * 0.72, bc[2] * 0.72];
      const bob = st.grounded ? Math.abs(Math.sin(st.phase)) * 0.06 * st.runAmt : 0;

      this._part(mesh, 0, cy + bob, 0, rx, ry, rz, bc, em, gl);
      this._part(mesh, 0, cy - ry * 0.16 + bob, rz * 0.34, rx * 0.72, ry * 0.68, rz * 0.72, skin.belly, em * 0.8, gl);

      // feet
      const swing = Math.sin(st.phase) * st.runAmt;
      const fx = rx * 0.48;
      const tuck = st.air;
      this._part(M.SPHERE, -fx, 0.13 + Math.max(swing, 0) * 0.3 + tuck * 0.16, swing * 0.3, 0.2, 0.15, 0.27, dark, em * 0.5, 0.1);
      this._part(M.SPHERE, fx, 0.13 + Math.max(-swing, 0) * 0.3 + tuck * 0.16, -swing * 0.3, 0.2, 0.15, 0.27, dark, em * 0.5, 0.1);

      // hands: swing while running, up on the way up, flail on the way down
      const hx = rx + 0.09;
      const hy = cy - 0.03 + bob + st.handUp * 0.42 + st.flail * Math.sin(this.time * 34) * 0.1;
      this._part(M.SPHERE, -hx - st.handUp * 0.05, hy, -swing * 0.26, 0.15, 0.15, 0.15, dark, em * 0.5, 0.1);
      this._part(M.SPHERE, hx + st.handUp * 0.05, hy, swing * 0.26, 0.15, 0.15, 0.15, dark, em * 0.5, 0.1);

      // face
      const ey = cy + ry * 0.26 + bob, ex = rx * 0.4, ez = rz * 0.93;
      if (skin.visor !== undefined) {
        const v = S.hex(skin.visor);
        this._part(M.RBOX, 0, ey, ez - 0.02, rx * 0.8, 0.15, 0.09, v, 0.95, 0.8);
      } else {
        const blink = st.blinkT > 0 ? 0.14 : 1;
        const eye = [0.11, 0.13, 0.2];
        this._part(M.SPHERE, -ex, ey, ez, 0.095, 0.135 * blink, 0.06, eye, 0, 0.5);
        this._part(M.SPHERE, ex, ey, ez, 0.095, 0.135 * blink, 0.06, eye, 0, 0.5);
        if (blink === 1) {
          const w = [1, 1, 1];
          this._part(M.SPHERE, -ex + 0.03, ey + 0.05, ez + 0.05, 0.03, 0.04, 0.02, w, 1);
          this._part(M.SPHERE, ex + 0.03, ey + 0.05, ez + 0.05, 0.03, 0.04, 0.02, w, 1);
        }
        const pink = [1, 0.5, 0.5];
        this._part(M.SPHERE, -ex - 0.1, ey - 0.15, ez - 0.05, 0.09, 0.055, 0.03, pink, 0.1);
        this._part(M.SPHERE, ex + 0.1, ey - 0.15, ez - 0.05, 0.09, 0.055, 0.03, pink, 0.1);
      }
      this._accessory(skin, top + bob, rx, rz, cy + bob, ey);
    }

    _accessory(skin, top, rx, rz, cy, ey) {
      const c = skin.accCol, t = this.time;
      const lighter = [Math.min(1, c[0] * 1.3), Math.min(1, c[1] * 1.3), Math.min(1, c[2] * 1.3)];
      switch (skin.acc) {
        case 'cap':
          this._part(M.CYL, 0, top - 0.03, 0, rx * 0.72, 0.2, rx * 0.72, c);
          this._part(M.SPHERE, 0, top + 0.06, 0, rx * 0.72, 0.2, rx * 0.72, c);
          this._part(M.CYL, 0, top - 0.11, rz * 0.62, rx * 0.5, 0.05, rx * 0.5, lighter);
          break;
        case 'bow':
          this._part(M.SPHERE, -0.17, top + 0.02, 0.12, 0.17, 0.11, 0.08, c, 0, 0.2, 0.35);
          this._part(M.SPHERE, 0.17, top + 0.02, 0.12, 0.17, 0.11, 0.08, c, 0, 0.2, -0.35);
          this._part(M.SPHERE, 0, top + 0.02, 0.15, 0.07, 0.07, 0.07, lighter);
          break;
        case 'antenna':
          this._part(M.CYL, 0, top + 0.17, 0, 0.03, 0.38, 0.03, [0.3, 0.33, 0.4]);
          this._part(M.SPHERE, 0, top + 0.4, 0, 0.11, 0.11, 0.11, c, 0.8);
          break;
        case 'antenna2':
          for (const k of [-1, 1]) {
            this._part(M.CYL, k * 0.2, top + 0.15, 0, 0.03, 0.42, 0.03, [0.3, 0.6, 0.4], 0, 0, -k * 0.35);
            this._part(M.SPHERE, k * 0.34, top + 0.34, 0, 0.1, 0.1, 0.1, c, 0.9);
          }
          break;
        case 'leaf':
          this._part(M.CYL, 0, top + 0.05, 0, 0.03, 0.14, 0.03, [0.45, 0.3, 0.15]);
          this._part(M.SPHERE, 0.16, top + 0.13, 0, 0.2, 0.06, 0.12, c, 0.05, 0.2, 0.35);
          break;
        case 'ears':
          for (const k of [-1, 1]) this._part(M.SPHERE, k * rx * 0.62, top - 0.08, 0, 0.17, 0.17, 0.09, c);
          break;
        case 'cat':
          for (const k of [-1, 1]) this._part(M.CONE, k * rx * 0.6, top - 0.2, 0, 0.19, 0.42, 0.1, c, 0, 0, -k * 0.22);
          break;
        case 'bunny':
          for (const k of [-1, 1]) {
            this._part(M.SPHERE, k * 0.18, top + 0.33, -0.02, 0.11, 0.42, 0.07, skin.body, 0, 0, -k * 0.13);
            this._part(M.SPHERE, k * 0.18, top + 0.33, 0.03, 0.06, 0.3, 0.05, c, 0, 0, -k * 0.13);
          }
          break;
        case 'propeller': {
          this._part(M.SPHERE, 0, top, 0, rx * 0.5, 0.15, rx * 0.5, c);
          this._part(M.CYL, 0, top + 0.17, 0, 0.03, 0.2, 0.03, [0.3, 0.3, 0.35]);
          const spin = t * 18;
          this._part(M.RBOX, 0, top + 0.28, 0, 0.56, 0.02, 0.08, [1, 0.88, 0.32], 0.1, 0.1, 0, spin);
          this._part(M.RBOX, 0, top + 0.28, 0, 0.56, 0.02, 0.08, [1, 0.88, 0.32], 0.1, 0.1, 0, spin + 1.57);
          break;
        }
        case 'wizard':
          this._part(M.CYL, 0, top - 0.1, 0, rx * 1.28, 0.05, rx * 1.28, c, 0, 0.1);
          this._part(M.CONE, 0, top - 0.1, 0, rx * 0.72, 0.95, rx * 0.72, c, 0.05, 0.1, 0.1);
          this._part(M.SPHERE, -0.1, top + 0.35, rx * 0.25, 0.06, 0.06, 0.04, [1, 0.9, 0.3], 1);
          break;
        case 'party':
          this._part(M.CONE, 0, top - 0.1, 0, 0.32, 0.72, 0.32, c, 0.05, 0.1);
          this._part(M.SPHERE, 0, top + 0.66, 0, 0.1, 0.1, 0.1, [1, 0.9, 0.35], 0.6);
          break;
        case 'helmet':
          this._part(M.CYL, 0, top - 0.07, 0, 0.05, 0.16, 0.4, c);
          this._part(M.SPHERE, 0, top + 0.08, -0.02, 0.09, 0.3, 0.42, c, 0, 0.2);
          break;
        case 'crown': {
          this._part(M.CYL, 0, top - 0.02, 0, rx * 0.62, 0.2, rx * 0.62, c, 0.28, 0.9);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * S.TAU + 0.26, x = Math.sin(a) * rx * 0.56, z = Math.cos(a) * rx * 0.56;
            this._part(M.CONE, x, top + 0.06, z, 0.09, 0.26, 0.09, c, 0.28, 0.9);
          }
          this._part(M.GEM, 0, top + 0.03, rx * 0.63, 0.06, 0.09, 0.05, [1, 0.25, 0.35], 0.6, 1);
          break;
        }
        case 'horns':
          for (const k of [-1, 1]) this._part(M.CONE, k * rx * 0.55, top - 0.18, 0, 0.12, 0.44, 0.12, c, 0.05, 0.3, -k * 0.42);
          break;
        case 'halo':
          this._part(M.TORUS, 0, top + 0.27 + Math.sin(t * 2.4) * 0.03, 0, 0.36, 0.3, 0.36, c, 0.95, 0.5);
          break;
        case 'band':
          this._part(M.CYL, 0, ey + 0.2, 0, rx * 0.98, 0.1, rz * 1.02, c, 0.05);
          this._part(M.SPHERE, -rx * 0.7, ey + 0.17, -rz * 0.8, 0.1, 0.045, 0.22, c, 0.05, 0, 0.4);
          break;
        case 'flame':
          for (let i = 0; i < 3; i++) {
            const k = Math.sin(t * 13 + i * 2.1) * 0.08;
            this._part(M.CONE, (i - 1) * 0.2, top - 0.12, 0, 0.16, 0.46 + k + (i === 1 ? 0.2 : 0), 0.16, i === 1 ? [1, 0.85, 0.3] : c, 1.2);
          }
          break;
        case 'turban':
          this._part(M.SPHERE, 0, top - 0.02, 0, rx * 0.9, 0.3, rz * 0.98, c, 0.05);
          this._part(M.SPHERE, 0, top + 0.15, 0, rx * 0.6, 0.2, rz * 0.65, c, 0.05);
          this._part(M.GEM, 0, top + 0.05, rz * 0.95, 0.07, 0.1, 0.05, [0.3, 0.75, 0.75], 0.5, 1);
          break;
      }
    }

    thumbnailSkin(skin) {
      const F = this._thumbFrame(1, 0.8, 4.6);
      const st = { sq: 0, lean: 0, phase: 0, runAmt: 0, grounded: true, air: 0, handUp: 0, flail: 0, blinkT: 0 };
      this.drawCharacter(skin, 0, -0.7, 0, -0.32, st);
      return this.r.thumbnail(F, 128);
    }

    thumbnailTheme(theme) {
      const F = this._thumbFrame(0, 0, 7.5);
      F.theme = theme;
      F.column = 0;
      this.r.plat(0, 2.2, -R * 0 - 0.1, 0, 1, 0, 0, 0.3);
      // the platform lives on the ring at radius R, so the camera is placed relative to that
      const v = F.view;
      v.eye = [0, 2.1, R + 6];
      v.at = [0, -0.3, R];
      this.r.computeView(v);
      F.camDir = [0, 0, 1];
      return this.r.thumbnail(F, 128);
    }

    _thumbFrame(sy, atY, dist) {
      const v = { eye: [0, sy * 0.12, dist], at: [0, atY * 0, 0], tanV: 0.32, aspect: 1 };
      this.r.computeView(v);
      const e = S.ENVS[0];
      const pal = Object.assign({}, this.pal, { hemiS: e.hemiS, hemiG: e.hemiG, light: e.light, fog: e.fog, fogR: [900, 1000] });
      return { view: v, pal, sunD: [0.35, 0.72, 0.6], oy: 0, time: 1, lavaY: -999, lavaG: 0, shadow: [0, 0, 0, 0], theme: this.theme, column: 0, camDir: [0, 0, 1] };
    }

    // ---------- frame ----------
    render(dt, alpha, opts) {
      const sim = this.sim, p = sim.p, cam = this.cam, r = this.r;
      this.time += dt;
      const time = this.time;

      // Environment crossfade
      if (this.envT < 3) {
        this.envT += dt;
        const k = clamp(this.envT / 2.4, 0, 1), e = k * k * (3 - 2 * k), to = S.ENVS[this.env], from = this.envFrom, pal = this.pal;
        for (const key of ['top', 'mid', 'hor', 'sun', 'fog', 'hemiS', 'hemiG', 'light', 'colA', 'colB', 'fogR'])
          for (let i = 0; i < pal[key].length; i++) pal[key][i] = lerp(from[key][i], to[key][i], e);
        pal.stars = lerp(from.stars, to.stars, e);
        if (this.envT >= 3) cam.floorY = cam.y;
      }

      // Interpolated player
      const ix = p.px + S.wrapD(p.x - p.px) * alpha;
      const iy = p.py + (p.y - p.py) * alpha;

      // Camera
      const mode = CAM_MODES[opts.camMode];
      const K = 1 - Math.exp(-5 * dt);
      cam.D += (mode.D - cam.D) * K;
      cam.pitch += (mode.pitch - cam.pitch) * K;
      cam.yOff += (mode.yOff - cam.yOff) * K;
      cam.sway += (mode.sway - cam.sway) * K;

      const targetTh = ix / R + (opts.camMode === 'play' ? (p.vx / R) * 0.11 : 0);
      if (!sim.dead) cam.th += wrapAngle(targetTh - cam.th) * (1 - Math.exp(-9 * dt));
      let targetY = iy + cam.yOff;
      if (opts.camMode === 'play' && p.vy > 0) targetY += p.vy * 0.05;
      if (!sim.dead) {
        const rate = targetY > cam.y ? 7 : 4;
        cam.y += (targetY - cam.y) * (1 - Math.exp(-rate * dt));
      }
      cam.y = Math.max(cam.y, sim.lavaY + 7);
      cam.shake = Math.max(0, cam.shake - dt * 2.6);
      cam.kick = Math.max(0, cam.kick - dt * 1.4);

      const shake = this.shakeEnabled ? cam.shake * cam.shake * 0.55 : 0;
      const th = cam.th + Math.sin(time * 0.45) * cam.sway + Math.sin(time * 41) * shake * 0.02;
      const rad = R + cam.D;
      const eyeY = cam.y + cam.D * Math.tan(cam.pitch) + Math.sin(time * 53) * shake * 0.5;
      const oy = eyeY;
      this.oy = oy;

      const v = this.view;
      const sn = Math.sin(th), cs = Math.cos(th);
      v.eye[0] = sn * rad; v.eye[1] = 0; v.eye[2] = cs * rad;
      v.at[0] = sn * R; v.at[1] = cam.y - oy; v.at[2] = cs * R;
      v.aspect = r.aspect;
      const tanH = 0.344 * (1 + cam.kick * 0.08 + (p.boost > 0 ? 0.05 : 0));
      v.tanV = clamp(tanH / r.aspect, 0.42, 0.86);
      r.computeView(v);

      // Light rig follows the camera so the visible side of the tower is always well lit.
      const F = this.frame;
      const lx = 0.42, ly = 0.74, lz = 0.53;
      F.sunD[0] = lx * cs + lz * sn; F.sunD[1] = ly; F.sunD[2] = -lx * sn + lz * cs;
      F.camDir[0] = sn; F.camDir[2] = cs;
      F.oy = oy; F.time = time;
      F.theme = opts.theme || this.theme;

      this._platforms(oy, th, time);
      this._pickups(oy, th, time, opts);
      this._drawPlayer(dt, ix, iy, oy, th, opts);
      this._decor(oy);
      this._ambient(dt, th);

      this.fx.budget = this.quality;
      r.setParticles(this.fx.out, this.fx.update(dt, oy));

      const lavaY = sim.lavaY;
      const gap = iy - lavaY;
      const proj = r.project(v, sn * R, lavaY - oy, cs * R);
      F.lavaY = lavaY - oy;
      F.lavaVisible = lavaY - oy > -90;
      F.lavaG = clamp(1.25 - (cam.y - lavaY) / 30, 0, 1.25);
      F.heat = clamp(1 - gap / 20, 0, 1);
      F.lavaS = proj[2] > 0 ? proj[1] : -1;
      F.warn = opts.camMode === 'play' && !sim.dead ? clamp(1 - (gap - 1.5) / 7, 0, 1) : 0;
      this.flash = Math.max(0, this.flash - dt * 2.4);
      F.flash = this.flash;
      F.flashC = this.flashC;
      F.shadow[0] = Math.sin(ix / R) * R; F.shadow[1] = iy - oy; F.shadow[2] = Math.cos(ix / R) * R;
      F.shadow[3] = sim.dead ? 0 : 1;
      r.render(F);
    }

    _platforms(oy, th0, time) {
      const sim = this.sim, r = this.r;
      for (let i = 0; i < sim.plats.length; i++) {
        const q = sim.plats[i];
        let y = q.y;
        const dy = y - oy;
        if (dy < -38 || dy > 26) continue;
        let th = q.x / R;
        const dTh = Math.abs(wrapAngle(th - th0));
        if (dTh > 2.55) continue;
        let scale = 1, tilt = 0, flash = 0;
        if (dTh > 2.1) scale = (2.55 - dTh) / 0.45;
        if (q.state === 2) {
          if (q.type === T.BOOM || q.goneT > 0.75) continue;
          const t = q.goneT;
          y -= 22 * t * t;
          tilt = (q.seed - 0.5) * t * 1.6;
          scale *= 1 - t * 0.5;
        } else if (q.state === 1) {
          if (q.type === T.CRUMBLE) {
            th += Math.sin(time * 76 + q.seed * 9) * 0.0085;
            y += Math.sin(time * 91) * 0.035;
            flash = 0.8;
          } else {
            const k = 1 - q.t / q.fuse;
            flash = (0.5 + 0.5 * Math.sin(time * (9 + k * 34))) * (0.4 + k * 0.6);
            th += Math.sin(time * 70) * 0.004 * k;
          }
        }
        if (q.spawn < 1) {
          const k = q.spawn - 1;
          scale *= 1 + 2.7 * k * k * k + 1.7 * k * k;
        }
        const tl = sim.time - q.tLand;
        if (tl < 0.5) y -= 0.24 * Math.exp(-tl * 9) * Math.cos(tl * 24);
        r.plat(th, q.hw, y - oy, q.type, Math.max(0.001, scale), tilt, flash, q.seed);

        if (q.state === 2 || dTh > 1.8) continue;
        const [wx, , wz] = this.wp(q.x, 0, 0);
        const yaw = q.x / R;
        if (q.type === T.JUMP) {
          const hop = Math.abs(Math.sin(time * 4 + q.seed * 6)) * 0.22;
          const k = tl < 0.3 ? 1 + (0.3 - tl) * 3 : 1;
          trs(m, wx, y - oy + 0.14 + hop, wz, yaw, 0, 0.48 * k, 0.72 * k, 0.48 * k);
          r.rigid(M.CONE, m, 0.74, 1, 0.42, 0.65, 0.2);
        } else if (q.type === T.BOOM) {
          const on = q.state === 1 ? flash : 0.15 + 0.15 * Math.sin(time * 3 + q.seed * 7);
          trs(m, wx, y - oy + 0.17, wz, 0, 0, 0.3, 0.3, 0.3);
          r.rigid(M.SPHERE, m, 1, 0.22, 0.12, 0.35 + on * 2.2, 0.5);
        }
        if (q.beacon) {
          trs(m, wx, y - oy + 1.5 + Math.sin(time * 2.3) * 0.14, wz, time * 1.5, 0, 0.42, 0.68, 0.42);
          r.rigid(M.GEM, m, 0.5, 0.93, 1, 1.05, 1);
          const pulse = 1 + 0.08 * Math.sin(time * 4);
          trs(m, wx, y - oy + 0.1, wz, 0, 0, 1.15 * pulse, 0.5, 1.15 * pulse);
          r.rigid(M.TORUS, m, 0.5, 0.93, 1, 1, 0.5);
        }
      }
      // Rings around the tower mark rewards and the player's own record.
      for (let i = 0; i < sim.plats.length; i++) {
        const q = sim.plats[i];
        if (q.side || !MILE[q.floor] || q.floor <= sim.floor) continue;
        const dy = q.y - oy;
        if (dy < -38 || dy > 26) continue;
        const s = R + 1.75 + Math.sin(time * 2) * 0.06;
        trs(m, 0, dy + 0.22, 0, time * 0.3, 0, s, 0.22, s);
        r.rigid(M.TORUS, m, 1, 0.82, 0.3, 1.1, 0.5);
      }
      this.bestScreen = null;
      if (sim.bestY !== null && sim.bestFloor > sim.floor) {
        const dy = sim.bestY - oy;
        if (dy > -38 && dy < 26) {
          const s = R + 1.95;
          trs(m, 0, dy + 0.3, 0, -time * 0.3, 0, s, 0.3, s);
          r.rigid(M.TORUS, m, 1, 0.36, 0.56, 1.25, 0.5);
          const sn = Math.sin(th0), cs = Math.cos(th0);
          const pr = r.project(this.view, sn * s, dy + 0.3, cs * s);
          if (pr[2] > 0) this.bestScreen = pr;
        }
      }
    }

    _pickups(oy, th0, time) {
      const sim = this.sim, r = this.r;
      for (let i = 0; i < sim.coins.length; i++) {
        const c = sim.coins[i];
        const dy = c.y - oy;
        if (dy < -34 || dy > 24) continue;
        const th = c.x / R;
        if (Math.abs(wrapAngle(th - th0)) > 1.7) continue;
        const bob = Math.sin(time * 3 + c.seed * 6) * 0.1;
        trs(m, Math.sin(th) * R, dy + bob, Math.cos(th) * R, th + time * 3.2 + c.seed * 6, 0, 0.42, 0.42, 0.42);
        r.rigid(M.COIN, m, 1, 0.78, 0.2, 0.34, 0.9);
      }
    }

    _drawPlayer(dt, ix, iy, oy, th0, opts) {
      const sim = this.sim, p = sim.p, st = this.anim;
      if (dt > 0) {
        // Substepped so the squash spring stays stable during frame-rate dips.
        const ks = 190, cs = 15, n = Math.ceil(dt / 0.008), h = dt / n;
        for (let i = 0; i < n; i++) {
          st.sv += (-ks * st.sq - cs * st.sv) * h;
          st.sq += st.sv * h;
        }
      }
      const speed = Math.abs(p.vx);
      st.grounded = p.grounded;
      st.runAmt = damp(st.runAmt || 0, p.grounded ? clamp(speed / C.RUN, 0, 1) : 0, 14, dt);
      st.phase += speed * dt * 1.75;
      st.air = damp(st.air, p.grounded ? 0 : 1, 16, dt);
      st.handUp = damp(st.handUp || 0, !p.grounded && p.vy > 1 ? 1 : 0, 14, dt);
      st.flail = damp(st.flail || 0, !p.grounded && p.vy < -14 ? 1 : 0, 10, dt);
      st.lean = damp(st.lean, clamp(-p.vx * 0.024, -0.3, 0.3), 12, dt);
      const faceTarget = speed > 0.3 ? (p.vx > 0 ? 0.8 : -0.8) : 0;
      st.yaw = damp(st.yaw, faceTarget, 12, dt);
      st.blink -= dt;
      st.blinkT = Math.max(0, st.blinkT - dt);
      if (st.blink <= 0) { st.blink = 1.8 + Math.random() * 3; st.blinkT = 0.11; }

      const skin = opts.skin || this.skin;
      if (sim.dead) {
        st.deadT += dt;
        if (st.deadT > 0.55) return;
      }
      const th = ix / R;
      const sn = Math.sin(th), cs = Math.cos(th);
      let yaw = th + st.yaw;
      if (opts.camMode === 'custom' || opts.camMode === 'theme') {
        st.customYaw += dt;
        yaw = th + Math.sin(st.customYaw * 0.8) * 0.45 + (opts.dragYaw || 0);
      } else if (opts.camMode === 'menu') {
        yaw = th + Math.sin(this.time * 0.8) * 0.3;
      }
      const sink = sim.dead ? st.deadT * 1.6 : 0;
      this.drawCharacter(skin, sn * R, iy - oy - sink, cs * R, yaw, st);

      if (dt > 0 && !sim.dead && opts.camMode === 'play') {
        const tc = skin.trail;
        const fast = p.boost > 0;
        if (fast || Math.abs(p.vy) > 15) {
          const n = fast ? 2 : 1;
          for (let i = 0; i < n; i++)
            this.fx.emit(sn * R + (Math.random() - 0.5) * 0.5, iy + 0.3 + Math.random() * 0.9, cs * R + (Math.random() - 0.5) * 0.5, 0, 0.3, 0, 0.32, 0.46, 0.05, fast ? 0.45 : tc[0], fast ? 0.85 : tc[1], fast ? 1 : tc[2], 0.85, 0, true);
        }
      }
    }

    _decor(oy) {
      const list = this.decor[this.env], prev = this.decor[this.prevEnv], r = this.r;
      const e = this.envT;
      const parallax = (this.cam.y - this.cam.floorY) * 0.05;
      const drawList = (l, sc) => {
        if (sc <= 0.01) return;
        for (let i = 0; i < l.length; i++) {
          const d = l[i];
          trs(m, d.x, d.y - parallax + (1 - sc) * -30 - (oy - this.cam.y) * 0, d.z, d.yaw, 0, d.sx * sc, d.sy * sc, d.sz * sc);
          r.rigid(d.mesh, m, d.col[0], d.col[1], d.col[2], d.em, d.gl);
        }
      };
      if (this.env !== this.prevEnv && e < 1) drawList(prev, 1 - e);
      const k = e < 0.9 ? 0 : clamp((e - 0.9) / 1.4, 0, 1);
      drawList(list, this.env === this.prevEnv ? 1 : k * k * (3 - 2 * k));
    }

    _ambient(dt, th0) {
      if (dt <= 0) return;
      const fx = this.fx, cam = this.cam, sim = this.sim;
      const env = S.ENVS[this.env].amb;
      const rate = { wisp: 2.5, sand: 26, snow: 30, ember: 24, dust: 14 }[env] * this.quality;
      this.ambT += dt * rate;
      while (this.ambT > 1) {
        this.ambT -= 1;
        const a = th0 + (Math.random() - 0.5) * 1.7, rd = R + 2 + Math.random() * 11;
        const x = Math.sin(a) * rd, z = Math.cos(a) * rd, y = cam.y + (Math.random() - 0.4) * 34;
        if (env === 'wisp') fx.emit(x, y, z, 0.9, 0, 0, 3.5, 3.2, 4.8, 1, 1, 1, 0.16, 0, false);
        else if (env === 'sand') fx.emit(x, y, z, 9 + Math.random() * 6, Math.random() * 1.5, 2, 1.5, 0.13, 0.13, 1, 0.84, 0.56, 0.6, 0, false);
        else if (env === 'snow') fx.emit(x, y, z, 1.6, -3.2 - Math.random() * 2, 0.8, 2.4, 0.2, 0.2, 1, 1, 1, 0.9, 0, false);
        else if (env === 'ember') fx.emit(x, y - 6, z, 0.5, 3 + Math.random() * 3.5, 0.5, 2.2, 0.2, 0.04, 1, 0.55, 0.15, 1, 0, true);
        else fx.emit(x, y, z, 0, 0.2, 0, 2.8, 0.13, 0.13, 0.75, 0.82, 1, 0.8, 0, true);
      }
      // Sparks off the lava surface, only when it is close enough to see.
      if (sim.lavaY > cam.y - 34) {
        this.emberT += dt * 34 * this.quality;
        while (this.emberT > 1) {
          this.emberT -= 1;
          const a = th0 + (Math.random() - 0.5) * 1.6, rd = R - 2 + Math.random() * 12;
          fx.emit(Math.sin(a) * rd, sim.lavaY + 0.2, Math.cos(a) * rd, (Math.random() - 0.5) * 1.8, 3.5 + Math.random() * 7.5, (Math.random() - 0.5) * 1.8,
            1 + Math.random() * 0.9, 0.28, 0.05, 1, 0.48 + Math.random() * 0.3, 0.1, 1, 1.5, true);
        }
      }
    }
  }
  S.Scene = Scene;
})();
