// Furnace: block-game smelting. A placed furnace has three slots (o.items):
// 0 what goes in (ore, wood, a raw fish), 1 the fuel, 2 what comes out.
// While it has something to smelt and room for the result, it burns one fuel
// item at a time (FUEL: seconds of fire) and turns one item every SMELT_TIME
// seconds. The state (o.smelt = { burn, max, prog }) is saved with the
// furnace (placement.js) and runs whether its window is open or not. Lit, the
// coals glow and flames lick out of the mouth, it lights its surroundings,
// smoke rises from the chimney and sparks fly out of the mouth.
import * as THREE from 'three';
import { Puffs } from './cooking.js';
import { FURNACE } from './models.js';
import { itemDef } from './items.js';
import { globals } from './shaders.js';

export const SMELT_TIME = 8; // seconds per item
// seconds of fire each fuel gives (one smelt = SMELT_TIME)
export const FUEL = { charcoal: 64, 'wood:tree': 16, 'wood:palm': 12, coconut: 8, fibre: 4 };
const ORE_OUT = { 'ore:copper': 'ingot:copper', 'ore:iron': 'ingot:iron', 'ore:gold': 'ingot:gold', 'wood:palm': 'charcoal', 'wood:tree': 'charcoal' };
// what an item becomes in the furnace (null: it does not go in)
export function smeltResult(id) {
  if (!id) return null;
  if (ORE_OUT[id]) return ORE_OUT[id];
  if (id === 'crab' || id === 'turtle') return 'grill:' + id;
  if (id.startsWith('fish:')) return 'grill:' + id.slice(5);
  return null;
}
export const isFuel = (id) => !!FUEL[id];
// which slot of the furnace an item may be put in (output: never by hand)
export const furnaceAccepts = (k, id) => (k === 0 ? !!smeltResult(id) : k === 1 ? isFuel(id) : false);

const SPARK = [[1, 0.95, 0.6], [1, 0.72, 0.25], [1, 0.48, 0.12]];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();

