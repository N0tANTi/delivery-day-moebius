import * as THREE from 'three';
import { toon } from './toon.js';
import { M, pick, groundH, townW, riverZ, riverSlope, southZ, northZ, RIVER_HW, PETRIN } from './util.js';
import { addHouse, gableGeo, boatMesh, BOX, CYL, SPH, PLANE } from './world.js';

// Prague: the Vltava along x, Old Town to the south, Malá Strana and the castle to the north.

const V3 = THREE.Vector3;
const WALLS = ['#ecd08a', '#f1e3c4', '#e8b9a3', '#d5e0c6', '#f4efe4', '#e6a88a', '#cfdde3', '#e2c06a', '#f0d9b8', '#dcc3d6', '#eadcb0', '#f2e6cf'];
const ROOFS = ['#b8563a', '#c4633f', '#a94d36', '#b55f45', '#c26a48'];
const STONE = '#8e8676', SLATE = '#2e3238', COPPER = '#5fa58c', GOLD = '#e2b94a', DARK_WIN = '#33384a';

const roofFor = (R) => { const r = R(); return r < 0.12 ? '#5b6670' : r < 0.16 ? COPPER : pick(R, ROOFS); };

export function buildPrague(B, W, R, scene) {
  const OTS = { x: 150, z: southZ(150, 230) };                 // Old Town Square
  const NIC = { x: -60, z: northZ(-60, 150) };                 // St Nicholas, Malá Strana
  const POWDER = { x: 345, z: southZ(345, 300) };
  const near = (x, z, p, r) => Math.hypot(x - p.x, z - p.z) < r;

  // city blocks around courtyards
  blocks(B, W, R, 1, -380, 380, 14, 330, (x, z, s) => near(x, z, OTS, 78) || (Math.abs(x) < 18 && s < 60) || near(x, z, POWDER, 28));
  blocks(B, W, R, -1, -330, 210, 14, 235, (x, z, n) => near(x, z, NIC, 52) || (Math.abs(x) < 18 && n < 60));

  embankments(B, W);
  charlesBridge(B, W, R);
  oldTownSquare(B, W, R, scene, OTS);
  gothicTower(B, W, { x: POWDER.x, z: POWDER.z, w: 11, h: 34, spire: 15, pins: true, ry: -Math.atan(riverSlope(POWDER.x)) });
  stNicholas(B, W, NIC);
  castle(B, W, R);
  petrinTower(B, W);
  riverBoats(W, R, scene);

  W.start = [300, 34, riverZ(300) - 10, Math.PI / 2 - 0.3];
  W.center = new THREE.Vector2(-40, 0);
  W.waterAt = new V3(0, 0, riverZ(0));
  W.bellAt = new V3(OTS.x, 0, OTS.z);
}

function beam(B, a, b, t, color) {
  const d = b.clone().sub(a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize());
  B.add(BOX, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new V3(t, len, t)), color);
}

// ---------------------------------------------------------------- blocks

function blocks(B, W, R, side, x0, x1, s0, s1, skip) {
  const CW = 60, CD = 50;
  for (let gx = x0; gx < x1; gx += CW) {
    for (let gs = s0; gs < s1; gs += CD) {
      const cx = gx + CW / 2 + (R() - 0.5) * 8, cs = gs + CD / 2 + (R() - 0.5) * 6;
      const cz = side > 0 ? southZ(cx, cs) : northZ(cx, cs);
      if (skip(cx, cz, cs)) continue;
      if (townW(cx, cz) < 0.6) continue;
      const bw = CW - 10 - R() * 4, bd = CD - 10 - R() * 3;
      const ry = -Math.atan(riverSlope(cx)) + (R() - 0.5) * 0.16;
      block(B, W, R, cx, cz, ry, bw, bd);
    }
  }
}

