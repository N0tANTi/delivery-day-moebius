import * as THREE from 'three';
import { toon, toonMat } from './toon.js';

const V3 = THREE.Vector3;

const SKIN = '#fde4ce';
const DRESS = '#27294b';
const CAPE = '#323663';
const TRIM = '#f2e8d0';
const COLLAR = '#f9f5eb';
const HAIR = '#241b26';
const BOW = '#d92938';
const BOW_DARK = '#a81c2b';
const CAT = '#1d1c28';
const WOOD = '#7f5130';
const WOOD_DARK = '#5b3820';
const BRASS = '#e5bc54';
const LEATHER = '#9c6638';
const LEATHER_DARK = '#724724';
const BOOT = '#8f2930';

function bristleTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  // Rich stylized golden-ochre -> warm honey -> sunlit cream gradient from collar to tip
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#c2883c');
  grad.addColorStop(0.28, '#dfa852');
  grad.addColorStop(0.68, '#f0ca76');
  grad.addColorStop(1.0, '#fae5a8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);

  // Subtle decorative woven cross-stitch band near the collar
  g.fillStyle = 'rgba(130, 52, 38, 0.25)';
  g.fillRect(0, 14, 512, 10);

  // Clean calligraphic straw linework (authentic Moebius/Ghibli graphic texture!)
  let seed = 4201;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 160; i++) {
    const x = (i / 160) * 512 + (rnd() - 0.5) * 3;
    const dark = i % 3 === 0;
    g.strokeStyle = dark ? 'rgba(138, 86, 36, 0.42)' : 'rgba(255, 244, 206, 0.45)';
    g.lineWidth = dark ? 1.4 : 1.8;
    g.beginPath();
    g.moveTo(x, 0);
    const wave = (rnd() - 0.5) * 8;
    g.bezierCurveTo(x + wave, 85, x - wave * 0.6, 175, x + wave * 0.3, 256);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Unified sculpted fluted teardrop calligraphy-brush broom plume with rest state for smooth wind sway!
function makeStylizedBroomPlume(len = 1.56, segU = 40, segV = 22) {
  const geo = new THREE.BufferGeometry();
  const pos = [], uvs = [], idx = [], rest = [];
  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV; // 0 = collar, 1 = flowing brush tip
    const z = v * len;
    // Sleek teardrop aerodynamic profile
    let baseR;
    if (v < 0.38) {
      const u = v / 0.38;
      baseR = 0.052 + 0.195 * Math.sin(u * Math.PI * 0.5);
    } else {
      const u = (v - 0.38) / 0.62;
      baseR = 0.247 * Math.pow(1.0 - u, 1.28) + 0.008;
    }
    // Gentle upward comet curve toward the tail tip
    const liftY = Math.pow(v, 2.15) * 0.115;
    const fluteAmp = 0.088 * Math.sin(v * Math.PI);
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const a = u * Math.PI * 2;
      const flute = 1.0 + fluteAmp * Math.sin(a * 14.0) + fluteAmp * 0.42 * Math.cos(a * 7.0 + v * 2.2);
      // Slight graceful vertical oval for sleek side silhouette
      const x = Math.cos(a) * baseR * flute * 0.94;
      const y = Math.sin(a) * baseR * flute * 1.04 + liftY;
      pos.push(x, y, z);
      rest.push(x, y, z, v);
      uvs.push(u * 2.0, v);
    }
  }
  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, rest };
}

function part(parent, geo, color, pos, opts) {
  const mat = typeof color === 'string' ? (opts ? toon(color, opts) : toon(color)) : color;
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.copy(pos);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function taperLimb(parent, a, b, r0, r1, color, segs = 10) {
  const d = b.clone().sub(a);
  const m = part(parent, new THREE.CylinderGeometry(r1, r0, d.length(), segs), color, a.clone().add(b).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
  return m;
}

// Builds a flared bell skirt with radial cloth pleats & exposes vertex rest state for cloth flutter.
function makePleatedSkirt(rTop, rBot, height, pleats = 10, segU = 40, segV = 8) {
  const geo = new THREE.BufferGeometry();
  const pos = [];
  const uvs = [];
  const idx = [];
  const rest = [];
  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV; // 0 = waist, 1 = hem
    const y = -v * height;
    const flare = Math.pow(v, 1.15);
    const baseR = rTop + (rBot - rTop) * flare;
    const pleatAmp = 0.038 * flare;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const a = u * Math.PI * 2;
      const r = baseR + Math.sin(a * pleats) * pleatAmp;
      // Slight elliptical bias so skirt sits gracefully over side-saddle knees
      const x = Math.cos(a) * r * (1.0 + 0.14 * flare * (Math.cos(a) < 0 ? 1 : 0));
      const z = Math.sin(a) * r * 1.05;
      pos.push(x, y, z);
      rest.push(x, y, z, v, a);
      uvs.push(u, v);
    }
  }
  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, rest };
}

