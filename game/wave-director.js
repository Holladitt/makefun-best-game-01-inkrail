import { getSpawnGate, getStationByColor, getTrainSpec, getWavePlan, POPUP, RULES, STATIONS } from './config.js';

// INKRAIL — wave-director.js
// Runs the 10-wave show: spawn schedule, train kinds per wave, the Midnight
// Express boss on waves 5 and 10, wave-clear detection and the victory call.

export function createWaveDirector(state, spawnTrain) {
  const director = {
    state, spawnTrain, wave: 0, spawning: false, spawnQueue: [],
    spawnTimer: 0, betweenTimer: 0, banner: '', bannerTimer: 0,
    startNextWave, update, onTrainResolved, spawnBoss,
  };
  return director;

  function startNextWave() {
    director.wave += 1;
    const plan = getWavePlan(director.wave);
    director.spawnQueue = plan.kinds.slice();
    if (director.wave === 10) director.spawnQueue.unshift('express');
    director.spawning = true;
    director.spawnTimer = 0.5;
    director.banner = waveTitle(director.wave);
    director.bannerTimer = 3.5;
    if (plan.boss) director.spawnBoss();
    state.wave = director.wave;
  }

  function spawnBoss() {
    const gate = getSpawnGate((director.wave * 2 + 1) % 4);
    const station = STATIONS[(director.wave * 2 + 1) % STATIONS.length];
    director.spawnTrain('boss', getTrainSpec('boss'), gate, station, true);
  }

  function update(dt) {
    if (director.bannerTimer > 0) director.bannerTimer -= dt;
    if (director.spawning) {
      director.spawnTimer -= dt;
      if (director.spawnTimer <= 0 && director.spawnQueue.length > 0) {
        const kind = director.spawnQueue.shift();
        const spec = getTrainSpec(kind);
        const gate = getSpawnGate(state.nextGate += 1);
        const station = pickStation(kind);
        director.spawnTrain(kind, spec, gate, station, false);
        director.spawnTimer = getWavePlan(director.wave).interval;
      }
      if (director.spawnQueue.length === 0) director.spawning = false;
    }
  }

  function onTrainResolved() {
    const active = state.trains.filter((t) => !t.delivered && !t.lost);
    if (active.length === 0 && !director.spawning && state.phase === 'play') {
      if (director.wave >= RULES.waves) {
        state.phase = 'victory';
        state.endReason = 'All 10 waves cleared — every train home!';
      } else {
        director.betweenTimer = 2.2;
        director.banner = 'WAVE CLEAR! +250 bonus';
        director.bannerTimer = 2.0;
        state.score += 250;
        state.popups.push({
          x: 640, y: 220, text: 'WAVE CLEAR +250',
          life: POPUP.lifeSec, max: POPUP.lifeSec, big: true,
        });
        state.pendingWave = true;
      }
    }
  }

  function pickStation(kind) {
    const colors = { cargo: '#D97706', express: '#DC2626', glass: '#0284C7', mail: '#059669' };
    const color = colors[kind] || '#D97706';
    return getStationByColor(color);
  }
}

export function waveProgress(state) {
  const total = state.trains.length;
  const done = state.trains.filter((t) => t.delivered || t.lost).length;
  return { done, total };
}

export function waveTitle(wave) {
  if (wave === 5) return 'WAVE 5 — THE MIDNIGHT EXPRESS RIDES!';
  if (wave === 10) return 'FINAL WAVE — THE MIDNIGHT EXPRESS RETURNS!';
  return 'WAVE ' + wave + ' / ' + RULES.waves;
}