function block(B, W, R, cx, cz, ry, bw, bd) {
  const DP = 10;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const toW = (u, v) => [cx + u * cs + v * sn, cz - u * sn + v * cs];
  const sides = [
    { len: bw, off: bd / 2, rot: 0, trim: 0 },
    { len: bw, off: bd / 2, rot: Math.PI, trim: 0 },
    { len: bd, off: bw / 2, rot: Math.PI / 2, trim: DP },
    { len: bd, off: bw / 2, rot: -Math.PI / 2, trim: DP },
  ];
  for (const S of sides) {
    const nx = Math.sin(S.rot), nz = Math.cos(S.rot), tx = Math.cos(S.rot), tz = -Math.sin(S.rot);
    let u = -S.len / 2 + S.trim;
    const end = S.len / 2 - S.trim;
    while (end - u > 4) {
      let w = 7 + R() * 4;
      if (end - u - w < 5) w = end - u;
      const lu = u + w / 2, lv = S.off - DP / 2;
      const [x, z] = toW(nx * lv + tx * lu, nz * lv + tz * lu);
      const baroque = R() < 0.42;
      addHouse(B, W, R, {
        x, z, ry: ry + S.rot, w: w - 0.06, dp: DP, h: 11 + R() * 6, prague: true, baroque, ridgeX: !baroque,
        wall: pick(R, WALLS), roof: roofFor(R), cap: '#7e3a2a', trim: R() < 0.8 ? '#f5efe2' : '#eadcbc', shop: R() < 0.25,
      });
      u += w;
    }
  }
  if (R() < 0.14) church(B, W, R, toW, ry, Math.min(bw, bd) - 2 * DP);
}

function church(B, W, R, toW, ry, room) {
  if (room < 14) return;
  const [x, z] = toW(0, 0), gy = groundH(x, z);
  const H = M(x, 0, z, 0, ry, 0);
  const L = (...a) => H.clone().multiply(M(...a));
  const wall = pick(R, ['#f1e3c4', '#f4efe4', '#ecd08a', '#e8d9c0']);
  B.add(BOX, L(0, gy + 7, 0, 0, 0, 0, 22, 22, room - 3), wall);
  B.add(gableGeo(room - 3, 7, 22, true), L(0, gy + 18, 0), R() < 0.5 ? '#b8563a' : '#5b6670');
  W.colliders.push(new THREE.Box3(new V3(-11, gy - 4, -room / 2), new V3(11, gy + 25, room / 2)).applyMatrix4(H));
  const [tx, tz] = toW(-12, 0);
  if (R() < 0.5) gothicTower(B, W, { x: tx, z: tz, gy, w: 6.5, h: 30 + R() * 8, spire: 14 + R() * 6, ry, pins: R() < 0.5, color: wall });
  else baroqueTower(B, W, { x: tx, z: tz, gy, w: 6.5, h: 30 + R() * 6, ry, color: wall });
}

// ---------------------------------------------------------------- towers

function gothicTower(B, W, o) {
  const gy = o.gy ?? groundH(o.x, o.z);
  const H = M(o.x, 0, o.z, 0, o.ry || 0, 0);
  const L = (...a) => H.clone().multiply(M(...a));
  const c = o.color ?? STONE, roof = o.roof ?? SLATE, w = o.w, h = o.h, sp = o.spire;
  B.add(BOX, L(0, gy + h / 2 - 2, 0, 0, 0, 0, w, h + 4, w), c);
  B.add(BOX, L(0, gy + h + 0.3, 0, 0, 0, 0, w + 1.1, 0.8, w + 1.1), c);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    for (const lv of [0.5, 0.78]) B.add(BOX, L(Math.sin(a) * w / 2, gy + h * lv, Math.cos(a) * w / 2, 0, a, 0, w * 0.2, h * 0.13, 0.3), DARK_WIN);
  }
  const base = gy + h + 0.7;
  const cone = new THREE.ConeGeometry(w * 0.62, sp, 4); cone.rotateY(Math.PI / 4);
  B.add(cone, L(0, base + sp / 2, 0), roof);
  if (o.pins) {
    const pin = new THREE.ConeGeometry(w * 0.13, sp * 0.42, 4); pin.rotateY(Math.PI / 4);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      B.add(pin, L(sx * w * 0.5, base + sp * 0.21, sz * w * 0.5), roof);
      B.add(SPH, L(sx * w * 0.5, base + sp * 0.43, sz * w * 0.5, 0, 0, 0, 0.22, 0.22, 0.22), GOLD);
    }
    if (o.ring) {
      const small = new THREE.ConeGeometry(w * 0.08, sp * 0.3, 4);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + Math.PI / 8;
        B.add(small, L(Math.sin(a) * w * 0.36, base + sp * 0.42, Math.cos(a) * w * 0.36), roof);
      }
    }
  }
  B.add(SPH, L(0, base + sp + 0.3, 0, 0, 0, 0, 0.45, 0.45, 0.45), GOLD);
  W.colliders.push(new THREE.Box3(new V3(-w / 2 - 0.6, gy - 3, -w / 2 - 0.6), new V3(w / 2 + 0.6, base + sp * 0.5, w / 2 + 0.6)).applyMatrix4(H));
  W.colliders.push(new THREE.Box3(new V3(-w / 5, base + sp * 0.5, -w / 5), new V3(w / 5, base + sp, w / 5)).applyMatrix4(H));
  return { gy, top: base };
}

