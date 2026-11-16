import { FIELD, INK, PALETTE, RULES } from './config.js';

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
  if (state.combo > 1) {
    ctx.fillStyle = '#DC2626';
    ctx.fillText('COMBO x' + state.combo, 380, 40);
    ctx.fillStyle = PALETTE.text;
  }
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
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('INK ' + Math.round(ink), x + w + 8, y + 16);
  ctx.restore();
}

export function drawStartScreen(ctx, state, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(30,41,59,0.38)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 96px Georgia, serif';
  ctx.fillText('INKRAIL', FIELD.width / 2, 250);
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#FDE68A';
  ctx.fillText('Draw the Rails · Run the Trains Home', FIELD.width / 2, 295);
  drawHowTo(ctx, FIELD.width / 2, 360);
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 20px system-ui, sans-serif';
  if (state.best > 0) ctx.fillText('BEST SCORE  ' + state.best, FIELD.width / 2, 500);
  drawBigButton(ctx, FIELD.width / 2 - 130, 530, 260, 72, '▶  PLAY', time);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,247,224,0.85)';
  ctx.fillText('10 waves · 3 train classes · the Midnight Express rides on waves 5 & 10', FIELD.width / 2, 650);
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
    ctx.fillStyle = 'rgba(255,247,224,0.92)';
    roundRectPath(ctx, x - 110, y, 220, 84, 12);
    ctx.fill();
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
  ctx.save();
  ctx.fillStyle = 'rgba(30,41,59,0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText(victory ? 'ALL TRAINS HOME!' : 'GAME OVER', FIELD.width / 2, 240);
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillStyle = '#FDE68A';
  ctx.fillText(state.endReason || '', FIELD.width / 2, 285);
  ctx.fillStyle = '#FFF7E0';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText('SCORE  ' + state.score, FIELD.width / 2, 360);
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('Delivered ' + state.delivered + ' trains  ·  Reached wave ' + state.wave + '/' + RULES.waves, FIELD.width / 2, 400);
  if (state.score > state.best) {
    ctx.fillStyle = '#FDE68A';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('★ NEW BEST SCORE! ★', FIELD.width / 2, 445);
  }
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
