import * as THREE from 'three';
import { THEME_U } from './styles.js';

// Smooth-edged 3-band anime cel ramp (64x1) so transitions stay crisp yet anti-aliased.
const RAMP_W = 64;
const rampData = new Uint8Array(RAMP_W * 4);
for (let i = 0; i < RAMP_W; i++) {
  const u = i / (RAMP_W - 1);
  let v = 0;
  if (u > 0.30) v = Math.min(1, (u - 0.30) / 0.06) * 0.56;
  if (u > 0.66) v = 0.56 + Math.min(1, (u - 0.66) / 0.07) * 0.44;
  const b = Math.round(v * 255);
  rampData[i * 4] = rampData[i * 4 + 1] = rampData[i * 4 + 2] = b;
  rampData[i * 4 + 3] = 255;
}
export const GRAD = new THREE.DataTexture(rampData, RAMP_W, 1, THREE.RGBAFormat);
GRAD.minFilter = GRAD.magFilter = THREE.LinearFilter;
GRAD.generateMipmaps = false;
GRAD.needsUpdate = true;

export const NOISE_GLSL = /* glsl */`
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * vn(p);
    p = rot * p * 2.03 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}
`;

const AERIAL_FOG_GLSL = /* glsl */`
{
  float fogDist = length(vWPos - cameraPosition);
  vec3 vdir = (vWPos - cameraPosition) / max(fogDist, 0.001);
  float sunS = pow(clamp(dot(vdir, uSunDir), 0.0001, 1.0), 4.0);
  float lowH = 1.0 - smoothstep(-0.04, 0.34, vdir.y);
  vec3 aerial = mix(uFogCool, uFogWarm, clamp(sunS * 0.78 + lowH * 0.24, 0.0, 1.0));
  float hAtten = exp(-max(vWPos.y, 0.0) * 0.0028);
  float fogF = 1.0 - exp(-pow(max(fogDist * uFogDensity * (0.74 + 0.34 * hAtten), 0.0001), 1.85));
  gl_FragColor.rgb = clamp(mix(gl_FragColor.rgb, aerial, clamp(fogF * 0.94, 0.0, 0.95)), vec3(0.0), vec3(6.0));
}
`;

