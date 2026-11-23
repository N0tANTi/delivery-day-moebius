import * as THREE from 'three';
import { buildWorld, TOWER } from './world.js';
import { buildRider } from './rider.js';
import { buildPost } from './post.js';
import { Sound } from './audio.js';
import { STYLES, STYLE_ORDER, THEME_U, syncThemeUniforms } from './styles.js';
import { groundH, smooth, CITY } from './util.js';

const V3 = THREE.Vector3;
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.2, 5500);

const world = buildWorld(scene);
const rider = buildRider(scene, world.hideInNormals);
scene.add(rider.root);
const post = buildPost(renderer, scene, camera, world.hideInNormals);
const sound = new Sound(CITY);

// ================================================================ ART STYLE & UI STATE
let currentStyle = STYLES[params.get('style')] ? params.get('style') : 'moebius';
let autoPilot = params.has('auto');
let camMode = 0; // 0 = Flight, 1 = Wide Cinema, 2 = Close-up Portrait
const CAM_NAMES = ['飞行视角', '广角全景', '魔女特写'];

const title = document.getElementById('title');
const hud = document.getElementById('hud');
const toolbar = document.getElementById('toolbar');
const subtitle = document.getElementById('subtitle');
if (subtitle) {
  subtitle.textContent = CITY === 'prague'
    ? '布拉格河谷 · 伏尔塔瓦河与百塔之城'
    : '地中海悬崖海港 · 风车山城与碧蓝海湾';
}

function setStyle(id) {
  if (!STYLES[id]) return;
  currentStyle = id;
  const st = syncThemeUniforms(id);
  world.applyStyle(st);
  post.applyStyle(st);
  renderer.shadowMap.needsUpdate = true;
  document.querySelectorAll('[data-style]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.style === id);
  });
}

function setCamMode(m) {
  camMode = ((m % 3) + 3) % 3;
  const btn = document.getElementById('btn-cam');
  if (btn) btn.textContent = CAM_NAMES[camMode];
}

function updateAutoBtn() {
  const btn = document.getElementById('btn-auto');
  if (btn) btn.classList.toggle('active', autoPilot);
}

// Wire toolbar buttons
document.querySelectorAll('[data-style]').forEach((btn) => {
  btn.addEventListener('click', (e) => { e.stopPropagation(); setStyle(btn.dataset.style); });
});
document.querySelectorAll('[data-city]').forEach((btn) => {
  btn.classList.toggle('active', btn.dataset.city === CITY);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.dataset.city === CITY) return;
    const u = new URL(location.href);
    u.searchParams.set('city', btn.dataset.city);
    u.searchParams.set('style', currentStyle);
    u.searchParams.delete('at');
    location.href = u.toString();
  });
});
document.getElementById('btn-cam')?.addEventListener('click', (e) => {
  e.stopPropagation();
  setCamMode(camMode + 1);
});
document.getElementById('btn-auto')?.addEventListener('click', (e) => {
  e.stopPropagation();
  autoPilot = !autoPilot;
  if (autoPilot) begin();
  updateAutoBtn();
});

setStyle(currentStyle);
setCamMode(0);
updateAutoBtn();

function resize() {
  const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.resize(w, h, pr);
}
addEventListener('resize', resize);
resize();

// ================================================================ INPUT
const keys = {};
const mouse = { down: false, x: 0, y: 0 };
let started = false, uiHidden = params.has('clean');
if (uiHidden) {
  title.style.transition = 'none';
  hud.style.transition = 'none';
  toolbar.style.transition = 'none';
  title.classList.add('hidden');
  hud.classList.add('hidden');
  toolbar.classList.add('hidden');
}

function begin() {
  sound.start();
  if (!started) {
    started = true;
    setTimeout(() => title.classList.add('hidden'), 1100);
  }
}

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'Digit1') { setStyle('moebius'); return; }
  if (e.code === 'Digit2') { setStyle('ghibli'); return; }
  if (e.code === 'Digit3') { setStyle('golden'); return; }
  if (e.code === 'KeyC') { setCamMode(camMode + 1); return; }
  if (e.code === 'KeyP') { autoPilot = !autoPilot; if (autoPilot) begin(); updateAutoBtn(); return; }
  if (e.code === 'KeyH') {
    uiHidden = !uiHidden;
    hud.classList.toggle('hidden', uiHidden);
    toolbar.classList.toggle('hidden', uiHidden);
    if (uiHidden) title.classList.add('hidden');
    return;
  }
  if (e.code === 'KeyM') { sound.toggleMute(); return; }
  begin();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('pointerdown', (e) => {
  if (e.target.closest('#toolbar')) return;
  mouse.down = true;
  begin();
  onMove(e);
});
addEventListener('pointerup', () => { mouse.down = false; });
addEventListener('pointermove', onMove);
function onMove(e) { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; }
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
const k = (...codes) => codes.some((c) => keys[c]);

