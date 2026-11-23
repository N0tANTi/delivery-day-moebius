import * as THREE from 'three';
import { toon, toonMat, foliageMat } from './toon.js';
import { STYLES, THEME_U } from './styles.js';
import { buildSky, buildMountains, buildClouds, buildWater, buildMotes } from './atmosphere.js';
import { Bucket, M, rng, fbm, vnoise, shoreZ, shoreSlope, groundH, townW, landDist, smooth, pick, CITY, riverZ, RIVER_HW, northZ, southZ, PETRIN } from './util.js';
import { buildPrague } from './prague.js';

const V3 = THREE.Vector3;

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
export const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
export const SPH = new THREE.IcosahedronGeometry(1, 2);
export const PLANE = new THREE.PlaneGeometry(1, 1);

const MOLE_A = new THREE.Vector2(102, shoreZ(102) + 2);
const MOLE_B = new THREE.Vector2(48, shoreZ(48) + 158);
export const TOWER = new V3(0, 0, -96);

export function buildWorld(scene) {
  const W = {
    colliders: [],
    puffs: [],
    hideInNormals: [],
    updaters: [],
    styleListeners: [],
    smokeSources: [],
    rows: [],
    treeSpots: [],
  };
  const R = rng(20260923);

  lights(scene, W);
  buildSky(scene, W);
  buildMountains(scene, W);
  terrain(scene);
  buildWater(scene, W, MOLE_A, MOLE_B);

  const B = new Bucket();   // architecture, roofs, terrain structures
  const BW = new Bucket();  // windows & lantern globes (glow warmly in Golden Hour!)

  if (CITY === 'prague') {
    buildPrague(B, BW, W, R, scene);
  } else {
    town(B, BW, W, R);
    landmarks(B, BW, W, R, scene);
    windmills(B, BW, W, R, scene);
    viaduct(B, W);
    seaArch(B, W);
    harbour(B, BW, W, R, scene);
    farVillage(B, BW, W, R);
    W.start = [74, 42, 232, 0.24];
    W.center = new THREE.Vector2(-8, 12);
    W.waterAt = new V3(0, 0, 90);
    W.bellAt = TOWER;
  }

  const townMesh = B.mesh(toonMat({ vertexColors: true }));
  if (townMesh) {
    townMesh.castShadow = townMesh.receiveShadow = true;
    scene.add(townMesh);
  }
  const winMesh = BW.mesh(toonMat({ vertexColors: true, duskGlow: 1.0, noHatch: true }));
  if (winMesh) {
    scene.add(winMesh);
  }

  trees(scene, W, R);
  buildClouds(scene, W, R);
  hotAirBalloons(scene, W, R);
  gulls(scene, W, R);
  smoke(scene, W, R);
  buildMotes(scene, W, R);
  if (CITY !== 'prague') laundryAndBunting(scene, W, R);

  W.applyStyle = (style) => { for (const fn of W.styleListeners) fn(style); };
  W.update = (t, dt, ctx) => { for (const f of W.updaters) f(t, dt, ctx); };
  return W;
}

// ================================================================ LIGHTS
function lights(scene, W) {
  const st = STYLES.ghibli;
  const hemi = new THREE.HemisphereLight(st.hemiSky, st.hemiGround, st.hemiIntensity);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(st.sunColor, st.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -155, right: 155, top: 155, bottom: -155, near: 10, far: 1100 });
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.36;
  scene.add(sun, sun.target);

  const curSunDir = st.sunDir.clone();
  W.styleListeners.push((s) => {
    curSunDir.copy(s.sunDir);
    sun.color.copy(s.sunColor);
    sun.intensity = s.sunIntensity;
    hemi.color.copy(s.hemiSky);
    hemi.groundColor.copy(s.hemiGround);
    hemi.intensity = s.hemiIntensity;
  });

  W.updaters.push((t, dt, { focus }) => {
    const step = 310 / 2048;
    const f = focus.clone();
    f.x = Math.round(f.x / step) * step;
    f.z = Math.round(f.z / step) * step;
    sun.target.position.copy(f);
    sun.position.copy(f).addScaledVector(curSunDir, 480);
  });
}

