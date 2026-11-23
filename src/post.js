import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { STYLES } from './styles.js';

// Renders colour + a normals/depth pass, then draws distance-adaptive tinted ink outlines.
class InkPass extends Pass {
  constructor(scene, camera, hide) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.hide = hide;
    const rt = () => {
      const t = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      t.depthTexture = new THREE.DepthTexture(1, 1);
      t.depthTexture.type = THREE.FloatType;
      return t;
    };
    this.rtColor = rt();
    this.rtNormal = rt();
    this.normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    const st = STYLES.moebius;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rtColor.texture },
        tDepthC: { value: this.rtColor.depthTexture },
        tNormal: { value: this.rtNormal.texture },
        tDepthN: { value: this.rtNormal.depthTexture },
        res: { value: new THREE.Vector2(1, 1) },
        near: { value: camera.near },
        far: { value: camera.far },
        uInkColor: { value: st.inkColor.clone() },
        uInkStrength: { value: st.inkStrength },
        uInkFar: { value: st.inkFar },
        uDepthThresh: { value: st.inkThreshold },
        uNormThresh: { value: st.inkNormalThresh },
        uThickness: { value: st.inkThickness },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tColor, tDepthC, tNormal, tDepthN;
        uniform vec2 res;
        uniform float near, far, uInkStrength, uInkFar, uDepthThresh, uNormThresh, uThickness;
        uniform vec3 uInkColor;
        varying vec2 vUv;

        float lin(float d) { return near * far / max(far - d * (far - near), 0.0001); }

        vec3 sanitize(vec3 c, vec2 uv, vec2 px) {
          // Guard UnrealBloomPass against ANY NaN/Inf/negative HalfFloat pixel (prevents black bloom blocks!)
          if (!(c.r >= 0.0 && c.r < 64.0 && c.g >= 0.0 && c.g < 64.0 && c.b >= 0.0 && c.b < 64.0)) {
            vec3 nb = texture2D(tColor, uv + vec2(px.x * 2.0, px.y * 2.0)).rgb;
            if (nb.r >= 0.0 && nb.r < 64.0 && nb.g >= 0.0 && nb.g < 64.0 && nb.b >= 0.0 && nb.b < 64.0) c = nb;
            else c = vec3(0.85, 0.90, 0.92);
          }
          return clamp(c, vec3(0.0), vec3(6.0));
        }

        void main() {
          vec2 px0 = 1.0 / max(res, vec2(1.0));
          vec4 col = texture2D(tColor, vUv);
          col.rgb = sanitize(col.rgb, vUv, px0);
          float rawN = texture2D(tDepthN, vUv).r;
          if (rawN >= 0.9999) { gl_FragColor = vec4(col.rgb, 1.0); return; }

          float dc = lin(rawN);
          float rawC = texture2D(tDepthC, vUv).r;
          float dColor = lin(rawC);
          // Skip inking if translucent cloud, foliage canopy, or particle sits in front
          if (dColor < dc - 0.35) { gl_FragColor = vec4(col.rgb, 1.0); return; }

          // Hero foreground (witch/broom/cat within ~16m) stays crisp; far city fades gracefully
          float heroBoost = 1.0 - smoothstep(10.0, 22.0, dc);
          float fade = 1.0 - smoothstep(45.0, uInkFar, dc);

          vec2 px = (res.y / 1080.0) * mix(0.68, 1.15, fade) * uThickness / res;
          float dl = lin(texture2D(tDepthN, vUv - vec2(px.x, 0.0)).r);
          float dr = lin(texture2D(tDepthN, vUv + vec2(px.x, 0.0)).r);
          float dd = lin(texture2D(tDepthN, vUv - vec2(0.0, px.y)).r);
          float du = lin(texture2D(tDepthN, vUv + vec2(0.0, px.y)).r);
          float lap = (abs(dl + dr - 2.0 * dc) + abs(du + dd - 2.0 * dc)) / max(dc, 0.5);

          vec3 nc = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
          float ne = 0.0;
          ne += 1.0 - dot(nc, texture2D(tNormal, vUv - vec2(px.x, 0.0)).rgb * 2.0 - 1.0);
          ne += 1.0 - dot(nc, texture2D(tNormal, vUv + vec2(px.x, 0.0)).rgb * 2.0 - 1.0);
          ne += 1.0 - dot(nc, texture2D(tNormal, vUv - vec2(0.0, px.y)).rgb * 2.0 - 1.0);
          ne += 1.0 - dot(nc, texture2D(tNormal, vUv + vec2(0.0, px.y)).rgb * 2.0 - 1.0);

          float dEdge = smoothstep(uDepthThresh, uDepthThresh * 2.4, lap);
          float nEdge = smoothstep(uNormThresh, uNormThresh + 0.36, ne);
          float edge = max(dEdge, nEdge * mix(0.62, 0.92, heroBoost));

          float strength = mix(uInkStrength * fade, max(uInkStrength, 0.72), heroBoost);
          edge *= strength;

          // Tinted painterly ink: blends dark pigment with multiplied surface color
          vec3 inkCol = mix(col.rgb * 0.36, uInkColor, 0.48);
          col.rgb = mix(col.rgb, inkCol, clamp(edge, 0.0, 0.92));
          gl_FragColor = vec4(sanitize(col.rgb, vUv, px0), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    }));
  }

  setSize(w, h) {
    this.rtColor.setSize(w, h);
    this.rtNormal.setSize(w, h);
    this.quad.material.uniforms.res.value.set(w, h);
  }

  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rtColor);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    const cc = renderer.getClearColor(new THREE.Color());
    const ca = renderer.getClearAlpha();
    for (const o of this.hide) o.visible = false;
    this.scene.overrideMaterial = this.normalMat;
    renderer.setClearColor(0x7f7fff, 1);
    renderer.setRenderTarget(this.rtNormal);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    for (const o of this.hide) o.visible = true;
    renderer.setClearColor(cc, ca);

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uWhite: { value: 0 },
    uSat: { value: STYLES.moebius.gradeSat },
    uTint: { value: STYLES.moebius.gradeTint.clone() },
    uLift: { value: STYLES.moebius.gradeLift },
    uVignette: { value: STYLES.moebius.vignette },
    uPaper: { value: STYLES.moebius.paperGrain },
    uRes: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uWhite, uSat, uLift, uVignette, uPaper;
    uniform vec3 uTint;
    uniform vec2 uRes;
    varying vec2 vUv;

    float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Soft ACES-like highlight rolloff so sunlit clouds & sunset bloom stay creamy
      c = c / (vec3(1.0) + max(c - 0.85, 0.0) * 0.28);

      // Vibrance / saturation & color tint
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c *= uTint;
      c = c * (1.0 - uLift) + uLift;

      // Fine watercolor/print paper grain (subtle in Ghibli, tactile in Moebius)
      if (uPaper > 0.001) {
        vec2 gp = vUv * uRes * 0.45;
        float g1 = vnoise(gp) - 0.5;
        float g2 = vnoise(gp * vec2(0.35, 1.6) + 19.0) - 0.5;
        float fiber = (g1 * 0.65 + g2 * 0.35) * uPaper;
        c += vec3(fiber * 1.05, fiber * 1.0, fiber * 0.9);
      }

      // Soft cinematic vignette
      vec2 q = vUv - 0.5;
      float vig = smoothstep(0.88, 0.28, length(q * vec2(1.0, 0.84)));
      c *= mix(1.0 - uVignette, 1.0, vig);

      // Silky cloud-mist whiteout when gliding through a cumulus puff
      c = mix(c, vec3(0.95, 0.96, 0.99), uWhite);

      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function buildPost(renderer, scene, camera, hide) {
  const composer = new EffectComposer(renderer);
  const ink = new InkPass(scene, camera, hide);
  composer.addPass(ink);

  const st = STYLES.moebius;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), st.bloomStrength, st.bloomRadius, st.bloomThreshold);
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);

  const applyStyle = (s) => {
    const iu = ink.quad.material.uniforms;
    iu.uInkColor.value.copy(s.inkColor);
    iu.uInkStrength.value = s.inkStrength;
    iu.uInkFar.value = s.inkFar;
    iu.uDepthThresh.value = s.inkThreshold;
    iu.uNormThresh.value = s.inkNormalThresh;
    iu.uThickness.value = s.inkThickness;

    bloom.strength = s.bloomStrength;
    bloom.radius = s.bloomRadius;
    bloom.threshold = s.bloomThreshold;

    const gu = grade.uniforms;
    gu.uSat.value = s.gradeSat;
    gu.uTint.value.copy(s.gradeTint);
    gu.uLift.value = s.gradeLift;
    gu.uVignette.value = s.vignette;
    gu.uPaper.value = s.paperGrain;
  };

  const resize = (w, h, pr) => {
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    grade.uniforms.uRes.value.set(w * pr, h * pr);
  };

  return { composer, grade, applyStyle, resize };
}
