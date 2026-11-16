import { FIELD, RULES } from './config.js';

// INKRAIL — train-physics.js
// Moves every train along its drawn rail: smooth arc-length travel, car following,
// station arrival, delivery scoring hooks and the waiting-train idle bob.

export function createTrain(id, kind, spec, gate, station) {
  return {
    id, kind, spec, station,
    x: gate.x, y: gate.y, angle: gate.dir,
    trackId: null, moving: false, distance: 0,
    delivered: false, lost: false, lostReason: '',
    timer: spec.timerSec, waitTime: 0, bobPhase: Math.random() * Math.PI * 2,
    cars: [], deliveredAt: 0,
  };
}

export function moveTrainAlongTrack(train, track, dt, state) {
  if (!track || track.points.length < 2) return 'waiting';
  let speed = train.spec.speed;
  const ahead = trainAheadOnTrack(train, track, state);
  if (ahead && ahead.distance - train.distance < RULES.followGap) {
    speed = Math.min(speed, ahead.spec.speed * 0.55);
  }
  let next = train.distance + speed * dt;
  const total = trackLengthOf(track);
  if (next >= total) {
    train.distance = total;
    placeTrainOnTrack(train, track);
    return 'arrived';
  }
  train.distance = next;
  placeTrainOnTrack(train, track);
  followCars(train, track);
  return 'moving';
}

export function placeTrainOnTrack(train, track) {
  const pos = pointAtDistance(track.points, train.distance);
  const ahead = pointAtDistance(track.points, Math.min(train.distance + 12, trackLengthOf(track)));
  train.x = pos.x;
  train.y = pos.y;
  train.angle = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
}

export function followCars(train, track) {
  const gap = 34;
  train.cars = [];
  for (let c = 1; c <= train.spec.cars; c += 1) {
    const d = train.distance - c * gap;
    if (d < 0) break;
    const pos = pointAtDistance(track.points, d);
    const ahead = pointAtDistance(track.points, Math.min(d + 10, trackLengthOf(track)));
    train.cars.push({ x: pos.x, y: pos.y, angle: Math.atan2(ahead.y - pos.y, ahead.x - pos.x) });
  }
}

export function drawTrain(ctx, train, time) {
  const spec = train.spec;
  ctx.save();
  ctx.translate(train.x, train.y);
  if (!train.moving) ctx.translate(0, Math.sin(time * 2 + train.bobPhase) * 2);
  ctx.rotate(train.angle);
  drawLoco(ctx, spec, train.kind === 'boss');
  ctx.restore();
  for (const car of train.cars) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    drawCar(ctx, spec);
    ctx.restore();
  }
  if (train.moving) drawSmoke(ctx, train, time);
  if (spec.timerSec > 0 && train.moving) drawTimerArc(ctx, train, time);
}

export function drawTimerArc(ctx, train, time) {
  const frac = Math.max(0, Math.min(1, train.timer / train.spec.timerSec));
  const color = frac > 0.5 ? '#059669' : frac > 0.25 ? '#D97706' : '#DC2626';
  const blink = frac <= 0.25 && train.timer < 8 ? (Math.sin(time * 10) > 0 ? 1 : 0.25) : 1;
  const cx = train.x;
  const cy = train.y - 30;
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.strokeStyle = 'rgba(30,41,59,0.25)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 15, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(Math.max(0, train.timer)) + 's', cx, cy + 4);
  ctx.restore();
}

export function drawWaitingRing(ctx, train, time) {
  const pulse = 1 + Math.sin(time * 4) * 0.08;
  ctx.save();
  ctx.strokeStyle = train.spec.color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(train.x, train.y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = train.spec.color;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const labelY = train.y < 70 ? train.y + 58 : train.y - 32;
  ctx.fillText(train.station.name.toUpperCase(), train.x, labelY);
  if (train.spec.timerSec > 0) {
    const left = Math.max(0, train.timer);
    ctx.fillStyle = left < 8 ? '#DC2626' : '#1E293B';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(Math.ceil(left) + 's', train.x, train.y + 42);
  }
  ctx.restore();
}

export function trainAheadOnTrack(train, track, state) {
  let best = null;
  for (const other of state.trains) {
    if (other === train || other.trackId !== track.id || !other.moving) continue;
    if (other.distance > train.distance && (!best || other.distance < best.distance)) best = other;
  }
  return best;
}

export function pointAtDistance(points, dist) {
  let acc = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const seg = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (acc + seg >= dist) {
      const t = seg === 0 ? 0 : (dist - acc) / seg;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

export function trackLengthOf(track) {
  if (track.totalLength) return track.totalLength;
  let len = 0;
  const p = track.points;
  for (let i = 0; i < p.length - 1; i += 1) len += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y);
  track.totalLength = len;
  return len;
}

function drawLoco(ctx, spec, isBoss) {
  const w = isBoss ? 44 : 36;
  const h = 22;
  ctx.fillStyle = '#111827';
  ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
  ctx.fillStyle = spec.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.fillStyle = '#FFF7E0';
  ctx.fillRect(w / 2 - 12, -h / 2 + 4, 8, 8);
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(w / 2 - 4, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-w / 2 + 6, -h / 2 + 4, 10, 6);
  ctx.fillStyle = '#FDE68A';
  ctx.beginPath();
  ctx.moveTo(w / 2, -4);
  ctx.lineTo(w / 2 + 26, -10);
  ctx.lineTo(w / 2 + 26, 10);
  ctx.lineTo(w / 2, 4);
  ctx.closePath();
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(-w / 2 + 8, h / 2 - 1, 3, 0, Math.PI * 2);
  ctx.arc(w / 2 - 8, h / 2 - 1, 3, 0, Math.PI * 2);
  ctx.fill();
  if (isBoss) {
    ctx.fillStyle = '#FDE68A';
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, -h / 2 - 2);
    ctx.lineTo(-10, -h / 2 - 12);
    ctx.lineTo(-5, -h / 2 - 6);
    ctx.lineTo(0, -h / 2 - 14);
    ctx.lineTo(5, -h / 2 - 6);
    ctx.lineTo(10, -h / 2 - 12);
    ctx.lineTo(10, -h / 2 - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#B45309';
    ctx.beginPath();
    ctx.arc(0, -h / 2 - 14, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCar(ctx, spec) {
  ctx.fillStyle = '#111827';
  ctx.fillRect(-13, -8, 28, 18);
  ctx.fillStyle = spec.color;
  ctx.globalAlpha = 0.85;
  roundRect(ctx, -14, -9, 28, 18, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(-8, -5, 16, 4);
}

function drawSmoke(ctx, train, time) {
  const bx = train.x - Math.cos(train.angle) * 22;
  const by = train.y - Math.sin(train.angle) * 22;
  ctx.save();
  for (let k = 0; k < 3; k += 1) {
    const puff = (time * 0.9 + train.id * 0.37 + k * 0.33) % 1;
    const px = bx - Math.cos(train.angle) * puff * 42;
    const py = by - Math.sin(train.angle) * puff * 42 - puff * 26;
    ctx.globalAlpha = 0.65 * (1 - puff);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px, py, 4 + puff * 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