// ================================================================ PAINTERLY TERRAIN
function terrain(scene) {
  const P = CITY === 'prague';
  const g = P ? new THREE.PlaneGeometry(4400, 4400, 320, 320) : new THREE.PlaneGeometry(3800, 3200, 310, 260);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, P ? 0 : -820);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const C = (h) => new THREE.Color(h);

  const meadow = C('#85b254'), lush = C('#548746'), pine = C('#3d6a42'), golden = C('#d4be74');
  const lavender = C('#9a84be'), marigold = C('#d9ae58');
  const pave = C('#e3d2b0'), pave2 = C('#ccb58f'), sand = C('#efe0b4');
  const cliff = C('#d4c2a4'), cliffDark = C('#a8947a'), bed = C('#53aca4');

  const c = new THREE.Color(), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), ny = n.getY(i), y = p.getY(i);
    const d = landDist(x, z);
    const n1 = fbm(x * 0.011, z * 0.011, 3);
    const n2 = fbm(x * 0.0045 + 29, z * 0.0045 - 11, 3);

    c.copy(meadow).lerp(lush, n1);
    c.lerp(pine, smooth(0.48, 0.64, fbm(x * 0.0065 + 42, z * 0.0065, 3)) * 0.72);
    c.lerp(golden, smooth(0.56, 0.74, vnoise(x * 0.0042 + 4, z * 0.0042)) * 0.52);

    // Sculpted contour terrace bands, sunlit wheat & Provençal lavender hillside ribbons
    const terr = (P ? 0.55 : 1.0) * smooth(24, 95, d) * (1 - smooth(0.58, 0.72, n2));
    const band = Math.sin(d * 0.14 + fbm(x * 0.009, z * 0.009, 2) * 5.5);
    if (!P && band > 0.52 && y > 35 && y < 115 && x < 140) {
      c.lerp(lavender, terr * 0.45 * smooth(0.52, 0.78, band));
    } else if (band > 0.56) {
      c.lerp(marigold, terr * 0.34 * smooth(0.56, 0.80, band));
    } else if (band < -0.45) {
      c.lerp(lush, terr * 0.38 * smooth(0.45, 0.78, -band));
    }

    // Winding sandy dirt path climbing up to the Windmill Ridge
    if (!P) {
      const pathX = -90 + Math.sin(d * 0.028) * 32 - Math.max(0, d - 160) * 0.25;
      const onPath = (1 - smooth(2.5, 7.0, Math.abs(x - pathX))) * smooth(160, 195, d) * (1 - smooth(290, 340, d));
      c.lerp(pave, onPath * 0.75);
    }

    // Town cobblestone ground
    const tw = townW(x, z);
    t.copy(pave).lerp(pave2, vnoise(x * 0.28, z * 0.28) * 0.62);
    c.lerp(t, smooth(0.32, 0.62, tw));

    // Golden cove sand along non-town beaches
    if (tw < 0.48 && !P) c.lerp(sand, smooth(11, 1.8, d));

    // Stratified warm Mediterranean limestone cliffs on steep slopes
    const steep = smooth(0.18, 0.44, 1 - ny);
    const strata = 0.5 + 0.5 * Math.sin(y * 0.65 + n1 * 4.0);
    c.lerp(strata > 0.55 ? cliff : cliffDark, steep * 0.92);

    if (d < -0.5) c.copy(bed);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, toonMat({ vertexColors: true, brushScale: 0.35 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ================================================================ SHARED STREET PROPS & HOUSES
const WALLS = ['#f6ebd2', '#f2daab', '#f4cbb4', '#ebb99c', '#d5e7d9', '#faf3e6', '#eed6c5', '#dce9ed', '#f5e1a8', '#f6dfd0', '#ebe3d0'];
const ROOFS = ['#cb5f3b', '#ba5036', '#d67446', '#a94833', '#c86944', '#d48052'];
const SHUTTERS = ['#4a7f6b', '#527aa6', '#3d6f8c', '#8c693e', '#658c4d', '#9e4c44'];
const AWNINGS = ['#d1443a', '#3a6da8', '#3c8a62', '#d88c2c', '#864a8e'];
const FLOWERS = ['#e24242', '#e85278', '#f0a638', '#d94868', '#9c68c9'];

export function addLamp(B, BW, x, y, z) {
  B.add(CYL6, M(x, y + 0.25, z, 0, 0, 0, 0.22, 0.5, 0.22), '#2c303a');
  B.add(CYL6, M(x, y + 2.0, z, 0, 0, 0, 0.08, 3.6, 0.08), '#2c303a');
  B.add(BOX, M(x, y + 3.85, z, 0, 0, 0, 0.52, 0.12, 0.52), '#2c303a');
  BW.add(CYL6, M(x, y + 4.18, z, 0, 0, 0, 0.24, 0.55, 0.24), '#f6e7bd');
  B.add(new THREE.ConeGeometry(0.36, 0.32, 6), M(x, y + 4.60, z), '#2c303a');
}

export function addParasol(B, R, x, y, z, col) {
  const ac = col || pick(R, AWNINGS);
  B.add(CYL6, M(x, y + 1.3, z, 0, 0, 0, 0.06, 2.6, 0.06), '#6b4c32');
  B.add(new THREE.ConeGeometry(1.75, 0.65, 8), M(x, y + 2.65, z, 0, R() * 6, 0), ac);
  B.add(CYL, M(x, y + 0.78, z, 0, 0, 0, 0.85, 0.1, 0.85), '#f5eee0');
}

export function gableGeo(span, rh, len, alongX) {
  const s = new THREE.Shape();
  s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, rh); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  if (alongX) g.rotateY(Math.PI / 2);
  return g;
}

export function addHouse(B, BW, W, R, o) {
  const gy = o.gy ?? groundH(o.x, o.z);
  const bottom = gy - 4.5, top = gy + o.h;
  const H = M(o.x, 0, o.z, 0, o.ry, 0);
  const L = (x, y, z, rx, ry, rz, sx, sy, sz) => H.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz));
  const wall = o.wall ?? pick(R, WALLS);
  const roof = o.roof ?? (R() < 0.07 ? '#6c7e90' : pick(R, ROOFS));
  const trim = o.trim ?? '#f7f1e3';

  // Main plaster mass + warm stone foundation plinth
  B.add(BOX, L(0, (top + bottom) / 2, 0, 0, 0, 0, o.w, top - bottom, o.dp), wall);
  B.add(BOX, L(0, gy - 0.6, 0, 0, 0, 0, o.w + 0.16, 2.6, o.dp + 0.16), '#c9bc9f');

  // Pitched terracotta roof with overhanging eaves & ridge cap
  const P = o.prague;
  const alongX = o.ridgeX ?? R() < 0.72;
  const span = alongX ? o.dp : o.w, len = alongX ? o.w : o.dp;
  const rh = span * 0.5 * (P ? 0.96 + R() * 0.34 : 0.56 + R() * 0.26);
  const ov = 0.65, ovL = o.baroque ? 0.22 : 0.58;
  B.add(gableGeo(span, rh, len, alongX), L(0, top, 0), wall);
  const a = Math.atan2(rh, span / 2);
  const run = span / 2 + ov;
  const slabLen = run / Math.cos(a);
  const midDrop = rh - (run / 2) * Math.tan(a);
  const up = 0.15;
  for (const side of [1, -1]) {
    const off = (run / 2) * side;
    if (alongX) B.add(BOX, L(0, top + midDrop + up, off, a * side, 0, 0, len + 2 * ovL, 0.30, slabLen), roof);
    else B.add(BOX, L(off, top + midDrop + up, 0, 0, 0, -a * side, slabLen, 0.30, len + 2 * ovL), roof);
  }
  const cap = o.cap ?? '#8d3b29';
  if (alongX) B.add(BOX, L(0, top + rh + 0.22, 0, 0, 0, 0, len + 2 * ovL, 0.32, 0.48), cap);
  else B.add(BOX, L(0, top + rh + 0.22, 0, 0, 0, 0, 0.48, 0.32, len + 2 * ovL), cap);

  // Under-eave fascia trim for extra crispness
  if (!P) {
    B.add(BOX, L(0, top - 0.12, 0, 0, 0, 0, o.w + 0.25, 0.30, o.dp + 0.25), trim);
  } else {
    pragueFront(B, BW, R, L, o, gy, top, rh, span, alongX, wall, roof);
  }

  // Chimney + occasional smoke source
  if (R() < (P ? 0.42 : 0.78)) {
    const cx = alongX ? (R() - 0.5) * o.w * 0.58 : (R() < 0.5 ? -1 : 1) * o.w * 0.2;
    const cz = alongX ? (R() < 0.5 ? -1 : 1) * o.dp * 0.2 : (R() - 0.5) * o.dp * 0.58;
    const ctop = top + rh + 1.1;
    B.add(BOX, L(cx, (top + ctop) / 2, cz, 0, 0, 0, 0.85, ctop - top, 0.85), R() < 0.5 ? wall : '#b8684c');
    B.add(BOX, L(cx, ctop + 0.08, cz, 0, 0, 0, 1.05, 0.18, 1.05), '#7a4b3c');
    B.add(CYL6, L(cx, ctop + 0.36, cz, 0, 0, 0, 0.19, 0.48, 0.19), '#6b4739');
    if (R() < 0.085) W.smokeSources.push(new V3(cx, ctop + 0.7, cz).applyMatrix4(H));
  }

  // Facade windows (glass panes into BW so they glow warmly at sunset!)
  const shutter = R() < 0.58 ? pick(R, SHUTTERS) : null;
  const flowers = R() < 0.65;
  const faces = [
    { fx: 0, fz: o.dp / 2, ry: 0, w: o.w, front: true, p: 1 },
    { fx: 0, fz: -o.dp / 2, ry: Math.PI, w: o.w, p: P ? 0 : 0.78 },
    { fx: o.w / 2, fz: 0, ry: Math.PI / 2, w: o.dp, p: P ? 0 : 0.36 },
    { fx: -o.w / 2, fz: 0, ry: -Math.PI / 2, w: o.dp, p: P ? 0 : 0.36 },
  ];
  for (const f of faces) {
    if (R() > f.p) continue;
    const cs = Math.cos(f.ry), sn = Math.sin(f.ry);
    const at = (bucket, u, y, out, sx, sy, sz, color) =>
      bucket.add(BOX, L(f.fx + u * cs + out * sn, y, f.fz - u * sn + out * cs, 0, f.ry, 0, sx, sy, sz), color);
    const cols = Math.max(1, Math.floor(f.w / 2.65));
    const sp = f.w / cols;
    for (let s = 0; ; s++) {
      const y = gy + 1.8 + s * 3.1;
      if (y + 1.0 > top - 0.2) break;
      for (let ci = 0; ci < cols; ci++) {
        const u = -f.w / 2 + sp * (ci + 0.5);
        if (f.front && s === 0) {
          if (o.shop) continue;
          if (ci === Math.floor(cols / 2)) {
            at(B, u, gy + 1.2, 0.06, 1.3, 2.35, 0.24, '#6d4a33');
            at(B, u, gy + 2.52, 0.08, 1.6, 0.28, 0.34, trim);
            continue;
          }
        }
        if (P) {
          B.add(PLANE, L(f.fx + u * cs + 0.03 * sn, y, f.fz - u * sn + 0.03 * cs, 0, f.ry, 0, 1.28, 1.84, 1), trim);
          BW.add(PLANE, L(f.fx + u * cs + 0.06 * sn, y, f.fz - u * sn + 0.06 * cs, 0, f.ry, 0, 0.94, 1.48, 1), '#455b75');
          if (s === 1) at(B, u, y + 1.12, 0.12, 1.58, 0.25, 0.30, trim);
          continue;
        }
        if (s > 0 || f.front) {
          at(B, u, y, 0.02, 1.25, 1.65, 0.18, trim);
          at(BW, u, y, 0.07, 0.92, 1.34, 0.16, '#425b78');
          if (shutter && f.p > 0.5) {
            at(B, u - 0.80, y, 0.08, 0.44, 1.46, 0.12, shutter);
            at(B, u + 0.80, y, 0.08, 0.44, 1.46, 0.12, shutter);
          }
          if (flowers && f.front && s > 0 && R() < 0.58) {
            at(B, u, y - 0.84, 0.26, 1.20, 0.26, 0.42, '#8c5a3a');
            at(B, u, y - 0.62, 0.28, 1.12, 0.30, 0.38, pick(R, FLOWERS));
          }
          if (f.front && s > 0 && s < 3 && R() < 0.15) {
            at(B, u, y - 0.96, 0.56, 1.9, 0.16, 1.05, '#e8dfd0');
            at(B, u, y - 0.44, 1.04, 1.9, 0.88, 0.09, '#393b45');
          }
        }
      }
    }
  }

  // Shopfront with striped Mediterranean awning
  if (o.shop && P) {
    const fz = o.dp / 2;
    B.add(BOX, L(0, gy + 1.5, fz + 0.04, 0, 0, 0, o.w * 0.72, 2.35, 0.22), '#5a4636');
    BW.add(PLANE, L(0, gy + 1.6, fz + 0.16, 0, 0, 0, o.w * 0.62, 1.92, 1), '#506780');
  } else if (o.shop) {
    const fz = o.dp / 2;
    B.add(BOX, L(-o.w * 0.12, gy + 1.5, fz + 0.03, 0, 0, 0, o.w * 0.56, 2.05, 0.20), trim);
    BW.add(BOX, L(-o.w * 0.12, gy + 1.5, fz + 0.08, 0, 0, 0, o.w * 0.50, 1.82, 0.18), '#4d6785');
    B.add(BOX, L(o.w * 0.30, gy + 1.2, fz + 0.06, 0, 0, 0, 1.22, 2.35, 0.24), '#6d4a33');
    const ac = o.awning ?? pick(R, AWNINGS);
    const n = Math.max(4, Math.round(o.w / 0.88));
    for (let i = 0; i < n; i++) {
      const u = -o.w / 2 + (o.w / n) * (i + 0.5);
      B.add(BOX, L(u, gy + 3.08, fz + 0.78, 0.42, 0, 0, o.w / n + 0.01, 0.08, 1.72), i % 2 ? '#faf4e8' : ac);
    }
  }

  if (!o.noCollide) {
    const box = new THREE.Box3(new V3(-o.w / 2, bottom, -o.dp / 2), new V3(o.w / 2, top + rh * 0.8, o.dp / 2)).applyMatrix4(H);
    W.colliders.push(box);
  }
  return { gy, top, H };
}

function pragueFront(B, BW, R, L, o, gy, top, rh, span, alongX, wall, roof) {
  const fz = o.dp / 2;
  const trim = o.trim ?? '#f7f1e3';
  B.add(BOX, L(0, top - 0.15, fz + 0.12, 0, 0, 0, o.w + 0.12, 0.42, 0.46), trim);
  B.add(BOX, L(0, gy + 3.05, fz + 0.06, 0, 0, 0, o.w, 0.26, 0.26), trim);
  if (o.baroque) {
    const hw = o.w / 2 + 0.05, s = new THREE.Shape();
    s.moveTo(-hw, 0); s.lineTo(-hw, 0.45);
    s.quadraticCurveTo(-hw * 0.55, 0.5, -hw * 0.5, rh * 0.45);
    s.lineTo(-hw * 0.32, rh * 0.5); s.lineTo(-hw * 0.32, rh * 0.86);
    s.quadraticCurveTo(-hw * 0.32, rh + 0.9, 0, rh + 1.0);
    s.quadraticCurveTo(hw * 0.32, rh + 0.9, hw * 0.32, rh * 0.86);
    s.lineTo(hw * 0.32, rh * 0.5); s.lineTo(hw * 0.5, rh * 0.45);
    s.quadraticCurveTo(hw * 0.55, 0.5, hw, 0.45); s.lineTo(hw, 0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false, curveSegments: 5 });
    B.add(g, L(0, top, fz - 0.05), wall);
    B.add(BOX, L(0, top + rh * 0.86, fz + 0.25, 0, 0, 0, hw * 0.72, 0.18, 0.3), trim);
    BW.add(CYL, L(0, top + rh * 0.62, fz + 0.46, Math.PI / 2, 0, 0, 0.42, 0.08, 0.55), '#455b75');
    B.add(SPH, L(0, top + rh + 1.2, fz + 0.2, 0, 0, 0, 0.22, 0.22, 0.22), trim);
  } else if (alongX) {
    const n = o.w > 9 ? 2 : 1;
    const dz = (span / 2) * 0.5, depth = (span / 2) * 0.55;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i - 0.5) * o.w * 0.45;
      const y0 = top + rh * (1 - dz / (span / 2));
      B.add(BOX, L(u, y0 + 0.55, dz - depth / 2 + 0.1, 0, 0, 0, 1.4, 1.7, depth), wall);
      B.add(gableGeo(1.9, 0.8, depth + 0.3, false), L(u, y0 + 1.4, dz - depth / 2 + 0.2), roof);
      BW.add(PLANE, L(u, y0 + 0.6, dz + 0.13, 0, 0, 0, 0.82, 1.02, 1), '#455b75');
    }
  }
}

