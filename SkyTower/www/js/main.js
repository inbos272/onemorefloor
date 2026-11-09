// Game flow: state machine, fixed-step loop, rewards, adaptive quality.
(function () {
  'use strict';
  const S = window.SKY;
  const C = S.CFG;
  const params = new URLSearchParams(location.search);

  const canvas = document.getElementById('gl');
  const save = S.Save.load();

  const G = (S.game = {
    state: 'menu', // menu | play | countdown | paused | dying | over | coll
    dragYaw: 0,
    preview: { skin: null, theme: null },
    env: 0,
    rewards: [],
    dyingT: 0,
    countT: 0,
    bot: null,
  });

  let renderer;
  try {
    renderer = new S.Renderer(canvas);
  } catch (e) {
    console.error(e);
    renderer = { ok: false };
  }
  if (!renderer.ok) {
    document.getElementById('fatal').classList.remove('hidden');
    return;
  }

  const sim = new S.Sim(onSimEvent);
  const scene = (G.scene = new S.Scene(renderer, sim));
  const audio = (G.audio = new S.Sound(save.settings.vol));
  // Automated runs stay silent: without an AudioContext every sound call is a no-op.
  if (params.has('bot') || params.has('mute')) audio.unlock = () => {};
  const ui = (G.ui = new S.UI(G));
  const input = new S.Input({
    root: document.getElementById('hud'),
    move: document.getElementById('ctlMove'),
    jumpZone: document.getElementById('ctlJump'),
    base: document.getElementById('stickBase'),
    knob: document.getElementById('stickKnob'),
    jump: document.getElementById('jumpBtn'),
  });
  G.sim = sim;
  G.input = input;

  G.vibrate = (ms) => {
    if (!G.bot && S.Save.data.settings.haptics && navigator.vibrate) navigator.vibrate(ms);
  };

  G.applyControls = () => {
    const st = S.Save.data.settings;
    input.configure(st.swap, st.oneHand);
    scene.shakeEnabled = st.shake;
  };

  // ---------- adaptive quality ----------
  const adapt = { acc: 0, frames: 0, cool: 3, scale: 1 };
  G.applyQuality = () => {
    const q = S.Save.data.settings.quality;
    adapt.scale = 1;
    adapt.acc = adapt.frames = 0;
    adapt.cool = 3;
    renderer.scale = 1;
    renderer.setQuality(q === 'auto' ? 'medium' : q);
    scene.quality = S.QUALITY[renderer.level].part;
  };
  function adaptQuality(dt) {
    if (S.Save.data.settings.quality !== 'auto') return;
    adapt.acc += dt;
    adapt.frames++;
    adapt.cool -= dt;
    if (adapt.frames < 50) return;
    const avg = (adapt.acc / adapt.frames) * 1000;
    adapt.acc = adapt.frames = 0;
    if (adapt.cool > 0) return;
    if (avg > 23) {
      if (renderer.level === 'medium' && adapt.scale <= 0.8) {
        renderer.scale = 1;
        renderer.setQuality('low');
        adapt.scale = 1;
        scene.quality = S.QUALITY.low.part;
      } else {
        adapt.scale = Math.max(0.6, adapt.scale - 0.15);
        renderer.setScale(adapt.scale);
      }
      adapt.cool = 4;
    } else if (avg < 17.6 && adapt.scale < 1) {
      adapt.scale = Math.min(1, adapt.scale + 0.1);
      renderer.setScale(adapt.scale);
      adapt.cool = 8;
    }
  }

  // ---------- loadout ----------
  const skinById = (id) => S.SKINS.find((s) => s.id === id) || S.SKINS[0];
  const themeById = (id) => S.THEMES.find((t) => t.id === id) || S.THEMES[0];
  G.applyLoadout = () => {
    const d = S.Save.data;
    scene.skin = skinById(d.skin);
    scene.theme = themeById(d.theme);
    audio.vol = d.settings.vol;
    audio.applyVolumes();
  };

  // ---------- flow ----------
  const newSeed = () => (Math.random() * 0x7fffffff) | 0;

  G.toMenu = (abandon) => {
    if (abandon && (G.state === 'paused' || G.state === 'countdown')) finishRun(false);
    G.state = 'menu';
    G.preview.skin = G.preview.theme = null;
    input.enabled = false;
    input.reset();
    audio.duck(false);
    sim.reset(newSeed(), 0);
    scene.resetRun();
    G.env = 0;
    audio.setMusicEnv(0);
    audio.setDanger(0);
    ui.refreshMenu();
    ui.show('menu');
  };

  G.enterCollection = () => {
    G.state = 'coll';
    G.dragYaw = 0;
  };

  G.startRun = () => {
    audio.unlock();
    if (G.state === 'paused' || G.state === 'countdown') finishRun(false); // restarting still banks this run
    sim.reset(newSeed(), S.Save.data.best);
    scene.resetRun();
    G.env = 0;
    G.rewards = [];
    G.state = 'play';
    G.preview.skin = G.preview.theme = null;
    S.Save.data.runs++;
    ui.show('hud');
    ui.hudReset(S.Save.data.best);
    input.enabled = true;
    input.reset();
    audio.duck(false);
    audio.setMusicEnv(0);
    audio.setDanger(0);
    if (!audio.musicOn) audio.startMusic(0);
    updateHud();
  };

  G.pause = () => {
    if (G.state !== 'play' && G.state !== 'countdown') return;
    G.state = 'paused';
    input.enabled = false;
    input.reset();
    audio.duck(true);
    document.getElementById('pFloor').textContent = sim.floor + '층';
    document.getElementById('pBest').textContent = '최고 ' + S.Save.data.best + '층';
    document.getElementById('countdown').textContent = '';
    ui.overlay('pause', true);
  };

  G.resumeWithCountdown = () => {
    ui.overlay('pause', false);
    G.state = 'countdown';
    G.countT = 1.5;
    input.enabled = true;
    input.reset();
    audio.duck(false);
  };

  function claimMilestones(floor) {
    const d = S.Save.data;
    for (const m of S.MILESTONES) {
      if (floor < m.floor || d.claimed.includes(m.floor)) continue;
      d.claimed.push(m.floor);
      d.coins += m.coins;
      if (m.skin && !d.skins.includes(m.skin)) d.skins.push(m.skin);
      if (m.theme && !d.themes.includes(m.theme)) d.themes.push(m.theme);
      G.rewards.push(m);
      S.Save.save();
      ui.banner(`${m.floor}층 달성 보상`, `+${m.coins.toLocaleString()} 코인`, m.skin || m.theme ? m.label.replace(/^코인 \d+ \+ /, '') + ' 해금!' : '');
      audio.play('reward');
      scene.celebrate([1, 0.7, 0.25]);
      G.vibrate(60);
    }
  }

  function finishRun(showResult) {
    const d = S.Save.data;
    const prevBest = d.best;
    const floor = sim.floor;
    const picked = sim.coinCount, bonus = floor * 2, earned = picked + bonus;
    d.coins += earned;
    const newBest = floor > prevBest;
    if (newBest) d.best = floor;
    S.Save.save();
    if (showResult) ui.gameOver({ floor, prevBest, newBest, picked, bonus, earned, rewards: G.rewards });
  }

  function updateHud() {
    ui.hud(sim.floor, S.Save.data.coins + sim.coinCount);
  }

  // ---------- simulation events ----------
  function onSimEvent(name, a, b) {
    if (!scene || G.state === 'menu') return;
    scene.onEvent(name, a, b);
    switch (name) {
      case 'jump': audio.play('jump'); break;
      case 'land':
        audio.play('land', Math.min(1, b / 30));
        if (a.type && !S.Save.data.seen[a.type]) {
          S.Save.data.seen[a.type] = 1;
          S.Save.save();
          ui.toast(S.TYPE_HINTS[a.type], 2600);
        }
        break;
      case 'coin': audio.play('coin'); G.vibrate(6); break;
      case 'pad': audio.play('pad'); G.vibrate(15); break;
      case 'speed': audio.play('speed'); break;
      case 'crumble': audio.play('crumble'); break;
      case 'collapse': audio.play('collapse'); break;
      case 'fuse': audio.play('fuse'); break;
      case 'boom': audio.play('boom'); G.vibrate(b ? 90 : 25); break;
      case 'beacon': audio.play('beacon'); ui.toast('용암이 잠시 느려져요!', 1500); break;
      case 'warn': if (a) { audio.play('warn'); G.vibrate(40); } break;
      case 'floor': onFloor(a.floor); break;
      case 'dead':
        G.state = 'dying';
        G.dyingT = 1.15;
        input.enabled = false;
        input.reset();
        audio.play('over');
        audio.setDanger(0);
        G.vibrate(140);
        break;
    }
  }

  function onFloor(f) {
    const e = S.envFor(f);
    if (e !== G.env) {
      G.env = e;
      const env = S.ENVS[e];
      scene.setEnv(e);
      scene.celebrate([0.5, 0.8, 1]);
      sim.slowT = Math.max(sim.slowT, C.ENV_SLOW_T);
      audio.setMusicEnv(e);
      audio.play('env');
      ui.banner(env.en, env.name, `${env.from}층 도달 · 용암 둔화`);
      G.vibrate(60);
    }
    claimMilestones(f);
  }

  // ---------- main loop ----------
  let last = performance.now(), acc = 0;
  const idleInput = { move: 0, jump: false };

  function frame(now) {
    requestAnimationFrame(frame);
    tick(now);
  }

  function tick(now) {
    const raw = Math.max(0, (now - last) / 1000);
    last = Math.max(now, last);
    const dt = Math.min(raw, 0.1);
    adaptQuality(raw);

    let simDt = 0;
    switch (G.state) {
      case 'play':
      case 'dying':
      case 'menu':
      case 'coll':
      case 'over':
        simDt = dt;
        break;
      case 'countdown':
        G.countT -= dt;
        document.getElementById('countdown').textContent = G.countT > 0 ? Math.ceil(G.countT / 0.5) : '';
        if (G.countT <= 0) G.state = 'play';
        break;
    }

    let inp = idleInput;
    if (G.state === 'play') {
      inp = G.bot ? G.bot.update(sim, C.DT) : input.poll();
    }

    acc += simDt;
    while (acc >= C.DT) {
      sim.step(inp);
      acc -= C.DT;
      if (G.bot && G.state === 'play') inp = G.bot.update(sim, C.DT);
    }

    if (G.state === 'dying') {
      G.dyingT -= dt;
      if (G.dyingT <= 0) {
        G.state = 'over';
        finishRun(true);
      }
    }

    const paused = G.state === 'paused' || G.state === 'countdown';
    const inPlay = G.state === 'play' || G.state === 'dying' || paused || G.state === 'over';
    scene.render(paused ? 0 : dt, paused ? 1 : acc / C.DT, {
      camMode: G.state === 'coll' ? (G.preview.theme ? 'theme' : 'custom') : G.state === 'menu' ? 'menu' : 'play',
      skin: G.preview.skin,
      theme: G.preview.theme,
      dragYaw: G.dragYaw,
    });

    if (inPlay) {
      // Once the run is banked its coins are already in the wallet; refreshing would count them twice.
      if (G.state !== 'over') updateHud();
      const gap = sim.p.y - sim.lavaY;
      const danger = G.state === 'play' ? Math.max(0, Math.min(1, 1 - gap / 12)) : 0;
      audio.setDanger(danger);
      ui.lava(G.state === 'play' ? Math.max(0, Math.min(1, 1 - (gap - 1) / 8)) : 0, sim.slowT > 0 && !sim.dead);
      ui.bestTag(G.state === 'play' ? scene.bestScreen : null);
    }
  }

  // ---------- lifecycle ----------
  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 120));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      G.pause();
      audio.suspend();
      S.Save.save();
    } else {
      last = performance.now();
      audio.resume();
    }
  });
  window.addEventListener('pagehide', () => S.Save.save());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (G.state === 'play') G.pause();
      else if (G.state === 'paused') G.resumeWithCountdown();
    }
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Native shell integrations, only present inside the Capacitor build.
  const cap = window.Capacitor && window.Capacitor.Plugins;
  if (cap) {
    if (cap.StatusBar && cap.StatusBar.hide) cap.StatusBar.hide().catch(() => {});
    if (cap.App && cap.App.addListener) {
      cap.App.addListener('backButton', () => {
        const open = (id) => !document.getElementById(id).classList.contains('hidden');
        if (open('confirm')) ui.overlay('confirm', false);
        else if (open('settings')) ui.closeSettings();
        else if (G.state === 'play') G.pause();
        else if (G.state === 'paused') G.resumeWithCountdown();
        else if (G.state === 'coll' || G.state === 'over') G.toMenu(false);
        else if (cap.App.minimizeApp) cap.App.minimizeApp();
      });
      cap.App.addListener('pause', () => G.pause());
    }
  } else if ('serviceWorker' in navigator && location.protocol === 'https:' || params.has('sw')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Boot
  G.applyQuality();
  G.applyControls();
  G.applyLoadout();
  sim.reset(newSeed(), 0);
  scene.resetRun();
  ui.refreshMenu();

  if (params.has('bot')) {
    const s = document.createElement('script');
    s.src = 'js/bot.js';
    s.onload = () => { G.bot = new S.Bot(parseFloat(params.get('bot')) || 0.8, 3); };
    document.head.appendChild(s);
    G.tick = tick;
  }

  requestAnimationFrame(frame);
})();