// Painterly Ghibli/Moebius cel material with colored shadows, brushwork, rim light,
// optional Moebius cross-hatching, optional dusk window glow, and aerial perspective fog.
export function toonMat(opts = {}) {
  const {
    duskGlow = 0,
    alwaysGlow = 0,
    brushScale = 1.0,
    noHatch = false,
    sway = 0,
    dapple = 0,
    ...matOpts
  } = opts;

  const m = new THREE.MeshToonMaterial({ gradientMap: GRAD, ...matOpts });
  m.customProgramCacheKey = () => `toon_v3_${duskGlow}_${alwaysGlow}_${brushScale}_${noHatch ? 1 : 0}_${sway}_${dapple}`;

  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, THEME_U, {
      uDuskGlow: { value: duskGlow },
      uAlwaysGlow: { value: alwaysGlow },
      uBrushScale: { value: brushScale },
      uAllowHatch: { value: noHatch ? 0.0 : 1.0 },
      uSway: { value: sway },
      uDapple: { value: dapple },
    });

    s.vertexShader = /* glsl */`
      varying vec3 vWPos;
      varying vec3 vWNorm;
      uniform float uTime;
      uniform float uSway;
    ` + s.vertexShader
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        if (uSway > 0.001) {
          vec4 wp0 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp0 = instanceMatrix * wp0;
          #endif
          vec3 w0 = (modelMatrix * wp0).xyz;
          float gust = sin(uTime * 1.9 + w0.x * 0.09 + w0.z * 0.07) * 0.65 + sin(uTime * 3.4 + w0.x * 0.21) * 0.35;
          transformed.x += gust * uSway * max(0.0, position.y * 0.22);
          transformed.z += cos(uTime * 1.5 + w0.z * 0.11) * uSway * 0.55 * max(0.0, position.y * 0.22);
        }
      `)
      .replace('#include <project_vertex>', /* glsl */`
        #include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            wn = mat3(instanceMatrix) * wn;
          #endif
          vWPos = (modelMatrix * wp).xyz;
          vec3 wnWorld = mat3(modelMatrix) * wn;
          float wnLen = length(wnWorld);
          vWNorm = wnLen > 0.0001 ? wnWorld / wnLen : vec3(0.0, 1.0, 0.0);
        }
      `);

    s.fragmentShader = /* glsl */`
      varying vec3 vWPos;
      varying vec3 vWNorm;
      uniform vec3 uSunDir, uLitTint, uShadowTint, uShadowLift, uRimColor, uFogCool, uFogWarm;
      uniform float uRimStrength, uBrushStrength, uHatchStrength, uMoebiusMix, uNightGlow, uFogDensity;
      uniform float uDuskGlow, uAlwaysGlow, uBrushScale, uAllowHatch, uDapple;
      ${NOISE_GLSL}
    ` + s.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        {
          // Directional gouache brush variation in world space
          vec2 q = vec2(vWPos.x + vWPos.z * 0.62, vWPos.y * 0.58 + vWPos.z * 0.34) * uBrushScale;
          float br = vn(q * vec2(0.55, 2.2)) * 0.55 + vn(q * vec2(1.9, 5.1) + 17.3) * 0.30 + vn(q * 0.18 + 5.7) * 0.15;
          diffuseColor.rgb *= (1.0 - uBrushStrength * 0.5) + uBrushStrength * br;

          // Painterly dappled foliage canopy brush dabs (for silky soft non-jagged Moebius/Ghibli trees!)
          if (uDapple > 0.01) {
            float d1 = vn3(vWPos * 0.85);
            float d2 = vn3(vWPos * 2.1 + vec3(7.3, 11.1, 4.7));
            float dab = smoothstep(0.32, 0.72, d1 * 0.65 + d2 * 0.35);
            vec3 sunLeaf = diffuseColor.rgb * vec3(1.16, 1.15, 0.94);
            vec3 shadeLeaf = diffuseColor.rgb * vec3(0.76, 0.88, 0.96);
            diffuseColor.rgb = mix(shadeLeaf, sunLeaf, dab);
          }

          // Refined Moebius pastel palette harmonization (turquoise-sage foliage, luminous coral-sand architecture)
          if (uMoebiusMix > 0.01) {
            float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            vec3 pastel = mix(vec3(luma), diffuseColor.rgb, 0.86);
            float greenness = clamp(pastel.g - max(pastel.r, pastel.b), 0.0, 1.0);
            pastel = mix(pastel, pastel * vec3(0.82, 1.03, 1.22) + vec3(0.03, 0.07, 0.08), greenness * 1.55);
            pastel = mix(pastel, pastel * vec3(1.07, 1.01, 0.96) + vec3(0.04, 0.02, 0.01), 0.48);
            diffuseColor.rgb = mix(diffuseColor.rgb, clamp(pastel, 0.0, 1.0), uMoebiusMix);
          }
        }
      `)
      .replace('#include <opaque_fragment>', /* glsl */`
        {
          vec3 wn = length(vWNorm) > 0.0001 ? normalize(vWNorm) : vec3(0.0, 1.0, 0.0);
          float directLuma = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114));
          float baseLuma = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.045);
          // Brush-perturbed terminator combines geometric NdotL + real shadow map attenuation
          float bJitter = (vn(vWPos.xz * 0.35 + vWPos.y * 0.3) - 0.5) * 0.11;
          float lit = clamp(directLuma / (baseLuma * 0.58) + bJitter * 0.55, 0.0, 1.0);

          // Colored atmospheric shadow + warm ground bounce vs luminous sunlit tone
          float up = clamp(wn.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 bounce = mix(vec3(1.04, 0.96, 0.86), vec3(0.95, 1.02, 1.12), up);
          vec3 deepCol = diffuseColor.rgb * uShadowTint * bounce + uShadowLift * (0.14 + 0.08 * up);
          vec3 midCol  = mix(deepCol, diffuseColor.rgb * uLitTint, 0.58);
          vec3 litCol  = diffuseColor.rgb * uLitTint * 1.07;

          vec3 cel = mix(deepCol, midCol, smoothstep(0.06, 0.34, lit));
          cel = mix(cel, litCol, smoothstep(0.50, 0.84, lit));

          // Sun-aligned animation rim light (NaN-safe)
          vec3 vnSafe = length(normal) > 0.0001 ? normalize(normal) : vec3(0.0, 0.0, 1.0);
          vec3 vvSafe = length(vViewPosition) > 0.0001 ? normalize(vViewPosition) : vec3(0.0, 0.0, 1.0);
          float fresnel = clamp(1.0 - clamp(dot(vnSafe, vvSafe), 0.0, 1.0), 0.0, 1.0);
          float sunSide = 0.32 + 0.68 * clamp(dot(wn, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
          float rim = smoothstep(0.54, 0.92, fresnel) * (0.30 + 0.70 * lit) * sunSide;
          cel += uRimColor * rim * uRimStrength * (0.45 + 0.55 * diffuseColor.rgb);

          // Moebius Ligne Claire cross-hatching inside shadow regions
          if (uHatchStrength * uAllowHatch > 0.01) {
            float camDist = length(vWPos - cameraPosition);
            float hFade = (1.0 - smoothstep(45.0, 220.0, camDist)) * uHatchStrength * uAllowHatch;
            vec2 sc = gl_FragCoord.xy;
            float line1 = smoothstep(0.76, 0.94, sin((sc.x * 0.72 + sc.y * 0.72) * 1.15));
            float line2 = smoothstep(0.80, 0.96, sin((sc.x * 0.72 - sc.y * 0.72) * 1.15));
            float sh1 = (1.0 - smoothstep(0.18, 0.48, lit)) * line1 * 0.24;
            float sh2 = (1.0 - smoothstep(0.02, 0.20, lit)) * line2 * 0.20;
            cel = mix(cel, cel * vec3(0.32, 0.27, 0.42), (sh1 + sh2) * hFade);
          }

          // Glowing golden windows & lanterns in Golden Hour (or always-on lanterns)
          float glowAmt = max(uAlwaysGlow, uDuskGlow * uNightGlow);
          if (glowAmt > 0.01) {
            // Subtle per-window warm brightness variation based on world cell
            float cell = h31(floor(vWPos * 0.45));
            float winLit = uAlwaysGlow > 0.01 ? 1.0 : smoothstep(0.18, 0.45, cell);
            vec3 warmGlow = mix(vec3(1.85, 1.15, 0.48), vec3(2.35, 1.72, 0.82), cell);
            cel = mix(cel, warmGlow, glowAmt * winLit * 0.92);
          }

          outgoingLight = clamp(cel, vec3(0.0), vec3(6.0));
        }
        #include <opaque_fragment>
      `)
      .replace('#include <fog_fragment>', AERIAL_FOG_GLSL);
  };
  return m;
}