// ================================================================ HARBOUR HILLSIDE TOWN
function town(B, BW, W, R) {
  const streets = [-132, -72, -10, 50, 114];
  let bakery = false;
  for (let r = 0; r < 13; r++) {
    const d0 = 16 + r * 15;
    const lim = 184 - r * 5.2;
    const list = [];
    let x = -lim + R() * 3;
    while (x < lim) {
      const w = 6.2 + R() * 4.2;
      const xc = x + w / 2;
      let skip = R() < 0.05;
      for (const s of streets) if (Math.abs(xc - (s + Math.sin(r * 1.3 + s) * 5)) < w / 2 + 2.7) skip = true;
      if (Math.abs(xc) < 30 && d0 > 66 && d0 < 126) skip = true;           // clock-tower piazza
      if (xc > -94 && xc < -30 && d0 > 120 && d0 < 172) skip = true;       // seaside cathedral square
      if (skip) { x += 3; continue; }
      const dp = 8.2 + R() * 2.2;
      const zc = shoreZ(xc) - d0 - dp / 2;
      const isBakery = !bakery && r === 1 && xc > 48;
      if (isBakery) bakery = true;
      const h = (r === 0 ? 11 : 8.5) + R() * 6.5 + (r < 3 ? 2 : 0);
      const res = addHouse(B, BW, W, R, {
        x: xc, z: zc, ry: -Math.atan(shoreSlope(xc)), w, dp, h,
        shop: isBakery || (r === 0 && R() < 0.8) || (r > 0 && R() < 0.14),
        wall: isBakery ? '#d0e8de' : undefined,
        awning: isBakery ? '#d4453c' : undefined,
        ridgeX: isBakery ? true : undefined,
      });
      if (isBakery) bakerySign(B, res.H, w, dp, res.gy);
      list.push({ x0: x, x1: x + w, dp, gy: res.gy, top: res.top });
      x += w + (R() < 0.3 ? 1.0 + R() * 2.0 : 0.35);
    }
    W.rows.push({ d0, list });
  }
}

function bakerySign(B, H, w, dp, gy) {
  const L = (x, y, z, rx, ry, rz, sx, sy, sz) => H.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz));
  const x = -w / 2 + 0.4, z = dp / 2 + 0.9;
  B.add(BOX, L(x, gy + 4.7, dp / 2 + 0.65, 0, 0, 0, 0.08, 0.08, 1.4), '#2c282a');
  B.add(BOX, L(x, gy + 4.42, z, 0, 0, 0, 0.03, 0.55, 0.03), '#2c282a');
  const pretzel = new THREE.TorusGeometry(0.45, 0.12, 6, 14);
  B.add(pretzel, L(x, gy + 3.72, z, 0, Math.PI / 2, 0), '#d4923e');
  B.add(pretzel, L(x, gy + 3.56, z - 0.26, 0, Math.PI / 2, 0, 0.6, 0.6, 0.6), '#d4923e');
  B.add(pretzel, L(x, gy + 3.56, z + 0.26, 0, Math.PI / 2, 0, 0.6, 0.6, 0.6), '#d4923e');
}

// ================================================================ LANDMARKS (CLOCK TOWER, PIAZZA & CATHEDRAL)
function landmarks(B, BW, W, R, scene) {
  const tx = TOWER.x, tz = TOWER.z, ty = groundH(tx, tz);
  TOWER.y = ty;

  // Piazza fountain + cafe parasols + warm street lamps
  B.add(CYL, M(tx + 15, ty + 0.4, tz + 13, 0, 0, 0, 3.6, 1.6, 3.6), '#dfd2b8');
  B.add(CYL, M(tx + 15, ty + 1.18, tz + 13, 0, 0, 0, 3.1, 0.1, 3.1), '#64c6d4');
  B.add(CYL, M(tx + 15, ty + 2.2, tz + 13, 0, 0, 0, 0.38, 3.2, 0.38), '#dfd2b8');
  B.add(CYL, M(tx + 15, ty + 2.8, tz + 13, 0, 0, 0, 1.5, 0.25, 1.5), '#dfd2b8');
  B.add(SPH, M(tx + 15, ty + 3.9, tz + 13, 0, 0, 0, 0.72, 0.45, 0.72), '#dfd2b8');

  for (const [px, pz, col] of [[-13, 14, '#d1443a'], [-18, 10, '#3a6da8'], [14, -10, '#d88c2c'], [20, -6, '#3c8a62']]) {
    addParasol(B, R, tx + px, groundH(tx + px, tz + pz), tz + pz, col);
  }
  for (const [lx, lz] of [[-16, 18], [18, 18], [-16, -14], [18, -14]]) {
    addLamp(B, BW, tx + lx, groundH(tx + lx, tz + lz), tz + lz);
  }

  // Grand Clock Tower with oxidized copper spire
  const stone = '#efe0be', trim = '#d9c39b';
  const shaft = 33;
  B.add(BOX, M(tx, ty + shaft / 2 - 3, tz, 0, 0, 0, 7.6, shaft + 6, 7.6), stone);
  B.add(BOX, M(tx, ty + 1.0, tz, 0, 0, 0, 8.8, 3.2, 8.8), trim);
  for (const yy of [12, 23, shaft - 0.3]) B.add(BOX, M(tx, ty + yy, tz, 0, 0, 0, 8.5, 0.75, 8.5), trim);
  B.add(BOX, M(tx, ty + shaft + 3.8, tz, 0, 0, 0, 6.6, 7.6, 6.6), stone);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, sx = Math.sin(a), cz = Math.cos(a);
    B.add(BOX, M(tx + sx * 3.3, ty + shaft + 3.9, tz + cz * 3.3, 0, a, 0, 2.8, 4.5, 0.3), '#383644');
    B.add(CYL, M(tx + sx * 3.85, ty + 23.5, tz + cz * 3.85, Math.PI / 2, a, 0, 2.7, 0.22, 2.7), '#363b46');
    BW.add(CYL, M(tx + sx * 3.92, ty + 23.5, tz + cz * 3.92, Math.PI / 2, a, 0, 2.38, 0.22, 2.38), '#fbf6e4');
    BW.add(BOX, M(tx + sx * 3.84, ty + 15.5, tz + cz * 3.84, 0, a, 0, 1.1, 3.6, 0.14), '#455b78');
  }
  B.add(BOX, M(tx, ty + shaft + 7.9, tz, 0, 0, 0, 7.8, 0.7, 7.8), trim);
  const spire = new THREE.ConeGeometry(5.3, 17, 4); spire.rotateY(Math.PI / 4);
  B.add(spire, M(tx, ty + shaft + 8.2 + 8.5, tz), '#5ba88e');
  B.add(SPH, M(tx, ty + shaft + 25.5, tz, 0, 0, 0, 0.56, 0.56, 0.56), '#ecc85a');
  B.add(BOX, M(tx, ty + shaft + 27.0, tz, 0, 0, 0, 0.09, 2.4, 0.09), '#36363c');
  W.colliders.push(new THREE.Box3(new V3(tx - 4.6, ty - 3, tz - 4.6), new V3(tx + 4.6, ty + shaft + 20, tz + 4.6)));
  W.colliders.push(new THREE.Box3(new V3(tx - 1.6, ty + shaft + 20, tz - 1.6), new V3(tx + 1.6, ty + shaft + 27, tz + 1.6)));

  const hands = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const face = new THREE.Group();
    face.position.set(tx + Math.sin(a) * 4.08, ty + 23.5, tz + Math.cos(a) * 4.08);
    face.rotation.y = a;
    const hour = new THREE.Group(), minute = new THREE.Group();
    const hm = new THREE.Mesh(BOX, toon('#2b2b34')); hm.scale.set(0.24, 1.32, 0.08); hm.position.y = 0.55; hour.add(hm);
    const mm = new THREE.Mesh(BOX, toon('#2b2b34')); mm.scale.set(0.15, 2.0, 0.08); mm.position.set(0, 0.85, 0.05); minute.add(mm);
    face.add(hour, minute);
    scene.add(face);
    hands.push({ hour, minute });
  }
  W.updaters.push(() => {
    const d = new Date();
    const m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
    for (const hd of hands) { hd.hour.rotation.z = (-h / 12) * Math.PI * 2; hd.minute.rotation.z = (-m / 60) * Math.PI * 2; }
  });

  // Domed Seaside Town Hall / Cathedral
  const hx = -62, hz = shoreZ(-62) - 148, hy = groundH(hx, hz), hry = -Math.atan(shoreSlope(hx));
  const HH = M(hx, 0, hz, 0, hry, 0);
  const L = (x, y, z, rx, ry, rz, sx, sy, sz) => HH.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz));
  B.add(BOX, L(0, hy + 5.5, 0, 0, 0, 0, 30, 19, 19), '#f4e8cd');
  B.add(BOX, L(0, hy + 15.2, 0, 0, 0, 0, 31, 0.85, 20), '#dbc69e');
  B.add(gableGeo(13, 3.6, 1.4, false), L(0, hy + 15.6, 9.7), '#f4e8cd');
  for (let i = 0; i < 6; i++) B.add(CYL, L(-5.5 + i * 2.2, hy + 8.0, 10.2, 0, 0, 0, 0.48, 13.8, 0.48), '#fcf6e6');
  B.add(BOX, L(0, hy + 1.0, 11.4, 0, 0, 0, 14, 1.4, 3.2), '#dbc69e');
  for (let i = 0; i < 5; i++) for (const s of [0, 1]) {
    const u = -12.5 + i * 6.25;
    if (Math.abs(u) < 7.2) continue;
    BW.add(BOX, L(u, hy + 5.2 + s * 4.8, 9.56, 0, 0, 0, 1.5, 2.5, 0.18), '#455b78');
  }
  B.add(CYL, L(0, hy + 18.2, 0, 0, 0, 0, 7.0, 5.5, 7.0), '#f4e8cd');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    BW.add(BOX, L(Math.sin(a) * 7.06, hy + 18.2, Math.cos(a) * 7.06, 0, a, 0, 1.15, 2.6, 0.14), '#455b78');
  }
  B.add(new THREE.SphereGeometry(7.6, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), L(0, hy + 20.8, 0), '#5da68c');
  B.add(CYL, L(0, hy + 28.8, 0, 0, 0, 0, 1.35, 2.4, 1.35), '#f4e8cd');
  B.add(new THREE.ConeGeometry(1.7, 2.5, 10), L(0, hy + 31.2, 0), '#5da68c');
  B.add(SPH, L(0, hy + 32.8, 0, 0, 0, 0, 0.42, 0.42, 0.42), '#ecc85a');
  W.colliders.push(new THREE.Box3(new V3(-15, hy - 4, -10), new V3(15, hy + 21, 12)).applyMatrix4(HH));
  W.colliders.push(new THREE.Box3(new V3(-8, hy + 21, -8), new V3(8, hy + 32, 8)).applyMatrix4(HH));
}

