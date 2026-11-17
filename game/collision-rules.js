import { RULES } from './config.js';
import { maxTurnCoarse } from './track-drawer.js';

// INKRAIL — collision-rules.js
// Every way a run can go wrong, in one place: train-on-train crashes,
// the fragile Glass train on too-sharp rails, the Express timer running out,
// and delivery scoring with the combo multiplier.

export function trainsTooClose(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < RULES.crashDistance;
}

export function checkTrainCollisions(trains, onCrash) {
  for (let i = 0; i < trains.length; i += 1) {
    const a = trains[i];
    if (a.delivered || a.lost || !a.moving) continue;
    for (let j = i + 1; j < trains.length; j += 1) {
      const b = trains[j];
      if (b.delivered || b.lost || !b.moving) continue;
      if (trainsTooClose(a, b)) {
        onCrash(a, b);
        return true;
      }
    }
  }
  return false;
}

export function checkGlassCurvature(train, track) {
  if (train.kind !== 'glass' || !track) return false;
  return maxTurnCoarse(track.points) > train.spec.maxTurnDeg;
}

export function checkExpressTimers(trains, dt, onTimeout) {
  for (const t of trains) {
    if (t.kind !== 'express' || t.delivered || t.lost) continue;
    t.timer -= dt;
    if (t.timer <= 0) onTimeout(t);
  }
}

export function scoreDelivery(state, train) {
  const now = state.playTime;
  if (now - state.lastDeliveryAt < RULES.comboWindowSec) {
    state.combo = Math.min(RULES.maxCombo, state.combo + 1);
  } else {
    state.combo = 1;
  }
  state.lastDeliveryAt = now;
  const gained = train.spec.score * state.combo;
  state.score += gained;
  state.delivered += 1;
  return gained;
}

export function checkDelivery(train, track, state) {
  if (!track || !track.stationId) return false;
  const station = state.stations.find((s) => s.id === track.stationId);
  if (!station) return false;
  return station.color === train.spec.color || train.kind === 'boss' && station.id === train.station.id;
}

export function resolveTrainLost(state, train, reason) {
  train.lost = true;
  train.lostReason = reason;
  train.moving = false;
  if (state.phase === 'start') return;
  state.lives -= 1;
  state.combo = 0;
  if (state.lives <= 0) {
    state.phase = 'gameover';
    state.endReason = reason;
  }
}