const cache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, toonMat({ color, ...opts }));
  return cache.get(key);
}

// Painterly Ghibli leaf-spray canopy texture (drawn procedurally on offscreen canvas)
let _leafTex = null;
export function getLeafSprayTexture() {
  if (_leafTex) return _leafTex;
  const sz = 256;
  const c = document.createElement('canvas');
  c.width = c.height = sz;
  const g = c.getContext('2d');
  g.clearRect(0, 0, sz, sz);
  let seed = 77123;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // Draw a lush botanical spray of painterly gouache leaves
  const drawLeaf = (x, y, ang, len, shade) => {
    const w = len * (0.42 + rand() * 0.22);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.beginPath();
    g.moveTo(-len * 0.5, 0);
    g.quadraticCurveTo(0, -w, len * 0.5, 0);
    g.quadraticCurveTo(0, w, -len * 0.5, 0);
    g.fill();
    g.restore();
  };
  // Inner dense leaf cluster + outer ragged silhouette sprays
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * Math.PI * 2 * 2 + rand() * 0.5;
    const d = 14 + Math.sqrt(rand()) * 86;
    const shade = Math.round(165 + rand() * 90);
    drawLeaf(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, a + (rand() - 0.5) * 1.4, 34 + rand() * 28, shade);
  }
  for (let i = 0; i < 16; i++) {
    drawLeaf(128 + (rand() - 0.5) * 64, 128 + (rand() - 0.5) * 64, rand() * Math.PI * 2, 38 + rand() * 22, Math.round(205 + rand() * 50));
  }
  _leafTex = new THREE.CanvasTexture(c);
  _leafTex.colorSpace = THREE.SRGBColorSpace;
  _leafTex.needsUpdate = true;
  return _leafTex;
}

// Soft, pillowy Moebius/Ghibli painterly tree canopy material (zero jagged alphaTest edges!)
export function foliageMat(opts = {}) {
  return toonMat({
    color: '#ffffff',
    dapple: 1.0,
    sway: 0.18,
    brushScale: 0.85,
    noHatch: true,
    ...opts,
  });
}