// ================================================================ ROTATING COASTAL WINDMILLS
function windmills(B, BW, W, R, scene) {
  const spots = [
    { x: -135, d: 245, ry: 0.25, sc: 1.12, roof: '#c95638' },
    { x: -72,  d: 268, ry: 0.10, sc: 1.24, roof: '#3d6f8c' },
    { x: -188, d: 212, ry: 0.42, sc: 0.96, roof: '#c95638' },
    { x: 118,  d: 256, ry: -0.35, sc: 1.08, roof: '#5da68c' },
  ];

  // Shared 4-blade wooden lattice & cream canvas sail hub geometry
  const makeSailHub = (sc) => {
    const hub = new THREE.Group();
    const sparMat = toon('#7c5230');
    const sailMat = toon('#fbf5e4', { side: THREE.DoubleSide });
    const trimMat = toon('#c94a3a', { side: THREE.DoubleSide });
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * sc, 0.65 * sc, 1.6 * sc, 10).rotateX(Math.PI / 2), sparMat);
    nose.castShadow = true;
    hub.add(nose);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2;
      hub.add(arm);
      const len = 12.2 * sc;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.32 * sc, len, 0.24 * sc), sparMat);
      spar.position.set(0, len * 0.52, 0.3 * sc);
      spar.castShadow = true;
      arm.add(spar);
      // Tapered cream cloth sail angled gently to catch sea breeze
      const sail = new THREE.Mesh(new THREE.BoxGeometry(2.35 * sc, len * 0.78, 0.08 * sc), sailMat);
      sail.position.set(1.22 * sc, len * 0.60, 0.34 * sc);
      sail.rotation.y = 0.16;
      sail.castShadow = true;
      arm.add(sail);
      // Accent red stripe near wing tip
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.38 * sc, 0.75 * sc, 0.10 * sc), trimMat);
      stripe.position.set(1.22 * sc, len * 0.90, 0.34 * sc);
      stripe.rotation.y = 0.16;
      arm.add(stripe);
      // Cross wooden ribs
      for (let r = 0; r < 5; r++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(2.42 * sc, 0.12 * sc, 0.14 * sc), sparMat);
        rib.position.set(1.22 * sc, len * (0.28 + r * 0.16), 0.32 * sc);
        rib.rotation.y = 0.16;
        arm.add(rib);
      }
    }
    return hub;
  };

  const hubs = [];
  for (const wm of spots) {
    const z = shoreZ(wm.x) - wm.d;
    const gy = groundH(wm.x, z);
    const sc = wm.sc;
    const H = M(wm.x, 0, z, 0, wm.ry, 0);
    const L = (...a) => H.clone().multiply(M(...a));

    // Stone base terrace + whitewashed tapered tower
    B.add(CYL, L(0, gy - 1.0, 0, 0, 0, 0, 6.2 * sc, 5.0, 6.2 * sc), '#cbbca0');
    const towerH = 16.5 * sc;
    const bodyGeo = new THREE.CylinderGeometry(3.1 * sc, 4.7 * sc, towerH, 16);
    B.add(bodyGeo, L(0, gy + towerH / 2, 0), '#f8f2e4');
    // Wooden observation balcony ring
    B.add(CYL, L(0, gy + towerH * 0.56, 0, 0, 0, 0, 4.65 * sc, 0.35 * sc, 4.65 * sc), '#865a38');
    B.add(new THREE.TorusGeometry(4.5 * sc, 0.12 * sc, 6, 18), L(0, gy + towerH * 0.56 + 0.9 * sc, 0, Math.PI / 2, 0, 0), '#734b2e');
    // Conical terracotta / copper cap + tail vane
    B.add(new THREE.ConeGeometry(3.6 * sc, 5.4 * sc, 16), L(0, gy + towerH + 2.6 * sc, 0), wm.roof);
    B.add(SPH, L(0, gy + towerH + 5.5 * sc, 0, 0, 0, 0, 0.36 * sc, 0.36 * sc, 0.36 * sc), '#ecc85a');
    // Door + warm dusk-glowing arched windows
    B.add(BOX, L(0, gy + 1.5 * sc, 4.4 * sc, 0, 0, 0, 1.5 * sc, 2.8 * sc, 0.5 * sc), '#6d472c');
    for (const a of [-0.9, 0.9, Math.PI]) {
      BW.add(BOX, L(Math.sin(a) * 3.85 * sc, gy + towerH * 0.72, Math.cos(a) * 3.85 * sc, 0, a, 0, 1.1 * sc, 1.65 * sc, 0.25 * sc), '#455b78');
    }

    const hub = makeSailHub(sc);
    const hubPos = new V3(0, gy + towerH - 1.1 * sc, 3.65 * sc).applyMatrix4(H);
    hub.position.copy(hubPos);
    hub.rotation.y = wm.ry;
    hub.rotation.z = R() * Math.PI * 2;
    scene.add(hub);
    hubs.push({ hub, spd: 0.32 + R() * 0.16 });

    W.colliders.push(new THREE.Box3(new V3(-5.2 * sc, gy - 2, -5.2 * sc), new V3(5.2 * sc, gy + towerH + 5 * sc, 5.2 * sc)).applyMatrix4(H));
    // Rustic low stone terrace wall & lush olive/cypress/lavender clusters around each windmill!
    B.add(BOX, L(0, gy - 0.3, 8.5 * sc, 0, 0.15, 0, 14 * sc, 2.2, 1.3), '#d4c4a6');
    W.treeSpots.push({ type: 'cypress', x: wm.x + 8.5 * sc, z: z + 3, s: 1.2 });
    W.treeSpots.push({ type: 'cypress', x: wm.x - 9.2 * sc, z: z - 4, s: 1.05 });
    W.treeSpots.push({ type: 'broad', x: wm.x + 16 * sc, z: z - 6, s: 1.55 });
    W.treeSpots.push({ type: 'shrub', x: wm.x - 6.5 * sc, z: z + 7.5 * sc, s: 1.35 });
    W.treeSpots.push({ type: 'shrub', x: wm.x + 5.5 * sc, z: z + 8.2 * sc, s: 1.25 });
  }

  // Extra pastoral olive groves & blooming lavender/wildflower bushes dotting Windmill Hill!
  for (let i = 0; i < 65; i++) {
    const x = -230 + R() * 340;
    const d = 195 + R() * 125;
    const z = shoreZ(x) - d;
    if (townW(x, z) > 0.25) continue;
    const t = R();
    W.treeSpots.push({ type: t < 0.28 ? 'shrub' : t < 0.48 ? 'cypress' : t < 0.72 ? 'pine' : 'broad', x, z, s: 1.15 + R() * 1.1 });
  }

  W.updaters.push((t, dt) => {
    for (const h of hubs) h.hub.rotation.z -= h.spd * dt;
  });
}

// ================================================================ SOARING STONE AQUEDUCT / VIADUCT
function viaduct(B, W) {
  const x0 = 152, x1 = 278;
  const zMid = shoreZ(215) - 155;
  const len = x1 - x0;
  const deckY = Math.max(groundH(x0, zMid), groundH(x1, zMid)) + 4.5;
  const n = 6, pier = 3.8, span = (len - pier * (n + 1)) / n;

  const s = new THREE.Shape();
  s.moveTo(0, -10); s.lineTo(len, -10); s.lineTo(len, deckY); s.lineTo(0, deckY); s.closePath();
  for (let i = 0; i < n; i++) {
    const a = pier + i * (span + pier), b = a + span, c = (a + b) / 2;
    const hole = new THREE.Path();
    hole.moveTo(a, -9.8); hole.lineTo(b, -9.8); hole.lineTo(b, deckY - span * 0.55 - 4.5);
    hole.absellipse(c, deckY - span * 0.55 - 4.5, span / 2, span * 0.52, 0, Math.PI, false);
    hole.lineTo(a, -9.8);
    s.holes.push(hole);
    W.colliders.push(new THREE.Box3(new V3(x0 + b, -10, zMid - 4.5), new V3(x0 + b + pier, deckY, zMid + 4.5)));
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 7.5, bevelEnabled: false, curveSegments: 12 });
  g.translate(x0, 0, zMid - 3.75);
  B.add(g, null, '#dccba9');
  for (const sz of [-3.5, 3.5]) {
    B.add(BOX, M((x0 + x1) / 2, deckY + 0.9, zMid + sz, 0, 0, 0, len + 2, 1.8, 0.85), '#cbb996');
  }
  B.add(BOX, M((x0 + x1) / 2, deckY + 0.55, zMid, 0, 0, 0, len, 0.4, 5.6), '#52bfb8');
  W.colliders.push(new THREE.Box3(new V3(x0, deckY - 3.8, zMid - 4.5), new V3(x1, deckY + 2.2, zMid + 4.5)));
}

