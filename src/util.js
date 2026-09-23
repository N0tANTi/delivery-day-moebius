import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; f *= 2; a *= 0.5; }
  return s / n;
}

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The bay: sea to the south (+z), the shoreline curving out into headlands on both sides.
export function shoreZ(x) {
  const t = Math.abs(x) / 260;
  return Math.min(40 * t * t, 420) + 6 * Math.sin(x * 0.03);
}

// Town zone weight: 1 inside the hillside town, 0 outside.
export function townWeight(x, d) {
  const lim = 178 - Math.max(0, d - 20) * 0.32;
  return (1 - smooth(lim - 8, lim + 14, Math.abs(x))) * (1 - smooth(200, 222, d));
}

function groundHarbour(x, z) {
  const d = shoreZ(x) - z;
  const ax = Math.abs(x);
  const cliff = smooth(330, 520, ax) * 22;
  if (d < 0) return Math.max(-12, 1.0 + cliff * smooth(-6, 0, d) + d * 0.8);
  let h = 2 + d * 0.27 + cliff * smooth(0, 12, d);
  const hill = smooth(170, 460, d) + smooth(250, 520, ax) * 0.7 * smooth(0, 60, d);
  h += hill * (35 + 80 * fbm(x * 0.003 + 10, z * 0.003));
  h += (1 - townWeight(x, d)) * fbm(x * 0.015, z * 0.015, 3) * 8 * smooth(4, 50, d);
  return h;
}

// ---- Prague: the Vltava runs along x; Old Town on the south bank (+z), Malá Strana climbing to
// the castle on the north bank (-z), Petřín hill to the north-west.

export const CITY = new URLSearchParams(globalThis.location?.search || '').get('city') === 'harbour' ? 'harbour' : 'prague';
export const RIVER_HW = 58;
export function riverZ(x) { return 34 * Math.sin(x * 0.0042 + 0.6) + 14 * Math.sin(x * 0.0105 + 2); }
export function riverSlope(x) { return 34 * 0.0042 * Math.cos(x * 0.0042 + 0.6) + 14 * 0.0105 * Math.cos(x * 0.0105 + 2); }
export const southZ = (x, s) => riverZ(x) + RIVER_HW + s;
export const northZ = (x, n) => riverZ(x) - RIVER_HW - n;
export const PETRIN = { x: -430, n: 250 };

function pragueTown(x, z) {
  const rz = riverZ(x), d = Math.abs(z - rz) - RIVER_HW;
  if (z > rz) return (1 - smooth(360, 400, Math.abs(x))) * (1 - smooth(320, 360, d));
  const mala = smooth(-350, -325, x) * (1 - smooth(200, 225, x)) * (1 - smooth(230, 255, d));
  const castle = smooth(-275, -250, x) * (1 - smooth(90, 115, x)) * (1 - smooth(355, 380, d));
  return Math.max(mala, castle);
}

function groundPrague(x, z) {
  const rz = riverZ(x), d = Math.abs(z - rz) - RIVER_HW;
  if (d < 0) return Math.max(-6, 1.0 + d * 0.8);
  let h = 4.5;
  if (z < rz) {
    const ridge = 1 - smooth(230, 420, Math.abs(x + 70));
    h += smooth(30, 250, d) * 50 * ridge;
    h += smooth(40, 420, d) * 28 * (1 - ridge);
    const pd = Math.hypot(x - PETRIN.x, z - northZ(PETRIN.x, PETRIN.n));
    h += (1 - smooth(40, 340, pd)) * 72;
    h += smooth(230, 330, x) * smooth(20, 130, d) * 32;          // Letná
    h += smooth(380, 800, d) * (20 + 40 * fbm(x * 0.003 + 7, z * 0.003));
  } else {
    h += smooth(380, 900, d) * (22 + 45 * fbm(x * 0.003, z * 0.003 + 3));
  }
  h += (1 - pragueTown(x, z)) * fbm(x * 0.015, z * 0.015, 3) * 6 * smooth(10, 60, d);
  return h;
}

export function groundH(x, z) { return CITY === 'prague' ? groundPrague(x, z) : groundHarbour(x, z); }
// distance from the water's edge, positive on land
export function landDist(x, z) { return CITY === 'prague' ? Math.abs(z - riverZ(x)) - RIVER_HW : shoreZ(x) - z; }
export function townW(x, z) { return CITY === 'prague' ? pragueTown(x, z) : townWeight(x, shoreZ(x) - z); }

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
}

// Collects coloured pieces and merges them into one mesh.
export class Bucket {
  constructor() { this.geos = []; }
  add(geo, matrix, color) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.clearGroups();
    if (matrix) g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
  }
  mesh(material) {
    const m = new THREE.Mesh(mergeGeometries(this.geos, false), material);
    this.geos = [];
    return m;
  }
}

export const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
