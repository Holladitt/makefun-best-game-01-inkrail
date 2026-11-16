// INKRAIL — config.js
// One source of truth for every tuning number, colour and wave plan.
// Every other module reads from here; the renderer and the play-test read the same values.

export function getWavePlan(wave) {
  const count = 2 + wave;
  const interval = Math.max(2.0, 4.8 - wave * 0.3);
  const boss = wave === 5 || wave === 10;
  const kinds = [];
  for (let i = 0; i < count; i += 1) {
    if (i % 7 === 6) kinds.push('mail');
    else if (i % 5 === 4) kinds.push('glass');
    else if (i % 3 === 2) kinds.push('express');
    else kinds.push('cargo');
  }
  return { wave, count, interval, boss, kinds };
}

export function getTrainSpec(kind) {
  return TRAIN_KINDS[kind] || TRAIN_KINDS.cargo;
}

export function getStationByColor(color) {
  return STATIONS.find((s) => s.color === color) || STATIONS[0];
}

export function getSpawnGate(index) {
  return SPAWN_GATES[index % SPAWN_GATES.length];
}

export const FIELD = { width: 1280, height: 800 };

export const TRAIN_KINDS = {
  cargo: {
    kind: 'cargo', label: 'Cargo', color: '#D97706', speed: 58,
    score: 100, maxTurnDeg: 55, cars: 3, timerSec: 0, radius: 15,
  },
  express: {
    kind: 'express', label: 'Express', color: '#DC2626', speed: 112,
    score: 150, maxTurnDeg: 45, cars: 2, timerSec: 28, radius: 14,
  },
  glass: {
    kind: 'glass', label: 'Glass', color: '#0284C7', speed: 76,
    score: 200, maxTurnDeg: 30, cars: 2, timerSec: 0, radius: 14,
  },
  mail: {
    kind: 'mail', label: 'Mail', color: '#059669', speed: 88,
    score: 125, maxTurnDeg: 50, cars: 2, timerSec: 0, radius: 14,
  },
  boss: {
    kind: 'boss', label: 'Midnight Express', color: '#111827', speed: 72,
    score: 500, maxTurnDeg: 20, cars: 6, timerSec: 0, radius: 17,
  },
};

export const STATIONS = [
  { id: 'crimson', name: 'Crimson Central', color: '#DC2626', x: 150, y: 150 },
  { id: 'amber', name: 'Amber Yard', color: '#D97706', x: 1130, y: 150 },
  { id: 'cobalt', name: 'Cobalt Harbor', color: '#0284C7', x: 150, y: 650 },
  { id: 'emerald', name: 'Emerald Mail', color: '#059669', x: 1130, y: 650 },
];

export const SPAWN_GATES = [
  { x: 34, y: 400, dir: 0 },
  { x: 1246, y: 400, dir: Math.PI },
  { x: 640, y: 34, dir: Math.PI / 2 },
  { x: 640, y: 766, dir: -Math.PI / 2 },
];

export const INK = { max: 120, costPerPx: 0.045, regenPerSec: 5, refundRate: 0.8 };

export const POPUP = { lifeSec: 1.8, risePx: 48 };

export const DOCK = { padOffset: 56, padW: 84, padH: 30 };

export const PALETTE = {
  paper: '#F3E9D2',
  paperDark: '#E8D9B8',
  contour: '#D9C9A3',
  river: '#BFE3F0',
  riverDeep: '#8FC8E0',
  pine: '#4D7C4F',
  pineDark: '#38603A',
  wood: '#8B5E34',
  woodLight: '#A97B4F',
  bridge: '#7A4A21',
  bridgeDark: '#5C3413',
  ink: '#1E293B',
  inkSoft: '#334155',
  text: '#1E293B',
  textSoft: '#475569',
  gold: '#B45309',
  cream: '#FFF7E0',
};

export const DRAW = { resamplePx: 24, snapPx: 36, grabPx: 48, erasePx: 14 };

export const RULES = {
  lives: 3, waves: 10, comboWindowSec: 10, maxCombo: 5,
  deliverRadius: 36, crashDistance: 30, followGap: 52,
};

export const DECOR = {
  pines: [
    [300, 300], [360, 560], [520, 210], [700, 590], [900, 300],
    [980, 560], [430, 700], [820, 130], [230, 470], [1060, 430],
  ],
  river: [[0, 620], [220, 540], [430, 580], [640, 500], [860, 540], [1080, 470], [1280, 520]],
};
