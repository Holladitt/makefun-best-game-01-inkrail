import { DECOR, DOCK, FIELD, INK, PALETTE, POPUP, RULES, STATIONS } from './config.js';
import { createTrackDrawer } from './track-drawer.js';
import { createTrain, drawTrain, drawWaitingRing, moveTrainAlongTrack } from './train-physics.js';
import { createWaveDirector } from './wave-director.js';
import { checkDelivery, checkExpressTimers, checkTrainCollisions, resolveTrainLost, scoreDelivery } from './collision-rules.js';
import { drawBanner, drawEndScreen, drawHud, drawPauseOverlay, drawStartScreen } from './hud-screens.js';
import { createSoundSynth } from './sound-synth.js';

// Precomputed river geometry (static): segment lengths for the animated flow dashes.
const RIVER_LENS = [];
let RIVER_TOTAL = 0;
for (let i = 0; i < DECOR.river.length - 1; i += 1) {
  const segLen = Math.hypot(DECOR.river[i + 1][0] - DECOR.river[i][0], DECOR.river[i + 1][1] - DECOR.river[i][1]);
  RIVER_LENS.push(segLen);
  RIVER_TOTAL += segLen;
}

// INKRAIL — main-loop.js
// The game itself: state, map rendering, input, the frame loop, particles,
// the start-screen live demo, the autopilot (demo + screenshot modes) and
// the ?shot= start/play/boss/end hooks used to take real screenshots.

