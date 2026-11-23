import * as THREE from 'three';
import { NOISE_GLSL } from './toon.js';
import { THEME_U, STYLES } from './styles.js';
import { Bucket, M, CITY, RIVER_HW, fbm, vnoise, shoreZ, riverZ } from './util.js';

const V3 = THREE.Vector3;

// ================================================================ SKY DOME
export function buildSky(scene, W) {
  const st = STYLES.ghibli;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: THEME_U.uTime,
      uSunDir: THEME_U.uSunDir,
      uZenith: { value: st.skyZenith.clone() },
      uUpper: { value: st.skyUpper.clone() },
      uLower: { value: st.skyLower.clone() },
      uHorizon: { value: st.skyHorizon.clone() },
      uSunHalo: { value: st.sunHalo.clone() },
      uSunCore: { value: st.sunCore.clone() },
      uCirrusCol: { value: st.cirrusColor.clone() },
      uCirrusAlpha: { value: st.cirrusAlpha },
      uCelestial: { value: st.celestialAlpha },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uCirrusAlpha, uCelestial;
      uniform vec3 uSunDir, uZenith, uUpper, uLower, uHorizon, uSunHalo, uSunCore, uCirrusCol;
      varying vec3 vDir;
      ${NOISE_GLSL}

      void main() {
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);

        // Rich 4-stop painterly sky gradient
        vec3 c = mix(uHorizon, uLower, smoothstep(0.0, 0.14, y));
        c = mix(c, uUpper, smoothstep(0.10, 0.44, y));
        c = mix(c, uZenith, smoothstep(0.36, 0.88, y));

        // Warm horizon atmospheric glow biased toward sun azimuth
        float sunDot = clamp(dot(d, normalize(uSunDir)), 0.0001, 1.0);
        float horizGlow = (1.0 - smoothstep(0.0, 0.36, y)) * pow(sunDot, 2.2);
        c = mix(c, mix(uHorizon, uSunHalo, 0.65), horizGlow * 0.55);

        // Moebius giant serene ringed celestial planet + twin crescent moon + delicate orbital astrolabe arc
        if (uCelestial > 0.01) {
          vec3 pDir = normalize(vec3(-0.24, 0.30, -0.92));
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), pDir));
          vec3 up = cross(pDir, right);
          vec2 lp = vec2(dot(d - pDir, right), dot(d - pDir, up));
          float pd = length(lp);
          float rPlanet = 0.125;
          // Tilted thin double planetary rings
          vec2 rp = mat2(0.92, -0.39, 0.39, 0.92) * lp;
          float ringR = length(vec2(rp.x, rp.y * 4.5));
          float ring1 = smoothstep(0.007, 0.0018, abs(ringR - 0.205));
          float ring2 = smoothstep(0.0035, 0.0009, abs(ringR - 0.235)) * 0.6;
          float inFront = step(0.0, rp.y) + step(rPlanet, pd);
          float ringMask = clamp(ring1 + ring2, 0.0, 1.0) * clamp(inFront, 0.0, 1.0);
          // Planet disk with soft crescent shading & delicate ink rim
          float disk = smoothstep(rPlanet + 0.003, rPlanet - 0.003, pd);
          float rimLine = smoothstep(0.0028, 0.0007, abs(pd - rPlanet));
          vec3 pNorm = normalize(vec3(lp / rPlanet, sqrt(max(0.0, 1.0 - dot(lp / rPlanet, lp / rPlanet)))));
          float pLit = smoothstep(-0.12, 0.28, dot(pNorm, normalize(vec3(0.7, 0.4, 0.55))));
          vec3 pCol = mix(uUpper * 0.97, vec3(0.99, 0.95, 0.88), pLit * 0.84);
          c = mix(c, pCol, disk * 0.72 * uCelestial);
          c = mix(c, vec3(0.32, 0.26, 0.44), rimLine * 0.34 * uCelestial);
          c = mix(c, vec3(0.99, 0.94, 0.86), ringMask * 0.66 * uCelestial);

          // Small companion crescent moon & sweeping hairline orbital arc
          vec3 mDir = normalize(vec3(0.18, 0.38, -0.90));
          float md = length(d - mDir);
          float mDisk = smoothstep(0.036, 0.032, md) * smoothstep(0.025, 0.034, length(d - normalize(mDir + vec3(-0.018, 0.006, 0.0))));
          c = mix(c, vec3(0.99, 0.96, 0.89), mDisk * 0.72 * uCelestial);
          float orbArc = smoothstep(0.0022, 0.0006, abs(length(lp - vec2(0.05, -0.02)) - 0.44)) * smoothstep(0.08, 0.26, y);
          c = mix(c, vec3(0.99, 0.94, 0.86), orbArc * 0.24 * uCelestial);
        }

        // High-altitude painted cirrus streaks drifting slowly
        if (y > 0.03) {
          vec2 skyUv = d.xz / (y + 0.22);
          float drift = uTime * 0.006;
          float warp = fbm2(skyUv * 0.75 + vec2(drift, -drift * 0.4));
          float wisp = fbm2(skyUv * vec2(1.5, 4.2) + vec2(warp * 1.4 + drift * 1.6, warp * 0.8));
          float band = smoothstep(0.54, 0.74, wisp) * smoothstep(0.03, 0.22, y) * (1.0 - smoothstep(0.55, 0.92, y));
          vec3 cirCol = mix(uCirrusCol, uSunHalo * 1.15, pow(sunDot, 3.0) * 0.55);
          c = mix(c, cirCol, band * uCirrusAlpha);
        }

        // Sun halo, delicate crepuscular shafts & luminous sun disk
        float ang = atan(d.y - uSunDir.y, d.x - uSunDir.x);
        float rays = 0.5 + 0.5 * sin(ang * 9.0 + uTime * 0.15) * sin(ang * 5.0 - 0.6);
        c += uSunHalo * (pow(sunDot, 8.0) * 0.28 + pow(sunDot, 48.0) * (0.45 + 0.16 * rays));
        c = mix(c, uSunCore * 3.4, smoothstep(0.9991, 0.99965, sunDot));

        gl_FragColor = vec4(c, 1.0);
      }`,
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(3400, 40, 22), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -2;
  scene.add(dome);
  W.hideInNormals.push(dome);
  W.updaters.push((t, dt, { camera }) => dome.position.copy(camera.position));

  W.styleListeners.push((s) => {
    mat.uniforms.uZenith.value.copy(s.skyZenith);
    mat.uniforms.uUpper.value.copy(s.skyUpper);
    mat.uniforms.uLower.value.copy(s.skyLower);
    mat.uniforms.uHorizon.value.copy(s.skyHorizon);
    mat.uniforms.uSunHalo.value.copy(s.sunHalo);
    mat.uniforms.uSunCore.value.copy(s.sunCore);
    mat.uniforms.uCirrusCol.value.copy(s.cirrusColor);
    mat.uniforms.uCirrusAlpha.value = s.cirrusAlpha;
    mat.uniforms.uCelestial.value = s.celestialAlpha;
  });
}

// ================================================================ DISTANT MOUNTAIN SILHOUETTE RING
export function buildMountains(scene, W) {
  const st = STYLES.ghibli;
  const P = CITY === 'prague';

  const makeRange = (radius, segs, maxH, baseY, seedOff, layer, arcStart, arcSpan) => {
    const pos = [];
    const uv = [];
    const norm = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = arcStart + u * arcSpan;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Taper cleanly into sea/horizon at arc ends for harbour coastal range
      const endFade = P ? 1.0 : Math.sin(u * Math.PI);
      const ridge1 = Math.pow(fbm(ca * 3.2 + seedOff, sa * 3.2 + seedOff * 1.7, 4), 1.45);
      const ridge2 = Math.abs(fbm(ca * 8.5 + seedOff * 2.3, sa * 8.5 - seedOff, 3) - 0.45) * 1.3;
      const peak = (ridge1 * 0.78 + ridge2 * 0.28) * maxH * (P ? 1.0 : Math.pow(endFade, 0.55));
      const x = ca * radius, z = sa * radius;
      // Bottom vertex & crest vertex
      pos.push(x, baseY, z, x, baseY + Math.max(2, peak), z);
      uv.push(u, 0, u, 1);
      // Approximate normal leaning sunward/inward
      const nx = -ca, nz = -sa;
      norm.push(nx, 0.35, nz, nx, 0.65, nz);
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geo.setIndex(idx);

    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uSunDir: THEME_U.uSunDir,
        uNear: { value: st.mtnNear.clone() },
        uFar: { value: st.mtnFar.clone() },
        uSnow: { value: st.mtnSnow.clone() },
        uHorizon: { value: st.skyHorizon.clone() },
        uLayer: { value: layer },
      },
      vertexShader: /* glsl */`
        varying vec3 vW;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir, uNear, uFar, uSnow, uHorizon;
        uniform float uLayer;
        varying vec3 vW;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          vec3 baseCol = mix(uNear, uFar, uLayer);
          float h = vUv.y;
          // Painterly rock-facet striations & sunward snow caps
          float facet = fbm2(vec2(vUv.x * 46.0, h * 9.0 + uLayer * 5.0));
          float litSide = smoothstep(0.38, 0.62, facet);
          vec3 col = mix(baseCol * 0.84, baseCol * 1.14, litSide);
          // Snow-dusted alpine peaks on the higher distant range
          float snowMask = smoothstep(0.68, 0.88, h + (facet - 0.5) * 0.22) * (0.45 + 0.55 * uLayer);
          col = mix(col, uSnow, snowMask * 0.72);
          // Warm sun-scatter haze melting the mountain base softly into the horizon
          vec3 vdir = normalize(vW - cameraPosition + vec3(0.0001));
          float sunS = pow(clamp(dot(vdir, normalize(uSunDir)), 0.0001, 1.0), 3.0);
          vec3 mist = mix(uHorizon, uSnow, sunS * 0.35);
          float baseMist = 1.0 - smoothstep(0.0, 0.52, h);
          col = mix(col, mist, clamp(baseMist * 0.72 + uLayer * 0.25, 0.0, 0.86));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -1;
    scene.add(mesh);
    W.hideInNormals.push(mesh);
    W.styleListeners.push((s) => {
      mat.uniforms.uNear.value.copy(s.mtnNear);
      mat.uniforms.uFar.value.copy(s.mtnFar);
      mat.uniforms.uSnow.value.copy(s.mtnSnow);
      mat.uniforms.uHorizon.value.copy(s.skyHorizon);
    });
  };

  if (P) {
    // Full 360° Bohemian rolling mountain backdrop
    makeRange(1950, 140, 210, -20, 4.2, 0.2, 0, Math.PI * 2);
    makeRange(2450, 160, 320, -25, 11.7, 0.85, 0, Math.PI * 2);
  } else {
    // Dramatic Mediterranean coastal mountain ranges wrapping west -> north -> east,
    // leaving south (+z, angle ~PI/2) completely open ocean!
    makeRange(1850, 110, 310, -18, 2.5, 0.15, Math.PI * 0.92, Math.PI * 1.16);
    makeRange(2400, 130, 520, -24, 9.4, 0.85, Math.PI * 0.86, Math.PI * 1.28);
  }
}

