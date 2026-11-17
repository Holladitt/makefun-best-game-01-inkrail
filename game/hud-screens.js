import { FIELD, INK, PALETTE, RULES, TRAIN_KINDS, getWavePlan } from './config.js';

// INKRAIL — hud-screens.js
// Everything the player reads: the big top HUD (wave, score, combo, delivered,
// lives, ink meter, pause/restart), the animated Start screen with its live
// demo map and 3 how-to icons, and the Victory / Game Over results screens.

export function drawHud(ctx, state) {
  ctx.save();
  ctx.fillStyle = 'rgba(243,233,210,0.94)';
  ctx.fillRect(0, 0, FIELD.width, 64);
  ctx.strokeStyle = PALETTE.contour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(FIELD.width, 64);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'left';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('WAVE ' + state.wave + '/' + RULES.waves, 18, 41);
  ctx.fillText('SCORE ' + state.score, 200, 41);
  drawComboPill(ctx, state.combo, 380, 24);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('DELIVERED ' + state.delivered, 540, 40);
  drawLives(ctx, state.lives, 760, 40);
  drawInkMeter(ctx, state.ink, 850, 22, 170, 22);
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.textSoft;
  ctx.fillText('SPACE pause · R restart', 850, 56);
  ctx.fillStyle = '#1E293B';
  roundRectPath(ctx, 1160, 14, 104, 36, 8);
  ctx.fill();
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('❚❚  PAUSE', 1212, 38);
  ctx.textAlign = 'left';
  drawWaveDots(ctx, state.wave, 18, 54);
  drawWaitingIcons(ctx, state.trains || [], 170, 47);
  drawNextWave(ctx, state.wave, 700, 58);
  ctx.restore();
}

export function drawComboPill(ctx, combo, x, y) {
  const label = combo > 1 ? 'COMBO x' + combo : 'COMBO';
  ctx.save();
  ctx.font = 'bold 14px system-ui, sans-serif';
  const w = ctx.measureText(label).width + 22;
  ctx.fillStyle = combo > 1 ? '#B45309' : 'rgba(30,41,59,0.08)';
  ctx.strokeStyle = combo > 1 ? '#B45309' : '#94A3B8';
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x, y, w, 24, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = combo > 1 ? '#FFF7E0' : PALETTE.textSoft;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 17);
  ctx.restore();
}

