import * as THREE from 'three';
import { buildWorld, FOG_DENSITY, HAZE, TOWER } from './world.js';
import { buildRider } from './rider.js';
import { buildPost } from './post.js';
import { Sound } from './audio.js';
import { groundH, smooth, CITY } from './util.js';

const V3 = THREE.Vector3;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HAZE, FOG_DENSITY);
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.2, 5000);

const world = buildWorld(scene);
const rider = buildRider();
scene.add(rider.root);
const post = buildPost(renderer, scene, camera, world.hideInNormals);
const sound = new Sound(CITY);
if (CITY === 'harbour') document.querySelector('#title p').textContent = 'a summer morning over the harbour town';

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

// ---------------------------------------------------------------- input

const keys = {};
const mouse = { down: false, x: 0, y: 0 };
const title = document.getElementById('title'), hud = document.getElementById('hud');
let started = false, uiHidden = false;
function begin() {
  sound.start();
  if (!started) { started = true; setTimeout(() => title.classList.add('hidden'), 1500); }
}
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  begin();
  if (e.code === 'KeyH') { uiHidden = !uiHidden; hud.classList.toggle('hidden', uiHidden); if (uiHidden) title.classList.add('hidden'); }
  if (e.code === 'KeyM') sound.toggleMute();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('pointerdown', (e) => { mouse.down = true; begin(); onMove(e); });
addEventListener('pointerup', () => { mouse.down = false; });
addEventListener('pointermove', onMove);
function onMove(e) { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; }
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
const k = (...codes) => codes.some((c) => keys[c]);

// ---------------------------------------------------------------- flight

const params = new URLSearchParams(location.search);
const pose = (params.get('at') || (world.start || [0, 42, 175, 0]).join(',')).split(',').map(Number);
const CENTER = world.center || new THREE.Vector2(0, 60);
const S = { pos: new V3(pose[0], pose[1], pose[2]), yaw: pose[3] || 0, speed: 13, vy: 0, bank: 0, pitch: 0, near: 0 };
const fwd = new V3();
const tmp = new V3();