// ================================================================ NATURAL CRAGGY LIMESTONE SEA ARCH & STACKS
function rockCragGeo(seed = 1) {
  const g = new THREE.SphereGeometry(1, 16, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.86 + 0.24 * Math.sin(x * 2.6 + seed) * Math.cos(y * 2.4 - seed) + 0.10 * Math.sin(z * 4.2 + seed * 1.7);
    p.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  return g;
}

function seaArch(B, W) {
  const ax = 215, az = 118;
  const H = M(ax, 0, az, 0, -0.45, 0);
  const L = (...a) => H.clone().multiply(M(...a));
  const crag1 = rockCragGeo(1.7), crag2 = rockCragGeo(5.3), crag3 = rockCragGeo(9.8);
  const rockCols = ['#d9c9ac', '#cab899', '#e2d4ba', '#bca98c'];

  // Organic stepped boulder-formed natural limestone arch (wide fly-through opening!)
  const blocks = [
    // Left cliff pier
    [-18.5, 1.0, 0, 8.2, 8.5, 8.0, 0],
    [-17.2, 10.5, -0.6, 7.2, 8.8, 7.2, 1],
    [-14.8, 19.5, 0.5, 6.8, 7.2, 6.8, 2],
    // Right cliff pier
    [18.5, 1.0, 0, 8.5, 8.5, 8.2, 1],
    [17.0, 10.2, 0.6, 7.4, 8.6, 7.0, 0],
    [14.5, 19.2, -0.4, 6.8, 7.0, 6.6, 3],
    // Natural stone arch span & terraced cliff top
    [-7.5, 25.2, 0.2, 7.8, 5.2, 6.8, 0],
    [0.0, 27.0, -0.2, 8.6, 4.8, 7.2, 2],
    [7.8, 25.0, 0.3, 7.6, 5.0, 6.8, 1],
    [-24.0, -1.5, 2.5, 5.5, 4.8, 5.2, 3],
    [24.5, -1.5, -2.0, 6.0, 5.2, 5.5, 3],
  ];
  for (let i = 0; i < blocks.length; i++) {
    const [x, y, z, sx, sy, sz, ci] = blocks[i];
    const geo = i % 3 === 0 ? crag1 : i % 3 === 1 ? crag2 : crag3;
    B.add(geo, L(x, y, z, i * 0.4, i * 1.1, i * 0.25, sx, sy, sz), rockCols[ci]);
  }
  // Lush Mediterranean pine & flowering shrubs perched atop the sea arch!
  const archTop1 = new V3(-4, 30.2, 0).applyMatrix4(H);
  const archTop2 = new V3(7, 28.4, 0.5).applyMatrix4(H);
  W.treeSpots.push({ type: 'pine', x: archTop1.x, y: archTop1.y, z: archTop1.z, s: 1.35 });
  W.treeSpots.push({ type: 'shrub', x: archTop2.x, y: archTop2.y, z: archTop2.z, s: 1.45 });

  // Craggy companion sea stacks (eastern & western cove rocks) topped with real coastal pines!
  const stacks = [
    { x: 252, z: 138, h: 21, r: 9.5, tree: 'pine' },
    { x: -245, z: 92, h: 19, r: 10.5, tree: 'broad' },
  ];
  for (const st of stacks) {
    B.add(crag1, M(st.x, 1.5, st.z, 0.1, 0.6, 0.05, st.r, st.h * 0.42, st.r * 0.9), '#cab899');
    B.add(crag2, M(st.x - 1.2, st.h * 0.48, st.z + 0.8, -0.1, 1.8, 0.08, st.r * 0.78, st.h * 0.36, st.r * 0.72), '#d9c9ac');
    B.add(crag3, M(st.x + 0.6, st.h * 0.82, st.z - 0.5, 0.05, 2.9, -0.05, st.r * 0.56, st.h * 0.24, st.r * 0.54), '#e2d4ba');
    W.treeSpots.push({ type: st.tree, x: st.x, y: st.h * 0.98, z: st.z, s: 1.25 });
    W.treeSpots.push({ type: 'shrub', x: st.x + 2.2, y: st.h * 0.88, z: st.z - 1.5, s: 1.2 });
  }

  W.colliders.push(new THREE.Box3(new V3(-24, -4, -7), new V3(-11.5, 26, 7)).applyMatrix4(H));
  W.colliders.push(new THREE.Box3(new V3(11.5, -4, -7), new V3(24, 26, 7)).applyMatrix4(H));
  W.colliders.push(new THREE.Box3(new V3(-14, 22, -7), new V3(14, 32, 7)).applyMatrix4(H));
}

// ================================================================ BOATS & HARBOUR QUAY
export function boatMesh(R, len, hullC, stripeC, opts = {}) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const w = len * 0.21;
  s.moveTo(-w, -len * 0.5); s.lineTo(w, -len * 0.5); s.lineTo(w * 1.08, len * 0.15);
  s.quadraticCurveTo(w * 0.9, len * 0.44, 0, len * 0.56); s.quadraticCurveTo(-w * 0.9, len * 0.44, -w * 1.08, len * 0.15); s.closePath();
  const hullH = len * 0.14;
  const hull = new THREE.ExtrudeGeometry(s, { depth: hullH, bevelEnabled: false, curveSegments: 7 });
  hull.rotateX(Math.PI / 2); hull.translate(0, hullH * 0.75, 0);
  const add = (geo, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, matOpts) => {
    const m = new THREE.Mesh(geo, matOpts ? toon(c, matOpts) : toon(c));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true; g.add(m); return m;
  };
  add(hull, hullC);
  const stripe = hull.clone(); add(stripe, stripeC, 0, hullH * 0.62, 0, 1.03, 0.14, 1.02);

  if (opts.steamer) {
    add(BOX, '#f8f2e4', 0, hullH * 0.75 + 1.2, len * 0.05, w * 1.5, 2.4, len * 0.42);
    add(BOX, '#f8f2e4', 0, hullH * 0.75 + 3.2, len * 0.10, w * 1.1, 1.6, len * 0.17);
    add(CYL, '#ecb83c', 0, hullH * 0.75 + 4.7, -len * 0.08, 0.92, 4.4, 0.92);
    add(CYL, '#26262c', 0, hullH * 0.75 + 7.2, -len * 0.08, 0.96, 0.85, 0.96);
    for (let i = 0; i < 7; i++) {
      add(CYL, '#455b78', w * 0.76, hullH * 0.75 + 1.3, len * (-0.1 + i * 0.04), 0.23, 0.06, 0.23, { duskGlow: 1.0 }).rotation.z = Math.PI / 2;
      add(CYL, '#455b78', -w * 0.76, hullH * 0.75 + 1.3, len * (-0.1 + i * 0.04), 0.23, 0.06, 0.23, { duskGlow: 1.0 }).rotation.z = Math.PI / 2;
    }
    add(CYL, '#8a663e', 0, hullH * 0.75 + 5, len * 0.35, 0.12, 8.2, 0.12);
    g.userData.funnel = new V3(0, hullH * 0.75 + 7.8, -len * 0.08);
  } else if (opts.sail) {
    add(CYL, '#8a663e', 0, hullH + len * 0.56, len * 0.04, 0.08, len * 1.15, 0.08);
    // Main sail + jib sail with gentle wind billow
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, len * 1.05); sh.quadraticCurveTo(len * 0.35, len * 0.45, len * 0.58, 0); sh.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh, 6), toon('#fcf8ef', { side: THREE.DoubleSide }));
    sail.rotation.y = Math.PI / 2; sail.position.set(0, hullH + 0.35, len * 0.04);
    g.add(sail);
    const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(0, len * 0.82); jib.lineTo(-len * 0.38, 0); jib.closePath();
    const jibM = new THREE.Mesh(new THREE.ShapeGeometry(jib), toon('#fff6e4', { side: THREE.DoubleSide }));
    jibM.rotation.y = Math.PI / 2; jibM.position.set(0, hullH + 0.4, len * 0.08);
    g.add(jibM);
  } else {
    add(BOX, '#f7f1e4', 0, hullH * 0.75 + 0.72, len * 0.1, w * 1.12, 1.45, len * 0.26);
    add(BOX, '#455b78', 0, hullH * 0.75 + 0.85, len * 0.235, w * 0.75, 0.55, 0.08, { duskGlow: 1.0 });
    add(BOX, stripeC, 0, hullH * 0.75 + 1.48, len * 0.1, w * 1.28, 0.16, len * 0.32);
    add(CYL, '#8a663e', 0, hullH + len * 0.32, -len * 0.18, 0.06, len * 0.68, 0.06);
    if (R() < 0.65) {
      const flag = add(BOX, pick(R, ['#d4463c', '#3b6fa8', '#ebb93c']), 0.32, hullH + len * 0.62, -len * 0.18, 0.65, 0.38, 0.03);
      flag.rotation.y = Math.PI / 2;
    }
  }

  // Feathery soft foamy V-wake flaring gracefully outward behind moving vessels
  if (opts.wake) {
    const wakeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: THEME_U.uTime },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          // vUv.y = 1 at boat stern, 0 at far tail
          float t = 1.0 - vUv.y;
          float x = abs(vUv.x - 0.5) * 2.0;
          float armCenter = 0.14 + t * 0.72;
          float armW = 0.10 + t * 0.18;
          float arm = smoothstep(armW, 0.0, abs(x - armCenter));
          float centerFoam = smoothstep(0.32, 0.0, x) * (1.0 - t) * 0.45;
          float ripple = 0.65 + 0.35 * sin(t * 28.0 - uTime * 5.0 + x * 8.0);
          float fade = smoothstep(0.0, 0.12, t) * pow(clamp(1.0 - t, 0.0001, 1.0), 1.4);
          float a = clamp((arm + centerFoam) * ripple * fade * 0.65, 0.0, 0.65);
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.97, 0.99, 0.98, a);
        }`,
    });
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.1, len * 2.3), wakeMat);
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(0, 0.06, -len * 1.55);
    g.add(wake);
    g.userData.wake = wake;
  }
  return g;
}

function harbour(B, BW, W, R, scene) {
  // Stone quay promenade with warm iron lanterns, bollards, and wooden piers
  for (let x = -176; x < 176; x += 8) {
    const xc = x + 4, z = shoreZ(xc);
    const ry = -Math.atan(shoreSlope(xc));
    B.add(BOX, M(xc, -1.2, z - 0.6, 0, ry, 0, 8.4, 7.2, 3.2), '#ccb898');
    B.add(BOX, M(xc, 2.5, z - 0.6, 0, ry, 0, 8.4, 0.38, 3.5), '#e8dbc0');
    const idx = Math.floor((x + 176) / 8);
    if (idx % 2 === 0) B.add(CYL, M(xc, 3.05, z - 1.3, 0, 0, 0, 0.28, 0.85, 0.28), '#3b3a42');
    if (idx % 4 === 1) addLamp(B, BW, xc, 2.7, z - 2.6);
  }

  // Seaside café parasols along the promenade
  for (let x = -40; x <= 60; x += 16) {
    const z = shoreZ(x) - 8;
    addParasol(B, R, x, groundH(x, z), z);
  }

  // Stone breakwater mole + iconic red-and-white Lighthouse with sweeping twilight beacon!
  const dx = MOLE_B.x - MOLE_A.x, dz = MOLE_B.y - MOLE_A.y, len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const MH = M((MOLE_A.x + MOLE_B.x) / 2, 0, (MOLE_A.y + MOLE_B.y) / 2, 0, ry, 0);
  B.add(BOX, MH.clone().multiply(M(0, -0.3, 0, 0, 0, 0, 8.8, 5.6, len)), '#c8b494');
  B.add(BOX, MH.clone().multiply(M(0, 2.55, 0, 0, 0, 0, 9.0, 0.38, len)), '#e6d8bc');
  B.add(BOX, MH.clone().multiply(M(3.8, 3.25, 0, 0, 0, 0, 1.3, 1.3, len)), '#d8c8a6');
  W.colliders.push(new THREE.Box3(new V3(-4.6, -3, -len / 2), new V3(4.6, 4.0, len / 2)).applyMatrix4(MH));

  const lx = MOLE_B.x, lz = MOLE_B.y;
  B.add(CYL, M(lx, -0.2, lz, 0, 0, 0, 7.6, 5.8, 7.6), '#c8b494');
  B.add(CYL, M(lx, 2.75, lz, 0, 0, 0, 7.9, 0.35, 7.9), '#e6d8bc');
  const bands = 6, bh = 3.4;
  for (let i = 0; i < bands; i++) {
    const r0 = 2.8 - i * 0.17;
    B.add(new THREE.CylinderGeometry(r0 - 0.17, r0, bh, 18), M(lx, 2.9 + bh * (i + 0.5), lz), i % 2 ? '#fcf7ec' : '#d2483c');
  }
  const top = 2.9 + bands * bh;
  B.add(CYL, M(lx, top + 0.25, lz, 0, 0, 0, 2.7, 0.45, 2.7), '#2d2e36');
  BW.add(CYL, M(lx, top + 1.65, lz, 0, 0, 0, 1.48, 2.4, 1.48), '#fff1b0');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    B.add(BOX, M(lx + Math.cos(a) * 1.48, top + 1.65, lz + Math.sin(a) * 1.48, 0, -a, 0, 0.12, 2.4, 0.12), '#2d2e36');
  }
  B.add(new THREE.ConeGeometry(1.9, 1.8, 16), M(lx, top + 3.7, lz), '#d2483c');
  B.add(SPH, M(lx, top + 4.7, lz, 0, 0, 0, 0.28, 0.28, 0.28), '#ecc85a');
  W.colliders.push(new THREE.Box3(new V3(lx - 3.2, 0, lz - 3.2), new V3(lx + 3.2, top + 4.8, lz + 3.2)));

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.82, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.4, 1.4) }));
  lamp.position.set(lx, top + 1.65, lz);
  scene.add(lamp);

  // Rotating golden volumetric lighthouse beam (subtle by day, dramatic in Golden Hour!)
  const beamGroup = new THREE.Group();
  beamGroup.position.set(lx, top + 1.65, lz);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uNight: THEME_U.uNightGlow },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uNight;
      varying vec2 vUv;
      void main() {
        float fade = pow(clamp(1.0 - vUv.y, 0.0001, 1.0), 2.2) * smoothstep(0.0, 0.10, vUv.y);
        float a = fade * (0.015 + 0.20 * uNight);
        gl_FragColor = vec4(1.0, 0.85, 0.50, a);
      }`,
  });
  const coneGeo = new THREE.ConeGeometry(6.5, 76, 14, 1, true);
  coneGeo.translate(0, -38, 0);
  coneGeo.rotateX(Math.PI / 2);
  const b1 = new THREE.Mesh(coneGeo, beamMat);
  const b2 = new THREE.Mesh(coneGeo, beamMat);
  b2.rotation.y = Math.PI;
  beamGroup.add(b1, b2);
  scene.add(beamGroup);
  W.hideInNormals.push(beamGroup);
  W.updaters.push((t, dt) => { beamGroup.rotation.y += dt * 0.45; });

  // Quayside crates & vintage harbour crane
  const crateC = ['#b88750', '#9e7040', '#c89e60', '#6e8a9c'];
  for (let i = 0; i < 24; i++) {
    const x = -102 + R() * 68, d = 4.5 + R() * 7;
    const z = shoreZ(x) - d, y = groundH(x, z);
    const s = 1.0 + R() * 0.45, st = R() < 0.42 ? 2 : 1;
    for (let k = 0; k < st; k++) B.add(BOX, M(x, y + s * (k + 0.5), z, 0, R() * 0.4, 0, s, s, s), pick(R, crateC));
  }
  {
    const x = -66, z = shoreZ(-66) - 6, y = groundH(x, z);
    B.add(BOX, M(x, y + 7, z, 0, 0, 0, 1.6, 14, 1.6), '#e59c2f');
    B.add(BOX, M(x, y + 14.6, z, 0, 0, 0, 2.7, 2.0, 2.7), '#e59c2f');
    B.add(BOX, M(x, y + 16.5, z + 6, -0.25, 0, 0, 0.9, 0.9, 17), '#e59c2f');
    B.add(BOX, M(x, y + 14.2, z + 13, 0, 0, 0, 0.06, 6, 0.06), '#2f2f35');
    B.add(BOX, M(x, y + 11, z + 13, 0, 0, 0, 1.25, 0.55, 1.25), '#3e3c42');
    W.colliders.push(new THREE.Box3(new V3(x - 1.5, y, z - 1.5), new V3(x + 1.5, y + 16, z + 1.5)));
  }

  // Harbour steamer, colourful fishing fleet & gliding white sailboats
  const boats = [];
  const place = (g, x, z, ry, amp, speed = 0) => {
    g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    if (g.userData.wake) W.hideInNormals.push(g.userData.wake);
    boats.push({ g, amp, ph: R() * 10, ry, speed, cx: x, cz: z });
  };
  const steamer = boatMesh(R, 30, '#243654', '#cc443a', { steamer: true });
  place(steamer, -112, shoreZ(-112) + 12, Math.PI / 2 - 0.16, 0.11);
  W.colliders.push(new THREE.Box3().setFromObject(steamer));
  W.steamerSmoke = W.smokeSources.length;
  W.smokeSources.push(steamer.localToWorld(steamer.userData.funnel.clone()));

  const hulls = ['#f6f2e8', '#3c6fa8', '#d4463c', '#f2d67a', '#4a8c6c'];
  for (let i = 0; i < 11; i++) {
    const x = -78 + i * 11.5 + R() * 5, z = shoreZ(x) + 14 + R() * 48;
    place(boatMesh(R, 7.2 + R() * 4, pick(R, hulls), pick(R, ['#d4463c', '#2c4f7c', '#ebb93c', '#f6f2e8'])), x, z, R() * 6.28, 0.24);
  }
  // White-sailed ketches gliding across the bay with foam V-wakes!
  place(boatMesh(R, 10.5, '#faf6ec', '#3c6fa8', { sail: true, wake: true }), 145, 290, 0.65, 0.34, 2.2);
  place(boatMesh(R, 9.5, '#faf6ec', '#d4463c', { sail: true, wake: true }), -185, 360, -0.78, 0.34, 2.0);
  place(boatMesh(R, 8.8, '#faf6ec', '#3c8a62', { sail: true, wake: true }), -30, 440, 1.15, 0.32, 1.8);
  place(boatMesh(R, 11.0, '#faf6ec', '#d88c2c', { sail: true, wake: true }), 260, 420, -1.25, 0.35, 2.4);

  W.updaters.push((t, dt) => {
    for (const b of boats) {
      b.g.position.y = Math.sin(t * 1.15 + b.ph) * b.amp;
      b.g.rotation.z = Math.sin(t * 0.85 + b.ph) * b.amp * 0.14;
      b.g.rotation.x = Math.sin(t * 0.65 + b.ph * 2) * b.amp * 0.07;
      if (b.speed > 0) {
        b.g.position.x += Math.sin(b.ry) * dt * b.speed;
        b.g.position.z += Math.cos(b.ry) * dt * b.speed;
        if (Math.hypot(b.g.position.x, b.g.position.z - 350) > 620) {
          b.ry += Math.PI * 0.85;
          b.g.rotation.y = b.ry;
        }
      }
    }
  });
}