function onion(B, L, y, r, color) {
  B.add(CYL, L(0, y + r * 0.4, 0, 0, 0, 0, r * 0.8, r * 0.8, r * 0.8), color);
  B.add(SPH, L(0, y + r * 1.3, 0, 0, 0, 0, r, r * 1.1, r), color);
  B.add(CYL, L(0, y + r * 2.5, 0, 0, 0, 0, r * 0.3, r * 0.8, r * 0.3), color);
  B.add(SPH, L(0, y + r * 3.1, 0, 0, 0, 0, r * 0.4, r * 0.5, r * 0.4), color);
  B.add(new THREE.ConeGeometry(r * 0.15, r * 1.4, 6), L(0, y + r * 4.1, 0), color);
  B.add(SPH, L(0, y + r * 4.8, 0, 0, 0, 0, 0.3, 0.3, 0.3), GOLD);
}

function baroqueTower(B, W, o) {
  const gy = o.gy ?? groundH(o.x, o.z);
  const H = M(o.x, 0, o.z, 0, o.ry || 0, 0);
  const L = (...a) => H.clone().multiply(M(...a));
  const w = o.w, h = o.h, c = o.color ?? '#f1e3c4';
  B.add(BOX, L(0, gy + h / 2 - 2, 0, 0, 0, 0, w, h + 4, w), c);
  for (const yy of [h * 0.35, h * 0.7, h]) B.add(BOX, L(0, gy + yy, 0, 0, 0, 0, w + 0.6, 0.5, w + 0.6), '#f7f2e4');
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    B.add(BOX, L(Math.sin(a) * w / 2, gy + h * 0.85, Math.cos(a) * w / 2, 0, a, 0, w * 0.35, h * 0.14, 0.3), DARK_WIN);
    B.add(CYL, L(Math.sin(a) * (w / 2 + 0.05), gy + h * 0.55, Math.cos(a) * (w / 2 + 0.05), Math.PI / 2, a, 0, w * 0.22, 0.2, w * 0.22), '#fbf6e6');
  }
  onion(B, L, gy + h + 0.2, w * 0.42, COPPER);
  W.colliders.push(new THREE.Box3(new V3(-w / 2, gy - 3, -w / 2), new V3(w / 2, gy + h + w * 1.5, w / 2)).applyMatrix4(H));
}

// ---------------------------------------------------------------- river

function embankments(B, W) {
  for (let x = -1100; x < 1100; x += 10) {
    const xc = x + 5, ry = -Math.atan(riverSlope(xc));
    for (const s of [1, -1]) {
      const z = riverZ(xc) + s * (RIVER_HW + 0.8);
      B.add(BOX, M(xc, 0.6, z, 0, ry, 0, 10.4, 8.4, 2.4), '#b3a68c');
      B.add(BOX, M(xc, 4.9, z, 0, ry, 0, 10.4, 0.4, 2.7), '#d9ceb4');
    }
  }
}

