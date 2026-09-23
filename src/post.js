import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Renders the scene, then a normals+depth pass, and inks the edges found in them.
class InkPass extends Pass {
  constructor(scene, camera, hide) {
    super();
    this.scene = scene; this.camera = camera; this.hide = hide;
    const rt = () => {
      const t = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      t.depthTexture = new THREE.DepthTexture(1, 1);
      t.depthTexture.type = THREE.FloatType;
      return t;
    };
    this.rtColor = rt(); this.rtNormal = rt();
    this.normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rtColor.texture }, tDepthC: { value: this.rtColor.depthTexture },
        tNormal: { value: this.rtNormal.texture }, tDepthN: { value: this.rtNormal.depthTexture },
        res: { value: new THREE.Vector2(1, 1) }, near: { value: camera.near }, far: { value: camera.far },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tColor, tDepthC, tNormal, tDepthN;
        uniform vec2 res; uniform float near, far;
        varying vec2 vUv;
        float lin(float d) { return near * far / (far - d * (far - near)); }
        void main() {
          vec4 col = texture2D(tColor, vUv);
          float rawN = texture2D(tDepthN, vUv).r;
          float dc = lin(rawN);
          float fade = 1.0 - smoothstep(120.0, 650.0, dc);
          vec2 o = (res.y / 1080.0) * mix(0.7, 1.25, fade) / res;
          float l = lin(texture2D(tDepthN, vUv - vec2(o.x, 0)).r), r = lin(texture2D(tDepthN, vUv + vec2(o.x, 0)).r);
          float d = lin(texture2D(tDepthN, vUv - vec2(0, o.y)).r), u = lin(texture2D(tDepthN, vUv + vec2(0, o.y)).r);
          float lap = (abs(l + r - 2.0 * dc) + abs(u + d - 2.0 * dc)) / dc;
          vec3 nc = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
          float ne = 0.0;
          ne += 1.0 - dot(nc, texture2D(tNormal, vUv - vec2(o.x, 0)).rgb * 2.0 - 1.0);
          ne += 1.0 - dot(nc, texture2D(tNormal, vUv + vec2(o.x, 0)).rgb * 2.0 - 1.0);
          ne += 1.0 - dot(nc, texture2D(tNormal, vUv - vec2(0, o.y)).rgb * 2.0 - 1.0);
          ne += 1.0 - dot(nc, texture2D(tNormal, vUv + vec2(0, o.y)).rgb * 2.0 - 1.0);
          float edge = max(smoothstep(0.03, 0.08, lap), smoothstep(0.45, 0.8, ne));
          edge *= mix(0.3, 0.9, fade);
          if (rawN >= 1.0) edge = 0.0;                                   // sky
          if (lin(texture2D(tDepthC, vUv).r) < dc - 0.5) edge = 0.0;     // cloud or smoke in front
          col.rgb = mix(col.rgb, col.rgb * vec3(0.26, 0.23, 0.3), edge);
          gl_FragColor = col;
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) {
    this.rtColor.setSize(w, h); this.rtNormal.setSize(w, h);
    this.quad.material.uniforms.res.value.set(w, h);
  }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rtColor);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
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
  uniforms: { tDiffuse: { value: null }, uWhite: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uWhite;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.07);
      c *= vec3(1.03, 1.0, 0.965);
      c = c * 0.97 + 0.012;
      vec2 q = vUv - 0.5;
      c *= mix(0.8, 1.0, smoothstep(0.85, 0.3, length(q * vec2(1.0, 0.85))));
      c = mix(c, vec3(0.93, 0.95, 0.98), uWhite);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function buildPost(renderer, scene, camera, hide) {
  const composer = new EffectComposer(renderer);
  const ink = new InkPass(scene, camera, hide);
  composer.addPass(ink);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.96);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  const resize = (w, h, pr) => {
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  };
  return { composer, grade, resize };
}
