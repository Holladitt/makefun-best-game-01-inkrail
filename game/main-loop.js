import { DECOR, DOCK, FIELD, INK, PALETTE, POPUP, RULES, STATIONS } from './config.js';
import { createTrackDrawer } from './track-drawer.js';
import { createTrain, drawTrain, drawWaitingRing, moveTrainAlongTrack, trackLengthOf } from './train-physics.js';
import { createWaveDirector } from './wave-director.js';
import { checkDelivery, checkExpressTimers, checkTrainCollisions, resolveTrainLost, scoreDelivery } from './collision-rules.js';
import { drawBanner, drawEndScreen, drawHud, drawPauseOverlay, drawStartScreen } from './hud-screens.js';
import { createSoundSynth } from './sound-synth.js';

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
  bindInput(game);
  applyShotMode(game);
  if (state.phase === 'start' && director.wave === 0) director.startNextWave();
  requestAnimationFrame((t) => frame(game, t));
  window.__inkrail = game;
  return game;

  function createState() {
    return {
      phase: 'start', time: 0, score: 0, combo: 0, delivered: 0,
      lives: RULES.lives, ink: INK.max, wave: 0, lastDeliveryAt: -99,
      trains: [], stations: STATIONS, nextTrainId: 1, nextTrackId: 1,
      nextGate: 0, pendingWave: false, endReason: '',
      best: readBest(),
      particles: [], popups: [], demo: true, autopilot: false, autoTimer: 0,
    };
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
    if (state.phase === 'play' || state.phase === 'start') update(game, dt);
    render(game);
    requestAnimationFrame((t) => frame(game, t));
  }

  function update(game, dt) {
    state.ink = Math.min(INK.max, state.ink + INK.regenPerSec * dt);
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
    if (state.autopilot || state.phase === 'start') runAutopilot(game, dt);
    updateParticles(dt);
    updatePopups(dt);
    if (state.phase === 'gameover' || state.phase === 'victory') {
      if (state.score > state.best) {
        state.best = state.score;
        saveBest(state.best);
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
      const comboText = state.combo > 1 ? ' COMBO x' + state.combo + '!' : '';
      state.popups.push({
        x: train.x, y: train.y - 44, text: '+' + gained + comboText,
        life: POPUP.lifeSec, max: POPUP.lifeSec, big: state.combo > 1,
      });
      burst(train.x, train.y, train.spec.color, 22);
      burst(train.x, train.y, '#FDE68A', 14);
      sound.playDing();
      state.trains = state.trains.filter((t) => t !== train);
      director.onTrainResolved();
      void gained;
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
    if (state.phase === 'play' || state.phase === 'paused') drawHud(ctx, state);
    drawBanner(ctx, director.banner, director.bannerTimer);
    if (state.phase === 'start') drawStartScreen(ctx, state, state.time);
    if (state.phase === 'paused') drawPauseOverlay(ctx, state);
    if (state.phase === 'victory' || state.phase === 'gameover') drawEndScreen(ctx, state, state.time);
    if (drawer.hint) {
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
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
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
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30,41,59,0.85)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.big ? '#FDE68A' : '#FFF7E0';
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
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
      if (state.phase === 'play') {
        if (drawer.pointerDown(x, y)) sound.startScratch();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (state.phase !== 'play') return;
      const r = rect();
      const x = (e.clientX - r.left) * (FIELD.width / r.width);
      const y = (e.clientY - r.top) * (FIELD.height / r.height);
      drawer.pointerMove(x, y);
      if (drawer.active && Math.random() < 0.4) sound.playDrawTick();
    });
    canvas.addEventListener('pointerup', () => {
      sound.stopScratch();
      if (state.phase === 'play') drawer.pointerUp();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (state.phase === 'play') state.phase = 'paused';
        else if (state.phase === 'paused') state.phase = 'play';
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
    state.pendingWave = false;
    state.endReason = '';
    drawer.tracks = [];
    drawer.active = null;
    drawer.preview = null;
    director.wave = 0;
    director.spawnQueue = [];
    director.spawning = false;
  }

  function applyShotMode(game) {
    const q = new URLSearchParams(location.search);
    const shot = q.get('shot');
    if (shot === 'boss') {
      state.autopilot = true;
      resetState();
      state.phase = 'play';
      state.score = 1850;
      state.delivered = 14;
      state.combo = 3;
      state.lives = 3;
      state.lastDeliveryAt = 0;
      director.wave = 4;
      state.wave = 4;
      director.startNextWave();
    } else if (shot === 'play') {
      state.autopilot = true;
      startPlay();
    } else if (shot === 'end') {
      state.phase = 'gameover';
      state.score = 2840;
      state.delivered = 21;
      state.wave = 7;
      state.lives = 0;
      state.endReason = 'The Express ran out of time!';
      state.best = 3120;
    } else if (shot === 'start') {
      state.demo = true;
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
  drawRiver(ctx);
  for (const [x, y] of DECOR.pines) drawPine(ctx, x, y);
  ctx.restore();
}

export function drawStations(ctx, time, tracks) {
  ctx.save();
  for (const s of STATIONS) drawStation(ctx, s, time, tracks);
  ctx.restore();
}

export function drawRiver(ctx) {
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
  ctx.restore();
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