function charlesBridge(B, W, R) {
  const z0 = northZ(0, 12), z1 = southZ(0, 12), Lb = z1 - z0;
  const deck = 10.5, n = 5, pier = 5, span = (Lb - 24 - pier * (n - 1)) / n;
  const s = new THREE.Shape();
  s.moveTo(0, -3); s.lineTo(Lb, -3); s.lineTo(Lb, deck); s.lineTo(0, deck); s.closePath();
  for (let i = 0; i < n; i++) {
    const a = 12 + i * (span + pier), b = a + span, c = (a + b) / 2;
    const hole = new THREE.Path();
    hole.moveTo(a, -2.9); hole.lineTo(b, -2.9); hole.lineTo(b, 2.5);
    hole.absellipse(c, 2.5, span / 2, 5, 0, Math.PI, false);
    hole.lineTo(a, -2.9);
    s.holes.push(hole);
    if (i < n - 1) W.colliders.push(new THREE.Box3(new V3(-5.2, -3, z0 + b), new V3(5.2, 6.5, z0 + b + pier)));
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 9, bevelEnabled: false, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); g.translate(4.5, 0, z0);
  B.add(g, null, '#a39680');
  W.colliders.push(new THREE.Box3(new V3(-5, 6.5, z0), new V3(5, deck + 1.4, z1)));
  for (const sx of [-1, 1]) {
    B.add(BOX, M(sx * 4.2, deck + 0.6, (z0 + z1) / 2, 0, 0, 0, 0.6, 1.2, Lb), '#978a74');
    // cutwaters on the piers
    for (let i = 0; i < n - 1; i++) {
      const pz = z0 + 12 + (i + 1) * span + i * pier + pier / 2;
      B.add(BOX, M(sx * 5.4, 1.5, pz, 0, Math.PI / 4, 0, 3.4, 9, 3.4), '#a39680');
    }
  }
  // statues on the parapets, dark with age
  const count = 15;
  for (let i = 0; i < count; i++) {
    const z = z0 + 10 + i * (Lb - 20) / (count - 1);
    for (const sx of [-1, 1]) {
      if (R() < 0.12) continue;
      const x = sx * 4.2, y = deck + 1.2;
      B.add(BOX, M(x, y + 0.8, z, 0, 0, 0, 1.3, 1.6, 1.3), '#8f8470');
      B.add(new THREE.CylinderGeometry(0.35, 0.6, 2.3, 7), M(x, y + 2.75, z, 0, R() * 3, R() * 0.1), '#35343a');
      B.add(SPH, M(x, y + 4.1, z, 0, 0, 0, 0.3, 0.33, 0.3), '#35343a');
      if (R() < 0.35) { B.add(BOX, M(x, y + 4.4, z + 0.3, 0, 0, 0, 0.1, 1.8, 0.1), GOLD); B.add(BOX, M(x, y + 4.8, z + 0.3, 0, 0, 0, 0.8, 0.1, 0.1), GOLD); }
      else if (R() < 0.5) B.add(SPH, M(x, y + 4.5, z, 0, 0, 0, 0.45, 0.06, 0.45), GOLD);   // halo
      if (i % 2 === 1) {
        B.add(CYL, M(x, y + 1.6, z + (Lb - 20) / (count - 1) / 2, 0, 0, 0, 0.07, 3.2, 0.07), '#2c2c30');
        B.add(BOX, M(x, y + 3.35, z + (Lb - 20) / (count - 1) / 2, 0, 0, 0, 0.4, 0.5, 0.4), '#f0dca0');
      }
    }
  }
  // Old Town Bridge Tower
  const zt = southZ(0, 8);
  const t = gothicTower(B, W, { x: 0, z: zt, gy: 4.5, w: 12, h: 28, spire: 17, pins: true });
  for (const f of [-1, 1]) B.add(BOX, M(0, 4.5 + 3.5, zt + f * 6.05, 0, 0, 0, 4.5, 7, 0.3), '#2a2a30');
  // Lesser Town Bridge Towers
  const zn = northZ(0, 8);
  gothicTower(B, W, { x: -8, z: zn, gy: 4.5, w: 9.5, h: 30, spire: 17, pins: true });
  gothicTower(B, W, { x: 8.5, z: zn, gy: 4.5, w: 8, h: 16, spire: 8 });
  B.add(BOX, M(0.5, 4.5 + 7, zn, 0, 0, 0, 8, 10, 7), STONE);
  B.add(BOX, M(0.5, 4.5 + 3, zn + 3.55, 0, 0, 0, 4.2, 6, 0.3), '#2a2a30');
  B.add(gableGeo(7, 3.5, 8, true), M(0.5, 4.5 + 12, zn), SLATE);
}

// ---------------------------------------------------------------- Old Town Square

