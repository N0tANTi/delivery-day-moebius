import * as THREE from 'three';
import { toon, toonMat, NOISE_GLSL } from './toon.js';
import { Bucket, M, rng, fbm, vnoise, shoreZ, groundH, townW, landDist, smooth, pick, CITY, riverZ, RIVER_HW } from './util.js';
import { buildPrague } from './prague.js';

const V3 = THREE.Vector3;
export const SUN = new V3(0.42, 0.74, 0.52).normalize();
export const FOG_DENSITY = 0.00072;
export const HAZE = new THREE.Color('#eef0e2');
const HAZE_SEA = new THREE.Color('#dbe8ee');

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
export const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
export const SPH = new THREE.IcosahedronGeometry(1, 2);
export const PLANE = new THREE.PlaneGeometry(1, 1);

const MOLE_A = new THREE.Vector2(95, shoreZ(95) + 1);
const MOLE_B = new THREE.Vector2(40, shoreZ(40) + 150);
export const TOWER = new V3(0, 0, -100);

export function buildWorld(scene) {
  const W = { colliders: [], puffs: [], hideInNormals: [], updaters: [], smokeSources: [], rows: [] };
  const R = rng(20260923);

  lights(scene, W);
  sky(scene, W);
  terrain(scene);
  sea(scene, W);

  const B = new Bucket();
  if (CITY === 'prague') buildPrague(B, W, R, scene);
  else {
    town(B, W, R);
    landmarks(B, W, R, scene);
    harbour(B, W, R, scene);
    farVillage(B, W, R);
  }
  const townMesh = B.mesh(toonMat({ vertexColors: true }));
  townMesh.castShadow = townMesh.receiveShadow = true;
  scene.add(townMesh);

  trees(scene, R);
  clouds(scene, W, R);
  gulls(scene, W, R);
  smoke(scene, W, R);
  if (CITY !== 'prague') laundry(scene, W, R);

  W.update = (t, dt, ctx) => { for (const f of W.updaters) f(t, dt, ctx); };
  return W;
}

// ---------------------------------------------------------------- light & sky

function lights(scene, W) {
  scene.add(new THREE.HemisphereLight('#cde0f5', '#cdb58a', 1.75));
  const sun = new THREE.DirectionalLight('#fff2d8', 2.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 1000 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);
  W.updaters.push((t, dt, { focus }) => {
    // snap to shadow texels so the shadows don't shimmer as we fly
    const step = 260 / 2048;
    const f = focus.clone();
    f.x = Math.round(f.x / step) * step; f.z = Math.round(f.z / step) * step;
    sun.target.position.copy(f);
    sun.position.copy(f).addScaledVector(SUN, 450);
  });
}

function sky(scene, W) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSun: { value: SUN },
      uTop: { value: new THREE.Color('#2a66c4') },
      uMid: { value: new THREE.Color('#79aee6') },
      uHor: { value: HAZE },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uTop, uMid, uHor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, y));
        c = mix(c, uTop, smoothstep(0.18, 0.85, y));
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.92, 0.72) * (pow(s, 12.0) * 0.22 + pow(s, 90.0) * 0.35);
        c = mix(c, vec3(4.0, 3.8, 3.2), smoothstep(0.99955, 0.9997, s));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  W.hideInNormals.push(dome);
  W.updaters.push((t, dt, { camera }) => dome.position.copy(camera.position));
}

// ---------------------------------------------------------------- terrain