export function drawWaveDots(ctx, wave, x, cy) {
  ctx.save();
  const current = Math.max(0, Math.min(RULES.waves - 1, (wave || 1) - 1));
  for (let i = 0; i < RULES.waves; i += 1) {
    const dx = x + i * 13;
    ctx.beginPath();
    if (i < current) {
      ctx.fillStyle = '#D97706';
      ctx.arc(dx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (i === current) {
      ctx.fillStyle = '#DC2626';
      ctx.arc(dx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(dx, cy, 7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.5;
      ctx.arc(dx, cy, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawWaitingIcons(ctx, trains, x, y) {
  const counts = {};
  for (const t of trains) {
    if (t.moving || t.delivered || t.lost) continue;
    counts[t.kind] = (counts[t.kind] || 0) + 1;
  }
  const kinds = Object.keys(counts);
  if (kinds.length === 0) return;
  ctx.save();
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  let cx = x;
  for (const kind of kinds) {
    const color = (TRAIN_KINDS[kind] || TRAIN_KINDS.cargo).color;
    ctx.fillStyle = color;
    roundRectPath(ctx, cx, y, 14, 14, 3);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('x' + counts[kind], cx + 17, y + 11);
    cx += 17 + ctx.measureText('x' + counts[kind]).width + 12;
  }
  ctx.restore();
}

export function drawNextWave(ctx, wave, x, y) {
  ctx.save();
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.textSoft;
  ctx.fillText('NEXT:', x, y);
  if (wave >= RULES.waves) {
    ctx.fillStyle = '#B45309';
    ctx.fillText('FINAL WAVE', x + 38, y);
    ctx.restore();
    return;
  }
  const kinds = getWavePlan(wave + 1).kinds;
  const shown = kinds.slice(0, 5);
  let dx = x + 38;
  for (const kind of shown) {
    ctx.fillStyle = (TRAIN_KINDS[kind] || TRAIN_KINDS.cargo).color;
    ctx.beginPath();
    ctx.arc(dx + 5, y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    dx += 15;
  }
  if (kinds.length > shown.length) {
    ctx.fillStyle = PALETTE.textSoft;
    ctx.fillText('+' + (kinds.length - shown.length), dx, y);
  }
  ctx.restore();
}

export function drawLives(ctx, lives, x, y) {
  for (let i = 0; i < RULES.lives; i += 1) {
    ctx.save();
    ctx.translate(x + i * 34, y);
    ctx.fillStyle = i < lives ? '#DC2626' : '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-11, -4, -6, -13, 0, -6);
    ctx.bezierCurveTo(6, -13, 11, -4, 0, 8);
    ctx.fill();
    ctx.restore();
  }
}

export function drawInkMeter(ctx, ink, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = '#CBD5E1';
  roundRectPath(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = ink < 25 ? '#DC2626' : '#1E293B';
  roundRectPath(ctx, x, y, w * (ink / INK.max), h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(243,233,210,0.9)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i += 1) {
    const sx = x + (w / 6) * i;
    ctx.beginPath();
    ctx.moveTo(sx, y + 2);
    ctx.lineTo(sx, y + h - 2);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('INK ' + Math.round(ink), x + w + 8, y + 16);
  ctx.restore();
}

export function drawStartScreen(ctx, state, time) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(30,41,59,0.16)';
  roundRectPath(ctx, FIELD.width / 2 - 332, 108, 664, 252, 20);
  ctx.fill();
  ctx.fillStyle = PALETTE.cream;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 5;
  roundRectPath(ctx, FIELD.width / 2 - 340, 100, 680, 252, 20);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 2;
  roundRectPath(ctx, FIELD.width / 2 - 330, 110, 660, 232, 14);
  ctx.stroke();
  ctx.font = 'bold 96px Georgia, serif';
  ctx.fillStyle = 'rgba(217,119,6,0.45)';
  ctx.fillText('INKRAIL', FIELD.width / 2 + 5, 255);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('INKRAIL', FIELD.width / 2, 250);
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#B45309';
  ctx.fillText('Draw the Rails · Run the Trains Home', FIELD.width / 2, 295);
  drawFeaturePills(ctx, FIELD.width / 2, 316);
  drawHowTo(ctx, FIELD.width / 2, 372);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 20px system-ui, sans-serif';
  if (state.best > 0) {
    const line = state.bestWave > 0
      ? 'BEST SCORE  ' + state.best + '  ·  BEST WAVE  ' + state.bestWave + '/' + RULES.waves
      : 'BEST SCORE  ' + state.best;
    ctx.fillText(line, FIELD.width / 2, 500);
  }
  drawBigButton(ctx, FIELD.width / 2 - 130, 530, 260, 72, '▶  PLAY', time);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(30,41,59,0.85)';
  const line = '10 waves · 3 train classes · the Midnight Express rides on waves 5 & 10';
  const lw = ctx.measureText(line).width + 28;
  ctx.fillStyle = 'rgba(255,247,224,0.92)';
  roundRectPath(ctx, FIELD.width / 2 - lw / 2, 628, lw, 30, 15);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,41,59,0.85)';
  ctx.fillText(line, FIELD.width / 2, 649);
  ctx.restore();
}

export function drawFeaturePills(ctx, cx, y) {
  const pills = ['10 WAVES', '5 TRAIN TYPES', 'BOSS ×2', 'COMBOS ×5', 'INK ECONOMY'];
  ctx.save();
  ctx.font = 'bold 12px system-ui, sans-serif';
  const widths = pills.map((p) => ctx.measureText(p).width + 20);
  const gap = 8;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (pills.length - 1);
  let px = cx - total / 2;
  pills.forEach((p, i) => {
    ctx.fillStyle = '#FFF7E0';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, px, y, widths[i], 18, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(p, px + widths[i] / 2, y + 13);
    px += widths[i] + gap;
  });
  ctx.restore();
}

export function drawHowTo(ctx, cx, y) {
  const items = [
    { icon: '✏️', label: 'DRAG = Draw Rail' },
    { icon: '🎯', label: 'Colour = Station' },
    { icon: '🖱️', label: 'Right-click = Erase' },
  ];
  ctx.save();
  items.forEach((item, i) => {
    const x = cx + (i - 1) * 260;
    ctx.fillStyle = 'rgba(255,247,224,0.95)';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2.5;
    roundRectPath(ctx, x - 110, y, 220, 84, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#B45309';
    ctx.beginPath();
    ctx.arc(x - 94, y + 16, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF7E0';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x - 94, y + 21);
    ctx.font = '34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.icon, x, y + 40);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(item.label, x, y + 68);
  });
  ctx.restore();
}

export function drawBigButton(ctx, x, y, w, h, label, time) {
  const pulse = 1 + Math.sin(time * 3) * 0.02;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(pulse, pulse);
  ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = '#DC2626';
  roundRectPath(ctx, 0, 0, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = '#FFF7E0';
  ctx.lineWidth = 3;
  roundRectPath(ctx, 3, 3, w - 6, h - 6, 11);
  ctx.stroke();
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, w / 2, h / 2 + 11);
  ctx.restore();
}

export function drawEndScreen(ctx, state, time) {
  const victory = state.phase === 'victory';
  const byKind = state.deliveredByKind || {};
  const cleared = victory ? RULES.waves : Math.max(0, (state.wave || 1) - 1);
  ctx.save();
  ctx.fillStyle = 'rgba(30,41,59,0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText(victory ? 'ALL TRAINS HOME!' : 'GAME OVER', FIELD.width / 2, 230);
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillStyle = '#FDE68A';
  ctx.fillText(state.endReason || '', FIELD.width / 2, 272);
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 30px system-ui, sans-serif';
  const scoreText = 'SCORE  ' + state.score;
  const scoreW = ctx.measureText(scoreText).width;
  let newBestW = 0;
  if (state.isNewBest) {
    ctx.font = 'bold 20px system-ui, sans-serif';
    newBestW = ctx.measureText('★ NEW BEST').width;
    ctx.font = 'bold 30px system-ui, sans-serif';
  }
  const groupW = scoreW + (state.isNewBest ? 16 + newBestW : 0);
  ctx.fillText(scoreText, FIELD.width / 2 - groupW / 2 + scoreW / 2, 345);
  if (state.isNewBest) {
    ctx.fillStyle = '#FDE68A';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('★ NEW BEST', FIELD.width / 2 - groupW / 2 + scoreW + 16 + newBestW / 2, 345);
  }
  ctx.fillStyle = '#FFF7E0';
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('Delivered ' + state.delivered + ' trains  ·  Reached wave ' + state.wave + '/' + RULES.waves, FIELD.width / 2, 382);
  ctx.font = '20px system-ui, sans-serif';
  for (let i = 0; i < RULES.waves; i += 1) {
    ctx.fillStyle = i < cleared ? '#D97706' : '#94A3B8';
    ctx.fillText('★', FIELD.width / 2 - 117 + i * 26, 415);
  }
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,247,224,0.9)';
  const perClass = 'CARGO ' + (byKind.cargo || 0) + '  ·  EXPRESS ' + (byKind.express || 0)
    + '  ·  GLASS ' + (byKind.glass || 0) + '  ·  MAIL ' + (byKind.mail || 0)
    + '  ·  BOSS ' + (byKind.boss || 0);
  ctx.fillText(perClass, FIELD.width / 2, 442);
  ctx.fillText('BEST COMBO x' + (state.bestCombo || 0) + '  ·  INK USED ' + (state.inkUsed || 0), FIELD.width / 2, 468);
  drawBigButton(ctx, FIELD.width / 2 - 150, 500, 300, 72, '↻  RESTART', time);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,247,224,0.85)';
  ctx.fillText('Press R or click RESTART to play again', FIELD.width / 2, 620);
  ctx.restore();
}

export function drawPauseOverlay(ctx, state) {
  ctx.save();
  ctx.fillStyle = 'rgba(30,41,59,0.5)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 56px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', FIELD.width / 2, 380);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('SPACE to resume · R to restart', FIELD.width / 2, 425);
  ctx.restore();
}

export function drawBanner(ctx, text, timer) {
  if (!text || timer <= 0) return;
  const isBoss = text.includes('MIDNIGHT');
  ctx.save();
  ctx.globalAlpha = Math.min(1, timer);
  ctx.fillStyle = isBoss ? '#7F1D1D' : '#111827';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 48;
  roundRectPath(ctx, FIELD.width / 2 - w / 2, 84, w, 56, 12);
  ctx.fill();
  ctx.strokeStyle = isBoss ? '#FCA5A5' : '#FDE68A';
  ctx.lineWidth = 2;
  roundRectPath(ctx, FIELD.width / 2 - w / 2, 84, w, 56, 12);
  ctx.stroke();
  ctx.fillStyle = '#FDE68A';
  ctx.fillText(text, FIELD.width / 2, 122);
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