// Curved sculptural ribbon bow loop (puffed & pinched near the knot)
function makeBowLoopGeo(side) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(side * 0.07, 0.095, side * 0.21, 0.115, side * 0.225, 0.025);
  s.bezierCurveTo(side * 0.23, -0.055, side * 0.12, -0.075, 0, -0.015);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.042,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 12,
  });
  g.translate(0, 0, -0.021);
  // Subtle forward/backward puff curvature
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const dist = Math.abs(x) / 0.22;
    p.setZ(i, z + Math.sin(dist * Math.PI) * 0.025 * (z >= 0 ? 1 : -0.4) - dist * dist * 0.035);
  }
  g.computeVertexNormals();
  return g;
}

// Curved lock of hair built from a tapered flattened tube along a spline
function makeHairLock(pts, r0, r1, flatZ = 0.55) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const segs = 10, radSegs = 6;
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = r0 + (r1 - r0) * Math.pow(u, 0.85);
    for (let j = 0; j <= radSegs; j++) {
      const a = (j / radSegs) * Math.PI * 2;
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r * flatZ;
      pos.push(
        p.x + N.x * cx + B.x * cy,
        p.y + N.y * cx + B.y * cy,
        p.z + N.z * cx + B.z * cy,
      );
    }
  }
  const stride = radSegs + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// World-space delicate translucent wind-ribbon trail
class WindRibbon {
  constructor(scene, count = 26, halfWidth = 0.065) {
    this.count = count;
    this.halfWidth = halfWidth;
    this.pts = Array.from({ length: count }, () => new V3());
    this.side = Array.from({ length: count }, () => new V3(1, 0, 0));
    this.ready = false;

    const pos = new Float32Array(count * 2 * 3);
    const uv = new Float32Array(count * 2 * 2);
    const idx = [];
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      uv[i * 4 + 0] = u; uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
      if (i < count - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uOpacity: { value: 0.0 },
        uColor: { value: new THREE.Color('#fffef5') },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float along = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.25, 1.0, vUv.x));
          float across = sin(vUv.y * 3.14159265);
          float alpha = along * across * uOpacity;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(uColor, alpha);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  update(worldPos, rightVec, opacity, dt) {
    if (!this.ready) {
      for (let i = 0; i < this.count; i++) {
        this.pts[i].copy(worldPos);
        this.side[i].copy(rightVec);
      }
      this.ready = true;
    } else {
      // Shift trail smoothly backward
      for (let i = this.count - 1; i > 0; i--) {
        this.pts[i].lerp(this.pts[i - 1], Math.min(1, dt * 36));
        this.side[i].lerp(this.side[i - 1], Math.min(1, dt * 26));
      }
      this.pts[0].copy(worldPos);
      this.side[0].copy(rightVec);
    }

    const pos = this.geo.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const u = i / (this.count - 1);
      const w = this.halfWidth * (0.25 + 0.75 * Math.sin(u * Math.PI));
      const p = this.pts[i], s = this.side[i];
      const o = i * 6;
      pos[o + 0] = p.x - s.x * w; pos[o + 1] = p.y - s.y * w; pos[o + 2] = p.z - s.z * w;
      pos[o + 3] = p.x + s.x * w; pos[o + 4] = p.y + s.y * w; pos[o + 5] = p.z + s.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mat.uniforms.uOpacity.value = opacity;
  }
}