function terrain(scene) {
  const P = CITY === 'prague';
  const g = P ? new THREE.PlaneGeometry(4400, 4400, 330, 330) : new THREE.PlaneGeometry(3600, 3000, 300, 250);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, P ? 0 : -800);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const C = (h) => new THREE.Color(h);
  const grass = C('#9db862'), grass2 = C('#6c9446'), hill = C('#5f8a4c'), dry = C('#c2b270'), wood = C('#4f7a44'),
    pave = C('#dfcca5'), pave2 = C('#cdb38c'), sand = C('#eadaa9'), rock = C('#bba88b'), bed = C('#6fa5a0');
  const c = new THREE.Color(), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), ny = n.getY(i), y = p.getY(i);
    const d = landDist(x, z);
    c.copy(grass).lerp(grass2, fbm(x * 0.012, z * 0.012, 3));
    c.lerp(hill, (P ? smooth(20, 70, y) : smooth(150, 480, d)) * 0.65);
    c.lerp(dry, smooth(0.55, 0.75, vnoise(x * 0.004 + 3, z * 0.004)) * 0.6);
    c.lerp(wood, smooth(0.5, 0.62, fbm(x * 0.006 + 40, z * 0.006, 3)) * 0.7);
    // terraces and field strips following the contours
    const terr = (P ? 0.5 : 1) * smooth(20, 90, d) * (1 - smooth(0.55, 0.7, fbm(x * 0.005 - 20, z * 0.005, 2)));
    const band = Math.sin(d * 0.16 + fbm(x * 0.01, z * 0.01, 2) * 6);
    c.lerp(band > 0.55 ? dry : grass2, terr * 0.4 * smooth(0.3, 0.6, Math.abs(band)));
    const tw = townW(x, z);
    t.copy(pave).lerp(pave2, vnoise(x * 0.3, z * 0.3) * 0.6);
    c.lerp(t, smooth(0.35, 0.6, tw));
    if (tw < 0.5 && !P) c.lerp(sand, smooth(7, 1.5, d));
    c.lerp(rock, smooth(0.28, 0.5, 1 - ny));
    if (d < -0.5) c.copy(bed);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, toonMat({ vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ---------------------------------------------------------------- sea

const WATER_GLSL = {
  harbour: /* glsl */`
    float shoreZ(float x) { float t = abs(x) / 260.0; return min(40.0 * t * t, 420.0) + 6.0 * sin(x * 0.03); }
    float waterIn(vec2 p) { return p.y - shoreZ(p.x); }
    float obstacle(vec2 p) { return min(segDist(p, uMoleA, uMoleB) - 4.3, length(p - uMoleB) - 7.0); }`,
  prague: /* glsl */`
    float riverZ(float x) { return 34.0 * sin(x * 0.0042 + 0.6) + 14.0 * sin(x * 0.0105 + 2.0); }
    float waterIn(vec2 p) { return ${RIVER_HW.toFixed(1)} - abs(p.y - riverZ(p.x)); }
    float obstacle(vec2 p) {
      // Charles Bridge piers, and the weir upstream
      float d = 1e5;
      float rz = riverZ(0.0);
      for (int i = 0; i < 4; i++) {
        float pz = rz - 58.0 + 19.2 + 2.5 + float(i) * 24.2;
        d = min(d, max(abs(p.x) - 5.2, abs(p.y - pz) - 2.8));
      }
      d = min(d, segDist(p, vec2(-380.0, riverZ(-380.0) - 60.0), vec2(-320.0, riverZ(-320.0) + 60.0)) - 1.5);
      return d;
    }`,
};

function sea(scene, W) {
  const P = CITY === 'prague';
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: SUN },
      uShallow: { value: new THREE.Color(P ? '#5aa9a0' : '#4cbcb4') },
      uDeep: { value: new THREE.Color(P ? '#3b7d8c' : '#2266a3') },
      uSky: { value: new THREE.Color('#bcd7ee') },
      uFoam: { value: new THREE.Color('#f7fbf8') },
      uHaze: { value: HAZE_SEA },
      uFogD: { value: FOG_DENSITY },
      uMoleA: { value: MOLE_A }, uMoleB: { value: MOLE_B },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFogD;
      uniform vec3 uSun, uShallow, uDeep, uSky, uFoam, uHaze;
      uniform vec2 uMoleA, uMoleB;
      varying vec3 vW;
      ${NOISE_GLSL}
      float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      ${WATER_GLSL[CITY]}
      void main() {
        vec2 p = vW.xz; float t = uTime;
        float d = waterIn(p);
        vec3 c = mix(uShallow, uDeep, smoothstep(0.0, ${P ? '50.0' : '170.0'}, d + (vn(p * 0.02) - 0.5) * ${P ? '14.0' : '50.0'}));

        // painted ripple strokes, drifting
        float r1 = vn(vec2(p.x * 0.07 + t * 0.25, p.y * 0.32 - t * 0.18));
        float r2 = vn(vec2(p.x * 0.045 - t * 0.12, p.y * 0.2 + t * 0.09) + 31.0);
        float r = r1 * r2;
        c = mix(c, c * 1.18 + 0.03, smoothstep(0.5, 0.53, r));
        c = mix(c, c * 0.9, smoothstep(0.1, 0.07, r));

        vec3 V = normalize(cameraPosition - vW);
        c = mix(c, uSky, pow(1.0 - max(V.y, 0.0), 5.0) * 0.55);

        // sun glint: painted sparkles in the reflection path
        vec3 N = normalize(vec3((vn(p * 0.35 + t * 0.8) - 0.5) * 0.3, 1.0, (vn(p * 0.35 - t * 0.9 + 7.0) - 0.5) * 0.3));
        float s = max(dot(reflect(-V, N), uSun), 0.0);
        float glint = smoothstep(0.975, 0.985, s) * step(0.55, vn(p * 0.8 + t * 1.6));
        c += vec3(2.2, 2.1, 1.8) * glint;

        // foam where the water meets the shore and the harbour mole
        float wob = (vn(vec2(vW.x * 0.12, t * 0.5)) - 0.5) * 2.0;
        float foamShore = smoothstep(2.6, 0.8, d + wob);
        float dm = obstacle(p);
        float foamMole = smoothstep(1.8, 0.4, dm + wob * 0.6);
        float foam = max(foamShore, foamMole) * step(0.32, vn(vec2(p.x * 0.35 + t * 0.6, p.y * 0.35 - t * 0.3)));
        c = mix(c, uFoam, foam);

        float dist = length(cameraPosition - vW);
        c = mix(c, uHaze, 1.0 - exp(-pow(dist * uFogD * 0.9, 2.0)));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  W.updaters.push((t, dt, { camera }) => {
    mat.uniforms.uTime.value = t;
    mesh.position.set(Math.round(camera.position.x / 50) * 50, 0, Math.round(camera.position.z / 50) * 50);
  });
}

// ---------------------------------------------------------------- houses

const WALLS = ['#f3e6ca', '#efd6a3', '#f1c7ae', '#e8b797', '#d3e5d5', '#f6eedf', '#e9d0c0', '#dbe7ea', '#f1dc9f', '#f4dcc9', '#e6e0cf'];
const ROOFS = ['#c9623d', '#b9553a', '#d47548', '#a84a34', '#c56a48', '#d0825a'];
const SHUTTERS = ['#4f8069', '#5a7fa8', '#3f6f8b', '#8b6a40', '#6c8f4e', '#9a4e46'];
const AWNINGS = ['#c9423a', '#3c6fa8', '#3f8a63', '#d08a2e', '#7c4a8c'];

export function gableGeo(span, rh, len, alongX) {
  const s = new THREE.Shape();
  s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, rh); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  if (alongX) g.rotateY(Math.PI / 2);
  return g;
}

export function addHouse(B, W, R, o) {
  const gy = o.gy ?? groundH(o.x, o.z);
  const bottom = gy - 4, top = gy + o.h;
  const H = M(o.x, 0, o.z, 0, o.ry, 0);
  const L = (x, y, z, rx, ry, rz, sx, sy, sz) => H.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz));
  const wall = o.wall ?? pick(R, WALLS);
  const roof = o.roof ?? (R() < 0.08 ? '#6f8193' : pick(R, ROOFS));

  B.add(BOX, L(0, (top + bottom) / 2, 0, 0, 0, 0, o.w, top - bottom, o.dp), wall);

  // pitched roof: gable ends in wall colour, two terracotta slabs, a ridge cap
  const P = o.prague;
  const alongX = o.ridgeX ?? R() < 0.7;
  const span = alongX ? o.dp : o.w, len = alongX ? o.w : o.dp;
  const rh = span * 0.5 * (P ? 0.95 + R() * 0.35 : 0.55 + R() * 0.25);
  const ov = 0.55, ovL = o.baroque ? 0.2 : ov;
  B.add(gableGeo(span, rh, len, alongX), L(0, top, 0), wall);
  const a = Math.atan2(rh, span / 2);
  const run = span / 2 + ov;
  const slabLen = run / Math.cos(a);
  const midDrop = rh - (run / 2) * Math.tan(a);
  const up = 0.14;
  for (const side of [1, -1]) {
    const off = run / 2 * side;
    if (alongX) B.add(BOX, L(0, top + midDrop + up, off, a * side, 0, 0, len + 2 * ovL, 0.28, slabLen), roof);
    else B.add(BOX, L(off, top + midDrop + up, 0, 0, 0, -a * side, slabLen, 0.28, len + 2 * ovL), roof);
  }
  const cap = o.cap ?? '#8f3f2c';
  if (alongX) B.add(BOX, L(0, top + rh + 0.2, 0, 0, 0, 0, len + 2 * ovL, 0.3, 0.45), cap);
  else B.add(BOX, L(0, top + rh + 0.2, 0, 0, 0, 0, 0.45, 0.3, len + 2 * ovL), cap);

  if (P) pragueFront(B, R, L, o, gy, top, rh, span, alongX, wall, roof);

  // chimney
  if (R() < (P ? 0.4 : 0.75)) {
    const cx = alongX ? (R() - 0.5) * o.w * 0.6 : (R() < 0.5 ? -1 : 1) * o.w * 0.2;
    const cz = alongX ? (R() < 0.5 ? -1 : 1) * o.dp * 0.2 : (R() - 0.5) * o.dp * 0.6;
    const ctop = top + rh + 1.0;
    B.add(BOX, L(cx, (top + ctop) / 2, cz, 0, 0, 0, 0.8, ctop - top, 0.8), R() < 0.5 ? wall : '#b3664b');
    B.add(CYL6, L(cx, ctop + 0.25, cz, 0, 0, 0, 0.18, 0.5, 0.18), '#6e4a3c');
    if (R() < 0.07) W.smokeSources.push(new V3(cx, ctop + 0.6, cz).applyMatrix4(H));
  }
  if (!P && R() < 0.3) {
    const ax = (R() - 0.5) * o.w * 0.5, ay = top + rh;
    B.add(BOX, L(ax, ay + 1.1, 0, 0, 0, 0, 0.07, 2.4, 0.07), '#55545a');
    B.add(BOX, L(ax, ay + 1.9, 0, 0, R() * 3, 0, 1.4, 0.06, 0.06), '#55545a');
    B.add(BOX, L(ax, ay + 2.2, 0, 0, R() * 3, 0, 0.9, 0.06, 0.06), '#55545a');
  }

  // facades
  const shutter = R() < 0.5 ? pick(R, SHUTTERS) : null;
  const flowers = R() < 0.55;
  const faces = [
    { fx: 0, fz: o.dp / 2, ry: 0, w: o.w, front: true, p: 1 },
    { fx: 0, fz: -o.dp / 2, ry: Math.PI, w: o.w, p: P ? 0 : 0.75 },
    { fx: o.w / 2, fz: 0, ry: Math.PI / 2, w: o.dp, p: P ? 0 : 0.3 },
    { fx: -o.w / 2, fz: 0, ry: -Math.PI / 2, w: o.dp, p: P ? 0 : 0.3 },
  ];
  for (const f of faces) {
    if (R() > f.p) continue;
    const cs = Math.cos(f.ry), sn = Math.sin(f.ry);
    const at = (u, y, out, sx, sy, sz, color) =>
      B.add(BOX, L(f.fx + u * cs + out * sn, y, f.fz - u * sn + out * cs, 0, f.ry, 0, sx, sy, sz), color);
    const cols = Math.max(1, Math.floor(f.w / 2.6));
    const sp = f.w / cols;
    for (let s = 0; ; s++) {
      const y = gy + 1.7 + s * 3.1;
      if (y + 1.0 > top - 0.2) break;
      for (let ci = 0; ci < cols; ci++) {
        const u = -f.w / 2 + sp * (ci + 0.5);
        if (f.front && s === 0) {
          if (o.shop) continue;
          if (ci === Math.floor(cols / 2)) {
            at(u, gy + 1.15, 0.05, 1.25, 2.3, 0.25, '#6d4a33');
            at(u, gy + 2.45, 0.05, 1.5, 0.25, 0.3, '#f3ecdc');
            continue;
          }
        }
        if (P) {
          // flat painted windows keep the Prague blocks light; a pediment on the first floor
          B.add(PLANE, L(f.fx + u * cs + 0.03 * sn, y, f.fz - u * sn + 0.03 * cs, 0, f.ry, 0, 1.25, 1.8, 1), o.trim ?? '#f5efe2');
          B.add(PLANE, L(f.fx + u * cs + 0.05 * sn, y, f.fz - u * sn + 0.05 * cs, 0, f.ry, 0, 0.92, 1.45, 1), '#46586e');
          if (s === 1) at(u, y + 1.1, 0.1, 1.55, 0.25, 0.3, o.trim ?? '#f5efe2');
          continue;
        }
        if (s > 0 || f.front) {
          at(u, y, 0.02, 1.2, 1.6, 0.2, '#f6f0e3');
          at(u, y, 0.06, 0.9, 1.3, 0.2, '#445a72');
          if (shutter && f.p > 0.5) { at(u - 0.78, y, 0.07, 0.42, 1.4, 0.12, shutter); at(u + 0.78, y, 0.07, 0.42, 1.4, 0.12, shutter); }
          if (flowers && f.front && s > 0 && R() < 0.55) {
            at(u, y - 0.82, 0.25, 1.15, 0.28, 0.4, '#8a5a3a');
            at(u, y - 0.6, 0.27, 1.05, 0.26, 0.34, pick(R, ['#e0403a', '#e8506a', '#d93a3a', '#f07a8a']));
          }
          if (f.front && s > 0 && s < 3 && R() < 0.1) {
            at(u, y - 0.95, 0.55, 1.8, 0.14, 1.0, '#e9e1cf');
            at(u, y - 0.45, 1.0, 1.8, 0.9, 0.08, '#4d4f58');
          }
        }
      }
    }
  }

  // shopfront with a striped awning
  if (o.shop && P) {
    const fz = o.dp / 2;
    B.add(BOX, L(0, gy + 1.5, fz + 0.03, 0, 0, 0, o.w * 0.7, 2.3, 0.2), '#5a4636');
    B.add(PLANE, L(0, gy + 1.6, fz + 0.14, 0, 0, 0, o.w * 0.6, 1.9, 1), '#50657c');
  } else if (o.shop) {
    const fz = o.dp / 2;
    B.add(BOX, L(-o.w * 0.12, gy + 1.5, fz + 0.03, 0, 0, 0, o.w * 0.55, 2.0, 0.2), '#f6f0e3');
    B.add(BOX, L(-o.w * 0.12, gy + 1.5, fz + 0.07, 0, 0, 0, o.w * 0.5, 1.8, 0.2), '#50657c');
    B.add(BOX, L(o.w * 0.3, gy + 1.15, fz + 0.05, 0, 0, 0, 1.2, 2.3, 0.25), '#6d4a33');
    const ac = o.awning ?? pick(R, AWNINGS);
    const n = Math.max(4, Math.round(o.w / 0.9));
    for (let i = 0; i < n; i++) {
      const u = -o.w / 2 + (o.w / n) * (i + 0.5);
      B.add(BOX, L(u, gy + 3.05, fz + 0.75, 0.42, 0, 0, o.w / n + 0.01, 0.07, 1.65), i % 2 ? '#f7f1e4' : ac);
    }
  }

  if (!o.noCollide) {
    const box = new THREE.Box3(new V3(-o.w / 2, bottom, -o.dp / 2), new V3(o.w / 2, top + rh * 0.8, o.dp / 2)).applyMatrix4(H);
    W.colliders.push(box);
  }
  return { gy, top, H };
}

