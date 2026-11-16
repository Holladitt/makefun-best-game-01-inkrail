import { DRAW, INK, PALETTE, STATIONS } from './config.js';

// INKRAIL — track-drawer.js
// Owns every drawn rail: drag input, resampling, spline smoothing, snapping,
// live ink-cost preview, sharp-turn warnings and right-click erase with refund.

export function createTrackDrawer(state) {
  const drawer = {
    state, tracks: [], active: null, preview: null, hint: '',
    pointerDown,
    pointerMove,
    pointerUp,
    eraseAt,
    trackAt,
    trainNear,
    extendTrack,
    drawTracks,
    drawPreview,
  };
  return drawer;

  function pointerDown(x, y) {
    const train = trainNear(x, y);
    if (train) {
      drawer.active = { train, raw: [{ x, y }] };
      drawer.preview = { points: [{ x, y }], cost: 0, tooSharp: false };
      drawer.hint = '';
      return true;
    }
    drawer.hint = 'Drag from a waiting train to draw its rail!';
    return false;
  }

  function pointerMove(x, y) {
    if (!drawer.active) return;
    const raw = drawer.active.raw;
    const last = raw[raw.length - 1];
    if (Math.hypot(x - last.x, y - last.y) < 6) return;
    raw.push({ x, y });
    const snapped = snapPoint({ x, y }, drawer.active.train);
    const smooth = smoothTrack(raw, snapped);
    const cost = trackLength(smooth) * INK.costPerPx;
    const tooSharp = maxTurnCoarse(smooth) > drawer.active.train.spec.maxTurnDeg;
    drawer.preview = { points: smooth, cost, tooSharp, end: snapped };
  }

  function pointerUp() {
    if (!drawer.active || !drawer.preview) { drawer.active = null; drawer.preview = null; return null; }
    const { train, raw } = drawer.active;
    const snapped = snapPoint(raw[raw.length - 1], train);
    const smooth = smoothTrack(raw, snapped);
    const realLength = trackLength(smooth);
    const cost = realLength * INK.costPerPx;
    const tooSharp = maxTurnCoarse(smooth) > train.spec.maxTurnDeg;
    drawer.active = null;
    drawer.preview = null;
    if (tooSharp) {
      drawer.hint = 'Too sharp for the ' + train.spec.label + ' — redraw a gentler curve!';
      return null;
    }
    if (realLength < 30 || cost > state.ink) {
      drawer.hint = cost > state.ink ? 'Not enough ink — wait for it to refill!' : 'Rail too short.';
      return null;
    }
    state.ink -= cost;
    const track = {
      id: state.nextTrackId += 1, trainId: train.id, kind: train.kind,
      points: smooth, length: realLength, cost, stationId: snapped.stationId || null,
    };
    drawer.tracks.push(track);
    train.trackId = track.id;
    train.moving = true;
    return track;
  }

  function eraseAt(x, y) {
    const track = trackAt(x, y);
    if (!track) return false;
    const train = state.trains.find((t) => t.id === track.trainId);
    if (train && train.moving) { drawer.hint = 'Cannot erase a rail with a train on it!'; return false; }
    drawer.tracks = drawer.tracks.filter((t) => t !== track);
    state.ink = Math.min(INK.max, state.ink + track.cost * INK.refundRate);
    if (train) { train.trackId = null; train.moving = false; }
    return true;
  }

  function trackAt(x, y) {
    for (const track of drawer.tracks) {
      for (let i = 0; i < track.points.length - 1; i += 1) {
        if (distToSeg(x, y, track.points[i], track.points[i + 1]) < DRAW.erasePx) return track;
      }
    }
    return null;
  }

  function trainNear(x, y) {
    let best = null;
    let bestD = DRAW.grabPx;
    for (const t of state.trains) {
      if (t.delivered || t.lost || t.moving) continue;
      const d = Math.hypot(x - t.x, y - t.y);
      if (d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  function extendTrack(train, raw) {
    const track = drawer.tracks.find((t) => t.id === train.trackId);
    if (!track) return false;
    const snapped = snapPoint(raw[raw.length - 1], train);
    const smooth = smoothTrack(raw, snapped);
    const cost = trackLength(smooth) * INK.costPerPx;
    if (cost > state.ink) return false;
    state.ink -= cost;
    track.points = track.points.concat(smooth.slice(1));
    track.length = track.length + trackLength(smooth);
    track.totalLength = undefined;
    track.cost += cost;
    track.stationId = snapped.stationId || track.stationId;
    return true;
  }

  function drawTracks(ctx) {
    for (const track of drawer.tracks) {
      drawRail(ctx, track.points, PALETTE.ink, 7);
      drawRail(ctx, track.points, '#F8F1DE', 2);
    }
  }

  function drawPreview(ctx) {
    const p = drawer.preview;
    if (!p || p.points.length < 2) return;
    ctx.save();
    ctx.setLineDash([10, 8]);
    const color = p.tooSharp ? '#DC2626' : drawer.active.train.spec.color;
    drawRail(ctx, p.points, color, 6);
    ctx.setLineDash([]);
    ctx.fillStyle = p.tooSharp ? '#DC2626' : PALETTE.text;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(
      p.tooSharp ? 'TOO SHARP for ' + drawer.active.train.spec.label + '!' : 'Ink ' + Math.round(p.cost),
      p.points[p.points.length - 1].x + 12, p.points[p.points.length - 1].y - 10,
    );
    ctx.restore();
  }

  function snapPoint(p, train) {
    for (const s of STATIONS) {
      if (Math.hypot(p.x - s.x, p.y - s.y) < DRAW.snapPx) return { x: s.x, y: s.y, stationId: s.id };
    }
    return { x: p.x, y: p.y, stationId: null };
  }
}

export function smoothTrack(raw, endPoint) {
  const resampled = resample(raw, DRAW.resamplePx);
  if (endPoint) {
    const last = resampled[resampled.length - 1];
    if (!last || Math.hypot(endPoint.x - last.x, endPoint.y - last.y) > 0.5) {
      resampled.push({ x: endPoint.x, y: endPoint.y });
    }
  }
  if (resampled.length < 3) return resampled;
  const dense = [];
  for (let i = 0; i < resampled.length - 1; i += 1) {
    const p0 = resampled[Math.max(0, i - 1)];
    const p1 = resampled[i];
    const p2 = resampled[i + 1];
    const p3 = resampled[Math.min(resampled.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.25) {
      dense.push(catmull(p0, p1, p2, p3, t));
    }
  }
  dense.push(resampled[resampled.length - 1]);
  return dense;
}

export function trackLength(points) {
  let len = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return len;
}

export function maxTurn(points) {
  let worst = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const inLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const outLen = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (inLen < 0.5 || outLen < 0.5) continue;
    const a1 = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    const a2 = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x);
    let d = Math.abs((a2 - a1) * 180 / Math.PI);
    if (d > 180) d = 360 - d;
    if (d > worst) worst = d;
  }
  return worst;
}

export function maxTurnCoarse(points) {
  return maxTurn(resample(points, DRAW.resamplePx));
}

export function resample(points, step) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const seg = Math.hypot(dx, dy);
    acc += seg;
    if (acc >= step) {
      out.push(points[i]);
      acc = 0;
    }
  }
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function drawRail(ctx, points, color, width) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}

function distToSeg(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
