// Simple autoplayer used for balancing tests and for `?bot=0.7` visual soak runs.
(function () {
  'use strict';
  const S = window.SKY;
  S.Bot = class {
    constructor(skill, seed) {
      this.skill = skill;
      this.rng = S.mulberry(seed || 7);
      this.out = { move: 0, jump: false };
      this.wait = 0;
      this.cur = 0;
      this.wasAir = false;
    }
    update(sim, dt) {
      const p = sim.p, o = this.out;
      if (p.grounded) this.cur = p.ground.floor;
      else if (p.forced) {
        if (!this.launched) {
          const pad = sim.findGolden(this.cur + 1);
          if (pad && pad.type === S.PT.JUMP && pad.y <= p.y + 0.5) this.cur++;
        }
        this.launched = true;
      }
      else if (this.launched && p.vy <= 0) {
        // Coming down from a jump pad: aim for the highest golden platform below the feet.
        this.launched = false;
        let f = this.cur;
        for (const q of sim.plats) {
          if (q.side || q.state === 2 || q.type === S.PT.JUMP || q.y >= p.y - 0.3 || q.floor <= f) continue;
          const reach = Math.abs(S.wrapD(q.x - p.x)) - q.hw;
          if (reach < 4) f = q.floor;
        }
        this.cur = f - 1;
      }
      if (p.grounded) this.launched = false;
      const t = sim.findGolden(this.cur + 1);
      if (!t) { o.move = 0; o.jump = false; return o; }
      const dx = S.wrapD(t.x - p.x), dir = Math.sign(dx), adx = Math.abs(dx);
      if (!p.grounded) {
        this.wasAir = true;
        o.move = adx > 0.4 ? dir : 0;
        o.jump = p.vy > 0;
        return o;
      }
      if (this.wasAir) {
        this.wasAir = false;
        const base = 0.42 - 0.34 * this.skill;
        this.wait = base * (0.6 + this.rng() * 0.8);
      }
      this.wait -= dt;
      if (this.wait > 0 && p.ground.state === 0) { o.move = 0; o.jump = false; return o; }
      if (t.state === 2) { o.move = 0; o.jump = false; return o; }
      o.move = adx > t.hw * 0.4 ? dir : 0;
      const edge = adx - t.hw + 0.1;
      const canReach = edge <= S.reachFor(t.y - p.y) * 0.85;
      o.jump = canReach;
      return o;
    }
  };
})();
