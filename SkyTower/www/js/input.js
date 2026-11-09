// Multi-touch controls: floating stick plus jump zone, or a single-thumb mode.
(function () {
  'use strict';
  const S = window.SKY;
  const STICK_R = 62, DEAD = 0.1;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  class Input {
    constructor(els) {
      this.els = els;
      this.state = { move: 0, jump: false };
      this.touchMove = 0;
      this.touchJump = false;
      this.keys = new Set();
      this.oneHand = false;
      this.movePtr = null;
      this.jumpPtr = null;
      this.ox = 0;
      this.oy = 0;
      this.enabled = false;
      this.onJumpDown = null;
      this._bind();
    }

    configure(swap, oneHand) {
      const { root } = this.els;
      this.oneHand = oneHand;
      root.classList.toggle('swap', swap && !oneHand);
      root.classList.toggle('onehand', oneHand);
      this.reset();
    }

    reset() {
      this.touchMove = 0;
      this.touchJump = false;
      this.movePtr = null;
      this.jumpPtr = null;
      this.keys.clear();
      this._baseDx = this._baseDy = 0;
      this.state.move = 0;
      this.state.jump = false;
      this._knob(0, 0);
      this.els.base.classList.remove('active');
      this.els.base.style.transform = '';
      this.els.jump.classList.remove('down');
    }

    _knob(x, y) {
      this.els.knob.style.transform = `translate(${x}px,${y}px)`;
    }

    _bind() {
      const { move, jumpZone } = this.els;
      const down = (e) => {
        if (!this.enabled || this.movePtr !== null) return;
        e.preventDefault();
        this.movePtr = e.pointerId;
        try { move.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
        const r = this.els.base.getBoundingClientRect();
        const cx = r.left + r.width / 2 - (this._baseDx || 0), cy = r.top + r.height / 2 - (this._baseDy || 0);
        this.ox = e.clientX;
        this.oy = e.clientY;
        this._baseDx = e.clientX - cx;
        this._baseDy = e.clientY - cy;
        this.els.base.style.transform = `translate(${this._baseDx}px,${this._baseDy}px)`;
        this.els.base.classList.add('active');
        this._knob(0, 0);
      };
      const moveH = (e) => {
        if (e.pointerId !== this.movePtr) return;
        e.preventDefault();
        const dx = e.clientX - this.ox, dy = e.clientY - this.oy;
        const nx = clamp(dx / STICK_R, -1, 1);
        const mag = Math.abs(nx);
        this.touchMove = mag < DEAD ? 0 : Math.sign(nx) * Math.pow((mag - DEAD) / (1 - DEAD), 0.75);
        const l = Math.hypot(dx, dy), k = l > STICK_R ? STICK_R / l : 1;
        this._knob(dx * k, dy * k);
        if (this.oneHand) {
          // Pushing the thumb up acts as the jump button; hysteresis avoids flicker.
          if (!this.touchJump && dy < -26) this._setJump(true);
          else if (this.touchJump && dy > -12) this._setJump(false);
        }
      };
      const up = (e) => {
        if (e.pointerId !== this.movePtr) return;
        this.movePtr = null;
        this.touchMove = 0;
        if (this.oneHand) this._setJump(false);
        this._knob(0, 0);
        this.els.base.classList.remove('active');
        this.els.base.style.transform = '';
        this._baseDx = this._baseDy = 0;
      };
      move.addEventListener('pointerdown', down);
      move.addEventListener('pointermove', moveH);
      move.addEventListener('pointerup', up);
      move.addEventListener('pointercancel', up);

      jumpZone.addEventListener('pointerdown', (e) => {
        if (!this.enabled || this.jumpPtr !== null) return;
        e.preventDefault();
        this.jumpPtr = e.pointerId;
        try { jumpZone.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
        this._setJump(true);
      });
      const jumpUp = (e) => {
        if (e.pointerId !== this.jumpPtr) return;
        this.jumpPtr = null;
        this._setJump(false);
      };
      jumpZone.addEventListener('pointerup', jumpUp);
      jumpZone.addEventListener('pointercancel', jumpUp);

      window.addEventListener('keydown', (e) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'd', 'w', 'A', 'D', 'W'].includes(e.key)) {
          if (this.enabled) e.preventDefault();
          this.keys.add(e.key.toLowerCase());
        }
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    }

    _setJump(v) {
      this.touchJump = v;
      this.els.jump.classList.toggle('down', v);
    }

    poll() {
      const k = this.keys;
      let keyMove = 0;
      if (k.has('arrowleft') || k.has('a')) keyMove -= 1;
      if (k.has('arrowright') || k.has('d')) keyMove += 1;
      const keyJump = k.has(' ') || k.has('arrowup') || k.has('w');
      this.state.move = keyMove || this.touchMove;
      this.state.jump = keyJump || this.touchJump;
      return this.state;
    }
  }
  S.Input = Input;
})();