function oldTownSquare(B, W, R, scene, OTS) {
  const gy = groundH(OTS.x, OTS.z);
  // a ring of houses facing into the square
  for (let i = 0; i < 34; i++) {
    const a = i / 34 * Math.PI * 2;
    const sx = Math.cos(a), sz = Math.sin(a);
    if (sx > 0.72 || sx < -0.8) continue;                        // Týn to the east, the Town Hall to the west
    const x = OTS.x + sx * 70, z = OTS.z + sz * 64;
    addHouse(B, W, R, {
      x, z, ry: Math.atan2(-sx, -sz), w: 12, dp: 11, h: 13 + R() * 4, prague: true, baroque: R() < 0.6, ridgeX: undefined,
      wall: pick(R, WALLS), roof: roofFor(R), cap: '#7e3a2a', trim: '#f5efe2', shop: true,
    });
  }
  // Jan Hus memorial
  B.add(CYL, M(OTS.x + 10, gy + 0.6, OTS.z, 0, 0, 0, 7, 1.2, 4), '#8f8470');
  B.add(SPH, M(OTS.x + 10, gy + 3, OTS.z, 0, 0, 0, 5, 2.6, 2.6), '#3d4a44');
  B.add(new THREE.CylinderGeometry(0.4, 0.9, 5, 8), M(OTS.x + 10, gy + 5.5, OTS.z), '#3d4a44');

  // Old Town Hall tower with the astronomical clock
  const hx = OTS.x - 58, hz = OTS.z + 6;
  const t = gothicTower(B, W, { x: hx, z: hz, gy, w: 10, h: 50, spire: 15, pins: true });
  B.add(BOX, M(hx - 14, gy + 8, hz + 4, 0, 0, 0, 20, 20, 22), '#efe3c8');
  B.add(gableGeo(22, 8, 20, false), M(hx - 14, gy + 18, hz + 4), '#b8563a');
  const fx = hx + 5.1, fy = gy + 16;
  B.add(BOX, M(fx - 0.05, fy - 1, hz, 0, 0, 0, 0.4, 13, 7.5), '#6d6152');
  B.add(CYL, M(fx + 0.2, fy + 1.5, hz, 0, 0, Math.PI / 2, 3.1, 0.25, 3.1), GOLD);
  B.add(CYL, M(fx + 0.3, fy + 1.5, hz, 0, 0, Math.PI / 2, 2.8, 0.25, 2.8), '#3f6da8');
  B.add(CYL, M(fx + 0.36, fy + 1.3, hz, 0, 0, Math.PI / 2, 1.5, 0.25, 1.5), '#c9a24a');
  B.add(CYL, M(fx + 0.4, fy + 1.3, hz, 0, 0, Math.PI / 2, 1.2, 0.25, 1.2), '#2b3b66');
  B.add(CYL, M(fx + 0.3, fy - 4, hz, 0, 0, Math.PI / 2, 2.2, 0.25, 2.2), '#e9dcb4');
  B.add(CYL, M(fx + 0.36, fy - 4, hz, 0, 0, Math.PI / 2, 1.4, 0.25, 1.4), '#a8453a');
  B.add(gableGeo(7.5, 1.6, 0.6, false).rotateY(Math.PI / 2), M(fx + 0.2, fy + 5.2, hz), SLATE);
  const hands = new THREE.Group();
  hands.position.set(fx + 0.6, fy + 1.5, hz);
  hands.rotation.y = Math.PI / 2;
  const hand = new THREE.Mesh(BOX, toon(GOLD)); hand.scale.set(0.18, 2.4, 0.1); hand.position.y = 1.0;
  const sunHand = new THREE.Group(); sunHand.add(hand);
  const ball = new THREE.Mesh(SPH, toon(GOLD)); ball.scale.setScalar(0.3); ball.position.y = 1.7; sunHand.add(ball);
  hands.add(sunHand);
  scene.add(hands);
  W.updaters.push(() => {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    sunHand.rotation.z = -h / 24 * Math.PI * 2;
  });

  // Týn Church: two spiky black towers rising behind the houses of the square
  const tx = OTS.x + 78;
  const dz = 10.5;
  for (const s of [-1, 1]) gothicTower(B, W, { x: tx, z: OTS.z + s * dz, gy, w: 8, h: 44, spire: 32, pins: true, ring: true, color: '#8a8272', roof: '#26292e' });
  B.add(BOX, M(tx + 26, gy + 12, OTS.z, 0, 0, 0, 44, 30, 22), '#8a8272');
  B.add(gableGeo(22, 16, 44, true), M(tx + 26, gy + 27, OTS.z), '#34393f');
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) B.add(BOX, M(tx + 10 + i * 8, gy + 16, OTS.z + s * 11.1, 0, 0, 0, 2.2, 13, 0.3), DARK_WIN);
  B.add(gableGeo(20, 14, 1.2, false).rotateY(Math.PI / 2), M(tx + 3.6, gy + 27, OTS.z), '#8a8272');
  W.colliders.push(new THREE.Box3(new V3(tx + 3, gy - 3, OTS.z - 11), new V3(tx + 49, gy + 40, OTS.z + 11)));
  // the Týn school in front, with its arcade
  addHouse(B, W, R, { x: tx - 11, z: OTS.z, ry: -Math.PI / 2, w: 26, dp: 10, h: 12, prague: true, baroque: false, ridgeX: true, wall: '#f1e3c4', roof: '#b8563a', cap: '#7e3a2a', shop: true });
}