// ================================================================ FLIGHT
const pose = (params.get('at') || (world.start || [74, 42, 232, 0.24]).join(',')).split(',').map(Number);
const CENTER = world.center || new THREE.Vector2(-8, 12);
const S = { pos: new V3(pose[0], pose[1], pose[2]), yaw: pose[3] || 0, speed: 13.5, vy: 0, bank: 0, pitch: 0, near: 0 };
const fwd = new V3();
const tmp = new V3();

function fly(dt, t) {
  const mx = mouse.down ? THREE.MathUtils.clamp(mouse.x * 1.4, -1, 1) : 0;
  const my = mouse.down ? THREE.MathUtils.clamp(-mouse.y * 1.4, -1, 1) : 0;
  const target = k('KeyW', 'ArrowUp') ? 24 : k('KeyS', 'ArrowDown') ? 3.5 : 13.5;
  S.speed += (target - S.speed) * (1 - Math.exp(-dt * 0.9));

  let steer = (k('KeyA', 'ArrowLeft') ? 1 : 0) - (k('KeyD', 'ArrowRight') ? 1 : 0) - mx;
  const manual = Math.abs(steer) > 0.01 || Math.abs(my) > 0.01 || k('Space', 'ShiftLeft', 'ShiftRight');
  if (autoPilot && !manual) {
    steer += Math.sin(t * 0.14) * 0.42 + Math.cos(t * 0.07) * 0.18;
  }

  // Soft boundary gently banks the witch back toward the town
  const cx = S.pos.x - CENTER.x, cz = S.pos.z - CENTER.y, r = Math.hypot(cx, cz);
  const edge = smooth(640, 860, r);
  if (edge > 0) {
    const home = Math.atan2(cx, cz);
    const diff = Math.atan2(Math.sin(home - S.yaw), Math.cos(home - S.yaw));
    steer += THREE.MathUtils.clamp(diff * 2, -1, 1) * edge * 1.35;
  }
  steer = THREE.MathUtils.clamp(steer, -1.2, 1.2);
  S.bank += (steer * 0.62 - S.bank) * (1 - Math.exp(-dt * 2.4));
  S.yaw += S.bank * (0.55 + 3.5 / Math.max(S.speed, 4)) * 0.55 * dt;

  let climb = (k('Space') ? 1 : 0) - (k('ShiftLeft', 'ShiftRight') ? 1 : 0) + my;
  if (autoPilot && !manual) {
    const desiredY = Math.max(groundH(S.pos.x, S.pos.z) + 26, 46) + Math.sin(t * 0.22) * 18;
    climb += THREE.MathUtils.clamp((desiredY - S.pos.y) * 0.04, -0.5, 0.5);
  }
  S.vy += (THREE.MathUtils.clamp(climb, -1, 1) * 7.5 - S.vy) * (1 - Math.exp(-dt * 2.2));

  fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  S.pos.addScaledVector(fwd, S.speed * dt);
  S.pos.y += S.vy * dt;

  if (S.pos.y > 235) { S.pos.y += (235 - S.pos.y) * (1 - Math.exp(-dt * 2)); S.vy = Math.min(S.vy, 0); }
  const floor = Math.max(groundH(S.pos.x, S.pos.z), 0) + 2.4;
  if (S.pos.y < floor) { S.pos.y += (floor - S.pos.y) * (1 - Math.exp(-dt * 8)); S.vy = Math.max(S.vy, 0); }

  // Soft collisions gently steer broom clear of rooftops & towers
  S.near = 0;
  for (const b of world.colliders) {
    const pad = 1.35;
    const dx = Math.max(b.min.x - pad - S.pos.x, 0, S.pos.x - b.max.x - pad);
    const dy = Math.max(b.min.y - pad - S.pos.y, 0, S.pos.y - b.max.y - pad);
    const dz = Math.max(b.min.z - pad - S.pos.z, 0, S.pos.z - b.max.z - pad);
    const out = Math.hypot(dx, dy, dz);
    if (out < 6.5) S.near = Math.max(S.near, 1 - out / 6.5);
    if (out > 0) continue;
    const px = [S.pos.x - (b.min.x - pad), b.max.x + pad - S.pos.x];
    const py = [S.pos.y - (b.min.y - pad), b.max.y + pad - S.pos.y];
    const pz = [S.pos.z - (b.min.z - pad), b.max.z + pad - S.pos.z];
    const m = Math.min(...px, ...py, ...pz);
    const push = Math.min(1, dt * 10);
    if (m === py[1]) { S.pos.y += m * push; S.vy = Math.max(S.vy, 0); }
    else if (m === py[0]) S.pos.y -= m * push;
    else if (m === px[0]) S.pos.x -= m * push;
    else if (m === px[1]) S.pos.x += m * push;
    else if (m === pz[0]) S.pos.z -= m * push;
    else S.pos.z += m * push;
    S.speed *= Math.exp(-dt * 2.5);
  }
  S.pitch += (Math.atan2(S.vy, Math.max(S.speed, 3)) * 0.7 - S.pitch) * (1 - Math.exp(-dt * 3));
}

