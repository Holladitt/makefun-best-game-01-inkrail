import { DECOR, DOCK, DRAW, FIELD, INK, PALETTE, STATIONS } from './config.js';
import { waitingLabelLayout } from './train-physics.js';

// INKRAIL — track-drawer.js
// Owns every drawn rail: drag input, resampling, spline smoothing, snapping,
// live ink-cost preview, sharp-turn warnings and right-click erase with refund.
// v2: rails snap to the station docking pad (in front of the building), every
// rail wears wooden sleepers and direction chevrons, and spans that cross the
// river ride a wooden bridge with side rails.

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
    riverSpans,
  };
  return drawer;

  function pointerDown(x, y) {
    const train = trainNear(x, y);
    if (train) {
      drawer.active = { train, raw: [{ x: train.x, y: train.y }] };
      drawer.preview = { points: [{ x: train.x, y: train.y }], cost: 0, tooSharp: false };
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
    const snapped = snapPoint({ x, y }, drawer.active.train, raw);
    const useRaw = snapped.station ? truncateBeforeDock(raw, snapped.station) : raw;
    const smooth = smoothTrack(useRaw, snapped);
    const cost = trackLength(smooth) * INK.costPerPx;
    const tooSharp = maxTurnCoarse(smooth) > drawer.active.train.spec.maxTurnDeg;
    drawer.preview = { points: smooth, cost, tooSharp, end: snapped };
  }

  function pointerUp() {
    if (!drawer.active || !drawer.preview) { drawer.active = null; drawer.preview = null; return null; }
    const { train, raw } = drawer.active;
    if (train.lost || train.delivered || !state.trains.includes(train)) {
      drawer.active = null;
      drawer.preview = null;
      return null;
    }
    const snapped = snapPoint(raw[raw.length - 1], train, raw);
    const useRaw = snapped.station ? truncateBeforeDock(raw, snapped.station) : raw;
    const smooth = smoothTrack(useRaw, snapped);
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
    state.inkUsed += cost;
    if (state.ink < 0.01) state.ink = 0;
    const track = {
      id: state.nextTrackId += 1, trainId: train.id, kind: train.kind,
      points: smooth, length: realLength, cost, stationId: snapped.stationId || null,
    };
    drawer.tracks.push(track);
    train.trackId = track.id;
    train.distance = 0;
    train.cars = [];
    train.moving = true;
    return track;
  }

  function eraseAt(x, y) {
    const track = trackAt(x, y);
    if (!track) return false;
    const train = state.trains.find(
      (t) => t.id === track.trainId && t.trackId === track.id
    );
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
    state.inkUsed += cost;
    if (state.ink < 0.01) state.ink = 0;
    track.points = track.points.concat(smooth.slice(1));
    track.length = track.length + trackLength(smooth);
    track.totalLength = undefined;
    track.cost += cost;
    track.stationId = snapped.stationId || track.stationId;
    return true;
  }

  function drawTracks(ctx) {
    for (const track of drawer.tracks) {
      const spans = riverSpans(track.points);
      for (const span of spans) drawBridgeDeck(ctx, span.points);
      drawRail(ctx, track.points, PALETTE.ink, 7);
      drawRail(ctx, track.points, '#F8F1DE', 2);
      drawSleepers(ctx, track.points);
      drawChevrons(ctx, track.points);
      for (const span of spans) drawBridgeRails(ctx, span.points);
    }
  }

  function drawPreview(ctx) {
    const p = drawer.preview;
    if (!p || p.points.length < 2) return;
    ctx.save();
    ctx.setLineDash([10, 8]);
    const color = p.tooSharp ? '#DC2626' : PALETTE.ink;
    drawRail(ctx, p.points, color, 6);
    ctx.setLineDash([]);
    const obstacles = previewObstacles(ctx);
    ctx.fillStyle = p.tooSharp ? '#DC2626' : PALETTE.text;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const label = p.tooSharp ? 'TOO SHARP for ' + drawer.active.train.spec.label + '!' : '-' + Math.round(p.cost) + ' INK';
    const end = p.points[p.points.length - 1];
    const m = ctx.measureText(label);
    const placed = placePreviewLabel(m, end, p.tooSharp, obstacles);
    if (placed) ctx.fillText(label, placed.x, placed.y);
    ctx.restore();
  }

  // Obstacles the preview cost label must not cover: every station's
  // expanded building/shadow box plus the final waiting-label boxes of all
  // unresolved stopped trains (same layout drawWaitingRing uses).
  function previewObstacles(ctx) {
    const boxes = [];
    for (const s of STATIONS) {
      boxes.push({ left: s.x - 64, right: s.x + 64, top: s.y - 64, bottom: s.y + 50 });
    }
    for (const t of state.trains) {
      if (t.delivered || t.lost || t.moving) continue;
      const layout = waitingLabelLayout(ctx, t);
      boxes.push(layout.dest);
      if (layout.countdown) boxes.push(layout.countdown);
    }
    return boxes;
  }

  // First surviving candidate wins; the label is omitted when none fits.
  // Candidates are glyph boxes measured with textAlign='left'; the returned
  // anchor draws the same box with that alignment.
  function placePreviewLabel(m, end, tooSharp, obstacles) {
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const candidates = [];
    if (end.y < 90 && !tooSharp) {
      // Existing right-aligned placement at (end.x-12, end.y+6), as a glyph
      // box: the advance ends at the anchor, so the box starts one advance
      // width to its left.
      candidates.push({
        left: end.x - 12 - m.width - m.actualBoundingBoxLeft,
        right: end.x - 12 - m.width + m.actualBoundingBoxRight,
        top: end.y + 6 - m.actualBoundingBoxAscent,
        bottom: end.y + 6 + m.actualBoundingBoxDescent,
      });
    }
    candidates.push({
      left: end.x - w / 2, right: end.x + w / 2,
      top: end.y - 16 - h, bottom: end.y - 16,
    });
    candidates.push({
      left: end.x - w / 2, right: end.x + w / 2,
      top: end.y + 16, bottom: end.y + 16 + h,
    });
    candidates.push({
      left: end.x - 16 - w, right: end.x - 16,
      top: end.y - h / 2, bottom: end.y + h / 2,
    });
    candidates.push({
      left: end.x + 16, right: end.x + 16 + w,
      top: end.y - h / 2, bottom: end.y + h / 2,
    });
    for (const box of candidates) {
      const bw = box.right - box.left;
      const bh = box.bottom - box.top;
      if (bw > 1256 || bh > 722) continue;
      const left = Math.max(12, Math.min(box.left, 1268 - bw));
      const top = Math.max(66, Math.min(box.top, 788 - bh));
      const clamped = { left, right: left + bw, top, bottom: top + bh };
      if (obstacles.some((o) => clamped.left < o.right && clamped.right > o.left
        && clamped.top < o.bottom && clamped.bottom > o.top)) continue;
      return {
        x: clamped.left + m.actualBoundingBoxLeft,
        y: clamped.top + m.actualBoundingBoxAscent,
      };
    }
    return null;
  }

  function snapPoint(p, train, raw) {
    for (const s of STATIONS) {
      if (Math.hypot(p.x - s.x, p.y - s.y) < DRAW.snapPx) {
        let from = null;
        if (raw) {
          for (let i = raw.length - 1; i >= 0; i -= 1) {
            if (Math.hypot(raw[i].x - s.x, raw[i].y - s.y) >= DOCK.padOffset) { from = raw[i]; break; }
          }
        }
        const dock = dockPoint(s, from);
        return { x: dock.x, y: dock.y, stationId: s.id, station: s };
      }
    }
    return { x: p.x, y: p.y, stationId: null, station: null };
  }

  function truncateBeforeDock(raw, station) {
    for (let i = 0; i < raw.length; i += 1) {
      if (Math.hypot(raw[i].x - station.x, raw[i].y - station.y) < DOCK.padOffset) return raw.slice(0, i);
    }
    return raw;
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

export function dockPoint(station, fromPoint) {
  let dx = FIELD.width / 2 - station.x;
  let dy = FIELD.height / 2 - station.y;
  if (fromPoint) {
    const fx = fromPoint.x - station.x;
    const fy = fromPoint.y - station.y;
    if (Math.hypot(fx, fy) >= 1) { dx = fx; dy = fy; }
  }
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: station.x + (dx / len) * DOCK.padOffset,
    y: station.y + (dy / len) * DOCK.padOffset,
  };
}

export function riverSpans(points) {
  if (!points || points.length < 2) return [];
  const spans = [];
  let current = null;
  const step = 8;
  let acc = 0;
  let prev = points[0];
  const samples = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(points[i].x - prev.x, points[i].y - prev.y);
    acc += seg;
    if (acc >= step) {
      samples.push(points[i]);
      acc = 0;
    }
    prev = points[i];
  }
  if (samples[samples.length - 1] !== points[points.length - 1]) samples.push(points[points.length - 1]);
  for (const p of samples) {
    const over = distToRiver(p) < 20;
    if (over && !current) current = { points: [p] };
    else if (over) current.points.push(p);
    else if (current) {
      if (current.points.length >= 2) spans.push(current);
      current = null;
    }
  }
  if (current && current.points.length >= 2) spans.push(current);
  return spans;
}