// Chimney smoke in pixel art: each puff is a lumpy round blob drawn on an
// 8 x 8 grid of big pixels, lit in flat bands (top left bright, bottom right
// in shadow), its colour stepping through a ramp as it rises (warm soot
// grey at the chimney, pale blue-grey high up), and it dissolves by losing
// whole pixels (a dither), never by a soft fade. The plume swells, slows
// and leans with the wind as it climbs.
const SMOKE_RAMP = ['#3a302c', '#5a504c', '#80797a', '#a8a6ac', '#cfd2da', '#e8ecf2'].map((h) => new THREE.Color().setStyle(h, THREE.NoColorSpace));
export const WIND = new THREE.Vector3(0.32, 0, 0.16);
class Plume {
  constructor(scene, n) {
    this.N = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 }, uRamp: { value: SMOKE_RAMP }, uDark: globals.uNight },
      vertexShader: /* glsl */`
        attribute float aSize, aAge, aSeed; uniform float uScale; varying float vAge, vSeed;
        void main() { vAge = aAge; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aAge >= 1.0 ? 0.0 : aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uRamp[6]; uniform float uDark; varying float vAge, vSeed;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 43.1) * 43758.5453); }
        void main() {
          vec2 cell = floor(gl_PointCoord * 8.0);
          vec2 q = (cell + 0.5) / 8.0 - 0.5; q.y = -q.y; // +y up
          float a = atan(q.y, q.x);
          float r = 0.4 + 0.05 * sin(a * 3.0 + vSeed * 6.283) + 0.035 * sin(a * 5.0 + vSeed * 19.0);
          float d = length(q);
          if (d > r) discard;
          // dissolve: whole pixels drop out, the rim first
          float keep = 1.0 - smoothstep(0.55, 1.0, vAge) * 1.15 - (d / r) * smoothstep(0.35, 1.0, vAge) * 0.5;
          if (hash(cell) > keep) discard;
          // colour along the climb, in steps
          float k = clamp(vAge * 4.8 + 1.0, 0.0, 5.0);
          int i = int(k);
          vec3 base = uRamp[0];
          for (int j = 1; j < 6; j++) if (j <= i) base = uRamp[j];
          // flat light bands: lit top left, shadowed bottom right
          float l = dot(q / r, normalize(vec2(-0.6, 0.8)));
          vec3 col = base * (l > 0.35 ? 1.1 : l > -0.35 ? 0.94 : 0.8);
          col = mix(col, col * vec3(0.32, 0.36, 0.5), uDark * 0.85); // night: the smoke goes blue-dark
          gl_FragColor = vec4(col, vAge < 0.08 ? 0.75 : 0.92);
        }`,
    }));
    this.pts.frustumCulled = false;
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.next = 0;
    scene.add(this.pts);
  }
  emit(p, v, life, s0, s1) {
    const i = this.next = (this.next + 1) % this.N, G = this.pts.geometry.attributes;
    G.position.setXYZ(i, p.x, p.y, p.z); G.aSize.setX(i, s0); G.aAge.setX(i, 0); G.aSeed.setX(i, Math.random());
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1;
  }
  update(dt) {
    const G = this.pts.geometry.attributes, t = performance.now() / 1000;
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const k = i * 3, v = this.vel, age = 1 - Math.max(0, this.life[i] / this.max[i]);
      // out of the throat it shoots up, then the jet dies down to a slow
      // buoyant rise, the puff spreads sideways and the wind takes it more
      // and more as it climbs; a slow curl
      const damp = Math.exp(-dt * 1.8);
      v[k] *= damp; v[k + 2] *= damp; v[k + 1] = 0.28 + (v[k + 1] - 0.28) * damp;
      const w = Math.min(1, age * 1.8), curl = Math.sin(t * 0.8 + i * 1.7) * 0.06 * w;
      G.position.setXYZ(i, G.position.getX(i) + (v[k] + WIND.x * w + curl) * dt, G.position.getY(i) + v[k + 1] * dt, G.position.getZ(i) + (v[k + 2] + WIND.z * w - curl * 0.6) * dt);
      G.aAge.setX(i, this.life[i] <= 0 ? 1 : age);
      // swells fast right out of the chimney, then slowly
      G.aSize.setX(i, this.s0[i] + (this.s1[i] - this.s0[i]) * (0.4 * Math.min(1, age / 0.1) + 0.6 * Math.sqrt(age)));
    }
    if (any) { G.position.needsUpdate = true; G.aAge.needsUpdate = true; G.aSize.needsUpdate = true; }
  }
}

export class Forge {
  constructor(scene, camera, lights, hooks) {
    this.scene = scene; this.camera = camera; this.lights = lights; this.hooks = hooks;
    this.furnaces = new Set();
    this.smoke = new Plume(scene, 240);
    this.sparks = new Puffs(scene, 40, THREE.AdditiveBlending);
    this.acc = 0;
  }
  setScale(px) { this.smoke.pts.material.uniforms.uScale.value = px; this.sparks.pts.material.uniforms.uScale.value = px; }

