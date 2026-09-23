import * as THREE from 'three';
import { toon, toonMat } from './toon.js';

const V3 = THREE.Vector3;
const SKIN = '#f7dcc5', DRESS = '#2b2b48', HAIR = '#2a211e', BOW = '#d8262e', CAT = '#1d1c24';

function bristleTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#e2bd72'; g.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = ['#c79a4e', '#f0d08e', '#b88a44'][i % 3];
    g.lineWidth = 1 + (i % 2);
    const x = (i * 37) % 128;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + ((i * 13) % 7) - 3, 32); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function part(parent, geo, color, pos, opts) {
  const m = new THREE.Mesh(geo, opts ? toon(color, opts) : toon(color));
  if (pos) m.position.copy(pos);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function limb(parent, a, b, r, color) {
  const d = b.clone().sub(a);
  const m = part(parent, new THREE.CylinderGeometry(r, r * 0.88, d.length(), 8), color, a.clone().add(b).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
  return m;
}

export function buildRider() {
  const root = new THREE.Group();     // flight position & attitude
  const body = new THREE.Group();     // bob
  root.add(body);

  // broom: forward is -z
  const handle = part(body, new THREE.CylinderGeometry(0.036, 0.044, 2.5, 8), '#8b5a34', new V3(0, 0, -0.2));
  handle.rotation.x = Math.PI / 2;
  const cone = new THREE.ConeGeometry(0.3, 1.15, 14, 1);
  cone.rotateX(-Math.PI / 2);
  const bristles = new THREE.Mesh(cone, toonMat({ color: '#ffffff', map: bristleTexture() }));
  bristles.position.z = 1.0 + 0.575;
  bristles.castShadow = true;
  body.add(bristles);
  part(body, new THREE.TorusGeometry(0.1, 0.035, 6, 14), '#7a2a22', new V3(0, 0, 1.08));
  part(body, new THREE.TorusGeometry(0.16, 0.03, 6, 14), '#7a2a22', new V3(0, 0, 1.35));

  // satchel hanging from the front of the handle
  const satchel = new THREE.Group();
  satchel.position.set(0, 0, -0.95);
  body.add(satchel);
  part(satchel, new THREE.BoxGeometry(0.03, 0.2, 0.03), '#6b4a33', new V3(0, -0.1, 0));
  part(satchel, new THREE.BoxGeometry(0.26, 0.2, 0.1), '#9b6a3d', new V3(0, -0.28, 0));
  part(satchel, new THREE.BoxGeometry(0.27, 0.08, 0.11), '#7a5230', new V3(0, -0.2, 0));

  // the rider, sitting side-saddle with her legs to the left
  const rider = new THREE.Group();
  rider.position.set(0, 0.04, 0.12);
  body.add(rider);
  part(rider, new THREE.SphereGeometry(0.16, 12, 8), DRESS, new V3(0, 0.08, 0)).scale.set(1, 0.7, 1.05);
  const torso = part(rider, new THREE.CylinderGeometry(0.115, 0.15, 0.42, 12), DRESS, new V3(0, 0.33, 0));
  torso.rotation.x = -0.1;
  part(rider, new THREE.TorusGeometry(0.08, 0.025, 6, 12), '#f3eee3', new V3(0, 0.53, -0.01)).rotation.x = Math.PI / 2;

  const skirt = new THREE.Group();
  skirt.position.set(0, 0.1, 0);
  rider.add(skirt);
  const sg = new THREE.CylinderGeometry(0.17, 0.38, 0.55, 16, 1, true).translate(0, -0.27, 0);
  part(skirt, sg, DRESS, null, { side: THREE.DoubleSide });

  // legs over the left side
  for (const s of [-1, 1]) {
    const hip = new V3(-0.05, 0.06, s * 0.07), knee = new V3(-0.32, 0.03, s * 0.07 - 0.03), ankle = new V3(-0.34, -0.38, s * 0.06 - 0.02);
    limb(rider, hip, knee, 0.058, DRESS);
    limb(rider, knee, ankle, 0.045, SKIN);
    part(rider, new THREE.BoxGeometry(0.09, 0.07, 0.16), '#8a2f2a', ankle.clone().add(new V3(0, -0.03, -0.03)));
  }

  // arms reaching forward to the handle
  for (const s of [-1, 1]) {
    const sh = new V3(s * 0.15, 0.5, -0.02), el = new V3(s * 0.17, 0.28, -0.28), hand = new V3(s * 0.06, 0.0, -0.52);
    limb(rider, sh, el, 0.045, DRESS);
    limb(rider, el, hand, 0.037, SKIN);
    part(rider, new THREE.SphereGeometry(0.045, 8, 6), SKIN, hand);
  }

  // head, hair and the big red bow
  const head = new THREE.Group();
  head.position.set(0, 0.7, -0.03);
  rider.add(head);
  part(head, new THREE.SphereGeometry(0.15, 16, 12), SKIN);
  const hair = part(head, new THREE.SphereGeometry(0.163, 16, 12), HAIR, new V3(0, 0.025, 0.035));
  hair.scale.set(1.04, 0.95, 1.0);
  const bob = new THREE.Group();
  bob.position.set(0, 0.0, 0.05);
  head.add(bob);
  part(bob, new THREE.CylinderGeometry(0.15, 0.17, 0.16, 14, 1, true), HAIR, new V3(0, -0.06, 0.01), { side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.022, 8, 6), '#1e1a1c', new V3(s * 0.055, -0.01, -0.138)).scale.set(1, 1.5, 0.5);
    part(head, new THREE.SphereGeometry(0.02, 8, 6), '#f1a5a0', new V3(s * 0.085, -0.055, -0.118)).scale.set(1.4, 0.7, 0.5);
  }
  const bow = new THREE.Group();
  bow.position.set(0, 0.15, 0.03);
  head.add(bow);
  part(bow, new THREE.SphereGeometry(0.045, 10, 8), BOW);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    bow.add(w);
    const c = part(w, new THREE.ConeGeometry(0.09, 0.2, 4), BOW, new V3(s * 0.1, 0.02, 0));
    c.rotation.z = s * Math.PI / 2 * 0.9;
    c.scale.set(1, 1, 0.45);
    wings.push(w);
  }

  // the black cat on the bristles
  const cat = new THREE.Group();
  cat.position.set(0, 0.2, 1.12);
  body.add(cat);
  part(cat, new THREE.SphereGeometry(1, 12, 10), CAT).scale.set(0.11, 0.1, 0.15);
  const catHead = new THREE.Group();
  catHead.position.set(0, 0.12, -0.11);
  cat.add(catHead);
  part(catHead, new THREE.SphereGeometry(0.078, 12, 10), CAT);
  for (const s of [-1, 1]) {
    part(catHead, new THREE.ConeGeometry(0.03, 0.07, 4), CAT, new V3(s * 0.045, 0.07, 0.005)).rotation.z = -s * 0.25;
    part(catHead, new THREE.SphereGeometry(0.014, 8, 6), '#f2d24b', new V3(s * 0.03, 0.012, -0.068)).scale.set(1, 1.3, 0.5);
  }
  const tail = [];
  let tp = cat;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i ? 0.065 : 0.03, i ? 0 : 0.14);
    tp.add(seg);
    part(seg, new THREE.CylinderGeometry(0.017, 0.019, 0.07, 6), CAT, new V3(0, 0.035, 0));
    tail.push(seg);
    tp = seg;
  }

  let look = 0;
  function update(t, s, dt) {
    const sp = s.speed / 24;
    body.position.y = Math.sin(t * 1.4) * 0.05;
    body.rotation.z = Math.sin(t * 0.9) * 0.025;
    rider.rotation.z = s.bank * 0.25;
    rider.rotation.x = -sp * 0.12;
    skirt.rotation.x = -0.12 - sp * 0.55 + Math.sin(t * 11) * 0.05 * sp;
    skirt.rotation.z = -0.4 + Math.sin(t * 7.3) * 0.04 * (0.3 + sp);
    bob.rotation.x = -sp * 0.35 + Math.sin(t * 9) * 0.05 * sp;
    head.rotation.y = s.bank * 0.6;
    head.rotation.x = -s.vy * 0.015;
    wings.forEach((w, i) => { w.rotation.x = Math.sin(t * 14 + i * 1.7) * 0.25 * (0.2 + sp) - sp * 0.3; });
    satchel.rotation.x = sp * 0.5 + Math.sin(t * 2.7) * 0.12 - s.vy * 0.02;
    satchel.rotation.z = -s.bank * 0.5;
    tail.forEach((seg, i) => {
      seg.rotation.x = (i ? 0.28 : -0.6) + Math.sin(t * 2.3 - i * 0.7) * 0.18 + sp * 0.12;
      seg.rotation.z = Math.sin(t * 1.6 - i * 0.55) * 0.22;
    });
    const want = s.speed < 9 ? Math.sin(t * 0.5) * 0.9 : 0;
    look += (want - look) * (1 - Math.exp(-dt * 2));
    catHead.rotation.y = look;
    cat.position.y = 0.2 - (s.vy < -3 ? 0.04 : 0);
    cat.scale.y = s.vy < -3 ? 0.85 : 1;
  }

  return { root, update };
}