function distToRiver(p) {
  let best = Infinity;
  const river = DECOR.river;
  for (let i = 0; i < river.length - 1; i += 1) {
    const a = { x: river[i][0], y: river[i][1] };
    const b = { x: river[i + 1][0], y: river[i + 1][1] };
    best = Math.min(best, distToSeg(p.x, p.y, a, b));
  }
  return best;
}

function drawBridgeDeck(ctx, points) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = PALETTE.bridge;
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.bridgeDark;
  ctx.lineWidth = 1.5;
  walkPoints(points, 12, (p, angle) => {
    const nx = Math.cos(angle + Math.PI / 2);
    const ny = Math.sin(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(p.x - nx * 8, p.y - ny * 8);
    ctx.lineTo(p.x + nx * 8, p.y + ny * 8);
    ctx.stroke();
  });
  ctx.restore();
}

function drawBridgeRails(ctx, points) {
  ctx.save();
  ctx.strokeStyle = PALETTE.bridgeDark;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    walkPoints(points, 6, (p, angle, first) => {
      const nx = Math.cos(angle + Math.PI / 2) * 11 * side;
      const ny = Math.sin(angle + Math.PI / 2) * 11 * side;
      if (first) ctx.moveTo(p.x + nx, p.y + ny);
      else ctx.lineTo(p.x + nx, p.y + ny);
    });
    ctx.stroke();
  }
  ctx.restore();
}

function drawSleepers(ctx, points) {
  ctx.save();
  ctx.strokeStyle = PALETTE.wood;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  walkPoints(points, 26, (p, angle) => {
    const nx = Math.cos(angle + Math.PI / 2);
    const ny = Math.sin(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(p.x - nx * 7, p.y - ny * 7);
    ctx.lineTo(p.x + nx * 7, p.y + ny * 7);
    ctx.stroke();
  });
  ctx.restore();
}

function drawChevrons(ctx, points) {
  ctx.save();
  ctx.fillStyle = 'rgba(248,241,222,0.9)';
  let n = 0;
  walkPoints(points, 90, (p, angle) => {
    n += 1;
    if (n % 2 === 0) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

function walkPoints(points, step, cb) {
  if (points.length < 2) return;
  let acc = 0;
  let first = true;
  cb(points[0], Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x), true);
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const angle = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    acc += seg;
    if (acc >= step) {
      cb(points[i], angle, false);
      acc = 0;
      first = false;
    }
  }
  void first;
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