  // a furnace placed or loaded: its fire parts, its light
  attach(o) {
    if (o.id !== 'furnace') return;
    o.smelt = { burn: 0, max: 0, prog: 0, ...(o.smelt || {}) };
    o.litParts = [];
    o.mesh.traverse((m) => { if (m.userData.lit) o.litParts.push(m); });
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw), M = FURNACE.MOUTH;
    o.mouth = new THREE.Vector3(o.x + M.x * c + M.z * s, o.y + M.y, o.z - M.x * s + M.z * c);
    const F = FURNACE.FLUE;
    o.flue = new THREE.Vector3(o.x + F.x * c + F.z * s, o.y + F.y, o.z - F.x * s + F.z * c);
    o.fireLight = this.lights.add({ x: o.mouth.x + 0.3 * c, y: o.mouth.y, z: o.mouth.z - 0.3 * s, radius: 7, r: 0.85, g: 0.42, b: 0.14, flicker: 1.6, off: true });
    this.furnaces.add(o);
    this.show(o);
  }
  detach(o) {
    if (!this.furnaces.has(o)) return;
    this.lights.remove(o.fireLight);
    this.furnaces.delete(o);
  }
  burning(o) { return o.smelt?.burn > 0; }
  show(o) {
    const on = this.burning(o);
    if (o.shownLit === on) return;
    o.shownLit = on;
    for (const m of o.litParts) m.visible = on;
    o.fireLight.off = !on;
  }

  // one furnace's fire and work over dt seconds; true when its slots changed
  step(o, dt) {
    const S = o.smelt, it = o.items;
    const inp = it[0], res = smeltResult(inp?.id), out = it[2];
    const room = res && (!out || (out.id === res && out.n < itemDef(res).max));
    let changed = false;
    if (S.burn <= 0 && room && it[1] && isFuel(it[1].id)) { // feed the fire
      S.burn = S.max = FUEL[it[1].id];
      if (--it[1].n <= 0) it[1] = null;
      changed = true;
      this.hooks.lit?.(o);
    }
    if (S.burn > 0) {
      S.burn = Math.max(0, S.burn - dt);
      if (room) {
        S.prog += dt;
        if (S.prog >= SMELT_TIME) {
          S.prog = 0;
          if (--inp.n <= 0) it[0] = null;
          if (out) out.n++; else it[2] = { id: res, n: 1 };
          changed = true;
          this.hooks.done?.(o, res);
        }
      } else S.prog = Math.max(0, S.prog - dt * 2);
    } else S.prog = Math.max(0, S.prog - dt * 2); // cools off: the half-melted ore sets again
    return changed;
  }

  update(dt) {
    this.acc += dt;
    const puff = this.acc > 0.12;
    if (puff) this.acc = 0;
    const cam = this.camera.position;
    for (const o of this.furnaces) {
      if (this.step(o, dt)) this.hooks.changed?.(o);
      this.show(o);
      if (!puff || !this.burning(o) || Math.hypot(o.x - cam.x, o.z - cam.z) > 40) continue;
      // smoke rolling out of the chimney in uneven breaths: born small inside
      // the throat (the stack hides it), it swells as it comes out; now and
      // then a spark rides up with it
      o.smokeT = (o.smokeT ?? 0) - 0.12;
      while (o.smokeT <= 0) {
        const breath = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 1.9 + o.x), a = Math.random() * Math.PI * 2, sp = 0.12 + Math.random() * 0.1;
        this.smoke.emit(_v.copy(o.flue).add(_w.set(Math.cos(a) * 0.025, -0.07, Math.sin(a) * 0.025)), _u.set(Math.cos(a) * sp, 0.85 + breath * 0.45 + Math.random() * 0.2, Math.sin(a) * sp), 4.5 + Math.random() * 1.8, 0.07 + breath * 0.03, 0.62 + breath * 0.3 + Math.random() * 0.3);
        o.smokeT += 0.05 + Math.random() * 0.05 + (1 - breath) * 0.05;
      }
      if (Math.random() < 0.06) this.sparks.emit(_v.copy(o.flue), _u.set((Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3), SPARK[Math.floor(Math.random() * 3)], 0.9, 0.03, { alpha: 1, grow: -0.6, gravity: 0.6 });
      if (Math.random() < 0.45) {
        const s = Math.sin(o.yaw), co = Math.cos(o.yaw), sp = 0.4 + Math.random() * 0.6;
        this.sparks.emit(_v.copy(o.mouth).add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3(co * sp + (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.8, -s * sp + (Math.random() - 0.5) * 0.3), SPARK[Math.floor(Math.random() * 3)], 0.5 + Math.random() * 0.4, 0.035, { alpha: 1, grow: -0.5, gravity: 1.2 });
      }
    }
    this.smoke.update(dt);
    this.sparks.update(dt);
  }

  // the closest burning furnace (for the roar of the fire)
  nearest() {
    let best = Infinity;
    for (const o of this.furnaces) if (this.burning(o)) best = Math.min(best, Math.hypot(o.x - this.camera.position.x, o.z - this.camera.position.z));
    return best;
  }
}
