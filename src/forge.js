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

const SMOKE = [[0.42, 0.4, 0.42], [0.55, 0.53, 0.55], [0.32, 0.3, 0.32]];
const SPARK = [[1, 0.95, 0.6], [1, 0.72, 0.25], [1, 0.48, 0.12]];
const _v = new THREE.Vector3();

export class Forge {
  constructor(scene, camera, lights, hooks) {
    this.scene = scene; this.camera = camera; this.lights = lights; this.hooks = hooks;
    this.furnaces = new Set();
    this.smoke = new Puffs(scene, 70);
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
    o.flue = new THREE.Vector3(o.x - 0.24 * c, o.y + 1.3, o.z + 0.24 * s);
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
      // smoke curling up from the chimney, sparks spat out of the mouth
      const c = SMOKE[Math.floor(Math.random() * 3)];
      this.smoke.emit(_v.copy(o.flue).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08)), new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.55 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15), c, 2.6 + Math.random(), 0.14, { alpha: 0.45, grow: 0.9 });
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