// ---------------------------------------------------------------- Malá Strana

function stNicholas(B, W, N) {
  const gy = groundH(N.x, N.z);
  const H = M(N.x, 0, N.z, 0, -Math.atan(riverSlope(N.x)), 0);
  const L = (...a) => H.clone().multiply(M(...a));
  const c = '#f0e2c8';
  B.add(BOX, L(0, gy + 9, 0, 0, 0, 0, 24, 26, 46), c);
  B.add(gableGeo(24, 9, 46, false), L(0, gy + 22, 0), '#6aa28c');
  B.add(BOX, L(0, gy + 18, 23.2, 0, 0, 0, 22, 8, 1.4), '#f7f2e4');
  B.add(CYL, L(0, gy + 27, -8, 0, 0, 0, 10, 10, 10), c);
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; B.add(BOX, L(Math.sin(a) * 10.05, gy + 27, -8 + Math.cos(a) * 10.05, 0, a, 0, 1.4, 4.5, 0.2), DARK_WIN); }
  B.add(new THREE.SphereGeometry(10.8, 22, 11, 0, Math.PI * 2, 0, Math.PI / 2), L(0, gy + 32, -8, 0, 0, 0, 1, 1.15, 1), COPPER);
  B.add(CYL, L(0, gy + 45, -8, 0, 0, 0, 1.8, 3, 1.8), c);
  B.add(new THREE.ConeGeometry(2, 3, 10), L(0, gy + 48, -8), COPPER);
  B.add(SPH, L(0, gy + 50, -8, 0, 0, 0, 0.5, 0.5, 0.5), GOLD);
  W.colliders.push(new THREE.Box3(new V3(-12, gy - 3, -23), new V3(12, gy + 31, 23)).applyMatrix4(H));
  W.colliders.push(new THREE.Box3(new V3(-11, gy + 22, -19), new V3(11, gy + 45, 3)).applyMatrix4(H));
  const tp = new V3(22, 0, -18).applyMatrix4(H);
  baroqueTower(B, W, { x: tp.x, z: tp.z, gy, w: 9, h: 44, color: c, ry: -Math.atan(riverSlope(N.x)) });
}

// ---------------------------------------------------------------- the castle and St Vitus