// ================================================================ CAMERA
const cam = { pos: new V3(), look: new V3(), ready: false };
let view = null;
const ray = new THREE.Ray();

function follow(dt) {
  fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  const right = new V3(Math.cos(S.yaw), 0, -Math.sin(S.yaw));

  let dist, upOff, sideOff, lookAhead, lookUp, baseFov;
  if (camMode === 1) {
    // Cinematic wide vista
    dist = 7.4 + S.speed * 0.16; upOff = 2.8; sideOff = 0.0; lookAhead = 12; lookUp = 1.6; baseFov = 58;
  } else if (camMode === 2) {
    // Intimate close-up portrait framing the sculpted witch, bow streamers, lantern & black cat!
    dist = 2.65; upOff = 0.85; sideOff = -1.65; lookAhead = 0.2; lookUp = 0.45; baseFov = 42;
  } else {
    // Hero third-person flight framing (slightly off-center to show silhouette & broom profile gracefully!)
    dist = 4.6 + S.speed * 0.11; upOff = 1.85; sideOff = -0.58; lookAhead = 7.5; lookUp = 1.25; baseFov = 51;
  }

  const want = S.pos.clone()
    .addScaledVector(fwd, -dist)
    .addScaledVector(right, sideOff);
  want.y += upOff + S.speed * 0.02 - S.vy * 0.10;

  const from = S.pos.clone().add(tmp.set(0, 0.8, 0));
  const dir = want.clone().sub(from), len = dir.length();
  ray.set(from, dir.normalize());
  let hit = len;
  for (const b of world.colliders) {
    if (b.distanceToPoint(from) > len) continue;
    const p = ray.intersectBox(b, tmp);
    if (p) hit = Math.min(hit, p.distanceTo(from) - 0.6);
  }
  if (hit < len) want.copy(from).addScaledVector(dir, Math.max(hit, 1.2));
  want.y = Math.max(want.y, Math.max(groundH(want.x, want.z), 0) + 1.1);

  const lookAt = S.pos.clone().addScaledVector(fwd, lookAhead).add(tmp.set(0, lookUp, 0));
  if (!cam.ready) { cam.pos.copy(want); cam.look.copy(lookAt); cam.ready = true; }
  cam.pos.lerp(want, hit < len ? 1 - Math.exp(-dt * 12) : 1 - Math.exp(-dt * 3.8));
  cam.look.lerp(lookAt, 1 - Math.exp(-dt * 6.5));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  camera.rotateZ(S.bank * (camMode === 2 ? 0.08 : 0.18));

  if (view) {
    camera.position.copy(view.off).applyAxisAngle(tmp.set(0, 1, 0), S.yaw).add(S.pos);
    camera.lookAt(S.pos.x, S.pos.y + 0.36, S.pos.z);
  }
  const fov = baseFov + (S.speed - 3.5) * 0.45;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 2.4));
    camera.updateProjectionMatrix();
  }
}

// ================================================================ LOOP
const clock = new THREE.Clock();
let t = 0, white = 0, fpsT = 0, frames = 0, fps = 60;
const HARBOUR = world.waterAt || new V3(0, 0, 90);
const BELL = world.bellAt || TOWER;