// Prague facade dressing: cornice, string course, a curved baroque gable or dormers.
function pragueFront(B, R, L, o, gy, top, rh, span, alongX, wall, roof) {
  const fz = o.dp / 2;
  const trim = o.trim ?? '#f5efe2';
  B.add(BOX, L(0, top - 0.15, fz + 0.12, 0, 0, 0, o.w + 0.1, 0.4, 0.45), trim);
  B.add(BOX, L(0, gy + 3.05, fz + 0.06, 0, 0, 0, o.w, 0.25, 0.25), trim);
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
    B.add(CYL, L(0, top + rh * 0.62, fz + 0.46, Math.PI / 2, 0, 0, 0.42, 0.08, 0.55), '#46586e');
    B.add(SPH, L(0, top + rh + 1.2, fz + 0.2, 0, 0, 0, 0.22, 0.22, 0.22), trim);
  } else if (alongX) {
    const n = o.w > 9 ? 2 : 1;
    const dz = span / 2 * 0.5, depth = span / 2 * 0.55;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i - 0.5) * o.w * 0.45;
      const y0 = top + rh * (1 - dz / (span / 2));
      B.add(BOX, L(u, y0 + 0.55, dz - depth / 2 + 0.1, 0, 0, 0, 1.4, 1.7, depth), wall);
      B.add(gableGeo(1.9, 0.8, depth + 0.3, false), L(u, y0 + 1.4, dz - depth / 2 + 0.2), roof);
      B.add(PLANE, L(u, y0 + 0.6, dz + 0.12, 0, 0, 0, 0.8, 1.0, 1), '#46586e');
    }
  }
}