export function startInkrailGame(canvas) {
  const ctx = canvas.getContext('2d');
  const state = createState();
  const drawer = createTrackDrawer(state);
  const sound = createSoundSynth();
  const director = createWaveDirector(state, spawnTrain);
  const game = { state, drawer, sound, director, canvas, ctx };
  let drawingPointerId = null;

  function cancelDrawing() {
    sound.stopScratch();
    drawer.active = null;
    drawer.preview = null;
    const id = drawingPointerId;
    drawingPointerId = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  function togglePause() {
    if (state.phase === 'play') {
      cancelDrawing();
      state.phase = 'paused';
    } else if (state.phase === 'paused') {
      state.phase = 'play';
    }
  }

  bindInput(game);
  applyShotMode(game);
  if (state.phase === 'start' && director.wave === 0) director.startNextWave();
  requestAnimationFrame((t) => frame(game, t));
  window.__inkrail = game;
  return game;

  function createState() {
    return {
      phase: 'start', time: 0, playTime: 0, score: 0, combo: 0, delivered: 0,
      lives: RULES.lives, ink: INK.max, wave: 0, lastDeliveryAt: -99,
      trains: [], stations: STATIONS, nextTrainId: 1, nextTrackId: 1,
      nextGate: 0, pendingWave: false, endReason: '',
      best: readBest(), bestWave: readBestWave(), isNewBest: false,
      deliveredByKind: { cargo: 0, express: 0, glass: 0, mail: 0, boss: 0 },
      bestCombo: 0, inkUsed: 0, flash: 0,
      particles: [], popups: [], demo: true, autopilot: false, autoTimer: 0,
    };
  }

  function readBestWave() {
    try {
      return Number(localStorage.getItem('inkrail-best-wave') || 0);
    } catch (e) {
      return 0;
    }
  }

  function saveBestWave(value) {
    try {
      localStorage.setItem('inkrail-best-wave', String(value));
    } catch (e) { /* storage unavailable: best wave just is not kept */ }
  }

  function readBest() {
    try {
      return Number(localStorage.getItem('inkrail-best') || 0);
    } catch (e) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem('inkrail-best', String(value));
    } catch (e) { /* storage unavailable: best score just is not kept */ }
  }

  function spawnTrain(kind, spec, gate, station, isBoss) {
    const train = createTrain(state.nextTrainId += 1, kind, spec, gate, station);
    state.trains.push(train);
    if (state.phase === 'play') sound.playWhistle();
    return train;
  }

  function frame(game, now) {
    const dt = Math.min(0.05, (now - (game.lastT || now)) / 1000 || 0.016);
    game.lastT = now;
    state.time += dt;
    if (state.phase === 'play') state.playTime += dt;
    if (state.phase === 'play' || state.phase === 'start') update(game, dt);
    render(game);
    requestAnimationFrame((t) => frame(game, t));
  }

  function update(game, dt) {
    const wasPlaying = state.phase === 'play';
    state.ink = Math.min(INK.max, Math.max(0, state.ink + INK.regenPerSec * dt));
    if (state.ink < 0.01) state.ink = 0;
    if (INK.max - state.ink < 0.01) state.ink = INK.max;
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.8);
    if (wasPlaying && state.wave > state.bestWave) {
      state.bestWave = state.wave;
      saveBestWave(state.bestWave);
    }
    director.update(dt);
    if (state.pendingWave) {
      director.betweenTimer -= dt;
      if (director.betweenTimer <= 0) {
        state.pendingWave = false;
        director.startNextWave();
      }
    }
    for (const train of state.trains.slice()) {
      if (train.delivered || train.lost) continue;
      if (train.moving && train.trackId) {
        const track = drawer.tracks.find((t) => t.id === train.trackId);
        const res = moveTrainAlongTrack(train, track, dt, state);
        if (res === 'arrived') onTrainArrived(train, track);
      } else {
        train.waitTime += dt;
      }
    }
    checkTrainCollisions(state.trains, (a, b) => {
      burst(a.x, a.y, '#DC2626', 26);
      burst(b.x, b.y, '#DC2626', 26);
      sound.playCrash();
      resolveTrainLost(state, a, 'Crash! Two trains collided.');
      resolveTrainLost(state, b, 'Crash! Two trains collided.');
      state.trains = state.trains.filter((t) => !t.lost);
      director.onTrainResolved();
    });
    checkExpressTimers(state.trains, dt, (t) => {
      burst(t.x, t.y, '#DC2626', 18);
      sound.playCrash();
      resolveTrainLost(state, t, 'The Express ran out of time!');
      state.trains = state.trains.filter((x) => !x.lost);
      director.onTrainResolved();
    });
    if (drawer.active &&
        (drawer.active.train.lost || drawer.active.train.delivered ||
         !state.trains.includes(drawer.active.train))) cancelDrawing();
    if (state.autopilot || state.phase === 'start') runAutopilot(game, dt);
    updateParticles(dt);
    updatePopups(dt);
    if (wasPlaying && (state.phase === 'gameover' || state.phase === 'victory')) {
      cancelDrawing();
      state.isNewBest = state.score > state.best;
      if (state.score > state.best) {
        state.best = state.score;
        saveBest(state.best);
      }
      if (state.wave > state.bestWave) {
        state.bestWave = state.wave;
        saveBestWave(state.bestWave);
      }
      if (game.lastPhase !== state.phase) {
        if (state.phase === 'victory') sound.playVictory();
        else sound.playGameOver();
      }
    }
    game.lastPhase = state.phase;
    if (state.phase === 'start' && !director.spawning && director.wave > 0) {
      const active = state.trains.filter((t) => !t.delivered && !t.lost);
      if (active.length === 0) director.startNextWave();
    }
  }

  function onTrainArrived(train, track) {
    train.moving = false;
    if (checkDelivery(train, track, state)) {
      train.delivered = true;
      const gained = scoreDelivery(state, train);
      state.deliveredByKind[train.kind] = (state.deliveredByKind[train.kind] || 0) + 1;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      const comboText = state.combo > 1 ? ' COMBO x' + state.combo + '!' : '';
      state.popups.push({
        x: train.station.x < FIELD.width / 2 ? 360 : 920,
        y: train.station.y + 70, text: '+' + gained + comboText,
        life: POPUP.lifeSec, max: POPUP.lifeSec, big: state.combo > 1,
        delivery: true,
      });
      if (state.combo >= 3) {
        state.popups.push({
          x: FIELD.width / 2, y: 180, text: 'STREAK x' + state.combo + '!',
          life: POPUP.lifeSec, max: POPUP.lifeSec, big: true,
        });
      }
      burst(train.x, train.y, train.spec.color, 26);
      burst(train.x, train.y, '#FDE68A', 18);
      confetti(train.x, train.y, 22);
      inkSplash(train.x, train.y, train.station.color);
      state.flash = 0.3;
      sound.playDing();
      state.trains = state.trains.filter((t) => t !== train);
      director.onTrainResolved();
      void gained;
    }
  }

  function confetti(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const sp = 90 + Math.random() * 160;
      state.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.6, max: 1.5,
        color: PALETTE.confetti[i % PALETTE.confetti.length],
        size: 3 + Math.random() * 3, rect: true, rot: Math.random() * Math.PI,
      });
    }
  }

  function inkSplash(x, y, color) {
    for (let i = 0; i < 10; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 70;
      state.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        life: 0.5 + Math.random() * 0.4, max: 0.9, color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      state.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 0.7 + Math.random() * 0.5, max: 1.2, color, size: 2 + Math.random() * 4,
      });
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function updatePopups(dt) {
    for (const p of state.popups) {
      p.y -= (POPUP.risePx / POPUP.lifeSec) * dt;
      p.life -= dt;
    }
    state.popups = state.popups.filter((p) => p.life > 0);
  }

  function runAutopilot(game, dt) {
    state.autoTimer -= dt;
    if (state.autoTimer > 0 || state.phase === 'start' && state.trains.length > 3) return;
    state.autoTimer = 0.9;
    const train = state.trains.find((t) => !t.delivered && !t.lost && !t.moving);
    if (!train) return;
    const dest = train.station;
    const mx = (train.x + dest.x) / 2 + (Math.random() - 0.5) * 90;
    const my = (train.y + dest.y) / 2 + (Math.random() - 0.5) * 90;
    drawer.pointerDown(train.x, train.y);
    const steps = 14;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * train.x + 2 * (1 - t) * t * mx + t * t * dest.x;
      const y = (1 - t) * (1 - t) * train.y + 2 * (1 - t) * t * my + t * t * dest.y;
      drawer.pointerMove(x, y);
    }
    drawer.pointerUp();
  }

  function render(game) {
    drawMap(ctx, state.time);
    drawer.drawTracks(ctx);
    drawer.drawPreview(ctx);
    drawStations(ctx, state.time, drawer.tracks);
    drawBossTarget(ctx, state, state.time);
    for (const train of state.trains) {
      if (train.moving) {
        drawTrain(ctx, train, state.time);
      } else {
        drawWaitingRing(ctx, train, state.time);
        drawTrain(ctx, train, state.time);
      }
    }
    drawParticles(ctx);
    drawPopups(ctx);
    const boss = state.phase === 'play' ? bossTrain(state) : null;
    drawBossVignette(ctx, boss, state.time);
    if (state.flash > 0 && state.phase === 'play') drawFlash(ctx, state.flash);
    if (state.phase === 'play' || state.phase === 'paused') drawHud(ctx, state);
    drawBossBar(ctx, state, boss);
    drawBanner(ctx, director.banner, director.bannerTimer);
    if (state.phase === 'start') drawStartScreen(ctx, state, state.time);
    if (state.phase === 'paused') drawPauseOverlay(ctx, state);
    if (state.phase === 'victory' || state.phase === 'gameover') drawEndScreen(ctx, state, state.time);
    if (drawer.hint && !boss) {
      ctx.save();
      ctx.fillStyle = '#DC2626';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(drawer.hint, FIELD.width / 2, FIELD.height - 24);
      ctx.restore();
    }
  }

  function drawParticles(ctx) {
    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.rect) {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size * 0.9, p.size, p.size * 1.8);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPopups(ctx) {
    for (const p of state.popups) {
      const frac = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = Math.min(1, frac * 1.6);
      ctx.font = 'bold ' + (p.big ? 26 : 21) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      let px = p.x;
      let py = p.y;
      if (p.delivery) {
        const placed = placeDeliveryPopup(ctx, p);
        if (!placed) { ctx.restore(); continue; }
        px = placed.x;
        py = placed.y;
      }
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30,41,59,0.85)';
      ctx.strokeText(p.text, px, py);
      ctx.fillStyle = p.big ? '#FDE68A' : '#FFF7E0';
      ctx.fillText(p.text, px, py);
      ctx.restore();
    }
  }

  // Delivery popups (+N, inward-anchored) are clamped as measured glyph
  // boxes — inflated 2px per side for the 4px stroke — inside x12–1268,
  // y66–788, and kept out of station building/shadow boxes. Returns null
  // when no horizontal interval survives (popup omitted that frame).
  // Recalculated every render; p.y is never mutated; untagged popups
  // (STREAK, WAVE CLEAR) are drawn as before.
  function placeDeliveryPopup(ctx, p) {
    const m = ctx.measureText(p.text);
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight + 4;
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 4;
    if (w > 1256 || h > 722) return null;
    let top = p.y - m.actualBoundingBoxAscent - 2;
    top = Math.max(66, Math.min(top, 788 - h));
    const bottom = top + h;
    let lo = 12 + m.actualBoundingBoxLeft + 2;
    let hi = 1268 - m.actualBoundingBoxRight - 2;
    for (const s of state.stations) {
      const sLeft = s.x - 64;
      const sRight = s.x + 64;
      const sTop = s.y - 64;
      const sBottom = s.y + 50;
      if (bottom > sTop && top < sBottom) {
        if (s.x < FIELD.width / 2) lo = Math.max(lo, sRight + 12 + m.actualBoundingBoxLeft + 2);
        else hi = Math.min(hi, sLeft - 12 - m.actualBoundingBoxRight - 2);
      }
    }
    if (lo > hi) return null;
    return {
      x: Math.max(lo, Math.min(p.x, hi)),
      y: top + m.actualBoundingBoxAscent + 2,
    };
  }

  function bossTrain(st) {
    return st.trains.find((t) => t.kind === 'boss' && !t.delivered && !t.lost);
  }

  function drawBossVignette(ctx, boss, time) {
    if (!boss) return;
    const a = 0.10 + Math.sin(time * 4) * 0.04;
    ctx.save();
    ctx.strokeStyle = 'rgba(220,38,38,' + a.toFixed(3) + ')';
    ctx.lineWidth = 26;
    ctx.strokeRect(13, 13, FIELD.width - 26, FIELD.height - 26);
    ctx.restore();
  }

  function drawFlash(ctx, flash) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, flash);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.restore();
  }

  function drawBossBar(ctx, state, boss) {
    if (!boss) return;
    const track = boss.trackId ? drawer.tracks.find((t) => t.id === boss.trackId) : null;
    let pct = 0;
    let label = 'BOSS APPROACHING';
    if (track && track.totalLength > 0) {
      pct = Math.max(0, Math.min(1, boss.distance / track.totalLength));
      label = '★ MIDNIGHT EXPRESS ★';
    }
    const phase = pct < 0.34 ? 1 : pct < 0.67 ? 2 : 3;
    const x = 440, y = 742, w = 400, h = 30;
    ctx.save();
    ctx.fillStyle = 'rgba(17,24,39,0.88)';
    roundRectPath(ctx, x, y, w, h, 8);
    ctx.fill();
    if (pct > 0) {
      ctx.fillStyle = '#DC2626';
      roundRectPath(ctx, x + 3, y + 3, (w - 6) * pct, h - 6, 5);
      ctx.fill();
    }
    ctx.strokeStyle = phase >= 3 ? '#FDE68A' : '#FCA5A5';
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, w, h, 8);
    ctx.stroke();
    ctx.fillStyle = '#FFF7E0';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2 - 24, y + 20);
    for (let i = 0; i < 3; i += 1) {
      const px = x + w - 34 + i * 14;
      const py = y + h / 2;
      ctx.fillStyle = i < phase ? '#FDE68A' : 'rgba(255,247,224,0.35)';
      ctx.beginPath();
      ctx.moveTo(px, py - 6);
      ctx.lineTo(px + 6, py);
      ctx.lineTo(px, py + 6);
      ctx.lineTo(px - 6, py);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBossTarget(ctx, state, time) {
    const boss = state.trains.find((t) => t.kind === 'boss' && !t.delivered && !t.lost);
    if (!boss) return;
    const s = boss.station;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    ctx.save();
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 72 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#FCA5A5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 82 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#7F1D1D';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = '★ BOSS TARGET ★';
    const w = ctx.measureText(label).width + 20;
    roundRectPath(ctx, s.x - w / 2, s.y - 92, w, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#FDE68A';
    ctx.fillText(label, s.x, s.y - 74);
    ctx.restore();
  }

  function bindInput(game) {
    const rect = () => canvas.getBoundingClientRect();
    canvas.addEventListener('pointerdown', (e) => {
      sound.ensure();
      const r = rect();
      const x = (e.clientX - r.left) * (FIELD.width / r.width);
      const y = (e.clientY - r.top) * (FIELD.height / r.height);
      if (e.button === 2) {
        if (state.phase === 'play') drawer.eraseAt(x, y);
        return;
      }
      if (state.phase === 'start' && inButton(x, y, FIELD.width / 2 - 130, 530, 260, 72)) {
        sound.playClick();
        startPlay();
        return;
      }
      if ((state.phase === 'victory' || state.phase === 'gameover') && inButton(x, y, FIELD.width / 2 - 150, 500, 300, 72)) {
        sound.playClick();
        resetGame();
        return;
      }
      if ((state.phase === 'play' || state.phase === 'paused') &&
          inButton(x, y, 1160, 14, 104, 36)) {
        sound.playClick();
        togglePause();
        return;
      }
      if (state.phase === 'play') {
        if (drawingPointerId === null && drawer.pointerDown(x, y)) {
          drawingPointerId = e.pointerId;
          canvas.setPointerCapture(e.pointerId);
          sound.startScratch();
        }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (state.phase !== 'play' || e.pointerId !== drawingPointerId) return;
      const r = rect();
      const x = (e.clientX - r.left) * (FIELD.width / r.width);
      const y = (e.clientY - r.top) * (FIELD.height / r.height);
      drawer.pointerMove(x, y);
      if (drawer.active && Math.random() < 0.4) sound.playDrawTick();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerId !== drawingPointerId) return;
      sound.stopScratch();
      if (state.phase === 'play') drawer.pointerUp();
      cancelDrawing();
    });
    canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerId === drawingPointerId) cancelDrawing();
    });
    canvas.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === drawingPointerId) cancelDrawing();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (state.phase === 'play' || state.phase === 'paused') togglePause();
        else if (state.phase === 'start') startPlay();
      }
      if (e.code === 'KeyR' && state.phase !== 'start') resetGame();
      if (e.code === 'Enter' && (state.phase === 'start' || state.phase === 'victory' || state.phase === 'gameover')) {
        if (state.phase === 'start') startPlay(); else resetGame();
      }
    });
  }

  function inButton(x, y, bx, by, bw, bh) {
    return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
  }

  function startPlay() {
    resetState();
    state.phase = 'play';
    director.startNextWave();
  }

  function resetGame() {
    resetState();
    state.phase = 'play';
    director.startNextWave();
  }

  function resetState() {
    state.score = 0;
    state.combo = 0;
    state.delivered = 0;
    state.lives = RULES.lives;
    state.ink = INK.max;
    state.wave = 0;
    state.trains = [];
    state.particles = [];
    state.popups = [];
    state.lastDeliveryAt = -99;
    state.playTime = 0;
    state.pendingWave = false;
    state.endReason = '';
    state.deliveredByKind = { cargo: 0, express: 0, glass: 0, mail: 0, boss: 0 };
    state.bestCombo = 0;
    state.inkUsed = 0;
    state.flash = 0;
    state.isNewBest = false;
    state.nextGate = 0;
    state.autoTimer = 0;
    state.autopilot = false;
    drawer.tracks = [];
    cancelDrawing();
    drawer.hint = '';
    director.wave = 0;
    director.spawnQueue = [];
    director.spawning = false;
  }

  function applyShotMode(game) {
    const q = new URLSearchParams(location.search);
    const shot = q.get('shot');
    if (shot === 'boss') {
      resetState();
      state.autopilot = true;
      state.phase = 'play';
      state.score = 1850;
      state.delivered = 14;
      state.combo = 3;
      state.lives = 3;
      state.deliveredByKind = { cargo: 6, express: 3, glass: 3, mail: 2, boss: 0 };
      state.bestCombo = 3;
      state.inkUsed = 190;
      state.bestWave = 4;
      state.lastDeliveryAt = state.playTime;
      director.wave = 4;
      state.wave = 4;
      director.startNextWave();
    } else if (shot === 'play') {
      startPlay();
      state.autopilot = true;
    } else if (shot === 'end') {
      state.phase = 'gameover';
      state.score = 2840;
      state.delivered = 21;
      state.wave = 7;
      state.lives = 0;
      state.endReason = 'The Express ran out of time!';
      state.best = 3120;
      state.bestWave = 7;
      state.deliveredByKind = { cargo: 9, express: 5, glass: 4, mail: 3, boss: 0 };
      state.bestCombo = 4;
      state.inkUsed = 312;
    } else if (shot === 'start') {
      state.demo = true;
      state.best = 2840;
      state.bestWave = 7;
      director.startNextWave();
    }
    if (q.get('demo') === '1') {
      state.demo = true;
      director.startNextWave();
    }
  }
}

