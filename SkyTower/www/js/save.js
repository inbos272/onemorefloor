// Local-only persistence. Keeps a second copy so an interrupted write cannot wipe progress.
(function () {
  'use strict';
  const S = window.SKY;
  const KEY = 'omf_skytower_v1', BACKUP = KEY + '_bak';

  const defaults = () => ({
    v: 1, coins: 0, best: 0, runs: 0,
    skins: ['default'], themes: ['classic'], skin: 'default', theme: 'classic',
    claimed: [], seen: {},
    settings: {
      vol: { master: 0.9, bgm: 0.55, jump: 0.8, land: 0.7, coin: 0.75, collapse: 0.8, warn: 0.8, over: 0.8, fx: 0.8 },
      quality: 'auto', haptics: true, swap: false, oneHand: false, shake: true,
    },
  });

  function parse(raw) {
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && typeof o.coins === 'number' ? o : null;
    } catch (e) {
      return null;
    }
  }
  function read(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }

  S.Save = {
    data: defaults(),
    load() {
      const o = parse(read(KEY)) || parse(read(BACKUP));
      const d = defaults();
      if (o) {
        Object.assign(d, o);
        d.settings = Object.assign(defaults().settings, o.settings || {});
        d.settings.vol = Object.assign(defaults().settings.vol, (o.settings && o.settings.vol) || {});
      }
      if (!d.skins.includes('default')) d.skins.push('default');
      if (!d.themes.includes('classic')) d.themes.push('classic');
      if (!S.SKINS.some((s) => s.id === d.skin && d.skins.includes(s.id))) d.skin = 'default';
      if (!S.THEMES.some((t) => t.id === d.theme && d.themes.includes(t.id))) d.theme = 'classic';
      this.data = d;
      return d;
    },
    save() {
      try {
        const s = JSON.stringify(this.data);
        window.localStorage.setItem(KEY, s);
        window.localStorage.setItem(BACKUP, s);
      } catch (e) { /* storage full or disabled: the session keeps working in memory */ }
    },
    reset() {
      const keep = this.data.settings;
      this.data = defaults();
      this.data.settings = keep;
      this.save();
    },
  };
})();