function town(B, W, R) {
  const streets = [-128, -70, -8, 48, 112];
  let bakery = false;
  for (let r = 0; r < 13; r++) {
    const d0 = 16 + r * 15;
    const lim = 178 - r * 5;
    const list = [];
    let x = -lim + R() * 3;
    while (x < lim) {
      const w = 6 + R() * 4;
      const xc = x + w / 2;
      let skip = R() < 0.05;
      for (const s of streets) if (Math.abs(xc - (s + Math.sin(r * 1.3 + s) * 5)) < w / 2 + 2.6) skip = true;
      if (Math.abs(xc) < 28 && d0 > 70 && d0 < 128) skip = true;          // clock-tower square
      if (xc > -90 && xc < -32 && d0 > 122 && d0 < 170) skip = true;     // town hall
      if (skip) { x += 3; continue; }
      const dp = 8 + R() * 2;
      const zc = shoreZ(xc) - d0 - dp / 2;
      const slope = 80 * xc / 67600;
      const isBakery = !bakery && r === 1 && xc > 50;
      if (isBakery) bakery = true;
      const h = (r === 0 ? 10.5 : 8) + R() * 6 + (r < 3 ? 2 : 0);
      const res = addHouse(B, W, R, {
        x: xc, z: zc, ry: -Math.atan(slope), w, dp, h,
        shop: isBakery || (r === 0 && R() < 0.75) || (r > 0 && R() < 0.12),
        wall: isBakery ? '#cfe6dc' : undefined,
        awning: isBakery ? '#d0453c' : undefined,
        ridgeX: isBakery ? true : undefined,
      });
      if (isBakery) bakerySign(B, res.H, w, dp, res.gy);
      list.push({ x0: x, x1: x + w, dp, gy: res.gy, top: res.top });
      x += w + (R() < 0.3 ? 1 + R() * 2 : 0.3);
    }
    W.rows.push({ d0, list });
  }
}

function bakerySign(B, H, w, dp, gy) {
  const L = (x, y, z, rx, ry, rz, sx, sy, sz) => H.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz));
  const x = -w / 2 + 0.4, z = dp / 2 + 0.8;
  B.add(BOX, L(x, gy + 4.6, dp / 2 + 0.6, 0, 0, 0, 0.08, 0.08, 1.3), '#2f2a2a');
  B.add(BOX, L(x, gy + 4.35, z, 0, 0, 0, 0.03, 0.5, 0.03), '#2f2a2a');
  const pretzel = new THREE.TorusGeometry(0.42, 0.11, 6, 14);
  B.add(pretzel, L(x, gy + 3.7, z, 0, Math.PI / 2, 0), '#c98a3c');
  B.add(pretzel, L(x, gy + 3.55, z - 0.25, 0, Math.PI / 2, 0, 0.6, 0.6, 0.6), '#c98a3c');
  B.add(pretzel, L(x, gy + 3.55, z + 0.25, 0, Math.PI / 2, 0, 0.6, 0.6, 0.6), '#c98a3c');
}

// ---------------------------------------------------------------- landmarks

function landmarks(B, W, R, scene) {
  // the square: paving ring and a fountain
  const tx = TOWER.x, tz = TOWER.z, ty = groundH(tx, tz);
  TOWER.y = ty;
  B.add(CYL, M(tx + 14, ty + 0.4, tz + 12, 0, 0, 0, 3.2, 1.6, 3.2), '#d9ccb2');
  B.add(CYL, M(tx + 14, ty + 1.15, tz + 12, 0, 0, 0, 2.8, 0.1, 2.8), '#7cc3d6');
  B.add(CYL, M(tx + 14, ty + 2.0, tz + 12, 0, 0, 0, 0.35, 3, 0.35), '#d9ccb2');
  B.add(SPH, M(tx + 14, ty + 3.6, tz + 12, 0, 0, 0, 0.7, 0.4, 0.7), '#d9ccb2');

  // clock tower
  const stone = '#ecdcb8', trim = '#d8c39a';
  const shaft = 30;
  B.add(BOX, M(tx, ty + shaft / 2 - 3, tz, 0, 0, 0, 7, shaft + 6, 7), stone);
  B.add(BOX, M(tx, ty + 0.8, tz, 0, 0, 0, 8.2, 3, 8.2), trim);
  for (const yy of [11, shaft - 0.3]) B.add(BOX, M(tx, ty + yy, tz, 0, 0, 0, 7.8, 0.7, 7.8), trim);
  B.add(BOX, M(tx, ty + shaft + 3.5, tz, 0, 0, 0, 6.2, 7, 6.2), stone);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, sx = Math.sin(a), cz = Math.cos(a);
    // belfry openings
    B.add(BOX, M(tx + sx * 3.1, ty + shaft + 3.6, tz + cz * 3.1, 0, a, 0, 2.6, 4.2, 0.3), '#3b3a44');
    // clock faces
    B.add(CYL, M(tx + sx * 3.55, ty + 21.5, tz + cz * 3.55, Math.PI / 2, a, 0, 2.5, 0.2, 2.5), '#3a3f48');
    B.add(CYL, M(tx + sx * 3.62, ty + 21.5, tz + cz * 3.62, Math.PI / 2, a, 0, 2.2, 0.2, 2.2), '#fbf6e6');
    // tall windows
    B.add(BOX, M(tx + sx * 3.52, ty + 14.5, tz + cz * 3.52, 0, a, 0, 1.0, 3.4, 0.1), '#445a72');
  }
  B.add(BOX, M(tx, ty + shaft + 7.3, tz, 0, 0, 0, 7.2, 0.6, 7.2), trim);
  const spire = new THREE.ConeGeometry(4.9, 15, 4); spire.rotateY(Math.PI / 4);
  B.add(spire, M(tx, ty + shaft + 7.6 + 7.5, tz), '#5fa88c');
  B.add(SPH, M(tx, ty + shaft + 23, tz, 0, 0, 0, 0.5, 0.5, 0.5), '#e6c35a');
  B.add(BOX, M(tx, ty + shaft + 24.2, tz, 0, 0, 0, 0.08, 2, 0.08), '#3a3a3a');
  W.colliders.push(new THREE.Box3(new V3(tx - 4.2, ty - 3, tz - 4.2), new V3(tx + 4.2, ty + shaft + 18, tz + 4.2)));
  W.colliders.push(new THREE.Box3(new V3(tx - 1.5, ty + shaft + 18, tz - 1.5), new V3(tx + 1.5, ty + shaft + 24, tz + 1.5)));

  // live clock hands
  const hands = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const face = new THREE.Group();
    face.position.set(tx + Math.sin(a) * 3.78, ty + 21.5, tz + Math.cos(a) * 3.78);
    face.rotation.y = a;
    const hour = new THREE.Group(), minute = new THREE.Group();
    const hm = new THREE.Mesh(BOX, toon('#2c2c34')); hm.scale.set(0.22, 1.2, 0.08); hm.position.y = 0.5; hour.add(hm);
    const mm = new THREE.Mesh(BOX, toon('#2c2c34')); mm.scale.set(0.14, 1.85, 0.08); mm.position.set(0, 0.8, 0.05); minute.add(mm);
    face.add(hour, minute);
    scene.add(face);
    hands.push({ hour, minute });
  }
  W.updaters.push(() => {
    const d = new Date();
    const m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
    for (const hd of hands) { hd.hour.rotation.z = -h / 12 * Math.PI * 2; hd.minute.rotation.z = -m / 60 * Math.PI * 2; }
  });

  // town hall with a copper dome
  const hx = -60, hz = shoreZ(-60) - 150, hy = groundH(hx, hz), hry = -Math.atan(80 * hx / 67600);
  const HH = M(hx, 0, hz, 0, hry, 0);
  const L = (x, y, z, rx, ry, rz, sx, sy, sz) => HH.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz));
  B.add(BOX, L(0, hy + 5, 0, 0, 0, 0, 28, 18, 18), '#f1e5c8');
  B.add(BOX, L(0, hy + 14.2, 0, 0, 0, 0, 29, 0.8, 19), '#d9c49c');
  B.add(gableGeo(12, 3.2, 1.2, false), L(0, hy + 14.5, 9.2), '#f1e5c8');
  for (let i = 0; i < 6; i++) B.add(CYL, L(-5 + i * 2, hy + 7.5, 9.8, 0, 0, 0, 0.45, 13, 0.45), '#fbf4e2');
  B.add(BOX, L(0, hy + 0.9, 10.8, 0, 0, 0, 13, 1.2, 3), '#d9c49c');
  for (let i = 0; i < 5; i++) for (const s of [0, 1]) {
    const u = -12 + i * 6;
    if (Math.abs(u) < 7) continue;
    B.add(BOX, L(u, hy + 5 + s * 4.5, 9.05, 0, 0, 0, 1.4, 2.4, 0.2), '#445a72');
  }
  B.add(CYL, L(0, hy + 17, 0, 0, 0, 0, 6.5, 5, 6.5), '#f1e5c8');
  B.add(new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), L(0, hy + 19.4, 0), '#62a78c');
  B.add(CYL, L(0, hy + 26.8, 0, 0, 0, 0, 1.2, 2.2, 1.2), '#f1e5c8');
  B.add(new THREE.ConeGeometry(1.5, 2.2, 10), L(0, hy + 29, 0), '#62a78c');
  // weathervane
  B.add(BOX, L(0, hy + 31, 0, 0, 0, 0, 0.08, 2.2, 0.08), '#2f2f33');
  B.add(BOX, L(0.4, hy + 31.6, 0, 0, 0, 0, 1.6, 0.35, 0.05), '#2f2f33');
  W.colliders.push(new THREE.Box3(new V3(-14, hy - 4, -9), new V3(14, hy + 20, 11)).applyMatrix4(HH));
  W.colliders.push(new THREE.Box3(new V3(-7, hy + 20, -7), new V3(7, hy + 30, 7)).applyMatrix4(HH));
}