// ================================================================ FAR HEADLAND ISLAND VILLAGE
function farVillage(B, BW, W, R) {
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 8; i++) {
      const x = -610 + i * 13.5 + R() * 4 + r * 4, d = 18 + r * 16 + R() * 4;
      const z = shoreZ(x) - d;
      addHouse(B, BW, W, R, { x, z, ry: -Math.atan(shoreSlope(x)), w: 6.2 + R() * 3.2, dp: 7.2 + R() * 2.2, h: 6.5 + R() * 4.2 });
    }
  }
  const x = -578, z = shoreZ(x) - 72, y = groundH(x, z);
  B.add(BOX, M(x, y + 4.5, z, 0, 0.6, 0, 8.5, 13, 15), '#fcf8ef');
  B.add(BOX, M(x, y + 10, z + 7.2, 0, 0.6, 0, 3.8, 20, 3.8), '#fcf8ef');
  const sp = new THREE.ConeGeometry(2.8, 7.2, 4); sp.rotateY(Math.PI / 4);
  B.add(sp, M(x, y + 23.6, z + 7.2, 0, 0.6, 0), '#cc5f3b');
  B.add(gableGeo(8.5, 3.4, 15, false), M(x, y + 11.2, z, 0, 0.6, 0), '#cc5f3b');
}

// ================================================================ LUSH PAINTERLY TREES & GARDEN SHRUBS
function mergeSimple(geos) {
  const b = new Bucket();
  for (const g of geos) b.add(g, null, '#ffffff');
  const geo = b.mesh(null).geometry;
  geo.deleteAttribute('color');
  return geo;
}

// Builds a silky-soft pillowy Moebius/Ghibli botanical crown with unified outward dome normals!
// Eliminates all jagged alphaTest cutout edges while keeping lush organic painterly form.
function buildPainterlyCrownGeo(lobes, seed = 101) {
  const parts = [];
  const center = new V3();
  for (const l of lobes) center.add(new V3(l[0], l[1], l[2]));
  center.divideScalar(lobes.length);

  for (let li = 0; li < lobes.length; li++) {
    const [cx, cy, cz, rx, ry, rz] = lobes[li];
    const g = new THREE.SphereGeometry(1, 14, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1.0 + 0.11 * Math.sin(x * 3.2 + seed + li * 1.7) * Math.cos(y * 3.0 - li) * Math.sin(z * 3.1 + seed * 0.5);
      p.setXYZ(i, cx + x * rx * n, cy + y * ry * n, cz + z * rz * n);
    }
    g.computeVertexNormals();
    // Blend local lobe normals toward unified crown dome normal so the tree reads as one lush painted canopy!
    const norm = g.attributes.normal;
    const v = new V3(), dn = new V3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i) - center.x, (p.getY(i) - center.y) * 1.15 + 0.55, p.getZ(i) - center.z).normalize();
      dn.set(norm.getX(i), norm.getY(i), norm.getZ(i)).lerp(v, 0.72).normalize();
      norm.setXYZ(i, dn.x, dn.y, dn.z);
    }
    parts.push(g);
  }
  return mergeSimple(parts);
}

