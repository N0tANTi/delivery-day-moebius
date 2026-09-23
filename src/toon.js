import * as THREE from 'three';

// Three light steps: dark shadow, shadow, lit.
const steps = new Uint8Array([110, 110, 110, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
export const GRAD = new THREE.DataTexture(steps, 3, 1, THREE.RGBAFormat);
GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter;
GRAD.generateMipmaps = false;
GRAD.needsUpdate = true;

const RIM = { value: new THREE.Color('#fff0cc') };

export const NOISE_GLSL = /* glsl */`
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
`;

// Toon material with a painterly brush-stroke overlay and a warm rim light.
export function toonMat(opts = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: GRAD, ...opts });
  m.onBeforeCompile = (s) => {
    s.uniforms.uRim = RIM;
    s.vertexShader = 'varying vec3 vWPos;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWPos = (modelMatrix * wp).xyz;
      }`);
    s.fragmentShader = 'varying vec3 vWPos;\nuniform vec3 uRim;\n' + NOISE_GLSL + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vec2(vWPos.x + vWPos.z * 0.6, vWPos.y * 0.5 + vWPos.z * 0.3);
          float br = vn(q * vec2(0.8, 3.2)) * 0.6 + vn(q * vec2(2.1, 6.5) + 17.0) * 0.4;
          diffuseColor.rgb *= 0.92 + 0.16 * br;
        }`)
      .replace('#include <opaque_fragment>', `
        {
          float rim = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
          outgoingLight += uRim * smoothstep(0.6, 0.95, rim) * diffuseColor.rgb * 0.45;
        }
        #include <opaque_fragment>`);
  };
  return m;
}

const cache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, toonMat({ color, ...opts }));
  return cache.get(key);
}