function fly(dt, t) {
  const auto = params.has('auto');   // gentle scripted drift, for recording without hands on keys
  const mx = mouse.down ? THREE.MathUtils.clamp(mouse.x * 1.4, -1, 1) : 0;
  const my = mouse.down ? THREE.MathUtils.clamp(-mouse.y * 1.4, -1, 1) : 0;
  const target = k('KeyW', 'ArrowUp') ? 24 : k('KeyS', 'ArrowDown') ? 3.5 : 13;
  S.speed += (target - S.speed) * (1 - Math.exp(-dt * 0.9));
  let steer = (k('KeyA', 'ArrowLeft') ? 1 : 0) - (k('KeyD', 'ArrowRight') ? 1 : 0) - mx;
  if (auto) steer += Math.sin(t * 0.13) * 0.45;

  // soft boundary: bank back toward the town
  const cx = S.pos.x - CENTER.x, cz = S.pos.z - CENTER.y, r = Math.hypot(cx, cz);
  const edge = smooth(820, 980, r);
  if (edge > 0) {
    const home = Math.atan2(cx, cz);                        // yaw that faces the centre
    const diff = Math.atan2(Math.sin(home - S.yaw), Math.cos(home - S.yaw));
    steer += THREE.MathUtils.clamp(diff * 2, -1, 1) * edge * 1.3;
  }
  steer = THREE.MathUtils.clamp(steer, -1.2, 1.2);
  S.bank += (steer * 0.62 - S.bank) * (1 - Math.exp(-dt * 2.4));
  S.yaw += S.bank * (0.55 + 3.5 / Math.max(S.speed, 4)) * 0.55 * dt;

  let climb = (k('Space') ? 1 : 0) - (k('ShiftLeft', 'ShiftRight') ? 1 : 0) + my;
  if (auto) climb += Math.sin(t * 0.21 + 1) * 0.35;
  S.vy += (THREE.MathUtils.clamp(climb, -1, 1) * 7.5 - S.vy) * (1 - Math.exp(-dt * 2.2));

  fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  S.pos.addScaledVector(fwd, S.speed * dt);
  S.pos.y += S.vy * dt;

  // ceiling and ground, both soft
  if (S.pos.y > 235) { S.pos.y += (235 - S.pos.y) * (1 - Math.exp(-dt * 2)); S.vy = Math.min(S.vy, 0); }
  const floor = Math.max(groundH(S.pos.x, S.pos.z), 0) + 2.2;
  if (S.pos.y < floor) { S.pos.y += (floor - S.pos.y) * (1 - Math.exp(-dt * 8)); S.vy = Math.max(S.vy, 0); }

  // buildings push the broom away gently and slow it
  S.near = 0;
  for (const b of world.colliders) {
    const pad = 1.3;
    const dx = Math.max(b.min.x - pad - S.pos.x, 0, S.pos.x - b.max.x - pad);
    const dy = Math.max(b.min.y - pad - S.pos.y, 0, S.pos.y - b.max.y - pad);
    const dz = Math.max(b.min.z - pad - S.pos.z, 0, S.pos.z - b.max.z - pad);
    const out = Math.hypot(dx, dy, dz);
    if (out < 6) S.near = Math.max(S.near, 1 - out / 6);
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

// ---------------------------------------------------------------- camera

const cam = { pos: new V3(), look: new V3(), ready: false };
let view = null;
const ray = new THREE.Ray();
function follow(dt) {
  fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  const dist = 5.2 + S.speed * 0.13;
  const want = S.pos.clone().addScaledVector(fwd, -dist);
  want.y += 2.3 + S.speed * 0.03 - S.vy * 0.12;
  // never let a roof come between us and her
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
  want.y = Math.max(want.y, Math.max(groundH(want.x, want.z), 0) + 1.0);

  const lookAt = S.pos.clone().addScaledVector(fwd, 6).add(tmp.set(0, 1.5, 0));
  if (!cam.ready) { cam.pos.copy(want); cam.look.copy(lookAt); cam.ready = true; }
  cam.pos.lerp(want, hit < len ? 1 - Math.exp(-dt * 12) : 1 - Math.exp(-dt * 3.2));
  cam.look.lerp(lookAt, 1 - Math.exp(-dt * 6));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  camera.rotateZ(S.bank * 0.2);
  if (view) {   // debug: look at her from an offset in her own frame
    camera.position.copy(view.off).applyAxisAngle(tmp.set(0, 1, 0), S.yaw).add(S.pos);
    camera.lookAt(S.pos.x, S.pos.y + 0.35, S.pos.z);
  }
  const fov = 52 + (S.speed - 3.5) * 0.6;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 2)); camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------- loop

const clock = new THREE.Clock();
let t = 0, white = 0, fpsT = 0, frames = 0, fps = 60;
const HARBOUR = world.waterAt || new V3(-10, 0, 25);
const BELL = world.bellAt || TOWER;

function tick(dt, render = true) {
  t += dt;
  if (started || params.has('auto')) fly(dt, t);

  rider.root.position.copy(S.pos);
  rider.root.rotation.set(S.pitch, S.yaw, S.bank, 'YXZ');
  rider.update(t, S, dt);
  follow(dt);

  // inside a cloud: white out
  const cg = world.cloudGroup.position;
  let inside = 0;
  for (const p of world.puffs) {
    const d = tmp.copy(p.c).add(cg).distanceTo(camera.position);
    if (d < p.r) inside = Math.max(inside, 1 - d / p.r);
  }
  white += (Math.min(1, inside * 2.2) * 0.92 - white) * (1 - Math.exp(-dt * 5));
  post.grade.uniforms.uWhite.value = white;

  world.update(t, dt, { camera, focus: S.pos, rider: S.pos });

  const hd = S.pos.distanceTo(HARBOUR);
  sound.update(dt, {
    speed: S.speed, bank: S.bank, near: S.near,
    harbour: Math.exp(-hd / 260) * (1 - smooth(20, 170, S.pos.y)),
    gulls: Math.exp(-hd / 400) + (world.gullScatter || 0) * 0.3,
    bell: Math.exp(-S.pos.distanceTo(BELL) / 350),
  });

  if (!render) return;
  renderer.shadowMap.needsUpdate = true;
  post.composer.render(dt);

  frames++; fpsT += dt;
  if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  hud.textContent = `${Math.round(S.pos.y)} m · ${Math.round(S.speed * 3.6)} km/h${params.has('fps') ? ` · ${fps.toFixed(0)} fps` : ''}`;
}
renderer.setAnimationLoop(() => tick(Math.min(clock.getDelta(), 1 / 20)));

// debug: advance the simulation without animation frames, holding the given keys
function step(seconds, hold = []) {
  started = true;
  for (const c of hold) keys[c] = true;
  for (let i = 0; i < seconds * 30; i++) tick(1 / 30, false);
  for (const c of hold) keys[c] = false;
  tick(1 / 30);
}
function render(pos, look) {
  if (pos) { camera.position.set(...pos); camera.lookAt(...look); }
  renderer.shadowMap.needsUpdate = true;
  post.composer.render(1 / 30);
}
window.game = { S, camera, scene, world, step, render, view: (x, y, z) => { view = x == null ? null : { off: new V3(x, y, z) }; } };
