// Life on the lagoon surface: rings spreading out (drawn by the water shader
// from a small list of ripples, see water.js), square droplets thrown up by a
// splash, the wake of the player wading or swimming, and whatever falls in.
import * as THREE from 'three';
import { globals } from './shaders.js';

const DROPS = [[0.92, 0.98, 1], [0.78, 0.95, 0.96], [1, 1, 1], [0.62, 0.9, 0.9]];

export class WaterFX {
  constructor(scene, water, hooks) {
    this.hooks = hooks;
    this.rip = water.material.uniforms.uRip.value; // vec4: x, z, start time, strength
    this.next = 0;
    // droplets: square points under gravity, gone when they fall back in
    this.N = 140;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.075, vertexColors: true }));
    this.pts.frustumCulled = false;
    scene.add(this.pts);
    this.vel = new Float32Array(this.N * 3); this.life = new Float32Array(this.N); this.dn = 0;
    this.stepAcc = 0; this.idleT = 0; this.wasIn = false;
  }

  // a ring spreading from (x, z); strength ~0.2 (a step) .. 1.5 (a big fall)
  ripple(x, z, strength) {
    this.rip[this.next].set(x, z, globals.uTime.value, strength);
    this.next = (this.next + 1) % this.rip.length;
  }

  drop(x, y, z, vx, vy, vz) {
    const i = this.dn = (this.dn + 1) % this.N;
    const P = this.pts.geometry.attributes.position, C = this.pts.geometry.attributes.color;
    P.setXYZ(i, x, y, z);
    const c = DROPS[Math.floor(Math.random() * DROPS.length)];
    C.setXYZ(i, c[0], c[1], c[2]); C.needsUpdate = true;
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = 1.5;
  }

  // something hits the water at p (y ~ 0): a crown of droplets, rings, a sound
  splash(p, strength = 1) {
    const s = Math.max(0.2, Math.min(1.6, strength));
    this.ripple(p.x, p.z, s);
    if (s > 0.6) setTimeout(() => this.ripple(p.x, p.z, s * 0.6), 180); // a second ring
    const n = Math.round(6 + s * 22);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.12 * s, sp = (0.5 + Math.random()) * (0.6 + s * 0.9);
      this.drop(p.x + Math.cos(a) * r, 0.03, p.z + Math.sin(a) * r, Math.cos(a) * sp * 0.6, (1.2 + Math.random() * 2.2) * (0.5 + s * 0.6), Math.sin(a) * sp * 0.6);
    }
    this.hooks.sound?.(s > 0.7 ? 'splash' : 'plop');
  }

  // the player in the lagoon: rings and kicked-up drops at each stride, a
  // wake while swimming, small rings while standing still, a splash going in
  update(dt, player) {
    if (player?.world) {
      const pos = player.pos, inWater = player.swimming || player.wading > 0.06;
      const hs = Math.hypot(player.vel.x, player.vel.z);
      if (inWater && !this.wasIn && player.vel.y < -2.5) this.splash(new THREE.Vector3(pos.x, 0, pos.z), Math.min(1.5, -player.vel.y * 0.18));
      this.wasIn = inWater;
      if (inWater) {
        this.stepAcc += hs * dt;
        const stride = player.swimming ? 0.9 : 0.55;
        if (this.stepAcc > stride) {
          this.stepAcc = 0;
          const k = player.swimming ? 0.7 : 0.35 + player.wading * 0.5;
          const back = hs > 0.1 ? 0.25 / hs : 0;
          this.ripple(pos.x - player.vel.x * back, pos.z - player.vel.z * back, k);
          // drops kicked up in front of the legs
          for (let j = 0; j < (player.swimming ? 6 : 4 + Math.round(player.wading * 6)); j++) {
            const a = Math.random() * Math.PI * 2;
            this.drop(pos.x + player.vel.x * 0.08 + Math.cos(a) * 0.2, 0.05, pos.z + player.vel.z * 0.08 + Math.sin(a) * 0.2,
              player.vel.x * 0.35 + Math.cos(a) * 0.5, 1 + Math.random() * 1.4, player.vel.z * 0.35 + Math.sin(a) * 0.5);
          }
        }
        if (hs < 0.3 && (this.idleT -= dt) < 0) { this.idleT = 1.4; this.ripple(pos.x, pos.z, 0.2); } // standing still
      }
    }
    // droplets
    const P = this.pts.geometry.attributes.position;
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const v = this.vel;
      v[i * 3 + 1] -= 9.8 * dt;
      const y = P.getY(i) + v[i * 3 + 1] * dt;
      P.setXYZ(i, P.getX(i) + v[i * 3] * dt, y, P.getZ(i) + v[i * 3 + 2] * dt);
      if ((y < 0 && v[i * 3 + 1] < 0) || this.life[i] <= 0) { this.life[i] = 0; P.setY(i, -999); }
    }
    if (any) P.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.pts.geometry.attributes.position.array.fill(-999); this.pts.geometry.attributes.position.needsUpdate = true; for (const r of this.rip) r.set(0, 0, -100, 0); }
}