function tick(dt, render = true) {
  t += dt;
  THEME_U.uTime.value = t;
  if (started || autoPilot) fly(dt, t);

  rider.root.position.copy(S.pos);
  rider.root.rotation.set(S.pitch, S.yaw, S.bank, 'YXZ');
  rider.update(t, S, dt);
  follow(dt);

  // Silky cloud-mist whiteout when flying through a mid-altitude puff
  const cg = world.cloudGroup.position;
  let inside = 0;
  for (const p of world.puffs) {
    const d = tmp.copy(p.c).add(cg).distanceTo(camera.position);
    if (d < p.r) inside = Math.max(inside, 1 - d / p.r);
  }
  white += (Math.min(1, inside * 2.1) * 0.88 - white) * (1 - Math.exp(-dt * 5));
  post.grade.uniforms.uWhite.value = white;

  world.update(t, dt, { camera, focus: S.pos, rider: S.pos });

  const hd = S.pos.distanceTo(HARBOUR);
  sound.update(dt, {
    speed: S.speed, bank: S.bank, near: S.near, alt: S.pos.y,
    harbour: Math.exp(-hd / 260) * (1 - smooth(20, 175, S.pos.y)),
    gulls: Math.exp(-hd / 420) + (world.gullScatter || 0) * 0.3,
    bell: Math.exp(-S.pos.distanceTo(BELL) / 360),
  });

  if (!render) return;
  renderer.shadowMap.needsUpdate = true;
  post.composer.render(dt);

  frames++; fpsT += dt;
  if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  hud.textContent = `${Math.round(S.pos.y)} m · ${Math.round(S.speed * 3.6)} km/h · ${STYLES[currentStyle].label}${params.has('fps') ? ` · ${fps.toFixed(0)} fps` : ''}`;
}
renderer.setAnimationLoop(() => tick(Math.min(clock.getDelta(), 1 / 20)));

// Debug & headless screenshot harness
function step(seconds, hold = []) {
  started = true;
  for (const c of hold) keys[c] = true;
  for (let i = 0; i < seconds * 30; i++) tick(1 / 30, false);
  for (const c of hold) keys[c] = false;
  tick(1 / 30);
}
let cinema = null;
function render(pos, look, roll = 0, fov = null) {
  if (fov != null && Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  if (pos) {
    camera.position.set(...pos);
    camera.lookAt(...look);
    if (roll) camera.rotateZ(roll);
  }
  renderer.shadowMap.needsUpdate = true;
  post.composer.render(1 / 30);
}
function cinemaFrame(dt, riderPose, camPos, camLook, roll = 0, fov = 50) {
  t += dt;
  THEME_U.uTime.value = t;
  S.pos.set(riderPose.x, riderPose.y, riderPose.z);
  S.yaw = riderPose.yaw ?? 0;
  S.bank = riderPose.bank ?? 0;
  S.pitch = riderPose.pitch ?? 0;
  S.speed = riderPose.speed ?? 14;
  S.vy = riderPose.vy ?? 0;
  rider.root.position.copy(S.pos);
  rider.root.rotation.set(S.pitch, S.yaw, S.bank, 'YXZ');
  rider.update(t, S, dt);

  camera.position.set(camPos[0], camPos[1], camPos[2]);
  camera.lookAt(camLook[0], camLook[1], camLook[2]);
  if (roll) camera.rotateZ(roll);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  world.update(t, dt, { camera, focus: S.pos, rider: S.pos });
  post.grade.uniforms.uWhite.value = 0;
  renderer.shadowMap.needsUpdate = true;
  post.composer.render(dt);
}
window.game = {
  ready: true,
  S, camera, scene, world,
  setStyle, setCamMode,
  resetTrails: () => rider.resetTrails(),
  setPose: (x, y, z, yaw = 0, bank = 0, pitch = 0) => {
    S.pos.set(x, y, z); S.yaw = yaw; S.bank = bank; S.pitch = pitch;
    cam.ready = false;
    rider.resetTrails();
    tick(1 / 30, true);
  },
  step, render, cinemaFrame,
  stopLoop: () => renderer.setAnimationLoop(null),
  view: (x, y, z) => { view = x == null ? null : { off: new V3(x, y, z) }; tick(1 / 60, true); },
};