// ================================================================ SILKY SOFT BILLOWING CUMULUS CLOUDS
function billowSphereGeo(radius = 1, seed = 1) {
  // Smooth high-segment indexed sphere with airy, rounded billow curves (zero harsh pancake pinch!)
  const g = new THREE.SphereGeometry(radius, 28, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n1 = Math.sin(x * 2.2 + seed) * Math.cos(y * 2.1 - seed * 0.7) * Math.sin(z * 2.2 + seed * 1.3);
    const n2 = Math.sin(x * 4.1 - seed * 1.4 + z * 2.3) * Math.cos(y * 3.9 + x * 1.8);
    const disp = 1.0 + n1 * 0.11 + n2 * 0.038;
    // Silky smooth bottom compression via smoothstep-like curve (never a sharp crease!)
    const tBot = Math.max(0, -y);
    const softY = y + tBot * tBot * 0.24;
    p.setXYZ(i, x * disp, softY * disp, z * disp);
  }
  g.computeVertexNormals();
  return g;
}

export function buildClouds(scene, W, R) {
  const st = STYLES.moebius;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: THEME_U.uTime,
      uSunDir: THEME_U.uSunDir,
      uLit: { value: st.cloudLit.clone() },
      uMid: { value: st.cloudMid.clone() },
      uShade: { value: st.cloudShade.clone() },
      uBase: { value: st.cloudBase.clone() },
      uRim: { value: st.cloudRim.clone() },
      uSkyMix: { value: st.cloudSkyMix.clone() },
      uFogCool: THEME_U.uFogCool,
      uFogWarm: THEME_U.uFogWarm,
      uFogD: THEME_U.uFogDensity,
    },
    vertexShader: /* glsl */`
      varying vec3 vN;
      varying vec3 vW;
      varying float vLocalY;
      void main() {
        vLocalY = position.y;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFogD;
      uniform vec3 uSunDir, uLit, uMid, uShade, uBase, uRim, uSkyMix, uFogCool, uFogWarm;
      varying vec3 vN;
      varying vec3 vW;
      varying float vLocalY;
      ${NOISE_GLSL}

      void main() {
        vec3 n = length(vN) > 0.0001 ? normalize(vN) : vec3(0.0, 1.0, 0.0);
        vec3 sun = normalize(uSunDir);
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec3 viewDir = dist > 0.0001 ? toCam / dist : vec3(0.0, 0.0, 1.0);

        // Multi-scale watercolor billow noise softens shadow bands into lush painted washes
        float b1 = vn3(vW * 0.026 + vec3(uTime * 0.025, 0.0, 0.0));
        float b2 = vn3(vW * 0.068 - vec3(0.0, uTime * 0.015, 0.0));
        float billow = (b1 * 0.65 + b2 * 0.35 - 0.5);

        float ndl = dot(n, sun) * 0.5 + 0.5;
        float up = n.y * 0.5 + 0.5;
        float heightBoost = smoothstep(-25.0, 62.0, vLocalY);
        float k = ndl * 0.52 + up * 0.36 + heightBoost * 0.16 + billow * 0.28;

        // Silky, painterly watercolor cloud shading (soft transitions — zero harsh plastic bands!)
        vec3 c = mix(uBase, uShade, smoothstep(0.18, 0.40, k));
        c = mix(c, uMid, smoothstep(0.38, 0.62, k));
        c = mix(c, uLit, smoothstep(0.62, 0.84, k));

        // Soft luminous sunlit rim glow & atmospheric sky-edge feathering (NaN-safe clamped pow!)
        float fresnel = clamp(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 0.0001, 1.0);
        float backSun = pow(clamp(dot(-viewDir, sun), 0.0001, 1.0), 2.2);
        c += uRim * pow(fresnel, 2.2) * (0.24 + 0.66 * backSun) * smoothstep(0.30, 0.72, k) * 0.38;

        // Feather outer silhouette gently toward sky mist so clouds never feel sharp/cutout!
        float edgeSoft = pow(fresnel, 2.4) * (0.42 + 0.25 * (1.0 - smoothstep(0.45, 0.82, k)));
        vec3 skyHalo = mix(uSkyMix, uLit * 0.96, smoothstep(0.50, 0.88, k) * 0.65);
        c = mix(c, skyHalo, clamp(edgeSoft, 0.0, 0.58));

        // Atmospheric aerial mist blending seamlessly into horizon
        float sunS = pow(clamp(dot(-viewDir, sun), 0.0001, 1.0), 4.0);
        vec3 haze = mix(uFogCool, uFogWarm, sunS * 0.75);
        float fogF = 1.0 - exp(-pow(max(dist * uFogD * 0.55, 0.0001), 1.8));
        c = mix(c, haze, clamp(fogF * 0.74, 0.0, 0.78));

        gl_FragColor = vec4(clamp(c, vec3(0.0), vec3(4.0)), 1.0);
      }`,
  });

  // Pre-build 4 smooth billowy cloud puff templates
  const puffTemplates = [
    billowSphereGeo(1, 1.3),
    billowSphereGeo(1, 4.7),
    billowSphereGeo(1, 9.1),
    billowSphereGeo(1, 14.5),
  ];

  const group = new THREE.Group();

  // Mid-altitude flyable cumulus clouds (player can swoop around and fly right through them!)
  const midSpots = [
    [65, 118, -85, 44],
    [-165, 112, 35, 38],
    [255, 138, -230, 62],
    [-315, 148, -280, 68],
    [135, 98, 260, 38],
    [-85, 155, 360, 54],
    [430, 128, 115, 56],
    [-460, 125, -55, 52],
    [310, 168, 450, 68],
    [-250, 118, 510, 48],
  ];

  // Monumental towering Miyazaki summer thunderheads framing the horizon behind mountains & sea!
  const giantSpots = [
    [-380, 165, -740, 165],
    [220, 175, -820, 185],
    [680, 165, -560, 155],
    [-760, 160, -340, 148],
    [-80, 190, -1040, 210],
    [820, 165, 220, 135],
    [-740, 160, 520, 130],
    [380, 185, 860, 145],
    [-260, 195, 960, 155],
  ];

  const buildCluster = (cx, cy, cz, S, isGiant) => {
    const b = new Bucket();
    const addLobe = (x, y, z, rx, ry, rz) => {
      const tpl = puffTemplates[Math.floor(R() * puffTemplates.length)];
      b.add(tpl, M(x, y, z, (R() - 0.5) * 0.25, R() * 6.28, (R() - 0.5) * 0.25, rx, ry, rz), '#ffffff');
      if (!isGiant) W.puffs.push({ c: new V3(cx + x, cy + y, cz + z), r: Math.max(rx, rz) * 0.78 });
    };

    // Broad flat-bottomed cumulus deck
    const nBase = (isGiant ? 11 : 8) + Math.floor(R() * 4);
    for (let i = 0; i < nBase; i++) {
      const a = (i / nBase) * Math.PI * 2 + (R() - 0.5) * 0.45;
      const rad = S * (0.28 + 0.62 * Math.sqrt(R()));
      const r = S * (0.28 + R() * 0.20);
      addLobe(Math.cos(a) * rad, (R() - 0.3) * S * 0.08, Math.sin(a) * rad * 0.68, r * 1.18, r * 0.56, r);
    }
    // Mid billowing shoulders
    const nMid = (isGiant ? 9 : 6) + Math.floor(R() * 3);
    for (let i = 0; i < nMid; i++) {
      const a = R() * Math.PI * 2;
      const rad = S * 0.44 * Math.sqrt(R());
      const r = S * (0.28 + R() * 0.18);
      addLobe(Math.cos(a) * rad, S * (0.24 + R() * 0.18), Math.sin(a) * rad * 0.65, r, r * 0.92, r * 0.95);
    }
    // Towering sunlit crown & secondary cauliflower turret
    const nTop = (isGiant ? 6 : 3) + Math.floor(R() * 2);
    for (let i = 0; i < nTop; i++) {
      const a = R() * Math.PI * 2;
      const rad = S * (isGiant ? 0.28 : 0.20) * R();
      const r = S * (0.20 + R() * 0.16);
      const tall = isGiant ? (0.58 + R() * 0.42) : (0.52 + R() * 0.22);
      addLobe(Math.cos(a) * rad, S * tall, Math.sin(a) * rad * 0.6, r, r * 1.05, r);
    }
    // Wispy side puffs floating near the flanks
    for (let i = 0; i < 3; i++) {
      const a = R() * Math.PI * 2;
      const rad = S * (0.85 + R() * 0.35);
      const r = S * (0.14 + R() * 0.09);
      addLobe(Math.cos(a) * rad, S * (0.02 + R() * 0.18), Math.sin(a) * rad * 0.72, r * 1.35, r * 0.55, r);
    }

    const m = b.mesh(mat);
    m.position.set(cx, cy, cz);
    group.add(m);
  };

  for (const s of midSpots) buildCluster(s[0], s[1], s[2], s[3], false);
  for (const s of giantSpots) buildCluster(s[0], s[1], s[2], s[3], true);

  scene.add(group);
  W.hideInNormals.push(group);
  W.cloudGroup = group;
  W.updaters.push((t, dt) => { group.position.x += dt * 0.42; });

  W.styleListeners.push((s) => {
    mat.uniforms.uLit.value.copy(s.cloudLit);
    mat.uniforms.uMid.value.copy(s.cloudMid);
    mat.uniforms.uShade.value.copy(s.cloudShade);
    mat.uniforms.uBase.value.copy(s.cloudBase);
    mat.uniforms.uRim.value.copy(s.cloudRim);
    mat.uniforms.uSkyMix.value.copy(s.cloudSkyMix);
  });
}

