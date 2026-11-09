// ONE MORE FLOOR: SKY TOWER — tuning constants and content tables.
(function () {
  'use strict';
  const S = (window.SKY = window.SKY || {});
  const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  S.hex = hex;
  S.TAU = Math.PI * 2;

  const R = 7;
  // World units and seconds. The tower is a cylinder: gameplay is 2D (arc, height).
  S.CFG = {
    R,
    CIRC: S.TAU * R,
    DT: 1 / 120,
    RUN: 10,
    ACCEL: 120,
    DECEL: 140,
    AIR_ACCEL: 75,
    AIR_DECEL: 22,
    ICE_ACCEL: 20,
    ICE_DECEL: 5,
    GRAV_UP: 44,
    GRAV_CUT: 120,
    GRAV_DOWN: 66,
    GRAV_APEX: 0.55,
    APEX_V: 3,
    JUMP_V: 18.5,
    PAD_V: 27,
    MAX_FALL: 34,
    COYOTE: 0.1,
    BUFFER: 0.13,
    LAND_SLOP: 0.34,
    MAX_DY: 3.15,
    REACH_MARGIN: 0.62,
    BOOST_T: 2.4,
    BOOST_MUL: 1.5,
    RESPAWN: 3.2,
    LAVA_START: -13,
    LAVA_V0: 1.3,
    LAVA_VMAX: 3.6,
    LAVA_TAU: 80,
    LAVA_RUB: 24,
    LAVA_SLOW: 0.25,
    BEACON_SLOW_T: 3.5,
    ENV_SLOW_T: 5,
  };

  S.ENVS = [
    {
      id: 'sky', name: '하늘 섬', en: 'SKY ISLANDS', from: 0,
      top: hex(0x1f78ea), mid: hex(0x74c5ff), hor: hex(0xe6f7ff), sun: hex(0xfff3c4), fog: hex(0xc6e9ff),
      hemiS: hex(0xc9e6ff), hemiG: hex(0x8fa58e), light: [1.0, 0.95, 0.82], colA: hex(0xf2e7d2), colB: hex(0xd9c6a5),
      stars: 0, fogR: [55, 230], amb: 'wisp',
    },
    {
      id: 'desert', name: '사막 하늘', en: 'DESERT SKIES', from: 50,
      top: hex(0x2c74a6), mid: hex(0xf0b268), hor: hex(0xffe6b5), sun: hex(0xfff0b0), fog: hex(0xf6d6a0),
      hemiS: hex(0xffe4bb), hemiG: hex(0xb07f4f), light: [1.05, 0.88, 0.64], colA: hex(0xe3b67e), colB: hex(0xc4895a),
      stars: 0, fogR: [50, 210], amb: 'sand',
    },
    {
      id: 'frozen', name: '얼어붙은 산맥', en: 'FROZEN MOUNTAINS', from: 100,
      top: hex(0x345394), mid: hex(0x9cc4ea), hor: hex(0xf1f8ff), sun: hex(0xeaf6ff), fog: hex(0xd8eafb),
      hemiS: hex(0xdcecff), hemiG: hex(0x8a9fbd), light: [0.92, 0.96, 1.05], colA: hex(0xbcd6ee), colB: hex(0x89a9cd),
      stars: 0.08, fogR: [45, 200], amb: 'snow',
    },
    {
      id: 'volcano', name: '화산 지대', en: 'VOLCANIC WORLD', from: 200,
      top: hex(0x1a0a1d), mid: hex(0x62202a), hor: hex(0xe25a2c), sun: hex(0xffa35e), fog: hex(0x6d2a27),
      hemiS: hex(0xb06a62), hemiG: hex(0xa8392a), light: [1.0, 0.68, 0.5], colA: hex(0x4c3a3e), colB: hex(0x2f2429),
      stars: 0.1, fogR: [40, 190], amb: 'ember',
    },
    {
      id: 'space', name: '우주 공간', en: 'OUTER SPACE', from: 300,
      top: hex(0x03030d), mid: hex(0x0d0a2a), hor: hex(0x2b1d63), sun: hex(0xdfe6ff), fog: hex(0x120f36),
      hemiS: hex(0x8f9cdf), hemiG: hex(0x3a2b6f), light: [0.95, 0.96, 1.12], colA: hex(0x3a3f70), colB: hex(0x24274f),
      stars: 1, fogR: [70, 280], amb: 'dust',
    },
  ];
  S.envFor = (floor) => {
    let i = 0;
    for (let k = 0; k < S.ENVS.length; k++) if (floor >= S.ENVS[k].from) i = k;
    return i;
  };

  // Skins. shape: round | cube | tall | blob
  const sk = (id, name, rarity, price, shape, body, belly, acc, accCol, trail, extra) =>
    Object.assign({ id, name, rarity, price, shape, body: hex(body), belly: hex(belly), acc, accCol: hex(accCol), trail: hex(trail) }, extra || {});
  const P = { c: 150, r: 400, e: 900, l: 2000 };
  S.SKINS = [
    sk('default', '콩이', 'c', 0, 'round', 0xffc93c, 0xfff0b8, 'none', 0, 0xffe27a),
    sk('mint', '민트콩', 'c', P.c, 'round', 0x4fd8b4, 0xcdf8ea, 'cap', 0xff6b6b, 0x8ff0d4),
    sk('coral', '산호', 'c', P.c, 'round', 0xff7f6e, 0xffdcd4, 'bow', 0xfff1a8, 0xffb09e),
    sk('skyblue', '소라', 'c', P.c, 'round', 0x62b6ff, 0xdcefff, 'antenna', 0xffd23f, 0xa6d6ff),
    sk('grape', '포도', 'c', P.c, 'blob', 0x9a6cf0, 0xe5d9ff, 'leaf', 0x62c462, 0xc7aeff),
    sk('lime', '라임', 'c', P.c, 'tall', 0xa8e04a, 0xeaf9c4, 'leaf', 0x3f9e4d, 0xd2f28d),
    sk('peach', '복숭아', 'c', P.c, 'round', 0xffb3a7, 0xfff0ea, 'ears', 0xff8f85, 0xffd3cb),
    sk('cocoa', '코코아', 'c', P.c, 'cube', 0x9a6a4a, 0xe2c6a8, 'cap', 0x3f7fd9, 0xcfa98a),
    sk('bot', '철이', 'r', P.r, 'cube', 0xa9b8c9, 0xe6eef6, 'antenna', 0xff5a5a, 0x9fe8ff, { visor: 0x35e6ff }),
    sk('frog', '개굴', 'r', P.r, 'blob', 0x63c74d, 0xe6f7c2, 'ears', 0x63c74d, 0xa8e796),
    sk('cat', '치즈냥', 'r', P.r, 'round', 0xffa94d, 0xffe9cf, 'cat', 0xff8c2b, 0xffcf96),
    sk('bunny', '토순이', 'r', P.r, 'tall', 0xf6eee6, 0xffffff, 'bunny', 0xffb7c8, 0xffffff),
    sk('penguin', '펭수리', 'r', P.r, 'tall', 0x34405c, 0xf5f7fb, 'none', 0, 0xbfd2f2),
    sk('heli', '콥터', 'r', P.r, 'round', 0x38c6d9, 0xd1f5fa, 'propeller', 0xff5d73, 0x9ae8f3),
    sk('wizard', '마법콩', 'r', P.r, 'round', 0x6a7bf2, 0xd9defe, 'wizard', 0x3a2f8f, 0xb8a3ff),
    sk('party', '파티콩', 'r', P.r, 'blob', 0xff71b8, 0xffdcef, 'party', 0x45d6c6, 0xffa5d6),
    sk('knight', '기사단장', 'e', P.e, 'cube', 0x8f9cb3, 0xcdd7e6, 'helmet', 0xe64b4b, 0xdfe7f3, { visor: 0x1b2230 }),
    sk('king', '임금님', 'e', P.e, 'round', 0xd9414f, 0xffd8c4, 'crown', 0xffc933, 0xffdc73),
    sk('devil', '꼬마악마', 'e', P.e, 'round', 0xb5243f, 0xf58ba0, 'horns', 0x2e1a24, 0xff5a5a),
    sk('angel', '천사', 'e', P.e, 'round', 0xfff7ea, 0xffffff, 'halo', 0xffd94f, 0xfff0a8),
    sk('ninja', '그림자', 'e', P.e, 'cube', 0x2a2d3e, 0x3e4259, 'band', 0xe0334a, 0x7c86b5, { visor: 0xf2f2f2 }),
    sk('alien', '외계콩', 'e', P.e, 'tall', 0x7df2a0, 0xd5fddd, 'antenna2', 0xc66bff, 0xb7ffc9, { em: 0.15 }),
    sk('ghost', '둥실이', 'e', P.e, 'blob', 0xe6ecff, 0xffffff, 'halo', 0x9fb4ff, 0xc9d6ff, { em: 0.4 }),
    sk('flame', '불꽃정령', 'l', P.l, 'round', 0xff6a1f, 0xffd65c, 'flame', 0xffa329, 0xff8a1f, { em: 0.65 }),
    sk('galaxy', '은하수', 'l', P.l, 'round', 0x241a5e, 0x5a4bd1, 'halo', 0x7df0ff, 0x9c8bff, { em: 0.3, visor: 0x7df0ff }),
    sk('gold', '황금콩', 'l', P.l, 'round', 0xffc533, 0xffe9a3, 'crown', 0xfff0b0, 0xfff0a0, { gloss: 1, em: 0.14 }),
    sk('nomad', '사막 여행자', 'm', 0, 'round', 0xd9a066, 0xf6dfc0, 'turban', 0xf4f0e6, 0xf2d3a0, { milestone: 50 }),
    sk('yeti', '설산 탐험가', 'm', 0, 'blob', 0xeaf4ff, 0x9fc4ea, 'horns', 0xb3c7dd, 0xd9ecff, { milestone: 100 }),
    sk('golem', '용암 골렘', 'm', 0, 'cube', 0x3a2c30, 0xff7a2e, 'flame', 0xff7a2e, 0xff6a1f, { milestone: 200, em: 0.1, visor: 0xffa329 }),
    sk('lord', '탑의 지배자', 'm', 0, 'tall', 0x18152b, 0xffcf4d, 'crown', 0xffe9a3, 0xffe27a, { milestone: 500, em: 0.25, visor: 0xffe27a, gloss: 1 }),
  ];

  // Platform themes tint only the normal platforms, so hazards stay readable.
  // p: [stripe frequency, stripe amount, speckle, gloss]  e: edge glow
  const th = (id, name, price, a, b, side, p, e, extra) =>
    Object.assign({ id, name, price, a: hex(a), b: hex(b), side: hex(side), p, e: e || 0 }, extra || {});
  S.THEMES = [
    th('classic', '초원', 0, 0x7ed957, 0x69c74a, 0xa06f49, [2.2, 0.35, 0.3, 0.05]),
    th('cloud', '솜구름', 300, 0xffffff, 0xe3eefb, 0xcad9ee, [1.4, 0.4, 0.05, 0.1]),
    th('candy', '사탕', 500, 0xff7fb1, 0xfff2f7, 0xff4f92, [3.4, 1, 0, 0.5]),
    th('wood', '원목', 500, 0xd9a464, 0xba8245, 0x7b5230, [6.5, 0.55, 0.25, 0.08]),
    th('sand', '사암', 600, 0xe9c185, 0xd5a367, 0xb37a48, [1.2, 0.3, 0.5, 0.03]),
    th('marble', '대리석', 800, 0xf4f1ec, 0xd5d0cc, 0xb79656, [5, 0.3, 0.1, 0.8]),
    th('steel', '강철', 900, 0x98a8ba, 0x7f90a4, 0x4a5868, [4, 0.3, 0.14, 0.9]),
    th('neon', '네온', 1200, 0x24174a, 0x3a2375, 0x120b2c, [3, 0.6, 0, 0.6], 1),
    th('crystal', '수정', 0, 0xb68bff, 0x7fd8ff, 0x6a48c4, [2.5, 0.75, 0, 1], 0.5, { milestone: 100 }),
    th('gold', '황금', 0, 0xffd257, 0xffe9a3, 0xc08a22, [3, 0.4, 0.12, 1], 0.25, { milestone: 500 }),
  ];

  S.MILESTONES = [
    { floor: 25, coins: 200, label: '코인 200' },
    { floor: 50, coins: 500, skin: 'nomad', label: '코인 500 + 사막 여행자' },
    { floor: 100, coins: 1000, skin: 'yeti', theme: 'crystal', label: '코인 1000 + 설산 탐험가 + 수정 발판' },
    { floor: 200, coins: 2500, skin: 'golem', label: '코인 2500 + 용암 골렘' },
    { floor: 500, coins: 8000, skin: 'lord', theme: 'gold', label: '코인 8000 + 탑의 지배자 + 황금 발판' },
  ];

  S.RARITY = {
    c: { name: '일반', col: '#9fd3ff' },
    r: { name: '희귀', col: '#6ee7a8' },
    e: { name: '영웅', col: '#c99bff' },
    l: { name: '전설', col: '#ffc94d' },
    m: { name: '기념', col: '#ff9a62' },
  };

  S.TYPE_HINTS = {
    1: '얼음 발판 — 미끄러워요',
    2: '점프 발판 — 높이 튕겨 올라요',
    3: '무너지는 발판 — 빨리 떠나세요',
    4: '속도 발판 — 잠깐 빨라져요',
    5: '폭발 발판 — 곧 터져요!',
  };
})();