// ---------------------------------------------------------------- harbour

export function boatMesh(R, len, hullC, stripeC, opts = {}) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const w = len * 0.2;
  s.moveTo(-w, -len * 0.5); s.lineTo(w, -len * 0.5); s.lineTo(w * 1.08, len * 0.15);
  s.quadraticCurveTo(w * 0.9, len * 0.42, 0, len * 0.55); s.quadraticCurveTo(-w * 0.9, len * 0.42, -w * 1.08, len * 0.15); s.closePath();
  const hullH = len * 0.14;
  const hull = new THREE.ExtrudeGeometry(s, { depth: hullH, bevelEnabled: false, curveSegments: 6 });
  hull.rotateX(Math.PI / 2); hull.translate(0, hullH * 0.75, 0);
  const add = (geo, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, toon(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true; g.add(m); return m;
  };
  add(hull, hullC);
  const stripe = hull.clone(); add(stripe, stripeC, 0, hullH * 0.62, 0, 1.03, 0.14, 1.02);
  if (opts.steamer) {
    add(BOX, '#f5f0e4', 0, hullH * 0.75 + 1.2, len * 0.05, w * 1.5, 2.4, len * 0.42);
    add(BOX, '#f5f0e4', 0, hullH * 0.75 + 3.2, len * 0.1, w * 1.1, 1.6, len * 0.16);
    add(CYL, '#e7b73b', 0, hullH * 0.75 + 4.6, -len * 0.08, 0.9, 4.2, 0.9);
    add(CYL, '#262629', 0, hullH * 0.75 + 7.0, -len * 0.08, 0.93, 0.8, 0.93);
    for (let i = 0; i < 7; i++) add(CYL, '#445a72', w * 0.76, hullH * 0.75 + 1.3, len * (-0.1 + i * 0.04), 0.22, 0.05, 0.22).rotation.z = Math.PI / 2;
    add(CYL, '#8a6a40', 0, hullH * 0.75 + 5, len * 0.35, 0.12, 8, 0.12);
    g.userData.funnel = new V3(0, hullH * 0.75 + 7.5, -len * 0.08);
  } else if (opts.sail) {
    add(CYL, '#8a6a40', 0, hullH + len * 0.55, len * 0.05, 0.07, len * 1.1, 0.07);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, len * 1.0); sh.lineTo(len * 0.55, 0); sh.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), toon('#fbf7ee', { side: THREE.DoubleSide }));
    sail.rotation.y = Math.PI / 2; sail.position.set(0, hullH + 0.3, len * 0.05);
    g.add(sail);
  } else {
    add(BOX, '#f4efe2', 0, hullH * 0.75 + 0.7, len * 0.1, w * 1.1, 1.4, len * 0.25);
    add(BOX, stripeC, 0, hullH * 0.75 + 1.45, len * 0.1, w * 1.25, 0.15, len * 0.3);
    add(CYL, '#8a6a40', 0, hullH + len * 0.3, -len * 0.18, 0.06, len * 0.65, 0.06);
    if (R() < 0.6) {
      const flag = add(BOX, pick(R, ['#d0453c', '#3c6fa8', '#e7b73b']), 0.3, hullH + len * 0.6, -len * 0.18, 0.6, 0.35, 0.03);
      flag.rotation.y = Math.PI / 2;
    }
  }
  return g;
}

