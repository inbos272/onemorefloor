// DOM screens: menus, HUD, shop, settings. Game flow lives in main.js.
(function () {
  'use strict';
  const S = window.SKY;
  const $ = (id) => document.getElementById(id);
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M9.5 18.5L3.6 12.6l2.5-2.5 3.4 3.4 8.4-8.4 2.5 2.5z"/></svg>';
  const VOL_ROWS = [
    ['master', '전체'], ['bgm', '배경 음악'], ['jump', '점프'], ['land', '착지'], ['coin', '코인'],
    ['collapse', '발판 붕괴'], ['warn', '용암 경고'], ['over', '게임 오버'], ['fx', '기타 효과음'],
  ];
  const VOL_PREVIEW = { jump: 'jump', land: 'land', coin: 'coin', collapse: 'collapse', warn: 'warn', over: 'over', fx: 'pad', master: 'ui' };

  class UI {
    constructor(G) {
      this.G = G;
      this.thumbs = {};
      this.coll = { mode: 'custom', tab: 'skin', sel: null };
      this.bannerT = 0;
      this.toastT = 0;
      this.lastHud = {};
      this._bind();
      this._buildVolumes();
    }

    show(id, keepHud) {
      for (const el of document.querySelectorAll('.screen')) {
        if (keepHud && el.id === 'hud') continue;
        el.classList.toggle('hidden', el.id !== id);
      }
    }
    overlay(id, on) { $(id).classList.toggle('hidden', !on); }

    _bind() {
      const G = this.G;
      // Unlock audio on the first interaction anywhere (iOS requires a user gesture).
      const unlock = () => G.audio.unlock();
      window.addEventListener('pointerdown', unlock, { capture: true });
      window.addEventListener('keydown', unlock, { capture: true });
      document.addEventListener('click', (e) => { if (e.target.closest('button')) G.audio.play('ui'); }, true);

      $('btnPlay').onclick = () => G.startRun();
      $('btnCustom').onclick = () => this.openColl('custom');
      $('btnShop').onclick = () => this.openColl('shop');
      $('btnSettings').onclick = () => this.openSettings();
      $('btnPause').onclick = () => G.pause();
      $('btnResume').onclick = () => G.resumeWithCountdown();
      $('btnRestart').onclick = () => G.startRun();
      $('btnPauseSettings').onclick = () => this.openSettings();
      $('btnQuit').onclick = () => G.toMenu(true);
      $('btnAgain').onclick = () => G.startRun();
      $('btnOverMenu').onclick = () => G.toMenu(false);
      $('btnCollBack').onclick = () => G.toMenu(false);
      $('btnCollAction').onclick = () => this.collAction();
      $('btnSetClose').onclick = () => this.closeSettings();
      $('btnReset').onclick = () => this.overlay('confirm', true);
      $('btnResetNo').onclick = () => this.overlay('confirm', false);
      $('btnResetYes').onclick = () => {
        S.Save.reset();
        this.thumbs = {};
        this.overlay('confirm', false);
        G.applyLoadout();
        this.refreshMenu();
        this.closeSettings();
      };

      const st = () => S.Save.data.settings;
      const wire = (id, key, after) => {
        const el = $(id);
        el.onchange = () => {
          st()[key] = el.checked;
          S.Save.save();
          if (after) after();
        };
      };
      wire('sSwap', 'swap', () => G.applyControls());
      wire('sOne', 'oneHand', () => G.applyControls());
      wire('sHaptic', 'haptics', () => { if (st().haptics) G.vibrate(20); });
      wire('sShake', 'shake', () => G.applyControls());
      if (!navigator.vibrate) $('rowHaptic').classList.add('hidden');
      for (const b of $('sQuality').children) {
        b.onclick = () => {
          st().quality = b.dataset.q;
          S.Save.save();
          G.applyQuality();
          this._syncSettings();
        };
      }

      // Turning the character by dragging the empty area of the customize screen.
      const drag = $('dragArea');
      let lastX = null;
      drag.addEventListener('pointerdown', (e) => { lastX = e.clientX; drag.setPointerCapture(e.pointerId); });
      drag.addEventListener('pointermove', (e) => {
        if (lastX === null) return;
        G.dragYaw += (e.clientX - lastX) * 0.016;
        lastX = e.clientX;
      });
      const end = () => { lastX = null; };
      drag.addEventListener('pointerup', end);
      drag.addEventListener('pointercancel', end);
    }

    _buildVolumes() {
      const list = $('volList');
      const G = this.G;
      for (const [key, label] of VOL_ROWS) {
        const row = document.createElement('label');
        row.className = 'vol';
        row.innerHTML = `<span>${label}</span><input type="range" min="0" max="100" step="5" data-vol="${key}"><output></output>`;
        list.appendChild(row);
        const input = row.querySelector('input'), out = row.querySelector('output');
        input.oninput = () => {
          const v = +input.value / 100;
          S.Save.data.settings.vol[key] = v;
          out.textContent = input.value;
          G.audio.vol[key] = v;
          G.audio.applyVolumes();
        };
        input.onchange = () => {
          S.Save.save();
          G.audio.unlock();
          if (VOL_PREVIEW[key]) G.audio.play(VOL_PREVIEW[key], 0.7);
        };
      }
    }

    _syncSettings() {
      const st = S.Save.data.settings;
      for (const input of document.querySelectorAll('[data-vol]')) {
        input.value = Math.round(st.vol[input.dataset.vol] * 100);
        input.nextElementSibling.textContent = input.value;
      }
      $('sSwap').checked = st.swap;
      $('sOne').checked = st.oneHand;
      $('sHaptic').checked = st.haptics;
      $('sShake').checked = st.shake;
      for (const b of $('sQuality').children) b.classList.toggle('on', b.dataset.q === st.quality);
    }

    openSettings() {
      this._syncSettings();
      this.overlay('settings', true);
    }
    closeSettings() {
      this.overlay('settings', false);
    }

    refreshMenu() {
      const d = S.Save.data;
      $('mBest').textContent = d.best + '층';
      $('mCoins').textContent = d.coins.toLocaleString();
    }

    // ---- HUD ----
    hudReset(best) {
      this.lastHud = {};
      $('bestTag').style.opacity = 0;
      $('banner').classList.remove('show');
      $('toast').classList.remove('on');
      $('lavaSlow').classList.remove('on');
      $('lavaGlow').style.opacity = 0;
      $('countdown').textContent = '';
      this.hudBest = best;
    }

    hud(floor, coins) {
      const L = this.lastHud;
      if (L.floor !== floor) {
        const el = $('hFloor');
        el.textContent = floor;
        el.classList.toggle('long', floor >= 100);
        if (L.floor !== undefined) {
          el.classList.remove('pop');
          void el.offsetWidth;
          el.classList.add('pop');
        }
        L.floor = floor;
        const next = S.MILESTONES.find((m) => m.floor > floor);
        let prev = 0;
        for (const m of S.MILESTONES) if (m.floor <= floor) prev = m.floor;
        if (next) {
          $('hGoalFill').style.width = (((floor - prev) / (next.floor - prev)) * 100).toFixed(1) + '%';
          $('hGoal').textContent = `다음 보상 ${next.floor}층 · ${next.floor - floor}층 남음`;
        } else {
          $('hGoalFill').style.width = '100%';
          $('hGoal').textContent = '모든 보상 달성!';
        }
      }
      if (L.coins !== coins) {
        $('hCoins').textContent = coins.toLocaleString();
        L.coins = coins;
      }
    }

    bestTag(pr) {
      const el = $('bestTag');
      if (!pr) {
        if (this.lastHud.tag) { el.style.opacity = 0; this.lastHud.tag = false; }
        return;
      }
      const x = pr[0] * window.innerWidth, y = (1 - pr[1]) * window.innerHeight;
      el.style.transform = `translate(${Math.round(x - 32)}px,${Math.round(y - 30)}px)`;
      if (!this.lastHud.tag) { el.style.opacity = 1; this.lastHud.tag = true; }
    }

    lava(warnAmt, slow) {
      const L = this.lastHud;
      const w = Math.round(warnAmt * 20) / 20;
      if (L.warn !== w) { $('lavaGlow').style.opacity = w; L.warn = w; }
      if (L.slow !== slow) { $('lavaSlow').classList.toggle('on', slow); L.slow = slow; }
    }

    banner(small, big, sub) {
      $('bSmall').textContent = small;
      $('bBig').textContent = big;
      $('bSub').textContent = sub || '';
      const b = $('banner');
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
    }

    toast(text, ms) {
      const t = $('toast');
      t.textContent = text;
      t.classList.add('on');
      clearTimeout(this.toastT);
      this.toastT = setTimeout(() => t.classList.remove('on'), ms || 2200);
    }

    // ---- game over ----
    gameOver(r) {
      $('oFloor').textContent = '0';
      const tag = $('oTag');
      tag.textContent = r.newBest ? '신기록!' : '게임 오버';
      tag.classList.toggle('record', r.newBest);
      $('oPicked').textContent = r.picked;
      $('oBonus').textContent = r.bonus;
      $('oEarned').textContent = r.earned.toLocaleString();
      const bar = $('oBar');
      bar.style.width = '0';
      const maxv = Math.max(r.floor, r.prevBest, 1);
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = (r.floor / maxv) * 100 + '%'; }));
      let msg;
      if (r.newBest) msg = r.prevBest > 0 ? `이전 최고 ${r.prevBest}층보다 ${r.floor - r.prevBest}층 더 올랐어요!` : '첫 기록을 세웠어요!';
      else if (r.prevBest - r.floor <= 3) msg = r.prevBest === r.floor ? `최고 기록 ${r.prevBest}층과 같아요. 딱 한 층만 더!` : `최고 기록까지 딱 ${r.prevBest - r.floor}층!`;
      else msg = `최고 기록 ${r.prevBest}층`;
      $('oCompare').textContent = msg;
      const list = $('oRewards');
      list.textContent = '';
      for (const m of r.rewards) {
        const li = document.createElement('li');
        li.textContent = `${m.floor}층 보상: ${m.label}`;
        list.appendChild(li);
      }
      this.show('over', true);
      const el = $('oFloor'), t0 = performance.now(), dur = Math.min(800, 180 + r.floor * 18);
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(r.floor * (1 - (1 - k) * (1 - k)));
        if (k < 1 && !$('over').classList.contains('hidden')) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    // ---- customize / shop ----
    openColl(mode) {
      this.coll.mode = mode;
      this.coll.tab = 'skin';
      this.coll.sel = null;
      this.show('coll');
      this.G.enterCollection();
      this.renderColl();
    }

    _thumb(kind, item) {
      const key = kind + ':' + item.id;
      if (!this.thumbs[key]) this.thumbs[key] = kind === 'skin' ? this.G.scene.thumbnailSkin(item) : this.G.scene.thumbnailTheme(item);
      return this.thumbs[key];
    }

    renderColl() {
      const d = S.Save.data, c = this.coll, G = this.G;
      const isShop = c.mode === 'shop';
      $('collTitle').textContent = isShop ? '상점' : '캐릭터 꾸미기';
      $('collCoins').textContent = d.coins.toLocaleString();
      const tabs = $('collTabs');
      tabs.textContent = '';
      const defs = isShop ? [['skin', '스킨'], ['theme', '발판 테마'], ['reward', '층수 보상']] : [['skin', '스킨'], ['theme', '발판 테마']];
      for (const [id, label] of defs) {
        const b = document.createElement('button');
        b.textContent = label;
        b.className = c.tab === id ? 'on' : '';
        b.onclick = () => { c.tab = id; c.sel = null; this.renderColl(); };
        tabs.appendChild(b);
      }
      const grid = $('collGrid');
      grid.textContent = '';
      grid.scrollTop = 0;
      if (c.tab === 'reward') {
        this._renderRewards(grid);
        this._collFooter(null, null);
        G.preview.skin = null;
        G.preview.theme = null;
        $('prevName').textContent = `최고 기록 ${d.best}층`;
        $('prevTag').style.display = 'none';
        return;
      }
      const kind = c.tab;
      const all = kind === 'skin' ? S.SKINS : S.THEMES;
      const owned = kind === 'skin' ? d.skins : d.themes;
      const eq = kind === 'skin' ? d.skin : d.theme;
      const items = all.filter((it) => (isShop ? !owned.includes(it.id) : owned.includes(it.id)));

      if (!c.sel || !items.some((i) => i.id === c.sel)) c.sel = isShop ? (items[0] && items[0].id) : eq;
      for (const it of items) {
        const b = document.createElement('button');
        b.className = 'item' + (it.id === c.sel ? ' sel' : '');
        const name = document.createElement('span');
        name.className = 'n';
        name.textContent = it.name;
        const img = document.createElement('img');
        img.alt = '';
        img.src = this._thumb(kind, it);
        b.append(img, name);
        if (isShop) {
          const p = document.createElement('span');
          if (it.milestone) { p.className = 'p m'; p.textContent = `${it.milestone}층 보상`; }
          else { p.className = 'p'; p.innerHTML = '<i class="coin"></i> ' + it.price.toLocaleString(); }
          b.appendChild(p);
        } else if (it.id === eq) {
          const e = document.createElement('span');
          e.className = 'eq';
          e.innerHTML = CHECK;
          b.appendChild(e);
        }
        b.onclick = () => { c.sel = it.id; this.renderColl(); };
        grid.appendChild(b);
      }
      if (!isShop && items.length < all.length) {
        const more = document.createElement('button');
        more.className = 'item more';
        more.textContent = `상점에서 ${all.length - items.length}개 더 잠금 해제`;
        more.onclick = () => this.openColl('shop');
        grid.appendChild(more);
      }
      if (isShop && !items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '모두 잠금 해제했어요!';
        grid.appendChild(empty);
      }
      const sel = items.find((i) => i.id === c.sel) || null;
      G.preview.skin = kind === 'skin' && sel ? sel : null;
      G.preview.theme = kind === 'theme' && sel ? sel : null;
      this._collFooter(kind, sel);
      $('prevName').textContent = sel ? sel.name : '';
      const tag = $('prevTag');
      if (sel && sel.rarity) {
        tag.style.display = '';
        tag.textContent = S.RARITY[sel.rarity].name;
        tag.style.background = S.RARITY[sel.rarity].col;
      } else tag.style.display = 'none';
    }

    _renderRewards(grid) {
      const d = S.Save.data;
      for (const m of S.MILESTONES) {
        const r = document.createElement('div');
        const done = d.claimed.includes(m.floor);
        r.className = 'rw' + (done ? ' done' : '');
        const a = document.createElement('b');
        a.textContent = m.floor + '층';
        const t = document.createElement('span');
        t.textContent = m.label;
        const e = document.createElement('em');
        e.textContent = done ? '획득' : '미달성';
        r.append(a, t, e);
        grid.appendChild(r);
      }
    }

    _collFooter(kind, sel) {
      const btn = $('btnCollAction'), d = S.Save.data, c = this.coll;
      const foot = btn.parentElement;
      this.collSel = sel;
      this.collKind = kind;
      foot.classList.toggle('hidden', !sel);
      if (!sel) return;
      btn.disabled = false;
      if (c.mode === 'shop') {
        if (sel.milestone) {
          btn.textContent = `${sel.milestone}층에 도달하면 획득`;
          btn.disabled = true;
        } else if (d.coins < sel.price) {
          btn.textContent = `코인 ${(sel.price - d.coins).toLocaleString()}개 부족`;
          btn.disabled = true;
        } else {
          btn.textContent = `${sel.price.toLocaleString()} 코인으로 구매`;
        }
      } else {
        const eq = kind === 'skin' ? d.skin : d.theme;
        btn.textContent = sel.id === eq ? '착용 중' : '착용하기';
        btn.disabled = sel.id === eq;
      }
    }

    collAction() {
      const d = S.Save.data, sel = this.collSel, kind = this.collKind, G = this.G, c = this.coll;
      if (!sel) return;
      if (c.mode === 'shop') {
        if (sel.milestone || d.coins < sel.price) return;
        d.coins -= sel.price;
        (kind === 'skin' ? d.skins : d.themes).push(sel.id);
        if (kind === 'skin') d.skin = sel.id; else d.theme = sel.id;
        G.audio.play('buy');
        G.vibrate(30);
        c.sel = null;
      } else {
        if (kind === 'skin') d.skin = sel.id; else d.theme = sel.id;
        G.audio.play('reward');
      }
      S.Save.save();
      G.applyLoadout();
      this.renderColl();
    }
  }
  S.UI = UI;
})();
