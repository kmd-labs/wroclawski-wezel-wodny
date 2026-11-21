/**
 * High-precision OSM geometry assembly, buffering, clipping, and Douglas-Peucker
 * Multi-LOD simplification helpers. Pure JS, zero native binaries.
 */

export function signedRingArea(ring) {
  let sum = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  return -sum / 2;
}

export function orientRing(ring, counterClockwise) {
  const ccw = signedRingArea(ring) > 0;
  return ccw === counterClockwise ? ring : ring.slice().reverse();
}

export function bboxOfRing(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const x = ring[i][0], y = ring[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

export function bboxOfGeometry(geom) {
  const rings = flattenCoords(geom);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) {
    for (const pt of r) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }
  }
  return [minX, minY, maxX, maxY];
}

export function bboxIntersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function bboxContainsPoint(b, pt) {
  return pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];
}

export function flattenCoords(geom) {
  if (!geom) return [];
  switch (geom.type) {
    case 'Point': return [[geom.coordinates]];
    case 'LineString': return [geom.coordinates];
    case 'MultiLineString':
    case 'Polygon': return geom.coordinates;
    case 'MultiPolygon': return geom.coordinates.flat();
    default: return [];
  }
}

export function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function assembleRings(segments) {
  const pending = segments
    .filter(s => s.coords.length >= 2)
    .map(s => ({ first: s.first, last: s.last, coords: s.coords.slice() }));
  const rings = [];
  while (pending.length) {
    const seed = pending.pop();
    let first = seed.first;
    let last = seed.last;
    let coords = seed.coords;
    let guard = 0;
    while (first !== last && guard++ < 15000) {
      let extended = false;
      for (let i = 0; i < pending.length; i++) {
        const s = pending[i];
        if (s.first === last) {
          coords = coords.concat(s.coords.slice(1));
          last = s.last;
        } else if (s.last === last) {
          coords = coords.concat(s.coords.slice(0, -1).reverse());
          last = s.first;
        } else if (s.last === first) {
          coords = s.coords.slice(0, -1).concat(coords);
          first = s.first;
        } else if (s.first === first) {
          coords = s.coords.slice(1).reverse().concat(coords);
          first = s.last;
        } else {
          continue;
        }
        pending.splice(i, 1);
        extended = true;
        break;
      }
      if (!extended) break;
    }
    if (first === last && coords.length >= 4) {
      const c0 = coords[0], cn = coords[coords.length - 1];
      if (c0[0] !== cn[0] || c0[1] !== cn[1]) coords.push([c0[0], c0[1]]);
      rings.push(coords);
    }
  }
  return rings;
}

export function buildMultipolygon(outerSegments, innerSegments) {
  const outers = assembleRings(outerSegments).map(r => orientRing(r, true));
  if (!outers.length) return null;
  const inners = assembleRings(innerSegments).map(r => orientRing(r, false));
  const polygons = outers.map(o => [o]);
  const outerBoxes = outers.map(bboxOfRing);
  for (const inner of inners) {
    const pt = inner[0];
    let placed = false;
    for (let i = 0; i < outers.length; i++) {
      if (bboxContainsPoint(outerBoxes[i], pt) && pointInRing(pt, outers[i])) {
        polygons[i].push(inner);
        placed = true;
        break;
      }
    }
    if (!placed && outers.length === 1) polygons[0].push(inner);
  }
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

/**
 * Buffers a polyline [lon, lat][] by `halfWidthM` metres with miter limiting at sharp bends.
 */
export function bufferLineToPolygon(coords, halfWidthM) {
  if (!coords || coords.length < 2) return null;
  const avgLat = coords[Math.floor(coords.length / 2)][1];
  const mPerDegLat = 111195;
  const mPerDegLon = 111195 * Math.cos((avgLat * Math.PI) / 180);

  // Deduplicate adjacent identical points
  const pts = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = pts[pts.length - 1];
    if (Math.abs(coords[i][0] - prev[0]) > 1e-8 || Math.abs(coords[i][1] - prev[1]) > 1e-8) {
      pts.push(coords[i]);
    }
  }
  if (pts.length < 2) return null;

  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = (next[0] - prev[0]) * mPerDegLon;
    const dy = (next[1] - prev[1]) * mPerDegLat;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const dLon = (nx * halfWidthM) / mPerDegLon;
    const dLat = (ny * halfWidthM) / mPerDegLat;
    left.push([pts[i][0] + dLon, pts[i][1] + dLat]);
    right.push([pts[i][0] - dLon, pts[i][1] - dLat]);
  }
  const ring = [...left, ...right.reverse(), left[0]];
  return { type: 'Polygon', coordinates: [orientRing(ring, true)] };
}