function castle(B, W, R) {
  const cz = northZ(-70, 282), gy = groundH(-70, cz);
  const pal = '#efe6cf';
  const wing = (x0, x1, z, depth, h, facing) => {
    const len = x1 - x0, xc = (x0 + x1) / 2;
    B.add(BOX, M(xc, gy + h / 2 - 4, z, 0, 0, 0, len, h + 8, depth), pal);
    B.add(gableGeo(depth, 6, len, true), M(xc, gy + h, z), '#b35a3e');
    B.add(BOX, M(xc, gy + h - 0.2, z + facing * (depth / 2 + 0.1), 0, 0, 0, len, 0.5, 0.5), '#f7f2e4');
    for (let x = x0 + 2.5; x < x1 - 1.5; x += 3.4) for (let r = 0; r < 5; r++) {
      const y = gy + 2.5 + r * 3.6;
      B.add(PLANE, M(x, y, z + facing * (depth / 2 + 0.03), 0, facing > 0 ? 0 : Math.PI, 0, 1.3, 2.0, 1), '#f7f2e4');
      B.add(PLANE, M(x, y, z + facing * (depth / 2 + 0.05), 0, facing > 0 ? 0 : Math.PI, 0, 1.0, 1.65, 1), '#46586e');
    }
    W.colliders.push(new THREE.Box3(new V3(x0, gy - 4, z - depth / 2), new V3(x1, gy + h + 5, z + depth / 2)));
  };
  // the long south front over Malá Strana, and wings closing the courtyard
  wing(-230, 60, cz, 18, 21, 1);
  wing(-230, -212, cz - 44, 70, 21, 1);
  wing(42, 60, cz - 44, 70, 21, 1);
  // terraces and the ramp below the front
  B.add(BOX, M(-85, gy - 3, cz + 16, 0, 0, 0, 300, 8, 12), '#c9bb9c');

  // St Vitus Cathedral inside the courtyard
  const vz = cz - 50, x0 = -155, x1 = -45, hw = 12, wallH = 32;
  B.add(BOX, M((x0 + x1) / 2, gy + wallH / 2 - 3, vz, 0, 0, 0, x1 - x0, wallH + 6, hw * 2), STONE);
  B.add(gableGeo(hw * 2, 17, x1 - x0, true), M((x0 + x1) / 2, gy + wallH, vz), '#43605a');
  for (let x = x0 + 8; x < x1; x += 16) B.add(new THREE.ConeGeometry(0.6, 7, 4), M(x, gy + wallH + 20, vz), '#34403f');
  const apse = new THREE.CylinderGeometry(hw, hw, wallH + 6, 12, 1, false, 0, Math.PI);
  B.add(apse, M(x1, gy + wallH / 2 - 3, vz), STONE);
  B.add(new THREE.ConeGeometry(hw + 0.4, 16, 12, 1, false, 0, Math.PI), M(x1, gy + wallH + 8, vz), '#4f6d63');
  const pin = new THREE.ConeGeometry(0.9, 6, 4);
  for (let x = x0 + 12; x <= x1 - 4; x += 9) {
    for (const s of [-1, 1]) {
      B.add(BOX, M(x, gy + 11, vz + s * (hw + 6), 0, 0, 0, 2, 28, 2.2), STONE);
      B.add(pin, M(x, gy + 28, vz + s * (hw + 6)), STONE);
      beam(B, new V3(x, gy + 22, vz + s * (hw + 6)), new V3(x, gy + 29, vz + s * hw), 1.1, STONE);
      B.add(BOX, M(x + 4.5, gy + 17, vz + s * (hw + 0.05), 0, 0, 0, 2.8, 17, 0.3), '#3a4a66');
      B.add(pin, M(x, gy + wallH + 2.5, vz + s * hw, 0, 0, 0, 0.8, 0.9, 0.8), STONE);
    }
  }
  for (let k = 0; k < 5; k++) {
    const a = (k + 0.5) / 5 * Math.PI, px = x1 + Math.sin(a) * (hw + 5), pz = vz + Math.cos(a) * (hw + 5);
    B.add(BOX, M(px, gy + 11, pz, 0, a, 0, 2, 28, 2.2), STONE);
    B.add(pin, M(px, gy + 28, pz), STONE);
    beam(B, new V3(px, gy + 22, pz), new V3(x1 + Math.sin(a) * hw, gy + 29, vz + Math.cos(a) * hw), 1.1, STONE);
  }
  // west front: twin spires and a rose window
  for (const s of [-1, 1]) gothicTower(B, W, { x: x0 - 2, z: vz + s * 8.5, gy, w: 9, h: 62, spire: 36, pins: true, ring: true, color: STONE, roof: '#34403f' });
  B.add(CYL, M(x0 - 6.6, gy + 34, vz, 0, 0, Math.PI / 2, 4, 0.3, 4), '#3a4a66');
  B.add(CYL, M(x0 - 6.7, gy + 34, vz, 0, 0, Math.PI / 2, 1.2, 0.3, 1.2), '#c24a3a');
  B.add(BOX, M(x0 - 6.55, gy + 12, vz, 0, 0, 0, 0.3, 11, 5), '#2a2a30');
  // the great south tower with its copper helmet
  const gx = -98, gz = vz + hw + 7;
  const t = gothicTower(B, W, { x: gx, z: gz, gy, w: 14, h: 58, spire: 0.01, color: STONE });
  const Lg = (...a) => M(gx, 0, gz).multiply(M(...a));
  B.add(CYL, Lg(0, gy + 61, 0, 0, 0, 0, 6.5, 5, 6.5), STONE);
  onion(B, Lg, gy + 63, 6, COPPER);
  W.colliders.push(new THREE.Box3(new V3(x0, gy - 3, vz - hw - 7), new V3(x1 + hw, gy + wallH + 12, vz + hw + 7)));
}