export function drawMap(ctx, time) {
  ctx.save();
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.strokeStyle = PALETTE.contour;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.ellipse(320 + i * 30, 420, 180 + i * 46, 120 + i * 30, 0.25, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const [x, y, rx, ry] of DECOR.hills) drawHill(ctx, x, y, rx, ry);
  drawRiver(ctx, time);
  for (const [x, y, n] of DECOR.forests) drawForest(ctx, x, y, n);
  for (const [x, y] of DECOR.pines) drawPine(ctx, x, y);
  for (const town of DECOR.towns) drawTown(ctx, town.x, town.y, town.n);
  for (const [x, y, s] of DECOR.clouds) drawCloud(ctx, x, y, s, time);
  ctx.restore();
}

export function drawHill(ctx, x, y, rx, ry) {
  ctx.save();
  ctx.fillStyle = PALETTE.hill;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PALETTE.contour;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawForest(ctx, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    const ox = (i % 2 === 0 ? -1 : 1) * (i * 9);
    const oy = (i < 2 ? 0 : 14) + (i % 2) * 6;
    drawPine(ctx, x + ox, y + oy);
  }
}

export function drawTown(ctx, x, y, n) {
  ctx.save();
  for (let i = 0; i < n; i += 1) {
    const hx = x + (i - 1) * 26;
    const hy = y + (i % 2) * 12;
    ctx.fillStyle = PALETTE.townWall;
    ctx.strokeStyle = PALETTE.wood;
    ctx.lineWidth = 1.5;
    ctx.fillRect(hx - 8, hy - 6, 16, 12);
    ctx.strokeRect(hx - 8, hy - 6, 16, 12);
    ctx.fillStyle = PALETTE.townRoof;
    ctx.beginPath();
    ctx.moveTo(hx - 10, hy - 6);
    ctx.lineTo(hx, hy - 14);
    ctx.lineTo(hx + 10, hy - 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawCloud(ctx, x, y, s, time) {
  const drift = (time * 6 * s) % (FIELD.width + 240);
  let cx = x + drift - 120;
  if (cx > FIELD.width + 120) cx -= FIELD.width + 240;
  if (cx < -120) cx += FIELD.width + 240;
  ctx.save();
  ctx.fillStyle = PALETTE.cloud;
  ctx.beginPath();
  ctx.ellipse(cx, y, 42 * s, 14 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 26 * s, y + 4 * s, 30 * s, 11 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(cx - 26 * s, y + 5 * s, 26 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawStations(ctx, time, tracks) {
  ctx.save();
  for (const s of STATIONS) drawStation(ctx, s, time, tracks);
  ctx.restore();
}

export function drawRiver(ctx, time) {
  ctx.save();
  ctx.strokeStyle = PALETTE.river;
  ctx.lineWidth = 34;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  DECOR.river.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = PALETTE.riverDeep;
  ctx.lineWidth = 3;
  ctx.beginPath();
  DECOR.river.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 8; i += 1) {
    const p = riverPointAt((time * 0.03 + i / 8) % 1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function riverPointAt(frac) {
  const pts = DECOR.river;
  let d = frac * RIVER_TOTAL;
  for (let i = 0; i < RIVER_LENS.length; i += 1) {
    if (d <= RIVER_LENS[i]) {
      const t = RIVER_LENS[i] === 0 ? 0 : d / RIVER_LENS[i];
      return {
        x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
      };
    }
    d -= RIVER_LENS[i];
  }
  return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
}

export function drawPine(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(x - 2, y, 4, 10);
  ctx.fillStyle = PALETTE.pine;
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x - 11, y + 2);
  ctx.lineTo(x + 11, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.pineDark;
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x - 8, y + 2);
  ctx.lineTo(x + 8, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawStation(ctx, s, time, tracks) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(30,41,59,0.12)';
  ctx.beginPath();
  ctx.ellipse(0, 26, 64, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  drawDockPad(ctx, s, tracks);
  ctx.fillStyle = '#FFF7E0';
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 4;
  roundRectPath(ctx, -52, -30, 104, 60, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.moveTo(-52, -28);
  ctx.lineTo(0, -52);
  ctx.lineTo(52, -28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = s.color;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(s.name.split(' ')[0].toUpperCase(), 0, 6);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textSoft;
  ctx.fillText(s.name.split(' ').slice(1).join(' ') || 'STATION', 0, 22);
  ctx.restore();
}

function drawDockPad(ctx, s, tracks) {
  let cx;
  let cy;
  let angle;
  const target = tracks ? tracks.filter((t) => t.stationId === s.id).pop() : null;
  if (target && target.points.length >= 2) {
    const last = target.points[target.points.length - 1];
    const prev = target.points[target.points.length - 2];
    cx = last.x - s.x;
    cy = last.y - s.y;
    angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  } else {
    const dx = FIELD.width / 2 - s.x;
    const dy = FIELD.height / 2 - s.y;
    const len = Math.hypot(dx, dy) || 1;
    cx = (dx / len) * DOCK.padOffset;
    cy = (dy / len) * DOCK.padOffset;
    angle = Math.atan2(dy, dx);
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = PALETTE.woodLight;
  ctx.strokeStyle = PALETTE.wood;
  ctx.lineWidth = 2;
  roundRectPath(ctx, -DOCK.padW / 2, -DOCK.padH / 2, DOCK.padW, DOCK.padH, 6);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = PALETTE.wood;
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 22, -DOCK.padH / 2 + 3);
    ctx.lineTo(i * 22, DOCK.padH / 2 - 3);
    ctx.stroke();
  }
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