function harbour(B, W, R, scene) {
  // quay wall along the harbour front
  for (let x = -170; x < 170; x += 8) {
    const xc = x + 4, z = shoreZ(xc);
    const ry = -Math.atan(80 * xc / 67600);
    B.add(BOX, M(xc, -1.3, z - 0.6, 0, ry, 0, 8.3, 7, 3), '#c7b594');
    B.add(BOX, M(xc, 2.35, z - 0.6, 0, ry, 0, 8.3, 0.35, 3.3), '#e3d6b8');
    if (Math.floor(x / 8) % 2 === 0) B.add(CYL, M(xc, 2.9, z - 1.3, 0, 0, 0, 0.28, 0.8, 0.28), '#3e3c42');
  }
  // the mole and its lighthouse
  const dx = MOLE_B.x - MOLE_A.x, dz = MOLE_B.y - MOLE_A.y, len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const MH = M((MOLE_A.x + MOLE_B.x) / 2, 0, (MOLE_A.y + MOLE_B.y) / 2, 0, ry, 0);
  B.add(BOX, MH.clone().multiply(M(0, -0.4, 0, 0, 0, 0, 8.4, 5.4, len)), '#c2b08f');
  B.add(BOX, MH.clone().multiply(M(0, 2.4, 0, 0, 0, 0, 8.6, 0.35, len)), '#e0d3b5');
  B.add(BOX, MH.clone().multiply(M(3.6, 3.1, 0, 0, 0, 0, 1.2, 1.2, len)), '#d4c4a3');
  W.colliders.push(new THREE.Box3(new V3(-4.5, -3, -len / 2), new V3(4.5, 3.8, len / 2)).applyMatrix4(MH));
  const lx = MOLE_B.x, lz = MOLE_B.y;
  B.add(CYL, M(lx, -0.3, lz, 0, 0, 0, 7.2, 5.6, 7.2), '#c2b08f');
  B.add(CYL, M(lx, 2.55, lz, 0, 0, 0, 7.4, 0.3, 7.4), '#e0d3b5');
  const bands = 6, bh = 3;
  for (let i = 0; i < bands; i++) {
    const r0 = 2.6 - i * 0.16;
    B.add(new THREE.CylinderGeometry(r0 - 0.16, r0, bh, 16), M(lx, 2.7 + bh * (i + 0.5), lz), i % 2 ? '#fbf6ea' : '#cf4a3c');
  }
  const top = 2.7 + bands * bh;
  B.add(CYL, M(lx, top + 0.2, lz, 0, 0, 0, 2.5, 0.4, 2.5), '#2f3036');
  B.add(CYL, M(lx, top + 1.5, lz, 0, 0, 0, 1.35, 2.2, 1.35), '#fff2b8');
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; B.add(BOX, M(lx + Math.cos(a) * 1.35, top + 1.5, lz + Math.sin(a) * 1.35, 0, -a, 0, 0.12, 2.2, 0.12), '#2f3036'); }
  B.add(new THREE.ConeGeometry(1.7, 1.6, 16), M(lx, top + 3.4, lz), '#cf4a3c');
  B.add(SPH, M(lx, top + 4.3, lz, 0, 0, 0, 0.25, 0.25, 0.25), '#2f3036');
  W.colliders.push(new THREE.Box3(new V3(lx - 3, 0, lz - 3), new V3(lx + 3, top + 4.5, lz + 3)));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 1.8) }));
  lamp.position.set(lx, top + 1.5, lz);
  scene.add(lamp);

  // quayside: crates, a crane, bollards
  const crateC = ['#b5854f', '#9c6f40', '#c49a5e', '#6f8a9c'];
  for (let i = 0; i < 26; i++) {
    const x = -95 + R() * 70, d = 4 + R() * 7;
    const z = shoreZ(x) - d, y = groundH(x, z);
    const s = 1 + R() * 0.4, st = R() < 0.4 ? 2 : 1;
    for (let k = 0; k < st; k++) B.add(BOX, M(x, y + s * (k + 0.5), z, 0, R() * 0.4, 0, s, s, s), pick(R, crateC));
  }
  {
    const x = -62, z = shoreZ(-62) - 6, y = groundH(x, z);
    B.add(BOX, M(x, y + 7, z, 0, 0, 0, 1.6, 14, 1.6), '#e39a2f');
    B.add(BOX, M(x, y + 14.6, z, 0, 0, 0, 2.6, 2, 2.6), '#e39a2f');
    B.add(BOX, M(x, y + 16.5, z + 6, -0.25, 0, 0, 0.9, 0.9, 17), '#e39a2f');
    B.add(BOX, M(x, y + 14.2, z + 13, 0, 0, 0, 0.05, 6, 0.05), '#2f2f33');
    B.add(BOX, M(x, y + 11, z + 13, 0, 0, 0, 1.2, 0.5, 1.2), '#3e3c42');
    W.colliders.push(new THREE.Box3(new V3(x - 1.5, y, z - 1.5), new V3(x + 1.5, y + 16, z + 1.5)));
  }

  // boats that bob
  const boats = [];
  const place = (g, x, z, ry, amp) => { g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); boats.push({ g, amp, ph: R() * 10, ry }); };
  const steamer = boatMesh(R, 28, '#243552', '#c8443a', { steamer: true });
  place(steamer, -110, shoreZ(-110) + 9, Math.PI / 2 - 0.15, 0.1);
  W.colliders.push(new THREE.Box3().setFromObject(steamer));
  W.steamerSmoke = W.smokeSources.length;
  W.smokeSources.push(steamer.localToWorld(steamer.userData.funnel.clone()));
  const hulls = ['#f4f1e8', '#3c6fa8', '#d0453c', '#f0d67c', '#4f8a6c'];
  for (let i = 0; i < 9; i++) {
    const x = -70 + i * 11 + R() * 5, z = shoreZ(x) + 14 + R() * 45;
    place(boatMesh(R, 7 + R() * 4, pick(R, hulls), pick(R, ['#d0453c', '#2c4f7c', '#e7b73b', '#f4f1e8'])), x, z, R() * 6.28, 0.25);
  }
  place(boatMesh(R, 9, '#f4f1e8', '#3c6fa8', { sail: true }), 180, 420, 0.6, 0.4);
  place(boatMesh(R, 8, '#f4f1e8', '#d0453c', { sail: true }), -260, 560, -0.9, 0.4);
  const drift = boats.slice(-2);
  W.updaters.push((t, dt) => {
    for (const b of boats) {
      b.g.position.y = Math.sin(t * 1.1 + b.ph) * b.amp;
      b.g.rotation.z = Math.sin(t * 0.8 + b.ph) * b.amp * 0.15;
      b.g.rotation.x = Math.sin(t * 0.63 + b.ph * 2) * b.amp * 0.08;
    }
    for (const b of drift) {
      b.g.position.x += Math.sin(b.ry) * dt * 1.2;
      b.g.position.z += Math.cos(b.ry) * dt * 1.2;
    }
  });
}