function petrinTower(B, W) {
  const x = PETRIN.x, z = northZ(PETRIN.x, PETRIN.n), gy = groundH(x, z) - 0.5;
  const H = 58, b = 5.5, tp = 1.4, col = '#8a4a2c';
  const at = (y, sx, sz) => { const k = y / H, r = b + (tp - b) * k; return new V3(x + sx * r, gy + y, z + sz * r); };
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [sx, sz] of corners) beam(B, at(0, sx, sz), at(H, sx, sz), 0.35, col);
  const lv = [0, 12, 22, 31, 39, 46, 52, H];
  for (let i = 0; i < lv.length - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      beam(B, at(lv[i], ax, az), at(lv[i + 1], bx, bz), 0.18, col);
      beam(B, at(lv[i], bx, bz), at(lv[i + 1], ax, az), 0.18, col);
      beam(B, at(lv[i + 1], ax, az), at(lv[i + 1], bx, bz), 0.2, col);
    }
  }
  for (const y of [20, 52]) { const r = b + (tp - b) * y / H + 1.2; B.add(BOX, M(x, gy + y, z, 0, 0, 0, r * 2, 0.4, r * 2), col); }
  B.add(BOX, M(x, gy + H + 1.5, z, 0, 0, 0, 3.2, 3, 3.2), '#e9dcc0');
  B.add(new THREE.ConeGeometry(2.4, 3, 4).rotateY(Math.PI / 4), M(x, gy + H + 4.5, z), col);
  B.add(BOX, M(x, gy + H + 9, z, 0, 0, 0, 0.12, 6, 0.12), '#2c2c30');
  W.colliders.push(new THREE.Box3(new V3(x - b, gy, z - b), new V3(x + b, gy + H + 6, z + b)));
}

// ---------------------------------------------------------------- boats on the Vltava

function riverBoats(W, R, scene) {
  const boats = [];
  for (let i = 0; i < 5; i++) {
    const g = boatMesh(R, 16 + R() * 6, '#f4f1e8', pick(R, ['#2c4f7c', '#a8453a', '#3f7a5c']));
    scene.add(g);
    boats.push({ g, x: -800 + i * 350 + R() * 100, lane: (i % 2 ? 1 : -1) * (18 + R() * 12), v: (i % 2 ? 1 : -1) * (2.5 + R()), ph: R() * 9 });
  }
  for (let i = 0; i < 8; i++) {
    const g = boatMesh(R, 5 + R() * 2, pick(R, ['#f4f1e8', '#3c6fa8', '#d0453c', '#e7b73b']), '#f4f1e8');
    const x = 120 + i * 9 + R() * 3;
    g.position.set(x, 0, riverZ(x) + RIVER_HW - 5);
    g.rotation.y = Math.PI / 2 - Math.atan(riverSlope(x)) + (R() - 0.5) * 0.3;
    scene.add(g);
    boats.push({ g, moored: true, ph: R() * 9 });
  }
  W.updaters.push((t, dt) => {
    for (const b of boats) {
      if (!b.moored) {
        b.x += b.v * dt;
        if (b.x > 1000) b.x = -1000; if (b.x < -1000) b.x = 1000;
        const sl = riverSlope(b.x);
        b.g.position.set(b.x, 0, riverZ(b.x) + b.lane);
        b.g.rotation.y = Math.atan2(Math.sign(b.v), Math.sign(b.v) * sl);
      }
      b.g.position.y = Math.sin(t * 1.2 + b.ph) * 0.08;
      b.g.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.02;
    }
  });
}
