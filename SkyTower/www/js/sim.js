// Deterministic game simulation: player physics, platform generation, lava.
// No DOM or GL here, so tests can drive it headlessly at full speed.
(function () {
  'use strict';
  const S = window.SKY;
  const C = S.CFG;
  const T = (S.PT = { NORMAL: 0, ICE: 1, JUMP: 2, CRUMBLE: 3, SPEED: 4, BOOM: 5 });

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  const wrapD = (S.wrapD = (d) => {
    const c = C.CIRC;
    d = (d + c / 2) % c;
    if (d < 0) d += c;
    return d - c / 2;
  });

  // Horizontal distance covered by a fully held jump from a standstill that lands dy higher.
  // Generated from the same gravity rules the player uses, so the generator cannot drift from the physics.
  const REACH = (function () {
    const samples = [];
    let y = 0, vy = C.JUMP_V, vx = 0, x = 0;
    for (let i = 0; i < 900 && y > -0.5; i++) {
      let g = vy > 0 ? C.GRAV_UP : C.GRAV_DOWN;
      if (Math.abs(vy) < C.APEX_V) g *= C.GRAV_APEX;
      vy = Math.max(vy - g * C.DT, -C.MAX_FALL);
      y += vy * C.DT;
      vx = Math.min(C.RUN, vx + C.AIR_ACCEL * C.DT);
      x += vx * C.DT;
      if (vy < 0) samples.push([y, x]);
    }
    const table = [];
    for (let i = 0; i <= 100; i++) {
      const dy = i * 0.05;
      let r = 0;
      for (let k = 0; k < samples.length; k++) if (samples[k][0] >= dy) r = samples[k][1];
      table.push(r);
    }
    return table;
  })();
  S.reachFor = (dy) => {
    if (dy <= 0) return REACH[0];
    return REACH[clamp(Math.ceil(dy / 0.05), 0, REACH.length - 1)];
  };
  S.difficulty = (f) => 1 - Math.exp(-f / 120);

  const COMBOS = [
    [T.CRUMBLE, T.CRUMBLE, T.CRUMBLE],
    [T.ICE, T.ICE, T.CRUMBLE],
    [T.SPEED, T.BOOM, T.BOOM],
    [T.ICE, T.JUMP, T.ICE],
    [T.BOOM, T.CRUMBLE, T.BOOM],
    [T.CRUMBLE, T.ICE, T.CRUMBLE, T.BOOM],
    [T.SPEED, T.ICE, T.ICE, T.ICE],
  ];
  const isHazard = (t) => t === T.ICE || t === T.CRUMBLE || t === T.BOOM;
  const FIRST_FLOOR = { 6: T.JUMP, 8: T.ICE, 13: T.CRUMBLE, 19: T.SPEED, 27: T.BOOM };
  const MILESTONE_FLOOR = {};
  S.MILESTONES.forEach((m) => (MILESTONE_FLOOR[m.floor] = true));

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  S.mulberry = mulberry;

  class Sim {
    constructor(emit) {
      this.emit = emit || function () {};
      this.platPool = [];
      this.coinPool = [];
      this.plats = [];
      this.coins = [];
      this.p = {};
      this.bestFloor = 0;
      this.reset(1, 0);
    }

    reset(seed, bestFloor) {
      while (this.plats.length) this.platPool.push(this.plats.pop());
      while (this.coins.length) this.coinPool.push(this.coins.pop());
      this.rng = mulberry(seed);
      this.bestFloor = bestFloor || 0;
      this.bestY = null;
      this.time = 0;
      this.runTime = 0;
      this.started = false;
      this.dead = false;
      this.floor = 0;
      this.maxY = 0;
      this.coinCount = 0;
      this.lavaY = C.LAVA_START;
      this.lavaV = 0;
      this.slowT = 0;
      this.warned = false;
      this.genFloor = 0;
      this.dir = this.rng() < 0.5 ? -1 : 1;
      this.hazardRun = 0;
      this.combo = [];
      this.comboCool = 20;
      this.forceUntil = 0;
      const first = this._plat(0, 0, 4.4, T.NORMAL, 0, false);
      this.last = first;
      Object.assign(this.p, {
        x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
        grounded: true, ground: first, coyote: 0, buffer: 0,
        held: false, forced: false, boost: 0, lock: 0, face: 1,
      });
      this._generate();
    }

    _r(a, b) { return a + (b - a) * this.rng(); }

    _plat(x, y, hw, type, floor, side) {
      const q = this.platPool.pop() || {};
      q.x = ((x % C.CIRC) + C.CIRC) % C.CIRC;
      q.y = y; q.hw = hw; q.type = type; q.floor = floor; q.side = side;
      q.state = 0;        // 0 solid, 1 triggered, 2 gone
      q.t = 0;
      q.goneT = 0;
      q.spawn = 1;
      q.tLand = -9;
      q.beacon = false;
      q.seed = this.rng();
      this.plats.push(q);
      return q;
    }

    _coin(x, y) {
      const c = this.coinPool.pop() || {};
      c.x = ((x % C.CIRC) + C.CIRC) % C.CIRC;
      c.y = y;
      c.seed = this.rng();
      this.coins.push(c);
    }

    _pickType(f, d) {
      if (FIRST_FLOOR[f] !== undefined) return FIRST_FLOOR[f];
      if (this.combo.length) return this.combo.shift();
      this.comboCool--;
      if (f > 35 && this.comboCool <= 0 && this.rng() < 0.12 + d * 0.3) {
        this.combo = COMBOS[Math.floor(this.rng() * COMBOS.length)].slice();
        this.comboCool = Math.round(lerp(14, 6, d));
        return this.combo.shift();
      }
      const wNormal = lerp(100, 30, d);
      const opts = [[T.NORMAL, wNormal]];
      const hazOk = this.hazardRun < (d > 0.85 ? 3 : d > 0.45 ? 2 : 1);
      if (f >= 6) opts.push([T.JUMP, 8 + 6 * d]);
      if (f >= 19) opts.push([T.SPEED, 7 + 8 * d]);
      if (hazOk && f >= 8) opts.push([T.ICE, 8 + 22 * d]);
      if (hazOk && f >= 13) opts.push([T.CRUMBLE, 9 + 22 * d]);
      if (hazOk && f >= 27) opts.push([T.BOOM, 6 + 22 * d]);
      let total = 0;
      for (const o of opts) total += o[1];
      let roll = this.rng() * total;
      for (const o of opts) {
        roll -= o[1];
        if (roll <= 0) return o[0];
      }
      return T.NORMAL;
    }

    _generateFloor() {
      const a = this.last;
      const f = ++this.genFloor;
      const d = S.difficulty(f);
      const special = f % 10 === 0 || MILESTONE_FLOOR[f];

      const prevHazard = a.type === T.CRUMBLE || a.type === T.BOOM;
      let dy = lerp(2.15, 3.0, d) + this._r(-0.2, 0.2);
      if (prevHazard) dy = Math.min(dy, 2.7);
      dy = Math.min(dy, C.MAX_DY);

      let hw = lerp(2.7, 1.4, d) * this._r(0.9, 1.15);
      let type = special ? T.NORMAL : this._pickType(f, d);
      if (special) hw = Math.max(hw, 2.6);
      if (type === T.JUMP) hw = Math.max(hw, 1.6);
      hw = Math.max(hw, 1.25);
      this.hazardRun = isHazard(type) ? this.hazardRun + 1 : 0;

      // Edge-to-edge gap, bounded by what a real jump covers from a standstill.
      let maxGap = S.reachFor(dy) * C.REACH_MARGIN;
      if (a.type === T.ICE) maxGap *= 0.82;
      if (prevHazard) maxGap *= 0.8;
      const gap = this._r(lerp(-0.45, 0.18, d), lerp(0.38, 0.95, d)) * maxGap;

      if (this.rng() < 0.27) this.dir = -this.dir;
      const offset = Math.max(a.hw + hw + gap, Math.min(a.hw, hw) * 0.8);
      const x = a.x + this.dir * offset;
      const y = a.y + dy;
      const b = this._plat(x, y, hw, type, f, false);
      b.beacon = !!special;
      if (f === this.bestFloor) this.bestY = y;

      // Coins follow the jump arc between the platforms.
      if (this.rng() < 0.5) {
        const n = 1 + Math.floor(this.rng() * 3);
        for (let i = 0; i < n; i++) {
          const t = (i + 1) / (n + 1);
          this._coin(a.x + this.dir * offset * t, lerp(a.y, y, t) + Math.sin(t * Math.PI) * 1.7 + 0.9);
        }
      }

      // Optional side platform: more choices, never needed to progress.
      if (f > 2 && this.rng() < lerp(0.4, 0.25, d)) {
        const sw = this._r(1.4, 2.2);
        const sx = a.x - this.dir * (a.hw + sw + this._r(0.5, maxGap * 0.7));
        const sy = y + this._r(-0.4, 0.4);
        const roll = this.rng();
        const st = f < 8 ? T.NORMAL : roll < 0.55 ? T.NORMAL : roll < 0.75 ? T.ICE : roll < 0.9 ? T.JUMP : T.SPEED;
        this._plat(sx, sy, sw, st, f, true);
        const n = 2 + Math.floor(this.rng() * 2);
        for (let i = 0; i < n; i++) this._coin(sx + (i - (n - 1) / 2) * 0.95, sy + 1.25);
      }
      this.last = b;
    }

    _generate() {
      while (this.last.y < this.p.y + 46) this._generateFloor();
    }

    findGolden(floor) {
      for (const q of this.plats) if (q.floor === floor && !q.side) return q;
      return null;
    }

    _supports(q, x) {
      return q.state !== 2 && Math.abs(wrapD(x - q.x)) <= q.hw + C.LAND_SLOP;
    }

    _jump(p) {
      p.vy = C.JUMP_V;
      p.grounded = false;
      p.ground = null;
      p.coyote = 0;
      p.buffer = 0;
      p.forced = false;
      this.emit('jump');
    }

    _land(q) {
      const p = this.p;
      const impact = -p.vy;
      p.y = q.y;
      p.vy = 0;
      p.grounded = true;
      p.ground = q;
      p.coyote = 0;
      p.forced = false;
      q.tLand = this.time;
      this.emit('land', q, impact);
      if (q.y > this.maxY) this.maxY = q.y;
      if (q.floor > this.floor) {
        this.floor = q.floor;
        this.emit('floor', q);
      }
      if (q.beacon) {
        q.beacon = false;
        this.slowT = Math.max(this.slowT, C.BEACON_SLOW_T);
        this.emit('beacon', q);
      }
      const d = S.difficulty(q.floor);
      if (q.type === T.JUMP) {
        p.vy = C.PAD_V;
        p.grounded = false;
        p.ground = null;
        p.forced = true;
        p.buffer = 0;
        this.emit('pad', q);
      } else if (q.type === T.SPEED) {
        p.boost = C.BOOST_T;
        this.emit('speed', q);
      } else if (q.type === T.CRUMBLE && q.state === 0) {
        q.state = 1;
        q.t = lerp(0.72, 0.46, d);
        this.emit('crumble', q);
      } else if (q.type === T.BOOM && q.state === 0) {
        q.state = 1;
        q.t = lerp(1.25, 0.78, d);
        q.fuse = q.t;
        this.emit('fuse', q);
      }
    }

    _gone(q) {
      q.state = 2;
      q.t = C.RESPAWN;
      q.goneT = 0;
    }

    _boom(q) {
      this._gone(q);
      const p = this.p;
      const dx = wrapD(p.x - q.x);
      const hit = Math.abs(dx) < q.hw + 1.4 && Math.abs(p.y - q.y) < 2.6;
      if (hit) {
        p.grounded = false;
        p.ground = null;
        p.vx = (dx >= 0 ? 1 : -1) * 15;
        p.vy = 9;
        p.lock = 0.24;
        p.forced = true;
      }
      this.emit('boom', q, hit);
    }

    _world(dt) {
      const p = this.p;
      for (let i = this.plats.length - 1; i >= 0; i--) {
        const q = this.plats[i];
        if (q.state === 1) {
          q.t -= dt;
          if (q.t <= 0) {
            if (q.type === T.CRUMBLE) {
              this._gone(q);
              this.emit('collapse', q);
            } else this._boom(q);
          }
        } else if (q.state === 2) {
          q.t -= dt;
          q.goneT += dt;
          if (q.t <= 0) {
            q.state = 0;
            q.spawn = 0;
          }
        }
        if (q.spawn < 1) q.spawn = Math.min(1, q.spawn + dt * 3.2);
        if (q.y < this.lavaY - 9 && q !== this.last) {
          if (p.ground === q) { p.ground = null; p.grounded = false; }
          this.platPool.push(q);
          this.plats[i] = this.plats[this.plats.length - 1];
          this.plats.pop();
        }
      }
      for (let i = this.coins.length - 1; i >= 0; i--) {
        if (this.coins[i].y < this.lavaY - 4) {
          this.coinPool.push(this.coins[i]);
          this.coins[i] = this.coins[this.coins.length - 1];
          this.coins.pop();
        }
      }
      if (this.started && !this.dead) {
        this.runTime += dt;
        let v = C.LAVA_V0 + (C.LAVA_VMAX - C.LAVA_V0) * (1 - Math.exp(-this.runTime / C.LAVA_TAU));
        if (this.runTime < 3) v *= 0.5;
        const gap = this.maxY - this.lavaY;
        if (gap > C.LAVA_RUB) v *= 1 + Math.min(1.6, (gap - C.LAVA_RUB) / 12);
        if (this.slowT > 0) {
          this.slowT -= dt;
          v *= C.LAVA_SLOW;
        }
        this.lavaV = v;
        this.lavaY += v * dt;
      }
    }

    step(inp) {
      const dt = C.DT, p = this.p;
      this.time += dt;
      if (this.dead) {
        this._world(dt);
        return;
      }
      p.px = p.x;
      p.py = p.y;

      const move = clamp(inp.move, -1, 1);
      if (!this.started && (Math.abs(move) > 0.1 || inp.jump)) this.started = true;
      if (inp.jump && !p.held) p.buffer = C.BUFFER;
      p.held = inp.jump;
      p.buffer = Math.max(0, p.buffer - dt);
      p.coyote = Math.max(0, p.coyote - dt);
      p.lock = Math.max(0, p.lock - dt);
      p.boost = Math.max(0, p.boost - dt);

      if (p.grounded && !this._supports(p.ground, p.x)) {
        p.grounded = false;
        p.ground = null;
        p.coyote = C.COYOTE;
      }

      const mv = p.lock > 0 ? 0 : move;
      const surf = p.grounded ? p.ground.type : -1;
      const max = C.RUN * (p.boost > 0 ? C.BOOST_MUL : 1);
      const target = mv * max;
      let acc;
      if (surf === T.ICE) acc = mv !== 0 ? C.ICE_ACCEL : C.ICE_DECEL;
      else if (p.grounded) acc = mv !== 0 ? (mv * p.vx < 0 ? C.DECEL : C.ACCEL) : C.DECEL;
      else acc = mv !== 0 ? C.AIR_ACCEL : C.AIR_DECEL;
      p.vx = approach(p.vx, target, acc * dt);
      if (Math.abs(mv) > 0.05) p.face = mv > 0 ? 1 : -1;

      if (p.buffer > 0 && (p.grounded || p.coyote > 0)) this._jump(p);

      if (!p.grounded) {
        let g;
        if (p.vy > 0) g = p.held || p.forced ? C.GRAV_UP : C.GRAV_CUT;
        else g = C.GRAV_DOWN;
        if (Math.abs(p.vy) < C.APEX_V && p.held && !p.forced) g *= C.GRAV_APEX;
        p.vy = Math.max(p.vy - g * dt, -C.MAX_FALL);
        if (p.vy <= 0) p.forced = false;
      }

      p.x += p.vx * dt;
      const oy = p.y;
      if (!p.grounded) p.y += p.vy * dt;

      // Platforms are one-way: only a descending player whose feet cross the top collides.
      if (!p.grounded && p.vy <= 0) {
        let best = null;
        for (let i = 0; i < this.plats.length; i++) {
          const q = this.plats[i];
          if (q.state === 2 || q.spawn < 0.6) continue;
          if (oy >= q.y - 0.02 && p.y <= q.y && Math.abs(wrapD(p.x - q.x)) <= q.hw + C.LAND_SLOP) {
            if (!best || q.y > best.y) best = q;
          }
        }
        if (best) this._land(best);
      }

      if (p.x < 0 || p.x >= C.CIRC) {
        const w = ((p.x % C.CIRC) + C.CIRC) % C.CIRC;
        p.px += w - p.x;
        p.x = w;
      }

      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i];
        const dx = wrapD(p.x - c.x), dy = p.y + 0.7 - c.y;
        if (dx * dx + dy * dy < 1.25) {
          this.coinCount++;
          this.emit('coin', c);
          this.coinPool.push(c);
          this.coins[i] = this.coins[this.coins.length - 1];
          this.coins.pop();
        }
      }

      this._world(dt);
      this._generate();

      const gap = p.y - this.lavaY;
      if (!this.warned && this.started && gap < 6.5) {
        this.warned = true;
        this.emit('warn', true);
      } else if (this.warned && gap > 10) {
        this.warned = false;
        this.emit('warn', false);
      }
      if (p.y <= this.lavaY + 0.1) {
        this.dead = true;
        this.emit('dead');
      }
    }
  }
  S.Sim = Sim;
})();