function buildTrunkGeo(height = 3.2, rTop = 0.18, rBot = 0.36, branches = true) {
  const parts = [new THREE.CylinderGeometry(rTop, rBot, height, 8).translate(0, height * 0.5, 0)];
  if (branches) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const b = new THREE.CylinderGeometry(rTop * 0.45, rTop * 0.85, height * 0.46, 6);
      b.translate(0, height * 0.23, 0);
      b.rotateZ(0.55);
      b.rotateY(a);
      b.translate(0, height * 0.74, 0);
      parts.push(b);
    }
  }
  return mergeSimple(parts);
}

function trees(scene, W, R) {
  const P = CITY === 'prague';

  // 1) Silky pillowy broadleaf oak / linden canopy (soft multi-lobe Moebius/Ghibli silhouette!)
  const broadCanopy = buildPainterlyCrownGeo([
    [0, 3.8, 0, 2.05, 1.55, 2.0],
    [1.35, 3.45, 0.55, 1.45, 1.18, 1.4],
    [-1.28, 3.55, -0.58, 1.48, 1.22, 1.45],
    [0.22, 4.65, -0.32, 1.42, 1.12, 1.38],
    [-0.45, 3.30, 1.18, 1.32, 1.08, 1.30],
    [0.58, 3.40, -1.15, 1.30, 1.05, 1.28],
  ], 101);
  const broadTrunk = buildTrunkGeo(3.2, 0.19, 0.36, true);

  // 2) Graceful Mediterranean Umbrella Stone Pine (wide sculpted parasol canopy!)
  const pineCanopy = buildPainterlyCrownGeo([
    [0, 6.45, 0, 2.55, 1.05, 2.5],
    [1.75, 6.15, 0.75, 1.65, 0.82, 1.6],
    [-1.65, 6.20, -0.68, 1.68, 0.85, 1.6],
    [0.45, 6.18, -1.65, 1.58, 0.80, 1.55],
    [-0.55, 6.12, 1.58, 1.55, 0.80, 1.55],
    [0.1, 6.95, 0.05, 1.65, 0.72, 1.65],
  ], 209);
  const pineTrunk = buildTrunkGeo(5.8, 0.20, 0.34, true);

  // 3) Silky tapered flame-shaped Italian Cypress (smooth LatheGeometry — zero sharp facets!)
  const cypProfile = [
    new THREE.Vector2(0.05, 0.4),
    new THREE.Vector2(0.88, 1.6),
    new THREE.Vector2(1.02, 3.1),
    new THREE.Vector2(0.86, 5.0),
    new THREE.Vector2(0.62, 6.8),
    new THREE.Vector2(0.32, 8.3),
    new THREE.Vector2(0.02, 9.4),
  ];
  const cypGeo = new THREE.LatheGeometry(cypProfile, 16);

  // 4) Pillowy blooming wildflower / bougainvillea garden mound
  const bushGeo = buildPainterlyCrownGeo([
    [0, 0.92, 0, 1.25, 0.88, 1.22],
    [0.72, 0.72, 0.42, 0.85, 0.65, 0.84],
    [-0.68, 0.76, -0.38, 0.86, 0.68, 0.82],
    [0.12, 0.72, -0.68, 0.78, 0.60, 0.78],
  ], 333);

  const broad = [], pines = [], cyp = [], shrubs = [];

  // Scatter dense hillside forests, groves & flowering terraces
  for (let tries = 0; tries < 75000 && (broad.length < 2300 || pines.length < 650 || cyp.length < 700 || shrubs.length < 750); tries++) {
    const x = (R() - 0.5) * 2400;
    const z = P ? (R() - 0.5) * 2400 : -R() * 1350 + 420;
    const d = landDist(x, z);
    if (d < 8) continue;
    const tw = townW(x, z);
    if (tw > 0.06) continue;
    if (!P && x < -505 && x > -665 && d < 115) continue; // keep far village clear
    const y = groundH(x, z);
    const dens = fbm(x * 0.0075 + 5, z * 0.0075, 3);
    if (dens < 0.34) continue;
    const slope = Math.abs(groundH(x + 3, z) - y) + Math.abs(groundH(x, z + 3) - y);
    if (slope > 4.2) continue;

    const r = R();
    if (!P && r < 0.22 && pines.length < 650) pines.push([x, y, z, 1.5 + R() * 1.1]);
    else if (r < 0.42 && cyp.length < 700) cyp.push([x, y, z, 1.0 + R() * 0.75]);
    else if (r < 0.62 && shrubs.length < 750 && d < 420) shrubs.push([x, y, z, 1.1 + R() * 1.2]);
    else if (broad.length < 2300) broad.push([x, y, z, 1.7 + R() * 1.6]);
  }

  // Hand-placed heroic trees & blooming bushes inside plazas, along headlands, and around landmarks!
  if (!P) {
    for (const [x, dd] of [[-32, 92], [32, 92], [-30, 114], [-94, 145], [-30, 150], [156, 36], [-156, 36], [-125, 220], [-65, 240]]) {
      const z = shoreZ(x) - dd;
      cyp.push([x, groundH(x, z), z, 1.05]);
    }
    for (const [x, dd] of [[24, 82], [-22, 110], [-82, 128], [92, 16], [-115, 16], [162, 72], [-172, 78]]) {
      const z = shoreZ(x) - dd;
      broad.push([x, groundH(x, z), z, 1.35]);
    }
    for (const [x, dd] of [[18, 92], [-18, 86], [12, 112], [-72, 134], [64, 12], [-42, 12]]) {
      const z = shoreZ(x) - dd;
      shrubs.push([x, groundH(x, z), z, 1.2]);
    }
  }

  // Merge any landmark-requested trees (supports explicit y for sea-arch/cliff-top pines!)
  for (const ts of W.treeSpots) {
    const y = ts.y ?? groundH(ts.x, ts.z);
    if (ts.type === 'cypress') cyp.push([ts.x, y, ts.z, ts.s || 1.0]);
    else if (ts.type === 'pine') pines.push([ts.x, y, ts.z, ts.s || 1.4]);
    else if (ts.type === 'shrub') shrubs.push([ts.x, y, ts.z, ts.s || 1.1]);
    else broad.push([ts.x, y, ts.z, ts.s || 1.4]);
  }

  const inst = (geo, list, palette, mat, shadow = true, hideOutline = false) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const c = new THREE.Color();
    list.forEach(([x, y, z, s], i) => {
      m.setMatrixAt(i, M(x, y - 0.35, z, 0, (i * 2.39996) % 6.283, 0, s, s * (0.88 + (i % 5) * 0.06), s));
      c.set(palette[i % palette.length]).offsetHSL(((i * 37) % 11 - 5) * 0.005, 0, ((i * 53) % 9 - 4) * 0.012);
      m.setColorAt(i, c);
    });
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    if (hideOutline) W.hideInNormals.push(m);
  };

  const leafM = foliageMat();
  const barkM = toonMat({ color: '#ffffff', brushScale: 1.5 });
  const cypM = foliageMat({ sway: 0.12 });

  inst(broadCanopy, broad, ['#6fa34c', '#5d9548', '#80ad52', '#4f8645'], leafM, true, true);
  inst(broadTrunk, broad, ['#78573f', '#6b4d38'], barkM, true, false);
  inst(pineCanopy, pines, ['#4d854b', '#5c9452', '#3f7545'], leafM, true, true);
  inst(pineTrunk, pines, ['#8c5b3e', '#7d4f36'], barkM, true, false);
  inst(cypGeo, cyp, ['#2f6241', '#3b7048', '#2a5539'], cypM, true, true);
  inst(bushGeo, shrubs, ['#df5678', '#9c78c8', '#e8aa40', '#69a24c', '#e66b64'], leafM, false, true);
}

// ================================================================ DREAMY MOEBIUS PASTEL HOT-AIR BALLOONS
function hotAirBalloons(scene, W, R) {
  const P = CITY === 'prague';
  const configs = P
    ? [
        { x: -160, y: 122, z: -130, sc: 1.15, c1: '#e67c68', c2: '#fbf3e2' },
        { x: 145,  y: 108, z: 140,  sc: 0.95, c1: '#64b8ad', c2: '#f7e4b6' },
        { x: -340, y: 148, z: 90,   sc: 1.25, c1: '#a28bc9', c2: '#fae6d4' },
      ]
    : [
        { x: -155, y: 112, z: -120, sc: 1.18, c1: '#e47a66', c2: '#fcf5e6' },
        { x: 165,  y: 98,  z: -65,  sc: 1.02, c1: '#5cb5ab', c2: '#fae6bc' },
        { x: -245, y: 92,  z: 145,  sc: 0.92, c1: '#9f87c8', c2: '#f9e3d2' },
        { x: 255,  y: 118, z: 165,  sc: 1.10, c1: '#e6ae54', c2: '#faf5ea' },
        { x: -35,  y: 138, z: -260, sc: 1.28, c1: '#e07288', c2: '#fcf4e4' },
      ];

  const envPts = [
    new THREE.Vector2(0.1, 0.0),
    new THREE.Vector2(1.1, 0.4),
    new THREE.Vector2(2.6, 2.2),
    new THREE.Vector2(4.2, 5.2),
    new THREE.Vector2(4.5, 7.6),
    new THREE.Vector2(3.6, 9.8),
    new THREE.Vector2(1.8, 11.1),
    new THREE.Vector2(0.01, 11.5),
  ];
  const envGeo = new THREE.LatheGeometry(envPts, 16);

  const balloons = [];
  for (const cfg of configs) {
    const g = new THREE.Group();
    // Striped pastel balloon canvas texture
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? cfg.c1 : cfg.c2;
      ctx.fillRect(i * 32, 0, 32, 128);
    }
    ctx.fillStyle = '#e5bd5c';
    ctx.fillRect(0, 56, 256, 10);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;

    const env = new THREE.Mesh(envGeo, toonMat({ color: '#ffffff', map: tex, noHatch: true }));
    env.castShadow = true;
    g.add(env);

    // Wicker gondola basket + 4 slender rigging ropes + warm glowing burner!
    const basket = new THREE.Mesh(BOX, toon('#9b6d42'));
    basket.scale.set(1.5, 1.35, 1.5);
    basket.position.y = -2.2;
    g.add(basket);
    const burner = new THREE.Mesh(SPH, toonMat({ color: '#ffdf92', alwaysGlow: 0.5, duskGlow: 1.0, noHatch: true }));
    burner.scale.setScalar(0.45);
    burner.position.y = -0.3;
    g.add(burner);
    for (const [rx, rz] of [[0.65, 0.65], [-0.65, 0.65], [0.65, -0.65], [-0.65, -0.65]]) {
      const rope = new THREE.Mesh(CYL6, toon('#5a4636'));
      rope.scale.set(0.05, 2.4, 0.05);
      rope.position.set(rx, -0.8, rz);
      g.add(rope);
    }

    g.scale.setScalar(cfg.sc);
    g.position.set(cfg.x, cfg.y, cfg.z);
    scene.add(g);
    balloons.push({ g, base: new V3(cfg.x, cfg.y, cfg.z), ph: R() * 6.28, drift: 0.4 + R() * 0.4 });
  }

  W.updaters.push((t) => {
    for (const b of balloons) {
      b.g.position.y = b.base.y + Math.sin(t * 0.45 + b.ph) * 2.8;
      b.g.position.x = b.base.x + Math.sin(t * 0.12 + b.ph) * 8.0 * b.drift;
      b.g.rotation.y = t * 0.08 + b.ph;
      b.g.rotation.z = Math.sin(t * 0.5 + b.ph) * 0.035;
    }
  });
}