export function buildRider(scene, hideInNormals = []) {
  const root = new THREE.Group();     // world flight position & attitude
  const body = new THREE.Group();     // subtle vertical buoyant bob
  root.add(body);

  // ================================================================ BROOM
  // Hand-carved slightly curved oak handle (forward is -z)
  const shaftCurve = new THREE.CatmullRomCurve3([
    new V3(0, 0.055, -1.48),
    new V3(0, 0.015, -0.85),
    new V3(0, 0.0, 0.0),
    new V3(0, -0.015, 0.65),
    new V3(0, -0.01, 1.12),
  ]);
  const shaftGeo = new THREE.TubeGeometry(shaftCurve, 24, 0.036, 10, false);
  // Subtle organic thickness taper (thicker near bristles, tapered toward front)
  const spAttr = shaftGeo.attributes.position;
  for (let i = 0; i < spAttr.count; i++) {
    const z = spAttr.getZ(i);
    const t = THREE.MathUtils.clamp((z + 1.48) / 2.6, 0, 1);
    const sc = 0.84 + 0.34 * t;
    spAttr.setX(i, spAttr.getX(i) * sc);
  }
  shaftGeo.computeVertexNormals();
  part(body, shaftGeo, WOOD, null, { brushScale: 2.5 });
  // Carved wooden pommel + brass collar at front tip
  part(body, new THREE.SphereGeometry(0.044, 12, 10), WOOD_DARK, new V3(0, 0.056, -1.50));
  part(body, new THREE.TorusGeometry(0.038, 0.011, 8, 14), BRASS, new V3(0, 0.046, -1.40)).rotation.x = 0.1;

  // Sleek stylized calligraphy-brush broom plume (unified fluted teardrop + 6 graceful accent locks!)
  const bristleGroup = new THREE.Group();
  bristleGroup.position.set(0, -0.01, 0.96);
  body.add(bristleGroup);

  const plumeData = makeStylizedBroomPlume(1.56, 40, 22);
  const plumeMat = toonMat({ color: '#ffffff', map: bristleTexture(), brushScale: 1.5, noHatch: true });
  const plumeMesh = new THREE.Mesh(plumeData.geo, plumeMat);
  plumeMesh.castShadow = true;
  plumeMesh.receiveShadow = true;
  bristleGroup.add(plumeMesh);

  // 6 sculpted feathered outer brush-tufts nestled tightly along the fluted teardrop contour
  const lockCols = ['#f4da90', '#e3b55c', '#f8e4a6', '#d49d48'];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.35;
    const cx = Math.cos(a), cy = Math.sin(a);
    const lockGeo = makeHairLock([
      new V3(cx * 0.12, cy * 0.12, 0.28),
      new V3(cx * 0.215, cy * 0.225 + 0.02, 0.68),
      new V3(cx * 0.145, cy * 0.155 + 0.075, 1.16),
      new V3(cx * 0.032, cy * 0.038 + 0.125, 1.56 + (i % 2) * 0.05),
    ], 0.058, 0.015, 0.45);
    part(bristleGroup, lockGeo, lockCols[i % lockCols.length], null, { noHatch: true });
  }

  // Ornate Moebius/Ghibli collar: braided crimson silk wrap + gleaming turned brass filigree rings!
  const collarPts = [
    new THREE.Vector2(0.055, 0.0),
    new THREE.Vector2(0.072, 0.04),
    new THREE.Vector2(0.095, 0.12),
    new THREE.Vector2(0.132, 0.23),
    new THREE.Vector2(0.158, 0.32),
  ];
  const collarGeo = new THREE.LatheGeometry(collarPts, 20);
  collarGeo.rotateX(Math.PI / 2);
  part(bristleGroup, collarGeo, '#8f262c', new V3(0, 0, 0.02));
  for (const [zOff, r, rad, col] of [
    [0.03, 0.062, 0.015, BRASS],
    [0.14, 0.100, 0.014, BRASS],
    [0.24, 0.138, 0.015, '#b82c36'],
    [0.32, 0.162, 0.018, BRASS],
  ]) {
    part(bristleGroup, new THREE.TorusGeometry(r, rad, 8, 20), col, new V3(0, 0, zOff));
  }

  // Twin graceful crimson silk tassels trailing softly beneath the brass collar
  const broomTassels = [];
  for (const s of [-1, 1]) {
    const tChain = [];
    let tParent = bristleGroup;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      if (i === 0) seg.position.set(s * 0.045, -0.155, 0.30);
      else seg.position.set(0, 0, 0.085);
      tParent.add(seg);
      part(seg, new THREE.BoxGeometry(0.028, 0.010, 0.092), i % 2 ? BOW : '#b62432', new V3(0, 0, 0.045), { noHatch: true });
      tChain.push(seg);
      tParent = seg;
    }
    broomTassels.push({ s, chain: tChain });
  }

  // ---- Hanging Fairy Brass Lantern on the front tip ----
  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(0, 0.02, -1.38);
  body.add(lanternPivot);
  part(lanternPivot, new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), '#343038', new V3(0, -0.06, 0));
  part(lanternPivot, new THREE.ConeGeometry(0.068, 0.055, 6), BRASS, new V3(0, -0.14, 0));
  part(lanternPivot, new THREE.CylinderGeometry(0.048, 0.042, 0.11, 6),
    toonMat({ color: '#ffefc0', alwaysGlow: 0.45, duskGlow: 1.0, noHatch: true }), new V3(0, -0.22, 0));
  part(lanternPivot, new THREE.CylinderGeometry(0.056, 0.046, 0.028, 6), BRASS, new V3(0, -0.285, 0));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    part(lanternPivot, new THREE.CylinderGeometry(0.005, 0.005, 0.13, 5), '#3a3438',
      new V3(Math.cos(a) * 0.05, -0.22, Math.sin(a) * 0.05));
  }

  // ---- Sculpted Leather Delivery Satchel + Rolled Letter ----
  const satchel = new THREE.Group();
  satchel.position.set(0.02, -0.01, -0.82);
  body.add(satchel);
  for (const sx of [-0.08, 0.08]) {
    part(satchel, new THREE.BoxGeometry(0.022, 0.22, 0.024), LEATHER_DARK, new V3(sx, -0.11, 0));
  }
  const bagShape = new THREE.Shape();
  bagShape.moveTo(-0.14, -0.11);
  bagShape.quadraticCurveTo(-0.15, 0.09, -0.12, 0.10);
  bagShape.lineTo(0.12, 0.10);
  bagShape.quadraticCurveTo(0.15, 0.09, 0.14, -0.11);
  bagShape.quadraticCurveTo(0, -0.13, -0.14, -0.11);
  const bagGeo = new THREE.ExtrudeGeometry(bagShape, {
    depth: 0.085, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 3,
  });
  bagGeo.translate(0, 0, -0.0425);
  part(satchel, bagGeo, LEATHER, new V3(0, -0.30, 0));
  // Rounded flap + brass clasp
  part(satchel, new THREE.BoxGeometry(0.30, 0.095, 0.125), LEATHER_DARK, new V3(0, -0.23, 0));
  part(satchel, new THREE.BoxGeometry(0.042, 0.042, 0.135), BRASS, new V3(0, -0.275, 0));
  // Rolled parchment delivery scroll with crimson wax seal peeking from the top
  const scroll = part(satchel, new THREE.CylinderGeometry(0.026, 0.026, 0.26, 10), '#fbf4df', new V3(0.11, -0.18, 0.01));
  scroll.rotation.z = -0.35;
  part(satchel, new THREE.TorusGeometry(0.028, 0.007, 6, 12), BOW, new V3(0.11, -0.18, 0.01)).rotation.set(Math.PI / 2, 0, -0.35);

  // ================================================================ WITCH
  const rider = new THREE.Group();
  rider.position.set(0, 0.04, 0.08);
  body.add(rider);

  // Contoured bodice (LatheGeometry with gentle waist & shoulders)
  const bodicePts = [
    new THREE.Vector2(0.155, 0.02),
    new THREE.Vector2(0.138, 0.11),
    new THREE.Vector2(0.112, 0.24),
    new THREE.Vector2(0.132, 0.40),
    new THREE.Vector2(0.118, 0.51),
    new THREE.Vector2(0.068, 0.56),
  ];
  const bodiceGeo = new THREE.LatheGeometry(bodicePts, 18);
  const bodice = part(rider, bodiceGeo, DRESS, new V3(0, 0.01, 0));
  bodice.scale.set(1.06, 1.0, 0.88);
  bodice.rotation.x = -0.11;

  // Crisp ivory Peter Pan collar + tiny crimson ribbon tie
  for (const s of [-1, 1]) {
    const colPetal = part(rider, new THREE.SphereGeometry(0.068, 12, 8), COLLAR, new V3(s * 0.055, 0.545, -0.025));
    colPetal.scale.set(1.2, 0.24, 1.05);
    colPetal.rotation.set(0.18, s * 0.35, -s * 0.28);
  }
  part(rider, new THREE.ConeGeometry(0.028, 0.08, 6), BOW, new V3(0, 0.51, -0.115)).rotation.set(0.45, 0, 0);

  // Fluttering short shoulder capelet wrapping back (+z) & shoulders, neatly open at front (-z)
  const capePivot = new THREE.Group();
  capePivot.position.set(0, 0.54, 0.01);
  rider.add(capePivot);
  const capePts = [
    new THREE.Vector2(0.095, 0.0),
    new THREE.Vector2(0.185, -0.055),
    new THREE.Vector2(0.242, -0.17),
    new THREE.Vector2(0.285, -0.28),
  ];
  const capeStart = -Math.PI * 0.74, capeArc = Math.PI * 1.48;
  const capeGeo = new THREE.LatheGeometry(capePts, 24, capeStart, capeArc);
  part(capePivot, capeGeo, CAPE, null, { side: THREE.DoubleSide });
  // Matching cream-gold trim band integrated right onto the lower edge of the exact same Lathe arc!
  const trimPts = [
    new THREE.Vector2(0.282, -0.268),
    new THREE.Vector2(0.292, -0.282),
    new THREE.Vector2(0.286, -0.296),
  ];
  const capeTrimGeo = new THREE.LatheGeometry(trimPts, 24, capeStart, capeArc);
  part(capePivot, capeTrimGeo, TRIM, null, { side: THREE.DoubleSide });

  // Pleated flowing dress skirt with real-time vertex cloth flutter + white petticoat hem
  const skirtPivot = new THREE.Group();
  skirtPivot.position.set(0, 0.14, 0.0);
  rider.add(skirtPivot);
  const skirtData = makePleatedSkirt(0.155, 0.45, 0.55, 10, 40, 8);
  part(skirtPivot, skirtData.geo, DRESS, null, { side: THREE.DoubleSide });
  const pettiData = makePleatedSkirt(0.145, 0.40, 0.56, 14, 32, 4);
  part(skirtPivot, pettiData.geo, COLLAR, new V3(0, -0.02, 0), { side: THREE.DoubleSide });

  // Graceful side-saddle legs tucked cleanly beneath the flowing skirt with white socks & burgundy boots
  const legsGroup = new THREE.Group();
  rider.add(legsGroup);
  const legPivots = [];
  for (const [idx, zOff] of [[-1, -0.05], [1, 0.065]]) {
    const legG = new THREE.Group();
    legsGroup.add(legG);
    const hip = new V3(-0.04, 0.04, zOff);
    const knee = new V3(-0.22, -0.03 - (idx > 0 ? 0.02 : 0), zOff - 0.02);
    const ankle = new V3(-0.30, -0.40 - (idx > 0 ? 0.02 : 0), zOff + (idx > 0 ? 0.05 : -0.03));
    taperLimb(legG, hip, knee, 0.056, 0.046, DRESS);
    const sockMid = knee.clone().lerp(ankle, 0.28);
    taperLimb(legG, knee, sockMid, 0.042, 0.040, SKIN);
    taperLimb(legG, sockMid, ankle, 0.041, 0.033, COLLAR);
    const bootG = new THREE.Group();
    bootG.position.copy(ankle);
    bootG.rotation.y = -0.35 + idx * 0.12;
    legG.add(bootG);
    part(bootG, new THREE.CylinderGeometry(0.036, 0.04, 0.075, 10), BOOT, new V3(0, 0.01, 0));
    const foot = part(bootG, new THREE.SphereGeometry(0.05, 10, 8), BOOT, new V3(0, -0.03, -0.045));
    foot.scale.set(0.82, 0.62, 1.55);
    part(bootG, new THREE.BoxGeometry(0.052, 0.032, 0.04), '#4c1820', new V3(0, -0.05, 0.018));
    part(bootG, new THREE.TorusGeometry(0.038, 0.008, 6, 12), BRASS, new V3(0, 0.025, 0)).rotation.x = Math.PI / 2;
    legPivots.push(legG);
  }

  // Arms with full puffed sleeves & slender hands gripping the oak handle
  const gripTargets = [new V3(-0.035, 0.015, -0.58), new V3(0.035, 0.01, -0.36)];
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const sh = new V3(s * 0.135, 0.48, -0.02);
    const mid = new V3(s * 0.165, 0.36, -0.14);
    const el = new V3(s * 0.145, 0.25, -0.25 - (i === 0 ? 0.07 : 0));
    const hand = gripTargets[i];
    const puff = part(rider, new THREE.SphereGeometry(0.074, 12, 10), DRESS, sh.clone().lerp(mid, 0.45));
    puff.scale.set(0.96, 1.15, 0.96);
    taperLimb(rider, mid, el, 0.049, 0.040, DRESS);
    part(rider, new THREE.SphereGeometry(0.038, 8, 6), DRESS, el);
    part(rider, new THREE.TorusGeometry(0.041, 0.011, 6, 12), COLLAR, el).rotation.x = Math.PI / 3;
    taperLimb(rider, el, hand, 0.034, 0.028, SKIN, 10);
    const fist = part(rider, new THREE.SphereGeometry(0.038, 10, 8), SKIN, hand, { noHatch: true });
    fist.scale.set(1.0, 0.9, 1.15);
  }

  // ---- Sculpted Anime Head, Continuous Bob Hair & Ribbon Bow ----
  const head = new THREE.Group();
  head.position.set(0, 0.67, -0.04);
  rider.add(head);

  part(head, new THREE.CylinderGeometry(0.042, 0.048, 0.12, 10), SKIN, new V3(0, -0.11, 0.01), { noHatch: true });

  // Soft contoured anime head + chin taper (warm sunlit skin, no cross-hatch)
  const skull = part(head, new THREE.SphereGeometry(0.148, 18, 14), SKIN, null, { noHatch: true, brushScale: 0.4 });
  skull.scale.set(0.96, 1.03, 0.98);
  const chin = part(head, new THREE.SphereGeometry(0.095, 14, 10), SKIN, new V3(0, -0.072, -0.032), { noHatch: true, brushScale: 0.4 });
  chin.scale.set(0.92, 0.85, 0.88);
  part(head, new THREE.ConeGeometry(0.014, 0.028, 6), SKIN, new V3(0, -0.028, -0.145), { noHatch: true }).rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.026, 8, 6), SKIN, new V3(s * 0.135, -0.02, 0.01), { noHatch: true }).scale.set(0.55, 1.1, 0.8);
    part(head, new THREE.SphereGeometry(0.024, 10, 8), '#1c1824', new V3(s * 0.052, -0.012, -0.132), { noHatch: true }).scale.set(0.92, 1.32, 0.45);
    part(head, new THREE.SphereGeometry(0.0085, 8, 6), '#ffffff', new V3(s * 0.046, 0.002, -0.142), { noHatch: true }).scale.set(0.9, 1.0, 0.4);
    part(head, new THREE.SphereGeometry(0.023, 8, 6), '#f49a96', new V3(s * 0.084, -0.052, -0.116), { noHatch: true }).scale.set(1.38, 0.65, 0.4);
  }

  // Glossy hair crown cap
  const crown = part(head, new THREE.SphereGeometry(0.163, 20, 14), HAIR, new V3(0, 0.032, 0.024), { noHatch: true });
  crown.scale.set(1.04, 0.99, 1.05);

  // Bangs framing forehead (5 soft curved fringe locks)
  for (let i = -2; i <= 2; i++) {
    const fx = i * 0.040;
    const fy = 0.09 - Math.abs(i) * 0.012;
    const lockGeo = makeHairLock([
      new V3(fx * 0.72, 0.148, -0.04),
      new V3(fx, fy, -0.142),
      new V3(fx * 1.12, 0.018 - Math.abs(i) * 0.008, -0.148),
    ], 0.038, 0.012, 0.48);
    part(head, lockGeo, HAIR, null, { noHatch: true });
  }

  // Lush continuous sculpted inner bob hair shell (no stick gaps!) + feathered outer fluttering strands
  const hairBob = new THREE.Group();
  hairBob.position.set(0, 0.02, 0.028);
  head.add(hairBob);

  const bobPts = [
    new THREE.Vector2(0.152, 0.06),
    new THREE.Vector2(0.172, -0.02),
    new THREE.Vector2(0.176, -0.10),
    new THREE.Vector2(0.158, -0.165),
  ];
  const bobShell = new THREE.LatheGeometry(bobPts, 22, -Math.PI * 0.68, Math.PI * 1.36);
  part(hairBob, bobShell, HAIR, null, { side: THREE.DoubleSide, noHatch: true });

  const backLocks = [];
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const ang = -Math.PI * 0.54 + u * Math.PI * 1.08;
    const sx = Math.sin(ang), sz = Math.cos(ang);
    const len = 0.19 + Math.sin(u * Math.PI) * 0.04;
    const lockPivot = new THREE.Group();
    lockPivot.position.set(sx * 0.148, 0.025, sz * 0.142);
    hairBob.add(lockPivot);
    const lGeo = makeHairLock([
      new V3(0, 0.02, 0),
      new V3(sx * 0.024, -len * 0.48, sz * 0.032),
      new V3(sx * 0.014, -len, sz * 0.052),
    ], 0.046, 0.014, 0.50);
    part(lockPivot, lGeo, HAIR, null, { noHatch: true });
    backLocks.push({ pivot: lockPivot, phase: i * 0.85, side: sx });
  }

  // ---- Iconic Sculpted Big Red Ribbon Bow + Twin Fluttering Silk Streamers ----
  const bow = new THREE.Group();
  bow.position.set(0, 0.165, 0.02);
  bow.rotation.x = 0.12;
  head.add(bow);

  // Center knotted band
  const knot = part(bow, new THREE.SphereGeometry(0.046, 12, 10), BOW_DARK);
  knot.scale.set(0.95, 0.88, 0.85);
  // Twin sculpted puffed bow loops
  const bowWings = [];
  for (const s of [-1, 1]) {
    const wingG = new THREE.Group();
    bow.add(wingG);
    part(wingG, makeBowLoopGeo(s), BOW, new V3(0, 0.01, 0));
    // Inner dark crease accent
    const crease = part(wingG, new THREE.SphereGeometry(0.022, 8, 6), BOW_DARK, new V3(s * 0.065, 0.01, 0.018));
    crease.scale.set(1.6, 0.42, 0.4);
    bowWings.push(wingG);
  }

  // Twin long flowing red silk ribbon tails behind her head (6 articulated segments each!)
  const ribbonChains = [];
  for (const s of [-1, 1]) {
    const chain = [];
    let parentSeg = bow;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Group();
      if (i === 0) seg.position.set(s * 0.038, -0.02, 0.035);
      else seg.position.set(0, 0, 0.085);
      parentSeg.add(seg);
      const w = 0.052 + i * 0.006;
      const rib = part(seg, new THREE.BoxGeometry(w, 0.012, 0.095), i % 2 ? BOW : '#e13442', new V3(0, 0, 0.045), { noHatch: true });
      rib.castShadow = false;
      chain.push(seg);
      parentSeg = seg;
    }
    ribbonChains.push({ s, chain });
  }

  // ================================================================ BLACK CAT
  const cat = new THREE.Group();
  cat.position.set(0, 0.19, 1.44);
  body.add(cat);

  // Sleek perched sitting cat torso + tucked front paws
  const catBodyPts = [
    new THREE.Vector2(0.04, -0.02),
    new THREE.Vector2(0.115, 0.02),
    new THREE.Vector2(0.108, 0.11),
    new THREE.Vector2(0.084, 0.20),
    new THREE.Vector2(0.052, 0.25),
  ];
  const catBodyGeo = new THREE.LatheGeometry(catBodyPts, 14);
  const catTorso = part(cat, catBodyGeo, CAT, new V3(0, -0.02, 0.02));
  catTorso.scale.set(0.92, 1.0, 1.15);
  catTorso.rotation.x = 0.16;

  // Tucked front paws resting neatly on the broom binding
  for (const s of [-1, 1]) {
    part(cat, new THREE.CylinderGeometry(0.022, 0.020, 0.12, 8), CAT, new V3(s * 0.045, 0.04, -0.085)).rotation.x = -0.18;
    part(cat, new THREE.SphereGeometry(0.024, 8, 6), CAT, new V3(s * 0.045, -0.015, -0.105)).scale.set(1.0, 0.65, 1.25);
  }
  // Crimson ribbon collar + gleaming golden jingle bell
  part(cat, new THREE.TorusGeometry(0.062, 0.012, 6, 14), BOW, new V3(0, 0.20, -0.035)).rotation.set(Math.PI / 2 + 0.15, 0, 0);
  part(cat, new THREE.SphereGeometry(0.019, 8, 6), BRASS, new V3(0, 0.185, -0.102));

  // Expressive anime cat head, pointed pink-lined ears, luminous golden eyes & whiskers
  const catHead = new THREE.Group();
  catHead.position.set(0, 0.265, -0.05);
  cat.add(catHead);
  const chMesh = part(catHead, new THREE.SphereGeometry(0.086, 14, 12), CAT);
  chMesh.scale.set(1.06, 0.94, 0.96);
  // Subtle muzzle & tiny pink nose
  part(catHead, new THREE.SphereGeometry(0.032, 10, 8), CAT, new V3(0, -0.022, -0.072)).scale.set(1.25, 0.78, 0.8);
  part(catHead, new THREE.SphereGeometry(0.011, 8, 6), '#e88b9c', new V3(0, -0.012, -0.095)).scale.set(1.2, 0.75, 0.6);

  const catEars = [];
  for (const s of [-1, 1]) {
    const earG = new THREE.Group();
    earG.position.set(s * 0.056, 0.064, 0.005);
    earG.rotation.z = -s * 0.26;
    catHead.add(earG);
    part(earG, new THREE.ConeGeometry(0.034, 0.095, 4), CAT, new V3(0, 0.04, 0)).rotation.y = Math.PI / 4;
    part(earG, new THREE.ConeGeometry(0.020, 0.065, 4), '#d87a8c', new V3(0, 0.034, -0.014)).rotation.y = Math.PI / 4;
    catEars.push({ g: earG, s });

    // Large luminous amber eyes with vertical pupil & catchlight
    part(catHead, new THREE.SphereGeometry(0.022, 10, 8), '#f8d54a', new V3(s * 0.036, 0.012, -0.074)).scale.set(0.95, 1.18, 0.45);
    part(catHead, new THREE.SphereGeometry(0.010, 8, 6), '#141218', new V3(s * 0.036, 0.012, -0.084)).scale.set(0.45, 1.45, 0.35);
    part(catHead, new THREE.SphereGeometry(0.006, 6, 6), '#ffffff', new V3(s * 0.031, 0.020, -0.086)).scale.set(1, 1, 0.4);

    // Delicate whiskers
    for (const wv of [-0.012, 0.008]) {
      const wMesh = part(catHead, new THREE.BoxGeometry(0.075, 0.003, 0.003), '#d4d6e0', new V3(s * 0.075, -0.022 + wv, -0.072), { noHatch: true });
      wMesh.rotation.z = s * wv * 6;
      wMesh.rotation.y = -s * 0.2;
    }
  }

  // Graceful S-curved 8-segment plush cat tail
  const tail = [];
  let tp = cat;
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.05 : 0.058, i === 0 ? 0.13 : 0);
    tp.add(seg);
    const r = 0.020 - i * 0.0008;
    part(seg, new THREE.CylinderGeometry(r * 0.94, r, 0.068, 8), CAT, new V3(0, 0.032, 0));
    if (i === 7) part(seg, new THREE.SphereGeometry(r * 1.1, 8, 6), CAT, new V3(0, 0.066, 0));
    tail.push(seg);
    tp = seg;
  }

  // ================================================================ WIND RIBBONS
  const ribbons = [];
  if (scene) {
    const r1 = new WindRibbon(scene, 24, 0.048);
    const r2 = new WindRibbon(scene, 24, 0.042);
    ribbons.push(
      { r: r1, local: new V3(-0.34, 0.24, 0.65) },
      { r: r2, local: new V3(0.32, 0.28, 0.72) },
    );
    hideInNormals.push(r1.mesh, r2.mesh);
  }

  // Preallocated scratch vectors for animation
  const tmpP = new V3();
  const tmpRight = new V3();
  let look = 0;
  let earTwitch = 0;

  function update(t, s, dt) {
    const sp = THREE.MathUtils.clamp(s.speed / 24, 0, 1.2);
    const wind = 0.28 + sp * 0.95;

    // Gentle buoyant float
    body.position.y = Math.sin(t * 1.55) * 0.048;
    body.rotation.z = Math.sin(t * 0.95) * 0.022;

    // Rider lean into banks & forward aerodynamic tuck at higher speed
    rider.rotation.z = s.bank * 0.28;
    rider.rotation.x = -0.04 - sp * 0.14;

    // Flowing capelet billowing upward/backward with wind speed
    capePivot.rotation.x = 0.14 + sp * 0.42 + Math.sin(t * 9.5) * 0.04 * wind;
    capePivot.rotation.z = -s.bank * 0.22 + Math.sin(t * 6.2) * 0.03 * wind;

    // Dynamic pleated skirt vertex cloth wave!
    skirtPivot.rotation.x = -0.06 - sp * 0.36;
    skirtPivot.rotation.z = -0.34 - s.bank * 0.12;
    const skPos = skirtData.geo.attributes.position;
    const skRest = skirtData.rest;
    const count = skPos.count;
    for (let i = 0; i < count; i++) {
      const o = i * 5;
      const rx = skRest[o], ry = skRest[o + 1], rz = skRest[o + 2], v = skRest[o + 3], ang = skRest[o + 4];
      const flex = v * v;
      const wave = Math.sin(t * 10.5 - v * 5.2 + ang * 2.0) * 0.032 * wind * flex
                 + Math.sin(t * 16.0 - v * 7.5 - ang * 3.0) * 0.012 * sp * flex;
      const trailZ = flex * sp * 0.16;
      skPos.setXYZ(i, rx + wave * 0.5, ry + Math.abs(wave) * 0.35 + flex * sp * 0.05, rz + trailZ + wave);
    }
    skPos.needsUpdate = true;

    // Gentle swinging boots
    legPivots.forEach((lg, idx) => {
      lg.rotation.z = Math.sin(t * 2.2 + idx * 1.4) * 0.04 * (1 - sp * 0.4);
      lg.rotation.x = sp * 0.12;
    });

    // Head glances smoothly into turns & pitches with climb/dive
    head.rotation.y = s.bank * 0.58;
    head.rotation.x = -s.vy * 0.016 + sp * 0.06;

    // Layered back hair locks fluttering independently
    for (const lk of backLocks) {
      lk.pivot.rotation.x = 0.12 + sp * 0.48 + Math.sin(t * 11.5 + lk.phase) * 0.09 * wind;
      lk.pivot.rotation.z = lk.side * (0.08 + sp * 0.14) + Math.cos(t * 8.4 + lk.phase) * 0.06 * wind;
    }

    // Bow wings & twin silk streamers waving smoothly in slipstream
    bowWings.forEach((w, i) => {
      w.rotation.x = -sp * 0.22 + Math.sin(t * 13.5 + i * 1.8) * 0.14 * wind;
      w.rotation.z = (i === 0 ? 1 : -1) * (Math.sin(t * 9.5 + i) * 0.08 * wind);
    });
    for (const rc of ribbonChains) {
      rc.chain.forEach((seg, i) => {
        const phase = t * 12.0 - i * 0.85 + rc.s * 1.1;
        seg.rotation.x = (i === 0 ? -0.18 + sp * 0.22 : 0.04) + Math.sin(phase) * (0.14 + i * 0.03) * wind;
        seg.rotation.y = (i === 0 ? rc.s * 0.22 - s.bank * 0.35 : 0) + Math.cos(phase * 0.72) * 0.12 * wind;
      });
    }

    // Satchel & hanging fairy lantern swing naturally with inertia & wind
    satchel.rotation.x = 0.08 + sp * 0.48 + Math.sin(t * 2.8) * 0.09 - s.vy * 0.018;
    satchel.rotation.z = -s.bank * 0.55;
    lanternPivot.rotation.x = 0.10 + sp * 0.55 + Math.sin(t * 3.4 + 0.8) * 0.10 - s.vy * 0.022;
    lanternPivot.rotation.z = -s.bank * 0.65 + Math.cos(t * 2.5) * 0.06;

    // Graceful silky wind-flex vertex animation on the stylized broom plume + fluttering tassels!
    const pPos = plumeData.geo.attributes.position;
    const pRest = plumeData.rest;
    for (let i = 0; i < pPos.count; i++) {
      const o = i * 4;
      const rx = pRest[o], ry = pRest[o + 1], rz = pRest[o + 2], v = pRest[o + 3];
      const flex = v * v;
      const swayX = -s.bank * 0.16 * flex + Math.sin(t * 7.5 - v * 4.0) * 0.014 * wind * flex;
      const swayY = Math.cos(t * 9.2 - v * 4.5) * 0.012 * wind * flex - s.vy * 0.008 * flex;
      pPos.setXYZ(i, rx + swayX, ry + swayY, rz);
    }
    pPos.needsUpdate = true;
    for (const bt of broomTassels) {
      bt.chain.forEach((seg, i) => {
        const ph = t * 11.0 - i * 0.8 + bt.s;
        seg.rotation.x = (i === 0 ? -0.28 + sp * 0.25 : 0.04) + Math.sin(ph) * 0.14 * wind;
        seg.rotation.y = (i === 0 ? bt.s * 0.18 - s.bank * 0.35 : 0) + Math.cos(ph * 0.8) * 0.10 * wind;
      });
    }

    // Expressive black cat animation
    const diving = s.vy < -2.6;
    const wantLook = s.speed < 10 ? Math.sin(t * 0.65) * 0.85 : s.bank * 0.45;
    look += (wantLook - look) * (1 - Math.exp(-dt * 2.6));
    catHead.rotation.y = look;
    catHead.rotation.x = diving ? 0.22 : -s.vy * 0.015;
    cat.position.y = 0.19 - (diving ? 0.03 : 0);
    cat.scale.y = diving ? 0.88 : 1.0;

    earTwitch = Math.pow(Math.max(0, Math.sin(t * 1.9)), 18) * 0.22;
    for (const e of catEars) {
      e.g.rotation.z = -e.s * (0.26 + (diving ? 0.34 : 0) + (e.s > 0 ? earTwitch : 0));
    }
    tail.forEach((seg, i) => {
      seg.rotation.x = (i === 0 ? -0.42 : 0.22) + Math.sin(t * 2.4 - i * 0.62) * 0.14 + sp * 0.08;
      seg.rotation.z = Math.sin(t * 1.75 - i * 0.5) * 0.19 - s.bank * 0.12;
    });

    // Update subtle world-space wind ribbons
    if (ribbons.length) {
      root.updateMatrixWorld(true);
      tmpRight.set(1, 0, 0).applyQuaternion(root.quaternion);
      const ribbonAlpha = THREE.MathUtils.clamp((sp - 0.38) * 0.45 + Math.abs(s.bank) * 0.35, 0.04, 0.34);
      for (const rb of ribbons) {
        tmpP.copy(rb.local).applyMatrix4(body.matrixWorld);
        rb.r.update(tmpP, tmpRight, ribbonAlpha, dt);
      }
    }
  }

  function resetTrails() {
    for (const rb of ribbons) rb.r.ready = false;
  }

  return { root, update, resetTrails };
}