function farVillage(B, W, R) {
  // a small village up on the western headland, across the bay
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 7; i++) {
      const x = -610 + i * 13 + R() * 5 + r * 4, d = 18 + r * 16 + R() * 4;
      const z = shoreZ(x) - d;
      const slope = -80 * Math.abs(x) / 67600;
      addHouse(B, W, R, { x, z, ry: -Math.atan(slope), w: 6 + R() * 3, dp: 7 + R() * 2, h: 6 + R() * 4 });
    }
  }
  const x = -585, z = shoreZ(x) - 70, y = groundH(x, z);
  B.add(BOX, M(x, y + 4, z, 0, 0.6, 0, 8, 12, 14), '#fbf7ee');
  B.add(BOX, M(x, y + 9, z + 7, 0, 0.6, 0, 3.5, 18, 3.5), '#fbf7ee');
  const sp = new THREE.ConeGeometry(2.6, 6, 4); sp.rotateY(Math.PI / 4);
  B.add(sp, M(x, y + 21, z + 7, 0, 0.6, 0), '#c9623d');
  B.add(gableGeo(8, 3, 14, false), M(x, y + 10, z, 0, 0.6, 0), '#c9623d');
}

// ---------------------------------------------------------------- trees

function trees(scene, R) {
  const olive = [];
  const canopy = [[0, 0, 0, 1.3], [0.9, 0.3, 0.3, 1.0], [-0.8, 0.2, -0.4, 1.05], [0.1, 0.8, -0.2, 0.9]];
  const parts = canopy.map(([x, y, z, s]) => new THREE.IcosahedronGeometry(s, 1).translate(x, y, z));
  const oliveGeo = mergeSimple(parts).translate(0, 3.2, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 3, 6).translate(0, 1.5, 0);
  const cypGeo = new THREE.IcosahedronGeometry(1, 1).scale(1.1, 5.2, 1.1).translate(0, 5, 0);
  const cyp = [];
  for (let tries = 0; tries < 60000 && (olive.length < 2200 || cyp.length < 600); tries++) {
    const x = (R() - 0.5) * 2400, z = CITY === 'prague' ? (R() - 0.5) * 2400 : -R() * 1300 + 400;
    const d = landDist(x, z);
    if (d < 10) continue;
    const tw = townW(x, z);
    if (tw > 0.05) continue;
    if (CITY !== 'prague' && x < -520 && x > -660 && d < 110) continue;       // the far village
    const y = groundH(x, z);
    const dens = fbm(x * 0.008 + 5, z * 0.008, 3);
    if (dens < 0.42) continue;
    const slope = Math.abs(groundH(x + 3, z) - y) + Math.abs(groundH(x, z + 3) - y);
    if (slope > 3.5) continue;
    if (R() < 0.3 && cyp.length < 600) cyp.push([x, y, z, 1.1 + R() * 0.7]);
    else if (olive.length < 2200) olive.push([x, y, z, 2.2 + R() * 2]);
  }
  // a few cypresses by the square and the town hall
  if (CITY !== 'prague') for (const [x, dd] of [[-30, 95], [30, 95], [-30, 115], [-90, 145], [-32, 150], [150, 40], [-150, 40]]) {
    const z = shoreZ(x) - dd; cyp.push([x, groundH(x, z), z, 0.9]);
  }
  const inst = (geo, list, color, jitter) => {
    const m = new THREE.InstancedMesh(geo, toonMat({ color: '#ffffff' }), list.length);
    const c = new THREE.Color(), base = new THREE.Color(color);
    list.forEach(([x, y, z, s], i) => {
      m.setMatrixAt(i, M(x, y - 0.3, z, 0, (i * 2.39) % 6.28, 0, s, s * (0.9 + (i % 5) * 0.05), s));
      c.copy(base).offsetHSL(((i * 37) % 11 - 5) * 0.006 * jitter, 0, ((i * 53) % 9 - 4) * 0.012 * jitter);
      m.setColorAt(i, c);
    });
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  inst(oliveGeo, olive, '#7f9b55', 1);
  inst(trunkGeo, olive, '#7a5c43', 0);
  inst(cypGeo, cyp, '#3f6b3f', 1);
}

function mergeSimple(geos) {
  const b = new Bucket();
  for (const g of geos) b.add(g, null, '#ffffff');
  const geo = b.mesh(null).geometry;
  geo.deleteAttribute('color');
  return geo;
}

// ---------------------------------------------------------------- clouds

function clouds(scene, W, R) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: SUN },
      uLit: { value: new THREE.Color(1.12, 1.1, 1.06) },
      uMid: { value: new THREE.Color('#e3eaf5') },
      uShade: { value: new THREE.Color('#a2b6da') },
      uHaze: { value: HAZE }, uFogD: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uLit, uMid, uShade, uHaze; uniform float uFogD;
      varying vec3 vN; varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(vN);
        float k = (dot(n, uSun) * 0.5 + 0.5) * 0.6 + (n.y * 0.5 + 0.5) * 0.4 + (vn(vW.xz * 0.06 + vW.y * 0.05) - 0.5) * 0.14;
        vec3 c = mix(uShade, uMid, smoothstep(0.38, 0.44, k));
        c = mix(c, uLit, smoothstep(0.6, 0.66, k));
        float dist = length(cameraPosition - vW);
        c = mix(c, uHaze, (1.0 - exp(-pow(dist * uFogD * 0.75, 2.0))) * 0.9);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const group = new THREE.Group();
  const spots = [
    [40, 125, -70, 42], [-150, 100, 40, 34], [230, 140, -240, 58], [-330, 150, -300, 62], [130, 90, 250, 36],
    [-70, 165, 380, 54], [440, 125, 120, 52], [-470, 120, -60, 48], [300, 175, 460, 70], [-260, 110, 520, 46],
  ];
  for (let i = 0; i < 18; i++) {
    const a = R() * Math.PI * 2, rr = 450 + R() * 750;
    spots.push([Math.cos(a) * rr, 110 + R() * 110, Math.sin(a) * rr * 0.9 + 50, 40 + R() * 45]);
  }
  for (const [cx, cy, cz, S] of spots) {
    const b = new Bucket();
    const add = (x, y, z, r, sy = 1) => {
      b.add(SPH, M(x, y, z, 0, 0, 0, r, r * sy, r), '#ffffff');
      W.puffs.push({ c: new V3(cx + x, cy + y, cz + z), r: r * 0.85 });
    };
    const n1 = 7 + Math.floor(R() * 5);
    for (let i = 0; i < n1; i++) {
      const a = R() * Math.PI * 2, rad = S * Math.sqrt(R());
      add(Math.cos(a) * rad, 0, Math.sin(a) * rad * 0.7, S * (0.3 + R() * 0.2), 0.6);
    }
    const n2 = 5 + Math.floor(R() * 4);
    for (let i = 0; i < n2; i++) {
      const a = R() * Math.PI * 2, rad = S * 0.5 * Math.sqrt(R());
      add(Math.cos(a) * rad, S * (0.3 + R() * 0.15), Math.sin(a) * rad * 0.7, S * (0.3 + R() * 0.18));
    }
    const n3 = 2 + Math.floor(R() * 3);
    for (let i = 0; i < n3; i++) {
      const a = R() * Math.PI * 2, rad = S * 0.25 * R();
      add(Math.cos(a) * rad, S * (0.62 + R() * 0.2), Math.sin(a) * rad * 0.7, S * (0.22 + R() * 0.12));
    }
    const m = b.mesh(mat);
    m.position.set(cx, cy, cz);
    group.add(m);
  }
  scene.add(group);
  W.hideInNormals.push(group);
  W.cloudGroup = group;
  W.updaters.push((t, dt) => { group.position.x += dt * 0.5; });
}