/** Iterative Douglas-Peucker line simplification (planar degrees). */
export function simplifyLine(pts, tolerance) {
  if (tolerance <= 0 || pts.length <= 2) return pts;
  const sqTol = tolerance * tolerance;
  const len = pts.length;
  const keep = new Uint8Array(len);
  keep[0] = 1;
  keep[len - 1] = 1;

  const stack = [[0, len - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSqDist = 0;
    let index = -1;
    const ax = pts[first][0], ay = pts[first][1];
    const bx = pts[last][0], by = pts[last][1];
    const dx = bx - ax, dy = by - ay;
    const segLenSq = dx * dx + dy * dy;

    for (let i = first + 1; i < last; i++) {
      const px = pts[i][0], py = pts[i][1];
      let sqDist;
      if (segLenSq === 0) {
        sqDist = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / segLenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const projX = ax + t * dx;
        const projY = ay + t * dy;
        sqDist = (px - projX) ** 2 + (py - projY) ** 2;
      }
      if (sqDist > maxSqDist) {
        maxSqDist = sqDist;
        index = i;
      }
    }

    if (maxSqDist > sqTol && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < len; i++) {
    if (keep[i]) out.push(pts[i]);
  }
  return out;
}

export function roundPt(pt, decimals) {
  const f = 10 ** decimals;
  return [Math.round(pt[0] * f) / f, Math.round(pt[1] * f) / f];
}

export function simplifyRing(ring, tolerance, decimals) {
  if (ring.length < 4) return null;
  // Split closed ring at farthest vertex from ring[0] so closed-loop simplification preserves loop shape
  let farIdx = 1;
  let farDist = -1;
  const p0 = ring[0];
  for (let i = 1; i < ring.length - 1; i++) {
    const d = (ring[i][0] - p0[0]) ** 2 + (ring[i][1] - p0[1]) ** 2;
    if (d > farDist) {
      farDist = d;
      farIdx = i;
    }
  }
  const firstHalf = simplifyLine(ring.slice(0, farIdx + 1), tolerance);
  const secondHalf = simplifyLine(ring.slice(farIdx), tolerance);
  const merged = firstHalf.slice(0, -1).concat(secondHalf).map(p => roundPt(p, decimals));
  if (merged.length < 4) return null;
  const c0 = merged[0], cn = merged[merged.length - 1];
  if (c0[0] !== cn[0] || c0[1] !== cn[1]) merged.push([c0[0], c0[1]]);
  // Reject degenerate zero-area slivers after simplification
  if (Math.abs(signedRingArea(merged)) < 1e-11) return null;
  return merged;
}

export function simplifyGeometry(geom, tolerance, decimals = 6) {
  if (!geom) return null;
  if (geom.type === 'Point') {
    return { type: 'Point', coordinates: roundPt(geom.coordinates, decimals) };
  }
  if (geom.type === 'LineString') {
    const pts = simplifyLine(geom.coordinates, tolerance).map(p => roundPt(p, decimals));
    return pts.length >= 2 ? { type: 'LineString', coordinates: pts } : null;
  }
  if (geom.type === 'MultiLineString') {
    const lines = geom.coordinates
      .map(l => simplifyLine(l, tolerance).map(p => roundPt(p, decimals)))
      .filter(l => l.length >= 2);
    return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
  }
  if (geom.type === 'Polygon') {
    const outer = simplifyRing(geom.coordinates[0], tolerance, decimals);
    if (!outer) return null;
    const rings = [outer];
    for (let i = 1; i < geom.coordinates.length; i++) {
      const inner = simplifyRing(geom.coordinates[i], tolerance, decimals);
      if (inner) rings.push(inner);
    }
    return { type: 'Polygon', coordinates: rings };
  }
  if (geom.type === 'MultiPolygon') {
    const polys = [];
    for (const poly of geom.coordinates) {
      const outer = simplifyRing(poly[0], tolerance, decimals);
      if (!outer) continue;
      const rings = [outer];
      for (let i = 1; i < poly.length; i++) {
        const inner = simplifyRing(poly[i], tolerance, decimals);
        if (inner) rings.push(inner);
      }
      polys.push(rings);
    }
    if (!polys.length) return null;
    return polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys };
  }
  return geom;
}

export function centroidOfGeometry(geom) {
  const b = bboxOfGeometry(geom);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}