// ================================================================ GULLS, SMOKE, LAUNDRY & FESTIVAL BUNTING
function gulls(scene, W, R) {
  const b = new Bucket();
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.14, 0, 0, 0.20, 0.85, 0.28, 0.05,
    0, 0, 0.20, 0, 0, -0.14, -0.85, 0.28, 0.05,
  ], 3));
  wing.computeVertexNormals();
  b.add(wing, null, '#ffffff');
  b.add(BOX, M(0, -0.02, 0, 0, 0, 0, 0.12, 0.10, 0.54), '#ffffff');
  const geo = b.mesh(null).geometry; geo.deleteAttribute('color');
  const N = 65;
  const m = new THREE.InstancedMesh(geo, toonMat({ color: '#fcfcf8', side: THREE.DoubleSide, noHatch: true }), N);
  m.frustumCulled = false;
  const g = [];
  for (let i = 0; i < N; i++) {
    const near = i < 42;
    g.push({
      c: near
        ? (CITY === 'prague' ? new V3(-300 + R() * 600, 12 + R() * 38, 0) : new V3(-140 + R() * 280, 14 + R() * 48, shoreZ(0) - 50 + R() * 180))
        : new V3((R() - 0.5) * 750, 24 + R() * 68, (R() - 0.3) * 650),
      rad: 14 + R() * 44,
      w: (0.14 + R() * 0.20) * (R() < 0.5 ? -1 : 1),
      ph: R() * 100,
      off: new V3(),
      vel: new V3(),
    });
  }
  if (CITY === 'prague') for (const G of g) if (G.c.z === 0) G.c.z = riverZ(G.c.x);
  scene.add(m);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V3(), s = new V3();
  W.gullScatter = 0;
  W.updaters.push((t, dt, { rider }) => {
    let scattered = 0;
    for (let i = 0; i < N; i++) {
      const G = g[i];
      const a = t * G.w + G.ph;
      p.set(G.c.x + Math.cos(a) * G.rad, G.c.y + Math.sin(a * 1.7) * 3.2, G.c.z + Math.sin(a) * G.rad).add(G.off);
      const dx = p.x - rider.x, dy = p.y - rider.y, dz = p.z - rider.z, dd = Math.hypot(dx, dy, dz);
      if (dd < 18) { G.vel.x += (dx / dd) * 32 * dt; G.vel.y += (dy / dd + 0.6) * 32 * dt; G.vel.z += (dz / dd) * 32 * dt; scattered++; }
      G.off.addScaledVector(G.vel, dt);
      G.vel.multiplyScalar(Math.exp(-dt * 1.5));
      G.off.multiplyScalar(Math.exp(-dt * 0.08));
      const heading = Math.atan2(-Math.sin(a) * Math.sign(G.w) + G.vel.x * 0.1, Math.cos(a) * Math.sign(G.w) + G.vel.z * 0.1);
      const busy = G.vel.lengthSq() > 4 || Math.sin(t * 0.45 + G.ph) > 0.3;
      const flap = busy ? Math.sin(t * 11 + G.ph) : 0.35 + Math.sin(t * 2 + G.ph) * 0.1;
      e.set(0, heading, -Math.sign(G.w) * 0.35, 'YXZ');
      mat.compose(p, q.setFromEuler(e), s.set(1.32, 1.32 * flap, 1.32));
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    W.gullScatter = scattered;
  });
}

function smoke(scene, W, R) {
  const N = 100;
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), toonMat({ color: '#f5f2eb', noHatch: true }), N);
  m.frustumCulled = false;
  scene.add(m);
  W.hideInNormals.push(m);
  const src = W.smokeSources;
  if (!src.length) return;
  const puffs = [];
  for (let i = 0; i < N; i++) puffs.push({ s: i % src.length, age: R() * 7, life: 6 + R() * 2.5, j: new V3(R() - 0.5, 0, R() - 0.5) });
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new V3(), s = new V3();
  W.updaters.push((t, dt) => {
    for (let i = 0; i < N; i++) {
      const P = puffs[i];
      P.age += dt;
      if (P.age > P.life) { P.age = 0; P.s = Math.floor(R() * src.length); }
      const k = P.age / P.life;
      const big = P.s === W.steamerSmoke ? 2.4 : 1;
      p.copy(src[P.s]).add({ x: P.j.x * 2 + P.age * 1.5, y: P.age * 1.35 * big, z: P.j.z * 2 + P.age * 0.35 });
      const sc = (0.25 + k * 1.25) * big * Math.sin(Math.min(1, k * 1.2) * Math.PI) + 0.01;
      mat.compose(p, q, s.set(sc, sc * 0.82, sc));
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
  });
}

function laundryAndBunting(scene, W, R) {
  const lines = [];
  const houseAt = (row, x) => row.list.find((h) => x > h.x0 + 0.8 && x < h.x1 - 0.8);
  for (let r = 0; r < W.rows.length - 1; r++) {
    const A = W.rows[r], Bn = W.rows[r + 1];
    for (const h of A.list) {
      if (R() > 0.34) continue;
      const x = h.x0 + 1 + R() * (h.x1 - h.x0 - 2);
      const hb = houseAt(Bn, x);
      if (!hb) continue;
      const y = Math.min(h.top, hb.gy + 3.2) - 1.1 - R() * 1.8;
      if (y < hb.gy + 2.4) continue;
      const z1 = shoreZ(x) - A.d0 - h.dp + 0.3, z2 = shoreZ(x) - Bn.d0 - 0.3;
      if (z1 - z2 < 1.5) continue;
      lines.push({ a: new V3(x, y, z1), b: new V3(x, y, z2), bunting: R() < 0.38 });
    }
  }
  if (!lines.length) return;

  const lineMesh = new Bucket();
  const sheets = [];
  const pennants = [];
  const sheetCols = ['#ffffff', '#fcf8ef', '#dfe9f6', '#f7dce2', '#f6ecc8', '#d2e4da'];
  const flagCols = ['#e0463c', '#f2bd3a', '#3d7cc4', '#4aa87a', '#f7f1e3', '#e06488'];

  for (const L of lines) {
    const len = L.a.distanceTo(L.b), mid = L.a.clone().add(L.b).multiplyScalar(0.5);
    lineMesh.add(BOX, M(mid.x, mid.y, mid.z, 0, 0, 0, 0.04, 0.04, len), '#44444c');
    if (L.bunting) {
      const n = Math.max(4, Math.floor(len / 0.85));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const p = L.a.clone().lerp(L.b, u);
        p.y -= Math.sin(u * Math.PI) * 0.45; // graceful catenary sag
        pennants.push({ p, ph: R() * 6, c: flagCols[i % flagCols.length] });
      }
    } else {
      const n = Math.floor(len / 1.3);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const shirt = R() < 0.4;
        sheets.push({ p: L.a.clone().lerp(L.b, u), w: shirt ? 0.72 : 1.0 + R() * 0.22, h: shirt ? 0.82 : 1.25 + R() * 0.35, ph: R() * 6, c: pick(R, sheetCols) });
      }
    }
  }
  const lm = lineMesh.mesh(toonMat({ vertexColors: true }));
  if (lm) scene.add(lm);

  const c = new THREE.Color();
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3();

  if (sheets.length) {
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
    const m = new THREE.InstancedMesh(geo, toonMat({ color: '#ffffff', side: THREE.DoubleSide, noHatch: true }), sheets.length);
    m.castShadow = true;
    sheets.forEach((s, i) => m.setColorAt(i, c.set(s.c)));
    scene.add(m);
    W.updaters.push((t) => {
      for (let i = 0; i < sheets.length; i++) {
        const s = sheets[i];
        const sway = Math.sin(t * 2.0 + s.ph) * 0.24 + Math.sin(t * 4.9 + s.ph * 2) * 0.06 + 0.14;
        e.set(sway, Math.PI / 2, 0, 'YXZ');
        mat.compose(s.p, q.setFromEuler(e), sc.set(s.w, s.h, 1));
        m.setMatrixAt(i, mat);
      }
      m.instanceMatrix.needsUpdate = true;
    });
  }

  if (pennants.length) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.34, 0, 0, 0.34, 0, 0, 0, -0.78, 0], 3));
    tri.computeVertexNormals();
    const pm = new THREE.InstancedMesh(tri, toonMat({ color: '#ffffff', side: THREE.DoubleSide, noHatch: true }), pennants.length);
    pennants.forEach((s, i) => pm.setColorAt(i, c.set(s.c)));
    scene.add(pm);
    W.hideInNormals.push(pm);
    W.updaters.push((t) => {
      for (let i = 0; i < pennants.length; i++) {
        const s = pennants[i];
        const sway = Math.sin(t * 3.8 + s.ph) * 0.32 + 0.16;
        e.set(sway, Math.PI / 2, 0, 'YXZ');
        mat.compose(s.p, q.setFromEuler(e), sc.set(1, 1, 1));
        pm.setMatrixAt(i, mat);
      }
      pm.instanceMatrix.needsUpdate = true;
    });
  }
}