// ---------------------------------------------------------------- gulls

function gulls(scene, W, R) {
  const b = new Bucket();
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.18, 0.75, 0.25, 0.05,  0, 0, 0.18, 0, 0, -0.12, -0.75, 0.25, 0.05], 3));
  wing.computeVertexNormals();
  b.add(wing, null, '#ffffff');
  b.add(BOX, M(0, -0.02, 0, 0, 0, 0, 0.12, 0.1, 0.5), '#ffffff');
  const geo = b.mesh(null).geometry; geo.deleteAttribute('color');
  const N = 55;
  const m = new THREE.InstancedMesh(geo, toonMat({ color: '#fbfbf7', side: THREE.DoubleSide }), N);
  m.frustumCulled = false;
  const g = [];
  for (let i = 0; i < N; i++) {
    const near = i < 35;
    g.push({
      c: near ? (CITY === 'prague' ? new V3(-300 + R() * 600, 10 + R() * 35, 0) : new V3(-120 + R() * 240, 12 + R() * 45, shoreZ(0) - 60 + R() * 130)) : new V3((R() - 0.5) * 700, 20 + R() * 60, (R() - 0.3) * 600),
      rad: 12 + R() * 40, w: (0.15 + R() * 0.2) * (R() < 0.5 ? -1 : 1), ph: R() * 100, off: new V3(), vel: new V3(),
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
      p.set(G.c.x + Math.cos(a) * G.rad, G.c.y + Math.sin(a * 1.7) * 3, G.c.z + Math.sin(a) * G.rad).add(G.off);
      const dx = p.x - rider.x, dy = p.y - rider.y, dz = p.z - rider.z, dd = Math.hypot(dx, dy, dz);
      if (dd < 16) { G.vel.x += dx / dd * 30 * dt; G.vel.y += (dy / dd + 0.6) * 30 * dt; G.vel.z += dz / dd * 30 * dt; scattered++; }
      G.off.addScaledVector(G.vel, dt);
      G.vel.multiplyScalar(Math.exp(-dt * 1.5));
      G.off.multiplyScalar(Math.exp(-dt * 0.08));
      const heading = Math.atan2(-Math.sin(a) * Math.sign(G.w) + G.vel.x * 0.1, Math.cos(a) * Math.sign(G.w) + G.vel.z * 0.1);
      const busy = G.vel.lengthSq() > 4 || Math.sin(t * 0.45 + G.ph) > 0.3;
      const flap = busy ? Math.sin(t * 11 + G.ph) : 0.35 + Math.sin(t * 2 + G.ph) * 0.1;
      e.set(0, heading, -Math.sign(G.w) * 0.35, 'YXZ');
      mat.compose(p, q.setFromEuler(e), s.set(1.3, 1.3 * flap, 1.3));
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    W.gullScatter = scattered;
  });
}

// ---------------------------------------------------------------- smoke

function smoke(scene, W, R) {
  const N = 90;
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), toonMat({ color: '#f1efea' }), N);
  m.frustumCulled = false;
  scene.add(m);
  W.hideInNormals.push(m);
  const src = W.smokeSources;
  if (!src.length) return;
  const puffs = [];
  for (let i = 0; i < N; i++) puffs.push({ s: i % src.length, age: R() * 7, life: 6 + R() * 2, j: new V3(R() - 0.5, 0, R() - 0.5) });
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new V3(), s = new V3();
  W.updaters.push((t, dt) => {
    for (let i = 0; i < N; i++) {
      const P = puffs[i];
      P.age += dt;
      if (P.age > P.life) { P.age = 0; P.s = Math.floor(R() * src.length); }
      const k = P.age / P.life;
      const big = P.s === W.steamerSmoke ? 2.2 : 1;   // the steamer puffs harder
      p.copy(src[P.s]).add({ x: P.j.x * 2 + P.age * 1.4, y: P.age * 1.3 * big, z: P.j.z * 2 + P.age * 0.3 });
      const sc = (0.25 + k * 1.2) * big * Math.sin(Math.min(1, k * 1.2) * Math.PI) + 0.01;
      mat.compose(p, q, s.set(sc, sc * 0.8, sc));
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- laundry

function laundry(scene, W, R) {
  const lines = [];
  const houseAt = (row, x) => row.list.find((h) => x > h.x0 + 0.8 && x < h.x1 - 0.8);
  for (let r = 0; r < W.rows.length - 1; r++) {
    const A = W.rows[r], Bn = W.rows[r + 1];
    for (const h of A.list) {
      if (R() > 0.28) continue;
      const x = h.x0 + 1 + R() * (h.x1 - h.x0 - 2);
      const hb = houseAt(Bn, x);
      if (!hb) continue;
      const y = Math.min(h.top, hb.gy + 3) - 1.2 - R() * 2;
      if (y < hb.gy + 2.4) continue;
      const z1 = shoreZ(x) - A.d0 - h.dp + 0.3, z2 = shoreZ(x) - Bn.d0 - 0.3;
      if (z1 - z2 < 1.5) continue;
      lines.push({ a: new V3(x, y, z1), b: new V3(x, y, z2) });
    }
  }
  const lineMesh = new Bucket();
  const sheets = [];
  const colors = ['#ffffff', '#fbf7ee', '#dfe9f5', '#f6dce1', '#f4ecc8', '#ffffff', '#cfe0d6'];
  for (const L of lines) {
    const len = L.a.distanceTo(L.b), mid = L.a.clone().add(L.b).multiplyScalar(0.5);
    lineMesh.add(BOX, M(mid.x, mid.y, mid.z, 0, 0, 0, 0.04, 0.04, len), '#4a4a50');
    const n = Math.floor(len / 1.3);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const shirt = R() < 0.4;
      sheets.push({ p: L.a.clone().lerp(L.b, u), w: shirt ? 0.7 : 1.0 + R() * 0.2, h: shirt ? 0.8 : 1.2 + R() * 0.4, ph: R() * 6, c: pick(R, colors) });
    }
  }
  if (!lines.length) return;
  const lm = lineMesh.mesh(toonMat({ vertexColors: true }));
  scene.add(lm);
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const m = new THREE.InstancedMesh(geo, toonMat({ color: '#ffffff', side: THREE.DoubleSide }), sheets.length);
  m.castShadow = true;
  const c = new THREE.Color();
  sheets.forEach((s, i) => m.setColorAt(i, c.set(s.c)));
  scene.add(m);
  // lines run along z, so the sheets face x and swing about the line
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3();
  W.updaters.push((t) => {
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i];
      const sway = Math.sin(t * 1.9 + s.ph) * 0.22 + Math.sin(t * 4.7 + s.ph * 2) * 0.06 + 0.12;
      e.set(sway, Math.PI / 2, 0, 'YXZ');
      mat.compose(s.p, q.setFromEuler(e), sc.set(s.w, s.h, 1));
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
  });
}
