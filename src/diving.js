// Under the surface: what it feels like to dive. When the eyes go under, the
// world turns turquoise and closes in (fog of water, bluer with depth and
// darker at night), shafts of sunlight slant down from the surface and sway,
// specks of plankton drift past, bubbles escape from your mouth and wobble up
// to burst at the surface, sounds go muffled. Your breath lasts AIR seconds
// (a row of bubbles over the bar, block-game style); out of air, you are
// carried back up to breathe, nothing worse.
import * as THREE from 'three';
import { globals } from './shaders.js';

export const AIR = 40; // seconds of breath
const WATER_FOG = new THREE.Color(0.1, 0.52, 0.6);
const DEEP_FOG = new THREE.Color(0.03, 0.22, 0.4);
const NIGHT_FOG = new THREE.Color(0.01, 0.05, 0.1);

// square points with their own size and alpha (bubbles, plankton)
class Specks {
  constructor(scene, n, blending = THREE.NormalBlending) {
    this.N = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 color; attribute float aAlpha, aSize; uniform float uScale; varying vec4 vC;
        void main() { vC = vec4(color, aAlpha); vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 14.0); gl_Position = projectionMatrix * mv; }`,
      // a bubble is a ring with a bright spot; plankton a plain square
      fragmentShader: `varying vec4 vC; void main() { if (vC.a < 0.01) discard; gl_FragColor = vC; }`,
    }));
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 6;
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.ph = new Float32Array(n).map(() => Math.random() * 6.3); this.next = 0;
    scene.add(this.pts);
  }
  get G() { return this.pts.geometry.attributes; }
}

export class Diving {
  constructor(scene, camera, hooks) {
    this.scene = scene; this.camera = camera; this.hooks = hooks;
    this.air = 1; this.under = false; this.depth = 0;
    this.bubbles = new Specks(scene, 90);
    this.plankton = new Specks(scene, 220);
    { // plankton fills a box around the camera; each speck wraps around it
      const G = this.plankton.G;
      for (let i = 0; i < this.plankton.N; i++) {
        G.position.setXYZ(i, (Math.random() - 0.5) * 24, -Math.random() * 10, (Math.random() - 0.5) * 24);
        const w = 0.75 + Math.random() * 0.25;
        G.color.setXYZ(i, 0.75 * w, 0.95 * w, 0.9 * w);
        G.aSize.setX(i, 0.025 + Math.random() * 0.03);
        G.aAlpha.setX(i, 0);
      }
    }
    this.breathAt = 2;
    this.makeShafts();
    this.hud = document.querySelector('#air');
    this.overlay = document.querySelector('#underwater');
  }

  // sunbeams: tall slanted quads from the surface down, banded pixel stripes,
  // swaying, faded towards their foot and at night
  makeShafts() {
    this.shaftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: globals.uTime, uK: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vPh; varying float vNear; attribute float aPh;
        void main() {
          vUv = uv; vPh = aPh;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vNear = smoothstep(2.5, 7.0, distance(w.xz, cameraPosition.xz)); // a beam you swim through melts away
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `uniform float uTime, uK; varying vec2 vUv; varying float vPh; varying float vNear;
        void main() {
          float x = floor(vUv.x * 12.0) / 12.0;
          float s = step(0.45, fract(x * 2.3 + sin(uTime * 0.4 + vPh) * 0.4)) * 0.6 + 0.4;
          float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float a = uK * vNear * s * edge * pow(vUv.y, 1.6) * (0.55 + 0.45 * sin(uTime * 0.7 + vPh));
          a = floor(a * 6.0) / 6.0; // in steps, like the flames
          gl_FragColor = vec4(vec3(0.75, 0.97, 1.0) * a * 0.32, 1.0);
        }`,
    });
    const g = new THREE.PlaneGeometry(1.6, 14, 1, 1);
    g.translate(0, -7, 0); // hangs down from the surface
    const ph = new Float32Array(14).map(() => Math.random() * 6.3);
    g.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
    this.shafts = new THREE.InstancedMesh(g, this.shaftMat, 14);
    this.shafts.frustumCulled = false; this.shafts.renderOrder = 7; this.shafts.visible = false;
    this.shaftPos = Array.from({ length: 14 }, () => ({ x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30, w: 0.6 + Math.random() * 1.4 }));
    this.scene.add(this.shafts);
  }
  setScale(px) { this.bubbles.pts.material.uniforms.uScale.value = px; this.plankton.pts.material.uniforms.uScale.value = px; }

  // a few bubbles from a point (the swimmer's mouth, a clam shutting)
  puff(p, n = 5, size = 0.05) {
    const B = this.bubbles, G = B.G;
    for (let k = 0; k < n; k++) {
      const i = B.next = (B.next + 1) % B.N;
      G.position.setXYZ(i, p.x + (Math.random() - 0.5) * 0.12, p.y + (Math.random() - 0.5) * 0.1, p.z + (Math.random() - 0.5) * 0.12);
      G.color.setXYZ(i, 0.85, 0.98, 1);
      G.aSize.setX(i, size * (0.5 + Math.random()));
      G.aAlpha.setX(i, 0.85);
      B.vel.set([(Math.random() - 0.5) * 0.2, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.2], i * 3);
      B.life[i] = 8;
    }
    G.color.needsUpdate = true;
  }

  update(dt, player) {
    const cam = this.camera.position, t = globals.uTime.value;
    const under = cam.y < globals.uWaterLevel.value - 0.03;
    this.depth = Math.max(0, -cam.y);
    if (under !== this.under) {
      this.under = under;
      document.body.classList.toggle('underwater', under);
      this.hooks.under?.(under);
      if (under) { this.hooks.sound?.('dive'); const f = new THREE.Vector3(); this.camera.getWorldDirection(f); this.puff(cam.clone().addScaledVector(f, 1).add(new THREE.Vector3(0, -0.3, 0)), 14, 0.07); }
      else this.hooks.sound?.(this.air < 0.35 ? 'gasp' : 'surface');
    }
    // breath
    if (under) this.air = Math.max(0, this.air - dt / AIR);
    else this.air = Math.min(1, this.air + dt / 3);
    if (under && this.air <= 0 && !player.outOfAir) { player.outOfAir = true; this.hooks.outOfAir?.(); }
    if (!under && player.outOfAir) player.outOfAir = false;
    this.renderAir(under);
    // breathing out now and then (more often when out of breath), a stream when swimming hard
    if (under) {
      this.breathAt -= dt;
      if (this.breathAt <= 0) {
        this.breathAt = this.air < 0.25 ? 0.6 + Math.random() * 0.5 : 2.2 + Math.random() * 1.8;
        const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
        this.puff(cam.clone().addScaledVector(f, 0.7).add(new THREE.Vector3(0, -0.3, 0)), 4 + Math.floor(Math.random() * 4)); // out of the mouth, rising past the eyes
        this.hooks.sound?.('bubble');
      }
    }
    // bubbles wobble up and burst at the surface
    { const B = this.bubbles, G = B.G; let any = false;
      for (let i = 0; i < B.N; i++) {
        if (B.life[i] <= 0) continue;
        any = true; B.life[i] -= dt;
        const y = G.position.getY(i) + B.vel[i * 3 + 1] * dt;
        G.position.setXYZ(i, G.position.getX(i) + (B.vel[i * 3] + Math.sin(t * 7 + B.ph[i]) * 0.12) * dt, y, G.position.getZ(i) + (B.vel[i * 3 + 2] + Math.cos(t * 6 + B.ph[i]) * 0.12) * dt);
        B.vel[i * 3 + 1] = Math.min(1.4, B.vel[i * 3 + 1] + dt * 0.5);
        if (y > -0.02 || B.life[i] <= 0) { B.life[i] = 0; G.aAlpha.setX(i, 0); G.position.setY(i, -999); if (y > -0.02) this.hooks.pop?.(G.position.getX(i), G.position.getZ(i)); }
      }
      if (any) { G.position.needsUpdate = true; G.aAlpha.needsUpdate = true; G.aSize.needsUpdate = true; } }
    // plankton around the diver, only seen under water
    { const P = this.plankton, G = P.G, k = under ? 1 : 0;
      if (under || this.planktonOn) {
        this.planktonOn = under;
        for (let i = 0; i < P.N; i++) {
          let x = G.position.getX(i) + Math.sin(t * 0.3 + P.ph[i]) * 0.05 * dt, y = G.position.getY(i) + 0.04 * dt, z = G.position.getZ(i) + Math.cos(t * 0.25 + P.ph[i]) * 0.05 * dt;
          if (x - cam.x > 12) x -= 24; else if (x - cam.x < -12) x += 24;
          if (z - cam.z > 12) z -= 24; else if (z - cam.z < -12) z += 24;
          if (y - cam.y > 5) y -= 10; else if (y - cam.y < -5) y += 10;
          G.position.setXYZ(i, x, Math.min(-0.05, y), z);
          const tw = 0.35 + 0.35 * Math.sin(t * 2 + P.ph[i] * 5);
          G.aAlpha.setX(i, k * tw * (1 - globals.uNight.value * 0.6));
        }
        G.position.needsUpdate = true; G.aAlpha.needsUpdate = true;
      }
    }
    // sun shafts: strong in the day, gone at night, fading as you go deep
    const day = 1 - globals.uNight.value, k = under ? day * (1 - globals.uRain.value * 0.6) * (1 - Math.min(1, this.depth / 16)) : 0;
    this.shafts.visible = k > 0.01;
    if (this.shafts.visible) {
      this.shaftMat.uniforms.uK.value = k;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
      const sun = globals.uSunDir.value, tilt = Math.min(0.5, Math.atan2(Math.hypot(sun.x, sun.z), Math.max(0.2, sun.y)) * 0.6);
      const az = Math.atan2(sun.x, sun.z);
      this.shaftPos.forEach((p, i) => {
        if (p.x - cam.x > 15) p.x -= 30; else if (p.x - cam.x < -15) p.x += 30;
        if (p.z - cam.z > 15) p.z -= 30; else if (p.z - cam.z < -15) p.z += 30;
        // turn the beam to face the camera around its own slant
        const yaw = Math.atan2(cam.x - p.x, cam.z - p.z);
        e.set(Math.sin(yaw - az) * 0 + tilt * Math.cos(yaw - az), yaw, -tilt * Math.sin(yaw - az), 'YXZ');
        q.setFromEuler(e);
        m.compose(s.set(p.x + Math.sin(t * 0.2 + i) * 0.4, 0, p.z), q, new THREE.Vector3(p.w, 1, 1));
        this.shafts.setMatrixAt(i, m);
      });
      this.shafts.instanceMatrix.needsUpdate = true;
    }
  }

  // after the day cycle: under water, the fog is the water itself
  applyFog() {
    if (!this.under) return;
    const night = globals.uNight.value, d = Math.min(1, this.depth / 12);
    const c = WATER_FOG.clone().lerp(DEEP_FOG, d).lerp(NIGHT_FOG, night * 0.85);
    c.multiplyScalar(1 - globals.uRain.value * 0.25);
    globals.uFogColor.value.copy(c);
    globals.uFogDensity.value = 0.05 + d * 0.035 + night * 0.02;
  }

  renderAir(under) {
    const show = under || this.air < 0.999;
    this.hud.classList.toggle('hidden', !show);
    if (!show) return;
    const n = Math.ceil(this.air * 10 - 1e-6);
    if (n === this.shown) return;
    this.shown = n;
    this.hud.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? '' : 'pop'}"></i>`).join('');
  }
}