// ================================================================ PAINTED WATER (ADRIATIC SEA / VLTAVA RIVER)
const WATER_GLSL = {
  harbour: /* glsl */`
    float shoreZ(float x) {
      float t = abs(x) / 250.0;
      return min(46.0 * t * t, 430.0) + 7.5 * sin(x * 0.026) + 3.5 * cos(x * 0.058);
    }
    float waterIn(vec2 p) { return p.y - shoreZ(p.x); }
    float obstacle(vec2 p) {
      float d = min(segDist(p, uMoleA, uMoleB) - 4.6, length(p - uMoleB) - 8.2);
      // Foam around eastern limestone sea arch pillars (leaving arch passage crystal clear!) & stacks
      d = min(d, length(p - vec2(198.0, 110.0)) - 7.8);
      d = min(d, length(p - vec2(232.0, 126.0)) - 7.8);
      d = min(d, length(p - vec2(252.0, 138.0)) - 9.2);
      d = min(d, length(p - vec2(-245.0, 92.0)) - 10.5);
      return d;
    }`,
  prague: /* glsl */`
    float riverZ(float x) { return 34.0 * sin(x * 0.0042 + 0.6) + 14.0 * sin(x * 0.0105 + 2.0); }
    float waterIn(vec2 p) { return ${RIVER_HW.toFixed(1)} - abs(p.y - riverZ(p.x)); }
    float obstacle(vec2 p) {
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

export function buildWater(scene, W, moleA, moleB) {
  const P = CITY === 'prague';
  const st = STYLES.ghibli;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: THEME_U.uTime,
      uSunDir: THEME_U.uSunDir,
      uShallow: { value: (P ? st.waterShallowPrague : st.waterShallowHarbour).clone() },
      uDeep: { value: (P ? st.waterDeepPrague : st.waterDeepHarbour).clone() },
      uSky: { value: st.waterSky.clone() },
      uFoam: { value: st.waterFoam.clone() },
      uGlint: { value: st.waterGlint.clone() },
      uFogCool: THEME_U.uFogCool,
      uFogWarm: THEME_U.uFogWarm,
      uFogD: THEME_U.uFogDensity,
      uMoleA: { value: moleA },
      uMoleB: { value: moleB },
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
      uniform vec3 uSunDir, uShallow, uDeep, uSky, uFoam, uGlint, uFogCool, uFogWarm;
      uniform vec2 uMoleA, uMoleB;
      varying vec3 vW;
      ${NOISE_GLSL}

      float segDist(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }
      ${WATER_GLSL[CITY]}

      void main() {
        vec2 p = vW.xz;
        float t = uTime;
        float d = waterIn(p);

        // Crystal turquoise shallows melting into deep cobalt sea / river
        float depthNoise = (fbm2(p * 0.015) - 0.5) * ${P ? '16.0' : '58.0'};
        float depthT = smoothstep(0.0, ${P ? '46.0' : '185.0'}, d + depthNoise);
        vec3 c = mix(uShallow, uDeep, depthT);

        // Elongated painted gouache brush ripples (anisotropic directional strokes)
        float warp = (vn(p * 0.03 + t * 0.14) - 0.5) * 4.5;
        vec2 wp = vec2(p.x + warp, p.y * 2.8 - warp * 0.6);
        float w1 = vn(vec2(wp.x * 0.055 + t * 0.32, wp.y * 0.085 - t * 0.24));
        float w2 = vn(vec2(wp.x * 0.095 - t * 0.22, wp.y * 0.15 + t * 0.18) + 23.4);
        float wave = w1 * 0.6 + w2 * 0.4;

        // Crisp stylized painted highlight & shadow wave facets
        float crest = smoothstep(0.60, 0.66, wave);
        float trough = 1.0 - smoothstep(0.32, 0.39, wave);
        c = mix(c, mix(c * 1.18, uSky, 0.26), crest * 0.68);
        c = mix(c, c * 0.84, trough * 0.52);

        // Fresnel sky & horizon reflection (NaN-safe clamped pow!)
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec3 V = dist > 0.0001 ? toCam / dist : vec3(0.0, 1.0, 0.0);
        vec3 sun = normalize(uSunDir);
        float fresnel = pow(clamp(1.0 - clamp(V.y, 0.0, 1.0), 0.0001, 1.0), 3.6);
        c = mix(c, uSky, clamp(fresnel * 0.62, 0.0, 0.68));

        // Sparkling painted diamond sun shimmer path (crisp twinkling highlights, never blown out!)
        vec3 N = normalize(vec3(
          (vn(p * 0.24 + vec2(t * 0.7, -t * 0.5)) - 0.5) * 0.28,
          1.0,
          (vn(p * 0.28 + vec2(-t * 0.6, t * 0.8) + 11.3) - 0.5) * 0.28
        ));
        float spec = clamp(dot(reflect(-V, N), sun), 0.0, 1.0);
        float sparkleA = smoothstep(0.968, 0.990, spec) * smoothstep(0.50, 0.66, vn(p * 0.75 + vec2(t * 1.4, -t * 1.1)));
        float sparkleB = smoothstep(0.935, 0.985, spec) * smoothstep(0.65, 0.75, wave) * 0.24;
        c += uGlint * (sparkleA + sparkleB);

        // Lacy animated double-ring coastal & obstacle foam
        float surfWave = sin(d * 0.95 - t * 2.2 + vn(p * 0.08) * 5.0);
        float wob = (vn(vec2(p.x * 0.11 + t * 0.2, p.y * 0.11 - t * 0.2)) - 0.5) * 2.6;
        float foamEdge = smoothstep(3.2, 0.6, d + wob);
        float foamRing = smoothstep(7.5, 2.2, d + wob) * smoothstep(0.55, 0.88, surfWave) * 0.65;
        float dm = obstacle(p);
        float foamObs = smoothstep(2.6, 0.4, dm + wob * 0.65);
        float lace = smoothstep(0.28, 0.52, vn(p * 0.38 + vec2(t * 0.45, -t * 0.25)));
        float foam = max(max(foamEdge, foamObs), foamRing) * (0.45 + 0.55 * lace);
        c = mix(c, uFoam, clamp(foam, 0.0, 0.95));

        // Seamless two-tone aerial horizon mist matching sky & terrain
        vec3 vdir = -V;
        float sunS = pow(clamp(dot(vdir, sun), 0.0001, 1.0), 4.0);
        vec3 aerial = mix(uFogCool, uFogWarm, clamp(sunS * 0.78 + 0.22, 0.0, 1.0));
        float fogF = 1.0 - exp(-pow(max(dist * uFogD * 0.82, 0.0001), 1.85));
        c = mix(c, aerial, clamp(fogF * 0.95, 0.0, 0.96));

        gl_FragColor = vec4(clamp(c, vec3(0.0), vec3(5.0)), 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  W.updaters.push((t, dt, { camera }) => {
    mesh.position.set(Math.round(camera.position.x / 50) * 50, 0, Math.round(camera.position.z / 50) * 50);
  });

  W.styleListeners.push((s) => {
    mat.uniforms.uShallow.value.copy(P ? s.waterShallowPrague : s.waterShallowHarbour);
    mat.uniforms.uDeep.value.copy(P ? s.waterDeepPrague : s.waterDeepHarbour);
    mat.uniforms.uSky.value.copy(s.waterSky);
    mat.uniforms.uFoam.value.copy(s.waterFoam);
    mat.uniforms.uGlint.value.copy(s.waterGlint);
  });
}

// ================================================================ DRIFTING SUNLIT MOTES / PETALS
export function buildMotes(scene, W, R) {
  const N = 220;
  const SPAN = 68;
  const pos = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  const size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3 + 0] = (R() - 0.5) * SPAN;
    pos[i * 3 + 1] = (R() - 0.5) * 32;
    pos[i * 3 + 2] = (R() - 0.5) * SPAN;
    phase[i] = R() * 6.283;
    size[i] = 2.6 + R() * 4.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: THEME_U.uTime,
      uCenter: { value: new V3() },
      uColor: { value: STYLES.ghibli.moteColor.clone() },
      uSpan: { value: SPAN },
      uNight: THEME_U.uNightGlow,
    },
    vertexShader: /* glsl */`
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime, uSpan, uNight;
      uniform vec3 uCenter;
      varying float vAlpha;
      void main() {
        vec3 rel = position;
        rel.x += sin(uTime * 0.45 + aPhase) * 2.5 + uTime * 1.1;
        rel.y += sin(uTime * 0.72 + aPhase * 1.7) * 1.4;
        rel.z += cos(uTime * 0.38 + aPhase * 1.3) * 2.2;
        vec3 halfS = vec3(uSpan * 0.5, 16.0, uSpan * 0.5);
        vec3 wrapped = mod(rel - uCenter + halfS, halfS * 2.0) - halfS;
        vec3 wp = uCenter + wrapped;
        float edge = 1.0 - smoothstep(uSpan * 0.34, uSpan * 0.5, length(wrapped.xz));
        float twinkle = 0.55 + 0.45 * sin(uTime * 2.4 + aPhase * 3.0);
        vAlpha = edge * twinkle * mix(0.45, 0.85, uNight);
        vec4 mv = modelViewMatrix * vec4(wp, 1.0);
        vAlpha *= smoothstep(1.5, 5.5, -mv.z);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * (34.0 / max(-mv.z, 3.0)), 1.0, 22.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float glow = smoothstep(1.0, 0.15, r);
        gl_FragColor = vec4(uColor * 1.35, glow * vAlpha);
      }`,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  scene.add(pts);
  W.hideInNormals.push(pts);
  W.updaters.push((t, dt, { rider }) => {
    mat.uniforms.uCenter.value.copy(rider);
  });
  W.styleListeners.push((s) => {
    mat.uniforms.uColor.value.copy(s.moteColor);
  });
}
